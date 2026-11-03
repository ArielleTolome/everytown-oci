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

    def test_rejects_report_with_no_grounded_action(self):
        with self.assertRaises(ValueError):
            pipeline.validate_report({"plan": [{"horizon": 30, "title": "t", "gap_ids": ["NOPE"]}]}, {"PL3"})


if __name__ == "__main__":
    unittest.main()
