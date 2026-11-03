"""Connect me with similar groups: the organization asks CSF staff to introduce it to peers.

Only the request is stored (peer_requests). Matching happens on the staff side; organizations never see other
organizations' data, and CSF shares names only with consent.
"""
import json

from flask import Blueprint, jsonify, session

bp = Blueprint("peers_request", __name__)


def _save(sid):
    """Insert once (a repeat keeps the first date) and mirror {requested_at} into the document without rewriting it."""
    import db
    rows = db.query(
        "WITH r AS (INSERT INTO peer_requests (assessment_id) VALUES (:id) ON CONFLICT (assessment_id) "
        "DO UPDATE SET requested_at = peer_requests.requested_at RETURNING requested_at) "
        "UPDATE assessments SET doc = jsonb_set(doc, '{peer_request}', jsonb_build_object('requested_at', "
        "(SELECT to_char(requested_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC' FROM r))) "
        "WHERE id = :id RETURNING (doc->'peer_request')::text AS pr", id=sid)
    return json.loads(rows[0]["pr"])


@bp.route("/api/assessments/<sid>/peer-request", methods=["POST"])
def peer_request(sid):
    import db
    from app import error, load

    if not session.get("user"):
        return error("Please sign in.", 401)
    sub = load(sid)
    if not sub:
        return error("Report not found.", 404)
    # Same rule as /support: only the sign-in session that submitted it (staff connect people themselves).
    if not session.get("owner") or db.owner_of(sub["id"]) != session["owner"]:
        return error("Only the person who submitted this assessment can ask to be connected.", 403)
    return jsonify(peer_request=_save(sub["id"]))
