"""Dev-only: the real Flask API on :8000 with no Aurora and no Bedrock, for accessibility checks of real pages.

Assessments live in memory, raw SQL returns no rows (empty roadmap ticks, peers, coach history), and the AI steps are
replaced by a canned report that still goes through pipeline.validate_report. Seeds the three sample organizations
so the staff dashboard has data. Never deploy this. Run: python3 frontend/a11y/stub_api.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import app as oci  # noqa: E402
import db  # noqa: E402
import pipeline  # noqa: E402
from features import bi  # noqa: E402

STORE, OWNERS = {}, {}

db.query = lambda sql, tx=None, **params: []
db.get = lambda sid: STORE.get(sid)
db.update = lambda sub: STORE.__setitem__(sub["id"], sub)
db.owner_of = lambda sid: OWNERS.get(sid)
db.recent_reports = lambda hours=1: 0
db.latest_for = lambda name, owner: next((s for s in reversed(list(STORE.values()))
                                          if s["org_name"] == name and OWNERS.get(s["id"]) == owner), None)


def _create(sub, source, created_at=None, owner=None):
    STORE[sub["id"]], OWNERS[sub["id"]] = sub, owner


def _set_support(sub, domain_ids):
    sub["support"] = {"domain_ids": domain_ids, "requested": sub["created"]}
    return sub["support"]


db.create, db.set_support = _create, _set_support


def _report(sub):
    gaps = sub["gaps"]
    rid = next(iter(pipeline.CATALOG))
    raw = {"summary": "You have a clear mission and a team that shows up. Planning ahead is your next step.",
           "strengths": ["Your board meets often.", "Staff know the community well."],
           "conversation": ["Who owns our plan for next year?", "What would one new funder change for us?"],
           "focus": [{"title": "Start with " + g["question_text"], "why": "This is one of your top priorities.",
                      "gap_ids": [g["question_id"]], "steps": g["next_steps"][:2], "resource_id": rid}
                     for g in gaps[:2]],
           "plan": [{"horizon": h, "title": "Work on " + g["question_id"], "why": "It came up in your answers.",
                     "gap_ids": [g["question_id"]], "owner": "Executive director", "steps": g["next_steps"][:2]}
                    for h, g in zip((30, 30, 60, 60, 90, 90), gaps)]}
    return dict(pipeline.validate_report(raw, gaps), reading_grade=6.2, simplified=False)


def _start_job(sid):
    sub = STORE[sid]
    for s in sub["steps"]:
        s["state"] = "done"
    sub["status"] = "done"
    if sub["gaps"]:
        sub["report"] = _report(sub)


oci.start_job = _start_job


def _load():
    out = []
    for sub in STORE.values():
        meta = sub.get("org_meta") or {}
        out.append({"id": sub["id"], "name": sub["org_name"], "assessment_id": sub["id"],
                    "created": sub["created"][:10], "source": "demo", "assessments": 1, "recent": 1,
                    "program_models": meta.get("program_models") or [], "staff_size": meta.get("staff_size"),
                    "budget": meta.get("budget"), "state": meta.get("state"),
                    "role": (sub.get("respondent") or {}).get("role"), "answered_by": sub.get("answered_by") or {},
                    "support": (sub.get("support") or {}).get("domain_ids", []), "support_at": None, "prev": None,
                    "trace_url": None,
                    "stages": {d["domain_id"]: {"stage": d["estimated_stage"], "score": d["score_pct"]}
                               for d in sub["domains"]},
                    "gaps": [(g["question_id"], g["priority"]) for g in sub["gaps"]]})
    for o in out:
        o["asked"], o["asked_at"] = o["support"], o["support_at"]
    return sorted(out, key=lambda o: o["name"])


bi.load = _load

with oci.app.test_request_context():
    oci.session["owner"] = "seed"
    for key, s in oci.SAMPLES.items():
        domains = oci.get_domains()
        org = {"org_name": s["name"], "org_url": "", "language": "en", "org_meta": None, "respondent": None}
        oci.submit(org, {q["id"]: s["answers"][q["id"]] for d in domains for q in d["questions"]}, domains, "seed",
                   profile=s.get("profile"))

if __name__ == "__main__":
    oci.app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 8000)))
