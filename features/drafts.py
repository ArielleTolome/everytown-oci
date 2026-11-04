"""Save and resume, and "send this area to a teammate" (v0.9).

A draft is reachable only through its random token (a capability link; sign-in is still required). A share token
reads and answers exactly one area of one draft, so a teammate cannot see or overwrite the other areas. Resume
links always carry the full token; the short code shown in the UI is only a human check, never a lookup key.
Answers only ever merge (a yes/no can change, never disappear), in one SQL statement, so a leader and a teammate
saving at the same time cannot overwrite each other.
"""
import json
import re
import secrets
import uuid

from flask import Blueprint, jsonify, request, session

bp = Blueprint("drafts", __name__)
MAX_BYTES = 64 * 1024
TOKEN = re.compile(r"[A-Za-z0-9_-]{22,64}")


@bp.before_request
def _guard():
    from app import error

    if not session.get("user"):
        return error("Please sign in.", 401)
    if request.content_length and request.content_length > MAX_BYTES or len(request.get_data()) > MAX_BYTES:
        return error("This draft is too large.", 413)


def _bank():
    from app import get_domains

    return get_domains()


def _answers(raw, domain_ids):
    """Only known statement ids of the given areas, and only "yes" or "no"."""
    raw = raw if isinstance(raw, dict) else {}
    return {q["id"]: raw[q["id"]] for d in _bank() if d["id"] in domain_ids for q in d["questions"]
            if raw.get(q["id"]) in ("yes", "no")}


def clean(raw):
    from app import LANGUAGES
    from features.orgmeta import clean_org_meta, clean_respondent, clean_social

    raw = raw if isinstance(raw, dict) else {}
    chosen = raw.get("domain_ids") if isinstance(raw.get("domain_ids"), list) else []
    links = raw.get("org_links") if isinstance(raw.get("org_links"), dict) else {}
    return {"org_name": str(raw.get("org_name") or "").strip()[:200],
            "org_url": str(raw.get("org_url") or "").strip()[:500],
            "language": raw.get("language") if raw.get("language") in LANGUAGES else "en",
            "domain_ids": [d["id"] for d in _bank() if d["id"] in chosen],
            "answers": _answers(raw.get("answers"), [d["id"] for d in _bank()]),
            "org_meta": clean_org_meta(raw.get("org_meta")),
            "respondent": clean_respondent(raw.get("respondent"))[0],
            "org_links": {"social": clean_social(links.get("social"))[0]},
            # How the leader answers (questionnaire #28), so a resume link on another device keeps it.
            "view": raw.get("view") if raw.get("view") in ("quick", "yn", "check") else None}


def _find(token):
    """(draft id, area or None) for a full or share token."""
    import db

    if not TOKEN.fullmatch(token or ""):
        return None, None
    rows = db.query("SELECT id::text AS id FROM drafts WHERE token = :token", token=token)
    if rows:
        return rows[0]["id"], None
    rows = db.query("SELECT draft_id::text AS id, domain_id FROM draft_shares WHERE token = :token", token=token)
    return (rows[0]["id"], rows[0]["domain_id"]) if rows else (None, None)


def _view(data, area):
    """A teammate sees the organization name and only their own area."""
    if not area:
        return data
    return {"org_name": data.get("org_name", ""), "org_url": "", "language": data.get("language", "en"),
            "domain_ids": [area], "answers": _answers(data.get("answers"), [area]), "org_meta": None,
            "respondent": None, "org_links": None}


def answered_by(token, domain_ids, leader_role):
    """{area: role} at submit: the teammate's role for areas sent to a teammate, the leader's role for the rest.
    Only the leader's full draft token counts; a share token or no token attributes every area to the leader."""
    import db

    roles = {}
    if isinstance(token, str) and TOKEN.fullmatch(token):
        roles = {r["domain_id"]: r["role"] for r in db.query(
            "SELECT s.domain_id, s.role FROM draft_shares s JOIN drafts d ON d.id = s.draft_id "
            "WHERE d.token = :token AND s.role IS NOT NULL", token=token)}
    out = {d: roles.get(d) or leader_role for d in domain_ids if roles.get(d) or leader_role}
    return out or None


def _merge(draft_id, data=None, answers=None):
    """Replace the details (when `data`) and merge answers, atomically."""
    import db

    if data is not None:
        rows = db.query("UPDATE drafts SET data = CAST(:data AS jsonb) || jsonb_build_object('answers', "
                        "COALESCE(data->'answers', '{}'::jsonb) || CAST(:answers AS jsonb)), updated_at = now() "
                        "WHERE id = :id RETURNING data::text AS data",
                        data=json.dumps({k: v for k, v in data.items() if k != "answers"}),
                        answers=json.dumps(data["answers"]), id=draft_id)
    else:
        rows = db.query("UPDATE drafts SET data = jsonb_set(data, '{answers}', COALESCE(data->'answers', '{}'::jsonb) "
                        "|| CAST(:answers AS jsonb)), updated_at = now() WHERE id = :id RETURNING data::text AS data",
                        answers=json.dumps(answers), id=draft_id)
    return json.loads(rows[0]["data"])


@bp.route("/api/drafts", methods=["POST"])
def create():
    import db
    from app import body

    data = clean(body().get("data"))
    token = secrets.token_urlsafe(18)
    db.query("INSERT INTO drafts (id, token, owner, data) VALUES (:id, :token, :owner, CAST(:data AS jsonb))",
             id=str(uuid.uuid4()), token=token, owner=session.get("owner"), data=json.dumps(data))
    return jsonify(token=token), 201


@bp.route("/api/drafts/<token>")
def read(token):
    import db
    from app import error

    draft_id, area = _find(token)
    if not draft_id:
        return error("We could not find that saved assessment. Check the link and try again.", 404)
    data = json.loads(db.query("SELECT data::text AS data FROM drafts WHERE id = :id", id=draft_id)[0]["data"])
    return jsonify(data=_view(data, area), area=area)


@bp.route("/api/drafts/<token>", methods=["POST"])
def save(token):
    from app import body, error

    draft_id, shared_area = _find(token)
    if not draft_id:
        return error("We could not find that saved assessment. Check the link and try again.", 404)
    b = body()
    area = shared_area or b.get("area")
    if area:
        if area not in {d["id"] for d in _bank()}:
            return error("Unknown area.", 400)
        raw = b.get("data").get("answers") if isinstance(b.get("data"), dict) else None
        data = _merge(draft_id, answers=_answers(raw, [area]))
    else:
        data = _merge(draft_id, data=clean(b.get("data")))
    return jsonify(data=_view(data, shared_area), area=shared_area)


@bp.route("/api/drafts/<token>/share", methods=["POST"])
def share(token):
    """A link that answers only one area (for example Financial Management, for the bookkeeper), with the
    teammate's role for "Answered by" on the report."""
    import db
    from app import body, error
    from features.orgmeta import RESPONDENT_ROLES

    draft_id, shared_area = _find(token)
    if not draft_id or shared_area:
        return error("We could not find that saved assessment.", 404)
    area, role = body().get("area"), body().get("role")
    if area not in {d["id"] for d in _bank()}:
        return error("Unknown area.", 400)
    if role is not None and role not in RESPONDENT_ROLES:
        return error("Choose your teammate's role.", 400)
    rows = db.query("INSERT INTO draft_shares (token, draft_id, domain_id, role) VALUES (:token, :draft_id, :area, "
                    ":role) ON CONFLICT (draft_id, domain_id) DO UPDATE SET role = COALESCE(EXCLUDED.role, "
                    "draft_shares.role) RETURNING token, role", token=secrets.token_urlsafe(18), draft_id=draft_id,
                    area=area, role=role)
    return jsonify(token=rows[0]["token"], role=rows[0]["role"])
