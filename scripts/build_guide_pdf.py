"""Render docs/technical-guide.md to docs/OCI-Capacity-Coach-technical-guide.pdf (A4, Everytown fonts and colors).

Markdown and Mermaid diagrams are rendered in Chromium with marked and mermaid from the jsDelivr CDN (needs network).
Needs Playwright with Chromium (pip install playwright && python3 -m playwright install chromium).
"""
import json
import pathlib

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = (ROOT / "frontend" / "public" / "fonts").as_uri()
OUT = ROOT / "docs" / "OCI-Capacity-Coach-technical-guide.pdf"

PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><title>OCI Capacity Coach: Technical Guide</title>
<style>
@font-face { font-family: Atkinson; src: url(%(fonts)s/AtkinsonHyperlegible-Regular.ttf); }
@font-face { font-family: Atkinson; font-weight: 700; src: url(%(fonts)s/AtkinsonHyperlegible-Bold.ttf); }
@font-face { font-family: Atkinson; font-style: italic; src: url(%(fonts)s/AtkinsonHyperlegible-Italic.ttf); }
@font-face { font-family: Serif4; src: url(%(fonts)s/SourceSerif4-latin-var.woff2); font-weight: 200 900; }
@page { size: A4; margin: 18mm 16mm 18mm 16mm; }
body { font: 10.5pt/1.5 Atkinson, sans-serif; color: #1b2440; }
h1, h2, h3 { font-family: Serif4, serif; color: #001C60; font-weight: 600; line-height: 1.2; }
h1 { font-size: 26pt; margin: 0 0 4pt; border-bottom: 4px solid #E3012B; padding-bottom: 8pt; }
h2 { font-size: 17pt; margin: 24pt 0 8pt; break-after: avoid; border-bottom: 2px solid #0D3DD9; padding-bottom: 4pt; }
h3 { break-after: avoid; }
h3 { font-size: 12.5pt; margin: 14pt 0 6pt; }
a { color: #0D3DD9; text-decoration: none; }
img { max-width: 100%%; height: auto; display: block; margin: 8pt 0 10pt; }
table { border-collapse: collapse; width: 100%%; margin: 8pt 0 12pt; font-size: 9pt; break-inside: auto; }
th, td { border: 1px solid #c9d2ea; padding: 4pt 6pt; text-align: left; vertical-align: top; }
th { background: #eef2fb; color: #001C60; }
tr { break-inside: avoid; }
code { font-family: ui-monospace, Menlo, monospace; font-size: 8.6pt; background: #f2f4fa; padding: 0 2pt; border-radius: 2pt; }
pre { background: #f2f4fa; padding: 8pt; border-radius: 4pt; font-size: 8.4pt; white-space: pre-wrap; break-inside: avoid; }
pre code { background: none; padding: 0; }
.mermaid { text-align: center; margin: 10pt 0; break-inside: avoid; }
hr { border: 0; border-top: 1px solid #c9d2ea; margin: 14pt 0; }
</style></head><body><main id="doc"></main>
<script src="https://cdn.jsdelivr.net/npm/marked@12/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>
  const md = %(md)s;
  const renderer = new marked.Renderer();
  const code = renderer.code.bind(renderer);
  renderer.code = (text, lang) => lang === "mermaid" ? `<div class="mermaid">${text}</div>` : code(text, lang);
  document.getElementById("doc").innerHTML = marked.parse(md, { renderer });
  mermaid.initialize({ startOnLoad: false, theme: "neutral", flowchart: { useMaxWidth: true } });
  mermaid.run().then(() => { document.body.dataset.ready = "1"; });
</script></body></html>"""

md = (ROOT / "docs" / "technical-guide.md").read_text()
html = ROOT / "docs" / ".technical-guide.render.html"
html.write_text(PAGE % {"fonts": FONTS, "md": json.dumps(md)})
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            page = browser.new_page()
            page.goto(html.as_uri())
            page.wait_for_selector("body[data-ready='1']", timeout=60000)
            page.evaluate("document.fonts.ready")
            page.pdf(path=str(OUT), format="A4", print_background=True, display_header_footer=True,
                     header_template="<span></span>",
                     footer_template='<div style="font-size:8px;width:100%;text-align:center;color:#55607d">'
                                     'OCI Capacity Coach: Technical Guide · <span class="pageNumber"></span> / '
                                     '<span class="totalPages"></span></div>',
                     margin={"top": "18mm", "bottom": "18mm", "left": "16mm", "right": "16mm"})
        finally:
            browser.close()
finally:
    html.unlink(missing_ok=True)
print("wrote", OUT)
