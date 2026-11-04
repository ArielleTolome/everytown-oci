"""Layered report (v1.0): the PDF opens with a short letter before the detailed results, says how much the online
research personalized it, never prints the respondent's name, and survives a missing roadmap. Peer requests are
owner-only."""
import io
import os
import sys
import unittest
from unittest import mock

from pypdf import PdfReader

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app  # noqa: E402
import report  # noqa: E402
from features import peers_request  # noqa: E402

SID = "22222222-2222-2222-2222-222222222222"


def _sub(language="en"):
    domains = app._domains(["PL", "FM"])
    answers = {q["id"]: "no" for d in domains for q in d["questions"]}
    answers.update({"PL1": "no", "FM1": "yes", "FM2": "yes"})
    sub = app.build_assessment({"org_name": "Playwright Letter Org", "org_url": "", "language": language},
                               answers, domains)
    top = sub["gaps"][0]["question_id"]
    sub.update(status="done", respondent={"name": "Jordan Secretname", "title": "Founder", "role": "Executive director"},
               report={"summary": "Here's what I've learned about you.\n\nIf I were you, I would start small.",
                       "strengths": ["You keep an annual budget."],
                       "focus": [{"title": "Write a one-page plan", "why": "It unlocks the rest.", "gap_ids": [top],
                                  "steps": ["Meet for one hour."], "resource": None}],
                       "plan": [{"horizon": 30, "title": "Draft goals", "why": "Shared direction.", "gap_ids": [top],
                                 "owner": "Executive director", "steps": ["List 3 goals."], "resource": None}],
                       "conversation": ["What should we stop doing?"], "sources": []})
    return sub


def _pdf(sub):
    reader = PdfReader(io.BytesIO(report.build_pdf(sub, app.INFO["stage_descriptions"])))
    return reader, [p.extract_text() for p in reader.pages]


def _page_of(pages, text):
    return next(i for i, p in enumerate(pages) if text in p)


class LetterFirst(unittest.TestCase):
    def test_letter_pages_come_before_the_detailed_results(self):
        reader, pages = _pdf(_sub())
        self.assertIn("Completed by: Executive director (Founder)", pages[0])
        self.assertTrue(all("Jordan" not in p and "Secretname" not in p for p in pages))
        letter = _page_of(pages, "Dear Playwright Letter Org team,")
        self.assertEqual(letter, 1)  # right after the cover
        order = ["Summary about your organization", "What you already do well",
                 "If I were you, I would start with", "How the Community Safety Fund can help",
                 "What we learned about you", report.DETAILS_TITLE, "Domain results", "Appendix A: Full response record"]
        positions = [_page_of(pages, t) for t in order]
        self.assertEqual(positions, sorted(positions))
        self.assertLess(_page_of(pages, "Write a one-page plan"), _page_of(pages, report.DETAILS_TITLE))
        top = [o.title for o in reader.outline if not isinstance(o, list)]
        self.assertEqual(top[:3], ["Cover", report.LETTER["en"]["part1"], report.DETAILS_TITLE])

    def test_spanish_letter_uses_spanish_frame(self):
        _, pages = _pdf(_sub("es"))
        self.assertIn("Completado por:", pages[0])
        self.assertIn("Si yo fuera ustedes, empezaría con", "".join(pages[1:3]))
        self.assertIn("Resumen de su organización", pages[1])
        self.assertIn("Confidencial. Este informe contiene", pages[-1])
        self.assertIn("Página 1 de %d" % len(pages), pages[0])

    def test_every_page_is_marked_and_the_pdf_ends_confidential(self):
        sub = _sub()
        sub["report"]["reading_grade"] = 7.2
        reader, pages = _pdf(sub)
        self.assertTrue(all(len(p.images) == 1 for p in reader.pages))  # the Everytown mark, behind the content
        self.assertTrue(all("Confidential: for your organization" in p for p in pages))
        self.assertIn("Confidential. This report contains proprietary", pages[-1])
        self.assertNotIn("Reading level", "".join(pages))

    def test_roadmap_failure_only_skips_the_weeks(self):
        with mock.patch("features.milestones.build_roadmap", side_effect=KeyError("focus"), create=True):
            _, pages = _pdf(_sub())
        self.assertNotIn("Your next 12 weeks", "".join(pages))
        self.assertIn("How the Community Safety Fund can help", "".join(pages))

    def test_weeks_show_this_week_tasks_and_later_titles(self):
        weeks = [{"week": n, "title": "Title %d" % n, "tasks": [{"text": "Task %d" % n, "owner": "Board"}]}
                 for n in (1, 2, 3, 4)]
        with mock.patch.object(report, "first_weeks", return_value=weeks[:3]):
            _, pages = _pdf(_sub())
        text = "".join(pages)
        self.assertIn("This week, week 1: Title 1", text)
        self.assertIn("Task 1 (Board)", text)
        self.assertIn("Coming up, week 3: Title 3", text)
        self.assertNotIn("Task 2", text)  # later weeks unlock one at a time


class ResearchLine(unittest.TestCase):
    def src(self, kind, used=True):
        return {"kind": kind, "url": "https://example.org/" + kind, "title": kind, "used": used}

    def test_counts_only_sources_that_were_used(self):
        sub = {"research": {"strength": "rich", "sources": [self.src("website"), self.src("social"), self.src("social"),
                                                            self.src("social", used=False), self.src("news")]}}
        self.assertEqual(report.research_line(sub),
                         "We personalized this plan from your website, 2 social media pages and 1 news story.")

    def test_limited_none_and_old_reports(self):
        limited = {"research": {"strength": "limited", "sources": [self.src("social")]}}
        self.assertIn("We found a little about you online (1 social media page)", report.research_line(limited))
        nothing = {"research": {"strength": "none", "sources": [self.src("website", used=False)]}}
        self.assertTrue(report.research_line(nothing).startswith("We did not find much about you online"))
        self.assertEqual(report.research_line({"org_url": "https://x.org", "profile": "A group."}),
                         "We personalized this plan from your website.")
        self.assertEqual(report.research_line({}), "This plan is based on your answers.")


class PeerRequest(unittest.TestCase):
    def setUp(self):
        self.client = app.app.test_client()
        for target, name, kw in ((app, "load", {"return_value": {"id": SID}}),
                                 (app.db, "owner_of", {"return_value": "me"}),
                                 (peers_request, "_save", {"return_value": {"requested_at": "2026-11-03 20:00 UTC"}})):
            p = mock.patch.object(target, name, **kw)
            self.addCleanup(p.stop)
            setattr(self, name, p.start())

    def login(self, owner, role="org"):
        with self.client.session_transaction() as s:
            s["user"], s["owner"] = {"name": role, "role": role}, owner

    def post(self):
        return self.client.post("/api/assessments/%s/peer-request" % SID, json={})

    def test_only_the_submitting_session_may_ask(self):
        self.assertEqual(self.post().status_code, 401)
        self.login("someone-else")
        self.assertEqual(self.post().status_code, 403)
        self.login("someone-else", role="staff")  # staff make introductions themselves; they don't file requests
        self.assertEqual(self.post().status_code, 403)
        self._save.assert_not_called()
        self.login("me")
        res = self.post()
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json(), {"peer_request": {"requested_at": "2026-11-03 20:00 UTC"}})
        self._save.assert_called_once_with(SID)

    def test_unknown_report(self):
        self.login("me")
        self.load.return_value = None
        self.assertEqual(self.post().status_code, 404)


if __name__ == "__main__":
    unittest.main()
