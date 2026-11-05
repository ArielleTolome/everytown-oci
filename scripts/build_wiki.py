"""Builds the GitHub wiki from the repo's own docs, so the wiki never becomes a second source of truth.

  git clone https://github.com/ArielleTolome/everytown-oci.wiki.git /tmp/oci-wiki
  python3 scripts/build_wiki.py /tmp/oci-wiki
  cd /tmp/oci-wiki && git add -A && git commit -m "Wiki from <commit>" && git push

Every *.md in the target folder is replaced. Pages come from docs/technical-guide.md (one page per numbered section),
docs/features-and-benefits.md, docs/pitch/demo-script.md, the evals, qa and folder READMEs, the background docs and
CHANGELOG.md. Links are rewritten: links between these docs become wiki links, other repo files become GitHub links,
images load from raw.githubusercontent.com. Edit the source files, then rebuild; never edit the wiki by hand.
"""
import os
import posixpath
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = "https://github.com/ArielleTolome/everytown-oci"
BLOB, TREE, RAW = f"{REPO}/blob/main/", f"{REPO}/tree/main/", "https://raw.githubusercontent.com/ArielleTolome/everytown-oci/main/"
LIVE = "https://d2mi2h3eu8y69s.cloudfront.net"
GUIDE = "docs/technical-guide.md"
FOLDERS = ["data", "engine", "resources", "frontend", "features", "infra", "scripts", "tests", "docs"]  # evals/ and qa/ have their own pages

# Whole-file pages: wiki page name, source, sidebar group. Order is the sidebar order within each group.
FILES = [
    ("Features-and-Benefits", "docs/features-and-benefits.md", "Using the app"),
    ("Live-Demo-and-Presentation", "docs/pitch/demo-script.md", "Using the app"),
    ("Evals", "evals/README.md", "Deep dives"),
    ("End-to-End-Tests", "qa/README.md", "Deep dives"),
    ("Vision", "docs/vision.md", "Background"),
    ("Tech-Brief", "docs/tech.md", "Background"),
    ("Next-Steps", "docs/next-steps.md", "Background"),
    ("QuickSight-Assessment", "docs/quicksight-assessment.md", "Background"),
    ("Changelog", "CHANGELOG.md", "Background"),
]


def read(path):
    with open(os.path.join(ROOT, path), encoding="utf-8") as fh:
        return fh.read()


def slug(text):
    """GitHub heading anchor: lower case, drop punctuation except - and _, spaces to hyphens."""
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text).replace("`", "").lower()
    return re.sub(r"[^\w\- ]", "", text).replace(" ", "-")


def page_name(title):
    return re.sub(r"[^\w\-]", "", re.sub(r"\s+", "-", title.strip()))


def headings(md):
    fence = False
    for line in md.split("\n"):
        if line.startswith("```"):
            fence = not fence
        elif not fence and (m := re.match(r"^(#{1,6}) (.+)$", line)):
            yield len(m.group(1)), m.group(2)


def split_guide():
    """Intro + contents become the Technical-Guide page; each '## N. Title' section becomes its own page."""
    parts = re.split(r"^(?=## \d+\. )", read(GUIDE), flags=re.M)
    intro = re.sub(r"^# .*\n", "", parts[0]).rstrip().rstrip("-").rstrip()
    pages = [("Technical-Guide", intro)]
    for part in parts[1:]:
        title = re.match(r"## \d+\. (.+)", part).group(1)
        body = part.split("\n", 1)[1].strip().rstrip("-").rstrip()
        body = re.sub(r"^#(#{2,5}) ", r"\1 ", body, flags=re.M)  # ### -> ## : the section title is the page title
        pages.append((page_name(title.replace(":", "")), body))
    return pages


def folder_page(amap):
    out = ["One section per folder, from each folder's own `README.md`: every file and what it does, and how to change it safely. "
           "The `evals/` and `qa/` folders have their own pages: [Evals](Evals) and [End to End Tests](End-to-End-Tests).", ""]
    for folder in FOLDERS:
        src = f"{folder}/README.md"
        md = re.sub(r"^# .*\n", "", read(src)).strip()
        md = re.sub(r"^(#{1,5}) ", r"#\1 ", md, flags=re.M)
        out += [f"## `{folder}/`", "", f"Source: [`{src}`]({BLOB}{src})", "", rewrite(md, src, amap), ""]
    return "\n".join(out)


def build_anchor_map(sources):
    """(repo path, anchor or '') -> wiki target, for every heading of every page source."""
    amap = {}
    for page, src, body in sources:
        amap.setdefault((src, ""), page)
        for _, text in headings(body):
            amap[(src, slug(text))] = f"{page}#{slug(text)}"
        if src == GUIDE and page != "Technical-Guide":
            # the removed '## N. Title' heading still has links pointing at it
            n = [p for p, s, _ in sources if s == GUIDE].index(page)
            title = re.search(rf"^## {n}\. (.+)$", read(GUIDE), re.M).group(1)
            amap[(GUIDE, slug(f"{n}. {title}"))] = page
    return amap


def rewrite(md, src, amap):
    base = posixpath.dirname(src)

    def target(m):
        url = m.group(1)
        if re.match(r"^[a-z]+:", url):
            return m.group(0)
        path, _, frag = url.partition("#")
        repo_path = posixpath.normpath(posixpath.join(base, path)) if path else src
        if (repo_path, frag) in amap:
            new = amap[(repo_path, frag)]
        elif (repo_path, "") in amap and not frag:
            new = amap[(repo_path, "")]
        elif re.search(r"\.(png|jpe?g|gif|svg|webp)$", repo_path, re.I):
            new = RAW + repo_path
        else:
            is_dir = os.path.isdir(os.path.join(ROOT, repo_path))
            new = (TREE if is_dir else BLOB) + repo_path.rstrip("/") + (f"#{frag}" if frag else "")
        return f"]({new})"

    out, fence = [], False
    for line in md.split("\n"):
        if line.startswith("```"):
            fence = not fence
        out.append(line if fence else re.sub(r"\]\(([^)\s]+)\)", target, line))
    return "\n".join(out)


def home(groups, commit):
    readme = read("README.md")
    intro = re.search(r"^The Organizational Capacity Index.*$", readme, re.M).group(0)
    rules = "\n".join(re.findall(r"^- (?:Deterministic|Claude on Amazon).*$", readme, re.M))
    index = []
    for group, pages in groups.items():
        index += [f"### {group}", ""] + [f"- [{p.replace('-', ' ')}]({p})" for p in pages] + [""]
    return f"""[![OCI Capacity Coach]({RAW}docs/img/banner.png)]({REPO})

{intro}

{rules}

[![Demo of the live app]({RAW}docs/demo/oci-capacity-coach-demo.gif)]({BLOB}docs/demo/oci-capacity-coach-demo.mp4)

## Try it live

| | |
|---|---|
| Web app | {LIVE} |
| Organization leader | `demo` / `demo` |
| Everytown staff | `staff` / `staff` |

Everything in the app is synthetic and the login is mocked. Start with [Features and Benefits](Features-and-Benefits) for what the app does, or the [Technical Guide](Technical-Guide) for how it works.

## Every page

{chr(10).join(index).rstrip()}

## About this wiki

The wiki is built from the repository's own documents by [`scripts/build_wiki.py`]({BLOB}scripts/build_wiki.py) (this build: commit [`{commit}`]({REPO}/commit/{commit})). Each page names its source file at the top. To change a page, edit that file in the repository and rebuild the wiki; edits made here are overwritten. The repository [README]({REPO}#readme) stays the short version.
"""


def main(out):
    commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
    sources = [(name, GUIDE, body) for name, body in split_guide()]
    for name, src, _ in FILES:
        sources.append((name, src, re.sub(r"^# .*\n", "", read(src), count=1).strip()))
    amap = build_anchor_map(sources)
    for folder in FOLDERS:
        amap[(f"{folder}/README.md", "")] = f"Every-File-by-Folder#{slug(folder)}"
    sources.append(("Every-File-by-Folder", "", folder_page(amap)))

    guide_pages = [n for n, s, _ in sources if s == GUIDE]
    groups = {"Using the app": [n for n, _, g in FILES if g == "Using the app"],
              "Technical guide": guide_pages,
              "Deep dives": ["Every-File-by-Folder"] + [n for n, _, g in FILES if g == "Deep dives"],
              "Background": [n for n, _, g in FILES if g == "Background"]}

    for f in os.listdir(out):
        if f.endswith(".md"):
            os.remove(os.path.join(out, f))
    for name, src, body in sources:
        header = f"> Source: [`{src}`]({BLOB}{src}). Edit it there, then rebuild the wiki.\n\n" if src else ""
        with open(os.path.join(out, f"{name}.md"), "w", encoding="utf-8") as fh:
            fh.write(header + (rewrite(body, src, amap) if src else body).rstrip() + "\n")
    with open(os.path.join(out, "Home.md"), "w", encoding="utf-8") as fh:
        fh.write(home(groups, commit))
    sidebar = ["**[Home](Home)**", ""]
    for group, pages in groups.items():
        sidebar += [f"**{group}**", ""] + [f"- [{p.replace('-', ' ')}]({p})" for p in pages] + [""]
    with open(os.path.join(out, "_Sidebar.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(sidebar))
    with open(os.path.join(out, "_Footer.md"), "w", encoding="utf-8") as fh:
        fh.write(f"Built from [`{commit}`]({REPO}/commit/{commit}) by `scripts/build_wiki.py`. "
                 f"[Live app]({LIVE}) · [Repository]({REPO}) · [Releases]({REPO}/releases)\n")
    print(f"{len(sources) + 3} pages in {out}")


if __name__ == "__main__":
    if len(sys.argv) != 2 or not os.path.isdir(sys.argv[1]):
        sys.exit("usage: python3 scripts/build_wiki.py <wiki clone folder>")
    main(sys.argv[1])
