"""Aurora PostgreSQL store over the RDS Data API (HTTPS, so Lambda needs no VPC).

CLI: `python3 -m db migrate` applies schema.sql; `python3 -m db seed` loads synthetic organizations for analytics demos.
"""
import glob
import json
import os
import random
import re
import sys
import time
import uuid

import boto3
from botocore.exceptions import ClientError

ROOT = os.path.dirname(os.path.abspath(__file__))
CLUSTER = os.environ.get("OCI_DB_CLUSTER_ARN")
SECRET = os.environ.get("OCI_DB_SECRET_ARN")
NAME = os.environ.get("OCI_DB_NAME", "oci")
_rds = None


def _client():
    global _rds
    if _rds is None:
        if not (CLUSTER and SECRET):
            raise RuntimeError("Set OCI_DB_CLUSTER_ARN and OCI_DB_SECRET_ARN (outputs of the everytown-oci-db stack).")
        _rds = boto3.client("rds-data")
    return _rds


def _value(v):
    if v is None:
        return {"isNull": True}
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"longValue": v}
    if isinstance(v, float):
        return {"doubleValue": v}
    return {"stringValue": v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)}


def _params(params):
    out = []
    for k, v in (params or {}).items():
        p = {"name": k, "value": _value(v)}
        if isinstance(v, (dict, list)):
            p["typeHint"] = "JSON"
        elif k == "id" or k.endswith("_id") and isinstance(v, str) and re.fullmatch(r"[0-9a-f-]{36}", v):
            p["typeHint"] = "UUID"
        out.append(p)
    return out


def _call(fn, **kw):
    for attempt in range(8):  # an auto-paused cluster takes ~15 s to resume
        try:
            if "transactionId" not in kw or "sql" in kw:  # commit/rollback take no database argument
                kw.setdefault("database", NAME)
            return fn(resourceArn=CLUSTER, secretArn=SECRET, **kw)
        except ClientError as exc:
            if exc.response["Error"]["Code"] != "DatabaseResumingException" or attempt == 7:
                raise
            time.sleep(3)


def query(sql, tx=None, **params):
    """Run one statement; return rows as dicts."""
    kw = {"sql": sql, "parameters": _params(params), "formatRecordsAs": "JSON"}
    if tx:
        kw["transactionId"] = tx
    resp = _call(_client().execute_statement, **kw)
    return json.loads(resp.get("formattedRecords") or "[]")


def batch(sql, rows, tx):
    for i in range(0, len(rows), 500):
        _call(_client().batch_execute_statement, sql=sql, transactionId=tx,
              parameterSets=[_params(r) for r in rows[i:i + 500]])


def migrate():
    """Apply schema.sql, then each feature's features/*.sql, statement by statement (all idempotent)."""
    for path in [os.path.join(ROOT, "schema.sql")] + sorted(glob.glob(os.path.join(ROOT, "features", "*.sql"))):
        with open(path) as f:
            sql = re.sub(r"(?m)^--.*$", "", f.read())
        for stmt in (s.strip() for s in sql.split(";")):
            if stmt:
                query(stmt)


def name_key(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:80] or "org"


# ---------- assessments ----------

def get(sid):
    rows = query("SELECT doc::text AS doc FROM assessments WHERE id = :id", id=sid)
    return json.loads(rows[0]["doc"]) if rows else None


def latest_for(org_name, owner):
    """The previous assessment of this organization from the same sign-in session, if any."""
    if not owner:
        return None
    rows = query("SELECT a.doc::text AS doc FROM assessments a JOIN organizations o ON o.id = a.org_id "
                 "WHERE o.name_key = :key AND a.owner = :owner ORDER BY a.created_at DESC LIMIT 1",
                 key=name_key(org_name), owner=owner)
    return json.loads(rows[0]["doc"]) if rows else None


def recent_reports(hours=1):
    """AI reports requested recently (seed rows excluded): the spend guard for the public demo."""
    return query("SELECT count(*) AS n FROM assessments WHERE source <> 'seed' "
                 "AND created_at > now() - make_interval(hours => CAST(:h AS int))", h=hours)[0]["n"]


def owner_of(sid):
    rows = query("SELECT owner FROM assessments WHERE id = :id", id=sid)
    return rows[0]["owner"] if rows else None


def set_support(sub, domain_ids):
    """Replace this assessment's support request and mirror it into the document, atomically."""
    tx = _call(_client().begin_transaction)["transactionId"]
    try:
        query("DELETE FROM support_requests WHERE assessment_id = :id", tx=tx, id=sub["id"])
        batch("INSERT INTO support_requests (assessment_id, domain_id) VALUES (CAST(:a AS uuid), :d)",
              [{"a": sub["id"], "d": d} for d in domain_ids], tx)
        when = query("SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC' AS t", tx=tx)[0]["t"]
        sub["support"] = {"domain_ids": domain_ids, "requested_at": when}
        query("UPDATE assessments SET doc = :doc WHERE id = :id", tx=tx, doc=sub, id=sub["id"])
        _call(_client().commit_transaction, transactionId=tx)
    except Exception:
        try:
            _call(_client().rollback_transaction, transactionId=tx)
        except ClientError:
            pass  # the Data API already aborted it; keep the original error
        raise
    return sub["support"]


def update(sub):
    query("UPDATE assessments SET doc = :doc, status = :status WHERE id = :id",
          doc=sub, status=sub["status"], id=sub["id"])


def create(sub, source, created_at=None, owner=None):
    """Insert the organization (by name), the assessment document and its normalized scores, atomically."""
    tx = _call(_client().begin_transaction)["transactionId"]
    try:
        meta = sub.get("org_meta")  # optional start-page details; an assessment without them keeps the stored ones
        org = query("INSERT INTO organizations (id, name, name_key, website, program_models, staff_size, state) "
                    "VALUES (:id, :name, :key, :website, CAST(:models AS jsonb), :size, :state) "
                    "ON CONFLICT (name_key) DO UPDATE SET name = EXCLUDED.name, website = "
                    "CASE WHEN EXCLUDED.website = '' THEN organizations.website ELSE EXCLUDED.website END, "
                    "program_models = CASE WHEN :has_meta THEN EXCLUDED.program_models ELSE organizations.program_models END, "
                    "staff_size = CASE WHEN :has_meta THEN EXCLUDED.staff_size ELSE organizations.staff_size END, "
                    "state = CASE WHEN :has_meta THEN EXCLUDED.state ELSE organizations.state END "
                    "RETURNING id::text AS id", tx=tx, id=str(uuid.uuid4()), name=sub["org_name"],
                    key=name_key(sub["org_name"]), website=sub["org_url"],
                    models=json.dumps((meta or {}).get("program_models") or []), size=(meta or {}).get("staff_size"),
                    state=(meta or {}).get("state"), has_meta=bool(meta))[0]["id"]
        query("INSERT INTO assessments (id, org_id, created_at, source, language, status, doc, owner) "
              "VALUES (:id, :org_id, COALESCE(CAST(:created_at AS timestamptz), now()), :source, :language, :status, "
              ":doc, :owner)",
              tx=tx, id=sub["id"], org_id=org, created_at=created_at, source=source, language=sub["language"],
              status=sub["status"], doc=sub, owner=owner)
        # Statement ids are the domain code plus a number (PL3, FR12).
        batch("INSERT INTO answers VALUES (CAST(:a AS uuid), :q, :d, :v)",
              [{"a": sub["id"], "q": q, "d": re.sub(r"\d+$", "", q), "v": v} for q, v in sub["answers"].items()], tx)
        batch("INSERT INTO domain_results VALUES (CAST(:a AS uuid), :d, :t, :f, :g, CAST(:p AS numeric), :s, :h)",
              [{"a": sub["id"], "d": d["domain_id"], "t": d["total_questions"], "f": d["favorable_count"],
                "g": d["gap_count"], "p": str(d["score_pct"]), "s": d["estimated_stage"], "h": d["high_count"]}
               for d in sub["domains"]], tx)
        if sub["gaps"]:
            batch("INSERT INTO gaps VALUES (CAST(:a AS uuid), :q, :d, :st, CAST(:sc AS numeric), :p, :r)",
                  [{"a": sub["id"], "q": g["question_id"], "d": g["domain_id"], "st": g["stage"], "sc": str(g["score"]),
                    "p": g["priority"], "r": i + 1} for i, g in enumerate(sub["gaps"])], tx)
        _call(_client().commit_transaction, transactionId=tx)
    except Exception:
        try:
            _call(_client().rollback_transaction, transactionId=tx)
        except ClientError:
            pass  # the Data API already aborted it; keep the original error
        raise


# ---------- staff analytics ----------

def analytics(domains, stage_names):
    """Network view for Everytown staff. `domains` is the question bank; texts are joined in Python."""
    names = {d["id"]: d["name"] for d in domains}
    text = {q["id"]: q["text"] for d in domains for q in d["questions"]}
    stage_of = {q["id"]: stage_names[str(q["stage"])] for d in domains for q in d["questions"]}
    totals = query("SELECT (SELECT count(*) FROM organizations) AS organizations, count(*) AS assessments, "
                   "count(*) FILTER (WHERE created_at > now() - interval '30 days') AS last_30_days FROM assessments")[0]
    by_stage = query("SELECT dr.domain_id, dr.estimated_stage, count(*) AS n, sum(dr.score_pct)::float AS total "
                     "FROM domain_results dr JOIN latest_assessments la ON la.id = dr.assessment_id "
                     "GROUP BY dr.domain_id, dr.estimated_stage")
    out_domains, assessed = [], {}
    for d in domains:
        rows = [r for r in by_stage if r["domain_id"] == d["id"]]
        n = sum(r["n"] for r in rows)
        if not n:
            continue
        assessed[d["id"]] = n
        out_domains.append({"domain_id": d["id"], "domain_name": d["name"], "assessed": n,
                            "avg_capacity": round(sum(r["total"] for r in rows) / n, 1),
                            "stages": {stage_names[str(i)]: sum(r["n"] for r in rows
                                                                if r["estimated_stage"] == stage_names[str(i)])
                                       for i in range(1, 6)}})
    gap_rows = query("SELECT g.question_id, g.domain_id, count(*) AS orgs FROM gaps g "
                     "JOIN latest_assessments la ON la.id = g.assessment_id "
                     "GROUP BY g.question_id, g.domain_id ORDER BY orgs DESC, g.question_id LIMIT 15")
    top_gaps = [{"question_id": r["question_id"], "domain_id": r["domain_id"], "domain_name": names[r["domain_id"]],
                 "question_text": text[r["question_id"]], "stage_name": stage_of[r["question_id"]], "orgs": r["orgs"],
                 "share_pct": round(100.0 * r["orgs"] / assessed[r["domain_id"]], 1)} for r in gap_rows]
    members = query("SELECT g.question_id, g.domain_id, o.id::text AS id, o.name, la.id::text AS assessment_id "
                    "FROM gaps g JOIN latest_assessments la ON la.id = g.assessment_id "
                    "JOIN organizations o ON o.id = la.org_id WHERE g.priority = 'High' ORDER BY o.name")
    groups = {}
    for r in members:
        groups.setdefault(r["question_id"], []).append({"id": r["id"], "name": r["name"],
                                                        "assessment_id": r["assessment_id"]})
    cohorts = sorted(({"question_id": q, "question_text": text[q], "domain_name": names[re.sub(r"\d+$", "", q)],
                       "priority_orgs": len(m), "organizations": m} for q, m in groups.items() if len(m) >= 2),
                     key=lambda c: (-c["priority_orgs"], c["question_id"]))[:8]
    org_rows = query("SELECT o.id::text AS id, o.name, la.id::text AS assessment_id, la.source, "
                     "to_char(la.created_at, 'YYYY-MM-DD') AS assessed, "
                     "(SELECT count(*) FROM gaps g WHERE g.assessment_id = la.id) AS gap_count, "
                     "(SELECT count(*) FROM gaps g WHERE g.assessment_id = la.id AND g.priority = 'High') AS high_count, "
                     "o.program_models::text AS program_models, o.staff_size, o.state "
                     "FROM latest_assessments la JOIN organizations o ON o.id = la.org_id ORDER BY o.name")
    for o in org_rows:
        o["org_meta"] = {"program_models": json.loads(o.pop("program_models") or "[]"),
                         "staff_size": o.pop("staff_size"), "state": o.pop("state")}
    bench = query("SELECT assessment_id::text AS assessment_id, domain_id, estimated_stage, score_pct::float AS score_pct, "
                  "percentile::int AS percentile FROM domain_benchmarks")
    per = {}
    for b in bench:
        per.setdefault(b["assessment_id"], []).append({k: b[k] for k in ("domain_id", "estimated_stage",
                                                                         "score_pct", "percentile")})
    order = {d["id"]: i for i, d in enumerate(domains)}
    for o in org_rows:
        o["domains"] = sorted(per.get(o["assessment_id"], []), key=lambda x: order[x["domain_id"]])
    # Each organization's most recent support request (from any of its assessments), grouped by area.
    req_rows = query("WITH last AS (SELECT DISTINCT ON (a.org_id) a.org_id, sr.assessment_id FROM support_requests sr "
                     "JOIN assessments a ON a.id = sr.assessment_id ORDER BY a.org_id, sr.requested_at DESC) "
                     "SELECT o.id::text AS id, o.name, sr.domain_id, sr.assessment_id::text AS assessment_id, "
                     "to_char(sr.requested_at, 'YYYY-MM-DD') AS requested_at FROM last "
                     "JOIN support_requests sr ON sr.assessment_id = last.assessment_id "
                     "JOIN organizations o ON o.id = last.org_id ORDER BY o.name")
    requests = {}
    for r in req_rows:
        requests.setdefault(r.pop("domain_id"), []).append(r)
    support = sorted(({"domain_id": d, "domain_name": names[d], "orgs": len(m), "organizations": m}
                      for d, m in requests.items() if d in names), key=lambda s: (-s["orgs"], order[s["domain_id"]]))
    return {"totals": totals, "domains": out_domains, "top_gaps": top_gaps, "cohorts": cohorts,
            "organizations": org_rows, "support_requests": support}


# ---------- synthetic seed data ----------

SEED_NAMES = [
    "Northside Peacekeepers", "Eastgate Credible Messengers", "Harbor City Youth Alliance", "Southpoint Safe Streets",
    "Riverside Healing Circle", "West End Violence Interrupters", "Lakeshore Hospital Responders", "Midtown Peace Collective",
    "Cedar Grove Community Safety", "Oak Park Second Chances", "Union Square Outreach", "Hillcrest Youth Futures",
    "Bayview Neighborhood Healers", "Pinecrest Street Outreach", "Fairview Restorative Justice", "Greenway Mentors Network",
    "Brookside Safe Passage", "Maple Heights Peace Project", "Sunset Community Responders", "Ironbridge Life Coaches",
]


def seed():
    """Replace previous seed rows with ~20 synthetic organizations (a few with two assessments) for analytics."""
    import app  # local import: app imports db at module load

    query("DELETE FROM organizations o WHERE NOT EXISTS "
          "(SELECT 1 FROM assessments a WHERE a.org_id = o.id AND a.source <> 'seed')")
    query("DELETE FROM assessments WHERE source = 'seed'")
    rnd = random.Random(2026)
    domains = app.get_domains()
    for i, name in enumerate(SEED_NAMES):
        size = rnd.choice([1, 2, 2, 3, 3, 4])  # mostly small, early-stage organizations, like the CSF network
        target = {d["id"]: max(1, min(5, size + rnd.choice([-1, 0, 0, 1]) - (d["id"] in ("PL", "TI")))) for d in domains}
        chosen = domains if i % 3 else [d for d in domains if d["id"] in app.PRIORITY_DOMAINS]
        for visit in range(2 if i % 5 == 0 else 1):
            answers = {}
            for d in chosen:
                for q in d["questions"]:
                    met = q["stage"] <= target[d["id"]] + visit
                    favorable = rnd.random() < (0.88 if met else 0.18)
                    answers[q["id"]] = ("no" if favorable else "yes") if q["trigger_on"] == "yes" else \
                        ("yes" if favorable else "no")
            sub = app.build_assessment({"org_name": name + " (synthetic)", "org_url": "", "language": "en",
                                        "org_meta": _seed_meta(i)}, answers, chosen)
            sub["status"] = "done"
            sub["steps"] = [dict(s, state="done") for s in sub["steps"]]
            days_ago = 40 + rnd.randint(0, 60) if visit == 0 and i % 5 == 0 else rnd.randint(0, 45)
            sub["created"] = time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime(time.time() - days_ago * 86400))
            create(sub, "seed", created_at=time.strftime("%Y-%m-%dT%H:%M:%SZ",
                                                         time.gmtime(time.time() - days_ago * 86400)))
            if rnd.random() < 0.6:  # most organizations ask for help in the areas of their top growth priorities
                areas = list(dict.fromkeys(g["domain_id"] for g in sub["gaps"][:3]))
                set_support(sub, areas)
    print("seeded", len(SEED_NAMES), "synthetic organizations")


def _seed_meta(i):
    """Deterministic synthetic details, from their own generator so the seeded answers stay the same."""
    from features.orgmeta import PROGRAM_MODELS

    r = random.Random("meta-%d" % i)
    picked = r.sample(PROGRAM_MODELS[:5], r.choice([1, 1, 2]))
    return {"program_models": [m for m in PROGRAM_MODELS if m in picked],
            "staff_size": r.choice(["1-5", "6-10", "6-10", "11-20", "11-20", "21-50"]),
            "state": r.choice(["IL", "NY", "CA", "PA", "MD", "GA"])}


if __name__ == "__main__":
    {"migrate": migrate, "seed": seed}[sys.argv[1]]()
