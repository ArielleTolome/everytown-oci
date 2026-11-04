"""Run an eval suite against the real AI steps on Bedrock, score it, and optionally log it to Phoenix.

    python3 -m evals.run --suite reports|coach|staff_ask|all [--limit N] [--judges/--no-judges]
                         [--phoenix/--no-phoenix] [--model ID] [--compare ID] [--name NAME]

Always writes evals/results/<timestamp>-<suite>.json and .md (per-evaluator mean score, pass rate, worst case) and
prints the table. Exit code 1 when any gate check (checks.GATES) fails or errors, so it can block a release.
With Phoenix (OCI_PHOENIX_ENDPOINT + OCI_PHOENIX_API_KEY), the dataset is uploaded once per content hash and
the run is a Phoenix experiment named "<suite> <model> <git sha>" with every evaluator score attached.
"""
import argparse
import copy
import hashlib
import json
import os
import subprocess
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RESULTS = os.path.join(HERE, "results")
SUITES = ("reports", "coach", "staff_ask")
EVALS_PROJECT = "everytown-oci-evals"
# USD per million tokens (input, output, cache read, cache write). shortcut: list prices of the Claude 4.5
# generation as an estimate; update when Bedrock publishes prices for the model ids in use.
PRICES = {"sonnet": (3.0, 15.0, 0.30, 3.75), "haiku": (1.0, 5.0, 0.10, 1.25), "opus": (5.0, 25.0, 0.50, 6.25)}


def setup_env():
    """Must run before app, pipeline or observability are imported: they read these at import time."""
    os.environ["OCI_PHOENIX_PROJECT"] = EVALS_PROJECT  # eval traces never mix with production traces
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)
    try:
        import observability
        observability.setup()
    except ImportError:
        pass


class Meter:
    """Wraps the Bedrock runtime client to add up token usage per model, for the cost line in every summary."""

    def __init__(self, client):
        self.client, self.usage = client, defaultdict(Counter)

    def __getattr__(self, name):
        return getattr(self.client, name)

    def converse(self, **kw):
        resp = self.client.converse(**kw)
        self.usage[kw.get("modelId")].update({k: v for k, v in (resp.get("usage") or {}).items()
                                              if isinstance(v, int)})
        self.usage[kw.get("modelId")]["calls"] += 1
        return resp

    def cost(self):
        total = 0.0
        for model, u in self.usage.items():
            p = next((v for k, v in PRICES.items() if k in (model or "")), PRICES["sonnet"])
            total += (u["inputTokens"] * p[0] + u["outputTokens"] * p[1] + u["cacheReadInputTokens"] * p[2]
                      + u["cacheWriteInputTokens"] * p[3]) / 1e6
        return total

    def report(self):
        return {"by_model": {m: dict(u) for m, u in self.usage.items()}, "estimated_usd": round(self.cost(), 4)}


def install_meter():
    import pipeline
    client = pipeline._client("bedrock-runtime")
    meter = client if isinstance(client, Meter) else Meter(client)
    pipeline._clients["bedrock-runtime"] = meter
    return meter


def git_sha():
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True,
                              timeout=5).stdout.strip() or "nogit"
    except Exception:
        return "nogit"


def pick(rows, limit):
    """Up to `limit` examples, round-robin across each example's first tag, so a small run still covers every
    kind of case (samples, seeded and edge reports; crisis and score-change coach questions; rejections)."""
    if not limit or limit >= len(rows):
        return rows
    groups = defaultdict(list)
    for row in rows:
        groups[row["metadata"]["tags"][0]].append(row)
    queues = list(groups.values())
    out = []
    while len(out) < limit:
        for q in queues:
            if q and len(out) < limit:
                out.append(q.pop(0))
    return sorted(out, key=rows.index)


# ---------- tasks: the real AI steps ----------

def _bases():
    with open(os.path.join(HERE, "datasets", "coach_bases.json")) as f:
        return json.load(f)


def report_task(input):
    """Steps 2-4 of app.run_job on a dataset sub: library, write_report, plain_language. Research is skipped: the
    profile is part of the example, so runs are repeatable."""
    import pipeline
    sub = copy.deepcopy(input)
    sub.setdefault("progress", None)
    raw = {}  # the model's tool input before validation, for raw_drop_rate
    start = time.time()
    try:
        sub["report"] = pipeline.write_report(sub, pipeline.gather_library(sub), raw_out=raw)
        sub["report"] = pipeline.plain_language(sub)
    except Exception as exc:
        return {"error": "%s: %s" % (type(exc).__name__, exc), "raw": raw or None,
                "seconds": round(time.time() - start, 1)}
    return {"report": sub["report"], "raw": raw or None, "seconds": round(time.time() - start, 1)}


def coach_sub(input):
    sub = copy.deepcopy(_bases()[input["base"]])
    sub["language"] = input.get("language") or sub["language"]
    return sub


def coach_task(input):
    """Exactly the /ask route's decision (coach.respond): crisis pattern first, without the model."""
    from features import coach
    question = input["question"]
    called = not coach.CRISIS.search(question)
    try:
        return dict(coach.respond(coach_sub(input), question, []), model_called=called)
    except Exception as exc:
        return {"error": "%s: %s" % (type(exc).__name__, exc), "model_called": called}


_staff_client = None


def staff_task(input):
    """POST /api/staff/ask through Flask's test client as a signed-in staff user: router, analysis, answer check.
    Reads the live analytics data (synthetic seed organizations), so it needs the database credentials."""
    global _staff_client
    if _staff_client is None:
        import app
        _staff_client = app.app.test_client()
        _staff_client.post("/api/login", json={"username": "staff", "password": "staff"})
    resp = _staff_client.post("/api/staff/ask", json={"question": input["question"]})
    out = resp.get_json(silent=True) or {"error": resp.get_data(as_text=True)[:300]}
    out["status"] = resp.status_code
    return out


# ---------- evaluators ----------

def _error_results(names, output):
    return [{"name": n, "score": 0.0, "label": "error", "explanation": output["error"][:300]} for n in names]


def report_code_checks(input, output, expected):
    from evals import checks
    if output.get("error"):
        return _error_results(("grounded", "focus_matches_code", "catalog_links_only", "no_em_dash"), output)
    report = output["report"]
    return checks.report_checks(input, report, output.get("raw")) + \
        checks.expectations(" ".join(checks.report_texts(report)), expected)


def coach_code_checks(input, output, expected):
    from evals import checks
    if output.get("error"):
        gates = [g for g in ("crisis", "refuse_score_change") if expected.get("behavior") == g]
        return _error_results(["answered"] + gates, output)
    return checks.coach_checks(input["question"], output, coach_sub(input), expected)


def staff_code_checks(input, output, expected):
    from evals import checks
    return checks.staff_ask_checks(input["question"], output, expected)


def judge_evaluator(name):
    from evals import judges

    def evaluate(input, output):
        if output.get("error"):
            return {"name": name, "score": None, "label": "error", "explanation": "No output to judge."}
        if name in judges.REPORT_JUDGES:
            return judges.judge(name, input, output["report"])
        if not output.get("model_called"):
            return []  # the fixed crisis answer is code, not model output: nothing to judge
        return judges.judge(name, coach_sub(input), output, input["question"])
    evaluate.__name__ = name
    return evaluate


TASKS = {"reports": report_task, "coach": coach_task, "staff_ask": staff_task}
CODE_CHECKS = {"reports": report_code_checks, "coach": coach_code_checks, "staff_ask": staff_code_checks}


def evaluators(suite, with_judges):
    from evals import judges
    out = {"code_checks": CODE_CHECKS[suite]}
    if with_judges:
        names = judges.REPORT_JUDGES if suite == "reports" else judges.COACH_JUDGES if suite == "coach" else ()
        out.update({n: judge_evaluator(n) for n in names})
    return out


def _as_list(result, default_name):
    if result is None:
        return []
    items = result if isinstance(result, list) else [result]
    return [dict(r, name=r.get("name") or default_name) for r in items]


def run_local(suite, rows, evals):
    out = []
    for n, row in enumerate(rows, 1):
        print("[%d/%d] %s" % (n, len(rows), row["id"]), flush=True)
        output = TASKS[suite](row["input"])
        results = []
        for name, fn in evals.items():
            kw = {"input": row["input"], "output": output, "expected": row["expected"]}
            args = fn.__code__.co_varnames[:fn.__code__.co_argcount]
            results += _as_list(fn(**{k: v for k, v in kw.items() if k in args}), name)
        out.append({"id": row["id"], "metadata": row["metadata"], "output": output, "evals": results})
    return out


# ---------- Phoenix ----------

def phoenix_client():
    from phoenix.client import Client
    return Client(base_url=os.environ["OCI_PHOENIX_ENDPOINT"], api_key=os.environ.get("OCI_PHOENIX_API_KEY"))


def dataset_name(suite, rows):
    digest = hashlib.sha256("\n".join(json.dumps(r, sort_keys=True) for r in rows).encode()).hexdigest()[:8]
    return "oci-%s-%s" % (suite, digest)


def upload(client, suite, rows):
    """The dataset named by suite and content hash: reused when it exists, so experiments on the same data compare;
    a changed dataset gets a new name instead of silently mixing versions."""
    name = dataset_name(suite, rows)
    try:
        return client.datasets.get_dataset(dataset=name)
    except Exception:
        pass
    return client.datasets.create_dataset(
        name=name, dataset_description="Everytown OCI %s eval set (evals/datasets/%s.jsonl), synthetic only."
        % (suite, suite), inputs=[r["input"] for r in rows], outputs=[r["expected"] for r in rows],
        metadata=[dict(r["metadata"], eval_id=r["id"]) for r in rows])


def run_phoenix(client, suite, rows, chosen, evals, experiment_name, metadata):
    from phoenix.client.experiments import create_evaluator
    from phoenix.client.resources.datasets import Dataset

    full = upload(client, suite, rows)
    want = {r["id"] for r in chosen}
    examples = [e for e in full.examples if (e.get("metadata") or {}).get("eval_id") in want]
    dataset = Dataset(full._dataset_info, dict(full._examples_data, examples=examples))  # the --limit subset
    wrapped = {name: create_evaluator(kind="CODE" if name == "code_checks" else "LLM", name=name)(fn)
               for name, fn in evals.items()}
    ran = client.experiments.run_experiment(
        dataset=dataset, task=TASKS[suite], evaluators=wrapped, experiment_name=experiment_name,
        experiment_metadata=metadata, timeout=900, retries=0, print_summary=False)
    by_example = {e["id"]: e for e in examples}
    by_run = {}
    for run in ran["task_runs"]:
        example = by_example[run["dataset_example_id"]]
        by_run[run["id"]] = {"id": example["metadata"]["eval_id"],
                             "metadata": {k: v for k, v in example["metadata"].items() if k != "eval_id"},
                             "output": run.get("output") or {"error": run.get("error") or "no output"}, "evals": []}
    for ev in ran["evaluation_runs"]:
        row = by_run.get(ev.experiment_run_id)
        if row is not None:
            res = ev.result if isinstance(ev.result, dict) else {}
            row["evals"].append({"name": ev.name, "score": res.get("score"), "label": res.get("label") or (
                "error" if ev.error else None), "explanation": res.get("explanation") or ev.error})
    url = client.experiments.get_experiment_url(dataset_id=full.id, experiment_id=ran["experiment_id"])
    return sorted(by_run.values(), key=lambda r: [c["id"] for c in chosen].index(r["id"])), url


# ---------- summary ----------

def summarize(results):
    """Per evaluator: count, mean score, pass rate, errors and the worst case."""
    from evals.checks import GATES
    by_name = defaultdict(list)
    for row in results:
        for ev in row["evals"]:
            by_name[ev["name"]].append((row["id"], ev))
    table, gate_failures = [], []
    for name in sorted(by_name, key=lambda n: (n not in GATES, n)):
        evs = by_name[name]
        scores = [e["score"] for _, e in evs if isinstance(e.get("score"), (int, float))]
        labeled = [e for _, e in evs if e.get("label") not in (None, "error")]
        errors = sum(1 for _, e in evs if e.get("label") == "error")
        worst = min(((i, e) for i, e in evs if isinstance(e.get("score"), (int, float))),
                    key=lambda x: x[1]["score"], default=None)
        table.append({"evaluator": name, "gate": name in GATES, "n": len(evs),
                      "mean": round(sum(scores) / len(scores), 3) if scores else None,
                      "pass_rate": round(sum(e["label"] == "pass" for e in labeled) / len(labeled), 3)
                      if labeled else None, "errors": errors,
                      "worst": {"id": worst[0], "score": worst[1]["score"],
                                "explanation": (worst[1].get("explanation") or "")[:160]} if worst else None})
        if name in GATES:
            gate_failures += ["%s: %s" % (i, name) for i, e in evs if e.get("label") in ("fail", "error")]
    return table, gate_failures


def markdown(title, table, gate_failures, extra):
    lines = ["## %s" % title, "", "| Evaluator | Gate | n | Mean score | Pass rate | Errors | Worst case |",
             "|---|---|---|---|---|---|---|"]
    for t in table:
        w = t["worst"]
        lines.append("| %s | %s | %d | %s | %s | %d | %s |" % (
            t["evaluator"], "yes" if t["gate"] else "", t["n"], "" if t["mean"] is None else "%.2f" % t["mean"],
            "" if t["pass_rate"] is None else "%d%%" % round(t["pass_rate"] * 100), t["errors"],
            "%s (%.2f): %s" % (w["id"], w["score"], w["explanation"].replace("|", "/")) if w and w["score"] < 1
            else ""))
    lines += ["", "Gate: %s" % ("PASS" if not gate_failures else "FAIL (%s)" % "; ".join(gate_failures[:10]))]
    lines += ["%s: %s" % kv for kv in extra.items()]
    return "\n".join(lines)


def write_results(suite, data, md):
    os.makedirs(RESULTS, exist_ok=True)
    base = os.path.join(RESULTS, "%s-%s" % (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"), suite))
    with open(base + ".json", "w") as f:
        json.dump(data, f, ensure_ascii=False, indent=1, sort_keys=True, default=str)
    with open(base + ".md", "w") as f:
        f.write(md + "\n")
    return base


def run_suite(suite, args, model, meter):
    import pipeline
    from evals.build_datasets import load
    if suite == "reports":
        pipeline.MODEL_ID = model or pipeline.MODEL_ID
        model = pipeline.MODEL_ID
    else:
        pipeline.FAST_MODEL_ID = model or pipeline.FAST_MODEL_ID
        model = pipeline.FAST_MODEL_ID
    rows = load(suite)
    chosen = pick(rows, args.limit)
    evals = evaluators(suite, args.judges)
    sha = git_sha()
    name = "%s%s %s %s" % (args.name + " " if args.name else "", suite, model, sha)
    meta = {"suite": suite, "model": model, "git_sha": sha, "judges": args.judges, "limit": args.limit,
            "examples": len(chosen)}
    before = meter.cost()
    start = time.time()
    url = None
    if args.phoenix:
        results, url = run_phoenix(phoenix_client(), suite, rows, chosen, evals, name, meta)
    else:
        results = run_local(suite, chosen, evals)
    table, gate_failures = summarize(results)
    extra = {"Model": model, "Examples": len(chosen), "Minutes": round((time.time() - start) / 60, 1),
             "Estimated Bedrock cost (USD)": "%.2f" % (meter.cost() - before)}
    if url:
        extra["Phoenix experiment"] = url
    md = markdown(name, table, gate_failures, extra)
    for row in results:  # keep result files reviewable: raw model output is summarized, not stored twice
        raw = row["output"].pop("raw", None) if isinstance(row["output"], dict) else None
        if isinstance(raw, dict):
            row["output"]["raw_counts"] = {k: len(raw.get(k) or []) for k in ("focus", "plan")}
    path = write_results(suite, {"experiment": name, "meta": meta, "summary": table, "gate_failures": gate_failures,
                                 "usage": meter.report(), "phoenix_url": url, "results": results}, md)
    print("\n" + md + "\nWrote %s.json and .md\n" % os.path.relpath(path, ROOT), flush=True)
    return table, gate_failures


def parse_args(argv=None):
    p = argparse.ArgumentParser(prog="python3 -m evals.run", description=__doc__.split("\n\n")[0])
    p.add_argument("--suite", choices=SUITES + ("all",), default="all")
    p.add_argument("--limit", type=int, default=0, help="at most N examples per suite (0 = all)")
    p.add_argument("--judges", action=argparse.BooleanOptionalAction, default=True,
                   help="LLM judges (Claude Haiku); --no-judges for code checks only")
    p.add_argument("--phoenix", action=argparse.BooleanOptionalAction, default=None,
                   help="log datasets and experiments to Phoenix (default: on when OCI_PHOENIX_ENDPOINT is set)")
    p.add_argument("--model", help="model under test: the report writer for reports, the fast model otherwise")
    p.add_argument("--compare", metavar="MODEL", help="run the same suite again with this model, for A/B")
    p.add_argument("--name", default="", help="experiment name prefix")
    args = p.parse_args(argv)
    if args.phoenix is None:
        args.phoenix = bool(os.environ.get("OCI_PHOENIX_ENDPOINT"))
    if args.limit < 0:
        p.error("--limit must be 0 or more")
    return args


def main(argv=None):
    args = parse_args(argv)
    setup_env()
    meter = install_meter()
    failed = []
    suites = SUITES if args.suite == "all" else (args.suite,)
    for suite in suites:
        tables = {}
        for model in [args.model] + ([args.compare] if args.compare else []):
            table, gates = run_suite(suite, args, model, meter)
            tables[model or "default"] = table
            failed += gates
        if args.compare:
            (a, ta), (b, tb) = tables.items()
            means = {t["evaluator"]: t["mean"] for t in tb}
            print("| %s evaluator | %s | %s |\n|---|---|---|" % (suite, a, b))
            for t in ta:
                print("| %s | %s | %s |" % (t["evaluator"], t["mean"], means.get(t["evaluator"])))
    try:
        import observability
        observability.flush()
    except Exception:
        pass
    print("Total estimated Bedrock cost: $%.2f. Gate: %s" % (meter.cost(), "FAIL" if failed else "PASS"))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
