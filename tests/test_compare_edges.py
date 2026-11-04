"""Re-assessment comparison edge cases, by hand and end to end through the real scoring engine."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app as oci  # noqa: E402
from app import compare  # noqa: E402


def gap(qid):
    return {"question_id": qid, "domain_id": qid[:2], "question_text": qid + " text"}


def assessment(stages, gap_ids, aid="p", created="2026-05-01"):
    return {"id": aid, "created": created, "domain_ids": list(stages), "gaps": [gap(i) for i in gap_ids],
            "domains": [{"domain_id": d, "domain_name": d + " name", "estimated_stage": s} for d, s in stages.items()]}


class CompareByHand(unittest.TestCase):
    def test_identical_assessments_show_no_change(self):
        a = assessment({"PL": "Emerging"}, ["PL2", "PL5"])
        out = compare(a, a)
        self.assertEqual((out["closed"], out["new"]), ([], []))
        self.assertEqual(out["stages"], [{"domain_id": "PL", "domain_name": "PL name", "from": "Emerging",
                                          "to": "Emerging"}])

    def test_every_gap_closed(self):
        out = compare(assessment({"PL": "Seeding"}, ["PL1", "PL2"]), assessment({"PL": "Transformational"}, []))
        self.assertEqual([c["id"] for c in out["closed"]], ["PL1", "PL2"])
        self.assertEqual((out["new"], out["stages"][0]["to"]), ([], "Transformational"))

    def test_slipping_back_is_reported_not_hidden(self):
        out = compare(assessment({"FR": "Developing"}, []), assessment({"FR": "Seeding"}, ["FR1"]))
        self.assertEqual([n["id"] for n in out["new"]], ["FR1"])
        self.assertEqual((out["stages"][0]["from"], out["stages"][0]["to"]), ("Developing", "Seeding"))

    def test_previous_id_and_date_are_passed_through(self):
        prev = assessment({"PL": "Seeding"}, [], aid="abc", created="2026-01-02 10:00 UTC")
        out = compare(prev, assessment({"PL": "Seeding"}, []))
        self.assertEqual((out["previous_id"], out["previous_created"]), ("abc", "2026-01-02 10:00 UTC"))

    def test_order_follows_previous_gaps_and_current_areas(self):
        prev = assessment({"FR": "Seeding", "PL": "Seeding"}, ["PL4", "FR2", "PL1"])
        sub = assessment({"PL": "Emerging", "FR": "Seeding"}, ["FR9", "PL7"])
        out = compare(prev, sub)
        self.assertEqual([c["id"] for c in out["closed"]], ["PL4", "FR2", "PL1"])
        self.assertEqual([n["id"] for n in out["new"]], ["FR9", "PL7"])
        self.assertEqual([s["domain_id"] for s in out["stages"]], ["PL", "FR"])

    def test_text_comes_from_the_assessment_that_has_the_gap(self):
        prev, sub = assessment({"PL": "Seeding"}, ["PL1"]), assessment({"PL": "Seeding"}, ["PL2"])
        prev["gaps"][0]["question_text"], sub["gaps"][0]["question_text"] = "old wording", "new wording"
        out = compare(prev, sub)
        self.assertEqual((out["closed"][0]["text"], out["new"][0]["text"]), ("old wording", "new wording"))


class CompareThroughEngine(unittest.TestCase):
    """Two real assessments built by the engine: the comparison matches the answers that changed."""

    ORG = {"org_name": "Org", "org_url": "", "language": "en"}

    def build(self, gap_ids, domain_ids):
        domains = [d for d in oci.get_domains() if d["id"] in domain_ids]
        flip = {"yes": "no", "no": "yes"}
        answers = {q["id"]: q["trigger_on"] if q["id"] in gap_ids else flip[q["trigger_on"]]
                   for d in domains for q in d["questions"]}
        return oci.build_assessment(self.ORG, answers, domains)

    def test_changed_answers_become_closed_and_new_gaps(self):
        prev = self.build({"PL2", "FR1", "FR3"}, ["PL", "FR"])
        sub = self.build({"FR3", "FR4"}, ["PL", "FR"])
        out = compare(prev, sub)
        self.assertEqual(sorted(c["id"] for c in out["closed"]), ["FR1", "PL2"])
        self.assertEqual([n["id"] for n in out["new"]], ["FR4"])

    def test_stage_moves_follow_the_engine_ladder(self):
        pl1 = next(q for d in oci.get_domains() if d["id"] == "PL" for q in d["questions"] if q["stage"] == 1)
        out = compare(self.build({pl1["id"]}, ["PL"]), self.build(set(), ["PL"]))
        self.assertEqual((out["stages"][0]["from"], out["stages"][0]["to"]), ("Seeding", "Transformational"))

    def test_areas_added_or_dropped_are_left_out(self):
        prev = self.build({"PL2", "GV1"}, ["PL", "GV"])
        sub = self.build({"PL2", "HR1"}, ["PL", "HR"])
        out = compare(prev, sub)
        self.assertEqual((out["closed"], out["new"]), ([], []))
        self.assertEqual([s["domain_id"] for s in out["stages"]], ["PL"])


if __name__ == "__main__":
    unittest.main()
