"""OCI web app: mocked login, questionnaire, deterministic scoring, LLM report, PDF."""
import json
import os
import threading
import uuid
from datetime import datetime, timezone
from functools import wraps

from flask import Flask, Response, abort, jsonify, redirect, render_template, request, session, url_for

import pipeline
import report
from engine.scoring import calculate_recommendations
from utils.data_loader import get_domains, get_stage_names, get_stage_weights

DEMO_USER, DEMO_PASSWORD = "demo", "demo"
SCOPE = os.environ.get("OCI_DOMAINS", "PL,FR,FM,ML").split(",")
STEPS = ["Reading your answers", "Researching your organization's website",
         "Consulting the CVI resource library", "Writing personalized recommendations"]

app = Flask(__name__)
app.secret_key = os.environ.get("OCI_SECRET_KEY") or os.urandom(32)
STORE = os.path.join(app.instance_path, "submissions")
os.makedirs(STORE, exist_ok=True)
_lock = threading.Lock()


def scoped_domains():
    return [d for d in get_domains() if d["id"] in SCOPE]


def _path(sid):
    try:
        return os.path.join(STORE, "%s.json" % uuid.UUID(sid))
    except ValueError:
        abort(404)


def load(sid):
    path = _path(sid)
    if not os.path.exists(path):
        abort(404)
    with open(path) as f:
        return json.load(f)


def save(sub):
    with _lock:
        tmp = _path(sub["id"]) + ".tmp"
        with open(tmp, "w") as f:
            json.dump(sub, f, indent=1)
        os.replace(tmp, _path(sub["id"]))


def login_required(view):
    @wraps(view)
    def wrapped(*a, **kw):
        if not session.get("user"):
            return redirect(url_for("login"))
        return view(*a, **kw)
    return wrapped


@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        if request.form.get("username") == DEMO_USER and request.form.get("password") == DEMO_PASSWORD:
            session["user"] = DEMO_USER
            return redirect(url_for("start"))
        error = "Use the demo credentials: demo / demo"
    return render_template("login.html", error=error)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/", methods=["GET", "POST"])
@login_required
def start():
    error = None
    if request.method == "POST":
        name = request.form.get("org_name", "").strip()
        url = request.form.get("org_url", "").strip()
        if url and "://" not in url:
            url = "https://" + url
        if not name or not url.startswith(("http://", "https://")):
            error = "Enter the organization name and a website URL."
        else:
            session["org"] = {"name": name[:200], "url": url[:500]}
            return redirect(url_for("questionnaire"))
    return render_template("start.html", error=error, org=session.get("org", {}))


@app.route("/questionnaire", methods=["GET", "POST"])
@login_required
def questionnaire():
    org = session.get("org")
    if not org:
        return redirect(url_for("start"))
    domains = scoped_domains()
    answers, missing = {}, []
    if request.method == "POST":
        for d in domains:
            for q in d["questions"]:
                a = request.form.get(q["id"], "")
                if a in ("yes", "no"):
                    answers[q["id"]] = a
                else:
                    missing.append(q["id"])
        # An unanswered statement would score as favourable, so every one must be answered.
        if not missing:
            return redirect(url_for("results", sid=submit(org, answers, domains)))
    return render_template("questionnaire.html", domains=domains, answers=answers, missing=missing,
                           stage_names=get_stage_names(), org=org)


def submit(org, answers, domains):
    gaps, summaries = calculate_recommendations(answers, domains, get_stage_weights(), get_stage_names())
    sub = {
        "id": str(uuid.uuid4()),
        "created": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"),
        "org_name": org["name"], "org_url": org["url"], "answers": answers,
        "domains": [{"domain_id": s.domain_id, "domain_name": s.domain_name, "score_pct": s.score_pct,
                     "estimated_stage": s.estimated_stage, "gap_count": s.gap_count,
                     "total_questions": s.total_questions} for s in summaries],
        "steps": [{"label": label, "state": "pending"} for label in STEPS],
        "status": "running", "error": None, "profile": None, "recommendations": None,
    }
    sub["steps"][0]["state"] = "done"
    save(sub)
    threading.Thread(target=run_pipeline, args=(sub, summaries, gaps), daemon=True).start()
    return sub["id"]


def run_pipeline(sub, summaries, gaps):
    def step(i, state):
        sub["steps"][i]["state"] = state
        save(sub)
    try:
        step(1, "running")
        sub["profile"] = pipeline.research_org(sub["org_name"], sub["org_url"])
        step(1, "done")
        step(2, "done")  # the library is injected into the next prompt
        step(3, "running")
        sub["recommendations"] = pipeline.recommend(sub["org_name"], sub["profile"], summaries, gaps)
        step(3, "done")
        sub["status"] = "done"
    except Exception as exc:
        sub["status"], sub["error"] = "error", "Recommendation step failed: %s" % exc
        for s in sub["steps"]:
            if s["state"] == "running":
                s["state"] = "error"
    save(sub)


@app.route("/results/<sid>")
@login_required
def results(sid):
    return render_template("results.html", sub=load(sid))


@app.route("/status/<sid>")
@login_required
def status(sid):
    sub = load(sid)
    return jsonify(status=sub["status"], steps=sub["steps"], error=sub["error"])


@app.route("/report/<sid>.pdf")
@login_required
def pdf(sid):
    sub = load(sid)
    if sub["status"] != "done":
        abort(409)
    filename = "OCI_Report_%s.pdf" % "".join(c for c in sub["org_name"] if c.isalnum() or c in "-_")[:60]
    return Response(report.build_pdf(sub), mimetype="application/pdf",
                    headers={"Content-Disposition": 'attachment; filename="%s"' % filename})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 8000)), debug=False)
