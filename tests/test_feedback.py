"""v1.7 human in the loop: "Does this feel right?" feedback, the staff review queue, opt-ins and the drop-off funnel.
Who may read or write, input validation at the trust boundary, and the funnel arithmetic. No database needed."""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app  # noqa: E402
from features import feedback, funnel, optin  # noqa: E402

SID = "11111111-1111-1111-1111-111111111111"


class Base(unittest.TestCase):
    role = "org"

    def setUp(self):
        self.client = app.app.test_client()
        self.sign_in(self.role)
        self._patch(app, "load", return_value={"id": SID})
        self.owner_of = self._patch(app.db, "owner_of", return_value="me")
        self.query = self._patch(app.db, "query", return_value=[])

    def sign_in(self, role):
        with self.client.session_transaction() as s:
            s["user"], s["owner"] = {"name": "staff" if role == "staff" else "demo", "role": role}, "me"

    def _patch(self, target, name, **kw):
        p = mock.patch.object(target, name, **kw)
        self.addCleanup(p.stop)
        return p.start()

    def writes(self, table):
        return [c for c in self.query.call_args_list if c.args[0].startswith("INSERT INTO " + table)]


class Feedback(Base):
    def post(self, **b):
        return self.client.post("/api/assessments/%s/feedback" % SID, json=b)

    def test_owner_saves_one_trimmed_row_per_section(self):
        res = self.post(section="plan", helpful=False, comment="  Too big for us.  ")
        self.assertEqual(res.status_code, 200)
        (call,) = self.writes("report_feedback")
        self.assertIn("ON CONFLICT (assessment_id, section) DO UPDATE", call.args[0])
        self.assertEqual((call.kwargs["section"], call.kwargs["helpful"], call.kwargs["comment"]),
                         ("plan", False, "Too big for us."))

    def test_blank_comment_is_stored_as_none(self):
        self.post(section="overall", helpful=True, comment="   ")
        self.assertIsNone(self.writes("report_feedback")[0].kwargs["comment"])

    def test_a_new_answer_takes_back_older_not_helpful_parts(self):
        clears = lambda: [c for c in self.query.call_args_list if c.args[0].startswith("DELETE FROM report_feedback")]
        self.post(section="plan", helpful=True)  # praise for one part keeps everything else
        self.assertEqual(clears(), [])
        self.post(section="start_here", helpful=False)  # a different part felt off: the old part is taken back
        self.assertEqual(clears()[-1].kwargs["section"], "start_here")
        self.post(section="overall", helpful=True)  # changed to "Yes": no part felt off any more
        self.assertEqual(len(clears()), 2)
        self.assertIn("NOT helpful", clears()[-1].args[0])

    def test_bad_input_is_rejected_before_any_write(self):
        for b in ({"section": "scores", "helpful": True}, {"section": "plan", "helpful": "yes"},
                  {"section": "plan"}, {"section": "plan", "helpful": True, "comment": "x" * 1001},
                  {"section": "plan", "helpful": True, "comment": 5}):
            self.assertEqual(self.post(**b).status_code, 400, b)
        self.assertEqual(self.post(section="plan", helpful=True, comment="x" * 1000).status_code, 200)
        self.assertEqual(len(self.writes("report_feedback")), 1)

    def test_only_the_submitting_session_or_staff(self):
        self.owner_of.return_value = "someone-else"
        self.assertEqual(self.post(section="plan", helpful=True).status_code, 403)
        self.assertEqual(self.client.get("/api/assessments/%s/feedback" % SID).status_code, 403)
        self.sign_in("staff")
        self.assertEqual(self.post(section="plan", helpful=True).status_code, 200)
        with self.client.session_transaction() as s:
            s.clear()
        self.assertEqual(self.post(section="plan", helpful=True).status_code, 401)

    def test_review_is_shown_to_staff_only(self):
        review = {"status": "flagged", "issue": "unclear", "note": None, "reviewer": "staff", "updated": "x"}
        self.query.side_effect = lambda sql, **kw: [review] if "report_reviews" in sql else []
        self.assertIsNone(self.client.get("/api/assessments/%s/feedback" % SID).get_json()["review"])
        self.sign_in("staff")
        self.assertEqual(self.client.get("/api/assessments/%s/feedback" % SID).get_json()["review"], review)


class Review(Base):
    role = "staff"

    def post(self, **b):
        return self.client.post("/api/staff/reviews/%s" % SID, json=b)

    def test_flag_needs_an_issue_from_the_list(self):
        for b in ({"status": "flagged"}, {"status": "flagged", "issue": "bad"}, {"status": "done"},
                  {"status": "reviewed", "issue": "nope"}, {"status": "reviewed", "note": "n" * 1001}):
            self.assertEqual(self.post(**b).status_code, 400, b)
        self.assertEqual(self.writes("report_reviews"), [])
        self.assertEqual(self.post(status="flagged", issue="too_big_for_size", note=" Big ").status_code, 200)
        self.assertEqual(self.post(status="reviewed").status_code, 200)
        flag, ok = (c.kwargs for c in self.writes("report_reviews"))
        self.assertEqual((flag["issue"], flag["note"], flag["reviewer"]), ("too_big_for_size", "Big", "staff"))
        self.assertEqual((ok["status"], ok["issue"]), ("reviewed", None))

    def test_unknown_report(self):
        app.load.return_value = None
        self.assertEqual(self.post(status="reviewed").status_code, 404)


class StaffOnly(Base):
    def test_staff_routes_refuse_organizations_and_anonymous_users(self):
        routes = [("get", "/api/staff/quality"), ("get", "/api/staff/optins"), ("get", "/api/staff/funnel"),
                  ("post", "/api/staff/reviews/%s" % SID)]
        for method, url in routes:
            self.assertEqual(getattr(self.client, method)(url, json={"status": "reviewed"}).status_code, 403, url)
        with self.client.session_transaction() as s:
            s.clear()
        for method, url in routes:
            self.assertEqual(getattr(self.client, method)(url, json={}).status_code, 401, url)
        self.query.assert_not_called()

    def test_quality_summary_handles_no_feedback(self):
        self.sign_in("staff")
        self.query.side_effect = lambda sql, **kw: [{"reports": 3, "with_feedback": 0, "helpful": 0, "answers": 0,
                                                     "flagged": 0, "reviewed": 0}] if "AS reports" in sql else []
        d = self.client.get("/api/staff/quality").get_json()
        self.assertIsNone(d["summary"]["helpful_pct"])
        self.assertEqual([s["section"] for s in d["by_section"]], list(feedback.SECTIONS))
        self.assertTrue(all(s["helpful"] == s["not_helpful"] == 0 for s in d["by_section"]))


class Optin(Base):
    def test_clean(self):
        ok = {"training": True, "updates": False, "name": " Ana ", "email": " ana@example.org "}
        self.assertEqual(optin.clean(ok), ({"training": True, "updates": False, "name": "Ana",
                                            "email": "ana@example.org"}, None))
        withdraw, err = optin.clean({"training": False, "updates": False, "email": "not an email"})
        self.assertIsNone(err)
        self.assertEqual(withdraw["email"], None)  # withdrawing never needs or keeps an email
        bad = [dict(ok, email=None), dict(ok, email="ana@example"), dict(ok, email="a b@example.org"),
               dict(ok, email="a@" + "x" * 200 + ".org"), dict(ok, name="n" * 101), dict(ok, training="yes"),
               {"updates": True, "email": "ana@example.org"}, dict(ok, name=7)]
        for b in bad:
            self.assertIsNotNone(optin.clean(b)[1], b)

    def test_withdraw_deletes_and_owner_only(self):
        res = self.client.post("/api/assessments/%s/optin" % SID, json={"training": False, "updates": False})
        self.assertEqual(res.get_json(), {"optin": None})
        self.assertTrue(self.query.call_args.args[0].startswith("DELETE FROM optins"))
        self.owner_of.return_value = "someone-else"
        self.assertEqual(self.client.get("/api/assessments/%s/optin" % SID).status_code, 403)


class Funnel(unittest.TestCase):
    BANK = [{"id": "PL", "name": "Planning", "questions": [1, 2, 3]}, {"id": "FR", "name": "Fundraising",
                                                                       "questions": [1, 2]},
            {"id": "HR", "name": "Human Resources", "questions": [1]}]

    def draft(self, chosen, counts, submitted=False, stale=True):
        return {"chosen": chosen, "counts": counts, "submitted": submitted, "stale": stale}

    def test_counts_and_where_people_stop(self):
        out = funnel.summarize([
            self.draft([], {}),  # empty: never started
            self.draft(["PL", "FR"], {"PL": 3, "FR": 2}, submitted=True),
            self.draft(["PL", "FR"], {"PL": 3, "FR": 1}),  # stopped in FR
            self.draft(["FR", "PL"], {"PL": 1}),  # questionnaire order: stopped in PL
            self.draft(["HR"], {}, stale=False),  # still in progress, not abandoned
            self.draft(["PL"], {"PL": 1, "XX": 4}),  # unknown areas ignored
        ], self.BANK)
        self.assertEqual((out["started"], out["submitted"], out["abandoned"]), (5, 1, 3))
        self.assertEqual({a["domain_id"]: (a["started"], a["finished"]) for a in out["by_area"]},
                         {"PL": (4, 2), "FR": (2, 1), "HR": (0, 0)})
        self.assertEqual([(a["domain_id"], a["count"]) for a in out["last_area"]], [("PL", 2), ("FR", 1)])


if __name__ == "__main__":
    unittest.main()
