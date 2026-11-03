"""Staff BI: training-needs matrix, change over time, peer similarity and benchmarks, "Ask the data" routing and
grounding, and that every staff endpoint is closed to organizations. No database or Bedrock needed."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app  # noqa: E402
from features import bi, peers  # noqa: E402

CTX = bi.context()


def org(name, stages=None, gaps=(), asked=(), models=(), size=None, budget=None, prev=None):
    stages = stages or {"PL": ("Seeding", 40.0), "FR": ("Emerging", 50.0)}
    return {"id": name, "name": name, "assessment_id": "a-" + name, "created": "2026-10-01", "source": "seed",
            "assessments": 2 if prev else 1, "recent": 1, "program_models": list(models), "staff_size": size,
            "budget": budget, "state": None, "role": None, "answered_by": {}, "support": list(asked),
            "asked": list(asked), "asked_at": "2026-10-02" if asked else None, "prev": prev,
            "stages": {d: {"stage": s, "score": p} for d, (s, p) in stages.items()}, "gaps": list(gaps)}


class TrainingNeeds(unittest.TestCase):
    def test_a_need_is_a_request_or_an_early_stage_high_priority_and_busiest_rows_come_first(self):
        orgs = [org("A", gaps=[("PL2", "Medium")]),
                org("B", gaps=[("PL2", "High"), ("FR3", "High")]),
                org("C", gaps=[("FR3", "Low")], asked=["FR"])]
        t = bi.training_needs(orgs, CTX)
        self.assertEqual([r["name"] for r in t["rows"]], ["B", "C", "A"])
        a = next(r for r in t["rows"] if r["name"] == "A")
        self.assertEqual(a["needs"], 0)  # a Medium gap alone is not a training need
        c = next(r for r in t["rows"] if r["name"] == "C")
        self.assertEqual(c["cells"]["FR"], {"high": 0, "asked": True, "need": True})
        cols = {x["domain_id"]: x for x in t["areas"]}
        self.assertEqual([x["domain_id"] for x in t["areas"]], ["PL", "FR"])  # only areas someone assessed
        self.assertEqual((cols["FR"]["orgs"], cols["FR"]["high"], cols["FR"]["asked"]), (2, 1, 1))
        self.assertEqual(cols["PL"]["top_question_id"], "PL2")

    def test_high_priority_in_a_mature_area_is_not_a_need(self):
        # The High band is relative within each submission: a strong org still has "High" items.
        t = bi.training_needs([org("A", stages={"PL": ("Strengthening", 90.0)}, gaps=[("PL14", "High")])], CTX)
        self.assertEqual(t["rows"][0]["cells"]["PL"], {"high": 1, "asked": False, "need": False})
        self.assertEqual(t["areas"][0]["orgs"], 0)

    def test_unassessed_area_is_not_a_cell(self):
        t = bi.training_needs([org("A", stages={"PL": ("Seeding", 10.0)}), org("B")], CTX)
        a = next(r for r in t["rows"] if r["name"] == "A")
        self.assertNotIn("FR", a["cells"])


class ChangeOverTime(unittest.TestCase):
    def test_compares_shared_areas_and_splits_closed_rate_by_earlier_support_request(self):
        prev = {"assessment_id": "p", "created": "2026-06-01", "support": ["PL"],
                "stages": {"PL": {"stage": "Seeding", "score": 20.0}, "FR": {"stage": "Emerging", "score": 40.0},
                           "GV": {"stage": "Seeding", "score": 10.0}},
                "gaps": [("PL2", "High"), ("PL5", "High"), ("FR3", "High"), ("GV1", "High")]}
        now = org("A", stages={"PL": ("Developing", 60.0), "FR": ("Emerging", 45.0)},
                  gaps=[("PL5", "High"), ("FR9", "Low")], prev=prev)
        c = bi.change_over_time([now, org("B")], CTX)
        self.assertEqual(c["reassessed"], 1)
        r = c["rows"][0]
        self.assertEqual((r["up"], r["same"], r["down"]), (1, 1, 0))  # GV was not assessed again: not compared
        self.assertEqual((r["closed"], r["new"]), (2, 1))  # PL2 and FR3 closed, FR9 new; GV1 ignored
        self.assertEqual(c["training"]["asked"], {"before": 2, "closed": 1, "rate": 50})
        self.assertEqual(c["training"]["other"], {"before": 1, "closed": 1, "rate": 100})


class Similarity(unittest.TestCase):
    def test_weights_and_reasons(self):
        a = org("A", models=["Hospital-based violence intervention"], size="11-20", budget="$250K to $1M",
                gaps=[("FR7", "High"), ("PL2", "Low"), ("FM1", "High")])
        b = org("B", models=["Hospital-based violence intervention", "Street outreach"], size="11-20",
                budget="$1M to $5M", gaps=[("PL2", "High"), ("FR7", "High")])
        score, reasons = peers.similarity(a, b)
        # models 1/2, size max(staff 1, budget 0.5) = 1, gaps 2/3
        self.assertAlmostEqual(score, round(0.4 * 0.5 + 0.3 * 1 + 0.3 * 2 / 3, 2))
        self.assertEqual(reasons, ["Both hospital-based", "Similar size: 11-20 staff",
                                   "Close in budget: $250K to $1M and $1M to $5M",
                                   "Share 2 growth priorities incl. FR7"])

    def test_adjacent_band_is_half_and_unknown_is_zero(self):
        self.assertEqual(peers.band_match("6-10", "11-20", ["1-5", "6-10", "11-20"]), 0.5)
        self.assertEqual(peers.band_match("1-5", "11-20", ["1-5", "6-10", "11-20"]), 0)
        self.assertEqual(peers.band_match(None, "11-20", ["1-5", "6-10", "11-20"]), 0)
        self.assertEqual(peers.similarity(org("A"), org("B")), (0, []))

    def test_top_peers_skip_self_and_strangers(self):
        a = org("A", models=["Street outreach"], gaps=[("PL2", "High")])
        out = peers.top_peers(a, [a, org("B", models=["Street outreach"]), org("C")])
        self.assertEqual([p["org"]["name"] for p in out], ["B"])

    def test_benchmark_ranks_within_primary_program_model_only(self):
        s = lambda p: {"PL": ("Seeding", p)}  # noqa: E731
        street = [org("S%d" % i, stages=s(p), models=["Street outreach"]) for i, p in enumerate((10.0, 20.0, 30.0))]
        hospital = [org("H%d" % i, stages=s(p), models=["Hospital-based violence intervention"])
                    for i, p in enumerate((90.0, 95.0))]
        none = org("N", stages=s(50.0))
        peers.benchmark(street + hospital + [none])
        self.assertEqual([o["stages"]["PL"]["percentile"] for o in street], [0, 50, 100])
        self.assertEqual([o["stages"]["PL"]["percentile"] for o in hospital], [None, None])  # under 3 peers
        self.assertIsNone(none["stages"]["PL"]["percentile"])


class AskRouter(unittest.TestCase):
    def test_rejects_unknown_analyses_filters_and_values(self):
        for raw in (None, {"analysis": "DROP TABLE"}, {"analysis": "none"},
                    {"analysis": "common_gaps", "filters": {"program_model": "Hospital"}},
                    {"analysis": "common_gaps", "filters": {"sql": "1=1"}},
                    {"analysis": "common_gaps", "area": "XX"},
                    {"analysis": "compare_program_models"},
                    {"analysis": "org_lookup", "org_name": "  "}):
            with self.subTest(raw=raw), self.assertRaises(bi.BadRequest):
                bi.route(raw, CTX)

    def test_accepts_valid_choice_and_area_inside_filters(self):
        self.assertEqual(bi.route({"analysis": "compare_program_models", "filters": {
            "area": "FM", "program_model": "Hospital-based violence intervention", "staff_size": "6-10"}}, CTX),
            ("compare_program_models", "FM", {"staff_size": "6-10"}, None))

    def test_answer_must_only_use_numbers_from_the_table(self):
        table = {"title": "t", "columns": ["Area", "Organizations"], "rows": [["Planning", 14], ["Fundraising", 9]]}
        self.assertEqual(bi.check_answer("Planning leads with 14 organizations \u2014 then Fundraising with 9.",
                                         "q", table), "Planning leads with 14 organizations, then Fundraising with 9.")
        self.assertIsNone(bi.check_answer("Planning leads with 15 organizations.", "q", table))

    def test_run_needs_by_area_lists_only_orgs_with_a_need_there(self):
        orgs = [org("A", gaps=[("FR3", "High"), ("FR4", "High")]), org("B", asked=["FR"]), org("C")]
        t = bi.run("training_needs", "FR", {}, None, orgs, CTX)
        self.assertEqual(t["rows"], [["A", 2, "No"], ["B", 0, "Yes"]])


class StaffOnly(unittest.TestCase):
    def test_every_staff_endpoint_refuses_organizations_and_anonymous_users(self):
        client = app.app.test_client()
        calls = [("get", "/api/staff/bi"), ("post", "/api/staff/ask"), ("get", "/api/staff/peers/x"),
                 ("get", "/api/staff/network-report.pdf")]
        for method, path in calls:
            self.assertEqual(getattr(client, method)(path, json={}).status_code, 401, path)
        with client.session_transaction() as s:
            s["user"] = {"name": "demo", "role": "org"}
        for method, path in calls:
            self.assertEqual(getattr(client, method)(path, json={}).status_code, 403, path)


if __name__ == "__main__":
    unittest.main()
