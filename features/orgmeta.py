"""Optional organization details (program model, staff size, state) for grouping grantees on the staff dashboard.
Fixed lists only, so the values can be counted; nothing here is scored."""
from flask import Blueprint, jsonify, session

bp = Blueprint("orgmeta", __name__)

PROGRAM_MODELS = ["Street outreach", "Hospital-based violence intervention", "Mentoring/youth development",
                  "Therapy/CBT", "Re-entry support", "Other"]
STAFF_SIZES = ["1-5", "6-10", "11-20", "21-50", "51+"]
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
    """Keep only known values; None when nothing valid was given (the fieldset is optional)."""
    raw = raw if isinstance(raw, dict) else {}
    models = raw.get("program_models")
    meta = {
        "program_models": [m for m in PROGRAM_MODELS if isinstance(models, list) and m in models],
        "staff_size": raw.get("staff_size") if raw.get("staff_size") in STAFF_SIZES else None,
        "state": raw.get("state") if isinstance(raw.get("state"), str) and raw["state"] in STATES else None,
    }
    return meta if meta["program_models"] or meta["staff_size"] or meta["state"] else None


@bp.route("/api/org-meta")
def options():
    from app import error

    if not session.get("user"):
        return error("Please sign in.", 401)
    return jsonify(program_models=PROGRAM_MODELS, staff_sizes=STAFF_SIZES,
                   states=[{"code": k, "name": v} for k, v in sorted(STATES.items(), key=lambda s: s[1])])
