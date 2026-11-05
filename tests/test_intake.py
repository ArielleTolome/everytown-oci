"""v1.0 intake: who filled it out, budget, social links, answer attribution and public-source research."""
import json
import os
import socket
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app as oci  # noqa: E402
import pipeline  # noqa: E402
from features import drafts  # noqa: E402
from features.orgmeta import RESPONDENT_ROLES, clean_respondent, clean_social  # noqa: E402

HAS_DB = bool(os.environ.get("OCI_DB_CLUSTER_ARN"))


def client():
    c = oci.app.test_client()
    with mock.patch("db.recent_reports", return_value=0):
        c.post("/api/login", json={"username": "demo", "password": "demo"})
    return c


def complete(domain_ids):
    return {q["id"]: "yes" for d in oci.get_domains() if d["id"] in domain_ids for q in d["questions"]}


class Validation(unittest.TestCase):
    def test_respondent(self):
        self.assertEqual(clean_respondent({"role": "Program director", "title": "  Director of\nprograms ",
                                           "name": "x" * 300}),
                         ({"name": "x" * 100, "title": "Director of programs", "role": "Program director"}, None))
        self.assertEqual(clean_respondent({"role": "CEO"})[0], None)
        self.assertIn("role", clean_respondent({"role": "CEO"})[1])
        self.assertEqual(clean_respondent({"role": "", "name": " "}), (None, None))
        self.assertEqual(clean_respondent("Executive director"), (None, None))

    def test_social_links(self):
        self.assertEqual(clean_social(["instagram.com/peace", "", "https://instagram.com/peace", "https://x.com/p"]),
                         (["https://instagram.com/peace", "https://x.com/p"], None))
        self.assertTrue(clean_social(["javascript:alert(1)"])[1])
        self.assertTrue(clean_social(["https://a.org/%d" % i for i in range(6)])[1])
        self.assertEqual(clean_social("https://a.org"), ([], None))

    def test_json_body_that_is_not_an_object_is_a_client_error(self):
        # Found by the v1.3 API fuzz: 123, "text" or [1] reached b.get() and returned 500 on 11 routes.
        c = oci.app.test_client()
        for raw in (b"123", b'"text"', b"[1]", b"true"):
            r = c.post("/api/login", data=raw, content_type="application/json")
            self.assertEqual(r.status_code, 401, raw)
            self.assertIn("did not match", r.get_json()["error"])

    def test_submit_validates_and_stores_intake(self):
        c = client()
        base = {"org_name": "Playwright Intake", "domain_ids": ["PL"], "answers": complete(["PL"])}
        with mock.patch("db.recent_reports", return_value=0), mock.patch.object(oci, "submit", return_value="id") as sub:
            bad = c.post("/api/assessments", json=dict(base, respondent={"role": "Boss"},
                                                       org_links={"social": ["not a url"]}))
            self.assertEqual(bad.status_code, 400)
            self.assertEqual(set(bad.get_json()["errors"]),
                             {"respondent_role", "respondent_title", "respondent_name", "social"})
            # Job title and name are required; blanks and whitespace do not count.
            blank = c.post("/api/assessments", json=dict(base, respondent={"role": "Executive director",
                                                                             "title": "  ", "name": "Jordan Lee"}))
            self.assertEqual((blank.status_code, set(blank.get_json()["errors"])), (400, {"respondent_title"}))
            sub.assert_not_called()
            ok = c.post("/api/assessments", json=dict(
                base, org_url="peace.example.org",
                respondent={"role": "Executive director", "title": "Founder", "name": "Jordan Lee"},
                org_links={"social": ["facebook.com/peace"]},
                org_meta={"budget": "Under $250K", "program_models": ["Street outreach"], "states": ["IL", "IN"]}))
        self.assertEqual(ok.status_code, 201)
        org = sub.call_args.args[0]
        self.assertEqual(org["respondent"], {"name": "Jordan Lee", "title": "Founder", "role": "Executive director"})
        self.assertEqual(org["org_links"], {"website": "https://peace.example.org",
                                            "social": ["https://facebook.com/peace"]})
        self.assertEqual(org["org_meta"]["budget"], "Under $250K")
        self.assertEqual(org["org_meta"]["states"], ["IL", "IN"])
        self.assertEqual(org["answered_by"], {"PL": "Executive director"})  # no draft token: the leader answered all

    def test_showcase_start_page_is_filled_in_and_passes_validation(self):
        # Presentations sign in as showcase: page 1 must arrive complete, so Start questionnaire works at once.
        demo = client()
        self.assertIsNone(demo.get("/api/meta").get_json()["preset"])
        c = oci.app.test_client()
        self.assertEqual(c.post("/api/login", json={"username": "showcase", "password": "showcase"}).status_code, 200)
        preset = c.get("/api/meta").get_json()["preset"]
        self.assertEqual((preset["org_name"], preset["domain_ids"]), (oci.SAMPLES["A"]["name"], oci.PRIORITY_DOMAINS))
        body = {k: preset[k] for k in ("org_name", "org_url", "language", "domain_ids", "org_meta", "respondent")}
        with mock.patch("db.recent_reports", return_value=0), mock.patch.object(oci, "submit", return_value="id") as sub:
            res = c.post("/api/assessments", json=dict(body, answers=complete(preset["domain_ids"])))
        self.assertEqual(res.status_code, 201, res.get_json())
        self.assertEqual(sub.call_args.args[0]["respondent"]["name"], oci.SHOWCASE_NAME)

    def test_samples_have_a_role_and_budget(self):
        for s in oci.SAMPLES.values():
            self.assertIn(s["respondent"]["role"], RESPONDENT_ROLES)
            self.assertIsNone(s["respondent"]["name"])
            self.assertTrue(s["org_meta"]["budget"])


class NameNeverReachesTheModel(unittest.TestCase):
    def test_report_prompt_has_role_and_details_but_not_name(self):
        domains = [d for d in oci.get_domains() if d["id"] == "PL"]
        answers = {q["id"]: ("no" if q["trigger_on"] == "no" else "yes") for q in domains[0]["questions"]}
        sub = oci.build_assessment({"org_name": "Org", "org_url": "", "language": "en",
                                    "org_meta": {"program_models": ["Hospital-based violence intervention"],
                                                 "staff_size": "1-5", "budget": "Under $250K", "states": ["IL", "IN"]},
                                    "respondent": {"name": "Jordan Secretname", "title": "Founder",
                                                   "role": "Executive director"}}, answers, domains)
        with mock.patch.object(pipeline, "_converse", return_value=[]) as conv:
            with self.assertRaises(pipeline.ReportError):  # no tool call in the fake answer
                pipeline.write_report(sub, "")
        sent = json.dumps(conv.call_args.kwargs)
        self.assertNotIn("Secretname", sent)
        self.assertIn("Executive director", sent)
        self.assertIn("Hospital-based violence intervention", sent)
        self.assertIn("Under $250K", sent)
        self.assertIn('\\"states\\": [\\"IL\\", \\"IN\\"]', sent)  # every state or territory reaches the prompt


class Research(unittest.TestCase):
    def test_strength_rules(self):
        cases = [((1500, 1), "rich"), ((1499, 1), "limited"), ((1500, 0), "some"), ((0, 2), "some"),
                 ((200, 0), "limited"), ((0, 1), "limited"), ((0, 0), "none")]
        for args, want in cases:
            self.assertEqual(pipeline.research_strength(*args), want, args)

    def test_private_addresses_are_never_fetched(self):
        """Website, social and news fetches all pass the SSRF guard; a blocked fetch never fails the report."""
        private = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.5", 0))]
        with mock.patch("socket.getaddrinfo", return_value=private), \
                mock.patch.object(pipeline._opener, "open", side_effect=AssertionError("fetched")), \
                mock.patch.object(pipeline, "_converse", side_effect=AssertionError("model called")):
            profile, research = pipeline.research("Peace Org", {"website": "https://peace.example.org",
                                                               "social": ["https://facebook.com/peace"]})
            with self.assertRaises(ValueError):
                pipeline._CheckedRedirects().redirect_request(None, None, 302, "", {}, "https://evil.example/")
        self.assertEqual(profile, pipeline.NO_PROFILE)
        self.assertEqual(research["strength"], "none")
        self.assertEqual([(s["kind"], s["used"]) for s in research["sources"]], [("website", False), ("social", False)])
        with self.assertRaises(ValueError):
            pipeline.fetch("file:///etc/passwd")

    def test_sources_feed_one_summary_call(self):
        home = ('<title>Peace Org</title><a href="/about-us">About</a><a href="https://other.org/about">x</a>'
                '<a href="/our-programs/">Programs</a><a href="/mission.pdf">Mission</a><a href="/donate">Give</a>'
                '<p>%s</p>' % ("We work with young people on the block. " * 50))
        social = ('<title>Peace Org | Facebook</title><meta property="og:description" content="Peace Org, Chicago">'
                  '<meta name="keywords" content="ignored">')
        rss = ("<rss><item><title>Peace Org opens new center - Daily News</title><link>https://news.example/a</link>"
               "<pubDate>Mon, 02 Nov 2026</pubDate><source url='x'>Daily News</source></item>"
               "<item><title>Another group wins award</title><link>https://news.example/b</link></item></rss>")
        pages = {"https://peace.example.org": home, "https://facebook.com/peace": social}

        def fake_fetch(url):
            if url.startswith("https://news.google.com/rss/search?q=%22Peace%20Org%22"):
                return rss, url
            return pages.get(url, "<title>Sub</title><p>Our programs.</p>"), url

        with mock.patch.object(pipeline, "fetch", side_effect=fake_fetch) as f, \
                mock.patch.object(pipeline, "_converse", return_value=[{"text": "A profile."}]) as conv:
            profile, research = pipeline.research("Peace Org", {"website": "https://peace.example.org",
                                                               "social": ["https://facebook.com/peace"]})
        fetched = {c.args[0] for c in f.call_args_list}
        self.assertIn("https://peace.example.org/about-us", fetched)
        self.assertIn("https://peace.example.org/our-programs/", fetched)
        self.assertNotIn("https://other.org/about", fetched)
        self.assertNotIn("https://peace.example.org/mission.pdf", fetched)
        self.assertEqual(profile, "A profile.")
        self.assertEqual(research["strength"], "rich")
        kinds = [(s["kind"], s["used"]) for s in research["sources"]]
        self.assertEqual(kinds, [("website", True)] * 3 + [("social", True), ("news", True)])
        # The prompt is split into our own text and the untrusted public text (guardContent when a guardrail is on).
        prompt = "\n".join(b.get("text") or b["guardContent"]["text"]["text"]
                           for b in conv.call_args.kwargs["messages"][0]["content"])
        self.assertIn("Peace Org, Chicago", prompt)
        self.assertNotIn("ignored", prompt)
        self.assertIn("Peace Org opens new center", prompt)
        self.assertNotIn("Another group", prompt)
        self.assertEqual(conv.call_count, 1)


@unittest.skipUnless(HAS_DB, "needs the Aurora Data API (OCI_DB_CLUSTER_ARN)")
class TeammateRole(unittest.TestCase):
    def test_shared_area_is_attributed_to_the_teammate_role(self):
        import db
        leader = client()
        token = leader.post("/api/drafts", json={"data": {"org_name": "Playwright Intake Share",
                                                          "domain_ids": ["PL", "FM"]}}).get_json()["token"]
        self.addCleanup(db.query, "DELETE FROM drafts WHERE token = :t", t=token)
        self.assertEqual(leader.post("/api/drafts/%s/share" % token, json={"area": "FM", "role": "CFO"}).status_code,
                         400)
        r = leader.post("/api/drafts/%s/share" % token, json={"area": "FM", "role": "Finance lead or bookkeeper"})
        self.assertEqual(r.get_json()["role"], "Finance lead or bookkeeper")
        share = r.get_json()["token"]
        self.assertEqual(drafts.answered_by(token, ["PL", "FM"], "Executive director"),
                         {"PL": "Executive director", "FM": "Finance lead or bookkeeper"})
        self.assertEqual(drafts.answered_by(share, ["PL", "FM"], "Executive director"),  # a share token counts for nothing
                         {"PL": "Executive director", "FM": "Executive director"})
        self.assertIsNone(drafts.answered_by(None, ["PL"], None))


if __name__ == "__main__":
    unittest.main()
