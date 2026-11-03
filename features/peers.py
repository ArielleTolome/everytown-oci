"""Peer matching for CSF staff (v1.0): which grantees are alike, computed in code from their latest assessments.

Similarity = 0.4 program model overlap + 0.3 size match + 0.3 shared growth priorities. The director asked that
benchmarks compare like with like ("only benchmark hospital programs against each other"), so the staff-only peer
percentile is ranked within an organization's primary program model. Organizations never see any of this.
"""
from flask import Blueprint, jsonify, session

bp = Blueprint("peers", __name__)
MODEL_WEIGHT, SIZE_WEIGHT, GAP_WEIGHT = 0.4, 0.3, 0.3
MIN_BENCHMARK_PEERS = 3  # fewer than this and a percentile says more about chance than about the organization
BOTH = {"Street outreach": "Both do street outreach", "Hospital-based violence intervention": "Both hospital-based",
        "Mentoring/youth development": "Both do mentoring or youth development",
        "Therapy/CBT": "Both offer therapy or CBT", "Re-entry support": "Both do re-entry support",
        "Other": "Both use another program model"}


@bp.before_request
def _staff_only():
    from app import error

    user = session.get("user")
    if not user:
        return error("Please sign in.", 401)
    if user["role"] != "staff":
        return error("This page is for Everytown staff.", 403)


def jaccard(a, b):
    a, b = set(a), set(b)
    return len(a & b) / len(a | b) if a | b else 0.0


def band_match(a, b, bands):
    """Same band 1, neighbouring band 0.5, otherwise (or unknown) 0."""
    if a not in bands or b not in bands:
        return 0.0
    gap = abs(bands.index(a) - bands.index(b))
    return 1.0 if gap == 0 else 0.5 if gap == 1 else 0.0


def similarity(a, b):
    """(score 0..1, plain reasons) for two organizations' latest assessments. Orgs are dicts from bi.load()."""
    from features.orgmeta import BUDGETS, STAFF_SIZES

    staff = band_match(a.get("staff_size"), b.get("staff_size"), STAFF_SIZES)
    budget = band_match(a.get("budget"), b.get("budget"), BUDGETS)
    a_gaps = [q for q, _ in a["gaps"]]
    b_gaps = {q for q, _ in b["gaps"]}
    score = (MODEL_WEIGHT * jaccard(a["program_models"], b["program_models"]) + SIZE_WEIGHT * max(staff, budget)
             + GAP_WEIGHT * jaccard(a_gaps, b_gaps))
    reasons = [BOTH[m] for m in a["program_models"] if m in b["program_models"] and m in BOTH]
    if staff == 1:
        reasons.append("Similar size: %s staff" % a["staff_size"])
    elif staff:
        reasons.append("Close in size: %s and %s staff" % tuple(sorted((a["staff_size"], b["staff_size"]),
                                                                       key=STAFF_SIZES.index)))
    if budget == 1:
        reasons.append("Similar budget: %s" % a["budget"])
    elif budget:
        reasons.append("Close in budget: %s and %s" % tuple(sorted((a["budget"], b["budget"]), key=BUDGETS.index)))
    shared = [q for q in a_gaps if q in b_gaps]  # in a's priority order, so the example is a's most urgent
    if shared:
        high_both = [q for q in shared if dict(a["gaps"])[q] == "High" and dict(b["gaps"])[q] == "High"]
        example = (high_both or shared)[0]
        reasons.append("Share 1 growth priority: %s" % example if len(shared) == 1
                       else "Share %d growth priorities incl. %s" % (len(shared), example))
    return round(score, 2), reasons


def top_peers(org, orgs, n=5):
    out = []
    for other in orgs:
        if other["id"] == org["id"]:
            continue
        score, reasons = similarity(org, other)
        if score > 0:
            out.append({"org": {"id": other["id"], "name": other["name"], "assessment_id": other["assessment_id"]},
                        "score": score, "reasons": reasons})
    return sorted(out, key=lambda p: (-p["score"], p["org"]["name"]))[:n]


def primary_model(org):
    return org["program_models"][0] if org["program_models"] else None


def benchmark(orgs):
    """Staff-only peer percentile per area, within the same primary program model (percent rank, like SQL's
    percent_rank). Sets stages[area]["percentile"] (None when fewer than MIN_BENCHMARK_PEERS peers)."""
    scores = {}
    for o in orgs:
        for d, r in o["stages"].items():
            scores.setdefault((primary_model(o), d), []).append(r["score"])
    for o in orgs:
        for d, r in o["stages"].items():
            peers = scores[(primary_model(o), d)]
            ok = primary_model(o) and len(peers) >= MIN_BENCHMARK_PEERS
            r["percentile"] = round(100 * sum(s < r["score"] for s in peers) / (len(peers) - 1)) if ok else None


def peer_groups(orgs, text):
    """Organizations with the same primary program model and staff size, and the growth priorities they share."""
    groups = {}
    for o in orgs:
        if primary_model(o) and o.get("staff_size"):
            groups.setdefault((primary_model(o), o["staff_size"]), []).append(o)
    out = []
    for (model, size), members in groups.items():
        if len(members) < 2:
            continue
        counts = {}
        for o in members:
            for q, _ in o["gaps"]:
                counts[q] = counts.get(q, 0) + 1
        shared = sorted(((q, n) for q, n in counts.items() if n >= 2), key=lambda x: (-x[1], x[0]))[:3]
        out.append({"program_model": model, "staff_size": size,
                    "members": [{"id": o["id"], "name": o["name"], "assessment_id": o["assessment_id"]}
                                for o in sorted(members, key=lambda o: o["name"])],
                    "shared_gaps": [{"question_id": q, "question_text": text.get(q, q), "orgs": n} for q, n in shared]})
    return sorted(out, key=lambda g: (-len(g["members"]), g["program_model"], g["staff_size"]))


def peer_requests(orgs):
    """Organizations that asked to be connected with similar groups (features/peers_request.py), with suggestions."""
    import db

    rows = db.query("SELECT pr.assessment_id::text AS assessment_id, to_char(pr.requested_at, 'YYYY-MM-DD') AS at "
                    "FROM peer_requests pr")
    asked = {r["assessment_id"]: r["at"] for r in rows}
    out = []
    for o in orgs:
        at = asked.get(o["assessment_id"]) or asked.get((o.get("prev") or {}).get("assessment_id"))
        if at:
            out.append({"org": {"id": o["id"], "name": o["name"], "assessment_id": o["assessment_id"]},
                        "requested_at": at, "suggestions": top_peers(o, orgs, 3)})
    return sorted(out, key=lambda r: r["requested_at"], reverse=True)


def seed(rnd):
    """db.seed hook: a few seeded organizations ask to be connected, so staff see suggested matches."""
    import db

    rows = db.query("SELECT la.id::text AS id FROM latest_assessments la JOIN organizations o ON o.id = la.org_id "
                    "WHERE la.source = 'seed' ORDER BY o.name")
    for r in rnd.sample(rows, min(4, len(rows))):
        db.query("INSERT INTO peer_requests (assessment_id, requested_at) VALUES (CAST(:a AS uuid), "
                 "now() - make_interval(days => CAST(:d AS int))) ON CONFLICT DO NOTHING", a=r["id"], d=rnd.randint(0, 20))


@bp.route("/api/staff/peers/<org_id>")
def peers_of(org_id):
    from app import error
    from features import bi

    orgs = bi.load()
    org = next((o for o in orgs if o["id"] == org_id), None)
    if not org:
        return error("Organization not found.", 404)
    return jsonify(org={"id": org["id"], "name": org["name"]}, peers=top_peers(org, orgs))
