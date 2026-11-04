"""Where people stop (v1.7, staff only): drop-off in the assessment, from server-side saved drafts.

Only drafts saved to the server count (answers kept only in the browser are invisible here), and only once they
have a chosen area or an answer (an empty draft is not a start). A draft is submitted when its organization has any
assessment (matched by name, like db.name_key); abandoned when it is not submitted and has not been saved for
ABANDON_DAYS. An area is finished when every statement in it has an answer.
"""
import json

from flask import Blueprint, jsonify

bp = Blueprint("funnel", __name__)
ABANDON_DAYS = 3


@bp.before_request
def _staff_only():
    from features.feedback import _staff_error

    return _staff_error()


def summarize(drafts, bank):
    """drafts: [{"chosen": [area ids], "counts": {area: answered}, "submitted": bool, "stale": bool}]."""
    sizes = {d["id"]: len(d["questions"]) for d in bank}
    by_area = {d["id"]: {"domain_id": d["id"], "domain_name": d["name"], "started": 0, "finished": 0} for d in bank}
    last = {}
    drafts = [dr for dr in drafts if dr["chosen"] or any(dr["counts"].values())]
    out = {"started": len(drafts), "submitted": 0, "abandoned": 0}
    for dr in drafts:
        counts = {a: n for a, n in dr["counts"].items() if a in sizes}
        for a, n in counts.items():
            by_area[a]["started"] += n > 0
            by_area[a]["finished"] += n >= sizes[a]
        out["submitted"] += dr["submitted"]
        if dr["submitted"] or not dr["stale"]:
            continue
        out["abandoned"] += 1
        # The first chosen area (in questionnaire order) left unfinished is where they stopped.
        order = [d["id"] for d in bank if d["id"] in dr["chosen"]] or [d["id"] for d in bank if d["id"] in counts]
        stop = next((a for a in order if counts.get(a, 0) < sizes[a]), None)
        if stop:
            last[stop] = last.get(stop, 0) + 1
    out["by_area"] = list(by_area.values())
    out["last_area"] = sorted(({"domain_id": a, "domain_name": by_area[a]["domain_name"], "count": n}
                               for a, n in last.items()), key=lambda r: -r["count"])
    return out


@bp.route("/api/staff/funnel")
def funnel():
    import db
    from app import get_domains

    rows = db.query(
        "SELECT (d.data->'domain_ids')::text AS chosen, "
        "d.updated_at < now() - make_interval(days => CAST(:days AS int)) AS stale, "
        "EXISTS (SELECT 1 FROM organizations o JOIN assessments a ON a.org_id = o.id WHERE o.name_key = "
        "left(trim(both '-' from regexp_replace(lower(COALESCE(d.data->>'org_name', '')), '[^a-z0-9]+', '-', 'g')), 80)) "
        "AS submitted, "
        "(SELECT json_object_agg(area, n) FROM (SELECT regexp_replace(k, '[0-9]+$', '') AS area, count(*) AS n "
        " FROM jsonb_object_keys(CASE WHEN jsonb_typeof(d.data->'answers') = 'object' THEN d.data->'answers' "
        " ELSE '{}'::jsonb END) k GROUP BY 1) x)::text AS counts FROM drafts d", days=ABANDON_DAYS)
    drafts = []
    for r in rows:
        chosen = json.loads(r["chosen"] or "null")
        drafts.append({"chosen": chosen if isinstance(chosen, list) else [], "counts": json.loads(r["counts"] or "{}"),
                       "submitted": r["submitted"], "stale": r["stale"]})
    return jsonify(summarize(drafts, get_domains()))


# ---------- synthetic seed data ----------

SEED_OWNER = "seed"  # drafts.owner marks synthetic drafts, so re-seeding replaces only them
DRAFT_NAMES = ["Westlake Peace Builders", "Crescent Youth Outreach", "Birchwood North Mentors", "Elm Street Healers",
               "Southgate Credible Voices", "Harbor Light Re-entry", "Parkside Safe Streets", "Valley Hope Responders",
               "Northgate Neighbors United", "Clearwater Youth Circle"]


def seed(rnd):
    """db.seed hook: synthetic saved drafts, so staff can see where people stop. Most stop partway through an
    area (often a long one); a few belong to seeded organizations that went on to submit."""
    import secrets
    import uuid

    import db
    from app import PRIORITY_DOMAINS, get_domains

    db.query("DELETE FROM drafts WHERE owner = :owner", owner=SEED_OWNER)
    bank = get_domains()
    submitted = [r["name"] for r in db.query(
        "SELECT o.name FROM latest_assessments la JOIN organizations o ON o.id = la.org_id "
        "WHERE la.source = 'seed' ORDER BY o.name LIMIT 4")]
    for name in DRAFT_NAMES + submitted:
        done = name in submitted
        chosen = [d for d in bank if rnd.random() < 0.7 or d["id"] in PRIORITY_DOMAINS]
        stop = len(chosen) if done else rnd.randint(0, len(chosen) - 1)
        answers = {}
        for i, d in enumerate(chosen[:stop + 1]):
            qs = d["questions"] if i < stop else d["questions"][:rnd.randint(0, len(d["questions"]) - 1)]
            answers.update({q["id"]: rnd.choice(("yes", "no")) for q in qs})
        data = {"org_name": name, "org_url": "", "language": "en", "domain_ids": [d["id"] for d in chosen],
                "answers": answers, "org_meta": None, "respondent": None, "org_links": {"social": []}}
        db.query("INSERT INTO drafts (id, token, owner, data, updated_at) VALUES (:id, :token, :owner, "
                 "CAST(:data AS jsonb), now() - make_interval(days => CAST(:d AS int)))", id=str(uuid.uuid4()),
                 token=secrets.token_urlsafe(18), owner=SEED_OWNER, data=json.dumps(data),
                 d=rnd.randint(4, 30) if not done and rnd.random() < 0.8 else rnd.randint(0, 2))
