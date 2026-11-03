"""Offline content step: glossary + Spanish questionnaire, written by Claude once and committed as static JSON.

Run from the repo root with AWS credentials:  python3 scripts/gen_content.py
Outputs frontend/public/content/glossary.json and questions_es.json. Review both by hand before committing.
This is translation and plain-language help only; answers stay keyed by statement id, so scoring is untouched.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from pipeline import MODEL_ID, _converse, clean  # noqa: E402

OUT = os.path.join(ROOT, "frontend", "public", "content")
STYLE = ("Write at a grade 6 to 8 reading level for leaders of small community violence intervention nonprofits. "
         "Warm and plain. Never use em dashes. Reply with JSON only, no prose, no code fences.")


def ask(prompt):
    content = _converse("content step", modelId=MODEL_ID, system=[{"text": STYLE}],
                        messages=[{"role": "user", "content": [{"text": prompt}]}],
                        inferenceConfig={"maxTokens": 16000})
    text = next(b["text"] for b in content if "text" in b)
    return json.loads(re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip()))


def in_text(term, text):
    return re.search(r"\b%s\b" % re.escape(term), text, re.I) is not None


def glossary(statements):
    lines = "\n".join("%s: %s" % (q["id"], q["text"]) for q in statements)
    items = ask(
        "Here are the statements of a nonprofit self-assessment:\n" + lines + "\n\n"
        "List 25 to 40 jargon terms a small nonprofit leader may not know (for example logic model, restricted funding, "
        "audit, theory of change, KPI, reserves, 990, succession plan). Each term must appear word for word in at least "
        "one statement. Return a JSON array of objects {\"term\": exact words as they appear, lowercase unless a proper "
        "noun or acronym, \"plain\": one short sentence saying what it means, \"example\": one short sentence starting "
        "with \"For example,\" set in a small CVI nonprofit}.")
    keep = [{"term": i["term"].strip(), "plain": clean(i["plain"]), "example": clean(i["example"])}
            for i in items if any(in_text(i["term"].strip(), q["text"]) for q in statements)]
    dropped = len(items) - len(keep)
    if dropped:
        print("dropped %d glossary terms that do not appear in any statement" % dropped)
    return sorted(keep, key=lambda i: i["term"].lower())


def translate(domain, info):
    src = {q["id"]: q["text"] for q in domain["questions"]}
    src["about"], src["connects"], src["name"] = info["about"], info["connects"], domain["name"]
    out = ask(
        "Translate each value of this JSON object into neutral Latin American Spanish. Keep the same keys. "
        "Keep the exact meaning, so a yes or no answer means the same thing in both languages: do not soften, "
        "add or drop conditions, numbers or time frames. Use plain words (grade 6 to 8) and \"nosotros\" for the "
        "organization.\n\n" + json.dumps(src, ensure_ascii=False, indent=1))
    missing = set(src) - set(out)
    if missing:
        raise SystemExit("translation for %s is missing %s" % (domain["id"], sorted(missing)))
    res = {qid: {"text": clean(out[qid])} for qid in src if qid not in ("about", "connects", "name")}
    res[domain["id"]] = {"text": clean(out["name"]), "about": clean(out["about"]), "connects": clean(out["connects"])}
    return res


def main():
    with open(os.path.join(ROOT, "data", "questions.json")) as f:
        domains = json.load(f)["domains"]
    with open(os.path.join(ROOT, "data", "domain_info.json")) as f:
        info = json.load(f)["domains"]
    os.makedirs(OUT, exist_ok=True)
    statements = [q for d in domains for q in d["questions"]]

    terms = glossary(statements)
    with open(os.path.join(OUT, "glossary.json"), "w") as f:
        json.dump(terms, f, ensure_ascii=False, indent=1)
    print("glossary.json: %d terms" % len(terms))

    es = {}
    for d in domains:
        es.update(translate(d, info[d["id"]]))
        print("translated", d["id"])
    assert all(q["id"] in es for q in statements), "every statement needs a Spanish text"
    with open(os.path.join(OUT, "questions_es.json"), "w") as f:
        json.dump(es, f, ensure_ascii=False, indent=1)
    print("questions_es.json: %d statements" % len(statements))


if __name__ == "__main__":
    main()
