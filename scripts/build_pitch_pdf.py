"""Render docs/pitch/index.html to docs/pitch/OCI-Capacity-Coach-pitch.pdf: one 1920x1080 page per slide.

Needs Playwright with Chromium (pip install playwright && python3 -m playwright install chromium).
"""
import pathlib

from playwright.sync_api import sync_playwright

PITCH = pathlib.Path(__file__).resolve().parent.parent / "docs" / "pitch"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    page.goto((PITCH / "index.html").as_uri())
    page.evaluate("document.fonts.ready")
    page.pdf(path=str(PITCH / "OCI-Capacity-Coach-pitch.pdf"), width="1920px", height="1080px",
             print_background=True, prefer_css_page_size=True)
    browser.close()
print("wrote", PITCH / "OCI-Capacity-Coach-pitch.pdf")
