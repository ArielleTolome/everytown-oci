"""The model's report is untrusted: only grounded actions, catalog links and allowed horizons survive."""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pipeline  # noqa: E402


def gaps(*ids):
    """Engine-ranked gaps (best first); the area is the id prefix."""
    return [{"question_id": i, "domain_id": i[:2], "question_text": "Statement %s." % i,
             "next_steps": ["Engine step for %s" % i]} for i in ids]


class FakeBedrock:
    def __init__(self, reason="tool_use", content=None, trace=None, error=None):
        self.reason, self.content, self.trace, self.error, self.calls = reason, content, trace, error, 0

    def converse(self, **kw):
        self.calls += 1
        if self.error:
            raise self.error
        return {"stopReason": self.reason, "output": {"message": {"content": self.content}}, "trace": self.trace}


class WithBedrock(unittest.TestCase):
    def use(self, fake):
        pipeline._clients["bedrock-runtime"] = fake
        self.addCleanup(pipeline._clients.pop, "bedrock-runtime", None)
        return fake


class ValidateReport(unittest.TestCase):
    def test_keeps_only_grounded_actions_and_catalog_links(self):
        rid = next(iter(pipeline.CATALOG))
        raw = {"summary": "Strong base \u2014 keep going.", "strengths": ["A"], "conversation": ["Q?"], "plan": [
            {"horizon": 90, "title": "Later", "why": "w", "gap_ids": ["PL3", "XX9"], "owner": "", "steps": ["s"],
             "resource_id": rid},
            {"horizon": "45", "title": "Soon", "why": "w", "gap_ids": ["FR7"], "owner": "Board chair", "steps": [],
             "resource_id": "made-up"},
            {"horizon": 30, "title": "Invented", "why": "w", "gap_ids": ["ZZ1"], "owner": "ED", "steps": []}]}
        out = pipeline.validate_report(raw, gaps("PL3", "FR7"))
        self.assertEqual([p["title"] for p in out["plan"]], ["Soon", "Later"])  # ungrounded dropped, sorted
        self.assertEqual(out["plan"][0]["horizon"], 30)  # "45" snaps to nearest allowed horizon (ties go earlier)
        self.assertIsNone(out["plan"][0]["resource"])  # unknown resource id never becomes a link
        self.assertEqual(out["plan"][1]["gap_ids"], ["PL3"])
        self.assertEqual(out["plan"][1]["resource"]["url"], pipeline.CATALOG[rid]["url"])
        self.assertEqual(out["plan"][1]["owner"], "Leadership team")
        self.assertEqual(out["sources"], [{"title": pipeline.CATALOG[rid]["title"], "url": pipeline.CATALOG[rid]["url"]}])
        self.assertNotIn("\u2014", out["summary"])

    def test_rejects_report_with_no_grounded_action(self):
        with self.assertRaises(pipeline.ReportError):
            pipeline.validate_report({"plan": [{"horizon": 30, "title": "t", "gap_ids": ["NOPE"]}]}, gaps("PL3"))

    def test_non_string_fields_are_dropped_not_crashing(self):
        raw = {"summary": 7, "strengths": ["Good", None, 3], "conversation": "not a list", "plan": [
            "junk", {"horizon": "x", "title": "T", "gap_ids": ["PL3", ["PL3"]], "steps": ["a", {"b": 1}, ""]}]}
        out = pipeline.validate_report(raw, gaps("PL3"))
        self.assertEqual((out["summary"], out["strengths"], out["conversation"]), ("", ["Good"], []))
        self.assertEqual((out["plan"][0]["steps"], out["plan"][0]["horizon"]), (["a"], 30))


class StartHere(unittest.TestCase):
    """Code picks the "Start here" priorities; the model only explains them."""

    def ids(self, *ranked):
        return [g["question_id"] for g in pipeline.choose_focus(gaps(*ranked))]

    def test_prefers_two_different_areas_by_engine_rank(self):
        self.assertEqual(self.ids("PL1", "PL2", "FR4", "ML1"), ["PL1", "FR4"])
        self.assertEqual(self.ids("PL1", "PL2"), ["PL1", "PL2"])  # one area only: rank 2
        self.assertEqual(self.ids("PL1"), ["PL1"])
        self.assertEqual(self.ids(), [])

    def test_focus_follows_code_choice_whatever_the_model_sends(self):
        plan = [{"horizon": 30, "title": "P", "gap_ids": ["PL1"]}]
        focus = [{"title": t, "why": "w", "gap_ids": ids, "steps": ["s"]} for t, ids in [
            ("Made up", ["ZZ9"]), ("Both", ["PL1", "FR4"]), ("Not chosen", ["PL2"]),
            ("Money", ["FR4"]), ("Plans", ["PL2", "PL1", "FR9", "ML1"]), ("Plans again", ["PL1"])]]
        out = pipeline.validate_report({"plan": plan, "focus": focus}, gaps("PL1", "PL2", "FR4", "ML1"))
        self.assertEqual([f["title"] for f in out["focus"]], ["Plans", "Money"])  # rank order, not model order
        self.assertEqual(out["focus"][0]["gap_ids"], ["PL1", "PL2"])  # chosen id first; other areas dropped

    def test_missing_priority_is_built_from_the_engine(self):
        focus = [{"title": "Money", "why": "w", "gap_ids": ["FR4"], "steps": ["s"]}]
        out = pipeline.validate_report({"plan": [{"horizon": 30, "title": "P", "gap_ids": ["FR4"]}], "focus": focus},
                                       gaps("PL1", "FR4"))
        self.assertEqual([f["gap_ids"] for f in out["focus"]], [["PL1"], ["FR4"]])
        self.assertEqual(out["focus"][0]["title"], "Work on: Statement PL1.")
        self.assertEqual(out["focus"][0]["steps"], ["Engine step for PL1"])


HARD = ("Organizational sustainability necessitates comprehensive diversification of institutional revenue "
        "streams, particularly considering unprecedented governmental appropriations volatility.")
EASY = "Find two new funders. Ask each one for a small grant."


class ReadingLevel(WithBedrock):
    def report(self, text, gap_ids=("PL1",)):
        raw = {"summary": text, "strengths": ["s"], "conversation": ["q"],
               "focus": [{"title": "Plan", "why": text, "gap_ids": list(gap_ids), "steps": [text]}],
               "plan": [{"horizon": 30, "title": "Plan", "why": text, "gap_ids": list(gap_ids), "owner": "Board chair",
                         "steps": [text]}]}
        return raw, pipeline.validate_report(raw, gaps("PL1", "PL2"))

    def sub(self, text, language="en"):
        return {"language": language, "gaps": gaps("PL1", "PL2"), "report": self.report(text)[1]}

    def test_grade_formula_orders_plain_and_dense_text(self):
        self.assertLess(pipeline.reading_grade([EASY]), 3)
        self.assertGreater(pipeline.reading_grade([HARD]), 16)
        self.assertIsNone(pipeline.reading_grade(["", "123"]))
        # a heading without a period still ends a sentence
        self.assertEqual(pipeline.reading_grade(["Find funders", "Ask for a grant"]),
                         pipeline.reading_grade(["Find funders. Ask for a grant."]))

    def test_plain_report_is_not_rewritten(self):
        fake = self.use(FakeBedrock(error=AssertionError("should not be called")))
        out = pipeline.plain_language(self.sub(EASY))
        self.assertEqual((out["simplified"], fake.calls), (False, 0))
        self.assertLess(out["reading_grade"], pipeline.MAX_GRADE)

    def test_dense_report_is_rewritten_once_and_keeps_ids(self):
        fake = self.use(FakeBedrock(content=[{"toolUse": {"input": self.report(EASY)[0]}}]))
        out = pipeline.plain_language(self.sub(HARD))
        self.assertEqual((out["simplified"], out["summary"], fake.calls), (True, EASY, 1))
        self.assertLess(out["reading_grade"], pipeline.MAX_GRADE)

    def test_rewrite_that_changes_ids_or_fails_keeps_first_report(self):
        for fake in (FakeBedrock(content=[{"toolUse": {"input": self.report(EASY, ("PL2",))[0]}}]),
                     FakeBedrock(error=RuntimeError("throttled")),
                     FakeBedrock(content=[{"text": "no tool call"}])):
            self.use(fake)
            out = pipeline.plain_language(self.sub(HARD))
            self.assertEqual((out["simplified"], out["summary"]), (False, HARD))
            self.assertGreater(out["reading_grade"], pipeline.MAX_GRADE)

    def test_spanish_is_not_measured(self):
        fake = self.use(FakeBedrock(error=AssertionError("should not be called")))
        out = pipeline.plain_language(self.sub(HARD, "es"))
        self.assertEqual((out["reading_grade"], out["simplified"], fake.calls), (None, False, 0))


class ModelStops(WithBedrock):
    def converse_with(self, reason, trace=None):
        self.use(FakeBedrock(reason, [{"text": "partial"}], trace))
        return pipeline._converse("report", modelId="m")

    def test_truncated_or_refused_answers_raise_a_readable_error(self):
        for reason, words in (("max_tokens", "cut off"), ("content_filtered", "could not complete")):
            with self.assertRaises(pipeline.ReportError) as ctx:
                self.converse_with(reason)
            self.assertIn(words, str(ctx.exception))
        self.assertEqual(self.converse_with("end_turn"), [{"text": "partial"}])

    def test_guardrail_block_raises_but_masking_passes(self):
        blocked = {"guardrail": {"inputAssessment": {"g": {"contentPolicy": {"filters": [
            {"type": "PROMPT_ATTACK", "action": "BLOCKED"}]}}}}}
        with self.assertRaises(pipeline.ReportError) as ctx:
            self.converse_with("guardrail_intervened", blocked)
        self.assertIn("safety check", str(ctx.exception))
        masked = {"guardrail": {"outputAssessments": {"g": [{"sensitiveInformationPolicy": {"piiEntities": [
            {"type": "EMAIL", "action": "ANONYMIZED"}]}}]}}}
        self.assertEqual(self.converse_with("guardrail_intervened", masked), [{"text": "partial"}])

    def test_research_falls_back_when_the_model_fails(self):
        self.use(None)  # any Bedrock call raises
        page = "<title>Org</title><p>%s</p>" % ("We run street outreach. " * 80)
        with mock.patch.object(pipeline, "fetch", lambda url: (page, url)):
            profile, research = pipeline.research("Org", {"website": "https://example.org", "social": []})
        self.assertIn("relies on your answers only", profile)
        self.assertEqual(research["strength"], "none")


if __name__ == "__main__":
    unittest.main()
