"""Optional pinned-DSH integration check with a deterministic loopback provider."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import threading
import unittest
from unittest.mock import patch

from dsh import Dsh, DshFailure
import test_literature


class ScriptedProvider(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        pass

    def do_POST(self):
        request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        messages = request["messages"]
        self.chat = self.path.endswith("/chat/completions")
        self.stream = request.get("stream", False)
        if self.chat:
            request["tools"] = [entry["function"] for entry in request.get("tools", [])]
            for message in messages:
                content = message.get("content")
                if message["role"] == "tool":
                    message["content"] = [{"type": "tool_result", "content": content}]
                elif not isinstance(content, list):
                    message["content"] = [{"type": "text", "text": content or ""}]
                message["content"].extend({"type": "tool_use", "name": tool["function"]["name"]}
                                          for tool in message.get("tool_calls", []))
        prompt = next(block["text"] for m in messages if m["role"] == "user"
                      for block in m["content"] if isinstance(block, dict) and block["type"] == "text")
        if "\nTranslation request: " in prompt:
            payload = json.loads(prompt.split("\nTranslation request: ", 1)[1])
            self.server.translation_requests.append((payload, request.get("tools", [])))
            rows = [{"id": item["id"], "text": "译文 " + item["source"]} for item in payload["segments"]]
            if payload["target_language"] == "en":
                rows[0]["id"] = "unrequested"
            self.respond({"type": "text", "text": json.dumps({"translations": rows})})
            return
        if prompt == "Reply with OK.":
            self.server.probes.append((request["model"], request["max_tokens"], request.get("tools", [])))
            self.respond({"type": "text", "text": "OK"})
            return
        if "\nApproved passage IDs: " in prompt:
            results = [b for m in messages for b in m["content"]
                       if isinstance(b, dict) and b["type"] == "tool_result"]
            if not results:
                pid = json.loads(prompt.split("\nApproved passage IDs: ", 1)[1].splitlines()[0])[0]
                self.respond({"type": "tool_use", "id": "selection", "name": "paper_read", "input": {"id": pid}})
            else:
                blocks = results[-1]["content"]
                passage = json.loads(blocks if isinstance(blocks, str) else blocks[0]["text"])
                item = {"text": "The selected excerpt is: " + passage["text"],
                        "evidence": [{"id": passage["passage_id"], "quote": passage["text"]}]}
                self.respond({"type": "text", "text": json.dumps({"sentences": [item]})})
            return
        metadata, _, rest = prompt.split("\nPapers: ", 1)[1].partition("\nChecks: ")
        checks = json.loads(rest) if rest else []
        metadata, _, rest = metadata.partition("\nSentences: ")
        sentences = json.loads(rest) if rest else []
        sources = json.loads(metadata.split("\nQuestion:", 1)[0])
        version = sources[0]["source_version_id"]
        available = {t["name"] for t in request.get("tools", [])}
        if hasattr(self.server, "observed_tools"):
            self.server.observed_tools.append(available)
            self.server.research_models.append(request["model"])
        if hasattr(self.server, "first_request") and self.server.first_request is None:
            import time
            self.server.first_request = time.monotonic()
        results = [b for m in messages for b in m["content"]
                   if isinstance(b, dict) and b["type"] == "tool_result"]

        def tool(name, args):
            return {"type": "tool_use", "id": "toolu_" + str(len(results)), "name": name, "input": args}

        def content(result):
            blocks = result["content"]
            return json.loads(blocks if isinstance(blocks, str) else blocks[0]["text"])

        names = [b["name"] for m in messages for b in m["content"]
                 if isinstance(b, dict) and b["type"] == "tool_use"]
        if not results and "Start with wiki_search" in prompt and "wiki_search" in available:
            block = tool("wiki_search", {"query": "Evaluate evidence"})
        elif "paper_search" not in names and "paper_search" in available:
            block = tool("paper_search", {"query": "benchmark", "version": version})
        elif "paper_read" not in names and "paper_read" in available:
            block = tool("paper_read", {"ids": [content(results[-1])[0]["passage_id"]]})
        else:
            passages = content(results[-1]) if results else []
            citations = [{"id": row["passage_id"], "quote": row["text"][:160]} for row in passages[:1]]
            point = {"title": "Evaluate answers with evidence", "claims": [
                {"text": "The first source defines an evaluation benchmark.", "assessment": "supported",
                 "contributions": [{"version": version, "role": "Defines the benchmark", "assessment": "supported",
                                    "evidence": citations}]},
            ]}
            if "wiki_search" in names:
                point["prior_id"] = content(results[0])[0]["id"]
            response = ({"checks": [{"id": check["id"], "status": "supported", "limit": "Fixture",
                                     "evidence": citations} for check in checks]} if checks else
                        {"points": [point], "relations": [], "gaps": []})
            if sentences:
                response = {"suggestions": [{"id": row["id"], "claims": [
                    {"text": row["text"], "status": "supported", "limit": "Fixture", "evidence": citations}]}
                    for row in sentences]}
            if prompt.startswith("Answer using paper_search"):
                response = {"sentences": [{"text": "The source defines the benchmark.", "evidence": citations}]}
                if prompt.endswith("Return an invalid response."):
                    response = {"invalid": True}
            block = {"type": "text", "text": json.dumps(response)}
        self.respond(block)

    def respond(self, block):
        if self.chat:
            tool = block["type"] == "tool_use"
            delta = ({"tool_calls": [{"index": 0, "type": "function", "id": block["id"],
                                      "function": {"name": block["name"], "arguments": json.dumps(block["input"])}}]}
                     if tool else {"content": block["text"]})
            finish = "tool_calls" if tool else "stop"
            if self.stream:
                frames = [{"choices": [{"index": 0, "delta": delta}]},
                          {"choices": [{"index": 0, "delta": {}, "finish_reason": finish}],
                           "usage": {"prompt_tokens": 7, "completion_tokens": 3}}]
                body = ("".join("data: " + json.dumps(frame) + "\n\n" for frame in frames) + "data: [DONE]\n\n").encode()
            else:
                body = json.dumps({"choices": [{"message": delta, "finish_reason": finish}]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream" if self.stream else "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        stop = "tool_use" if block["type"] == "tool_use" else "end_turn"
        events = [("message_start", {"message": {"id": "msg_loopback", "type": "message",
                                               "role": "assistant", "model": "loopback", "content": [],
                                               "stop_reason": None, "usage": {"input_tokens": 7, "output_tokens": 0}}})]
        start = ({"type": "tool_use", "id": block["id"], "name": block["name"], "input": {}}
                 if stop == "tool_use" else {"type": "text", "text": ""})
        delta = ({"type": "input_json_delta", "partial_json": json.dumps(block["input"])}
                 if stop == "tool_use" else {"type": "text_delta", "text": block["text"]})
        events += [("content_block_start", {"index": 0, "content_block": start}),
                   ("content_block_delta", {"index": 0, "delta": delta}),
                   ("content_block_stop", {"index": 0}),
                   ("message_delta", {"delta": {"stop_reason": stop, "stop_sequence": None},
                                      "usage": {"output_tokens": 3}}),
                   ("message_stop", {})]
        body = "".join(f"event: {name}\ndata: {json.dumps({'type': name, **payload})}\n\n"
                       for name, payload in events).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


@unittest.skipUnless(os.environ.get("PAPERTRACE_TEST_DSH_CLI"), "Set PAPERTRACE_TEST_DSH_CLI for the pinned SDK check")
class DshResearchTest(unittest.TestCase):
    def test_real_harness_search_read_and_reviewed_wiki(self):
        # Reuse the real PDF setup and the same task/approval API as the desktop UI.
        fixture = test_literature.LiteratureTest()
        try:
            fixture.setUp()
            with ThreadingHTTPServer(("127.0.0.1", 0), ScriptedProvider) as provider:
                provider.observed_tools = []
                provider.probes = []
                provider.research_models = []
                provider.translation_requests = []
                server = threading.Thread(target=provider.serve_forever, daemon=True)
                server.start()
                try:
                    worker = fixture.worker
                    dsh = Dsh(os.environ.get("PAPERTRACE_DSH_NODE", "node"), os.environ["PAPERTRACE_TEST_DSH_CLI"],
                              "loopback-fixture", Path(fixture.workspace.name))
                    dsh.endpoint = f"http://127.0.0.1:{provider.server_port}"
                    worker.dsh = dsh
                    segments = [{"id": "1:1:1", "source": "Citation quality [1]"}]
                    result = dsh.translate(segments, "zh-CN", {"Citation": "引用"}, threading.Event())
                    self.assertEqual(result, {"1:1:1": "译文 Citation quality [1]"})
                    payload, tools = provider.translation_requests[0]
                    self.assertEqual(payload["segments"], segments)
                    self.assertEqual(tools, [])
                    with self.assertRaises(DshFailure) as invalid:
                        dsh.translate(segments, "en", {}, threading.Event())
                    self.assertEqual(invalid.exception.issue["reason"], "MODEL_OUTPUT_INVALID")
                    task = {"kind": "literature_synthesis", "topic_id": fixture.topic,
                            "input": {"source_versions": fixture.versions, "question": "How can answers be supported?"}}
                    prepared = fixture.call("task.prepare", **task)
                    config = fixture.call("services.get")
                    revision = config.pop("revision")
                    config["models"][0]["model"] = "deepseek-pro"
                    config["models"][0]["endpoint"] = dsh.endpoint
                    fixture.call("services.save", base_revision=revision, **config)
                    fixture.call("task.start", confirmation_id=prepared["confirmation_id"],
                                 error="CONFIRMATION_REQUIRED", **task)
                    with patch("papertrace.deepseek_api_key", return_value="loopback-fixture"):
                        for _ in range(2):
                            self.assertTrue(worker.test_service({
                                "id": config["model_id"], "operation_id": "probe-1",
                            })["ok"])
                    self.assertEqual(provider.probes, [("deepseek-pro", 16, [])])
                    self.assertEqual(dsh.model, "deepseek-flash")
                    fixture.run_task(fixture.versions)
                    self.assertTrue(provider.research_models)
                    self.assertEqual(set(provider.research_models), {"deepseek-pro"})
                    outline = fixture.call("synthesis.list", topic_id=fixture.topic)["items"][0]
                    self.assertEqual([row["title"] for row in outline["trace"]], ["paper_search", "paper_read"])
                    point = outline["points"][0]
                    self.assertEqual(point["claims"][0]["assessment"], "supported")
                    self.assertGreater(outline["usage"]["input_tokens"], 0)
                    fixture.call("synthesis.review", topic_id=fixture.topic, record_id=outline["record_id"],
                                 base_revision="", item_ids=[point["id"]])
                    fixture.run_task(fixture.versions)
                    followup = fixture.call("synthesis.list", topic_id=fixture.topic)["items"][0]
                    self.assertEqual(followup["trace"][0]["title"], "wiki_search")
                    self.assertEqual(followup["points"][0]["prior_id"], point["id"])
                    expected_tools = {"paper_search", "paper_read", "wiki_search", "paper_refs"}
                    self.assertTrue(all(tools == expected_tools for tools in provider.observed_tools), provider.observed_tools)
                    version = fixture.versions[0]
                    sources = [{"source_version_id": version, "title": "Alpha", "available_scope": "full_text"}]
                    full, seen, issue = dsh.answer_full_text("What benchmark does Alpha define?", sources, threading.Event())
                    self.assertIsNone(issue)
                    self.assertIn(full[0]["references"][0]["passage"]["passage_id"], seen)
                    full, seen, issue = dsh.answer_full_text("Return an invalid response.", sources, threading.Event())
                    self.assertEqual(full, [])
                    self.assertTrue(seen)
                    self.assertEqual(issue["reason"], "MODEL_OUTPUT_INVALID")
                    raw, seen, trace, usage, issue = dsh.audit(
                        [{"id": "0", "source_version_id": version, "claim": "The paper defines the benchmark."}],
                        [{"source_version_id": version, "title": "Alpha", "available_scope": "full_text"}],
                        threading.Event(),
                    )
                    self.assertIsNone(issue)
                    self.assertEqual(raw["checks"][0]["id"], "0")
                    suggested, read, trace, _, issue = dsh.suggest_citations(
                        [{"id": "sentence-1", "text": "The source defines the benchmark."}],
                        [{"source_version_id": version, "title": "Alpha", "available_scope": "full_text"}],
                        threading.Event(), None,
                    )
                    self.assertIsNone(issue)
                    self.assertEqual([tool["title"] for tool in trace], ["paper_search", "paper_read"])
                    claim = suggested["suggestions"][0]["claims"][0]
                    self.assertIn(claim["evidence"][0]["id"], read)
                    self.assertIn(raw["checks"][0]["evidence"][0]["id"], seen)
                    phrase = "Only these words are in the reader selection."
                    selection = {"paper_id": "selected-paper", "source_version_id": version,
                                 "passages": [{"passage_id": "reader-selection", "page": 1, "text": phrase}]}
                    answers, observed = dsh.answer("Read my selection.", [selection], threading.Event(),
                                                   context="selected PDF text")
                    self.assertEqual(list(observed), ["reader-selection"])
                    self.assertEqual(answers[0]["references"][0]["quote"], phrase)
                finally:
                    provider.shutdown()
                    server.join()
        finally:
            fixture.doCleanups()
