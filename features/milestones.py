"""Your 12-week roadmap: the report's priorities as weekly steps, with progress, points and badges.

Fixed code builds the roadmap from the checked report, or from the engine's own ranking and next steps when there
is no AI report (seed records, a failed AI step). No model call. Only progress is stored (`roadmap_tasks`).
Gamification rewards follow-through only, never answers or stages, and an organization sees only its own progress.
"""
import json
import re
from datetime import datetime, timedelta, timezone

from flask import Blueprint, Response, jsonify, session

bp = Blueprint("milestones", __name__)

WEEKS = 12
MAX_TASKS = 5
UNLOCK_AFTER = timedelta(days=7)
TASK_POINTS, WEEK_POINTS = 10, 25
DEFAULT_OWNER = "Leadership team"
ENGINE_WHY = "Your answers show this is one of your growth priorities."
CHECK_IN = "Meet with your team for 20 minutes: what did you finish, and what comes next?"
RETAKE = "Retake the OCI to see your progress"
LEVELS = ((0, "Getting started"), (25, "Building"), (50, "Growing"), (75, "Leading"))  # by % of steps done
BADGES = (
    ("first-step", "First step", "Finish your first step."),
    ("week-one", "Week one done", "Finish every step in week 1."),
    ("foundation", "Foundation builder", "Finish every step for your Start here priorities."),
    ("on-a-roll", "On a roll", "Get steps done 3 weeks in a row."),
    ("halfway", "Halfway there", "Finish 6 of the 12 weeks."),
    ("complete", "Roadmap complete", "Finish every action step in all 12 weeks."),
    ("retake", "Ready to retake", "Retake the OCI to see your progress."),
)
CHEERS = (
    "Small steps add up. Every step you finish makes your organization stronger.",
    "You do not have to do it all at once. One week at a time is how real change happens.",
    "Your team is building something that lasts. Keep going.",
    "Progress, not perfection. Check off what you can and carry the rest forward.",
)
UTC = timezone.utc


def _steps(value):
    if isinstance(value, str):
        value = value.split("\n")
    return [s.strip() for s in value or [] if isinstance(s, str) and s.strip()]


def _item(g):
    return {"title": "Work on: " + g["question_text"], "why": ENGINE_WHY, "gap_ids": [g["question_id"]],
            "steps": _steps(g.get("next_steps")), "resource": None, "owner": DEFAULT_OWNER, "lang": "en"}


def engine_report(sub):
    """Start here and a 30/60/90 plan from the engine alone: code's choice of focus, the engine's next steps."""
    import pipeline
    gaps = sub.get("gaps") or []
    focus = pipeline.choose_focus(gaps)
    chosen = {g["question_id"] for g in focus}
    rest = [g for g in gaps if g["question_id"] not in chosen][:8]
    horizons = (30, 30, 60, 60, 60, 90, 90, 90)
    return {"focus": [_item(g) for g in focus],
            "plan": [dict(_item(g), horizon=horizons[i]) for i, g in enumerate(rest)]}


def _resource(items):
    """The first item's vetted resource, else a catalog resource for its area."""
    import pipeline
    for it in items:
        if it.get("resource"):
            return it["resource"]
    for it in items:
        for d in (re.sub(r"\d+$", "", i) for i in it.get("gap_ids") or []):
            r = next((r for r in pipeline.CATALOG.values() if d in r.get("domains", [])), None)
            if r:
                return {"title": r["title"], "url": r["url"]}
    return None


def _spread(n, items, spare, gaps):
    """The items' steps in order, split over n weeks (about 2 to 4 a week, at most MAX_TASKS)."""
    if not items and spare:
        items.append(spare.pop(0))
    pool, seen = [], set()

    def add(item, text, lang):
        if text.lower() not in seen:
            seen.add(text.lower())
            pool.append((item, text, lang))

    for it in items:
        for s in _steps(it.get("steps")):
            add(it, s, it["lang"])
    for it in items:  # too few steps: the engine's next steps for the same statements
        for gid in it.get("gap_ids") or []:
            for s in _steps(gaps.get(gid, {}).get("next_steps")):
                if len(pool) < 2 * n:
                    add(it, s, "en")
    while len(pool) < n and spare:  # not even one step a week: the next growth priority the plan did not cover
        it = spare.pop(0)
        for s in it["steps"]:
            add(it, s, "en")
    size, extra = divmod(len(pool), n)
    chunks, start = [], 0
    for i in range(n):
        end = start + size + (i < extra)
        chunks.append(pool[start:end][:MAX_TASKS])
        start = end
    return chunks


def build_roadmap(sub):
    """12 weeks, rebuilt identically from the same assessment: weeks 1-2 and 3-4 are the Start here priorities,
    then the plan by horizon (30 days: weeks 5-6, 60: 7-9, 90: 10-12). Week 12 ends with the retake."""
    report = sub.get("report")
    ai = bool(report and report.get("plan"))
    lang = sub.get("language") or "en"
    if ai:
        focus = [dict(f, owner=DEFAULT_OWNER, lang=lang) for f in report.get("focus") or []]
        plan = [dict(p, lang=lang) for p in report["plan"]]
    else:
        fallback = engine_report(sub)
        focus, plan = fallback["focus"], fallback["plan"]
    gaps = {g["question_id"]: g for g in sub.get("gaps") or []}
    cited = {i for it in focus + plan for i in it.get("gap_ids") or []}
    spare = [_item(g) for g in sub.get("gaps") or [] if g["question_id"] not in cited]
    groups = [((1, 2), focus[:1], True)]
    if len(focus) > 1:
        groups.append(((3, 4), focus[1:2], True))
    by = lambda h: [p for p in plan if p.get("horizon") == h]  # noqa: E731
    groups += [((5, 6) if len(focus) > 1 else (3, 4, 5, 6), by(30), False), ((7, 8, 9), by(60), False),
               ((10, 11, 12), by(90), False)]
    weeks, lead = [], None
    for nums, items, is_focus in groups:
        for n, chunk in zip(nums, _spread(len(nums), list(items), spare, gaps)):
            if n == WEEKS:
                chunk = chunk[:MAX_TASKS - 1]
            lead = chunk[0][0] if chunk else lead
            tasks = [{"id": "w%d-%d" % (n, j + 1), "text": text, "gap_ids": list(it.get("gap_ids") or []),
                      "owner": it.get("owner") or DEFAULT_OWNER, "lang": tl} for j, (it, text, tl) in enumerate(chunk)]
            if not tasks:  # a very short assessment: nothing left to spread
                tasks = [{"id": "w%d-1" % n, "text": CHECK_IN, "gap_ids": [], "owner": DEFAULT_OWNER, "lang": "en"}]
            if n == WEEKS:
                tasks.append({"id": "w%d-%d" % (n, len(tasks) + 1), "text": RETAKE, "gap_ids": [],
                              "owner": DEFAULT_OWNER, "lang": "en", "retake": True})
            weeks.append({"n": n, "focus": is_focus,
                          "title": lead["title"] if lead else "Check in with your team",
                          "why": (lead or {}).get("why") or ENGINE_WHY, "lang": lead["lang"] if lead else "en",
                          "resource": _resource([c[0] for c in chunk] or ([lead] if lead else [])),
                          "tasks": tasks})
    # A priority spread over two weeks would show the same title twice; mark the follow-on week.
    for prev, w in zip(weeks, weeks[1:]):
        if w["title"] == prev["title"].removesuffix(" (continued)"):
            w["title"] += " (continued)"
    return {"ai": ai, "weeks": weeks}


def progress(roadmap, done, created, now):
    """Unlocks, counts, points, streaks, badges and level. `done` maps task id to when it was finished.

    Week 1 opens at once; week N+1 opens when week N is finished or 7 days after week N opened, whichever is first.
    A finished step proves its week was open, so unticking never locks a week again."""
    weeks, unlock = [], created
    for w in roadmap["weeks"]:
        times = [done[t["id"]] for t in w["tasks"] if t["id"] in done]
        if times:
            unlock = min(unlock, min(times))
        complete = max(times) if len(times) == len(w["tasks"]) else None
        state = "done" if complete else "open" if unlock <= now else "locked"
        weeks.append(dict(w, state=state, unlocks_at=unlock, done_count=len(times),
                          tasks=[dict(t, done=t["id"] in done) for t in w["tasks"]]))
        unlock = min(unlock + UNLOCK_AFTER, max(complete, unlock)) if complete else unlock + UNLOCK_AFTER
    total = sum(len(w["tasks"]) for w in weeks)
    n_done = sum(w["done_count"] for w in weeks)
    weeks_done = sum(w["state"] == "done" for w in weeks)
    active = [w["done_count"] > 0 for w in weeks]
    best = run = 0
    for a in active:
        run = run + 1 if a else 0
        best = max(best, run)
    k = max([i for i, w in enumerate(weeks) if w["state"] != "locked"] or [0])
    if not active[k] and k > 0:
        k -= 1  # the newest open week is not over yet, so it does not break the streak
    streak = 0
    while k >= 0 and active[k]:
        streak, k = streak + 1, k - 1
    pct = round(100 * n_done / total) if total else 0
    level = [name for floor, name in LEVELS if pct >= floor][-1]
    nxt = next(((floor, name) for floor, name in LEVELS if pct < floor), None)
    tasks = [t for w in weeks for t in w["tasks"]]
    focus_weeks = [w for w in weeks if w["focus"]]
    earned = {
        "first-step": n_done >= 1,
        "week-one": weeks[0]["state"] == "done",
        "foundation": bool(focus_weeks) and all(w["state"] == "done" for w in focus_weeks),
        "on-a-roll": best >= 3,
        "halfway": weeks_done >= 6,
        "complete": all(t["done"] for t in tasks if not t.get("retake")),
        "retake": any(t["done"] for t in tasks if t.get("retake")),
    }
    locked = next((w for w in weeks if w["state"] == "locked"), None)
    return {
        "ai": roadmap["ai"], "weeks": weeks, "total_tasks": total, "done_tasks": n_done, "weeks_done": weeks_done,
        "pct": pct,
        "points": TASK_POINTS * n_done + WEEK_POINTS * weeks_done, "level": level,
        "next_level": {"name": nxt[1], "steps": max(1, -(-nxt[0] * total // 100) - n_done)} if nxt else None,
        "streak": streak, "best_streak": best,
        "badges": [{"id": b, "name": name, "description": text, "earned": earned[b]} for b, name, text in BADGES],
        "current_week": next((w["n"] for w in weeks if w["state"] == "open"), None),
        "next_unlock": {"week": locked["n"], "date": locked["unlocks_at"].strftime("%Y-%m-%d")} if locked else None,
    }


# ---------- storage ----------

def _created(sub):
    try:
        return datetime.strptime(sub.get("created", ""), "%Y-%m-%d %H:%M UTC").replace(tzinfo=UTC)
    except ValueError:
        return datetime.now(UTC)


def _stored(sid):
    import db
    rows = db.query("SELECT task_id, to_char(done_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS') AS done_at "
                    "FROM roadmap_tasks WHERE assessment_id = :assessment_id", assessment_id=sid)
    return {r["task_id"]: datetime.fromisoformat(r["done_at"]).replace(tzinfo=UTC) if r["done_at"] else None
            for r in rows}


def _tasks_json(roadmap, done=None):
    return json.dumps([{"id": t["id"], "week": w["n"],
                        "done_at": done[t["id"]].isoformat() if done and t["id"] in done else None}
                       for w in roadmap["weeks"] for t in w["tasks"]])


def _insert(sid, roadmap, done=None):
    import db
    db.query("INSERT INTO roadmap_tasks (assessment_id, task_id, week, done_at) "
             "SELECT :assessment_id, t->>'id', CAST(t->>'week' AS int), CAST(t->>'done_at' AS timestamptz) "
             "FROM jsonb_array_elements(CAST(:tasks AS jsonb)) t ON CONFLICT DO NOTHING",
             assessment_id=sid, tasks=_tasks_json(roadmap, done))


def _state(sub, now=None):
    """Build the roadmap, store its task rows the first time (or after a retried report changed it), and score it."""
    import db
    roadmap = build_roadmap(sub)
    stored = _stored(sub["id"])
    ids = {t["id"] for w in roadmap["weeks"] for t in w["tasks"]}
    if ids != set(stored):
        _insert(sub["id"], roadmap)
        db.query("DELETE FROM roadmap_tasks WHERE assessment_id = :assessment_id AND task_id NOT IN "
                 "(SELECT t->>'id' FROM jsonb_array_elements(CAST(:tasks AS jsonb)) t)",
                 assessment_id=sub["id"], tasks=_tasks_json(roadmap))
    done = {k: v for k, v in stored.items() if v and k in ids}
    return roadmap, done, progress(roadmap, done, _created(sub), now or datetime.now(UTC))


# ---------- API ----------

@bp.before_request
def _signed_in():
    if not session.get("user"):
        from app import error
        return error("Please sign in.", 401)


def _staff():
    return session["user"]["role"] == "staff"


def _open(sid):
    """(sub, None) when this session may use the roadmap, else (None, error response). Same rule as coach.py."""
    from app import error, load
    import db
    sub = load(sid)
    if not sub:
        return None, error("Report not found.", 404)
    if not _staff() and (not session.get("owner") or db.owner_of(sub["id"]) != session["owner"]):
        return None, error("Only the person who submitted this assessment, or Everytown staff, can see its roadmap.",
                           403)
    if sub["status"] == "running":
        return None, error("Your roadmap will be ready when your report is.", 409)
    return sub, None


def _view(sub, state):
    """What the browser gets: locked weeks show only their title and opening date, except to staff."""
    staff = _staff()
    weeks = []
    for w in state["weeks"]:
        out = {"n": w["n"], "title": w["title"], "lang": w["lang"], "focus": w["focus"], "state": w["state"],
               "unlocks_on": w["unlocks_at"].strftime("%Y-%m-%d"), "done_count": w["done_count"],
               "task_count": len(w["tasks"])}
        if staff or w["state"] != "locked":
            out.update(why=w["why"], resource=w["resource"], tasks=w["tasks"])
        weeks.append(out)
    shown = {i for w in weeks for t in w.get("tasks", []) for i in t["gap_ids"]}
    return dict({k: v for k, v in state.items() if k != "weeks"}, weeks=weeks, assessment_id=sub["id"],
                org_name=sub["org_name"], language=sub.get("language") or "en", staff=staff,
                statements={g["question_id"]: g["question_text"] for g in sub.get("gaps") or []
                            if g["question_id"] in shown})


@bp.route("/api/assessments/<sid>/roadmap")
def get_roadmap(sid):
    sub, err = _open(sid)
    if err:
        return err
    return jsonify(_view(sub, _state(sub)[2]))


@bp.route("/api/assessments/<sid>/roadmap/tasks/<task_id>", methods=["POST"])
def set_task(sid, task_id):
    """{done: bool}. Returns the new state plus what to celebrate: weeks finished, points gained, new badges."""
    from app import body, error
    import db
    sub, err = _open(sid)
    if err:
        return err
    done_flag = body().get("done")
    if not isinstance(done_flag, bool):
        return error("Send done: true or false.", 400)
    roadmap, done, before = _state(sub)
    week = next((w for w in before["weeks"] for t in w["tasks"] if t["id"] == task_id), None)
    if not week:
        return error("Step not found.", 404)
    if week["state"] == "locked" and not _staff():
        return error("This week is not open yet. It opens on %s." % week["unlocks_at"].strftime("%B %-d"), 403)
    now = datetime.now(UTC)
    db.query("UPDATE roadmap_tasks SET done_at = CASE WHEN :done THEN COALESCE(done_at, now()) ELSE NULL END "
             "WHERE assessment_id = :assessment_id AND task_id = :task_id",
             done=done_flag, assessment_id=sub["id"], task_id=task_id)
    if done_flag:
        done.setdefault(task_id, now)
    else:
        done.pop(task_id, None)
    after = progress(roadmap, done, _created(sub), now)
    was = {w["n"]: w["state"] for w in before["weeks"]}
    had = {b["id"] for b in before["badges"] if b["earned"]}
    celebrate = {"weeks": [w["n"] for w in after["weeks"] if w["state"] == "done" and was[w["n"]] != "done"],
                 "opened": [w["n"] for w in after["weeks"] if w["state"] != "locked" and was[w["n"]] == "locked"],
                 "points": after["points"] - before["points"],
                 "badges": [b["name"] for b in after["badges"] if b["earned"] and b["id"] not in had]}
    return jsonify(dict(_view(sub, after), celebrate=celebrate))


@bp.route("/api/assessments/<sid>/roadmap/week/<int:n>.pdf")
def week_pdf(sid, n):
    from app import error
    sub, err = _open(sid)
    if err:
        return err
    state = _state(sub)[2]
    week = next((w for w in state["weeks"] if w["n"] == n), None)
    if not week:
        return error("There is no week %d." % n, 404)
    if week["state"] == "locked" and not _staff():
        return error("This week is not open yet.", 403)
    slug = "".join(c if c.isalnum() else "-" for c in sub["org_name"]).strip("-")[:60] or "organization"
    return Response(build_week_pdf(sub, week, state), mimetype="application/pdf",
                    headers={"Content-Disposition": 'attachment; filename="OCI-roadmap-week-%d-%s.pdf"' % (n, slug)})


@bp.route("/api/staff/roadmaps")
def staff_roadmaps():
    """Staff only: follow-through per organization (its newest assessment with a roadmap). Never shown to grantees."""
    from app import error
    import db
    if not _staff():
        return error("This page is for Everytown staff.", 403)
    rows = db.query(
        "WITH per AS (SELECT assessment_id, count(*) AS total, count(done_at) AS tasks_done, max(done_at) AS last_at "
        "FROM roadmap_tasks GROUP BY assessment_id), "
        "wk AS (SELECT assessment_id, count(*) AS weeks_done FROM (SELECT assessment_id, week FROM roadmap_tasks "
        "GROUP BY assessment_id, week HAVING count(*) = count(done_at)) w GROUP BY assessment_id) "
        "SELECT DISTINCT ON (a.org_id) o.id::text AS org_id, o.name AS org_name, a.id::text AS assessment_id, "
        "a.source, to_char(a.created_at, 'YYYY-MM-DD') AS assessed, per.total, per.tasks_done, "
        "COALESCE(wk.weeks_done, 0) AS weeks_done, to_char(per.last_at, 'YYYY-MM-DD') AS last_activity "
        "FROM per JOIN assessments a ON a.id = per.assessment_id JOIN organizations o ON o.id = a.org_id "
        "LEFT JOIN wk ON wk.assessment_id = per.assessment_id ORDER BY a.org_id, a.created_at DESC")
    for r in rows:
        r["weeks_total"] = WEEKS
        r["pct"] = round(100 * r["tasks_done"] / r["total"]) if r["total"] else 0
        r["points"] = TASK_POINTS * r["tasks_done"] + WEEK_POINTS * r["weeks_done"]
    rows.sort(key=lambda r: (-r["pct"], r["org_name"]))
    return jsonify(roadmaps=rows)


# ---------- weekly PDF ----------

def build_week_pdf(sub, week, state):
    """One printable page: the week's steps with empty boxes, owners, the resource and progress so far."""
    import os
    from fpdf import FPDF
    import report

    pdf = FPDF(format="Letter")
    for style, suffix in (("", "Regular"), ("B", "Bold"), ("I", "Italic")):
        pdf.add_font(report.FONT, style, os.path.join(report.FONT_DIR, "AtkinsonHyperlegible-%s.ttf" % suffix))
    pdf.add_font("NotoMath", "", os.path.join(report.FONT_DIR, "NotoSansMath-Regular.ttf"))
    pdf.set_fallback_fonts(["NotoMath"], exact_match=False)
    lang = week.get("lang") or "en"
    pdf.set_title("Week %d of %d: %s" % (week["n"], WEEKS, week["title"]))
    pdf.set_author("Community Safety Fund | Everytown for Gun Safety")
    pdf.set_subject("OCI Capacity Coach: your 12-week roadmap, %s" % sub["org_name"])
    pdf.set_creator("OCI Capacity Coach")
    pdf.set_lang(lang)
    pdf.set_margins(20, 16, 20)
    pdf.set_auto_page_break(True, margin=16)
    pdf.add_page()
    width = pdf.w - pdf.l_margin - pdf.r_margin

    def text(t, size=11, style="", color=report.INK, h=6, indent=0):
        pdf.set_font(report.FONT, style, size)
        pdf.set_text_color(*color)
        pdf.set_x(pdf.l_margin + indent)
        pdf.multi_cell(width - indent, h, t, align="L", new_x="LMARGIN", new_y="NEXT")

    text(report.HEADER, 9, color=report.MUTED, h=5)
    pdf.set_draw_color(*report.ACCENT)
    pdf.line(pdf.l_margin, pdf.get_y() + 1, pdf.w - pdf.r_margin, pdf.get_y() + 1)
    pdf.ln(5)
    text("YOUR 12-WEEK ROADMAP · WEEK %d OF %d" % (week["n"], WEEKS), 10, "B", report.LINK, 5)
    text(week["title"], 19, "B", report.ACCENT, 9)
    text("%s · Opened %s" % (sub["org_name"], week["unlocks_at"].strftime("%B %-d, %Y")), 10.5, color=report.MUTED)
    pdf.ln(3)
    text("Why this matters", 13, "B", report.ACCENT, 7)
    text(week["why"])
    statements = {g["question_id"]: g["question_text"] for g in sub.get("gaps") or []}
    based = [statements[i] for i in dict.fromkeys(i for t in week["tasks"] for i in t["gap_ids"]) if i in statements]
    if based:
        pdf.ln(1.5)
        text("Based on your answers to:", 10, "B", report.MUTED, 5.5)
        for s in based:
            text("•  " + s, 10, color=report.MUTED, indent=2, h=5.5)
    pdf.ln(3)
    text("This week's steps", 13, "B", report.ACCENT, 7)
    for t in week["tasks"]:
        pdf.ln(1.5)
        y = pdf.get_y()
        pdf.set_draw_color(*report.ACCENT)
        pdf.set_line_width(0.4)
        pdf.rect(pdf.l_margin, y + 0.8, 5, 5)
        if t["done"]:  # a tick, so a printout shows what is already finished
            pdf.line(pdf.l_margin + 1, y + 3.4, pdf.l_margin + 2.2, y + 4.8)
            pdf.line(pdf.l_margin + 2.2, y + 4.8, pdf.l_margin + 4.2, y + 1.8)
        pdf.set_line_width(0.2)
        text(t["text"] + ("  (done)" if t["done"] else ""), 11.5, "B", indent=9, h=6.5)
        text("Owner: " + t["owner"], 9.5, color=report.MUTED, indent=9, h=5)
    if week.get("resource"):
        pdf.ln(3)
        text("Resource", 13, "B", report.ACCENT, 7)
        text(week["resource"]["title"], 11)
        pdf.set_font(report.FONT, "", 10.5)
        pdf.set_text_color(*report.LINK)
        pdf.cell(0, 6, week["resource"]["url"], link=week["resource"]["url"], new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    pdf.set_font(report.FONT, "", 11)
    pdf.set_text_color(*report.INK)
    pdf.set_fill_color(*report.CALLOUT_FILL)
    pdf.set_draw_color(*report.ACCENT)
    pdf.multi_cell(0, 6.5, "Progress so far: %d of %d steps done (%d%%), %d of %d weeks finished. %d points. "
                   "Level: %s." % (state["done_tasks"], state["total_tasks"], state["pct"], state["weeks_done"], WEEKS,
                                   state["points"], state["level"]),
                   border=1, fill=True, padding=3, align="L", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)
    text(CHEERS[week["n"] % len(CHEERS)], 11.5, "I", report.ACCENT)
    pdf.ln(2)
    text("Check off steps on your roadmap page to track your progress. Generated from synthetic data for the AWS "
         "Breaking Barriers demo.", 9, color=report.MUTED, h=5)
    return bytes(pdf.output())


# ---------- synthetic seed data ----------

def _simulate(roadmap, created, now, rnd):
    """Plausible follow-through that obeys the unlock rules: steps get done only in open weeks, effort fades."""
    effort = rnd.choice([0.0, 0.35, 0.6, 0.8, 0.95])
    done, unlock = {}, created
    for w in roadmap["weeks"]:
        if unlock > now:
            break
        times = []
        for t in w["tasks"]:
            at = unlock + timedelta(hours=rnd.uniform(2, 6 * 24))
            if rnd.random() < effort and at < now:
                done[t["id"]] = at
                times.append(at)
        complete = len(times) == len(w["tasks"])
        unlock = min(unlock + UNLOCK_AFTER, max(times)) if complete else unlock + UNLOCK_AFTER
        effort *= 0.93
    return done


def seed(rnd):
    """Called by `python3 -m db seed`: synthetic roadmap progress for every seed assessment (deterministic rnd)."""
    import db
    now = datetime.now(UTC)
    for r in db.query("SELECT id::text AS id FROM assessments WHERE source = 'seed' ORDER BY created_at, id"):
        sub = db.get(r["id"])
        roadmap = build_roadmap(sub)
        db.query("DELETE FROM roadmap_tasks WHERE assessment_id = :assessment_id", assessment_id=sub["id"])
        _insert(sub["id"], roadmap, _simulate(roadmap, _created(sub), now, rnd))
