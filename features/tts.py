"""Read-aloud with Amazon Polly: one report section as MP3. The spoken text is built in code from the validated report."""
import logging
import re
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor

from botocore.exceptions import ClientError
from flask import Blueprint, Response, request, session

import observability

bp = Blueprint("tts", __name__)
SECTIONS = ("summary", "focus", "plan", "strengths", "conversation")
VOICES = {"en": ("Ruth", "en-US"), "es": ("Lupe", "es-US")}
# Polly allows 3,000 characters per request. Generative voices take about 1 s per 100 characters, so smaller chunks
# synthesized in parallel keep a long section well under CloudFront's 30 s origin timeout.
MAX_CHUNK = 1000
CACHE_SIZE = 16
_cache = OrderedDict()  # (assessment id, section, language) -> MP3 bytes; a finished report never changes
_engines = ["generative", "neural"]  # generative first; dropped from the list if this region or voice lacks it

WORDS = {
    "en": {"summary": "What's true about you.", "focus": "Start here: your top priorities.",
           "priority": "Priority %d:", "todo": "What to do:", "plan": "Your 30, 60 and 90 day plan.",
           "action": "Action", "step": "Step",
           30: "First 30 days.", 60: "Next 30 days.", 90: "Last 30 days.", "owner": "Owner: %s.",
           "strengths": "What you already do well.",
           "conversation": "Team conversation guide. Use these questions at your next team or board meeting."},
    "es": {"summary": "Lo que es cierto sobre ustedes.", "focus": "Empiecen aquí: sus prioridades principales.",
           "priority": "Prioridad %d:", "todo": "Qué hacer:", "plan": "Su plan de 30, 60 y 90 días.",
           "action": "Acción", "step": "Paso",
           30: "Primeros 30 días.", 60: "Los siguientes 30 días.", 90: "Últimos 30 días.",
           "owner": "Responsable: %s.", "strengths": "Lo que ya hacen bien.",
           "conversation": "Guía de conversación para el equipo. Usen estas preguntas en su próxima reunión."},
}


@bp.before_request
def _signed_in():
    if not session.get("user"):
        from app import error
        return error("Please sign in.", 401)


def _s(text):
    """One spoken sentence: trimmed, ending in punctuation so Polly pauses."""
    text = (text or "").strip()
    return text if not text or text[-1] in ".!?:;" else text + "."


def _numbered(items, label=""):
    """'Step 1. Do this.' (or '1. ...' without a label), so nested lists stay clear when heard."""
    return [("%s %d. %s" % (label, i, _s(t))).strip() for i, t in enumerate(items, 1)]


def section_text(report, section, language):
    """Plain text for one section, in the report's language, with numbered items."""
    w = WORDS.get(language, WORDS["en"])
    lines = [w[section]] if section in w else []
    if section == "summary":
        lines.append(report.get("summary") or "")
    elif section == "focus":
        for i, f in enumerate(report.get("focus") or [], 1):
            lines += [w["priority"] % i, _s(f["title"]), _s(f.get("why"))]
            if f.get("steps"):
                lines += [w["todo"]] + _numbered(f["steps"], w["step"])
    elif section == "plan":
        for h in (30, 60, 90):
            items = [p for p in report.get("plan") or [] if p.get("horizon") == h]
            if items:
                lines.append(w[h])
            for i, p in enumerate(items, 1):
                lines += ["%s %d: %s" % (w["action"], i, _s(p["title"])), _s(p.get("why"))]
                if p.get("owner"):
                    lines.append(w["owner"] % p["owner"])
                lines += _numbered(p.get("steps") or [], w["step"])
    else:
        lines += _numbered(report.get(section) or [])
    return "\n".join(line for line in lines if line)


def chunks(text, limit=MAX_CHUNK):
    """Split at sentence ends (or line breaks) into pieces shorter than `limit` characters."""
    out, cur = [], ""
    for sentence in (s.strip() for s in re.split(r"(?<=[.!?:;])\s+|\n+", text)):
        while len(sentence) >= limit:  # a run-on sentence: cut at the last space that fits
            cut = sentence.rfind(" ", 0, limit) if " " in sentence[:limit] else limit - 1
            if cur:
                out.append(cur)
                cur = ""
            out.append(sentence[:cut].strip())
            sentence = sentence[cut:].strip()
        if not sentence:
            continue
        if cur and len(cur) + 1 + len(sentence) >= limit:
            out.append(cur)
            cur = sentence
        else:
            cur = (cur + " " + sentence).strip()
    if cur:
        out.append(cur)
    return out


def _speak(polly, chunk, voice, code):
    while True:
        engine = _engines[0]
        try:
            return polly.synthesize_speech(Text=chunk, Engine=engine, VoiceId=voice, LanguageCode=code,
                                           OutputFormat="mp3")["AudioStream"].read()
        except ClientError as exc:
            if engine == _engines[-1] or exc.response["Error"]["Code"] not in (
                    "EngineNotSupportedException", "ValidationException"):
                raise
            if _engines[0] == engine:
                _engines.pop(0)  # fall back to the neural voice


def synthesize(text, language):
    import pipeline
    voice, code = VOICES.get(language, VOICES["en"])
    polly = pipeline._client("polly")
    with ThreadPoolExecutor(max_workers=4) as pool:
        parts = list(pool.map(lambda chunk: _speak(polly, chunk, voice, code), chunks(text)))
    # MP3 frames concatenate into one stream; drop the ID3 tag Polly puts on every chunk but the first.
    return parts[0] + b"".join(_without_id3(p) for p in parts[1:])


def _without_id3(mp3):
    if mp3[:3] != b"ID3":
        return mp3
    size = (mp3[6] << 21) | (mp3[7] << 14) | (mp3[8] << 7) | mp3[9]  # ID3v2 size is "syncsafe": 7 bits per byte
    return mp3[10 + size:]


@bp.route("/api/assessments/<sid>/audio/<section>")
@observability.traced("tts.audio")
def audio(sid, section):
    """Same visibility as GET /api/assessments/<id>: any signed-in user with the link."""
    from app import error, load
    if section not in SECTIONS:
        return error("Unknown section.", 404)
    sub = load(sid)
    if not sub:
        return error("Report not found.", 404)
    report = sub.get("report")
    if not report or not report.get(section):
        return error("This section has nothing to read yet.", 404)
    text = section_text(report, section, sub["language"])
    key = (sub["id"], section, sub["language"])
    data = _cache.get(key)
    observability.set_attrs(None, {"oci.section": section, "oci.language": sub["language"], "oci.chars": len(text),
                                   "oci.chunks": len(chunks(text)), "oci.cached": data is not None})
    if data is None:
        try:
            started = time.monotonic()
            with observability.span("tts.synthesize", "TOOL", **{"tool.name": "polly.synthesize_speech",
                                                                 "input.value": text}) as span:
                data = synthesize(text, sub["language"])
                observability.set_attrs(span, {"oci.engine": _engines[0], "oci.mp3_bytes": len(data),
                                               "oci.ms": round((time.monotonic() - started) * 1000)})
        except Exception:
            logging.exception("polly failed for %s/%s", sub["id"], section)
            return error("We could not prepare the audio. Please try again.", 502)
        _cache[key] = data
        while len(_cache) > CACHE_SIZE:
            _cache.popitem(last=False)
    _cache.move_to_end(key)
    resp = Response(data, mimetype="audio/mpeg", headers={"Cache-Control": "private, max-age=3600"})
    # Safari only plays media from servers that answer byte-range requests.
    return resp.make_conditional(request, accept_ranges=True, complete_length=len(data))
