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

    def bullet(self, text, indent=4, size=11.5, h=None):
        self.set_font(FONT, "", size)
        x = self.l_margin + indent
        self.set_x(x)
        h = h or max(6.5, size * 0.56)
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


DETAILS_TITLE = "Behind the plan: your detailed results"
# Code-written words of the letter, in the report language (the AI-written parts already are).
LETTER = {
    "en": {
        "by": "Completed by", "part1": "Your plan: a letter to your team", "eyebrow": "PART 1: YOUR PLAN",
        "title": "A letter to %s", "dear": "Dear %s team,",
        "intro": "Thank you for taking the Organizational Capacity Index. Here is what I learned about you, what "
                 "you already do well, and where I would start. Your detailed results come after this letter.",
        "learned": "What we learned about you", "truth": "What's true about you",
        "strong": "What you already do well", "start": "If I were you, I would start with",
        "todo": "What to do", "based": "Based on your answers to", "resource": "Resource: ",
        "weeks": "Your next 12 weeks",
        "weeks_lead": "You do not get it all at once. Your roadmap gives you a few steps each week, and the next "
                      "week opens when you finish one (or after 7 days). Check off steps on your plan page.",
        "week": "This week, week %d: %s", "week_next": "Coming up, week %d: %s",
        "help": "How the Community Safety Fund can help",
        "support_done": "You asked for training or coaching in: %s.",
        "support_ask": "Ask for training or coaching in the areas you choose. Use \"Ask the Community Safety Fund "
                       "for support\" on your online report.",
        "peer_done": "You asked us to connect you with similar groups. We will reach out.",
        "peer_ask": "Ask us to connect you with groups like yours: a similar program model, size and growth "
                    "priorities. We share names only when both groups agree.",
        "share": "Share this letter with your team, your board, a funder or a trainer. Talk it through together.",
        "sign": "With you in the work,", "signer": "Your Capacity Coach, for the Everytown Community Safety Fund",
        "why_fallback": "This is your top-ranked growth priority in %s.",
        # research sentences
        "web": "your website", "social": ("%d social media page", "%d social media pages"),
        "news": ("%d news story", "%d news stories"), "and": "and",
        "rich": "We personalized this plan from %s.",
        "limited": "We found a little about you online (%s). Most of this plan comes from your answers.",
        "none": "We did not find much about you online, so this plan is based on your answers.",
        "answers": "This plan is based on your answers.",
    },
    "es": {
        "by": "Completado por", "part1": "Su plan: una carta para su equipo", "eyebrow": "PARTE 1: SU PLAN",
        "title": "Una carta para %s", "dear": "Estimado equipo de %s:",
        "intro": "Gracias por completar el Índice de Capacidad Organizacional. Aquí está lo que aprendí sobre "
                 "ustedes, lo que ya hacen bien y por dónde yo empezaría. Sus resultados detallados vienen después "
                 "de esta carta.",
        "learned": "Lo que aprendimos sobre ustedes", "truth": "Lo que es cierto sobre ustedes",
        "strong": "Lo que ya hacen bien", "start": "Si yo fuera ustedes, empezaría con",
        "todo": "Qué hacer", "based": "Según sus respuestas a", "resource": "Recurso: ",
        "weeks": "Sus próximas 12 semanas",
        "weeks_lead": "No reciben todo de una vez. Su hoja de ruta les da unos pasos cada semana, y la semana "
                      "siguiente se abre cuando terminan una (o después de 7 días). Marquen los pasos en su "
                      "página del plan.",
        "week": "Esta semana, semana %d: %s", "week_next": "Próximamente, semana %d: %s",
        "help": "Cómo puede ayudar el Community Safety Fund",
        "support_done": "Pidieron capacitación o acompañamiento en: %s.",
        "support_ask": "Pidan capacitación o acompañamiento en las áreas que elijan, desde su informe en línea.",
        "peer_done": "Pidieron que los conectemos con grupos similares. Nos pondremos en contacto.",
        "peer_ask": "Pidan que los conectemos con grupos como el suyo: un modelo de programa, tamaño y "
                    "prioridades de crecimiento parecidos. Solo compartimos nombres cuando ambos grupos están de "
                    "acuerdo.",
        "share": "Compartan esta carta con su equipo, su junta, un financiador o un capacitador. Conversen sobre "
                 "ella juntos.",
        "sign": "Con ustedes en este trabajo,", "signer": "Su Capacity Coach, del Everytown Community Safety Fund",
        "why_fallback": "Esta es su prioridad de crecimiento mejor clasificada en %s.",
        "web": "su sitio web", "social": ("%d página de redes sociales", "%d páginas de redes sociales"),
        "news": ("%d noticia", "%d noticias"), "and": "y",
        "rich": "Personalizamos este plan con %s.",
        "limited": "Encontramos un poco sobre ustedes en internet (%s). Casi todo este plan viene de sus "
                   "respuestas.",
        "none": "No encontramos mucho sobre ustedes en internet, así que este plan se basa en sus respuestas.",
        "answers": "Este plan se basa en sus respuestas.",
    },
}


def respondent_line(sub):
    """'Executive director (Founder and executive director)': role and title only, never the person's name."""
    r = sub.get("respondent") or {}
    role, title = (r.get("role") or "").strip(), (r.get("title") or "").strip()
    if role and title and title.lower() != role.lower():
        return "%s (%s)" % (role, title)
    return role or title


def _join(parts, word):
    return parts[0] if len(parts) == 1 else "%s %s %s" % (", ".join(parts[:-1]), word, parts[-1])


def research_line(sub, lang="en"):
    """One code-written sentence on how much the online research could personalize the plan (sub.research)."""
    t = LETTER.get(lang, LETTER["en"])
    research = sub.get("research")
    if not isinstance(research, dict):  # reports before v1.0: only a website profile, if any
        return t["rich"] % t["web"] if sub.get("org_url") and sub.get("profile") else t["answers"]
    used = [s for s in research.get("sources") or [] if isinstance(s, dict) and s.get("used")]
    count = lambda kind: sum(1 for s in used if s.get("kind") == kind)
    parts = [t["web"]] if count("website") else []
    for kind in ("social", "news"):
        n = count(kind)
        if n:
            parts.append(t[kind][n != 1] % n)
    strength = research.get("strength")
    if not parts or strength == "none":
        return t["none"]
    return (t["limited"] if strength == "limited" else t["rich"]) % _join(parts, t["and"])


def _profile_blurb(sub):
    """The first two sentences of the research profile, unless research found nothing."""
    profile = (sub.get("profile") or "").strip()
    research = sub.get("research") if isinstance(sub.get("research"), dict) else {}
    if not profile or research.get("strength") == "none" or profile.startswith("The website could not be"):
        return ""
    sentences = [s for s in profile.replace("\n", " ").split(". ") if s.strip()]
    return ". ".join(sentences[:2]).rstrip(".") + "."


def first_weeks(sub, n=3):
    """The first weeks of the code-built 12-week roadmap (features/milestones.py), if that feature is present."""
    try:
        from features import milestones
        roadmap = milestones.build_roadmap(sub)
        weeks = roadmap.get("weeks") if isinstance(roadmap, dict) else roadmap
        return [w for w in weeks or [] if isinstance(w, dict) and w.get("tasks")][:n]
    except Exception:  # no roadmap feature, or a report it cannot use: the letter just skips the section
        return []


def _focus_items(sub, t):
    """Start here: the validated AI items, or (no AI report) the same code choice explained with engine text."""
    focus = ((sub.get("report") or {}).get("focus")) or []
    if focus:
        return focus
    from pipeline import choose_focus
    return [{"title": g["question_text"], "why": t["why_fallback"] % g["domain_name"], "gap_ids": [g["question_id"]],
             "steps": _steps(g.get("next_steps") or [])[:4], "resource": None}
            for g in choose_focus(sub.get("gaps") or [])]


LS, LH = 11, 5.8  # letter body size and line height: keeps the letter to about two pages


def _letter_head(pdf, text):
    if pdf.will_page_break(24):
        pdf.add_page()
    pdf.start_section(text, level=1)
    pdf.ln(2.5)
    pdf.set_font(FONT, "B", 13.5)
    pdf.set_text_color(*ACCENT)
    pdf.multi_cell(0, 7, text, align="L", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*INK)
    pdf.ln(0.5)


def _letter(pdf, sub, t):
    """Pages 2 to 3: what we learned, what's true, strengths, where to start, the first weeks, how CSF helps."""
    report = sub.get("report") or {}
    org = sub["org_name"]
    para = lambda text, **kw: pdf.para(text, **{"size": LS, "h": LH, **kw})
    bullet = lambda text: pdf.bullet(text, size=LS, h=LH)
    pdf.add_page()
    pdf.start_section(t["part1"], level=0)
    pdf.set_font(FONT, "B", 10)
    pdf.set_text_color(*LINK)
    pdf.cell(0, 6, t["eyebrow"], new_x="LMARGIN", new_y="NEXT")
    pdf.set_font(FONT, "B", 20)
    pdf.set_text_color(*ACCENT)
    pdf.multi_cell(0, 10, t["title"] % org, align="L", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*INK)
    pdf.ln(2)
    para(t["dear"] % org, style="B")
    para(t["intro"])

    _letter_head(pdf, t["learned"])
    para(research_line(sub, sub.get("language") or "en"))
    blurb = _profile_blurb(sub)
    if blurb:
        para(blurb, size=10, color=MUTED, h=5.4)

    _letter_head(pdf, t["truth"])
    if report.get("summary"):
        for p in [p.strip() for p in report["summary"].split("\n\n") if p.strip()]:
            para(p)
            pdf.ln(1.5)
    else:
        for part in _fallback_summary(sub):
            if isinstance(part, str):
                para(part)
            else:
                para(part[0], style="B")
                for line in part[1]:
                    bullet(line)
    if report.get("strengths"):
        _letter_head(pdf, t["strong"])
        for s in report["strengths"]:
            bullet(s)

    focus = _focus_items(sub, t)
    if focus:
        gap_text = {g["question_id"]: g["question_text"] for g in sub.get("gaps") or []}
        _letter_head(pdf, t["start"])
        for i, f in enumerate(focus, 1):
            if pdf.will_page_break(36):
                pdf.add_page()
            para("%d. %s" % (i, f["title"]), style="B", size=12.5, h=6.5)
            if f.get("why"):
                para(f["why"])
            stmts = [gap_text[g] for g in f.get("gap_ids") or [] if g in gap_text]
            if stmts:
                para("%s: %s." % (t["based"], "; ".join(s.rstrip(". ") for s in stmts)), size=10, color=MUTED, h=5.4)
            if f.get("steps"):
                para(t["todo"], style="B")
                for s in f["steps"]:
                    bullet(s)
            res = f.get("resource")
            if res and res.get("url"):
                pdf.set_font(FONT, "B", LS)
                pdf.write(LH, t["resource"])
                pdf.set_font(FONT, "U", LS)
                pdf.set_text_color(*LINK)
                pdf.write(LH, res.get("title") or res["url"], link=res["url"])
                pdf.set_text_color(*INK)
                pdf.ln(LH + 1)
            pdf.ln(1.5)

    weeks = first_weeks(sub)
    if weeks:
        _letter_head(pdf, t["weeks"])
        para(t["weeks_lead"])
        for i, w in enumerate(weeks, 1):
            n = w.get("week") or i
            if i > 1:  # later weeks unlock one at a time on the plan page, so the letter only names them
                para(t["week_next"] % (n, w.get("title") or ""))
                continue
            para(t["week"] % (n, w.get("title") or ""), style="B")
            for task in w.get("tasks") or []:
                text = task.get("text") if isinstance(task, dict) else str(task)
                owner = task.get("owner") if isinstance(task, dict) else None
                bullet("%s (%s)" % (text, owner) if owner else text)
            pdf.ln(1)

    _letter_head(pdf, t["help"])
    support = sub.get("support") or {}
    names = {d["domain_id"]: d["domain_name"] for d in sub["domains"]}
    bullet(t["support_done"] % ", ".join(names.get(d, d) for d in support["domain_ids"])
           if support.get("domain_ids") else t["support_ask"])
    bullet(t["peer_done"] if sub.get("peer_request") else t["peer_ask"])
    bullet(t["share"])
    pdf.ln(3)
    para(t["sign"])
    para(t["signer"], style="B")


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
    t = LETTER.get(lang, LETTER["en"])
    pdf.add_page()
    pdf.start_section("Cover", level=0)
    pdf.ln(30)
    pdf.set_font(FONT, "B", 28)
    pdf.set_text_color(*ACCENT)
    pdf.multi_cell(0, 13, "Organizational Capacity Index", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*INK)
    pdf.para("Capacity Coach report: your plan, then your detailed results", size=15, h=8)
    pdf.ln(10)
    pdf.para(sub["org_name"], style="B", size=20, h=10)
    if sub.get("org_url"):
        pdf.set_font(FONT, "U", 12)
        pdf.set_text_color(*LINK)
        pdf.cell(0, 7, sub["org_url"], link=sub["org_url"], new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*INK)
    pdf.para(sub.get("created", ""), size=12, color=MUTED, h=7)
    who = respondent_line(sub)
    if who:
        pdf.para("%s: %s" % (t["by"], who), size=12, h=7)
    pdf.ln(8)
    pdf.para("Community Safety Fund | Everytown for Gun Safety", style="B", size=13, h=7)
    pdf.ln(14)
    pdf.callout("Generated from synthetic or scrubbed data for the AWS Breaking Barriers demo.\n\n"
                "Recommendations generated with AI (Claude on Amazon Bedrock) from your answers and the CVI "
                "resource library. Scores are calculated by a fixed scoring method.")

    # 2. Part one: a short, conversational letter (the Everytown rep: "two pages that are conversational")
    _letter(pdf, sub, t)

    # 3. Part two: everything behind the plan
    pdf.h1(DETAILS_TITLE)
    pdf.para("The letter gave you the short version. These pages hold the numbers behind it: your stages and "
             "scores by area, the full 30 / 60 / 90 day plan, every growth priority with next steps, a team "
             "conversation guide, and a record of every answer. Scores come from a fixed scoring method.")
    pdf.ln(2)
    if report and report.get("summary") and report.get("reading_grade") is not None:  # English only
        pdf.para("Reading level of your letter: about grade %d (Flesch-Kincaid formula). We aim for grade 8 or "
                 "lower." % round(report["reading_grade"]), size=10, color=MUTED)

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
