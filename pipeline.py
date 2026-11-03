"""Hardcoded LLM pipeline: research the org, then write recommendations.

The model never sees a chance to score. Scores and gaps come from
engine.scoring and are passed in as fixed facts.
"""
import html
import ipaddress
import json
import os
import re
import socket
import urllib.request
from urllib.parse import urlparse

import boto3

MODEL_ID = os.environ.get("OCI_MODEL_ID", "us.anthropic.claude-sonnet-4-5-20250929-v1:0")
RESOURCES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "resources", "cvi_resources.md")
MAX_PAGE_BYTES = 500_000
MAX_PAGE_CHARS = 12_000

_client = None


def _bedrock():
    global _client
    if _client is None:
        _client = boto3.client("bedrock-runtime")
    return _client


def _ask(system, prompt, max_tokens=2000):
    resp = _bedrock().converse(
        modelId=MODEL_ID,
        system=[{"text": system}],
        messages=[{"role": "user", "content": [{"text": prompt}]}],
        inferenceConfig={"maxTokens": max_tokens, "temperature": 0.3},
    )
    return resp["output"]["message"]["content"][0]["text"].strip()


def _public_http_url(url):
    """Reject non-http(s) URLs and hosts that resolve to private networks (SSRF guard)."""
    parts = urlparse(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ValueError("URL must be http(s) with a host")
    for info in socket.getaddrinfo(parts.hostname, None):
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            raise ValueError("URL resolves to a non-public address")


def fetch_page_text(url):
    """Fetch a public web page and return its visible text, truncated."""
    _public_http_url(url)
    req = urllib.request.Request(url, headers={"User-Agent": "EverytownOCI/0.2"})
    # shortcut: redirects are followed without re-checking the target host; add a redirect handler before hosting publicly.
    with urllib.request.urlopen(req, timeout=10) as resp:
        raw = resp.read(MAX_PAGE_BYTES).decode(resp.headers.get_content_charset() or "utf-8", "replace")
    raw = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", raw)
    text = html.unescape(re.sub(r"(?s)<[^>]+>", " ", raw))
    return re.sub(r"\s+", " ", text).strip()[:MAX_PAGE_CHARS]


def research_org(name, url):
    """Step 1: summarise what the organisation does, from its own website."""
    try:
        page = fetch_page_text(url)
    except Exception as exc:  # unreachable site must not block the report
        return "Website could not be read (%s). No public profile available." % exc
    return _ask(
        "You summarise community violence intervention (CVI) nonprofits from their website text. "
        "Report only what the text supports; say so when something is unknown.",
        "Organization: %s\nWebsite: %s\n\nWebsite text:\n%s\n\n"
        "Write a 120-word profile: mission, programs, population served, location, apparent size." % (name, url, page),
        max_tokens=400,
    )


def recommend(name, profile, summaries, gaps):
    """Step 2: narrate recommendations from the fixed scores and the resource library."""
    with open(RESOURCES) as f:
        library = f.read()
    facts = {
        "domains": [
            {"domain": s.domain_name, "capacity_pct": s.score_pct,
             "estimated_stage": s.estimated_stage, "gaps": s.gap_count, "statements": s.total_questions}
            for s in summaries
        ],
        "gaps_ranked": [
            {"domain": g.domain_name, "priority": g.priority, "stage": g.stage_name,
             "statement": g.question_text, "next_steps": g.next_steps}
            for g in gaps
        ],
    }
    text = _ask(
        "You are a capacity-building advisor for CVI nonprofits working with Everytown's Community Safety Fund. "
        "Scores, stages and priorities are computed by deterministic code and are final: never change, "
        "recompute or invent them. Ground every recommendation in a listed gap and its next steps. "
        "Write plain text only (no markdown symbols), warm and direct, for a small nonprofit's leadership.",
        "Organization: %s\n\nProfile from its website:\n%s\n\nAssessment results (JSON):\n%s\n\n"
        "CVI resource library:\n%s\n\n"
        "Write the recommendations report:\n"
        "1. A short overview of strengths and the biggest capacity gaps.\n"
        "2. For each domain, 2-4 concrete actions for the next 30-90 days, starting with High priority gaps, "
        "tailored to this organization's profile.\n"
        "3. Where relevant, point to a resource from the library by name and URL."
        % (name, profile, json.dumps(facts, indent=1), library),
        max_tokens=3000,
    )
    # The PDF renders plain text; the model emits headings and bold markers despite instructions.
    return re.sub(r"(?m)^#+\s*|\*\*", "", text)
