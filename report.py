"""Render a submission (scores, gaps, AI report) to an accessible PDF with fpdf2."""
import os

from fpdf import FPDF
from fpdf.fonts import FontFace

from utils.data_loader import get_domains

FONT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend", "public", "fonts")
FONT = "Atkinson"
HEADER = "Organizational Capacity Index · Community Safety Fund | Everytown for Gun Safety"
INK = (20, 20, 20)
MUTED = (70, 70, 70)
ACCENT = (0, 28, 96)  # Everytown navy #001C60, contrast > 15:1 on white
LINK = (13, 61, 217)  # Everytown royal blue #0D3DD9, contrast > 6:1 on white
HEAD_FILL = (225, 232, 242)
CALLOUT_FILL = (242, 245, 250)
STAGE_NAMES = ["Seeding", "Emerging", "Developing", "Strengthening", "Transformational"]
HORIZON_LABEL = {30: "First 30 days", 60: "Days 31 to 60", 90: "Days 61 to 90"}


class _PDF(FPDF):
    def header(self):
        if self.page_no() == 1:
            return
        self.set_font(FONT, "", 9)
        self.set_text_color(*MUTED)
        self.cell(0, 6, HEADER, new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(*ACCENT)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(4)
        self.set_text_color(*INK)

    def footer(self):
        self.set_y(-14)
        self.set_font(FONT, "", 9)
        self.set_text_color(*MUTED)
        self.cell(0, 8, "Page %d of {nb}" % self.page_no(), align="C")
        self.set_text_color(*INK)

    # Layout helpers
    def h1(self, text, new_page=True):
        if new_page:
            self.add_page()
        self.start_section(text, level=0)
        self.set_font(FONT, "B", 20)
        self.set_text_color(*ACCENT)
        self.multi_cell(0, 10, text, new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(*INK)
        self.ln(2)

    def h2(self, text, bookmark=True):
        if self.will_page_break(30):
            self.add_page()
        if bookmark:
            self.start_section(text, level=1)
        self.ln(2)
        self.set_font(FONT, "B", 15)
        self.set_text_color(*ACCENT)
        self.multi_cell(0, 8, text, new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(*INK)
        self.ln(1)

    def para(self, text, style="", size=11.5, color=INK, h=6.5):
        self.set_font(FONT, style, size)
        self.set_text_color(*color)
        self.multi_cell(0, h, text, align="L", new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(*INK)

    def bullet(self, text, indent=4, size=11.5):
        self.set_font(FONT, "", size)
        x = self.l_margin + indent
        self.set_x(x)
        h = max(6.5, size * 0.56)
        self.cell(5, h, "•")
        self.multi_cell(self.w - self.r_margin - x - 5, h, text, align="L", new_x="LMARGIN", new_y="NEXT")

    def link_line(self, label, title, url, size=11.5):
        self.set_font(FONT, "B", size)
        self.write(6.5, label)
        self.set_font(FONT, "", size)
        self.write(6.5, title + " ")
        if url:
            self.set_text_color(*LINK)
            self.set_font(FONT, "U", size)
            self.write(6.5, url, link=url)
            self.set_text_color(*INK)
        self.ln(7)

    def callout(self, text, size=11):
        self.set_font(FONT, "", size)
        self.set_fill_color(*CALLOUT_FILL)
        self.set_draw_color(*ACCENT)
        self.multi_cell(0, 6.5, text, border=1, fill=True, padding=3, align="L", new_x="LMARGIN", new_y="NEXT")
        self.ln(3)

    def grid(self, headings, rows, widths, align=None, size=10):
        self.set_font(FONT, "", size)
        self.set_draw_color(150, 150, 150)
        with self.table(col_widths=widths, line_height=5.5, text_align=align or "LEFT",
                        headings_style=FontFace(emphasis="BOLD", fill_color=HEAD_FILL, color=INK),
                        padding=1.5, repeat_headings=1) as table:
            table.row(headings)
            for r in rows:
                table.row([str(c) for c in r])
        self.ln(4)


def _fallback_summary(sub):
    domains = sub["domains"]
    o = sub["overall"]
    strong = sorted([d for d in domains if d["score_pct"] >= 70], key=lambda d: -d["score_pct"])[:3]
    weak = sorted([d for d in domains if d["score_pct"] < 50], key=lambda d: d["score_pct"])[:3]
    fmt = lambda d: "%s (%s%% capacity, %d growth priorities)" % (d["domain_name"], d["score_pct"], d["gap_count"])
    parts = ["Your organization was assessed across %d domains with %d total statements. %d growth priorities were identified."
             % (len(domains), o["total_questions"], o["total_gaps"])]
    if strong:
        parts.append(("Key strengths:", [fmt(d) for d in strong]))
    if weak:
        parts.append(("Priority areas:", [fmt(d) for d in weak]))
    parts.append("%d high-priority items are recommended for attention first." % o["high"])
    return parts


def _steps(next_steps):
    if isinstance(next_steps, str):
        next_steps = next_steps.split("\n")
    return [s.strip() for s in next_steps if s.strip()]


def build_pdf(sub, stage_descriptions):
    report = sub.get("report") or None
    gaps = sub.get("gaps") or []
    overall = sub["overall"]
    lang = sub.get("language") or "en"
    by_domain = {}
    for g in gaps:
        by_domain.setdefault(g["domain_id"], []).append(g)

    pdf = _PDF(format="Letter")
    for style, suffix in (("", "Regular"), ("B", "Bold"), ("I", "Italic"), ("BI", "BoldItalic")):
        pdf.add_font(FONT, style, os.path.join(FONT_DIR, "AtkinsonHyperlegible-%s.ttf" % suffix))
    # Atkinson lacks arrows and math symbols the AI text may use; Noto Sans Math fills those glyphs.
    pdf.add_font("NotoMath", "", os.path.join(FONT_DIR, "NotoSansMath-Regular.ttf"))
    pdf.set_fallback_fonts(["NotoMath"], exact_match=False)
    pdf.set_title("Organizational Capacity Index: %s" % sub["org_name"])
    pdf.set_author("Community Safety Fund | Everytown for Gun Safety")
    pdf.set_subject("Capacity Coach report: response record and recommendations")
    pdf.set_creator("OCI Capacity Coach")
    pdf.set_lang(lang)
    pdf.set_margins(20, 18, 20)
    pdf.set_auto_page_break(True, margin=20)
    pdf.set_text_color(*INK)

    # 1. Cover
    pdf.add_page()
    pdf.start_section("Cover", level=0)
    pdf.ln(30)
    pdf.set_font(FONT, "B", 28)
    pdf.set_text_color(*ACCENT)
    pdf.multi_cell(0, 13, "Organizational Capacity Index", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*INK)
    pdf.para("Capacity Coach report: response record and recommendations", size=15, h=8)
    pdf.ln(10)
    pdf.para(sub["org_name"], style="B", size=20, h=10)
    if sub.get("org_url"):
        pdf.set_font(FONT, "U", 12)
        pdf.set_text_color(*LINK)
        pdf.cell(0, 7, sub["org_url"], link=sub["org_url"], new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*INK)
    pdf.para(sub.get("created", ""), size=12, color=MUTED, h=7)
    pdf.ln(8)
    pdf.para("Community Safety Fund | Everytown for Gun Safety", style="B", size=13, h=7)
    pdf.ln(14)
    pdf.callout("Generated from synthetic or scrubbed data for the AWS Breaking Barriers demo.\n\n"
                "Recommendations generated with AI (Claude on Amazon Bedrock) from your answers and the CVI "
                "resource library. Scores are calculated by a fixed scoring method.")

    # 2. Executive summary ("What's true about you" when the AI wrote it)
    pdf.h1("What's true about you" if report and report.get("summary") else "Executive summary")
    if report and report.get("summary"):
        for p in [p.strip() for p in report["summary"].split("\n\n") if p.strip()]:
            pdf.para(p)
            pdf.ln(2)
        if report.get("reading_grade") is not None:  # English only; measured by pipeline.reading_grade
            pdf.para("Reading level: about grade %d (Flesch-Kincaid formula). We aim for grade 8 or lower."
                     % round(report["reading_grade"]), size=10, color=MUTED)
    else:
        for part in _fallback_summary(sub):
            if isinstance(part, str):
                pdf.para(part)
            else:
                pdf.ln(1)
                pdf.para(part[0], style="B")
                for line in part[1]:
                    pdf.bullet(line)
            pdf.ln(2)
    focus = (report or {}).get("focus") or []
    if focus:
        gap_text = {g["question_id"]: g["question_text"] for g in gaps}
        if pdf.will_page_break(60):
            pdf.add_page()
        pdf.start_section("Start here: your top priorities", level=1)
        pdf.ln(4)
        pdf.set_font(FONT, "B", 18)
        pdf.set_text_color(*ACCENT)
        pdf.multi_cell(0, 9, "Start here: your top priorities", new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*INK)
        pdf.para("If you only do one or two things first, do these.", size=12.5, h=7)
        pdf.ln(2)
        for i, f in enumerate(focus, 1):
            if pdf.will_page_break(50):
                pdf.add_page()
            pdf.set_draw_color(*ACCENT)
            pdf.set_line_width(0.8)
            pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
            pdf.set_line_width(0.2)
            pdf.ln(3)
            pdf.para("%d. %s" % (i, f["title"]), style="B", size=15, h=8)
            if f.get("why"):
                pdf.para(f["why"], size=12.5, h=7)
            stmts = [(gid, gap_text[gid]) for gid in f.get("gap_ids") or [] if gid in gap_text]
            if stmts:
                pdf.ln(1)
                pdf.para("Based on your answers:", style="B", size=12.5, h=7)
                for gid, text in stmts:
                    pdf.bullet("%s: %s" % (gid, text), size=12.5)
            if f.get("steps"):
                pdf.ln(1)
                pdf.para("What to do", style="B", size=12.5, h=7)
                for s in f["steps"]:
                    pdf.bullet(s, size=12.5)
            res = f.get("resource")
            if res:
                pdf.ln(1)
                pdf.link_line("Resource: ", res.get("title", ""), res.get("url"), size=12.5)
            pdf.ln(4)
    if report and report.get("strengths"):
        pdf.h2("What you already do well")
        for s in report["strengths"]:
            pdf.bullet(s)

    # 2b. Progress since the previous assessment
    prog = sub.get("progress")
    if prog:
        pdf.h2("Progress since your last assessment")
        closed, new, stages = prog.get("closed") or [], prog.get("new") or [], prog.get("stages") or []
        if not (closed or new or stages):
            pdf.para("Your answers match your assessment on %s." % prog.get("previous_created", ""))
        else:
            pdf.para("Compared with your assessment on %s, over the areas both assessments covered."
                     % prog.get("previous_created", ""))
            pdf.para("Closed growth priorities: %d  |  New growth priorities: %d" % (len(closed), len(new)), style="B")
            pdf.ln(2)
            if stages:
                name = lambda s: STAGE_NAMES[s - 1] if isinstance(s, int) and 1 <= s <= 5 else str(s or "")
                pdf.grid(["Area", "Then", "Now"],
                         [["%s · %s" % (s["domain_id"], s["domain_name"]), name(s.get("from")), name(s.get("to"))]
                          for s in stages], (80, 44, 44))
            for title, items in (("Closed growth priorities", closed), ("New growth priorities", new)):
                if items:
                    pdf.para(title, style="B")
                    for it in items:
                        pdf.bullet("%s: %s" % (it["id"], it["text"]))
                    pdf.ln(2)

    # 3. Organization profile
    if sub.get("profile"):
        pdf.h2("Organization profile")
        pdf.para(sub["profile"])

    # 4. Assessment overview
    pdf.h2("Assessment overview")
    pdf.grid(["Statements assessed", "Growth priorities", "High", "Medium", "Low"],
             [[overall["total_questions"], overall["total_gaps"], overall["high"], overall["medium"], overall["low"]]],
             (34, 30, 18, 18, 18), align="CENTER", size=11)
    pdf.para("Overall favorable response rate: %s%% (%d of %d statements). The per-domain percentages below are "
             "the figures used in planning; the overall rate is a headline only and is not an input to any scoring "
             "decision." % (overall["favorable_pct"], overall["favorable"], overall["total_questions"]))

    # 5. Domain results
    pdf.h2("Domain results")
    pdf.grid(["Domain", "Estimated stage", "Capacity", "Growth priorities", "High priority"],
             [["%s · %s" % (d["domain_id"], d["domain_name"]), d["estimated_stage"], "%s%%" % d["score_pct"],
               "%d / %d" % (d["gap_count"], d["total_questions"]),
               d.get("high_count", sum(g["priority"] == "High" for g in by_domain.get(d["domain_id"], [])))]
              for d in sub["domains"]],
             (62, 32, 22, 30, 22))
    pdf.para("Stage key", style="B")
    for i, name in enumerate(STAGE_NAMES, 1):
        pdf.set_font(FONT, "B", 11)
        pdf.write(6.5, "%d. %s: " % (i, name))
        pdf.set_font(FONT, "", 11)
        pdf.write(6.5, stage_descriptions.get(name, ""))
        pdf.ln(7.5)

    # 6. 30 / 60 / 90 day action plan
    if report and report.get("plan"):
        pdf.h1("30 / 60 / 90 day action plan")
        for horizon in (30, 60, 90):
            items = [p for p in report["plan"] if p.get("horizon") == horizon]
            if not items:
                continue
            pdf.h2(HORIZON_LABEL[horizon])
            for it in items:
                if pdf.will_page_break(40):
                    pdf.add_page()
                pdf.para(it["title"], style="B", size=12.5, h=7)
                for label, key in (("Owner: ", "owner"), ("Why: ", "why")):
                    if it.get(key):
                        pdf.set_font(FONT, "B", 11.5)
                        pdf.write(6.5, label)
                        pdf.set_font(FONT, "", 11.5)
                        pdf.write(6.5, it[key])
                        pdf.ln(7)
                for s in it.get("steps") or []:
                    pdf.bullet(s)
                if it.get("gap_ids"):
                    pdf.para("Based on: " + ", ".join(it["gap_ids"]), size=10.5, color=MUTED)
                res = it.get("resource")
                if res:
                    pdf.link_line("Resource: ", res.get("title", ""), res.get("url"))
                pdf.ln(3)

    # 7. Priority action plan
    pdf.h1("Priority action plan")
    top = gaps[:12]
    pdf.para("The %d highest-scoring growth priorities across all assessed domains, ranked by priority score. "
             "Full domain-by-domain detail follows." % len(top))
    pdf.ln(2)
    if top:
        pdf.grid(["#", "ID", "Domain", "Statement", "Score", "Priority"],
                 [[i, g["question_id"], g["domain_name"], g["question_text"], "%.2f" % g["score"], g["priority"]]
                  for i, g in enumerate(top, 1)],
                 (8, 14, 32, 82, 14, 18))

    # 8. Recommendations by domain
    pdf.h1("Recommendations by domain")
    pdf.para("Every growth priority, grouped by domain and ordered by priority score. Domains with no growth "
             "priorities are listed as complete and carry no recommendations.")
    for d in sub["domains"]:
        pdf.h2("%s · %s" % (d["domain_id"], d["domain_name"]))
        pdf.para("Capacity %s%%  |  Estimated stage: %s  |  Growth priorities: %d of %d"
                 % (d["score_pct"], d["estimated_stage"], d["gap_count"], d["total_questions"]), size=11, color=MUTED)
        pdf.ln(2)
        dg = sorted(by_domain.get(d["domain_id"], []), key=lambda g: -g["score"])
        if not dg:
            pdf.callout("No growth priorities identified. Every statement in this domain was answered favorably. No "
                        "action items are generated. Revisit at the next assessment cycle to confirm the capacity has held.")
        for g in dg:
            if pdf.will_page_break(35):
                pdf.add_page()
            pdf.para("[%s]  %s:  %s" % (g["priority"], g["question_id"], g["question_text"]), style="B")
            pdf.para("Stage: %s  ·  Priority score: %.2f" % (g["stage_name"], g["score"]), size=10.5, color=MUTED)
            pdf.para("Suggested next steps:", size=11)
            for s in _steps(g.get("next_steps") or []):
                pdf.bullet(s, size=11)
            pdf.ln(3)

    # 9. Conversation guide and sources
    if report and (report.get("conversation") or report.get("sources")):
        pdf.h1("Team conversation guide")
        for i, q in enumerate(report.get("conversation") or [], 1):
            pdf.set_font(FONT, "B", 11.5)
            pdf.cell(8, 6.5, "%d." % i)
            pdf.set_font(FONT, "", 11.5)
            pdf.multi_cell(0, 6.5, q, align="L", new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1)
        if report.get("sources"):
            pdf.h2("Sources consulted")
            for s in report["sources"]:
                pdf.link_line("• ", s.get("title", ""), s.get("url"))

    # 10. Appendix A: full response record
    pdf.h1("Appendix A: Full response record")
    answers = sub.get("answers") or {}
    n = sum(d["total_questions"] for d in sub["domains"])
    pdf.para('The complete answer set submitted for %s: all %d statements, in questionnaire order. "Favorable" '
             "means the answer did not register a growth priority. For reverse-coded statements (marked †) the "
             "favorable answer is No." % (sub["org_name"], n))
    bank = {d["id"]: d for d in get_domains()}
    for d in sub["domains"]:
        pdf.h2("%s · %s" % (d["domain_id"], d["domain_name"]))
        rows = []
        for q in bank[d["domain_id"]]["questions"]:
            a = (answers.get(q["id"]) or "").lower()
            rows.append([q["id"], q["text"] + (" †" if q["trigger_on"] == "yes" else ""),
                         a.capitalize() or "Not answered", q["stage"],
                         "Growth priority" if a == q["trigger_on"] else "Yes"])
        pdf.grid(["ID", "Statement", "Answer", "Stage", "Favorable"], rows, (14, 96, 18, 14, 26))

    return bytes(pdf.output())
