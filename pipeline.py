"""Hardcoded AI pipeline: research the org, consult the CVI library, write the report.

The model never scores. Scores, stages and ranked gaps come from engine.scoring and are
passed in as fixed facts; the model's structured output is validated against them.
"""
import glob
import html
import ipaddress
import json
import os
import re
import socket
import urllib.request
from urllib.parse import urlparse

import boto3

from utils.data_loader import get_domains

MODEL_ID = os.environ.get("OCI_MODEL_ID", "us.anthropic.claude-sonnet-5-5")
FAST_MODEL_ID = os.environ.get("OCI_FAST_MODEL_ID", "us.anthropic.claude-haiku-5-5")
KB_ID = os.environ.get("OCI_KB_ID")
ROOT = os.path.dirname(os.path.abspath(__file__))
MAX_PAGE_BYTES = 500_000
MAX_PAGE_CHARS = 12_000
HORIZONS = (30, 60, 90)

with open(os.path.join(ROOT, "resources", "catalog.json")) as _f:
    CATALOG = {r["id"]: r for r in json.load(_f)}

_clients = {}


def _client(name):
    if name not in _clients:
        _clients[name] = boto3.client(name)
    return _clients[name]


def clean(text):
    """House style: Everytown copy avoids em dashes; the PDF renders plain text."""
    text = re.sub(r"\s*\u2014\s*", ", ", text or "")
    return re.sub(r"\*\*|^#+\s*", "", text, flags=re.M).strip()


# ---------- Step 1: research the organization from its public website ----------

def looks_like_web_url(url):
    parts = urlparse(url)
    return parts.scheme in ("http", "https") and bool(parts.hostname) and "." in parts.hostname


def _public_http_url(url):
    """Reject non-http(s) URLs and hosts that resolve to private networks (SSRF guard)."""
    parts = urlparse(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ValueError("URL must be http(s) with a host")
    for info in socket.getaddrinfo(parts.hostname, None):
        if not ipaddress.ip_address(info[4][0]).is_global:
            raise ValueError("URL resolves to a non-public address")


class _CheckedRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _public_http_url(newurl)  # every redirect hop must also be public
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_opener = urllib.request.build_opener(_CheckedRedirects)


def fetch_page_text(url):
    """Fetch a public web page and return its visible text, truncated."""
    _public_http_url(url)
    req = urllib.request.Request(url, headers={"User-Agent": "EverytownOCI/0.3 (+capacity coach)"})
    with _opener.open(req, timeout=10) as resp:
        raw = resp.read(MAX_PAGE_BYTES).decode(resp.headers.get_content_charset() or "utf-8", "replace")
    raw = re.sub(r"(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", raw)
    text = html.unescape(re.sub(r"(?s)<[^>]+>", " ", raw))
    return re.sub(r"\s+", " ", text).strip()[:MAX_PAGE_CHARS]


def research_org(name, url):
    try:
        page = fetch_page_text(url)
    except Exception as exc:  # an unreachable site must not block the report
        return "The website could not be read (%s), so this report relies on your answers only." % type(exc).__name__
    resp = _client("bedrock-runtime").converse(
        modelId=FAST_MODEL_ID,
        system=[{"text": "You summarize community violence intervention (CVI) nonprofits from their website text. "
                         "Report only what the text supports and say when something is unknown. "
                         "Never include names of individual staff, participants or victims. No em dashes."}],
        messages=[{"role": "user", "content": [{"text": "Organization: %s\nWebsite: %s\n\nWebsite text:\n%s\n\n"
                   "Write a profile of about 100 words: mission, programs, population served, location, "
                   "apparent size and stage." % (name, url, page)}]}],
        # Headroom for the model's built-in reasoning; the profile itself is ~150 tokens. No `temperature`: rejected.
        inferenceConfig={"maxTokens": 2000},
    )
    # Some models return a reasoning block before the text block.
    return clean(next(c["text"] for c in resp["output"]["message"]["content"] if "text" in c))


# ---------- Step 2: consult the CVI resource library ----------

def _library_files():
    return sorted(glob.glob(os.path.join(ROOT, "resources", "library", "*.md")))


def gather_library(sub):
    """Return field-guidance excerpts: Bedrock Knowledge Base retrieval when configured, else the whole library."""
    if not KB_ID:
        parts = []
        for path in _library_files():
            with open(path) as f:
                parts.append("### %s\n%s" % (os.path.basename(path), f.read()))
        return "\n\n".join(parts)
    names = {d["domain_id"]: d["domain_name"] for d in sub["domains"]}
    excerpts, seen = [], set()
    for domain_id in sub["domain_ids"]:
        top = [g["question_text"] for g in sub["gaps"] if g["domain_id"] == domain_id][:3]
        if not top:
            continue
        query = "Community violence intervention nonprofit, %s capacity. Growth priorities: %s" % (
            names[domain_id], " ".join(top))
        resp = _client("bedrock-agent-runtime").retrieve(
            knowledgeBaseId=KB_ID, retrievalQuery={"text": query[:1000]},
            retrievalConfiguration={"vectorSearchConfiguration": {"numberOfResults": 4}})
        for r in resp["retrievalResults"]:
            text = r["content"]["text"].strip()
            if text in seen:
                continue
            seen.add(text)
            uri = r.get("location", {}).get("s3Location", {}).get("uri", "")
            excerpts.append("[source: %s]\n%s" % (os.path.basename(uri) or "library", text))
    return "\n\n".join(excerpts) or "No excerpts matched."


# ---------- Step 3: write the structured report ----------

REPORT_TOOL = {"toolSpec": {
    "name": "submit_report",
    "description": "Submit the capacity coaching report for this organization.",
    "inputSchema": {"json": {
        "type": "object",
        "required": ["summary", "strengths", "plan", "conversation"],
        "properties": {
            "summary": {"type": "string", "description": "2-3 short paragraphs separated by a blank line."},
            "strengths": {"type": "array", "items": {"type": "string"}, "description": "3-5 strengths."},
            "plan": {"type": "array", "description": "6-9 actions spread across 30, 60 and 90 days.", "items": {
                "type": "object", "required": ["horizon", "title", "why", "gap_ids", "owner", "steps"],
                "properties": {
                    "horizon": {"type": "integer", "enum": list(HORIZONS)},
                    "title": {"type": "string"},
                    "why": {"type": "string", "description": "1-2 sentences tying the action to the answers."},
                    "gap_ids": {"type": "array", "items": {"type": "string"}},
                    "owner": {"type": "string", "description": "A role, never a person's name."},
                    "steps": {"type": "array", "items": {"type": "string"}, "description": "2-4 concrete steps."},
                    "resource_id": {"type": "string", "description": "A catalog id, or empty."}}}},
            "conversation": {"type": "array", "items": {"type": "string"},
                             "description": "3-5 questions for the leadership team's next meeting."}}}}}}

SYSTEM = (
    "You are a capacity-building coach for community violence intervention (CVI) nonprofits in Everytown's "
    "Community Safety Fund network. The Organizational Capacity Index is a learning tool, not an evaluation: "
    "use strength-based, plain language (about 8th grade reading level), people-first and trauma-informed. "
    "Call gaps 'growth priorities'. Describe maturity by stage name, not percentages. Never use em dashes.\n"
    "Rules:\n"
    "1. Scores, stages and priorities were computed by fixed code and are final. Never change, recompute, "
    "rank or invent any score, percentage or stage.\n"
    "2. Every plan item must cite the gap ids it addresses, using only ids from the gap list. Favor High "
    "priority and lower-stage gaps: foundations first.\n"
    "3. 30-day items are small first steps a busy, small team can finish in a month; 60 and 90 day items build "
    "on them. Adapt the engine's suggested next steps to this organization's profile instead of copying them.\n"
    "4. Use the field guidance excerpts to ground advice and say which source an idea comes from in plain words. "
    "Only use resource_id values from the catalog. Never invent statistics, funders, laws or links.\n"
    "5. Owners are roles (for example executive director, board chair, bookkeeper, program manager).\n"
    "6. Strengths come from statements the organization answered favorably.")


def _facts(sub):
    favorable = {}
    gap_ids = {g["question_id"] for g in sub["gaps"]}
    for d in get_domains():
        if d["id"] in sub["domain_ids"]:
            favorable[d["name"]] = [q["text"] for q in d["questions"] if q["id"] not in gap_ids][-6:]
    return {
        "organization": sub["org_name"],
        "domains": [{k: d[k] for k in ("domain_id", "domain_name", "estimated_stage", "score_pct", "gap_count",
                                        "total_questions")} for d in sub["domains"]],
        "growth_priorities_ranked": [{"id": g["question_id"], "domain": g["domain_id"], "stage": g["stage_name"],
                                      "priority": g["priority"], "statement": g["question_text"],
                                      "engine_next_steps": g["next_steps"]} for g in sub["gaps"]],
        "favorable_statements_sample": favorable,
    }


def write_report(sub, library):
    catalog = [{k: r[k] for k in ("id", "title", "domains", "use_for")} for r in CATALOG.values()]
    language = "Spanish (neutral Latin American Spanish)" if sub["language"] == "es" else "English"
    prompt = (
        "Organization profile from its website:\n%s\n\nAssessment facts (JSON, final):\n%s\n\n"
        "Resource catalog (JSON):\n%s\n\nField guidance excerpts from the CVI resource library:\n%s\n\n"
        "Write every text field in %s. Call submit_report once."
        % (sub.get("profile") or "No website profile available.", json.dumps(_facts(sub), ensure_ascii=False),
           json.dumps(catalog, ensure_ascii=False), library, language))
    resp = _client("bedrock-runtime").converse(
        modelId=MODEL_ID,
        system=[{"text": SYSTEM}],
        messages=[{"role": "user", "content": [{"text": prompt}]}],
        # Newer Claude models on Bedrock reject forced tool choice; "auto" plus the prompt reliably yields one call.
        toolConfig={"tools": [REPORT_TOOL], "toolChoice": {"auto": {}}},
        inferenceConfig={"maxTokens": 8000},
    )
    raw = next(c["toolUse"]["input"] for c in resp["output"]["message"]["content"] if "toolUse" in c)
    return validate_report(raw, {g["question_id"] for g in sub["gaps"]})


def _horizon(value):
    try:
        return min(HORIZONS, key=lambda h: abs(h - int(value)))
    except (TypeError, ValueError):
        return HORIZONS[0]


def validate_report(raw, gap_ids):
    """Keep only what is grounded: known gap ids, catalog resources, allowed horizons."""
    plan, used = [], []
    for item in raw.get("plan") or []:
        ids = [i for i in item.get("gap_ids") or [] if i in gap_ids]
        if not ids or not item.get("title"):
            continue  # an action that cites no real growth priority is not grounded
        resource = CATALOG.get((item.get("resource_id") or "").strip())
        if resource and resource["id"] not in used:
            used.append(resource["id"])
        plan.append({
            "horizon": _horizon(item.get("horizon")),
            "title": clean(item["title"]), "why": clean(item.get("why")), "gap_ids": ids,
            "owner": clean(item.get("owner")) or "Leadership team",
            "steps": [clean(s) for s in item.get("steps") or [] if s.strip()],
            "resource": {"title": resource["title"], "url": resource["url"]} if resource else None})
    if not plan:
        raise ValueError("the model returned no action grounded in this organization's answers")
    plan.sort(key=lambda p: p["horizon"])
    return {
        "summary": clean(raw.get("summary")),
        "strengths": [clean(s) for s in raw.get("strengths") or [] if s.strip()],
        "plan": plan,
        "conversation": [clean(q) for q in raw.get("conversation") or [] if q.strip()],
        "sources": [{"title": CATALOG[i]["title"], "url": CATALOG[i]["url"]} for i in used],
    }
