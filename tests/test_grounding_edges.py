"""Edge cases in validating the model's report: horizons, titles, links, house style and drop counts."""
import os
import sys
import unittest
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pipeline  # noqa: E402


def gaps(*ids):
    """Engine-ranked gaps (best first); the area is the id prefix."""
    return [{"question_id": i, "domain_id": i[:2], "question_text": "Statement %s." % i,
             "next_steps": ["Engine step for %s" % i]} for i in ids]


def action(**kw):
    return dict({"horizon": 30, "title": "Act", "why": "w", "gap_ids": ["PL1"], "steps": ["s"]}, **kw)


RID = next(iter(pipeline.CATALOG))


class Horizons(unittest.TestCase):
    def test_snaps_to_the_nearest_allowed_horizon(self):
        for given, want in ((30, 30), ("60", 60), (59, 60), (75, 60), (76, 90), (1000, 90), (-5, 30), (0, 30)):
            self.assertEqual(pipeline._horizon(given), want, given)

    def test_unreadable_horizon_falls_back_to_thirty_days(self):
        for given in (None, "", "soon", "45.5", [60], {"days": 60}):
            self.assertEqual(pipeline._horizon(given), 30, given)

    def test_floats_are_truncated_before_snapping(self):
        self.assertEqual(pipeline._horizon(89.9), 90)
        self.assertEqual(pipeline._horizon(45.9), 30)  # int(45.9) == 45: a tie, which goes to the earlier horizon

    def test_plan_is_ordered_by_horizon_and_stable_within_one(self):
        plan = [action(horizon=90, title="C"), action(horizon=30, title="A"), action(horizon=30, title="B"),
                action(horizon="60", title="Mid")]
        out = pipeline.validate_report({"plan": plan}, gaps("PL1"))
        self.assertEqual([(p["horizon"], p["title"]) for p in out["plan"]],
                         [(30, "A"), (30, "B"), (60, "Mid"), (90, "C")])


class Titles(unittest.TestCase):
    def test_repeated_section_label_is_removed_from_titles(self):
        for raw in ("Start here: Plan ahead", "START HERE : Plan ahead", "Empiece aquí: Plan ahead",
                    "Comience aquí:Plan ahead"):
            out = pipeline.validate_report({"plan": [action(title=raw)]}, gaps("PL1"))
            self.assertEqual(out["plan"][0]["title"], "Plan ahead", raw)

    def test_label_mid_title_is_kept(self):
        out = pipeline.validate_report({"plan": [action(title="Why we start here: money")]}, gaps("PL1"))
        self.assertEqual(out["plan"][0]["title"], "Why we start here: money")

    def test_action_whose_title_is_only_the_label_or_blank_is_dropped(self):
        plan = [action(title="Start here:"), action(title="   "), action(title=None), action(title="Keep")]
        out = pipeline.validate_report({"plan": plan}, gaps("PL1"))
        self.assertEqual([p["title"] for p in out["plan"]], ["Keep"])

    def test_markdown_and_em_dashes_are_cleaned_from_every_text_field(self):
        raw = {"summary": "## You are **strong** \u2014 keep going",
               "strengths": ["**Bold**\u2014claim"], "conversation": ["# Who leads?"],
               "plan": [action(title="**Plan**", why="Why \u2014 now", steps=["## Step\u2014one"], owner="**ED**")]}
        out = pipeline.validate_report(raw, gaps("PL1"))
        p = out["plan"][0]
        self.assertEqual(out["summary"], "You are strong, keep going")
        self.assertEqual((out["strengths"], out["conversation"]), (["Bold, claim"], ["Who leads?"]))
        self.assertEqual((p["title"], p["why"], p["steps"], p["owner"]), ("Plan", "Why, now", ["Step, one"], "ED"))


class GapIds(unittest.TestCase):
    def test_duplicates_are_removed_keeping_first_order(self):
        out = pipeline.validate_report({"plan": [action(gap_ids=["PL2", "PL1", "PL2", "PL1"])]}, gaps("PL1", "PL2"))
        self.assertEqual(out["plan"][0]["gap_ids"], ["PL2", "PL1"])

    def test_ids_must_match_exactly(self):
        # A near miss is not a citation: case, padding and a different area all fail.
        plan = [action(gap_ids=["pl1", " PL1", "PL1 ", "FR1"])]
        with self.assertRaises(pipeline.ReportError):
            pipeline.validate_report({"plan": plan}, gaps("PL1"))

    def test_missing_or_non_list_gap_ids_are_ungrounded(self):
        for bad in (None, [], [None, 3], "PL1"):  # a bare string is not split into a citation
            with self.assertRaises(pipeline.ReportError, msg=repr(bad)):
                pipeline.validate_report({"plan": [action(gap_ids=bad)]}, gaps("PL1"))

    def test_plan_that_is_not_a_list_is_rejected(self):
        for plan in (None, "do things", {"horizon": 30}, []):
            with self.assertRaises(pipeline.ReportError, msg=repr(plan)):
                pipeline.validate_report({"plan": plan}, gaps("PL1"))

    def test_report_with_no_gaps_at_all_cannot_be_grounded(self):
        with self.assertRaises(pipeline.ReportError):
            pipeline.validate_report({"plan": [action()]}, [])


class Resources(unittest.TestCase):
    def test_padded_catalog_id_still_resolves(self):
        out = pipeline.validate_report({"plan": [action(resource_id="  %s  " % RID)]}, gaps("PL1"))
        self.assertEqual(out["plan"][0]["resource"]["url"], pipeline.CATALOG[RID]["url"])

    def test_non_string_or_url_resource_ids_never_become_links(self):
        url = pipeline.CATALOG[RID]["url"]
        for rid in (None, "", 42, [RID], {"id": RID}, url, RID.upper() if RID != RID.upper() else RID + "x"):
            out = pipeline.validate_report({"plan": [action(resource_id=rid)]}, gaps("PL1"))
            self.assertIsNone(out["plan"][0]["resource"], repr(rid))
            self.assertEqual(out["sources"], [])

    def test_sources_are_deduplicated_across_focus_and_plan(self):
        raw = {"plan": [action(resource_id=RID), action(title="Two", resource_id=RID)],
               "focus": [action(title="F", resource_id=RID)]}
        out = pipeline.validate_report(raw, gaps("PL1"))
        self.assertEqual(out["sources"], [{"title": pipeline.CATALOG[RID]["title"], "url": pipeline.CATALOG[RID]["url"]}])

    def test_resource_only_has_title_and_url(self):
        out = pipeline.validate_report({"plan": [action(resource_id=RID)]}, gaps("PL1"))
        self.assertEqual(set(out["plan"][0]["resource"]), {"title", "url"})


class Owners(unittest.TestCase):
    def test_blank_or_non_string_owner_becomes_leadership_team(self):
        for owner in (None, "", "   ", 5, ["ED"]):
            out = pipeline.validate_report({"plan": [action(owner=owner)]}, gaps("PL1"))
            self.assertEqual(out["plan"][0]["owner"], "Leadership team", repr(owner))

    @unittest.expectedFailure
    def test_lone_em_dash_owner_becomes_leadership_team(self):
        # Known issue: clean() turns an em dash into ", " and strips, leaving "," as the owner (and a leading
        # ", " on text that starts with an em dash). Remove this decorator once clean() handles it.
        out = pipeline.validate_report({"plan": [action(owner="\u2014")]}, gaps("PL1"))
        self.assertEqual(out["plan"][0]["owner"], "Leadership team")


class Focus(unittest.TestCase):
    def test_focus_items_never_carry_a_horizon_or_owner(self):
        raw = {"plan": [action()], "focus": [action(owner="ED", horizon=60)]}
        out = pipeline.validate_report(raw, gaps("PL1"))
        self.assertNotIn("horizon", out["focus"][0])
        self.assertNotIn("owner", out["focus"][0])

    def test_same_area_extras_kept_other_areas_dropped(self):
        raw = {"plan": [action()], "focus": [action(title="Plans", gap_ids=["PL1", "FR5", "PL3", "PL2"])]}
        out = pipeline.validate_report(raw, gaps("PL1", "FR9", "PL2", "PL3", "FR5"))
        # PL1 and FR9 are the code-chosen pair; FR5 is another area, so it cannot ride along with PL1
        self.assertEqual(out["focus"][0]["gap_ids"], ["PL1", "PL3", "PL2"])

    def test_first_matching_model_item_wins_for_each_priority(self):
        raw = {"plan": [action()], "focus": [action(title="First"), action(title="Second")]}
        out = pipeline.validate_report(raw, gaps("PL1"))
        self.assertEqual([f["title"] for f in out["focus"]], ["First"])

    def test_focus_that_is_not_a_list_is_filled_by_code(self):
        out = pipeline.validate_report({"plan": [action()], "focus": "start with planning"}, gaps("PL1", "FR1"))
        self.assertEqual([f["gap_ids"] for f in out["focus"]], [["PL1"], ["FR1"]])
        self.assertTrue(all(f["title"].startswith("Work on: ") for f in out["focus"]))

    def test_code_filled_focus_is_cleaned_too(self):
        g = [{"question_id": "PL1", "domain_id": "PL", "question_text": "We plan \u2014 **sometimes**.",
              "next_steps": ["Do **this**", "", None]}]
        out = pipeline.validate_report({"plan": [action()]}, g)
        self.assertEqual(out["focus"][0]["title"], "Work on: We plan, sometimes.")
        self.assertEqual(out["focus"][0]["steps"], ["Do this"])


class DropCounts(unittest.TestCase):
    """The counts feed the observability trace, so staff can see why the model's output was trimmed."""

    def test_each_reason_is_counted(self):
        drops = Counter()
        items = ["junk", action(gap_ids=["ZZ1"]), action(title=""), action(gap_ids=["PL1", "XX1", "XX2", "XX1"]),
                 action(resource_id="made-up"), action(resource_id="   ")]
        out = pipeline._grounded(items, {"PL1": "PL"}, drops)
        self.assertEqual(len(out), 3)
        self.assertEqual(dict(drops), {"not_an_object": 1, "no_grounded_gap_id": 1, "empty_title": 1,
                                       "unknown_gap_id_removed": 3, "unknown_resource_id": 1})

    def test_snapped_horizons_and_code_filled_focus_are_counted(self):
        drops = Counter()
        pipeline._validate_report({"plan": [action(horizon=45), action(horizon=60)]}, gaps("PL1", "FR1"), drops)
        self.assertEqual((drops["horizon_snapped"], drops["focus_filled_by_code"]), (1, 2))


if __name__ == "__main__":
    unittest.main()
