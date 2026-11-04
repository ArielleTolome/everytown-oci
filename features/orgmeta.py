"""Organization details (program model, staff size, budget, states or territories), who filled out the assessment, and
public links for personalization. Fixed lists only, so the values can be counted; nothing here is scored."""
from flask import Blueprint, jsonify, session

bp = Blueprint("orgmeta", __name__)

PROGRAM_MODELS = ["Street outreach", "Hospital-based violence intervention", "Mentoring/youth development",
                  "Therapy/CBT", "Re-entry support", "Other"]
STAFF_SIZES = ["1-5", "6-10", "11-20", "21-50", "51+"]
BUDGETS = ["Under $250K", "$250K to $1M", "$1M to $5M", "Over $5M"]
RESPONDENT_ROLES = ["Executive director", "Finance lead or bookkeeper", "Board chair or member", "Program director",
                    "Other leadership role"]
MAX_SOCIAL = 5
MAX_STATES = 10
STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado",
    "CT": "Connecticut", "DE": "Delaware", "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan",
    "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York", "NC": "North Carolina",
    "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania",
    "PR": "Puerto Rico", "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee",
    "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
    "WI": "Wisconsin", "WY": "Wyoming",
}


def clean_org_meta(raw):
    """Keep only known values; None when nothing valid was given (the fieldset is optional). States are a list of
    codes, deduped in order; a draft saved before v1.9 holds one `state` code instead."""
    raw = raw if isinstance(raw, dict) else {}
    models = raw.get("program_models")
    states = raw.get("states") if isinstance(raw.get("states"), list) else [raw.get("state")]
    meta = {
        "program_models": [m for m in PROGRAM_MODELS if isinstance(models, list) and m in models],
        "staff_size": raw.get("staff_size") if raw.get("staff_size") in STAFF_SIZES else None,
        "budget": raw.get("budget") if raw.get("budget") in BUDGETS else None,
        "states": list(dict.fromkeys(s for s in states if isinstance(s, str) and s in STATES))[:MAX_STATES],
    }
    return meta if meta["program_models"] or meta["staff_size"] or meta["budget"] or meta["states"] else None


def clean_respondent(raw):
    """(respondent or None, error or None). The role comes from a fixed list; name and title are free text, trimmed.
    The name is stored for the organization's own report only and is never sent to the AI model."""
    if not isinstance(raw, dict):
        return None, None
    text = {k: " ".join(str(raw.get(k) or "").split())[:100] or None for k in ("name", "title")}
    role = raw.get("role")
    if role in (None, ""):
        return (dict(text, role=None), None) if any(text.values()) else (None, None)
    if role not in RESPONDENT_ROLES:
        return None, "Choose the role that fits you best."
    return dict(text, role=role), None


def clean_social(raw):
    """(up to 5 unique http(s) links, error or None). A bare domain gets https:// like the website field."""
    from pipeline import looks_like_web_url

    links = []
    for item in raw if isinstance(raw, list) else []:
        url = str(item or "").strip()[:500]
        if not url:
            continue
        if "://" not in url:
            url = "https://" + url
        if not looks_like_web_url(url):
            return [], "Enter each social media link as a full web address, like https://instagram.com/yourgroup."
        if url not in links:
            links.append(url)
    if len(links) > MAX_SOCIAL:
        return [], "Add up to %d social media links." % MAX_SOCIAL
    return links, None


@bp.route("/api/org-meta")
def options():
    from app import error

    if not session.get("user"):
        return error("Please sign in.", 401)
    return jsonify(program_models=PROGRAM_MODELS, staff_sizes=STAFF_SIZES, budgets=BUDGETS,
                   respondent_roles=RESPONDENT_ROLES,
                   states=[{"code": k, "name": v} for k, v in sorted(STATES.items(), key=lambda s: s[1])])
