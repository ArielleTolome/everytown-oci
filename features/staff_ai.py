"""Training brief for the Community Training Institute about one network-wide growth priority (staff only, v0.9).

One fixed Converse call. Code counts who has the growth priority (aggregated by program model and staff size);
the model only writes the session around those counts and never sees organization names or ids. Resources are
kept only when they come from the curated catalog.
"""
import json
import time
from datetime import datetime, timezone

from flask import Blueprint, jsonify, session

import observability

bp = Blueprint("staff_ai", __name__)
CACHE_SECONDS = 600
# shortcut: per-process cache (one Lambda container), fine for a demo; move to the database if staff use grows.
_cache = {}

BRIEF_TOOL = {"toolSpec": {
    "name": "submit_brief",
    "description": "Submit the training brief.",
    "inputSchema": {"json": {
        "type": "object",
        "required": ["title", "why_it_matters", "session_outline", "pre_work", "resource_ids", "follow_up"],
        "properties": {
            "title": {"type": "string", "description": "Session title, under 10 words."},
            "why_it_matters": {"type": "string", "description": "2-3 sentences: why this growth priority matters for small CVI groups."},
            "session_outline": {"type": "array", "items": {"type": "string"},
                                "description": "3-5 parts of a 60 to 90 minute session, each one sentence."},
            "pre_work": {"type": "string", "description": "One small thing participants do or bring beforehand."},
            "resource_ids": {"type": "array", "items": {"type": "string"}, "description": "0-3 catalog ids."},
            "follow_up": {"type": "string", "description": "How CSF staff follow up in the next 30 days."}}}}}}

SYSTEM = (
    "You help Everytown's Community Safety Fund plan Community Training Institute sessions for community violence "
    "intervention (CVI) nonprofits. Grantees are small, community-rooted groups (often 5 to 20 staff), many led by "
    "people with lived experience of violence or incarceration. Write at an 8th grade reading level: short "
    "sentences, everyday words, warm and strength-based. Call gaps 'growth priorities'. Never use em dashes.\n"
    "Rules:\n"
    "1. The counts were computed by fixed code from assessment results and are final. Do not change them, add new "
    "numbers, or invent statistics, funders, laws or links.\n"
    "2. Plan one practical peer-learning session about the single growth priority given, building on the engine's "
    "suggested next steps and the field guides.\n"
    "3. Only use resource ids from the catalog.\n"
    "4. Call submit_brief once.")


def _who(question_id, domain_id):
    """Aggregated counts only: how many organizations (latest assessment each) have this growth priority."""
    import db
    from features.orgmeta import PROGRAM_MODELS, STAFF_SIZES

    rows = db.query("SELECT o.program_models::text AS models, o.staff_size, g.priority FROM gaps g "
                    "JOIN latest_assessments la ON la.id = g.assessment_id JOIN organizations o ON o.id = la.org_id "
                    "WHERE g.question_id = :q", q=question_id)
    assessed = db.query("SELECT count(*) AS n FROM domain_results dr JOIN latest_assessments la "
                        "ON la.id = dr.assessment_id WHERE dr.domain_id = :d", d=domain_id)[0]["n"]
    models = [m for r in rows for m in json.loads(r["models"] or "[]")]
    return {"orgs": len(rows), "high_priority": sum(1 for r in rows if r["priority"] == "High"), "assessed": assessed,
            "program_models": [{"name": m, "orgs": models.count(m)} for m in PROGRAM_MODELS if m in models],
            "staff_sizes": [{"name": s, "orgs": n} for s in STAFF_SIZES
                            for n in [sum(1 for r in rows if r["staff_size"] == s)] if n],
            "not_given": sum(1 for r in rows if not r["staff_size"] and r["models"] in (None, "[]"))}


def write_brief(question, domain_name, who):
    import pipeline

    catalog = [{k: r[k] for k in ("id", "title", "domains", "use_for")} for r in pipeline.CATALOG.values()]
    reference = ("Resource catalog (JSON):\n%s\n\nCVI field guides (the full resource library):\n%s"
                 % (json.dumps(catalog, ensure_ascii=False), pipeline.LIBRARY))
    facts = {"growth_priority": {"id": question["id"], "area": domain_name, "statement": question["text"],
                                 "engine_next_steps": question["next_steps"]},
             "network_counts": who}
    content = pipeline._converse(
        "training brief",
        modelId=pipeline.MODEL_ID,
        system=[{"text": SYSTEM}, {"text": reference}, {"cachePoint": {"type": "default"}}],
        messages=[{"role": "user", "content": [{"text": "Facts (JSON, final):\n%s\n\nWrite the brief in English. "
                                                        "Call submit_brief once." % json.dumps(facts, ensure_ascii=False)}]}],
        # Newer Claude models on Bedrock reject forced tool choice; built-in reasoning shares maxTokens.
        toolConfig={"tools": [BRIEF_TOOL], "toolChoice": {"auto": {}}},
        inferenceConfig={"maxTokens": 4000},
    )
    raw = next((c["toolUse"]["input"] for c in content if "toolUse" in c), None)
    return validate_brief(raw)


def validate_brief(raw):
    """Model output is untrusted: plain strings only, 3-5 outline items, catalog resources only."""
    import pipeline

    raw = raw if isinstance(raw, dict) else {}
    text = {k: pipeline.clean(raw.get(k)) for k in ("title", "why_it_matters", "pre_work", "follow_up")}
    outline = pipeline._texts(raw.get("session_outline"))[:5]
    if not all(text.values()) or len(outline) < 3:
        raise pipeline.ReportError("The AI did not return a complete training brief. Please try again.")
    ids = raw.get("resource_ids") if isinstance(raw.get("resource_ids"), list) else []
    resources = [{"title": pipeline.CATALOG[i]["title"], "url": pipeline.CATALOG[i]["url"]}
                 for i in dict.fromkeys(i for i in ids if isinstance(i, str) and i in pipeline.CATALOG)][:3]
    return dict(text, session_outline=outline, resources=resources)


@bp.route("/api/staff/briefs", methods=["POST"])
@observability.traced("staff.brief")
def brief():
    import pipeline
    from app import body, error, get_domains

    user = session.get("user")
    if not user:
        return error("Please sign in.", 401)
    if user["role"] != "staff":
        return error("This page is for Everytown staff.", 403)
    qid = body().get("question_id")
    found = [(q, d) for d in get_domains() for q in d["questions"] if q["id"] == qid]
    if not found:
        return error("Unknown statement.", 400)
    question, domain = found[0]
    hit = _cache.get(qid)
    observability.set_attrs(None, {"input.value": qid, "oci.domain_id": domain["id"],
                                   "oci.cached": bool(hit and time.time() - hit[0] < CACHE_SECONDS)})
    if hit and time.time() - hit[0] < CACHE_SECONDS:
        return jsonify(hit[1])
    who = _who(qid, domain["id"])
    if not who["orgs"]:
        return error("No organization has this growth priority yet.", 404)
    try:
        out = write_brief(question, domain["name"], who)
    except pipeline.ReportError as exc:
        return error(str(exc), 502)
    except Exception:  # Bedrock or network failure: nothing to show but a retry
        return error("We could not write the training brief right now. Please try again.", 502)
    out.update(question_id=qid, statement=question["text"], domain_name=domain["name"], who=who,
               generated=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"))
    observability.set_attrs(None, {"oci.network_orgs": who["orgs"], "output.value": out["title"],
                                   "oci.resources": [r["url"] for r in out["resources"]] or None})
    _cache[qid] = (time.time(), out)
    return jsonify(out)
