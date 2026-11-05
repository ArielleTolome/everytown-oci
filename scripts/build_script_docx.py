"""Render docs/pitch/demo-script.md to docs/pitch/OCI-Capacity-Coach-script.docx (Word), in the app's colours.

Needs python-docx (pip install python-docx). Handles the Markdown the script uses: headings, paragraphs, bullet and
numbered lists, tables, code blocks, **bold**, `code` and [links](url). Rebuild it after editing the script.
"""
import pathlib
import re

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.opc.constants import RELATIONSHIP_TYPE
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor, Inches

PITCH = pathlib.Path(__file__).resolve().parent.parent / "docs" / "pitch"
NAVY, ROYAL, MID, PALE = RGBColor(0x00, 0x1C, 0x60), RGBColor(0x0D, 0x3D, 0xD9), RGBColor(0x45, 0x5F, 0xA0), "F2F5FC"
# Word has no font fallback, so common fonts close to the site's (Atkinson Hyperlegible, Source Serif 4).
SANS, SERIF = "Arial", "Georgia"
INLINE = re.compile(r"\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)")


def shade(cell, fill):
    pr = cell._tc.get_or_add_tcPr()
    sh = OxmlElement("w:shd")
    sh.set(qn("w:val"), "clear"), sh.set(qn("w:color"), "auto"), sh.set(qn("w:fill"), fill)
    pr.append(sh)


def link(par, text, url):
    rel = par.part.relate_to(url, RELATIONSHIP_TYPE.HYPERLINK, is_external=True)
    h = OxmlElement("w:hyperlink")
    h.set(qn("r:id"), rel)
    r = OxmlElement("w:r")
    rpr = OxmlElement("w:rPr")
    for tag, val in (("w:color", "0D3DD9"), ("w:u", "single")):
        e = OxmlElement(tag)
        e.set(qn("w:val"), val)
        rpr.append(e)
    r.append(rpr)
    t = OxmlElement("w:t")
    t.text = text
    t.set(qn("xml:space"), "preserve")
    r.append(t)
    h.append(r)
    par._p.append(h)


def inline(par, text, bold=False, color=None):
    pos = 0
    for m in INLINE.finditer(text):
        if m.start() > pos:
            run = par.add_run(text[pos:m.start()])
            run.bold, run.font.color.rgb = bold, color
        if m.group(1) is not None:
            run = par.add_run(m.group(1))
            run.bold, run.font.color.rgb = True, color
        elif m.group(2) is not None:
            run = par.add_run(m.group(2))
            run.font.name, run.bold, run.font.color.rgb = "Consolas", bold, color
        else:
            url = m.group(4)
            link(par, m.group(3).strip("`"), url if "://" in url else "https://github.com/ArielleTolome/everytown-oci/blob/main/docs/pitch/" + url)
        pos = m.end()
    if pos < len(text):
        run = par.add_run(text[pos:])
        run.bold, run.font.color.rgb = bold, color


def table(doc, rows):
    cells = [[c.strip() for c in r.strip().strip("|").split("|")] for r in rows if not re.match(r"^\|[\s|:-]+\|$", r.strip())]
    t = doc.add_table(rows=len(cells), cols=len(cells[0]))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, row in enumerate(cells):
        for j, text in enumerate(row):
            cell = t.cell(i, j)
            cell.paragraphs[0].paragraph_format.space_after = Pt(2)
            if i == 0:
                shade(cell, "001C60")
                inline(cell.paragraphs[0], text, bold=True, color=RGBColor(0xFF, 0xFF, 0xFF))
            else:
                if i % 2 == 0:
                    shade(cell, PALE)
                inline(cell.paragraphs[0], text)
    # The "Say" column holds the words to read out loud: give it the room.
    say = [j for j, h in enumerate(cells[0]) if h in ("Say", "Short answer")]
    if say:
        for j in range(len(cells[0])):
            for row in t.rows:
                row.cells[j].width = Inches(4.2 if j == say[0] else 1.1)
    doc.add_paragraph()


def build():
    lines = (PITCH / "demo-script.md").read_text().splitlines()
    doc = Document()
    sec = doc.sections[0]
    sec.left_margin = sec.right_margin = sec.top_margin = sec.bottom_margin = Inches(0.8)
    base = doc.styles["Normal"]
    base.font.name, base.font.size, base.font.color.rgb = SANS, Pt(11), NAVY
    base.element.rPr.rFonts.set(qn("w:eastAsia"), SANS)
    for name, size, font in (("Title", 26, SERIF), ("Heading 1", 18, SERIF), ("Heading 2", 15, SERIF), ("Heading 3", 12.5, SANS)):
        st = doc.styles[name]
        st.font.name, st.font.size, st.font.color.rgb, st.font.bold = font, Pt(size), NAVY if name != "Heading 3" else ROYAL, name == "Heading 3"
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("|"):
            block = []
            while i < len(lines) and lines[i].startswith("|"):
                block.append(lines[i])
                i += 1
            table(doc, block)
            continue
        if line.startswith("```"):
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                p = doc.add_paragraph()
                run = p.add_run(lines[i])
                run.font.name, run.font.size = "Consolas", Pt(9)
                p.paragraph_format.space_after = Pt(0)
                i += 1
            doc.add_paragraph()
        elif line.startswith("# "):
            doc.add_paragraph(line[2:], style="Title")
        elif m := re.match(r"^(#{2,4}) (.+)", line):
            inline(doc.add_heading(level=len(m.group(1)) - 1), m.group(2))
        elif m := re.match(r"^\s*- (.+)", line):
            inline(doc.add_paragraph(style="List Bullet"), m.group(1))
        elif m := re.match(r"^\s*\d+\. (.+)", line):
            inline(doc.add_paragraph(style="List Number"), m.group(1))
        elif line.strip():
            inline(doc.add_paragraph(), line)
        i += 1
    out = PITCH / "OCI-Capacity-Coach-script.docx"
    doc.save(out)
    print("wrote", out)


if __name__ == "__main__":
    build()
