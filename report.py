"""Render the assessment scores and recommendation text to a PDF."""
from fpdf import FPDF

_PUNCT = str.maketrans({"\u2014": "-", "\u2013": "-", "\u2018": "'", "\u2019": "'",
                        "\u201c": '"', "\u201d": '"', "\u2022": "-", "\u2026": "...", "\u00a0": " "})


def _latin1(text):
    # Core PDF fonts are Latin-1 only and no Unicode TTF ships with the app.
    return text.translate(_PUNCT).encode("latin-1", "replace").decode("latin-1")


def build_pdf(sub):
    pdf = FPDF()
    pdf.set_auto_page_break(True, margin=15)
    pdf.add_page()
    w = pdf.epw

    pdf.set_font("Helvetica", "B", 18)
    pdf.multi_cell(w, 9, _latin1("Organizational Capacity Index"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 12)
    pdf.multi_cell(w, 7, _latin1("%s  |  %s" % (sub["org_name"], sub["org_url"])), new_x="LMARGIN", new_y="NEXT")
    pdf.multi_cell(w, 7, "Submitted %s UTC" % sub["created"], new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 13)
    pdf.cell(w, 8, "Scores", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    with pdf.table(col_widths=(50, 20, 30, 20)) as table:
        table.row(["Domain", "Capacity", "Estimated stage", "Gaps"])
        for d in sub["domains"]:
            table.row([_latin1(d["domain_name"]), "%s%%" % d["score_pct"], d["estimated_stage"],
                       "%d / %d" % (d["gap_count"], d["total_questions"])])
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 13)
    pdf.cell(w, 8, "Recommendations", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    pdf.multi_cell(w, 6, _latin1(sub.get("recommendations") or "Recommendations not available."))
    return bytes(pdf.output())
