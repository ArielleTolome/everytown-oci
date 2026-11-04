"""Report quality with a human in the loop (v1.7): "Does this feel right?" and the staff review queue.

The organization says whether each report section helped (one row per section; a repeat replaces it). CSF staff
see the answers across the network, mark reports reviewed or flag them with an issue from a fixed list, and spot
mistakes the reports keep making. Nothing here changes scores or the report.
"""
from flask import Blueprint, jsonify, session

bp = Blueprint("feedback", __name__)
SECTIONS = ("overall", "truths", "start_here", "plan", "roadmap", "coach")
ISSUES = ("wrong_facts", "too_big_for_size", "unclear", "tone", "other")
MAX_TEXT = 1000
STAMP = "to_char(%s AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC'"


def _text(raw, limit):
    """(trimmed text or None, error or None) for an optional free-text field."""
    if raw is None:
        return None, None
    if not isinstance(raw, str):
        return None, "Comments must be text."
    raw = raw.strip()
    if len(raw) > limit:
        return None, "Please keep it under %d characters." % limit
    return raw or None, None


def _open(sid):
    """(sub, None) for the submitting session or staff, else (None, error response). Same rule as coach.py."""
    from app import error, load
    from features.coach import _can_ask

    if not session.get("user"):
        return None, error("Please sign in.", 401)
    sub = load(sid)
    if not sub:
        return None, error("Report not found.", 404)
    if not _can_ask(sub["id"]):
        return None, error("Only the person who submitted this assessment, or Everytown staff, can do this.", 403)
    return sub, None


def _staff_error():
    from app import error

    if not session.get("user"):
        return error("Please sign in.", 401)
    if session["user"]["role"] != "staff":
        return error("This page is for Everytown staff.", 403)
    return None


def _feedback(sid):
    import db
    return db.query("SELECT section, helpful, comment, %s AS created FROM report_feedback "
                    "WHERE assessment_id = :assessment_id ORDER BY created_at, section" % (STAMP % "created_at"),
                    assessment_id=sid)


def _review(sid):
    import db
    rows = db.query("SELECT status, issue, note, reviewer, %s AS updated FROM report_reviews "
                    "WHERE assessment_id = :assessment_id" % (STAMP % "updated_at"), assessment_id=sid)
    return rows[0] if rows else None


@bp.route("/api/assessments/<sid>/feedback", methods=["GET", "POST"])
def feedback(sid):
    import db
    from app import body, error
    from flask import request

    sub, err = _open(sid)
    if err:
        return err
    staff = session["user"]["role"] == "staff"
    if request.method == "GET":
        return jsonify(feedback=_feedback(sub["id"]), review=_review(sub["id"]) if staff else None)
    if staff:  # one row per section with no author: a staff answer would replace the organization's own
        return error("Only the organization answers this. Staff use Mark reviewed or Flag instead.", 403)
    b = body()
    if b.get("section") not in SECTIONS:
        return error("Unknown report section.", 400)
    if not isinstance(b.get("helpful"), bool):
        return error("Say whether this part helped.", 400)
    comment, problem = _text(b.get("comment"), MAX_TEXT)
    if problem:
        return error(problem, 400)
    db.query("INSERT INTO report_feedback (assessment_id, section, helpful, comment) VALUES (:assessment_id, "
             ":section, :helpful, :comment) ON CONFLICT (assessment_id, section) DO UPDATE SET helpful = "
             "EXCLUDED.helpful, comment = EXCLUDED.comment, created_at = now()",
             assessment_id=sub["id"], section=b["section"], helpful=b["helpful"], comment=comment)
    # The report card asks for one part that felt off: any answer for the whole report (sent first), or a new part,
    # supersedes older not-helpful parts, so the staff queue never counts an answer the organization took back.
    if b["section"] == "overall" or not b["helpful"]:
        db.query("DELETE FROM report_feedback WHERE assessment_id = :assessment_id AND section NOT IN ('overall', "
                 ":section) AND NOT helpful", assessment_id=sub["id"], section=b["section"])
    return jsonify(feedback=_feedback(sub["id"]))


@bp.route("/api/staff/reviews/<sid>", methods=["POST"])
def review(sid):
    import db
    from app import body, error, load

    err = _staff_error()
    if err:
        return err
    sub = load(sid)
    if not sub:
        return error("Report not found.", 404)
    b = body()
    if b.get("status") not in ("reviewed", "flagged"):
        return error("Choose reviewed or flagged.", 400)
    issue = b.get("issue")
    if issue is not None and issue not in ISSUES or b["status"] == "flagged" and not issue:
        return error("Choose what is wrong from the list.", 400)
    note, problem = _text(b.get("note"), MAX_TEXT)
    if problem:
        return error(problem, 400)
    db.query("INSERT INTO report_reviews (assessment_id, status, issue, note, reviewer) VALUES (:assessment_id, "
             ":status, :issue, :note, :reviewer) ON CONFLICT (assessment_id) DO UPDATE SET status = EXCLUDED.status, "
             "issue = EXCLUDED.issue, note = EXCLUDED.note, reviewer = EXCLUDED.reviewer, updated_at = now()",
             assessment_id=sub["id"], status=b["status"], issue=issue, note=note, reviewer=session["user"]["name"])
    return jsonify(review=_review(sub["id"]))


@bp.route("/api/staff/quality")
def quality():
    import db

    err = _staff_error()
    if err:
        return err
    s = db.query(
        "SELECT (SELECT count(*) FROM assessments WHERE status = 'done') AS reports, "
        "(SELECT count(DISTINCT assessment_id) FROM report_feedback) AS with_feedback, "
        "(SELECT count(*) FILTER (WHERE helpful) FROM report_feedback) AS helpful, "
        "(SELECT count(*) FROM report_feedback) AS answers, "
        "(SELECT count(*) FROM report_reviews WHERE status = 'flagged') AS flagged, "
        "(SELECT count(*) FROM report_reviews WHERE status = 'reviewed') AS reviewed")[0]
    summary = {k: s[k] for k in ("reports", "with_feedback", "flagged", "reviewed")}
    summary["helpful_pct"] = round(100 * s["helpful"] / s["answers"]) if s["answers"] else None
    counts = {r["section"]: r for r in db.query(
        "SELECT section, count(*) FILTER (WHERE helpful) AS helpful, count(*) FILTER (WHERE NOT helpful) AS "
        "not_helpful FROM report_feedback GROUP BY section")}
    by_section = [{"section": k, "helpful": counts.get(k, {}).get("helpful", 0),
                   "not_helpful": counts.get(k, {}).get("not_helpful", 0)} for k in SECTIONS]
    recent = db.query(
        "SELECT f.assessment_id::text AS assessment_id, o.name AS org_name, f.section, f.helpful, f.comment, "
        "%s AS created FROM report_feedback f JOIN assessments a ON a.id = f.assessment_id "
        "JOIN organizations o ON o.id = a.org_id ORDER BY f.created_at DESC, f.section LIMIT 20" % (STAMP % "f.created_at"))
    # Reports with any "not quite" answer or a flag; not yet reviewed first, then flagged, then reviewed.
    queue = db.query(
        "WITH nh AS (SELECT assessment_id, count(*) FILTER (WHERE NOT helpful) AS n FROM report_feedback "
        "GROUP BY assessment_id) "
        "SELECT a.id::text AS assessment_id, o.name AS org_name, to_char(a.created_at, 'YYYY-MM-DD') AS created, "
        "COALESCE(nh.n, 0) AS not_helpful, r.status, r.issue FROM assessments a "
        "JOIN organizations o ON o.id = a.org_id LEFT JOIN nh ON nh.assessment_id = a.id "
        "LEFT JOIN report_reviews r ON r.assessment_id = a.id WHERE nh.n > 0 OR r.status = 'flagged' "
        "ORDER BY CASE WHEN r.status IS NULL THEN 0 WHEN r.status = 'flagged' THEN 1 ELSE 2 END, "
        "COALESCE(nh.n, 0) DESC, a.created_at DESC LIMIT 50")
    issues = db.query("SELECT issue, count(*) AS count FROM report_reviews WHERE status = 'flagged' "
                      "GROUP BY issue ORDER BY count(*) DESC, issue")
    return jsonify(summary=summary, by_section=by_section, recent=recent, queue=queue, issues=issues)


# ---------- synthetic seed data ----------

HELPFUL_COMMENTS = [None, None, None, "This matches what we see every day.", "Clear and easy to share with our board.",
                    "The first steps feel doable."]
NOT_QUITE = {
    "plan": ["We do not have an HR person, so the hiring steps do not fit us yet.",
             "The plan has too many steps at once."],
    "start_here": ["We already have a work plan. The first step should be something else."],
    "truths": ["It says we have no board policy, but we adopted one last month."],
    "roadmap": ["Twelve weeks is a lot for us. Smaller weekly steps would help."],
    "overall": ["Some of the words were hard to follow."],
    "coach": ["The answer was too general for our program."],
}
TOO_BIG = {"1-5": "Setting up an accounting system is too big for our 4-person team right now.",
           "6-10": "Hiring a finance manager is not realistic for our 8-person team. We need a smaller first step."}


def seed(rnd):
    """db.seed hook: synthetic "Does this feel right?" answers and 2 to 3 staff reviews on seeded reports only.
    Replaces earlier seed rows (re-seeding also removes them through ON DELETE CASCADE)."""
    import db

    db.query("DELETE FROM report_feedback WHERE assessment_id IN (SELECT id FROM assessments WHERE source = 'seed')")
    db.query("DELETE FROM report_reviews WHERE assessment_id IN (SELECT id FROM assessments WHERE source = 'seed')")
    rows = db.query("SELECT la.id::text AS id, o.staff_size FROM latest_assessments la "
                    "JOIN organizations o ON o.id = la.org_id WHERE la.source = 'seed' ORDER BY o.name")
    not_quite = []
    for r in rnd.sample(rows, min(12, len(rows))):
        for section in rnd.sample(SECTIONS, rnd.randint(2, 4)):
            # "Too big for our size" plan comments come from the smallest teams, as the director described.
            too_big = TOO_BIG.get(r["staff_size"]) if section == "plan" and rnd.random() < 0.6 else None
            helpful = not too_big and rnd.random() < 0.8
            comment = rnd.choice(HELPFUL_COMMENTS) if helpful else too_big or rnd.choice(NOT_QUITE[section])
            db.query("INSERT INTO report_feedback (assessment_id, section, helpful, comment, created_at) VALUES "
                     "(:assessment_id, :section, :helpful, :comment, LEAST(now(), (SELECT created_at FROM assessments "
                     "WHERE id = :assessment_id) + make_interval(hours => CAST(:h AS int))))",
                     assessment_id=r["id"], section=section, helpful=helpful, comment=comment, h=rnd.randint(1, 72))
            if not helpful:
                not_quite.append((r["id"], comment))
    not_quite.sort(key=lambda t: t[1] not in TOO_BIG.values())  # stable: a "too big" report gets the flag
    picked = list(dict.fromkeys(sid for sid, _ in not_quite))[:3]
    for i, sid in enumerate(picked):
        flagged = i == 0
        db.query("INSERT INTO report_reviews (assessment_id, status, issue, note, reviewer) VALUES (:assessment_id, "
                 ":status, :issue, :note, 'staff')", assessment_id=sid, status="flagged" if flagged else "reviewed",
                 issue="too_big_for_size" if flagged else None,
                 note="Plan asks a very small team for big systems. Check other small groups." if flagged else None)
