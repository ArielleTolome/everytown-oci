"""Sign me up (v1.7): an organization may opt in to CSF trainings and occasional updates. Optional, no spam.

The tool is open to any CVI organization, not only grantees, so this is how new groups join the network. Only the
submitting session or staff can see or change an opt-in; ticking neither box withdraws it (the row is deleted).
"""
import json
import re

from flask import Blueprint, jsonify, request, session

bp = Blueprint("optin", __name__)
MAX_NAME = 100
MAX_EMAIL = 200
EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s.]+")
STAMP = "to_char(%s AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC'"
FIELDS = "training, updates, name, email, %s AS created, %s AS updated" % (STAMP % "created_at", STAMP % "updated_at")


def clean(b):
    """(optin dict, error or None). Both boxes unticked is a valid withdrawal."""
    if not isinstance(b.get("training"), bool) or not isinstance(b.get("updates"), bool):
        return None, "Choose yes or no for trainings and updates."
    name, email = b.get("name"), b.get("email")
    if name is not None and not isinstance(name, str) or email is not None and not isinstance(email, str):
        return None, "Name and email must be text."
    name, email = (name or "").strip() or None, (email or "").strip()
    if not (b["training"] or b["updates"]):
        return {"training": False, "updates": False, "name": None, "email": None}, None
    if name and len(name) > MAX_NAME:
        return None, "Please keep the name under %d characters." % MAX_NAME
    if not email or len(email) > MAX_EMAIL or not EMAIL.fullmatch(email):
        return None, "Enter an email address, like name@example.org."
    return {"training": b["training"], "updates": b["updates"], "name": name, "email": email}, None


def _get(sid):
    import db
    rows = db.query("SELECT %s FROM optins WHERE assessment_id = :assessment_id" % FIELDS, assessment_id=sid)
    return rows[0] if rows else None


@bp.route("/api/assessments/<sid>/optin", methods=["GET", "POST"])
def optin(sid):
    import db
    from app import body, error
    from features.feedback import _open

    sub, err = _open(sid)
    if err:
        return err
    if request.method == "GET":
        return jsonify(optin=_get(sub["id"]))
    data, problem = clean(body())
    if problem:
        return error(problem, 400)
    if not (data["training"] or data["updates"]):
        db.query("DELETE FROM optins WHERE assessment_id = :assessment_id", assessment_id=sub["id"])
        return jsonify(optin=None)
    rows = db.query("INSERT INTO optins (assessment_id, training, updates, name, email) VALUES (:assessment_id, "
                    ":training, :updates, :name, :email) ON CONFLICT (assessment_id) DO UPDATE SET training = "
                    "EXCLUDED.training, updates = EXCLUDED.updates, name = EXCLUDED.name, email = EXCLUDED.email, "
                    "updated_at = now() RETURNING %s" % FIELDS, assessment_id=sub["id"], **data)
    return jsonify(optin=rows[0])


@bp.route("/api/staff/optins")
def staff_optins():
    """Each organization's latest opt-in. grantee: not a demo sample (the tool has no grantee list yet)."""
    import db
    from features.feedback import _staff_error

    err = _staff_error()
    if err:
        return err
    rows = db.query(
        "SELECT DISTINCT ON (a.org_id) p.assessment_id::text AS assessment_id, o.id::text AS org_id, "
        "o.name AS org_name, o.program_models::text AS program_models, o.state, p.training, p.updates, p.name, "
        "p.email, %s AS updated, COALESCE(a.source <> 'demo', false) AS grantee, p.updated_at FROM optins p "
        "JOIN assessments a ON a.id = p.assessment_id JOIN organizations o ON o.id = a.org_id "
        "ORDER BY a.org_id, p.updated_at DESC" % (STAMP % "p.updated_at"))
    rows.sort(key=lambda r: r.pop("updated_at"), reverse=True)  # newest first across organizations
    for r in rows:
        r["program_models"] = json.loads(r["program_models"] or "[]")
    return jsonify(optins=rows)


# ---------- synthetic seed data ----------

PEOPLE = ["Jordan Reyes", "Tasha Greene", "Marcus Bell", "Ana Lucia Ortiz", "Devon Price", "Keisha Monroe"]


def seed(rnd):
    """db.seed hook: 4 to 6 seeded organizations opt in, with made-up names and @example.org emails."""
    import db

    db.query("DELETE FROM optins WHERE assessment_id IN (SELECT id FROM assessments WHERE source = 'seed')")
    rows = db.query("SELECT la.id::text AS id FROM latest_assessments la JOIN organizations o ON o.id = la.org_id "
                    "WHERE la.source = 'seed' ORDER BY o.name")
    for r, person in zip(rnd.sample(rows, min(rnd.randint(4, 6), len(rows))), PEOPLE):
        training = rnd.random() < 0.8
        db.query("INSERT INTO optins (assessment_id, training, updates, name, email, created_at, updated_at) VALUES "
                 "(:assessment_id, :training, :updates, :name, :email, now() - make_interval(days => CAST(:d AS int)), "
                 "now() - make_interval(days => CAST(:d AS int)))", assessment_id=r["id"], training=training,
                 updates=not training or rnd.random() < 0.5, name=person,
                 email=person.lower().replace(" ", ".") + "@example.org", d=rnd.randint(0, 30))
