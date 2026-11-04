"""Tracing for every AI step: OpenTelemetry spans with OpenInference and gen_ai attributes, sent to AWS X-Ray's OTLP
endpoint (SigV4), where CloudWatch Transaction Search, generative AI observability and Omni read them, and to Arize
Phoenix (project = service name) when OCI_PHOENIX_ENDPOINT is set.

Off unless OCI_TRACES=xray or OCI_PHOENIX_ENDPOINT is set: then nothing is imported and every helper is a cheap
no-op. Tracing never breaks a request: setup and export failures are logged and swallowed. Never put a respondent's
name, a raw sign-in owner id or a guardrail trace (it holds unmasked values) on a span.
"""
import contextlib
import contextvars
import functools
import hashlib
import json
import logging
import os
import random
import threading
import time
import urllib.request

log = logging.getLogger(__name__)
SERVICE = os.environ.get("OCI_TRACE_SERVICE") or "everytown-oci"
REGION = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-west-2"
PHOENIX = (os.environ.get("OCI_PHOENIX_ENDPOINT") or "").rstrip("/")
MAX_ATTR = 60_000  # characters per attribute: a whole prompt fits in X-Ray's 200 KB span limit
QUALITY_NAMESPACE = "EverytownOCI/Quality"

_provider = None
_tracer = None
_pending = []  # Phoenix span annotations waiting for flush()
_lock = threading.Lock()


class _NoSpan:
    """Stands in for a span when tracing is off."""

    def __getattr__(self, name):
        return lambda *a, **kw: None

    def is_recording(self):
        return False


NOOP = _NoSpan()


def _exporter():
    """OTLP/HTTP to https://xray.<region>.amazonaws.com/v1/traces, each request signed with SigV4 (service "xray")
    using the Lambda role's (or local) credentials; no collector or extra package."""
    import botocore.session
    import requests
    from botocore.auth import SigV4Auth
    from botocore.awsrequest import AWSRequest
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

    creds = botocore.session.Session().get_credentials()

    class SigV4Session(requests.Session):
        def post(self, url, data=None, headers=None, **kw):
            req = AWSRequest(method="POST", url=url, data=data, headers=dict(headers or {}))
            SigV4Auth(creds.get_frozen_credentials(), "xray", REGION).add_auth(req)
            return super().post(url, data=data, headers=dict(req.headers), **kw)

    return OTLPSpanExporter(endpoint="https://xray.%s.amazonaws.com/v1/traces" % REGION, session=SigV4Session(),
                            timeout=5)


def _phoenix_exporter():
    """OTLP/HTTP to Phoenix's /v1/traces with its system API key."""
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    key = os.environ.get("OCI_PHOENIX_API_KEY")
    return OTLPSpanExporter(endpoint=PHOENIX + "/v1/traces", timeout=5,
                            headers={"authorization": "Bearer " + key} if key else None)


def setup(exporter=None):
    """Idempotent. `exporter` (tests) replaces the real exporters with an in-memory one, exported synchronously."""
    global _provider, _tracer
    xray = os.environ.get("OCI_TRACES") == "xray"
    if _provider is not None or not (exporter or xray or PHOENIX):
        return
    try:
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor, SimpleSpanProcessor
        from opentelemetry.sdk.trace.id_generator import RandomIdGenerator

        class XRayIds(RandomIdGenerator):
            """X-Ray trace ids start with the epoch seconds, so console links and time-range searches find them."""
            def generate_trace_id(self):
                return (int(time.time()) << 96) | random.getrandbits(96)

        provider = TracerProvider(id_generator=XRayIds(), resource=Resource.create({
            "service.name": SERVICE, "openinference.project.name": SERVICE,
            "deployment.environment.name": os.environ.get("OCI_STAGE") or "demo",
            "cloud.provider": "aws", "cloud.region": REGION}))
        if exporter:
            provider.add_span_processor(SimpleSpanProcessor(exporter))
        else:
            for on, make in ((xray, _exporter), (PHOENIX, _phoenix_exporter)):
                if on:
                    provider.add_span_processor(BatchSpanProcessor(make()))
        _tracer = provider.get_tracer("everytown-oci")
        _provider = provider
    except Exception:
        log.exception("tracing setup failed; continuing without traces")


def enabled():
    return _tracer is not None


def tracer():
    return _tracer


def _value(v):
    if isinstance(v, (bool, int, float)):
        return v
    if isinstance(v, (list, tuple)) and v and all(isinstance(x, str) for x in v):
        return [x[:MAX_ATTR] for x in v]
    if not isinstance(v, str):
        v = json.dumps(v, ensure_ascii=False, default=str)
    return v[:MAX_ATTR]


def set_attrs(span, attrs):
    """Set attributes (lists of strings stay lists, other non-scalars become JSON, None is skipped) on `span`, or
    the current span when `span` is None."""
    if _tracer is None:
        return
    try:
        if span is None:
            from opentelemetry import trace
            span = trace.get_current_span()
        span.set_attributes({k: _value(v) for k, v in attrs.items() if v is not None})
    except Exception:
        log.exception("could not set span attributes")


@contextlib.contextmanager
def span(name, kind="CHAIN", **attrs):
    """A current span of OpenInference `kind` (CHAIN, LLM, TOOL, RETRIEVER, EVALUATOR, AGENT). Dotted attribute
    names go in as **{"input.value": ...}. Exceptions are recorded on the span and re-raised."""
    if _tracer is None:
        yield NOOP
        return
    with _tracer.start_as_current_span(name) as s:
        set_attrs(s, dict(attrs, **{"openinference.span.kind": kind}))
        yield s


def record_error(span, exc):
    """Mark a span failed for an exception the code caught and handled."""
    if _tracer is None or span is NOOP:
        return
    try:
        from opentelemetry.trace import Status, StatusCode
        span.record_exception(exc)
        span.set_status(Status(StatusCode.ERROR, type(exc).__name__))
    except Exception:
        log.exception("could not record the error on the span")


def current_trace_id():
    if _tracer is None:
        return None
    from opentelemetry import trace
    ctx = trace.get_current_span().get_span_context()
    return format(ctx.trace_id, "032x") if ctx.is_valid else None


def xray_id(trace_id):
    """The X-Ray form of a 32-hex OpenTelemetry trace id: 1-<8 hex epoch>-<24 hex>."""
    return "1-%s-%s" % (trace_id[:8], trace_id[8:]) if trace_id else None


def cloudwatch_url(trace_id):
    return ("https://%s.console.aws.amazon.com/cloudwatch/home?region=%s#xray:traces/%s"
            % (REGION, REGION, xray_id(trace_id)) if trace_id else None)


def trace_link(trace_id):
    """{trace_id, project, url, cloudwatch_url} for the assessment document: `url` opens the trace in Phoenix (its own
    sign-in) when configured, else in the CloudWatch console (AWS sign-in); `cloudwatch_url` is always the console."""
    cw = cloudwatch_url(trace_id)
    url = "%s/redirects/traces/%s" % (PHOENIX, trace_id) if PHOENIX and trace_id else cw
    return {"trace_id": trace_id, "project": SERVICE, "url": url, "cloudwatch_url": cw}


def owner_hash(owner):
    """Stable, non-reversible tag for a sign-in session: never put the raw owner id on a span."""
    return hashlib.sha256(owner.encode()).hexdigest()[:12] if owner else None


def metric(namespace, dimensions, values):
    """One CloudWatch metric record in embedded metric format: on Lambda, a JSON line in the function's log that
    CloudWatch turns into metrics (no API call, no latency). Elsewhere a no-op. Never raises."""
    if not os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        return
    try:
        print(json.dumps(dict(dimensions, **values, _aws={"Timestamp": int(time.time() * 1000), "CloudWatchMetrics": [
            {"Namespace": namespace, "Dimensions": [list(dimensions)], "Metrics": [{"Name": k} for k in values]}]})),
              flush=True)
    except Exception:
        log.exception("could not emit metric")


def annotate(span, name, score=None, label=None, explanation=None, kind="CODE"):
    """Queue a Phoenix span annotation on `span`; flush() sends it after the span itself (Phoenix needs the span
    first). No-op without Phoenix. Never raises."""
    if _tracer is None or not PHOENIX:
        return
    try:
        ctx = span.get_span_context()
        if ctx.is_valid:
            with _lock:
                _pending.append({"span_id": format(ctx.span_id, "016x"), "name": name, "annotator_kind": kind,
                                 "result": {"label": label, "score": score, "explanation":
                                            explanation[:2000] if isinstance(explanation, str) else None}})
    except Exception:
        log.exception("could not queue annotation %s", name)


def flush(timeout_s=5):
    """Export finished spans to every backend, then queued Phoenix annotations. Called after every Lambda
    invocation. Never raises."""
    if _provider is None:
        return
    try:
        _provider.force_flush(int(timeout_s * 1000))
        with _lock:
            batch = _pending[:]
            del _pending[:]
        if batch:
            req = urllib.request.Request(
                PHOENIX + "/v1/span_annotations", data=json.dumps({"data": batch}).encode(), method="POST",
                headers={"Content-Type": "application/json",
                         "Authorization": "Bearer " + (os.environ.get("OCI_PHOENIX_API_KEY") or "")})
            urllib.request.urlopen(req, timeout=timeout_s).read()
    except Exception as exc:
        log.warning("trace export failed: %s", exc)


def in_context(fn):
    """`fn` bound to a copy of the current trace context, for work handed to a thread pool."""
    if _tracer is None:
        return fn
    ctx = contextvars.copy_context()
    return lambda *a, **kw: ctx.run(fn, *a, **kw)


def traced(name):
    """Light CHAIN span around a Flask view: route, method, status, user role and hashed session owner."""
    def deco(view):
        @functools.wraps(view)
        def wrapped(*a, **kw):
            if _tracer is None:
                return view(*a, **kw)
            from flask import request, session
            user = session.get("user") or {}
            with span(name, "CHAIN", **{"user.role": user.get("role"), "user.id": owner_hash(session.get("owner")),
                                        "session.id": kw.get("sid"), "http.method": request.method,
                                        "http.route": request.url_rule.rule if request.url_rule else None}) as s:
                resp = view(*a, **kw)
                status = resp[1] if isinstance(resp, tuple) else getattr(resp, "status_code", None)
                set_attrs(s, {"http.status_code": status})
                return resp
        return wrapped
    return deco


# ---------- OpenInference LLM attributes for one Bedrock Converse call ----------

def _text(blocks):
    return "\n".join(b["text"] for b in blocks or [] if isinstance(b, dict) and "text" in b)


def llm_request(span, kw):
    """Model, parameters, system + messages, and tool schemas of a Converse request."""
    if span is NOOP or _tracer is None:
        return
    attrs = {"llm.model_name": kw.get("modelId"), "llm.provider": "aws", "llm.system": "anthropic",
             "llm.invocation_parameters": dict(kw.get("inferenceConfig") or {},
                                               toolChoice=(kw.get("toolConfig") or {}).get("toolChoice"))}
    messages = ([{"role": "system", "content": kw["system"]}] if kw.get("system") else []) + list(kw.get("messages") or [])
    for i, m in enumerate(messages):
        attrs["llm.input_messages.%d.message.role" % i] = m.get("role")
        attrs["llm.input_messages.%d.message.content" % i] = _text(m.get("content"))
    for i, t in enumerate((kw.get("toolConfig") or {}).get("tools") or []):
        attrs["llm.tools.%d.tool.json_schema" % i] = t.get("toolSpec")
    attrs["input.value"] = _text(messages[-1].get("content")) if messages else None
    attrs["oci.guardrail.enabled"] = "guardrailConfig" in kw
    # OpenTelemetry gen_ai semantic conventions, which CloudWatch generative AI observability reads.
    attrs.update({"gen_ai.system": "aws.bedrock", "gen_ai.operation.name": "chat",
                  "gen_ai.request.model": kw.get("modelId"),
                  "gen_ai.request.max_tokens": (kw.get("inferenceConfig") or {}).get("maxTokens")})
    set_attrs(span, attrs)


def llm_response(span, resp, guardrail):
    """Output text and tool calls, token counts (cache read/write included), stop reason and guardrail action."""
    if span is NOOP or _tracer is None:
        return
    content = ((resp.get("output") or {}).get("message") or {}).get("content") or []
    usage = resp.get("usage") or {}
    cache_read, cache_write = usage.get("cacheReadInputTokens") or 0, usage.get("cacheWriteInputTokens") or 0
    attrs = {"llm.output_messages.0.message.role": "assistant",
             "llm.output_messages.0.message.content": _text(content),
             "llm.token_count.prompt": (usage.get("inputTokens") or 0) + cache_read + cache_write,
             "llm.token_count.prompt_details.cache_read": cache_read,
             "llm.token_count.prompt_details.cache_write": cache_write,
             "llm.token_count.completion": usage.get("outputTokens"),
             "llm.token_count.total": usage.get("totalTokens"),
             "oci.stop_reason": resp.get("stopReason"), "oci.guardrail.action": guardrail,
             "oci.latency_ms": (resp.get("metrics") or {}).get("latencyMs"),
             "oci.reasoning_blocks": sum(1 for c in content if "reasoningContent" in c)}
    tools = [c["toolUse"] for c in content if "toolUse" in c]
    for j, t in enumerate(tools):
        p = "llm.output_messages.0.message.tool_calls.%d.tool_call." % j
        attrs.update({p + "id": t.get("toolUseId"), p + "function.name": t.get("name"),
                      p + "function.arguments": t.get("input")})
    attrs["output.value"] = json.dumps(tools[0].get("input"), ensure_ascii=False) if tools else _text(content)
    attrs["output.mime_type"] = "application/json" if tools else "text/plain"
    attrs.update({"gen_ai.usage.input_tokens": attrs["llm.token_count.prompt"],
                  "gen_ai.usage.output_tokens": usage.get("outputTokens"),
                  "gen_ai.response.finish_reasons": [resp["stopReason"]] if resp.get("stopReason") else None})
    set_attrs(span, attrs)


# ---------- one report run (app.run_job) ----------

def report_attrs(sub, source=None, owner=None):
    """Root span attributes: what the run was about, never the respondent's name. input.value is a compact facts summary."""
    meta = sub.get("org_meta") or {}
    facts = {"language": sub.get("language"), "overall": sub.get("overall"),
             "domains": [{k: d.get(k) for k in ("domain_id", "estimated_stage", "score_pct", "gap_count", "high_count")}
                         for d in sub.get("domains") or []],
             "top_growth_priorities": [g["question_id"] for g in (sub.get("gaps") or [])[:5]],
             "progress_since_last": bool(sub.get("progress"))}
    return {"session.id": sub["id"], "user.id": owner_hash(owner), "oci.assessment_id": sub["id"],
            "oci.org_name": sub.get("org_name"), "oci.language": sub.get("language"), "oci.source": source,
            "oci.domain_ids": sub.get("domain_ids"), "oci.program_models": meta.get("program_models"),
            "oci.staff_size": meta.get("staff_size"), "oci.budget": meta.get("budget"),
            "oci.respondent_role": (sub.get("respondent") or {}).get("role"),
            "tag.tags": [t for t in ("report", source, sub.get("language")) if t],
            "input.value": facts, "input.mime_type": "application/json"}


def score_attrs(sub):
    """The deterministic engine already ran at submit time; this records its result and that no model was used."""
    o = sub.get("overall") or {}
    return {"oci.model_used": False, "oci.engine": "engine.scoring.calculate_recommendations",
            "oci.gaps.total": o.get("total_gaps"), "oci.gaps.high": o.get("high"), "oci.gaps.medium": o.get("medium"),
            "oci.gaps.low": o.get("low"), "oci.favorable_pct": o.get("favorable_pct"),
            "output.value": {d["domain_id"]: d["estimated_stage"] for d in sub.get("domains") or []}}


def online_checks(sub, raw, root):
    """Run evals.checks.report_checks on every finished report: each result becomes a CloudWatch metric
    (EverytownOCI/Quality, CheckScore and CheckFailed by Check), a Phoenix CODE annotation on `root` and, when tracing
    is on, attributes on the online_checks span and on `root`. Skipped when the evals package is absent. Never raises."""
    try:
        from evals.checks import report_checks
    except ImportError:
        return
    with span("online_checks", "EVALUATOR") as s:
        try:
            results = report_checks(sub, sub["report"], raw or None)
            attrs = {}
            for r in results:
                attrs["oci.check.%s.score" % r["name"]] = r.get("score")
                attrs["oci.check.%s.label" % r["name"]] = r.get("label")
                if isinstance(r.get("score"), (int, float)):
                    metric(QUALITY_NAMESPACE, {"Check": r["name"]},
                           {"CheckScore": r["score"], "CheckFailed": int(r.get("label") == "fail")})
                annotate(root, r["name"], score=r.get("score"), label=r.get("label"), explanation=r.get("explanation"))
            failed = [r["name"] for r in results if r.get("label") == "fail"]
            attrs.update({"oci.checks.failed": failed or None, "oci.checks.count": len(results),
                          "output.value": {r["name"]: r.get("label") for r in results}})
            set_attrs(s, attrs)
            set_attrs(root, attrs)
        except Exception as exc:
            log.exception("online checks failed")
            record_error(s, exc)
