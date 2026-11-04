"""Save and resume, area sharing, organization details and the staff training brief (v0.9)."""
import json
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app as oci  # noqa: E402
from features import drafts, staff_ai  # noqa: E402
import pipeline  # noqa: E402
from features.orgmeta import MAX_STATES, STATES, clean_org_meta  # noqa: E402

HAS_DB = bool(os.environ.get("OCI_DB_CLUSTER_ARN"))


def client(role="demo"):
    c = oci.app.test_client()
    c.post("/api/login", json={"username": role, "password": role})
    return c


class OrgMeta(unittest.TestCase):
    def test_only_known_values_are_kept(self):
        self.assertEqual(clean_org_meta({"program_models": ["Therapy/CBT", "Bowling", "Street outreach"],
                                         "staff_size": "6-10", "budget": "Over $5M", "states": ["PR"]}),
                         {"program_models": ["Street outreach", "Therapy/CBT"], "staff_size": "6-10",
                          "budget": "Over $5M", "states": ["PR"]})
        self.assertEqual(clean_org_meta({"budget": "$3"}), None)
        self.assertEqual(clean_org_meta({"program_models": "Street outreach", "staff_size": "7", "state": "XX"}), None)
        self.assertIsNone(clean_org_meta("nope"))

    def test_states_are_known_codes_deduped_in_order_and_capped(self):
        # issue #23: an organization can work in several states or territories
        self.assertEqual(clean_org_meta({"states": ["IL", "NY", "XX", "IL"]})["states"], ["IL", "NY"])
        self.assertEqual(clean_org_meta({"states": ["NY", "IL"], "state": "CA"})["states"], ["NY", "IL"])
        self.assertEqual(clean_org_meta({"states": list(STATES)})["states"], list(STATES)[:MAX_STATES])
        self.assertIsNone(clean_org_meta({"states": ["XX", 3, None, ["IL"]]}))

    def test_a_draft_saved_before_the_change_keeps_its_one_state(self):
        self.assertEqual(clean_org_meta({"state": "IL"})["states"], ["IL"])
        self.assertEqual(drafts.clean({"org_meta": {"staff_size": "1-5", "state": "PR"}})["org_meta"]["states"], ["PR"])


class DraftData(unittest.TestCase):
    def test_unknown_ids_and_values_are_dropped(self):
        out = drafts.clean({"org_name": " Acme ", "language": "fr", "domain_ids": ["FM", "ZZ", "PL"],
                            "answers": {"PL1": "yes", "PL2": "maybe", "XX9": "no", "FM1": "no"}})
        self.assertEqual(out["org_name"], "Acme")
        self.assertEqual(out["language"], "en")
        self.assertEqual(out["domain_ids"], ["PL", "FM"])  # canonical order, unknown area gone
        self.assertEqual(out["answers"], {"PL1": "yes", "FM1": "no"})

    def test_answer_style_kept_only_when_known(self):
        # #28: the leader's answer style follows a resume link to another device; anything else is dropped.
        for v in ("quick", "yn", "check"):
            self.assertEqual(drafts.clean({"view": v})["view"], v)
        for bad in ("grid", "", None, ["quick"], 1):
            self.assertIsNone(drafts.clean({"view": bad})["view"], bad)
        self.assertIsNone(drafts.clean({})["view"])
        self.assertNotIn("view", drafts._view(drafts.clean({"view": "yn"}), "PL"))  # a teammate picks their own


@unittest.skipUnless(HAS_DB, "needs the Aurora Data API (OCI_DB_CLUSTER_ARN)")
class Drafts(unittest.TestCase):
    def setUp(self):
        self.leader = client()
        data = {"org_name": "Playwright Drafts", "domain_ids": ["PL", "FM"], "answers": {"PL1": "yes"}}
        r = self.leader.post("/api/drafts", json={"data": data})
        self.assertEqual(r.status_code, 201)
        self.token = r.get_json()["token"]

    def tearDown(self):
        import db
        db.query("DELETE FROM drafts WHERE token = :t", t=self.token)

    def test_sign_in_required(self):
        self.assertEqual(oci.app.test_client().get("/api/drafts/" + self.token).status_code, 401)

    def test_full_save_merges_answers_and_replaces_details(self):
        r = self.leader.post("/api/drafts/" + self.token, json={"data": {
            "org_name": "Playwright Drafts 2", "domain_ids": ["PL", "FM"], "answers": {"PL2": "no", "XX1": "yes"}}})
        data = r.get_json()["data"]
        self.assertEqual(data["org_name"], "Playwright Drafts 2")
        self.assertEqual(data["answers"], {"PL1": "yes", "PL2": "no"})  # PL1 kept, invalid id dropped

    def test_teammate_link_reads_and_answers_only_its_area(self):
        share = self.leader.post("/api/drafts/%s/share" % self.token, json={"area": "FM"}).get_json()["token"]
        self.assertNotEqual(share, self.token)
        mate = client()
        view = mate.get("/api/drafts/" + share).get_json()
        self.assertEqual((view["area"], view["data"]["domain_ids"], view["data"]["answers"]), ("FM", ["FM"], {}))
        # Tries to overwrite Planning and rename the organization: only the FM answer lands.
        mate.post("/api/drafts/" + share, json={"area": "PL", "data": {
            "org_name": "Hacked", "answers": {"FM1": "no", "PL1": "no"}}})
        full = self.leader.get("/api/drafts/" + self.token).get_json()["data"]
        self.assertEqual(full["answers"], {"PL1": "yes", "FM1": "no"})
        self.assertEqual(full["org_name"], "Playwright Drafts")
        # A share token cannot mint more shares, and the same area reuses its link.
        self.assertEqual(mate.post("/api/drafts/%s/share" % share, json={"area": "PL"}).status_code, 404)
        self.assertEqual(self.leader.post("/api/drafts/%s/share" % self.token, json={"area": "FM"}).get_json()["token"],
                         share)

    def test_area_save_with_full_token_touches_only_that_area(self):
        self.leader.post("/api/drafts/" + self.token, json={"area": "FM", "data": {"answers": {"FM2": "yes", "PL1": "no"}}})
        self.assertEqual(self.leader.get("/api/drafts/" + self.token).get_json()["data"]["answers"],
                         {"PL1": "yes", "FM2": "yes"})

    def test_unknown_token_and_size_limit(self):
        self.assertEqual(self.leader.get("/api/drafts/" + "x" * 30).status_code, 404)
        big = {"data": {"org_name": "a" * (70 * 1024)}}
        self.assertEqual(self.leader.post("/api/drafts/" + self.token, json=big).status_code, 413)


class Brief(unittest.TestCase):
    def test_staff_only(self):
        self.assertEqual(client().post("/api/staff/briefs", json={"question_id": "PL2"}).status_code, 403)
        self.assertEqual(oci.app.test_client().post("/api/staff/briefs", json={"question_id": "PL2"}).status_code, 401)

    def test_counts_go_to_the_model_and_output_is_validated(self):
        who = {"orgs": 3, "high_priority": 2, "assessed": 9, "program_models": [{"name": "Street outreach", "orgs": 2}],
               "staff_sizes": [], "not_given": 1}
        tool = {"toolUse": {"input": {"title": "Plan past this month", "why_it_matters": "Plans help.",
                                      "session_outline": ["One", "Two", "Three", 4], "pre_work": "Bring a calendar.",
                                      "resource_ids": ["bja-cvi-checklist", "made-up"], "follow_up": "Call in 30 days."}}}
        staff_ai._cache.clear()
        with mock.patch.object(staff_ai, "_who", return_value=who), \
                mock.patch("pipeline._converse", return_value=[{"reasoningContent": {}}, tool]) as conv:
            out = client("staff").post("/api/staff/briefs", json={"question_id": "PL2"}).get_json()
        staff_ai._cache.clear()
        prompt = conv.call_args.kwargs["messages"][0]["content"][0]["text"]
        self.assertIn('"orgs": 3', prompt)
        self.assertEqual(out["session_outline"], ["One", "Two", "Three"])  # non-strings dropped
        self.assertEqual([r["url"] for r in out["resources"]], [pipeline.CATALOG["bja-cvi-checklist"]["url"]])
        self.assertEqual(out["who"], who)

    def test_incomplete_brief_is_refused(self):
        with self.assertRaises(pipeline.ReportError):
            staff_ai.validate_brief({"title": "x", "why_it_matters": "y", "pre_work": "z", "follow_up": "w",
                                     "session_outline": ["only one"]})

    @unittest.skipUnless(HAS_DB, "needs the Aurora Data API (OCI_DB_CLUSTER_ARN)")
    def test_who_is_aggregated_without_names_or_ids(self):
        import db
        who = json.dumps(staff_ai._who("PL2", "PL"))
        for o in db.query("SELECT id::text AS id, name FROM organizations"):
            self.assertNotIn(o["name"], who)
            self.assertNotIn(o["id"], who)


if __name__ == "__main__":
    unittest.main()
