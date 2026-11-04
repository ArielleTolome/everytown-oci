"""Tracing: off without OCI_PHOENIX_ENDPOINT (no network, no errors); on, one run_job is one trace with the agreed
span tree, token counts, retriever documents, a staff-only audit link and online-check annotations."""
import copy
import os
import sys
import types
import unittest
import urllib.request
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app  # noqa: E402
import observability  # noqa: E402
import pipeline  # noqa: E402


def reset():
    observability._provider = observability._tracer = None
    observability._endpoint = observability._key = ""
    del observability._pending[:]


def sample_sub(profile=None):
    domains = app._domains(app.DEFAULT_DOMAINS)
    s = app.SAMPLES["A"]
    answers = {q["id"]: s["answers"][q["id"]] for d in domains for q in d["questions"]}
    sub = app.build_assessment({"org_name": "Playwright Trace Org", "org_url": "https://peace.example.org",
                                "language": "en", "org_meta": s["org_meta"],
                                "respondent": {"name": "Secret Person", "role": "Executive director"}},
                               answers, domains, profile)
    return sub


class FakeBedrock:
    """Converse: text for the research summary, a report tool call otherwise. Retrieve: two KB passages."""

    def __init__(self, gap_ids):
        self.gap_ids = gap_ids

    def converse(self, **kw):
        usage = {"inputTokens": 100, "outputTokens": 50, "totalTokens": 1150, "cacheReadInputTokens": 900,
                 "cacheWriteInputTokens": 100}
        if "toolConfig" not in kw:
            content = [{"text": "A small street outreach group."}]
            return {"stopReason": "end_turn", "output": {"message": {"content": content}}, "usage": usage}
        g = self.gap_ids
        raw = {"summary": "You run a strong team. Keep going.", "strengths": ["Trust"], "conversation": ["What next?"],
               "focus": [{"title": "Plan", "why": "w", "gap_ids": [g[0]], "steps": ["Meet."]}],
               "plan": [{"horizon": 30, "title": "Plan", "why": "w", "gap_ids": [g[0], "NOPE1"], "owner": "Board",
                         "steps": ["Meet."]},
                        {"horizon": 60, "title": "Invented", "why": "w", "gap_ids": ["NOPE2"], "steps": []}]}
        content = [{"toolUse": {"toolUseId": "t1", "name": "submit_report", "input": raw}}]
        return {"stopReason": "tool_use", "output": {"message": {"content": content}}, "usage": usage}

    def retrieve(self, **kw):
        return {"retrievalResults": [
            {"content": {"text": "Passage %d" % i}, "score": 0.5 + i / 10,
             "location": {"s3Location": {"uri": "s3://kb/guide%d.md" % i}}} for i in range(2)]}


class TracingOff(unittest.TestCase):
    def setUp(self):
        reset()
        self.addCleanup(reset)

    def test_unset_endpoint_is_a_silent_noop(self):
        with mock.patch.dict(os.environ, {}, clear=False), \
                mock.patch.object(urllib.request, "urlopen", side_effect=AssertionError("network")):
            os.environ.pop("OCI_PHOENIX_ENDPOINT", None)
            observability.setup()
            self.assertFalse(observability.enabled())
            with observability.span("x", "LLM", **{"input.value": "q"}) as s:
                s.set_attribute("a", 1)
                observability.set_attrs(s, {"b": 2})
                observability.llm_request(s, {"modelId": "m"})
                self.assertIsNone(observability.current_trace_id())
            observability.annotate("current", "check", score=1.0, label="pass")
            observability.record_error(s, ValueError("x"))
            observability.flush()
            self.assertEqual(observability._pending, [])

    def test_run_job_without_tracing_stores_no_trace(self):
        sub = sample_sub(profile="Given profile.")
        fake = FakeBedrock([g["question_id"] for g in sub["gaps"]])
        with mock.patch.object(app.db, "get", return_value=sub), mock.patch.object(app.db, "update"), \
                mock.patch.object(app.report, "build_pdf", return_value=b"%PDF"), \
                mock.patch.object(pipeline, "_client", return_value=fake), mock.patch.object(pipeline, "KB_ID", None):
            app.run_job(sub["id"])
        self.assertEqual(sub["status"], "done")
        self.assertNotIn("trace", sub)

    def test_annotate_never_raises(self):
        observability.setup(exporter=self._exporter())
        observability.annotate(object(), "bad span")  # not a span: logged, not raised
        with mock.patch.object(observability, "_endpoint", "http://127.0.0.1:9"):
            observability.annotate("0123456789abcdef", "ok", score=1)
            observability.flush(timeout_s=0.5)  # connection refused: swallowed

    def _exporter(self):
        from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
        return InMemorySpanExporter()


class TracingOn(unittest.TestCase):
    def setUp(self):
        from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
        reset()
        self.addCleanup(reset)
        p = mock.patch.object(observability, "PROJECT", "everytown-oci")  # independent of the shell's env
        p.start()
        self.addCleanup(p.stop)
        self.exporter = InMemorySpanExporter()
        observability.setup(exporter=self.exporter)

    def run_job(self):
        sub = sample_sub()
        fake = FakeBedrock([g["question_id"] for g in sub["gaps"]])
        page = "<html><title>Peace Org</title><body>%s</body></html>" % ("We stop violence in our city. " * 80)
        checks = types.ModuleType("evals.checks")
        checks.report_checks = lambda s, r, raw=None: [
            {"name": "grounded", "score": 1.0, "label": "pass", "explanation": "ok"},
            {"name": "raw_drop_rate", "score": 0.5, "label": "fail", "explanation": "raw had %d plan items"
             % len(raw["plan"])}]
        with mock.patch.object(app.db, "get", return_value=sub), mock.patch.object(app.db, "update"), \
                mock.patch.object(app.db, "query", return_value=[{"source": "web", "owner": "owner-123"}]), \
                mock.patch.object(app.report, "build_pdf", return_value=b"%PDF"), \
                mock.patch.object(pipeline, "fetch", lambda url: (page, url)), \
                mock.patch.object(pipeline, "_client", return_value=fake), \
                mock.patch.object(pipeline, "KB_ID", "kb"), \
                mock.patch.dict(sys.modules, {"evals": types.ModuleType("evals"), "evals.checks": checks}), \
                mock.patch.object(observability, "flush"), \
                mock.patch.dict(os.environ, {"OCI_PHOENIX_UI": "https://phoenix.example"}):
            app.run_job(sub["id"])
        return sub, {s.name: s for s in self.exporter.get_finished_spans()}

    def test_run_job_is_one_trace_with_the_agreed_tree(self):
        sub, spans = self.run_job()
        self.assertEqual(sub["status"], "done")
        root = spans["oci.report"]
        self.assertIsNone(root.parent)
        for name in ("score", "research.website", "research.news", "research.summarize", "library.kb_retrieve",
                     "report.write", "report.validate", "report.plain_language", "online_checks"):
            self.assertIn(name, spans)
            self.assertEqual(spans[name].context.trace_id, root.context.trace_id, name)
        # thread-pool research spans keep their parent
        self.assertEqual(spans["research.website"].parent.span_id, root.context.span_id)
        a = root.attributes
        self.assertEqual((a["session.id"], a["oci.source"], a["openinference.span.kind"]), (sub["id"], "web", "CHAIN"))
        self.assertNotIn("owner-123", str(dict(a)))
        self.assertNotIn("Secret Person", str([dict(s.attributes) for s in spans.values()]))
        self.assertFalse(spans["score"].attributes["oci.model_used"])

    def test_llm_retriever_and_validation_attributes(self):
        _, spans = self.run_job()
        llm = spans["report.write"].attributes
        self.assertEqual(llm["openinference.span.kind"], "LLM")
        self.assertEqual((llm["llm.token_count.prompt"], llm["llm.token_count.prompt_details.cache_read"],
                          llm["llm.token_count.completion"]), (1100, 900, 50))
        self.assertEqual(llm["llm.input_messages.0.message.role"], "system")
        self.assertEqual(llm["llm.output_messages.0.message.tool_calls.0.tool_call.function.name"], "submit_report")
        self.assertIn("NOPE2", llm["llm.output_messages.0.message.tool_calls.0.tool_call.function.arguments"])
        self.assertEqual(llm["oci.stop_reason"], "tool_use")
        kb = spans["library.kb_retrieve"].attributes
        self.assertEqual((kb["retrieval.documents.1.document.id"], kb["retrieval.documents.1.document.score"]),
                         ("guide1.md", 0.6))
        v = spans["report.validate"].attributes
        self.assertEqual((v["oci.plan_in"], v["oci.dropped.no_grounded_gap_id"], v["oci.dropped.unknown_gap_id_removed"]),
                         (2, 1, 2))

    def test_audit_link_and_online_check_annotations(self):
        sub, spans = self.run_job()
        root = spans["oci.report"]
        trace_id = format(root.context.trace_id, "032x")
        self.assertEqual(sub["trace"]["trace_id"], trace_id)
        self.assertEqual(sub["trace"], {"trace_id": trace_id, "project": "everytown-oci",
                                        "url": "https://phoenix.example/redirects/traces/" + trace_id})
        notes = {n["name"]: n for n in observability._pending}
        self.assertEqual(set(notes), {"grounded", "raw_drop_rate"})
        self.assertEqual(notes["raw_drop_rate"]["span_id"], format(root.context.span_id, "016x"))
        self.assertEqual((notes["raw_drop_rate"]["annotator_kind"], notes["raw_drop_rate"]["result"]["label"]),
                         ("CODE", "fail"))
        self.assertEqual(root.attributes["oci.checks.failed"], ("raw_drop_rate",))

    def test_orgs_never_get_the_trace_link(self):
        sub = sample_sub(profile="p")
        sub["trace"] = {"trace_id": "t", "project": "everytown-oci", "url": "https://phoenix/redirects/traces/t"}
        client = app.app.test_client()
        with mock.patch.object(app.db, "get", side_effect=lambda sid: copy.deepcopy(sub)):
            for user, seen in (("demo", False), ("staff", True)):
                client.post("/api/login", json={"username": user, "password": user})
                self.assertEqual("trace" in client.get("/api/assessments/" + sub["id"]).get_json(), seen, user)


if __name__ == "__main__":
    unittest.main()
