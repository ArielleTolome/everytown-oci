"""12-week roadmap: built the same way every time, weeks open on finish or after 7 days, points and badges reward
follow-through only, and only the submitting session or staff may see or tick it."""
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app  # noqa: E402
from features import milestones as m  # noqa: E402

SID = "22222222-2222-2222-2222-222222222222"
T0 = datetime(2026, 11, 3, 17, 0, tzinfo=timezone.utc)


def gap(qid, n=3):
    return {"question_id": qid, "domain_id": qid[:2], "domain_name": qid[:2], "stage": 1, "stage_name": "Seeding",
            "priority": "High", "question_text": "Statement %s." % qid,
            "next_steps": ["%s engine step %d" % (qid, i) for i in range(n)]}


def item(title, ids, steps, horizon=None):
    out = {"title": title, "why": "Why " + title, "gap_ids": ids, "steps": steps, "resource": None}
    if horizon:
        out.update(horizon=horizon, owner="Executive director")
    return out


GAPS = [gap("PL2"), gap("FM4"), gap("PL3"), gap("ML3"), gap("FR5"), gap("PL7"), gap("ML8")]
REPORT = {"summary": "s", "strengths": [], "conversation": [], "sources": [],
          "focus": [item("Work plan", ["PL2"], ["a1", "a2", "a3", "a4"]), item("Cash plan", ["FM4"], ["b1", "b2", "b3"])],
          "plan": [item("Goals", ["PL3"], ["c1", "c2", "c3"], 30), item("Outcomes", ["ML3"], ["d1", "d2"], 60),
                   item("Funding", ["FR5"], ["e1", "e2", "e3"], 60), item("Documents", ["PL7"], ["f1"], 90),
                   item("Data review", ["ML8"], ["g1", "g2", "g3", "g4"], 90)]}
SUB = {"id": SID, "status": "done", "language": "en", "org_name": "Playwright Roadmap Org", "created": "2026-11-03 17:00 UTC",
       "domain_ids": ["PL", "FM", "ML", "FR"], "gaps": GAPS, "report": REPORT}


def finish(roadmap, weeks, at):
    return {t["id"]: at for w in roadmap["weeks"] if w["n"] in weeks for t in w["tasks"]}


class Builder(unittest.TestCase):
    def test_same_assessment_same_roadmap(self):
        self.assertEqual(m.build_roadmap(SUB), m.build_roadmap(SUB))

    def test_layout_follows_focus_then_horizons(self):
        weeks = m.build_roadmap(SUB)["weeks"]
        self.assertEqual([w["n"] for w in weeks], list(range(1, 13)))
        self.assertEqual([w["title"] for w in weeks[:4]], ["Work plan", "Work plan (continued)", "Cash plan", "Cash plan (continued)"])
        self.assertEqual([t["text"] for w in weeks[:2] for t in w["tasks"]], ["a1", "a2", "a3", "a4"])
        self.assertEqual({w["title"].removesuffix(" (continued)") for w in weeks[4:6]}, {"Goals"})
        self.assertTrue(all(w["focus"] for w in weeks[:4]) and not any(w["focus"] for w in weeks[4:]))
        self.assertEqual(weeks[11]["tasks"][-1]["text"], m.RETAKE)
        self.assertTrue(all(1 <= len(w["tasks"]) <= m.MAX_TASKS for w in weeks))
        ids = [t["id"] for w in weeks for t in w["tasks"]]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(weeks[2]["tasks"][0]["id"], "w3-1")

    def test_one_focus_moves_the_plan_up(self):
        sub = dict(SUB, report=dict(REPORT, focus=REPORT["focus"][:1]))
        weeks = m.build_roadmap(sub)["weeks"]
        self.assertEqual(weeks[2]["title"], "Goals")
        self.assertFalse(weeks[2]["focus"])

    def test_no_ai_report_uses_engine_choice_and_next_steps(self):
        sub = dict(SUB, report=None)
        r = m.build_roadmap(sub)
        self.assertFalse(r["ai"])
        self.assertEqual(r["weeks"][0]["title"], "Work on: Statement PL2.")
        self.assertEqual(r["weeks"][0]["tasks"][0]["text"], "PL2 engine step 0")
        self.assertEqual(r["weeks"][2]["tasks"][0]["gap_ids"], ["FM4"])  # choose_focus: best gap from another area


class Progress(unittest.TestCase):
    def setUp(self):
        self.r = m.build_roadmap(SUB)

    def state(self, done, now):
        return m.progress(self.r, done, T0, now)

    def test_week_one_open_rest_locked(self):
        s = self.state({}, T0 + timedelta(hours=1))
        self.assertEqual([w["state"] for w in s["weeks"][:3]], ["open", "locked", "locked"])
        self.assertEqual(s["current_week"], 1)
        self.assertEqual(s["next_unlock"], {"week": 2, "date": "2026-11-10"})

    def test_finishing_a_week_opens_the_next_at_once(self):
        s = self.state(finish(self.r, {1}, T0 + timedelta(days=1)), T0 + timedelta(days=1, hours=1))
        self.assertEqual([w["state"] for w in s["weeks"][:3]], ["done", "open", "locked"])
        self.assertEqual(s["next_unlock"]["date"], "2026-11-11")  # week 3: 7 days after week 2 opened

    def test_seven_day_clock_opens_a_week_without_finishing(self):
        before = self.state({}, T0 + timedelta(days=6, hours=23))
        after = self.state({}, T0 + timedelta(days=7))
        self.assertEqual(before["weeks"][1]["state"], "locked")
        self.assertEqual(after["weeks"][1]["state"], "open")
        self.assertEqual(self.state({}, T0 + timedelta(days=14))["weeks"][2]["state"], "open")

    def test_unticking_never_relocks_a_week(self):
        done = finish(self.r, {1}, T0 + timedelta(days=1))
        done["w2-1"] = T0 + timedelta(days=2)
        done.pop("w1-1")
        s = self.state(done, T0 + timedelta(days=3))
        self.assertEqual(s["weeks"][1]["state"], "open")

    def test_points_level_and_badges(self):
        done = finish(self.r, {1, 2, 3}, T0 + timedelta(days=1))
        s = self.state(done, T0 + timedelta(days=2))
        n = sum(len(w["tasks"]) for w in self.r["weeks"][:3])
        self.assertEqual(s["points"], 10 * n + 25 * 3)
        self.assertEqual((s["streak"], s["best_streak"], s["weeks_done"]), (3, 3, 3))
        earned = {b["id"] for b in s["badges"] if b["earned"]}
        self.assertEqual(earned, {"first-step", "week-one", "on-a-roll"})
        s = self.state(finish(self.r, {1, 2, 3, 4}, T0 + timedelta(days=1)), T0 + timedelta(days=2))
        self.assertIn("foundation", {b["id"] for b in s["badges"] if b["earned"]})

    def test_everything_done(self):
        s = self.state(finish(self.r, set(range(1, 13)), T0 + timedelta(days=1)), T0 + timedelta(days=2))
        self.assertEqual((s["pct"], s["level"], s["next_level"], s["weeks_done"]), (100, "Leading", None, 12))
        self.assertTrue(all(b["earned"] for b in s["badges"]))

    def test_streak_counts_back_from_the_newest_open_week(self):
        done = {"w1-1": T0 + timedelta(hours=1), "w2-1": T0 + timedelta(days=8)}
        s = self.state(done, T0 + timedelta(days=15))  # week 3 open, nothing done yet: streak still 2
        self.assertEqual(s["streak"], 2)
        self.assertEqual(self.state(done, T0 + timedelta(days=22))["streak"], 0)  # week 3 passed empty

    def test_simulated_seed_progress_obeys_unlocks(self):
        import random
        for i in range(30):
            done = m._simulate(self.r, T0, T0 + timedelta(days=60), random.Random(i))
            s = self.state(done, T0 + timedelta(days=60))
            for w in s["weeks"]:
                for t in w["tasks"]:
                    if t["done"]:
                        self.assertLessEqual(w["unlocks_at"], done[t["id"]])


class Api(unittest.TestCase):
    def setUp(self):
        self.client = app.app.test_client()
        with self.client.session_transaction() as s:
            s["user"], s["owner"] = {"name": "demo", "role": "org"}, "me"
        fresh = (datetime.now(timezone.utc) - timedelta(hours=1)).strftime("%Y-%m-%d %H:%M UTC")
        self._patch(app, "load", return_value=dict(SUB, created=fresh))
        self.owner_of = self._patch(app.db, "owner_of", return_value="me")
        self.stored = self._patch(m, "_stored", return_value={})
        self.query = self._patch(app.db, "query", return_value=[])

    def _patch(self, target, name, **kw):
        p = mock.patch.object(target, name, **kw)
        self.addCleanup(p.stop)
        return p.start()

    def test_other_sessions_get_403(self):
        self.owner_of.return_value = "someone-else"
        self.assertEqual(self.client.get("/api/assessments/%s/roadmap" % SID).status_code, 403)
        self.assertEqual(self.client.post("/api/assessments/%s/roadmap/tasks/w1-1" % SID, json={"done": True}).status_code, 403)
        self.assertEqual(self.client.get("/api/assessments/%s/roadmap/week/1.pdf" % SID).status_code, 403)
        with self.client.session_transaction() as s:
            s["user"] = {"name": "staff", "role": "staff"}
        self.assertEqual(self.client.get("/api/assessments/%s/roadmap" % SID).status_code, 200)

    def test_locked_weeks_hide_tasks_and_refuse_ticks_and_pdf(self):
        body = self.client.get("/api/assessments/%s/roadmap" % SID).get_json()
        self.assertIn("tasks", body["weeks"][0])
        self.assertEqual(body["weeks"][5]["state"], "locked")
        self.assertNotIn("tasks", body["weeks"][5])
        self.assertEqual(self.client.post("/api/assessments/%s/roadmap/tasks/w6-1" % SID, json={"done": True}).status_code, 403)
        self.assertEqual(self.client.get("/api/assessments/%s/roadmap/week/6.pdf" % SID).status_code, 403)
        pdf = self.client.get("/api/assessments/%s/roadmap/week/1.pdf" % SID)
        self.assertEqual((pdf.status_code, pdf.mimetype), (200, "application/pdf"))
        self.assertTrue(pdf.data.startswith(b"%PDF"))

    def test_finishing_a_week_celebrates_once(self):
        self.stored.return_value = {"w1-1": T0 + timedelta(hours=1), "w1-2": None}
        body = self.client.post("/api/assessments/%s/roadmap/tasks/w1-2" % SID, json={"done": True}).get_json()
        self.assertEqual(body["celebrate"]["weeks"], [1])
        self.assertEqual(body["celebrate"]["opened"], [2])
        self.assertEqual(body["celebrate"]["points"], 10 + 25)
        self.assertIn("Week one done", body["celebrate"]["badges"])
        self.assertEqual(self.client.post("/api/assessments/%s/roadmap/tasks/w1-2" % SID, json={"done": "yes"}).status_code, 400)

    def test_running_report_has_no_roadmap_yet(self):
        app.load.return_value = dict(SUB, status="running")
        self.assertEqual(self.client.get("/api/assessments/%s/roadmap" % SID).status_code, 409)

    def test_staff_list_is_staff_only(self):
        self.assertEqual(self.client.get("/api/staff/roadmaps").status_code, 403)


@unittest.skipUnless(os.environ.get("OCI_DB_CLUSTER_ARN"), "needs the Aurora Data API")
class Storage(unittest.TestCase):
    def test_rows_are_created_once_and_follow_ticks(self):
        import db
        sub = app.build_assessment({"org_name": "Playwright Roadmap Storage", "org_url": "", "language": "en"},
                                   {q["id"]: "no" for d in app._domains(["PL"]) for q in d["questions"]},
                                   app._domains(["PL"]))
        sub["status"] = "done"
        db.create(sub, "demo")
        try:
            roadmap, done, state = m._state(sub)
            self.assertEqual(done, {})
            self.assertEqual(len(m._stored(sub["id"])), state["total_tasks"])
            db.query("UPDATE roadmap_tasks SET done_at = now() WHERE assessment_id = :assessment_id AND task_id = 'w1-1'",
                     assessment_id=sub["id"])
            self.assertEqual(m._state(sub)[2]["done_tasks"], 1)
        finally:
            db.query("DELETE FROM organizations WHERE name = 'Playwright Roadmap Storage'")


if __name__ == "__main__":
    unittest.main()
