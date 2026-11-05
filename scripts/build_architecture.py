"""Render docs/img/architecture.html to docs/img/architecture.png (the AWS-style diagram in the technical guide,
the README and the wiki). Needs Playwright with Chromium. Rebuild after editing the HTML."""
import pathlib

from playwright.sync_api import sync_playwright

IMG = pathlib.Path(__file__).resolve().parent.parent / "docs" / "img"

with sync_playwright() as p:
    browser = p.chromium.launch()
    try:
        page = browser.new_page(viewport={"width": 1700, "height": 980}, device_scale_factor=2)
        page.goto((IMG / "architecture.html").as_uri())
        page.evaluate("document.fonts.ready")
        page.wait_for_load_state("networkidle")
        page.screenshot(path=str(IMG / "architecture.png"))
    finally:
        browser.close()
print("wrote", IMG / "architecture.png")
