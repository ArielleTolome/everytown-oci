"""OCI Capacity Coach: mocked login, questionnaire, deterministic scoring, AI report, PDF.

Runs locally (JSON files + background thread) or on AWS Lambda (S3 store + async self-invoke),
chosen by the OCI_BUCKET / OCI_WORKER_FN environment variables.
"""
import json
import os
import threading
import uuid
from dataclasses import asdict
from datetime import datetime, timezone
from functools import wraps

import boto3
from flask import Flask, Response, abort, jsonify, redirect, render_template, request, session, url_for

import pipeline
import report
from engine.scoring import calculate_recommendations
from utils.data_loader import get_domains, get_stage_names, get_stage_weights

DEMO_USER, DEMO_PASSWORD = "demo", "demo"
PRIORITY_DOMAINS = ["PL", "FR", "FM", "ML"]
DEFAULT_DOMAINS = os.environ.get("OCI_DOMAINS", ",".join(PRIORITY_DOMAINS)).split(",")
LANGUAGES = ("en", "es")
STEPS = [("read", "Reading your answers"), ("score", "Scoring capacity domains"),
         ("research", "Researching your organization's website"),
         ("library", "Consulting the CVI resource library"),
         ("write", "Writing personalized recommendations")]
BUCKET = os.environ.get("OCI_BUCKET")
WORKER_FN = os.environ.get("OCI_WORKER_FN")

with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "domain_info.json")) as _f:
    INFO = json.load(_f)

app = Flask(__name__)
app.secret_key = os.environ.get("OCI_SECRET_KEY") or os.urandom(32)
app.config.update(SESSION_COOKIE_SAMESITE="Lax", SESSION_COOKIE_SECURE=bool(BUCKET))

if BUCKET:
    _s3 = boto3.client("s3")
else:
    STORE = os.path.join(app.instance_path, "submissions")
    os.makedirs(STORE, exist_ok=True)
    _lock = threading.Lock()


def _sid(sid):
    try:
        return str(uuid.UUID(sid))
    except ValueError:
        abort(404)


def load(sid):
    sid = _sid(sid)
    if BUCKET:
        try:
            body = _s3.get_object(Bucket=BUCKET, Key="submissions/%s.json" % sid)["Body"].read()
        except _s3.exceptions.NoSuchKey:
            abort(404)
        return json.loads(body)
    path = os.path.join(STORE, sid + ".json")
    if not os.path.exists(path):
        abort(404)
    with open(path) as f:
        return json.load(f)


def save(sub):
    body = json.dumps(sub, indent=1, ensure_ascii=False)
    if BUCKET:
        _s3.put_object(Bucket=BUCKET, Key="submissions/%s.json" % sub["id"], Body=body.encode(),
                       ContentType="application/json")
        return
    path = os.path.join(STORE, sub["id"] + ".json")
    with _lock:
        with open(path + ".tmp", "w") as f:
            f.write(body)
        os.replace(path + ".tmp", path)


def chosen_domains(ids):
    return [d for d in get_domains() if d["id"] in ids]


def login_required(view):
    @wraps(view)
    def wrapped(*a, **kw):
        if not session.get("user"):
            return redirect(url_for("login"))
        return view(*a, **kw)
    return wrapped


@app.route("/healthz")
def healthz():
    return "ok"


@app.route("/login", methods=["GET", "POST"])
def login():
    error, username = None, ""
    if request.method == "POST":
        username = request.form.get("username", "")
        if username == DEMO_USER and request.form.get("password") == DEMO_PASSWORD:
            session["user"] = DEMO_USER
            return redirect(url_for("start"))
        error = "That username and password did not match. Use the demo credentials: demo / demo."
    return render_template("login.html", error=error, username=username)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/", methods=["GET", "POST"])
@login_required
def start():
    errors = {}
    form = session.get("org") or {"org_name": "", "org_url": "", "language": "en", "domains": DEFAULT_DOMAINS}
    if request.method == "POST":
        valid_ids = {d["id"] for d in get_domains()}
        url = request.form.get("org_url", "").strip()[:500]
        if url and "://" not in url:
            url = "https://" + url
        form = {"org_name": request.form.get("org_name", "").strip()[:200], "org_url": url,
                "language": request.form.get("language", "en"),
                "domains": [d for d in request.form.getlist("domains") if d in valid_ids]}
        if not form["org_name"]:
            errors["org_name"] = "Enter your organization's name."
        if url and not pipeline.looks_like_web_url(url):
            errors["org_url"] = "Enter a web address like https://example.org, or leave it blank."
        if not form["domains"]:
            errors["domains"] = "Choose at least one area to assess."
        if form["language"] not in LANGUAGES:
            form["language"] = "en"
        if not errors:
            session["org"] = form
            session.setdefault("answers", {})
            return redirect(url_for("questionnaire", n=0))
    all_domains = [{"id": d["id"], "name": d["name"], "count": len(d["questions"]),
                    "about": INFO["domains"][d["id"]]["about"], "priority": d["id"] in PRIORITY_DOMAINS}
                   for d in get_domains()]
    return render_template("start.html", errors=errors, form=form, all_domains=all_domains)


@app.route("/questionnaire/<int:n>", methods=["GET", "POST"])
@login_required
def questionnaire(n):
    org = session.get("org")
    if not org:
        return redirect(url_for("start"))
    domains = chosen_domains(org["domains"])
    if not 0 <= n < len(domains):
        return redirect(url_for("questionnaire", n=0))
    domain = domains[n]
    answers = dict(session.get("answers", {}))
    missing = []
    if request.method == "POST":
        for q in domain["questions"]:
            a = request.form.get(q["id"], "")
            if a in ("yes", "no"):
                answers[q["id"]] = a
        session["answers"] = answers
        if request.form.get("nav") == "back":
            return redirect(url_for("questionnaire", n=n - 1) if n else url_for("start"))
        # An unanswered statement would score as favourable, so every one must be answered.
        missing = [q["id"] for q in domain["questions"] if q["id"] not in answers]
        if not missing:
            if n + 1 < len(domains):
                return redirect(url_for("questionnaire", n=n + 1))
            for i, d in enumerate(domains):
                if any(q["id"] not in answers for q in d["questions"]):
                    return redirect(url_for("questionnaire", n=i))
            sid = submit(org, {q["id"]: answers[q["id"]] for d in domains for q in d["questions"]}, domains)
            session.pop("answers", None)
            return redirect(url_for("results", sid=sid))
    stage_names = get_stage_names()
    view = {"id": domain["id"], "name": domain["name"], "about": INFO["domains"][domain["id"]]["about"],
            "connects": INFO["domains"][domain["id"]]["connects"],
            "questions": [{"id": q["id"], "text": q["text"], "stage": q["stage"],
                           "stage_name": stage_names[str(q["stage"])], "reverse": q["trigger_on"] == "yes"}
                          for q in domain["questions"]]}
    all_ids = [q["id"] for d in domains for q in d["questions"]]
    return render_template("questionnaire.html", domain=view, n=n, total=len(domains), org=org, missing=missing,
                           answers={q["id"]: answers[q["id"]] for q in domain["questions"] if q["id"] in answers},
                           answered_total=sum(1 for i in all_ids if i in answers), question_total=len(all_ids),
                           domain_names=[d["name"] for d in domains])


def submit(org, answers, domains):
    gaps, summaries = calculate_recommendations(answers, domains, get_stage_weights(), get_stage_names())
    total = sum(s.total_questions for s in summaries)
    favorable = sum(s.favorable_count for s in summaries)
    count = {p: sum(1 for g in gaps if g.priority == p) for p in ("High", "Medium", "Low")}
    sub = {
        "id": str(uuid.uuid4()),
        "created": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "org_name": org["org_name"], "org_url": org["org_url"], "language": org["language"],
        "domain_ids": [d["id"] for d in domains], "answers": answers,
        "overall": {"total_questions": total, "favorable": favorable,
                    "favorable_pct": round(favorable / total * 100, 1), "total_gaps": len(gaps),
                    "high": count["High"], "medium": count["Medium"], "low": count["Low"]},
        "domains": [{"domain_id": s.domain_id, "domain_name": s.domain_name, "total_questions": s.total_questions,
                     "favorable_count": s.favorable_count, "gap_count": s.gap_count, "score_pct": s.score_pct,
                     "estimated_stage": s.estimated_stage,
                     "high_count": sum(1 for g in s.recommendations if g.priority == "High")} for s in summaries],
        "gaps": [asdict(g) for g in gaps],
        "steps": [{"key": k, "label": label, "state": "done" if k in ("read", "score") else "pending"}
                  for k, label in STEPS],
        "status": "running", "error": None, "profile": None, "report": None,
    }
    save(sub)
    start_job(sub["id"])
    return sub["id"]


def start_job(sid):
    if WORKER_FN:
        boto3.client("lambda").invoke(FunctionName=WORKER_FN, InvocationType="Event",
                                      Payload=json.dumps({"oci_sid": sid}).encode())
    else:
        threading.Thread(target=run_job, args=(sid,), daemon=True).start()


def run_job(sid):
    """The hardcoded AI pipeline. Scores are already final; the model only writes text around them."""
    sub = load(sid)
    steps = {s["key"]: s for s in sub["steps"]}

    def mark(key, state):
        steps[key]["state"] = state
        save(sub)

    try:
        mark("research", "running")
        sub["profile"] = pipeline.research_org(sub["org_name"], sub["org_url"]) if sub["org_url"] else None
        mark("research", "done")
        mark("library", "running")
        library = pipeline.gather_library(sub)
        mark("library", "done")
        mark("write", "running")
        sub["report"] = pipeline.write_report(sub, library)
        steps["write"]["state"] = "done"
        sub["status"] = "done"
    except Exception as exc:  # surface the failed step; scores stay valid
        app.logger.exception("pipeline failed for %s", sid)
        sub["status"], sub["error"] = "error", "%s: %s" % (type(exc).__name__, exc)
        for s in sub["steps"]:
            if s["state"] == "running":
                s["state"] = "error"
    save(sub)


@app.route("/results/<sid>")
@login_required
def results(sid):
    sub = load(sid)
    pdf_kb = None
    if sub["status"] == "done":
        pdf_kb = max(1, round(len(report.build_pdf(sub, INFO["stage_descriptions"])) / 1024))
    names = get_stage_names()
    return render_template("results.html", sub=sub, stage_names=[names[str(i)] for i in range(1, 6)],
                           stage_descriptions=INFO["stage_descriptions"], domain_info=INFO["domains"], pdf_kb=pdf_kb)


@app.route("/status/<sid>")
@login_required
def status(sid):
    sub = load(sid)
    return jsonify(status=sub["status"], steps=sub["steps"], error=sub["error"])


@app.route("/retry/<sid>", methods=["POST"])
@login_required
def retry(sid):
    sub = load(sid)
    if sub["status"] == "error":
        for s in sub["steps"]:
            if s["state"] != "done":
                s["state"] = "pending"
        sub["status"], sub["error"] = "running", None
        save(sub)
        start_job(sub["id"])
    return redirect(url_for("results", sid=sub["id"]))


@app.route("/report/<sid>.pdf")
@login_required
def pdf(sid):
    sub = load(sid)
    slug = "".join(c if c.isalnum() else "-" for c in sub["org_name"]).strip("-")[:60] or "organization"
    return Response(report.build_pdf(sub, INFO["stage_descriptions"]), mimetype="application/pdf",
                    headers={"Content-Disposition": 'attachment; filename="OCI-report-%s.pdf"' % slug})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 8000)), debug=False)
