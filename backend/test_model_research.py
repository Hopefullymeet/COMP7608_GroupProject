"""Native agent integration check with a deterministic loopback provider."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
import time
import unittest
from unittest.mock import Mock, patch

from model_agent import ModelAgent, ModelFailure
import test_literature


class ScriptedProvider(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        pass

    def do_POST(self):
        request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if any(key.endswith("session_log") for key in request):
            self.send_error(400, "Session log field is forbidden")
            return
        if self.path.endswith("/chat/completions") and request["messages"] == [{"role": "user", "content": "Reply with OK."}]:
            self.server.probes.append((request["model"], request["max_tokens"], request.get("tools", [])))
            body = b'{"choices":[{"message":{"content":"OK"}}]}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
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
                if "Question: Return an invalid response." in prompt.splitlines():
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
                body = json.dumps({"choices": [{"message": delta, "finish_reason": finish}], "usage": {"prompt_tokens": 7, "completion_tokens": 3}}).encode()
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


class ModelResearchTest(unittest.TestCase):
    def test_repeated_calls_hint_after_batch_and_retry_only_the_model(self):
        agent = ModelAgent(Path("."), "fixture")
        tools = Mock(schemas=[{"type": "function"}])
        tools.execute.return_value = []
        call = {"name": "paper_search", "arguments": '{"query":"ghosting","version":"v"}'}
        batch = {"tool_calls": [{"id": str(i), "function": call} for i in range(3)]}
        def complete(messages, *args, **kwargs):
            if len(messages) == 2:
                return batch, {}, "tool_calls"
            self.assertEqual([m["role"] for m in messages[-4:]], ["tool", "tool", "tool", "user"])
            self.assertIn("3 consecutive", messages[-1]["content"])
            if mock.call_count == 2:
                raise ModelFailure("MODEL_UNAVAILABLE", True, "retry")
            return {"content": '{"ok": true}'}, {}, "stop"
        event = threading.Event()
        with patch.object(agent, "completion", side_effect=complete) as mock, patch.object(event, "wait"):
            raw, _, _, usage, _ = agent.run("Locate evidence", event, tools)
        self.assertTrue(raw["ok"])
        self.assertEqual(tools.execute.call_count, 3)
        self.assertEqual(usage["model_steps"], 3)

    def test_truncated_tool_call_is_not_executed(self):
        agent = ModelAgent(Path("."), "fixture")
        tools = Mock(schemas=[{"type": "function"}])
        final = {"content": '{"sentences":[{"text":"Insufficient evidence","evidence":[]}]}'}
        with patch.object(agent, "completion", side_effect=[
                ({"tool_calls": [{"id": "cut"}]}, {}, "length"), (final, {}, "stop")]):
            raw, _, _, _, _ = agent.run("Question", threading.Event(), tools, reading=True,
                                        fixed={"p": {"text": "Background only"}})
        tools.execute.assert_not_called()
        self.assertEqual(raw["sentences"][0]["evidence"], [])

    def test_search_read_and_reviewed_wiki(self):
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
                    agent = ModelAgent(Path(fixture.workspace.name), "loopback-fixture")
                    agent.endpoint = f"http://127.0.0.1:{provider.server_port}"
                    worker.agent = agent
                    segments = [{"id": "1:1:1", "source": "Citation quality [1]"}]
                    result = agent.translate(segments, "zh-CN", {"Citation": "引用"}, threading.Event())
                    self.assertEqual(result, {"1:1:1": "译文 Citation quality [1]"})
                    payload, tools = provider.translation_requests[0]
                    self.assertEqual(payload["segments"], segments)
                    self.assertEqual(tools, [])
                    with self.assertRaises(ModelFailure) as invalid:
                        agent.translate(segments, "en", {}, threading.Event())
                    self.assertEqual(invalid.exception.issue["reason"], "MODEL_OUTPUT_INVALID")
                    task = {"kind": "literature_synthesis", "topic_id": fixture.topic,
                            "input": {"source_versions": fixture.versions, "question": "How can answers be supported?"}}
                    prepared = fixture.call("task.prepare", **task)
                    config = fixture.call("services.get")
                    revision = config.pop("revision")
                    config["models"][0]["endpoint"] = agent.endpoint
                    config["models"][0]["model"] = "deepseek-pro"
                    config["models"][0]["endpoint"] = agent.endpoint
                    fixture.call("services.save", base_revision=revision, **config)
                    fixture.call("task.start", confirmation_id=prepared["confirmation_id"],
                                 error="CONFIRMATION_REQUIRED", **task)
                    with patch("papertrace.deepseek_api_key", return_value="loopback-fixture"):
                        for _ in range(2):
                            self.assertTrue(worker.test_service({
                                "id": config["model_id"], "operation_id": "probe-1",
                            })["ok"])
                    self.assertEqual(provider.probes, [("deepseek-pro", 16, [])])
                    self.assertEqual(agent.model, "deepseek-flash")
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
                    # Exercise real session dispatch with a custom endpoint and the reviewer disabled.
                    worker.discovery_fixture = False
                    sid = fixture.call("session.create", topic_id=fixture.topic)["session_id"]
                    query = dict(kind="reading_qa", topic_id=fixture.topic, session_id=sid,
                                 input={"question": "What benchmark does Alpha define?", "sources": [{
                                     "paper_id": fixture.a["paper_id"], "source_version_id": fixture.versions[0],
                                     "requested_scope": "full_text"}]})
                    approval = fixture.call("task.prepare", **query)
                    task = fixture.call("task.start", confirmation_id=approval["confirmation_id"], **query)
                    deadline = time.monotonic() + 10
                    while time.monotonic() < deadline:
                        snapshot = fixture.call("task.get", task_id=task["task_id"])
                        if snapshot["status"] not in ("queued", "running"):
                            break
                        time.sleep(.02)
                    self.assertEqual(snapshot["status"], "completed", snapshot)
                    anchor = snapshot["result"]["sentences"][0]["anchor_ids"][0]
                    located = fixture.call("evidence.open", topic_id=fixture.topic, anchor_id=anchor)
                    self.assertIn(located["quote"], located["source"]["passages"][0]["text"])
                    history = fixture.call("task.history", topic_id=fixture.topic)["items"]
                    steps = next(row["steps"] for row in history if row["task_id"] == task["task_id"])
                    self.assertIn("paper_search", [step["title"] for step in steps])
                    version = fixture.versions[0]
                    sources = [{"source_version_id": version, "title": "Alpha", "available_scope": "full_text"}]
                    steps = []
                    full, seen, issue = agent.answer_full_text(
                        "What benchmark does Alpha define?", sources, threading.Event(),
                        progress=lambda name, detail, activity: steps.append((name, activity)),
                    )
                    self.assertEqual([name for name, _ in steps], ["paper_read", "paper_search", "paper_read"])
                    seeded, search, reread = [activity for _, activity in steps]
                    self.assertEqual(search["query"], "benchmark")
                    for activity in (seeded, reread):
                        self.assertTrue(activity["passages"])
                        for fragment in activity["passages"]:
                            self.assertEqual(fragment["source_version_id"], version)
                            self.assertIn(fragment["passage_id"], seen)
                            self.assertTrue(fragment["excerpt"])
                            self.assertGreaterEqual(fragment["page"], 1)
                    self.assertIsNone(issue)
                    self.assertIn(full[0]["references"][0]["passage"]["passage_id"], seen)
                    full, seen, issue = agent.answer_full_text("Return an invalid response.", sources, threading.Event())
                    self.assertEqual(full, [])
                    self.assertTrue(seen)
                    self.assertEqual(issue["reason"], "MODEL_OUTPUT_INVALID")
                    raw, seen, trace, usage, issue = agent.audit(
                        [{"id": "0", "source_version_id": version, "claim": "The paper defines the benchmark."}],
                        [{"source_version_id": version, "title": "Alpha", "available_scope": "full_text"}],
                        threading.Event(),
                    )
                    self.assertIsNone(issue)
                    self.assertEqual(raw["checks"][0]["id"], "0")
                    suggested, read, trace, _, issue = agent.suggest_citations(
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
                    answers, observed = agent.answer("Read my selection.", [selection], threading.Event(),
                                                   context="selected PDF text")
                    self.assertEqual(list(observed), ["reader-selection"])
                    self.assertEqual(answers[0]["references"][0]["quote"], phrase)
                finally:
                    provider.shutdown()
                    server.join()
        finally:
            fixture.doCleanups()
