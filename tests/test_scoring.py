"""The reference scoring engine: gap detection, weights, priority bands and the stage ladder."""
import json
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from engine.recommendations import format_for_display  # noqa: E402
from engine.scoring import calculate_recommendations  # noqa: E402

NAMES = {"1": "Seeding", "2": "Emerging", "3": "Developing", "4": "Strengthening", "5": "Transformational"}
WEIGHTS = {"1": 5, "2": 4, "3": 3, "4": 2, "5": 1}


def q(qid, stage, trigger="no"):
    return {"id": qid, "stage": stage, "trigger_on": trigger, "text": qid + " text", "next_steps": [qid + " step"]}


def domain(did, *questions, weight=None):
    d = {"id": did, "name": did + " name", "questions": list(questions)}
    if weight is not None:
        d["weight"] = weight
    return d


def run(answers, domains):
    return calculate_recommendations(answers, domains, WEIGHTS, NAMES)


class GapDetection(unittest.TestCase):
    def test_only_the_trigger_answer_is_a_gap(self):
        d = domain("AA", q("A1", 1, "no"), q("A2", 1, "yes"), q("A3", 1, "no"))
        recs, (s,) = run({"A1": "no", "A2": "yes", "A3": "yes"}, [d])
        self.assertEqual({r.question_id for r in recs}, {"A1", "A2"})
        self.assertEqual((s.gap_count, s.favorable_count, s.total_questions), (2, 1, 3))

    def test_answers_are_case_insensitive(self):
        d = domain("AA", q("A1", 1), q("A2", 1))
        recs, _ = run({"A1": "NO", "A2": "No"}, [d])
        self.assertEqual(len(recs), 2)

    def test_unanswered_or_unexpected_answers_count_as_favorable(self):
        # The API requires every statement to be answered; the engine itself never invents a gap.
        d = domain("AA", q("A1", 1), q("A2", 1), q("A3", 1))
        recs, (s,) = run({"A2": "maybe", "A3": ""}, [d])
        self.assertEqual(recs, [])
        self.assertEqual((s.score_pct, s.estimated_stage), (100.0, "Seeding"))  # stage 2 has no statements

    def test_answers_for_other_domains_are_ignored(self):
        recs, (s,) = run({"ZZ1": "no"}, [domain("AA", q("A1", 1))])
        self.assertEqual((recs, s.gap_count), ([], 0))


class Scores(unittest.TestCase):
    def test_score_is_stage_weight_times_domain_weight_times_density(self):
        # 1 of 4 gaps: density bonus 1.25; stage 2 weight 4; domain weight 0.8 -> 4 * 0.8 * 1.25 = 4.0
        d = domain("AA", q("A1", 2), q("A2", 2), q("A3", 3), q("A4", 3), weight=0.8)
        (r,), _ = run({"A1": "no"}, [d])
        self.assertEqual(r.score, 4.0)

    def test_missing_domain_weight_defaults_to_one(self):
        (r,), _ = run({"A1": "no"}, [domain("AA", q("A1", 1), q("A2", 1))])
        self.assertEqual(r.score, 5 * 1.0 * 1.5)

    def test_denser_domain_outranks_at_equal_stage(self):
        sparse = domain("SS", q("S1", 1), q("S2", 1), q("S3", 1), q("S4", 1))
        dense = domain("DD", q("D1", 1), q("D2", 1))
        recs, _ = run({"S1": "no", "D1": "no", "D2": "no"}, [sparse, dense])
        self.assertEqual(recs[0].domain_id, "DD")  # 5 * 2.0 beats 5 * 1.25
        self.assertEqual(recs[-1].question_id, "S1")

    def test_earlier_stage_gaps_rank_first(self):
        d = domain("AA", *[q("A%d" % s, s) for s in range(1, 6)])
        recs, _ = run({"A%d" % s: "no" for s in range(1, 6)}, [d])
        self.assertEqual([r.stage for r in recs], [1, 2, 3, 4, 5])

    def test_unknown_stage_gets_weight_one_and_unknown_name(self):
        (r,), _ = run({"A1": "no"}, [domain("AA", q("A1", 9))])
        self.assertEqual((r.score, r.stage_name), (2.0, "Unknown"))  # 1 * 1.0 * (1 + 1/1)

    def test_scores_are_rounded_to_two_places(self):
        d = domain("AA", q("A1", 1), q("A2", 1), q("A3", 1), weight=0.7)
        (r,), _ = run({"A1": "no"}, [d])
        self.assertEqual(r.score, round(5 * 0.7 * (1 + 1 / 3), 2))


class PriorityBands(unittest.TestCase):
    def bands(self, n):
        d = domain("AA", *[q("A%d" % i, 1 + i % 5) for i in range(n)])
        recs, _ = run({"A%d" % i: "no" for i in range(n)}, [d])
        return [r.priority for r in recs]

    def test_band_boundaries_for_small_counts(self):
        self.assertEqual(self.bands(1), ["High"])
        self.assertEqual(self.bands(2), ["High", "Medium"])
        self.assertEqual(self.bands(3), ["High", "Medium", "Low"])

    def test_bands_split_roughly_in_thirds_and_never_go_back_up(self):
        bands = self.bands(30)
        self.assertEqual([bands.count(p) for p in ("High", "Medium", "Low")], [10, 10, 10])
        order = {"High": 0, "Medium": 1, "Low": 2}
        self.assertEqual([order[b] for b in bands], sorted(order[b] for b in bands))

    def test_no_gaps_means_no_recommendations(self):
        recs, (s,) = run({"A1": "yes"}, [domain("AA", q("A1", 1))])
        self.assertEqual((recs, s.recommendations), ([], []))


class StageLadder(unittest.TestCase):
    def ladder(self, *stages):
        return domain("AA", *[q("A%d" % s, s) for s in stages])

    def stage(self, d, gaps):
        _, (s,) = run({qid: "no" for qid in gaps}, [d])
        return s.estimated_stage

    def test_highest_fully_favorable_stage_in_an_unbroken_run(self):
        d = self.ladder(1, 2, 3, 4, 5)
        self.assertEqual(self.stage(d, []), "Transformational")
        self.assertEqual(self.stage(d, ["A1"]), "Seeding")  # a stage 1 gap is still Seeding, never below
        self.assertEqual(self.stage(d, ["A3"]), "Emerging")
        self.assertEqual(self.stage(d, ["A5"]), "Strengthening")

    def test_a_later_stage_cannot_be_reached_past_an_earlier_gap(self):
        self.assertEqual(self.stage(self.ladder(1, 2, 3, 4, 5), ["A2"]), "Seeding")

    def test_a_stage_with_no_questions_stops_the_ladder(self):
        # No stage 3 statement: the ladder cannot claim Developing or anything above it.
        self.assertEqual(self.stage(self.ladder(1, 2, 4, 5), []), "Emerging")

    def test_empty_domain_is_seeding_with_zero_percent(self):
        _, (s,) = run({}, [domain("AA")])
        self.assertEqual((s.estimated_stage, s.score_pct, s.total_questions), ("Seeding", 0.0, 0))

    def test_domain_recommendations_are_sorted_and_scoped(self):
        a = domain("AA", q("A1", 3), q("A2", 1))
        b = domain("BB", q("B1", 1))
        _, (sa, sb) = run({"A1": "no", "A2": "no", "B1": "no"}, [a, b])
        self.assertEqual([r.question_id for r in sa.recommendations], ["A2", "A1"])
        self.assertEqual([r.question_id for r in sb.recommendations], ["B1"])


class RealQuestionBank(unittest.TestCase):
    """The shipped question bank behaves sensibly at the extremes."""

    def setUp(self):
        with open(os.path.join(ROOT, "data", "questions.json"), encoding="utf-8") as f:
            bank = json.load(f)
        self.domains, self.weights, self.names = bank["domains"], bank["stage_weights"], bank["stage_names"]

    def answers(self, gap):
        flip = {"yes": "no", "no": "yes"}
        return {q["id"]: q["trigger_on"] if gap else flip[q["trigger_on"]] for d in self.domains for q in d["questions"]}

    def test_all_favorable_is_transformational_everywhere(self):
        recs, summaries = calculate_recommendations(self.answers(False), self.domains, self.weights, self.names)
        self.assertEqual(recs, [])
        self.assertEqual({(s.estimated_stage, s.score_pct) for s in summaries}, {("Transformational", 100.0)})

    def test_all_gaps_is_seeding_everywhere_with_every_statement_ranked(self):
        recs, summaries = calculate_recommendations(self.answers(True), self.domains, self.weights, self.names)
        self.assertEqual(len(recs), sum(len(d["questions"]) for d in self.domains))
        self.assertEqual({(s.estimated_stage, s.score_pct) for s in summaries}, {("Seeding", 0.0)})
        self.assertEqual(recs, sorted(recs, key=lambda r: r.score, reverse=True))
        self.assertEqual(recs[0].stage, 1)


class Display(unittest.TestCase):
    def test_overall_counts_match_the_engine(self):
        d = domain("AA", *[q("A%d" % i, 1 + i % 5) for i in range(6)])
        recs, summaries = run({"A%d" % i: "no" for i in range(4)}, [d])
        out = format_for_display(recs, summaries)
        self.assertEqual(out["overall_stats"], {"total_questions": 6, "total_gaps": 4,
                                                "high_priority": 2, "medium_priority": 1, "low_priority": 1})
        self.assertEqual([r["question_id"] for r in out["domains"][0]["recommendations"]],
                         [r.question_id for r in recs])


if __name__ == "__main__":
    unittest.main()
