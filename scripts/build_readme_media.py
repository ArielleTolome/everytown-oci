"""Builds the README banner and demo video.

  python3 scripts/build_readme_media.py banner   # docs/img/banner.html -> docs/img/banner.png (2560 x 800)
  python3 scripts/build_readme_media.py demo     # records the live site -> docs/demo/oci-capacity-coach-demo.mp4 and .gif

The demo drives the live site with Playwright Chromium and records it with a Chrome DevTools screencast (sharper
than Playwright's own video). Each frame keeps its capture time; the AI waits are sped up when the frames are joined.
It makes one Southside sample report and asks its chat one question (as qa `npm run test:demo` does, about $0.11)
and counts against the hourly report cap. The questionnaire part only writes a local draft and removes it.
Needs: pip install playwright imageio-ffmpeg; python3 -m playwright install chromium.
"""
import base64
import os
import subprocess
import sys
import tempfile
import time

import imageio_ffmpeg
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = os.environ.get("APP_URL", "https://d2mi2h3eu8y69s.cloudfront.net")
W, H = 1280, 720
FF = imageio_ffmpeg.get_ffmpeg_exe()

# Injected into every page: a visible cursor (screencasts have none) and a caption pill. The caption sits in a closed
# shadow root so Playwright text locators never match it; sessionStorage carries it across page loads.
OVERLAY = """
(() => {
  if (window.__demo) return;
  window.__demo = true;
  const add = () => {
    const c = document.createElement('div');
    c.id = 'demo-cursor';
    c.style.cssText = 'position:fixed;left:-40px;top:-40px;width:22px;height:22px;border-radius:50%;background:rgba(13,61,217,.35);border:3px solid #0D3DD9;box-shadow:0 0 0 2px #fff;z-index:2147483647;pointer-events:none;transform:translate(-50%,-50%);transition:width .12s,height .12s';
    const cap = document.createElement('div');
    cap.id = 'demo-caption';
    cap.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);max-width:1040px;padding:12px 26px;border-radius:999px;background:#001C60;color:#fff;font:600 21px/1.35 "Atkinson Hyperlegible",system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,14,47,.35);z-index:2147483646;pointer-events:none;text-align:center;display:none';
    const host = document.createElement('div');
    host.id = 'demo-caption-host';
    const root = host.attachShadow({mode: 'closed'});
    root.append(cap);
    window.__demoCap = cap;
    document.documentElement.append(c, host);
    addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => { c.style.width = c.style.height = '16px'; }, true);
    addEventListener('mouseup', () => { c.style.width = c.style.height = '22px'; }, true);
    const saved = sessionStorage.getItem('demo-caption');
    if (saved) { cap.textContent = saved; cap.style.display = 'block'; }
  };
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', add) : add();
})();
"""


def record(out):
    """Runs the demo path; returns frames as {file, t, speed}, ending with a marker for the last frame's end."""
    frames, state = [], {"speed": 1.0}
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)
            ctx.add_init_script(OVERLAY)
            page = ctx.new_page()
            cdp = ctx.new_cdp_session(page)

            def on_frame(ev):
                i = len(frames)
                path = f"{out}/{i:05d}.jpg"
                with open(path, "wb") as fh:
                    fh.write(base64.b64decode(ev["data"]))
                frames.append({"file": path, "t": time.monotonic(), "speed": state["speed"]})
                cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]})

            cdp.on("Page.screencastFrame", on_frame)

            def caption(text):
                page.evaluate("""t => { sessionStorage.setItem('demo-caption', t);
                  const c = window.__demoCap; if (c) { c.textContent = t; c.style.display = t ? 'block' : 'none'; } }""", text)

            def pause(s):
                end = time.monotonic() + s
                while time.monotonic() < end:
                    page.wait_for_timeout(100)

            def glide(loc):
                loc.scroll_into_view_if_needed()
                box = loc.bounding_box()
                page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=18)
                pause(0.3)

            def click(loc):
                glide(loc)
                loc.click()

            def scroll_to(loc, offset=90):
                page.evaluate("""([el, off]) => window.scrollTo({top: el.getBoundingClientRect().top + scrollY - off, behavior: 'smooth'})""",
                              [loc.element_handle(), offset])
                pause(1.2)

            # Title card
            page.goto(URL + "/login/")
            cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 88, "maxWidth": W, "maxHeight": H, "everyNthFrame": 1})
            page.mouse.move(640, 360)
            caption("OCI Capacity Coach: a self-assessment that turns Yes / No answers into a plan")
            pause(2.5)

            # 1. Sign in as a leader
            caption("A leader signs in (the demo login is demo / demo)")
            click(page.get_by_role("textbox", name="Username"))
            page.keyboard.type("demo", delay=90)
            click(page.get_by_role("textbox", name="Password"))
            page.keyboard.type("demo", delay=90)
            click(page.get_by_role("button", name="Sign in"))
            page.wait_for_url(URL + "/")
            page.wait_for_load_state("networkidle")
            caption("Who is filling it out, the organization, and which areas to assess today")
            pause(2.5)

            # 1b. A few questionnaire cards (local draft only; removed before the sample)
            click(page.get_by_label("Executive director"))
            click(page.get_by_label("Your job title"))
            page.keyboard.type("Executive director", delay=25)
            click(page.get_by_label("Your name"))
            page.keyboard.type("Jordan Lee", delay=40)
            click(page.get_by_label("Organization name"))
            page.keyboard.type("Eastside Peace Partners", delay=40)
            pause(0.6)
            click(page.get_by_role("button", name="Start questionnaire"))
            page.get_by_role("heading", name="How would you like to answer?").wait_for()
            caption("Pick how to answer: one at a time, Yes / No for each, or a checklist")
            pause(2.5)
            click(page.get_by_role("button", name="One at a time").first)
            pause(1.2)
            caption("One statement at a time, with big Yes and No buttons")
            for ans in ["Yes", "No", "Yes", "Yes"]:
                pause(1.4)
                btn = page.locator(f"button.quick__btn[data-answer={ans.lower()}]:visible").first
                if btn.count():
                    click(btn)
                else:  # a laddered multiple-choice card: pick the first option, then Next
                    caption("Some topics are one multiple-choice question that fills in several answers")
                    click(page.locator("button.quick__choice:visible").nth(1))
                    page.locator("#quick-continue").wait_for()
                    pause(2.5)
                    click(page.locator("#quick-continue"))
                    caption("One statement at a time, with big Yes and No buttons")
            pause(1.5)
            page.evaluate("() => { localStorage.removeItem('oci-draft'); localStorage.removeItem('oci-draft-sync'); }")
            caption("Or try a made-up sample organization with one click")
            page.goto(URL + "/")
            page.wait_for_load_state("networkidle")

            # 2. One-click sample organization
            summary = page.get_by_text("Try a made-up sample organization")
            scroll_to(summary, 200)
            caption("Or try a made-up sample organization with one click")
            click(summary)
            pause(1)
            click(page.get_by_role("button", name="Southside Youth Peace Collective").first)
            page.wait_for_url("**/results/?id=*", timeout=30_000)
            caption("Code scores every answer, so each area's stage shows up right away")
            pause(4)

            # 3. AI writes the report (sped up)
            caption("Claude on Amazon Bedrock writes the plan in about 40 seconds (sped up 8x)")
            state["speed"] = 8.0
            page.get_by_role("heading", name="Your report is ready").wait_for(timeout=150_000)
            state["speed"] = 1.0
            caption("The report is ready, on screen and as a PDF")
            pause(2.5)

            # 4. The plan
            summary_h = page.get_by_role("heading", name="Summary about your organization").first
            scroll_to(summary_h)
            caption("A coach's letter in plain words: strengths first, never a grade")
            pause(3.5)
            start = page.get_by_role("heading", name="Start here").first
            scroll_to(start)
            caption("Code picks the one or two priorities to start with. AI writes the steps.")
            pause(4)

            # 5. Chat
            click(page.get_by_role("button", name="Chat about your report").first)
            chat = page.get_by_role("dialog", name="Chat about your report")
            chat.wait_for()
            caption("Chat about your report: it knows the whole plan")
            pause(1.2)
            click(chat.get_by_role("button", name="What is the first step this week?"))
            state["speed"] = 4.0
            page.locator("#chat-panel .coach-turn__text p").first.wait_for(timeout=90_000)
            state["speed"] = 1.0
            pause(4)
            page.keyboard.press("Escape")
            pause(0.8)

            # 6. Roadmap
            cta = page.get_by_role("link", name="Open my roadmap").first
            scroll_to(cta, 300)
            click(cta)
            page.wait_for_url("**/plan/?id=*")
            page.wait_for_load_state("networkidle")
            caption("A 12-week roadmap: one week at a time, with points and badges")
            pause(3)
            box = page.locator("label.rm-task__check:visible").first
            if box.count():
                scroll_to(box, 260)
                caption("Tick a step when it is done")
                click(box)
                pause(2.5)

            # 7. Staff
            page.evaluate("window.scrollTo({top: 0, behavior: 'smooth'})")
            pause(0.8)
            caption("Everytown staff see what the whole network needs")
            click(page.get_by_role("button", name="Sign out"))
            page.wait_for_url("**/login/**")
            click(page.get_by_role("textbox", name="Username"))
            page.keyboard.type("staff", delay=70)
            click(page.get_by_role("textbox", name="Password"))
            page.keyboard.type("staff", delay=70)
            click(page.get_by_role("button", name="Sign in"))
            page.wait_for_url("**/staff/**")
            page.get_by_role("heading", name="Which organizations need which training").first.wait_for(timeout=20_000)
            caption("Training needs: which organizations need which training")
            pause(3.5)
            click(page.get_by_role("tab", name="Ask the data"))
            caption("Ask the data in plain words. Every number comes from the database.")
            pause(1)
            click(page.get_by_role("button", name="Which organizations need fundraising training?"))
            state["speed"] = 4.0
            page.get_by_text("Answer ready.").first.wait_for(timeout=90_000)
            state["speed"] = 1.0
            scroll_to(page.locator("[id^=ask-][id$=-q]").first, 140)
            pause(4.5)
            click(page.get_by_role("tab", name="Peers"))
            page.get_by_role("heading", name="Peer groups and requests to connect").first.wait_for(timeout=15_000)
            caption("Peers: groups with the same challenges, so staff can connect them")
            pause(4)
            caption("Try it: d2mi2h3eu8y69s.cloudfront.net (demo / demo, staff / staff)")
            pause(3)
            cdp.send("Page.stopScreencast")
            frames.append({"file": None, "t": time.monotonic(), "speed": 1.0})
        finally:
            browser.close()
    return frames


def demo():
    with tempfile.TemporaryDirectory() as tmp:
        frames = record(tmp)
        # Concat demuxer: each frame shows until the next one, divided by the speed it was captured at.
        lines = []
        for cur, nxt in zip(frames, frames[1:]):
            lines += [f"file '{cur['file']}'", f"duration {max((nxt['t'] - cur['t']) / cur['speed'], 0.001):.4f}"]
        lines.append(f"file '{frames[-2]['file']}'")  # the demuxer ignores the last duration otherwise
        listing = os.path.join(tmp, "frames.txt")
        with open(listing, "w") as fh:
            fh.write("\n".join(lines) + "\n")
        base = os.path.join(ROOT, "docs", "demo", "oci-capacity-coach-demo")
        os.makedirs(os.path.dirname(base), exist_ok=True)
        run = lambda *a: subprocess.run([FF, "-y", "-loglevel", "error", *a], check=True)
        run("-f", "concat", "-safe", "0", "-i", listing, "-vf", "fps=30,scale=1280:720:flags=lanczos,format=yuv420p",
            "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-movflags", "+faststart", base + ".mp4")
    # README preview: GitHub only plays videos uploaded through its web editor inline, so the README shows a GIF
    # (twice as fast, 8 fps, 800 px wide) that links to the MP4.
    run("-i", base + ".mp4", "-filter_complex",
        "setpts=PTS/2,fps=8,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];"
        "[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle", base + ".gif")
    for ext in (".mp4", ".gif"):
        print(f"{base}{ext}: {os.path.getsize(base + ext) / 1e6:.1f} MB")


def banner():
    src = os.path.join(ROOT, "docs", "img", "banner.html")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            page = browser.new_page(viewport={"width": 1280, "height": 400}, device_scale_factor=2)
            page.goto("file://" + src)
            page.evaluate("document.fonts.ready")
            page.screenshot(path=src.replace(".html", ".png"))
        finally:
            browser.close()
    print(src.replace(".html", ".png"))


if __name__ == "__main__":
    {"banner": banner, "demo": demo}[sys.argv[1] if len(sys.argv) > 1 else "demo"]()
