"""OCI Capacity Coach JSON API: mocked login, deterministic scoring, AI report, PDF, staff analytics.

The Astro site in frontend/ calls /api/*. Data lives in Aurora PostgreSQL (db.py). The AI steps run in a
background thread locally, or as an async self-invoke of the same Lambda when OCI_WORKER_FN is set.
"""
import json
import os
import threading
import uuid
from dataclasses import asdict
from datetime import datetime, timezone
from functools import wraps

import boto3
from flask import Flask, Response, jsonify, request, session

import db
import pipeline
import report
from engine.scoring import calculate_recommendations
from utils.data_loader import get_domains, get_stage_names, get_stage_weights

USERS = {"demo": ("demo", "org"), "staff": ("staff", "staff")}  # mocked login, per the vision doc
PRIORITY_DOMAINS = ["PL", "FR", "FM", "ML"]
DEFAULT_DOMAINS = os.environ.get("OCI_DOMAINS", ",".join(PRIORITY_DOMAINS)).split(",")
LANGUAGES = ("en", "es")
STEPS = [("read", "Reading your answers"), ("score", "Scoring capacity domains"),
         ("research", "Researching your organization's website"),
         ("library", "Consulting the CVI resource library"),
         ("write", "Writing personalized recommendations")]
WORKER_FN = os.environ.get("OCI_WORKER_FN")

ROOT = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(ROOT, "data", "domain_info.json")) as _f:
    INFO = json.load(_f)
with open(os.path.join(ROOT, "data", "samples.json")) as _f:
    SAMPLES = json.load(_f)
for _s in SAMPLES.values():
    with open(os.path.join(ROOT, _s["file"])) as _f:
        _s["answers"] = json.load(_f)["answers"]

app = Flask(__name__)
app.secret_key = os.environ.get("OCI_SECRET_KEY") or os.urandom(32)
app.config.update(SESSION_COOKIE_SAMESITE="Lax", SESSION_COOKIE_SECURE=bool(WORKER_FN), SESSION_COOKIE_HTTPONLY=True)


def error(message, code):
    return jsonify(error=message), code


def login_required(role=None):
    def deco(view):
        @wraps(view)
        def wrapped(*a, **kw):
            user = session.get("user")
            if not user:
                return error("Please sign in.", 401)
            if role and user["role"] != role:
                return error("This page is for Everytown staff.", 403)
            return view(*a, **kw)
        return wrapped
    return deco


@app.before_request
def json_posts_only():
    # A JSON content type cannot be sent cross-site without a CORS preflight, so this blocks CSRF form posts.
    if request.method == "POST" and not request.is_json:
        return error("Send JSON.", 415)


def body():
    return request.get_json(silent=True) or {}


def load(sid):
    try:
        sid = str(uuid.UUID(sid))
    except ValueError:
        return None
    return db.get(sid)


# ---------- auth ----------

@app.route("/api/healthz")
def healthz():
    return "ok"


@app.route("/api/login", methods=["POST"])
def login():
    b = body()
    user = USERS.get(b.get("username", ""))
    if not user or b.get("password") != user[0]:
        return error("That username and password did not match. Use demo / demo, or staff / staff for the "
                     "Everytown staff view.", 401)
    session["user"] = {"name": b["username"], "role": user[1]}
    return jsonify(user=session["user"])


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return "", 204


@app.route("/api/me")
@login_required()
def me():
    return jsonify(user=session["user"])


@app.route("/api/meta")
@login_required()
def meta():
    names = get_stage_names()
    return jsonify(
        domains=[{"id": d["id"], "name": d["name"], "weight": d["weight"], "about": INFO["domains"][d["id"]]["about"],
                  "connects": INFO["domains"][d["id"]]["connects"], "priority": d["id"] in PRIORITY_DOMAINS,
                  "questions": [{"id": q["id"], "text": q["text"], "stage": q["stage"],
                                 "stage_name": names[str(q["stage"])], "reverse": q["trigger_on"] == "yes"}
                                for q in d["questions"]]} for d in get_domains()],
        stages=[{"n": i, "name": names[str(i)], "description": INFO["stage_descriptions"][names[str(i)]]}
                for i in range(1, 6)],
        samples=[{"id": k, "name": s["name"], "summary": s["summary"]} for k, s in SAMPLES.items()],
        languages=list(LANGUAGES), default_domains=DEFAULT_DOMAINS)


# ---------- assessments ----------

def _domains(ids):
    ids = [i for i in ids or [] if isinstance(i, str)]
    return [d for d in get_domains() if d["id"] in ids]


@app.route("/api/assessments", methods=["POST"])
@login_required()
def create_assessment():
    b = body()
    errors = {}
    name = str(b.get("org_name", "")).strip()[:200]
    url = str(b.get("org_url", "")).strip()[:500]
    if url and "://" not in url:
        url = "https://" + url
    domains = _domains(b.get("domain_ids"))
    answers = b.get("answers") if isinstance(b.get("answers"), dict) else {}
    if not name:
        errors["org_name"] = "Enter your organization's name."
    if url and not pipeline.looks_like_web_url(url):
        errors["org_url"] = "Enter a web address like https://example.org, or leave it blank."
    if not domains:
        errors["domain_ids"] = "Choose at least one area to assess."
    # An unanswered statement would score as favorable, so every one must be answered yes or no.
    missing = [q["id"] for d in domains for q in d["questions"] if answers.get(q["id"]) not in ("yes", "no")]
    if errors or missing:
        return jsonify(errors=errors, missing=missing), 400
    org = {"org_name": name, "org_url": url, "language": b.get("language") if b.get("language") in LANGUAGES else "en"}
    clean = {q["id"]: answers[q["id"]] for d in domains for q in d["questions"]}
    return jsonify(id=submit(org, clean, domains, source="web")), 201


@app.route("/api/demo", methods=["POST"])
@login_required()
def demo():
    """Submit a synthetic sample organization from the builder package, for demos and staff training."""
    b = body()
    sample = SAMPLES.get(b.get("sample", ""))
    if not sample:
        return error("Unknown sample.", 400)
    domains = _domains(b.get("domain_ids")) or _domains(DEFAULT_DOMAINS)
    org = {"org_name": sample["name"], "org_url": "",
           "language": b.get("language") if b.get("language") in LANGUAGES else "en"}
    answers = {q["id"]: sample["answers"][q["id"]] for d in domains for q in d["questions"]}
    return jsonify(id=submit(org, answers, domains, source="demo", profile=sample["profile"])), 201


def build_assessment(org, answers, domains, profile=None):
    """The deterministic part of an assessment: scores come only from the reference engine."""
    gaps, summaries = calculate_recommendations(answers, domains, get_stage_weights(), get_stage_names())
    total = sum(s.total_questions for s in summaries)
    favorable = sum(s.favorable_count for s in summaries)
    count = {p: sum(1 for g in gaps if g.priority == p) for p in ("High", "Medium", "Low")}
    return {
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
        "status": "running", "error": None, "profile": profile, "progress": None, "pdf_kb": None, "report": None,
    }


def compare(prev, sub):
    """Deterministic progress since the organization's previous assessment, over the areas both covered."""
    shared = [d for d in sub["domain_ids"] if d in prev["domain_ids"]]
    if not shared:
        return None
    before = [g for g in prev["gaps"] if g["domain_id"] in shared]
    now = [g for g in sub["gaps"] if g["domain_id"] in shared]
    before_ids, now_ids = {g["question_id"] for g in before}, {g["question_id"] for g in now}
    stages = {d["domain_id"]: d["estimated_stage"] for d in prev["domains"]}
    return {"previous_id": prev["id"], "previous_created": prev["created"],
            "closed": [{"id": g["question_id"], "text": g["question_text"]} for g in before
                       if g["question_id"] not in now_ids],
            "new": [{"id": g["question_id"], "text": g["question_text"]} for g in now
                    if g["question_id"] not in before_ids],
            "stages": [{"domain_id": d["domain_id"], "domain_name": d["domain_name"],
                        "from": stages[d["domain_id"]], "to": d["estimated_stage"]}
                       for d in sub["domains"] if d["domain_id"] in shared]}


def submit(org, answers, domains, source, profile=None):
    sub = build_assessment(org, answers, domains, profile)
    prev = db.latest_for(sub["org_name"])
    sub["progress"] = compare(prev, sub) if prev else None
    db.create(sub, source)
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
    sub = db.get(sid)
    steps = {s["key"]: s for s in sub["steps"]}

    def mark(key, state):
        steps[key]["state"] = state
        db.update(sub)

    try:
        mark("research", "running")
        if sub["org_url"]:
            sub["profile"] = pipeline.research_org(sub["org_name"], sub["org_url"])
        mark("research", "done")
        mark("library", "running")
        library = pipeline.gather_library(sub)
        mark("library", "done")
        mark("write", "running")
        sub["report"] = pipeline.write_report(sub, library)
        sub["pdf_kb"] = max(1, round(len(report.build_pdf(sub, INFO["stage_descriptions"])) / 1024))
        steps["write"]["state"] = "done"
        sub["status"] = "done"
    except Exception as exc:  # surface the failed step; scores stay valid
        app.logger.exception("pipeline failed for %s", sid)
        sub["status"], sub["error"] = "error", "%s: %s" % (type(exc).__name__, exc)
        for s in sub["steps"]:
            if s["state"] == "running":
                s["state"] = "error"
    db.update(sub)


@app.route("/api/assessments/<sid>")
@login_required()
def get_assessment(sid):
    sub = load(sid)
    return jsonify(sub) if sub else error("Report not found.", 404)


@app.route("/api/assessments/<sid>/status")
@login_required()
def status(sid):
    sub = load(sid)
    if not sub:
        return error("Report not found.", 404)
    return jsonify(status=sub["status"], steps=sub["steps"], error=sub["error"])


@app.route("/api/assessments/<sid>/retry", methods=["POST"])
@login_required()
def retry(sid):
    sub = load(sid)
    if not sub:
        return error("Report not found.", 404)
    if sub["status"] == "error":
        for s in sub["steps"]:
            if s["state"] != "done":
                s["state"] = "pending"
        sub["status"], sub["error"] = "running", None
        db.update(sub)
        start_job(sub["id"])
    return jsonify(status=sub["status"]), 202


@app.route("/api/assessments/<sid>/report.pdf")
@login_required()
def pdf(sid):
    sub = load(sid)
    if not sub:
        return error("Report not found.", 404)
    slug = "".join(c if c.isalnum() else "-" for c in sub["org_name"]).strip("-")[:60] or "organization"
    return Response(report.build_pdf(sub, INFO["stage_descriptions"]), mimetype="application/pdf",
                    headers={"Content-Disposition": 'attachment; filename="OCI-report-%s.pdf"' % slug})


# ---------- Everytown staff ----------

@app.route("/api/staff/analytics")
@login_required(role="staff")
def analytics():
    return jsonify(db.analytics(get_domains(), get_stage_names()))


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 8000)), debug=False)
