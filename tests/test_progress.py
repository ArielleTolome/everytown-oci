"""Re-assessment progress compares only the areas both assessments covered."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app import compare  # noqa: E402


def gap(qid, domain):
    return {"question_id": qid, "domain_id": domain, "question_text": qid + " text"}


class Compare(unittest.TestCase):
    def test_closed_new_and_stage_moves_over_shared_areas(self):
        prev = {"id": "p", "created": "2026-05-01", "domain_ids": ["PL", "FR", "GV"],
                "gaps": [gap("PL2", "PL"), gap("PL5", "PL"), gap("GV1", "GV")],
                "domains": [{"domain_id": "PL", "estimated_stage": "Seeding"},
                            {"domain_id": "FR", "estimated_stage": "Emerging"},
                            {"domain_id": "GV", "estimated_stage": "Seeding"}]}
        sub = {"domain_ids": ["PL", "FR", "FM"], "gaps": [gap("PL5", "PL"), gap("FR3", "FR"), gap("FM1", "FM")],
               "domains": [{"domain_id": "PL", "domain_name": "Planning", "estimated_stage": "Emerging"},
                           {"domain_id": "FR", "domain_name": "Fundraising", "estimated_stage": "Emerging"},
                           {"domain_id": "FM", "domain_name": "Financial Management", "estimated_stage": "Seeding"}]}
        out = compare(prev, sub)
        self.assertEqual([c["id"] for c in out["closed"]], ["PL2"])  # GV1 is not counted: GV was not reassessed
        self.assertEqual([n["id"] for n in out["new"]], ["FR3"])  # FM1 is not "new": FM was never assessed before
        self.assertEqual([(s["domain_id"], s["from"], s["to"]) for s in out["stages"]],
                         [("PL", "Seeding", "Emerging"), ("FR", "Emerging", "Emerging")])

    def test_no_shared_areas_means_no_comparison(self):
        prev = {"id": "p", "created": "x", "domain_ids": ["GV"], "gaps": [], "domains": []}
        self.assertIsNone(compare(prev, {"domain_ids": ["PL"], "gaps": [], "domains": []}))


if __name__ == "__main__":
    unittest.main()
