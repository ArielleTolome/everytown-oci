"""The model's report is untrusted: only grounded actions, catalog links and allowed horizons survive."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pipeline  # noqa: E402


class ValidateReport(unittest.TestCase):
    def test_keeps_only_grounded_actions_and_catalog_links(self):
        rid = next(iter(pipeline.CATALOG))
        raw = {"summary": "Strong base \u2014 keep going.", "strengths": ["A"], "conversation": ["Q?"], "plan": [
            {"horizon": 90, "title": "Later", "why": "w", "gap_ids": ["PL3", "XX9"], "owner": "", "steps": ["s"],
             "resource_id": rid},
            {"horizon": "45", "title": "Soon", "why": "w", "gap_ids": ["FR7"], "owner": "Board chair", "steps": [],
             "resource_id": "made-up"},
            {"horizon": 30, "title": "Invented", "why": "w", "gap_ids": ["ZZ1"], "owner": "ED", "steps": []}]}
        out = pipeline.validate_report(raw, {"PL3", "FR7"})
        self.assertEqual([p["title"] for p in out["plan"]], ["Soon", "Later"])  # ungrounded dropped, sorted
        self.assertEqual(out["plan"][0]["horizon"], 30)  # "45" snaps to nearest allowed horizon (ties go earlier)
        self.assertIsNone(out["plan"][0]["resource"])  # unknown resource id never becomes a link
        self.assertEqual(out["plan"][1]["gap_ids"], ["PL3"])
        self.assertEqual(out["plan"][1]["resource"]["url"], pipeline.CATALOG[rid]["url"])
        self.assertEqual(out["plan"][1]["owner"], "Leadership team")
        self.assertEqual(out["sources"], [{"title": pipeline.CATALOG[rid]["title"], "url": pipeline.CATALOG[rid]["url"]}])
        self.assertNotIn("\u2014", out["summary"])
        self.assertEqual(out["focus"][0]["title"], "Soon")  # no focus from the model: the first plan item leads

    def test_focus_is_grounded_and_capped_at_two(self):
        plan = [{"horizon": 30, "title": "P", "gap_ids": ["PL3"]}]
        focus = [{"title": t, "why": "w", "gap_ids": [g], "steps": []} for t, g in
                 [("Made up", "ZZ9"), ("One", "PL3"), ("Two", "FR7"), ("Three", "PL3")]]
        out = pipeline.validate_report({"plan": plan, "focus": focus}, {"PL3", "FR7"})
        self.assertEqual([f["title"] for f in out["focus"]], ["One", "Two"])

    def test_rejects_report_with_no_grounded_action(self):
        with self.assertRaises(pipeline.ReportError):
            pipeline.validate_report({"plan": [{"horizon": 30, "title": "t", "gap_ids": ["NOPE"]}]}, {"PL3"})

    def test_non_string_fields_are_dropped_not_crashing(self):
        raw = {"summary": 7, "strengths": ["Good", None, 3], "conversation": "not a list", "plan": [
            "junk", {"horizon": "x", "title": "T", "gap_ids": ["PL3", ["PL3"]], "steps": ["a", {"b": 1}, ""]}]}
        out = pipeline.validate_report(raw, {"PL3"})
        self.assertEqual((out["summary"], out["strengths"], out["conversation"]), ("", ["Good"], []))
        self.assertEqual((out["plan"][0]["steps"], out["plan"][0]["horizon"]), (["a"], 30))


class ModelStops(unittest.TestCase):
    def converse_with(self, reason):
        class Fake:
            def converse(self, **kw):
                return {"stopReason": reason, "output": {"message": {"content": [{"text": "partial"}]}}}
        pipeline._clients["bedrock-runtime"] = Fake()
        try:
            return pipeline._converse("report", modelId="m")
        finally:
            pipeline._clients.pop("bedrock-runtime")

    def test_truncated_or_refused_answers_raise_a_readable_error(self):
        for reason, words in (("max_tokens", "cut off"), ("content_filtered", "could not complete")):
            with self.assertRaises(pipeline.ReportError) as ctx:
                self.converse_with(reason)
            self.assertIn(words, str(ctx.exception))
        self.assertEqual(self.converse_with("end_turn"), [{"text": "partial"}])

    def test_research_falls_back_when_the_model_fails(self):
        pipeline._clients["bedrock-runtime"] = None  # any Bedrock call raises
        try:
            original, pipeline.fetch_page_text = pipeline.fetch_page_text, lambda url: "page text"
            self.assertIn("relies on your answers only", pipeline.research_org("Org", "https://example.org"))
        finally:
            pipeline.fetch_page_text = original
            pipeline._clients.pop("bedrock-runtime")


if __name__ == "__main__":
    unittest.main()
