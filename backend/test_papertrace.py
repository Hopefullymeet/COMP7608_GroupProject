import base64
from contextlib import closing
import importlib.util
from io import BytesIO, StringIO
import json
import os
from pathlib import Path
import queue
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError
from uuid import uuid4

from papertrace import Worker
from credentials import WindowsStore
from dsh import Dsh, DshFailure, ENDPOINT, read_json_answer
from bibliography import PublicServiceError, bibliography_records, download_open_pdf
from literature import LiteratureError
from test_literature import sample_pdf


class EvidenceTest(unittest.TestCase):
    def test_only_observed_exact_quotes_can_be_linked(self):
        seen = {"p1": {"text": "The conclusion is excluded."}}
        text = json.dumps({"sentences": [
            {"text": "A direct result.", "evidence": [
                {"id": "p1", "quote": "The conclusion is excluded."},
                {"id": "p1", "quote": "The introduction is excluded."},
                {"id": "p2", "quote": "The conclusion is excluded."},
            ]},
            {"text": "An unsupported result.", "evidence": []},
        ]})
        rows = read_json_answer(text, seen)
        self.assertEqual(rows[0]["references"], [
            {"passage": seen["p1"], "quote": "The conclusion is excluded."}
        ])
        self.assertEqual(rows[1]["references"], [])

    def test_malformed_citations_do_not_discard_valid_claims(self):
        seen = {"p1": {"text": "The passage states a direct result."}}
        response = {"sentences": [None, {"text": "A claim without evidence."}, {
            "text": "A direct result.", "evidence": [None, {"id": []}, {"id": "missing", "quote": "result"},
                                                    {"id": "p1"}, {"id": "p1", "quote": "a direct result"}],
        }]}
        self.assertEqual(read_json_answer(json.dumps(response), seen), [
            {"text": "A claim without evidence.", "references": []},
            {"text": "A direct result.", "references": [{"passage": seen["p1"], "quote": "a direct result"}]},
        ])

    def test_reading_stream_previews_claims_before_response_ends(self):
        first = '{"sentences":[{"text":"First claim","evidence":[]}'
        second = ',{"text":"Second claim","evidence":[]}]}'
        previews = []

        class Stream(BytesIO):
            headers = {"Content-Type": "text/event-stream"}

            def __iter__(self):
                for part in (first[:17], first[17:], second):
                    if part == second:
                        self_test.assertEqual(previews, ["First claim"])
                    frame = {"choices": [{"delta": {"content": part}, "finish_reason": None}]}
                    yield b"data: " + json.dumps(frame).encode() + b"\n"
                yield b'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n'
                yield b"data: [DONE]\n"

        self_test = self
        with tempfile.TemporaryDirectory() as directory, closing(Worker(Path(directory), lambda _: None)) as worker:
            with patch("papertrace.build_opener") as opener:
                opener.return_value.open.return_value = Stream()
                rows = worker.request_reading_answer(ENDPOINT, "test", {"stream": True}, {}, previews.append)
        self.assertEqual(previews, ["First claim", "Second claim"])
        self.assertEqual(previews, [row["text"] for row in rows])

    def test_reading_context_uses_only_current_topic_and_limits_memory(self):
        with tempfile.TemporaryDirectory() as directory, closing(Worker(Path(directory), lambda _: None)) as worker:
            with worker.lock, worker.db:
                for topic in ("first", "second"):
                    worker.put("topic", topic, {"title": topic})
                    wiki = worker.topic_wiki.load(topic)
                    wiki.update(revision="r1", status="ready")
                    worker.topic_wiki.store(wiki)
                    worker.topic_wiki.edit(topic, {"action": "add", "text": topic + " preference"})
                wiki = worker.topic_wiki.load("first")
                for i in range(8):
                    wiki["entries"].append(worker.topic_wiki.entry("finding", "retrieval " + str(i) * 300, [], "qa"))
                worker.topic_wiki.store(wiki)
                memory = worker.topic_wiki.reading_context("first", "retrieval")
                self.assertEqual(memory[0], "first preference")
                self.assertEqual(len(memory), 5)
                self.assertTrue(all(len(item) <= 180 for item in memory))
                self.assertNotIn("second preference", memory)

    def test_reading_retries_blank_or_truncated_completions_with_the_same_passages(self):
        def completion(content, finish_reason):
            return BytesIO(json.dumps({"choices": [{"message": {"content": content},
                                                    "finish_reason": finish_reason}]}).encode())

        answer = json.dumps({"sentences": [{"text": "A direct result.",
                                           "evidence": [{"id": "p1", "quote": "a direct result"}]}]})
        sources = [{"source_version_id": "v1", "paper_id": "p", "title": "Evidence", "available_scope": "abstract",
                    "passages": [{"passage_id": "p1", "text": "The passage states a direct result."}]}]
        with tempfile.TemporaryDirectory() as directory, closing(Worker(Path(directory), lambda _: None)) as worker:
            for content, reason in (("   ", "stop"), (answer[:35], "length")):
                with self.subTest(reason=reason), patch("papertrace.build_opener") as opener:
                    send = opener.return_value.open
                    send.side_effect = [completion(content, reason), completion(answer, "stop")]
                    claims, seen = worker.answer_with_model_endpoint(
                        ENDPOINT, "deepseek-flash", "test-key", "What was the result?", sources, threading.Event(),
                        memory=["Use biomedical examples"])
                    self.assertEqual(claims[0]["references"], [{"passage": seen["p1"], "quote": "a direct result"}])
                    first, retry = [json.loads(call.args[0].data) for call in send.call_args_list]
                    self.assertIn("Use biomedical examples", first["messages"][1]["content"])
                    self.assertEqual(first["messages"][1], retry["messages"][1])
                    self.assertNotEqual(first["messages"][0], retry["messages"][0])


class CredentialTest(unittest.TestCase):
    def test_synthesis_collects_session_events_until_turn_end(self):
        def event(kind, data, session="reading"):
            return {"method": "session.event", "params": {"sessionId": session,
                    "event": {"type": kind, "data": data}}}

        passage = {"passage_id": "p1", "text": "The observed evidence."}
        result = {"points": [{"title": "Observed findings"}]}
        events = [{"id": 1, "result": {}},
                  event("turn/end", {"reason": {"kind": "failed"}}, "other"),
                  {"id": 2, "result": {"messageId": "m"}},
                  event("tool/call", {"name": "paper_read", "arguments": "{}", "callId": "c"}),
                  event("tool/result", {"message": {"toolCallId": "c", "content": [
                      {"type": "text", "text": json.dumps([passage])}]}}),
                  event("assistant/message", {"message": {"content": [{"type": "text", "text": json.dumps(result)}]}}),
                  event("turn/end", {"reason": {"kind": "completed"}})]
        process = Mock(stdout=StringIO("".join(json.dumps(e) + "\n" for e in events)))
        with tempfile.TemporaryDirectory() as directory, patch("dsh.subprocess.Popen", return_value=process):
            root = Path(directory)
            raw, seen, _, _, issue = Dsh("node", __file__, "test", root).run(
                root, root / "patch.yml", {}, "question", threading.Event(), research=True)
        self.assertEqual((raw, seen, issue), (result, {"p1": passage}, None))
        self.assertEqual([json.loads(c.args[0])["method"] for c in process.stdin.write.call_args_list],
                         ["initialize", "session/prompt"])

    def test_harness_prompt_startup_failure_survives_closed_stdin(self):
        process = Mock()
        process.stdout = StringIO(
            '{"id":1,"result":{}}\n'
            '{"id":2,"error":{"code":-32601,"message":"Prompt unavailable"}}\n'
        )
        process.stdin.close.side_effect = BrokenPipeError()
        with tempfile.TemporaryDirectory() as directory, patch("dsh.subprocess.Popen", return_value=process):
            root = Path(directory)
            runtime = Dsh("node", __file__, "test-key", root)
            with self.assertRaises(DshFailure) as error:
                runtime.run(root, root / "patch.yml", {}, "Test question", threading.Event())
            self.assertTrue(error.exception.startup)
            process.wait.assert_called_once()

    @unittest.skipUnless(sys.platform == "win32", "Windows npm layout is required")
    def test_desktop_finds_installed_harness_without_environment_override(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"APPDATA": directory}), patch(
            "dsh.which", return_value=None
        ):
            for name in ("PAPERTRACE_AGENT_CLI", "PAPERTRACE_DSH_CLI"):
                os.environ.pop(name, None)
            root = Path(directory) / "npm/node_modules/@deepseek-ai/dsh"
            cli = root / "lib/bin.js"
            tools = root / "node_modules/@deepseek-ai/dsh-tools/lib/index.js"
            for path in (cli, tools):
                path.parent.mkdir(parents=True)
                path.touch()
            configured = Dsh.configured(directory)
            self.assertEqual(configured.cli, cli.resolve())
            self.assertEqual(configured.tools_entry(), tools.resolve())
            os.environ["PAPERTRACE_AGENT_CLI"] = str(Path(directory) / "explicit.js")
            self.assertEqual(Dsh.configured(directory).cli, Path(os.environ["PAPERTRACE_AGENT_CLI"]).resolve())

    def test_messages_transport_uses_protocol_specific_official_root(self):
        official = "https://api.deepseek.com/anthropic"
        custom = "https://model.example.org/v1"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "profile.json"
            runtime = Dsh("node", __file__, None, root)
            for endpoint in (ENDPOINT, ENDPOINT + "/v1/", official, custom):
                with self.subTest(endpoint=endpoint):
                    runtime.for_model("test-model", endpoint).write_patch(path, root, None)
                    provider = next(row for row in json.loads(path.read_text()) if row.get("id") == "llm-deepseek")
                    self.assertEqual(provider["config"]["baseURL"], custom if endpoint == custom else official)

    def test_model_runtime_prefers_system_credential_and_snapshots_it(self):
        runtime = Dsh("node", __file__, None, ".", use_system_credential=True)
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "test-fallback"}), patch(
            "credentials.system_key", return_value="test-system-key"
        ) as read:
            model_runtime = runtime.for_model("test-model", "https://model.example.org/v1")
            read.return_value = None
            self.assertEqual(runtime.key, "test-fallback")
            self.assertEqual(model_runtime.key, "test-system-key")
            self.assertEqual(runtime.endpoint, ENDPOINT)
            self.assertEqual(model_runtime.endpoint, "https://model.example.org/v1")

    def test_connection_uses_saved_endpoint_model_and_key_without_harness(self):
        with tempfile.TemporaryDirectory() as directory, patch(
            "papertrace.Dsh.configured", return_value=None
        ), patch("papertrace.deepseek_api_key", return_value=None) as key, patch("papertrace.build_opener") as opener:
            worker = Worker(Path(directory), lambda _: None)
            try:
                settings = worker.services_config()
                provider = settings["models"][0]
                provider.update(endpoint="https://example.invalid/v1/", model="test-model")
                with worker.db:
                    worker.save_services({**settings, "base_revision": settings["revision"]})
                self.assertFalse(worker.test_service({"id": provider["id"], "operation_id": "no-key"})["ok"])
                opener.assert_not_called()
                key.return_value = "test-local-key"
                send = opener.return_value.open
                send.return_value = BytesIO(b'{"object":"chat.completion","choices":[{"message":{"content":"OK"}}]}')
                test = {"id": provider["id"], "operation_id": "success"}
                self.assertTrue(worker.test_service(test)["ok"])
                self.assertTrue(worker.test_service(test)["ok"])
                send.assert_called_once()
                request = send.call_args.args[0]
                self.assertEqual(request.full_url, "https://example.invalid/v1/chat/completions")
                self.assertEqual(request.get_header("Authorization"), "Bearer test-local-key")
                self.assertEqual(json.loads(request.data)["model"], "test-model")
                send.side_effect = HTTPError(request.full_url, 401, "Unauthorized", {}, None)
                result = worker.test_service({**test, "operation_id": "invalid-key"})
                self.assertFalse(result["ok"])
                self.assertIn("rejected the API key", result["message"])
            finally:
                worker.close()

    def test_wiki_model_output_keeps_known_anchors_and_reports_failures(self):
        with tempfile.TemporaryDirectory() as directory, patch(
            "papertrace.Dsh.configured", return_value=None
        ), patch("wiki.deepseek_api_key", return_value="test-key"):
            worker = Worker(Path(directory), lambda _: None)
            try:
                worker.discovery_fixture = False
                with worker.db:
                    worker.put("topic", "t1", {"topic_id": "t1", "title": "检索增强"})
                    worker.put("note", "n1", {"topic_id": "t1", "value": {
                        "note_id": "n1", "revision": "r1", "text": "Dense index", "anchor_ids": ["a1"], "origin": "user",
                        "history": []}})
                sent = []

                def model(endpoint, key, payload, seen, parse, timeout=30, preview=None):
                    sent.append(payload)
                    return parse(json.dumps({"headline": "关于检索增强", "summary": ["第一段"], "entries": [
                        {"kind": "finding", "text": "使用稠密索引", "anchor_ids": ["a1", "invented"]},
                        {"kind": "unknown", "text": "dropped"}]}))

                worker.request_model_json = model
                wiki = worker.topic_wiki
                with worker.lock, worker.db, patch.object(wiki, "spawn"):
                    self.assertEqual(wiki.get("t1")["transfer"]["endpoint"], ENDPOINT)
                wiki.running.add(("t1", "refresh"))
                wiki.generate("t1")
                with worker.lock, worker.db:
                    ready = wiki.get("t1")
                self.assertEqual(ready["generator"]["kind"], "model")
                self.assertEqual([(e["text"], e["anchor_ids"], e["origin"]) for e in ready["entries"]],
                                 [("使用稠密索引", ["a1"], "summary")])
                observations = json.loads(sent[0]["messages"][1]["content"])["observations"]
                self.assertEqual([(o["origin"], o["text"]) for o in observations], [("note", "Dense index")])
                self.assertEqual(json.loads(sent[0]["messages"][1]["content"])["material"]["title"], "检索增强")

                def broken(*args, **kwargs):
                    raise DshFailure("SERVICE_RATE_LIMITED", True, "retry")

                worker.request_model_json = broken
                with worker.lock, worker.db:
                    wiki.chat("t1", "记住只看中文论文", [])
                wiki.reply("t1")
                wiki.running.discard(("t1", "chat"))
                with worker.lock, worker.db:
                    failed = wiki.get("t1")
                self.assertFalse(failed["pending_reply"])
                self.assertEqual(failed["issue"]["reason"], "SERVICE_RATE_LIMITED")
                self.assertEqual(failed["entries"], ready["entries"])
            finally:
                worker.close()

    def test_save_and_remove_credentials_on_supported_platforms_without_recording_key(self):
        for platform in ("win32", "darwin"):
            with self.subTest(platform=platform), tempfile.TemporaryDirectory() as directory, patch.dict(
                os.environ, {"DEEPSEEK_API_KEY": "test-fallback"}
            ), patch("papertrace.Dsh.configured", return_value=None), patch("papertrace.store") as vault, patch(
                "papertrace.system_key", return_value=None
            ) as key:
                messages = []
                worker = Worker(Path(directory), messages.append)
                try:
                    with patch("papertrace.sys.platform", platform):
                        model = worker.services_config()["models"][0]
                        self.assertTrue(model["credential_store"])
                        self.assertTrue(model["credential_configured"])
                        self.assertFalse(model["credential_stored"])
                        request = {"jsonrpc": "2.0", "id": "credential", "method": "services.credentials"}
                        save = {**request, "params": {"id": model["id"], "action": "save", "api_key": "test-key"}}
                        vault.return_value.read.return_value = None
                        worker.process(save)
                        self.assertEqual(messages[-1]["error"]["data"]["reason"], "CREDENTIAL_STORE_FAILED")
                        vault.return_value.save.reset_mock()
                        vault.return_value.read.return_value = "test-key"
                        worker.process(save)
                        self.assertEqual(messages[-1]["result"], {"configured": True, "stored": True})
                        vault.assert_called_with(platform)
                        vault.return_value.save.assert_called_once_with("test-key")
                        key.return_value = "test-key"
                        saved_model = worker.services_config()["models"][0]
                        self.assertTrue(saved_model["credential_stored"])
                        self.assertEqual(saved_model["credential_preview"], "••••-key")
                        key.return_value = "abc"
                        self.assertEqual(worker.services_config()["models"][0]["credential_preview"], "••••")
                        key.return_value = None
                        self.assertIsNone(worker.services_config()["models"][0]["credential_preview"])
                        vault.return_value.read.return_value = None
                        worker.process({**request, "params": {"id": model["id"], "action": "delete"}})
                        self.assertEqual(messages[-1]["result"], {"configured": True, "stored": False})
                        vault.return_value.delete.assert_called_once()
                        self.assertNotIn("test-key", json.dumps(messages))
                        self.assertEqual(worker.db.execute("SELECT COUNT(*) FROM operations").fetchone()[0], 0)
                finally:
                    worker.close()

    @unittest.skipUnless(sys.platform == "win32", "Windows DPAPI is required")
    def test_windows_credentials_survive_vault_access_denial_and_restart(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "deepseek.dpapi"
            for key in ("papertrace-test-first", "papertrace-test-replacement"):
                vault = WindowsStore(path)
                with patch.object(vault.api, "CredWriteW", return_value=0), patch(
                    "credentials.c.get_last_error", return_value=5
                ):
                    vault.save(key)
                self.assertNotIn(key.encode(), path.read_bytes())
                self.assertEqual(WindowsStore(path).read(), key)
            with patch.object(vault.api, "CredDeleteW", return_value=0), patch(
                "credentials.c.get_last_error", return_value=5
            ):
                vault.delete()
            self.assertIsNone(WindowsStore(path).read())


class Client:
    def __init__(self, directory):
        self.child = subprocess.Popen(
            [sys.executable, "-u", str(Path(__file__).with_name("papertrace.py")), str(directory)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            encoding="utf-8", bufsize=1,
            env={**os.environ, "PAPERTRACE_DISCOVERY_FIXTURE": "1"},
        )
        self.messages = queue.Queue()
        self.received = []
        self.request_number = 0
        self.reader = threading.Thread(target=self.read, daemon=True)
        self.reader.start()

    def read(self):
        for line in self.child.stdout:
            self.messages.put(json.loads(line))

    def until(self, matches):
        while True:
            message = self.messages.get(timeout=5)
            self.received.append(message)
            if matches(message):
                return message

    def call(self, method, **params):
        self.request_number += 1
        rid = str(self.request_number)
        self.child.stdin.write(json.dumps({"jsonrpc": "2.0", "id": rid, "method": method, "params": params}) + "\n")
        self.child.stdin.flush()
        return self.until(lambda m: m.get("id") == rid)

    def result(self, method, **params):
        return self.call(method, **params)["result"]

    def finish(self, task, cursor=0):
        self.received.clear()
        assert self.result("task.subscribe", task_id=task, after_seq=cursor) == {"task_id": task}
        assert "result" in self.received[0], "Events must follow the subscription acknowledgement."
        event = self.until(lambda m: m.get("params", {}).get("type") == "task.finished")["params"]
        notifications = [m["params"] for m in self.received if m.get("method") == "task.event"]
        assert [e["event_seq"] for e in notifications] == list(range(cursor + 1, event["event_seq"] + 1))
        snapshot = self.result("task.get", task_id=task)
        assert snapshot["last_event_seq"] == event["event_seq"]
        assert {k: snapshot[k] for k in event["payload"]} == event["payload"]
        return event["payload"]

    def close(self):
        if not self.child.stdin.closed:
            self.child.stdin.close()
            try:
                self.child.wait(timeout=5)
            finally:
                if self.child.poll() is None:
                    self.child.kill()
                    self.child.wait(timeout=5)
                self.reader.join(timeout=5)
                self.child.stdout.close()
                self.child.stderr.close()


class ContractTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.dir = Path(self.temp.name)
        self.client = Client(self.dir)
        self.addCleanup(self.client.close)

    def restart(self):
        self.client.close()
        self.client = Client(self.dir)
        self.addCleanup(self.client.close)

    def context(self):
        topic = self.client.result("topic.create", operation_id="topic-key", title="Research evidence")
        session = self.client.result("session.create", operation_id="session-key", **topic)
        return topic, session

    def start(self, key, **params):
        confirmation = self.client.result("task.prepare", operation_id=f"prepare-{key}", **params)
        return self.client.result(
            "task.start", operation_id=key, confirmation_id=confirmation["confirmation_id"], **params
        )

    def test_service_configuration_uses_the_desktop_contract(self):
        config = self.client.result("services.get")
        self.assertEqual(config["budget"], dict.fromkeys(("calls", "tokens", "minutes", "cost")))
        provider = config["model_id"]
        self.assertEqual(config["models"][0]["id"], provider)
        self.assertEqual(config["models"][0]["endpoint"], ENDPOINT)
        self.assertNotIn("key", config["models"][0])
        request = {k: v for k, v in config.items() if k != "revision"}
        request.update(base_revision=config["revision"], operation_id="save-model")
        request["models"][0]["model"] = "example-research-model"
        for endpoint in ("https://user:secret@example.invalid", "https://example.invalid/v1?q=1",
                         "file:///tmp/api", "https://example.invalid:70000", "https://example.invalid#"):
            invalid_endpoint = {**request, "models": [{**request["models"][0], "endpoint": endpoint}]}
            self.assertEqual(self.client.call("services.save", **invalid_endpoint)["error"]["data"]["reason"],
                             "INVALID_PARAMS")
        # A user-entered provider path must survive even on the default host.
        specific_endpoint = ENDPOINT + "/anthropic"
        endpoint_only = {**request, "operation_id": "save-endpoint-only",
                         "models": [{**request["models"][0], "model": provider, "endpoint": specific_endpoint}]}
        updated = self.client.result("services.save", **endpoint_only)
        self.assertEqual(updated["models"][0]["endpoint"], specific_endpoint)
        self.restart()
        self.assertEqual(self.client.result("services.get")["models"][0]["endpoint"], specific_endpoint)
        request["base_revision"] = updated["revision"]
        request["models"][0]["endpoint"] = " https://example.invalid/v1/ "
        saved = self.client.result("services.save", **request)
        self.assertNotEqual(saved["revision"], config["revision"])
        self.assertEqual(saved["models"][0]["model"], "example-research-model")
        self.assertEqual(saved["models"][0]["endpoint"], "https://example.invalid/v1")
        self.assertEqual(self.client.result("services.save", **request), saved)
        self.assertEqual(
            self.client.call("services.save", **{**request, "operation_id": "old-revision"})["error"]["data"]["reason"],
            "STALE_REVISION")
        unchanged = {k: v for k, v in saved.items() if k != "revision"}
        unchanged.update(base_revision=saved["revision"], operation_id="save-unchanged")
        self.assertEqual(self.client.result("services.save", **unchanged), saved)
        self.restart()
        self.assertEqual(self.client.result("services.get"), saved)
        budget = {**saved["budget"], "calls": 0, "cost": 1.5}
        budget_request = {**unchanged, "operation_id": "save-budget", "budget": budget, "ask_before_overage": False}
        invalid_budget = {**budget_request, "budget": {**budget, "tokens": 1.5}, "operation_id": "invalid-budget"}
        self.assertEqual(self.client.call("services.save", **invalid_budget)["error"]["data"]["reason"], "INVALID_PARAMS")
        updated = self.client.result("services.save", **budget_request)
        self.assertNotEqual(updated["revision"], saved["revision"])
        self.assertEqual(updated["budget"], budget)
        self.assertFalse(updated["ask_before_overage"])
        self.assertEqual(updated["models"], saved["models"])
        self.restart()
        self.assertEqual(self.client.result("services.get"), updated)

    def test_archive_restores_topic_and_only_its_active_sessions_after_restart(self):
        topic, session = self.context()
        hidden = self.client.result("session.create", operation_id="another", **topic)
        self.client.result("session.rename", operation_id="rename-hidden", title="Kept for later", **hidden)
        self.client.result("note.save", operation_id="preserve-note", **session, origin="user",
                           text="Research note", anchor_ids=[])
        session_record = {"kind": "session", "id": hidden["session_id"]}
        topic_record = {"kind": "topic", "id": topic["topic_id"]}
        self.client.result("workspace.archive", operation_id="hide-session", **session_record)
        args = {**topic_record, "operation_id": "hide-topic"}
        self.client.result("workspace.archive", **args)
        self.assertEqual(self.client.result("workspace.archive", **args), {"id": topic["topic_id"]})
        self.assertEqual(self.client.result("topic.list")["items"], [])
        self.assertEqual(self.client.result("session.list", **topic)["items"], [])
        self.assertEqual(self.client.result("workspace.archived")["items"], [
            {**topic_record, "title": "Research evidence"},
        ])

        self.restart()
        self.client.result("workspace.unarchive", operation_id="restore-topic", **topic_record)
        self.assertEqual([s["session_id"] for s in self.client.result("session.list", **topic)["items"]],
                         [session["session_id"]])
        self.assertEqual(self.client.result("workspace.archived")["items"], [
            {**session_record, "title": "Kept for later"},
        ])
        self.assertEqual(self.client.result("note.list", **topic)["items"][0]["text"], "Research note")
        self.client.result("workspace.unarchive", operation_id="restore-session", **session_record)
        self.assertEqual({s["session_id"] for s in self.client.result("session.list", **topic)["items"]},
                         {session["session_id"], hidden["session_id"]})
        self.assertEqual(self.client.result("workspace.archived")["items"], [])

    def test_topic_and_session_names_survive_restart(self):
        topic, session = self.context()
        topic_rename = {"operation_id": "topic-name", **topic, "title": "  文献研究  "}
        self.assertEqual(self.client.result("topic.rename", **topic_rename), {**topic, "title": "文献研究"})
        self.assertEqual(self.client.result("topic.rename", **topic_rename), {**topic, "title": "文献研究"})
        self.assertIn("error", self.client.call("session.rename", operation_id="blank", **session, title=" "))
        other = self.client.result("topic.create", operation_id="other", title="Other topic")
        self.assertIn("error", self.client.call("session.rename", **other, session_id=session["session_id"],
                                                operation_id="outside", title="Different"))
        self.assertEqual(self.client.result("session.rename", **session, operation_id="new-name", title="阅读笔记"),
                         {**session, "title": "阅读笔记"})
        self.restart()
        self.assertIn({**topic, "title": "文献研究"}, self.client.result("topic.list")["items"])
        self.assertEqual(self.client.result("session.list", **topic)["items"][0]["title"], "阅读笔记")
        self.assertEqual(self.client.result("session.get", **session)["turns"], [])

    def test_paper_alias_survives_restart_and_keeps_original_title(self):
        topic, _ = self.context()
        search = self.start("alias-discovery", **topic, kind="discovery",
                            input={"query": "Which scientific QA datasets use abstracts?"})
        result = self.client.finish(search["task_id"])["result"]
        candidate = result["candidates"][0]
        paper = self.client.result("candidate.decide", **topic, operation_id="add-alias-paper",
                                   search_id=result["search_id"], candidate_id=candidate["candidate_id"], decision="add")
        paper_id = paper["paper_id"]
        args = {**topic, "paper_id": paper_id}
        outside = self.client.result("topic.create", operation_id="outside-alias", title="Other")
        self.assertIn("error", self.client.call("library.set_alias", **outside, paper_id=paper_id,
                                                operation_id="outside-write", alias="Outside"))
        self.assertIn("error", self.client.call("library.set_alias", **args, operation_id="too-long", alias="字" * 81))
        request = {**args, "operation_id": "save-alias", "alias": "  论文速记  "}
        expected = {"paper_id": paper_id, "alias": "论文速记"}
        self.assertEqual(self.client.result("library.set_alias", **request), expected)
        self.assertEqual(self.client.result("library.set_alias", **request), expected)
        self.restart()
        item = self.client.result("library.list", **topic)["items"][0]
        self.assertEqual(item["alias"], "论文速记")
        self.assertEqual(item["title"], candidate["title"])
        self.assertEqual(item["source_versions"][0]["source_version_id"], paper["source_version_id"])
        self.client.result("library.set_alias", **args, operation_id="clear-alias", alias="   ")
        self.assertNotIn("alias", self.client.result("library.list", **topic)["items"][0])

    def test_pubmedqa_desktop_contract_and_recovery(self):
        self.assertEqual(self.client.result("protocol.version"), {"major": 0, "minor": 4})
        topic, session = self.context()
        self.assertEqual(self.client.result("topic.create", operation_id="topic-key", title="Research evidence"), topic)
        conflict = self.client.call("topic.create", operation_id="topic-key", title="Different")
        self.assertEqual(conflict["error"]["data"]["reason"], "OPERATION_CONFLICT")

        task_data = {**topic, "kind": "discovery", "input": {"query": "Which scientific QA datasets use abstracts?"}}
        search = self.start("discovery-key", **task_data)
        original = self.client.finish(search["task_id"])["result"]
        candidate = original["candidates"][0]
        args = {**topic, "search_id": original["search_id"], "candidate_id": candidate["candidate_id"]}
        paper = self.client.result("candidate.decide", **args, operation_id="link-key", decision="add")
        self.assertEqual(paper["link_status"], "linked")
        self.assertEqual(self.client.result("candidate.decide", **args, operation_id="link-key", decision="add"), paper)
        self.assertEqual(self.client.result("candidate.decide", **args, operation_id="link-again", decision="add")["link_status"], "already_linked")
        self.assertEqual(self.client.result("discovery.get", **topic, search_id=original["search_id"])["candidates"][0]["decision"], "added")
        saved = self.client.result("task.get", task_id=search["task_id"])
        self.assertEqual(saved["result"]["candidates"][0]["decision"], "pending")
        self.assertEqual(self.client.finish(search["task_id"], cursor=1), {"status": "completed", "result": original})
        self.assertEqual(
            self.client.call("task.subscribe", task_id=search["task_id"], after_seq=999)["error"]["data"]["reason"],
            "INVALID_CURSOR",
        )

        selected = {key: paper[key] for key in ("paper_id", "source_version_id")}
        reading = self.start("ask", **session, kind="reading_qa", input={
            "question": "What context does PubMedQA use?", "sources": [{**selected, "requested_scope": "abstract"}],
        })
        answer = self.client.finish(reading["task_id"])["result"]
        aid = answer["sentences"][0]["anchor_ids"][0]
        anchor_args = {**topic, "message_id": answer["message_id"], "anchor_id": aid}
        evidence = self.client.result("evidence.locate", **anchor_args)
        passage_id = evidence["anchor"]["location"]["passage_id"]
        passage = next(p for p in evidence["source"]["passages"] if p["passage_id"] == passage_id)
        self.assertIn(evidence["anchor"]["quote"], passage["text"])
        self.client.result("reader.bookmark", **session, source_version_id=paper["source_version_id"],
                           passage_id=passage_id, operation_id="bookmark")
        note = self.client.result("note.save", **session, text="This answer has one source.", anchor_ids=[aid],
                                  origin="answer", operation_id="save-note")
        other = self.client.result("topic.create", operation_id="other", title="Another topic")
        self.assertEqual(self.client.call("evidence.locate", **dict(anchor_args, **other))["error"]["data"]["reason"], "NOT_FOUND")

        self.restart()
        self.assertEqual(len(self.client.result("library.list", **topic)["items"]), 1)
        self.assertEqual(self.client.result("session.get", **session)["turns"][0]["answer"], answer)
        self.assertEqual(self.client.result("reader.position", **session, source_version_id=paper["source_version_id"]),
                         {"passage_id": passage_id})
        self.assertEqual(self.client.result("evidence.locate", **anchor_args), evidence)
        self.assertEqual(self.client.result("note.list", **topic)["items"], [note])
        self.assertEqual(self.client.result("task.cancel", task_id=reading["task_id"], operation_id="late-cancel")["status"], "completed")

    def wiki_until(self, topic, done):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            wiki = self.client.result("wiki.get", **topic)
            if done(wiki):
                return wiki
            time.sleep(0.05)
        self.fail("Topic Wiki did not settle.")

    def test_topic_wiki_captures_activity_consolidates_chats_and_edits(self):
        topic, session = self.context()
        empty = self.client.result("wiki.get", **topic)
        self.assertEqual((empty["status"], empty["revision"], empty["entries"]), ("empty", "", []))
        self.assertEqual(empty["generator"], {"kind": "local"})
        self.assertNotIn("transfer", empty)

        search = self.start("wiki-discovery", **topic, kind="discovery", input={"query": "abstract QA datasets"})
        candidate = self.client.finish(search["task_id"])["result"]
        paper = self.client.result("candidate.decide", **topic, search_id=candidate["search_id"],
                                   candidate_id=candidate["candidates"][0]["candidate_id"],
                                   decision="add", operation_id="wiki-add")
        captured = self.wiki_until(topic, lambda w: w["status"] == "ready")["entries"]
        paper_entry = next(e for e in captured if e["kind"] == "paper")
        self.assertEqual(paper_entry["origin"], "paper")
        self.assertTrue(paper_entry["text"].startswith("PubMedQA"))
        located = self.client.result("evidence.open", **topic, anchor_id=paper_entry["anchor_ids"][0])
        passage = next(p for p in located["source"]["passages"] if p["passage_id"] == located["passage_id"])
        self.assertIn(located["quote"], passage["text"])

        reading = self.start("wiki-ask", **session, kind="reading_qa", input={
            "question": "What context does PubMedQA use?",
            "sources": [{"paper_id": paper["paper_id"], "source_version_id": paper["source_version_id"],
                         "requested_scope": "abstract"}],
        })
        aid = self.client.finish(reading["task_id"])["result"]["sentences"][0]["anchor_ids"][0]
        # The finished turn is captured by the task trigger, before anyone opens the Wiki.
        db = sqlite3.connect(self.dir / "workspace.sqlite3")
        try:
            stored = json.loads(db.execute("SELECT data FROM records WHERE kind = 'topic_wiki'").fetchone()[0])
        finally:
            db.close()
        qa = next(e for e in stored["entries"] if e["origin"] == "qa")
        self.assertEqual((qa["kind"], qa["anchor_ids"]), ("finding", [aid]))

        started = self.client.result("wiki.refresh", **topic, operation_id="wiki-refresh")
        self.assertEqual(started["status"], "generating")
        ready = self.wiki_until(topic, lambda m: m["status"] == "ready")
        self.assertFalse(ready["stale"])
        self.assertEqual(ready["new_since_summary"], 0)
        self.assertEqual(ready["sources"], {"papers": 1, "notes": 0, "answers": 1, "findings": 0})
        self.assertIn("Research evidence", ready["headline"])
        self.assertEqual({e["origin"] for e in ready["entries"]}, {"paper", "qa", "summary"})

        self.client.result("wiki.chat", **topic, operation_id="wiki-remember",
                           text="Remember that I only study biomedical datasets")
        busy = self.client.call("wiki.chat", **topic, operation_id="wiki-busy", text="Another")
        if "error" in busy:
            self.assertEqual(busy["error"]["data"]["reason"], "TEMPORARILY_UNAVAILABLE")
        replied = self.wiki_until(topic, lambda m: not m["pending_reply"])
        change = next(m for m in replied["thread"] if m.get("changes"))["changes"][0]
        self.assertEqual((change["op"], change["text"]), ("add", "I only study biomedical datasets"))
        added = next(e for e in replied["entries"] if e["entry_id"] == change["entry_id"])
        self.assertEqual((added["kind"], added["origin"], added["pinned"]), ("preference", "chat", True))
        self.client.result("wiki.chat", **topic, operation_id="wiki-ask-chat", text="What about biomedical work?")
        answered = self.wiki_until(topic, lambda m: not m["pending_reply"])
        self.assertIn("biomedical datasets", answered["thread"][-1]["text"])

        manual = self.client.result("wiki.edit", **topic, operation_id="wiki-edit-add", action="add",
                                    kind="open_question", text="Which datasets include full-text context?")
        manual_entry = manual["entries"][-1]
        self.assertEqual((manual_entry["origin"], manual_entry["pinned"]), ("user", True))
        missing_entry = self.client.call("wiki.edit", **topic, operation_id="wiki-edit-missing",
                                         action="remove", entry_id="nope")
        self.assertEqual(missing_entry["error"]["data"]["reason"], "NOT_FOUND")

        # Five new notes are enough new activity to consolidate in the background without a click.
        for index in range(5):
            self.client.result("note.save", **session, text=f"Observation {index} about PubMedQA.", anchor_ids=[aid],
                               origin="answer", operation_id=f"wiki-note-{index}")
        refreshed = self.wiki_until(topic, lambda m: m["status"] == "ready" and m["new_since_summary"] == 0
                                    and m["sources"]["notes"] == 5)
        ids = {e["entry_id"] for e in refreshed["entries"]}
        self.assertTrue({added["entry_id"], manual_entry["entry_id"]} <= ids)
        self.assertEqual(sum(e["origin"] == "note" for e in refreshed["entries"]), 5)
        self.assertFalse(refreshed["stale"])

        self.client.result("wiki.chat", **topic, operation_id="wiki-forget", text="Forget biomedical datasets")
        forgot = self.wiki_until(topic, lambda m: not m["pending_reply"])
        self.assertNotIn(added["entry_id"], {e["entry_id"] for e in forgot["entries"]})

        self.restart()
        kept = self.client.result("wiki.get", **topic)
        self.assertEqual((kept["status"], kept["headline"]), ("ready", forgot["headline"]))
        self.assertEqual(kept["entries"], forgot["entries"], "Reopening must not capture the same activity twice")
        cleared = self.client.result("wiki.clear_chat", **topic, operation_id="wiki-clear")
        self.assertEqual(cleared["thread"], [])

    def test_confirmation_scope_and_idempotent_start(self):
        topic, _ = self.context()
        params = {**topic, "kind": "discovery", "input": {"query": "First query"}}
        prepared = self.client.result("task.prepare", operation_id="prepare", **params)
        request = {**params, "confirmation_id": prepared["confirmation_id"], "operation_id": "start-key"}
        changed = self.client.call("task.start", **dict(request, input={"query": "Changed query"}))
        self.assertEqual(changed["error"]["data"]["reason"], "CONFIRMATION_REQUIRED")
        first = self.client.result("task.start", **request)
        self.assertEqual(self.client.result("task.start", **request), first)
        reused = self.client.call("task.start", **dict(request, operation_id="another-start"))
        self.assertEqual(reused["error"]["data"]["reason"], "CONFIRMATION_REQUIRED")

    def test_queued_cancel_and_interrupted_restart_do_not_commit_results(self):
        self.client.close()
        messages = []
        worker = Worker(self.dir, messages.append)
        submit = []
        enqueue = worker.jobs.put
        worker.jobs.put = submit.append

        def call(method, **params):
            worker.process({"jsonrpc": "2.0", "id": method, "method": method, "params": params})
            return next(message["result"] for message in reversed(messages) if message.get("id") == method)

        try:
            topic = call("topic.create", operation_id="t", title="Interrupt example")
            params = {**topic, "kind": "discovery", "input": {"query": "Query"}}
            cid = call("task.prepare", operation_id="p", **params)["confirmation_id"]
            task = call("task.start", operation_id="s", confirmation_id=cid, **params)["task_id"]
            call("task.subscribe", task_id=task, after_seq=0)
            self.assertEqual(call("task.cancel", task_id=task, operation_id="c")["status"], "cancelled")
            cid = call("task.prepare", operation_id="p2", **params)["confirmation_id"]
            stranded = call("task.start", operation_id="s2", confirmation_id=cid, **params)["task_id"]
            self.assertEqual(submit, [task, stranded])
            enqueue(task)
        finally:
            worker.jobs.put = enqueue
            worker.close()

        self.restart()
        self.assertEqual(self.client.result("task.get", task_id=task)["status"], "cancelled")
        self.assertEqual(self.client.result("task.get", task_id=stranded)["issue"]["reason"], "PROCESS_INTERRUPTED")
        with sqlite3.connect(self.dir / "workspace.sqlite3") as db:
            self.assertEqual(db.execute("SELECT count(*) FROM records WHERE kind = 'search'").fetchone()[0], 0)


class BibliographyContractTest(unittest.TestCase):
    def setUp(self):
        workspace = tempfile.TemporaryDirectory()
        self.addCleanup(workspace.cleanup)
        self.workspace = Path(workspace.name)
        self.messages = []
        self.worker = Worker(self.workspace, self.messages.append)
        self.worker.discovery_fixture = False
        self.addCleanup(lambda: self.worker.close())
        self.topic = self.call("topic.create", title="Evidence")

    def call(self, method, error=None, **params):
        rid = uuid4().hex
        if method in self.worker.writes:
            params.setdefault("operation_id", rid)
        self.worker.process({"id": rid, "method": method, "jsonrpc": "2.0", "params": params})
        reply = next(message for message in reversed(self.messages) if message.get("id") == rid)
        if error:
            self.assertEqual(reply["error"]["data"]["reason"], error)
            return reply["error"]["data"]
        self.assertIn("result", reply, reply)
        return reply["result"]

    def test_library_trash_restore_and_purge(self):
        preview = self.call("library.preview_bibliography", **self.topic, format="csl-json",
                            content=json.dumps({"title": "Selected paper", "DOI": "10.1234/recycle"}))
        paper = self.call("library.commit_bibliography", **self.topic, preview_id=preview["preview_id"],
                          item_ids=["1"])["items"][0]
        selection = {"paper_ids": [paper["paper_id"]]}
        impact = self.call("library.impact", **selection)
        self.assertEqual(impact["references"], [{"kind": "Topic", "label": "Evidence"}])
        self.call("library.set_alias", **self.topic, paper_id=paper["paper_id"], alias="Changed")
        self.call("library.trash", **selection, revision=impact["revision"], error="STALE_REVISION")
        revision = self.call("library.impact", **selection)["revision"]
        for _ in range(2):
            self.assertEqual(self.call("library.trash", **selection, revision=revision, operation_id="retry"), {"changed": 1})
        self.assertEqual(self.call("library.list", **self.topic)["items"], [])
        original, = self.call("library.catalog")["trash"]
        self.assertEqual(self.call("library.restore", **selection), {"changed": 1, "warnings": []})
        self.assertEqual(self.call("library.catalog")["papers"], [original])
        self.call("library.trash", **selection, revision=self.call("library.impact", **selection)["revision"])
        self.call("library.purge", **selection, revision=revision, clear_excerpts=True, error="STALE_REVISION")
        self.call("library.purge", **selection, revision=self.call("library.impact", **selection)["revision"], clear_excerpts=True)
        self.assertEqual(self.call("library.catalog"), {"papers": [], "trash": [], "reviews": []})

    def test_library_bibliography_export_is_scoped_and_reuses_stable_citation_keys(self):
        record = {"title": "Evidence & Methods", "author": [{"family": "García", "given": "Ada"},
                  {"literal": "Research and Development"}], "DOI": "10.1234/evidence_main",
                  "issued": {"date-parts": [[2025]]}, "type": "paper-conference",
                  "container-title": "Evaluation Conference"}
        preview = self.call("library.preview_bibliography", **self.topic, format="csl-json", content=json.dumps(record))
        imported = self.call("library.commit_bibliography", **self.topic, preview_id=preview["preview_id"],
                             item_ids=["1"])["items"][0]
        pid = imported["paper_id"]
        selection = {**self.topic, "paper_ids": [pid]}
        exported = self.call("library.export_bibliography", format="bibtex", **selection)
        linked, = exported["entries"]
        key = linked["citation_key"]
        self.assertEqual(linked["paper_id"], pid)
        self.assertIn("@inproceedings{" + key, exported["content"])
        self.assertIn(r"Evidence \& Methods", exported["content"])
        self.assertIn("{Research and Development}", exported["content"])
        if importlib.util.find_spec("pybtex"):
            roundtrip = self.call("library.preview_bibliography", **self.topic, format="bibtex",
                                  content=exported["content"])
            self.assertEqual(roundtrip["items"][0]["existing_paper_id"], pid)
        csl = self.call("library.export_bibliography", format="csl-json", **self.topic)
        item, = json.loads(csl["content"])
        self.assertEqual((item["id"], item["title"], item["DOI"]), (key, record["title"], record["DOI"]))
        self.assertEqual(item["issued"], record["issued"])
        self.call("library.set_alias", **self.topic, paper_id=pid, alias="Alias")
        current = self.call("library.metadata", **self.topic, paper_id=pid)
        self.call("library.update_metadata", **self.topic, paper_id=pid, base_revision=current["revision"],
                  changes={"title": "Revised title"})
        revised = self.call("library.export_bibliography", format="bibtex", **selection)
        self.assertEqual(revised["entries"], exported["entries"])
        self.assertIn("Revised title", revised["content"])
        self.assertNotIn("Alias", revised["content"])
        other = self.call("topic.create", title="Outside scope")
        self.call("library.export_bibliography", format="bibtex", **other, paper_ids=[pid], error="NOT_FOUND")
        empty = self.call("library.export_bibliography", format="csl-json", **other)
        self.assertEqual(json.loads(empty["content"]), [])

    def test_zotero_rdf_import_preserves_collection_note_and_pdf_attachment(self):
        rdf = """<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
          xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"
          xmlns:bib="http://purl.org/net/biblio#" xmlns:foaf="http://xmlns.com/foaf/0.1/"
          xmlns:link="http://purl.org/rss/1.0/modules/link/" xmlns:z="http://www.zotero.org/namespaces/export#">
          <z:Collection rdf:about="#parent"><dc:title>Literature</dc:title>
            <dcterms:hasPart rdf:resource="#child"/></z:Collection>
          <z:Collection rdf:about="#child"><dc:title>Evidence</dc:title>
            <dcterms:hasPart rdf:resource="#paper"/></z:Collection>
          <bib:Article rdf:about="#paper"><z:itemType>journalArticle</z:itemType>
            <dc:title>Evidence study</dc:title><dc:date>2025-04-02</dc:date><dc:subject>Method</dc:subject>
            <dc:identifier>https://export.arxiv.org/abs/2501.01234v2</dc:identifier>
            <bib:authors><rdf:Seq><rdf:li><foaf:Person><foaf:givenName>Ada</foaf:givenName>
            <foaf:surname>Ye</foaf:surname></foaf:Person></rdf:li></rdf:Seq></bib:authors>
            <dcterms:isPartOf><bib:Journal><dc:title>Evidence Journal</dc:title>
            <dc:identifier rdf:resource="https://doi.org/10.1234/zotero-evidence"/></bib:Journal></dcterms:isPartOf>
            <dcterms:isReferencedBy rdf:resource="#note"/>
            <link:link rdf:resource="#pdf"/><link:link rdf:resource="#outside"/></bib:Article>
          <bib:Memo rdf:about="#note"><rdf:value>&lt;p&gt;Check &amp;amp; cite.&lt;/p&gt;&lt;script&gt;hidden&lt;/script&gt;</rdf:value></bib:Memo>
          <z:Attachment rdf:about="#pdf"><z:itemType>attachment</z:itemType>
            <z:path rdf:resource="files/3/Study%20Evidence.pdf"/><link:type>application/pdf</link:type></z:Attachment>
          <z:Attachment rdf:about="#outside"><z:path>files/%252e%252e/Outside.pdf</z:path>
            <link:type>application/pdf</link:type></z:Attachment>
        </rdf:RDF>"""
        with patch("bibliography.fetch", side_effect=AssertionError("Migration must be offline.")):
            request = {**self.topic, "format": "zotero-rdf", "content": rdf}
            preview = self.call("library.preview_bibliography", **request)
            item, = preview["items"]
            self.assertEqual(item["collections"], ["Literature / Evidence"])
            self.assertEqual(item["metadata"]["authors"], ["Ada Ye"])
            self.assertEqual(item["metadata"]["doi"], "10.1234/zotero-evidence")
            self.assertEqual(item["metadata"]["arxiv_id"], "2501.01234v2")
            self.assertEqual(item["note_count"], 1)
            pdf, unsafe = item["attachments"]
            self.assertEqual(pdf["relative_path"], "files/3/Study Evidence.pdf")
            self.assertNotIn("relative_path", unsafe)
            self.assertEqual(unsafe["status"], "missing_path")
            self.assertEqual(len(self.call("topic.list")["items"]), 1)
            self.assertEqual(self.call("note.list", **self.topic)["items"], [])

            content = base64.b64encode(sample_pdf("Zotero attached evidence text")).decode()
            selection = {**self.topic, "preview_id": preview["preview_id"]}
            upload = {**selection, "item_id": item["item_id"], "attachment_id": pdf["attachment_id"], "content": content}
            self.call("library.commit_zotero_attachment", **upload, error="NOT_FOUND")
            committed = self.call("library.commit_bibliography", **selection, item_ids=["1"])["items"][0]
            collection, = committed["collection_topic_ids"]
            paper = committed["paper_id"]
            self.assertEqual(self.call("library.catalog")["papers"][0]["tags"], ["Method"])
            note, = self.call("note.list", topic_id=collection)["items"]
            self.assertEqual((note["text"], note["paper_id"]), ("Check & cite.", paper))
            edited = self.call("note.save", topic_id=collection, note_id=note["note_id"], base_revision=note["revision"],
                               text="Edited note", origin="user", anchor_ids=[])
            self.assertEqual(edited["paper_id"], paper)
            attached = self.call("library.commit_zotero_attachment", **upload)
            self.assertEqual(attached["paper_id"], paper)
            version = attached["source_version_id"]
            self.assertEqual(self.call("source.read", topic_id=collection, source_version_id=version)["passages"][0]["text"],
                             "Zotero attached evidence text")
            self.assertTrue(self.call("library.commit_zotero_attachment", **upload)["duplicate"])
            another_preview = self.call("library.preview_bibliography", **request)["preview_id"]
            repeated = self.call("library.commit_bibliography", **self.topic, preview_id=another_preview,
                                 item_ids=["1"])["items"][0]
            self.assertEqual((repeated["paper_id"], repeated["collection_topic_ids"]), (paper, [collection]))
            self.assertEqual(self.call("note.list", topic_id=collection)["items"], [edited])
            from_collection = self.call("library.commit_zotero_attachment", **{**upload, "topic_id": collection})
            self.assertEqual(from_collection["source_version_id"], version)
            other = self.call("topic.create", title="Unrelated")
            self.call("library.commit_zotero_attachment", **{**upload, **other}, error="NOT_FOUND")
            self.call("library.preview_bibliography", **{**request, "content": "<!DOCTYPE rdf>" + rdf},
                      error="INVALID_PARAMS")

            self.worker.close()
            self.worker = Worker(self.workspace, self.messages.append)
            self.assertEqual(self.call("note.list", topic_id=collection)["items"], [edited])
            self.assertEqual(self.call("reader.pdf", topic_id=collection, source_version_id=version)["content"], content)

    @unittest.skipUnless(importlib.util.find_spec("pybtex"), "Install requirements-bibliography.txt for BibTeX")
    def test_bibtex_macros_names_crossrefs_and_offline_deduplication(self):
        bib = r"""
@string{series = "Evidence " # {Benchmarks}}
@proceedings{conf, title=series, year=2025}
@inproceedings{study,
  title = {Reading {AI} \& Evidence},
  author = {Garc{\'i}a, Ada and {Research and Development}},
  crossref = {conf},
  doi = {10.1234/evidence}}
@misc{preprint, title={Unpublished work}, eprint={2501.01234v2}, eprinttype={arXiv},
  url={https://example.org/publisher}}
@misc{no-title, author={Someone}}
"""
        with patch("bibliography.fetch", side_effect=AssertionError("Import must be offline.")):
            existing = self.call("library.preview_bibliography", **self.topic, format="csl-json",
                                 content=json.dumps({"title": "Existing", "DOI": "10.1234/evidence"}))
            original = self.call("library.commit_bibliography", **self.topic, preview_id=existing["preview_id"],
                                 item_ids=["1"])["items"][0]["paper_id"]
            preview = self.call("library.preview_bibliography", **self.topic, format="bibtex", content=bib)
            _, study, preprint, invalid = preview["items"]
            self.assertEqual(study["existing_paper_id"], original)
            self.assertEqual(study["metadata"], {
                "title": "Reading AI & Evidence", "authors": ["García, Ada", "Research and Development"],
                "venue": "Evidence Benchmarks", "venue_type": "conference", "year": 2025,
                "doi": "10.1234/evidence", "provider": "BibTeX",
            })
            self.assertEqual(preprint["metadata"]["arxiv_id"], "2501.01234v2")
            self.assertEqual(invalid["status"], "invalid")
            result = self.call("library.commit_bibliography", **self.topic, preview_id=preview["preview_id"],
                               item_ids=[study["item_id"], preprint["item_id"]])
            self.assertEqual([item["status"] for item in result["items"]], ["already_linked", "imported"])
            with self.assertRaisesRegex(LiteratureError, "file is invalid"):
                bibliography_records("bibtex", "@misc{ok,title={Good}} @misc{broken,title={bad}")
            with self.assertRaisesRegex(LiteratureError, "repeats an entry key"):
                bibliography_records("bibtex", "@misc{Same,title={One}} @misc{same,title={Two}}")
            expansion = ['@string{m0 = "xxxxxxxx"}']
            for idx in range(1, 18):
                expansion.append(f"@string{{m{idx} = m{idx - 1} # m{idx - 1}}}")
            valid = "\n".join([*expansion[:2], "@misc{ok,title={Valid}}"])
            self.assertEqual(bibliography_records("bibtex", valid)[0]["title"], "Valid")
            too_large = "\n".join([*expansion, "@misc{ok,title={Valid}}"])
            with self.assertRaisesRegex(LiteratureError, "expands beyond"):
                bibliography_records("bibtex", too_large)

    def test_bibtex_unavailable_does_not_disable_other_formats(self):
        with patch.dict(sys.modules, {"pybtex.backends.plaintext": None}):
            self.call("library.preview_bibliography", **self.topic, format="bibtex", content="@misc{x,title={Example}}",
                      error="BIBTEX_PARSER_UNAVAILABLE")
            preview = self.call("library.preview_bibliography", **self.topic, format="csl-json",
                                content='{"title":"Example"}')
            self.assertEqual(preview["items"][0]["status"], "ready")

    def test_preview_identifies_duplicate_rows_without_forcing_one_selection(self):
        rows = [{"title": "First", "DOI": "10.1234/same"}, {"title": "Preferred", "DOI": "10.1234/SAME"}]
        preview = self.call("library.preview_bibliography", **self.topic, format="csl-json", content=json.dumps(rows))
        self.assertEqual(preview["items"][1]["duplicate_of"], ["1"])
        self.call("library.commit_bibliography", **self.topic, preview_id=preview["preview_id"], item_ids=["2"])
        self.assertEqual(self.call("library.catalog")["papers"][0]["title"], "Preferred")

    def test_offline_bibliography_preview_selective_commit_and_replay(self):
        ris = """TY  - JOUR
TI  - Study of evidence
AU  - Ye, Lin
JO  - Journal of Test Data
PY  - 2021/01/01
DO  - 10.1234/EVIDENCE
AB  - First line.
      Follow-up line.
ER  -
TY  - JOUR
AU  - Unknown
ER  -
TY  - CPAPER
TI  - An entry without an identifier
ER  -"""
        args = {**self.topic, "format": "ris", "content": ris, "operation_id": "preview-ris"}
        with patch("bibliography.fetch", side_effect=AssertionError("Import must be offline.")):
            preview = self.call("library.preview_bibliography", **args)
            self.assertEqual(preview, self.call("library.preview_bibliography", **args))
            self.assertEqual([row["status"] for row in preview["items"]], ["ready", "invalid", "ready"])
            self.assertEqual(preview["items"][0]["metadata"]["year"], 2021)
            self.assertEqual(self.call("library.catalog")["papers"], [])
            other = self.call("topic.create", title="Other topic")
            selection = {"preview_id": preview["preview_id"], "item_ids": ["1", "3"]}
            self.call("library.commit_bibliography", **other, **selection, error="NOT_FOUND")
            self.call("library.commit_bibliography", **self.topic, **{**selection, "item_ids": ["1", "2"]},
                      error="INVALID_PARAMS")
            self.assertEqual(self.call("library.catalog")["papers"], [])
            commit = {**self.topic, **selection, "operation_id": "import-ris"}
            report = self.call("library.commit_bibliography", **commit)
            self.assertEqual(self.call("library.commit_bibliography", **commit), report)
            first, second = report["items"]
            self.assertEqual([first["available_scope"], second["available_scope"]], ["abstract", "metadata"])
            source = self.call("source.read", **self.topic, source_version_id=first["source_version_id"])
            self.assertEqual(source["passages"][0]["text"], "First line. Follow-up line.")
            self.assertEqual(len(self.call("library.catalog")["papers"]), 2)

            another = self.call("library.preview_bibliography", **self.topic, format="ris", content=ris)
            duplicate = self.call("library.commit_bibliography", **self.topic,
                                  preview_id=another["preview_id"], item_ids=["3"])
            self.assertEqual(duplicate["items"][0]["status"], "already_linked")
            self.assertEqual(duplicate["items"][0]["paper_id"], second["paper_id"])

            csl = json.dumps({"title": "Same work via CSL", "DOI": "https://doi.org/10.1234/evidence",
                              "author": [{"family": "Ye", "given": "Lin"}]})
            another = self.call("library.preview_bibliography", **other, format="csl-json", content=csl)
            self.assertEqual(another["items"][0]["existing_paper_id"], first["paper_id"])
            result = self.call("library.commit_bibliography", **other, preview_id=another["preview_id"], item_ids=["1"])
            self.assertEqual(result["items"][0]["paper_id"], first["paper_id"])
            self.assertEqual(result["items"][0]["status"], "imported")
            self.call("library.preview_bibliography", **self.topic, format="ris", content="TY  - JOUR",
                      error="INVALID_PARAMS")

    def test_bibliography_commit_reports_new_identity_conflicts_per_entry(self):
        def preview(rows):
            return self.call("library.preview_bibliography", **self.topic,
                             format="csl-json", content=json.dumps(rows))["preview_id"]

        def commit(preview_id, items):
            return self.call("library.commit_bibliography", **self.topic, preview_id=preview_id, item_ids=items)["items"]

        doi = "10.1234/test"
        url = "https://arxiv.org/abs/2501.01234"
        staged = preview([{"title": "Ambiguous", "DOI": doi, "URL": url}, {"title": "Independent paper"}])
        commit(preview([{"title": "First record", "DOI": doi}, {"title": "Second record", "URL": url}]), ["1", "2"])
        results = commit(staged, ["1", "2"])
        self.assertEqual(results[0], {"item_id": "1", "status": "conflict", "reason": "IDENTIFIER_ALREADY_LINKED"})
        self.assertEqual(results[1]["status"], "imported")
        self.assertEqual(len(self.call("library.catalog")["papers"]), 3)

    def start_search(self, **input_):
        params = {**self.topic, "kind": "discovery", "input": input_}
        prepared = self.call("task.prepare", **params)
        self.assertEqual(prepared["transfers"][0]["endpoint"], "https://api.openalex.org/works")
        self.assertIn("Search query: citation evidence", prepared["transfers"][0]["data_categories"])
        return self.call("task.start", **params, confirmation_id=prepared["confirmation_id"])["task_id"]

    def finish(self, task_id):
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            task = self.call("task.get", task_id=task_id)
            if task["status"] not in ("running", "queued"):
                return task
            time.sleep(.01)
        self.fail("Discovery did not finish.")

    def test_discovery_deduplicates_works_and_preserves_exclusions(self):
        conference = {"source": {"type": "conference", "display_name": "ACL Annual Meeting"}}
        rows = [
            {"id": "https://openalex.org/W1", "display_name": "Evidence", "publication_year": 2023,
             "doi": "https://doi.org/10.18653/v1/2023.emnlp-main.398",
             "abstract_inverted_index": {"Full": [0], "abstract.": [1]},
             "primary_location": conference},
            {"id": "https://openalex.org/W2", "display_name": "Second", "publication_year": 2023,
             "primary_location": conference},
            {"id": "https://openalex.org/W3", "display_name": "No conference", "publication_year": 2023},
        ]
        rows.append({**rows[0], "id": "https://openalex.org/W4"})
        with patch("bibliography.fetch", return_value=json.dumps({"results": rows}).encode()) as request:
            result = self.finish(self.start_search(query="citation evidence", filters={"year_from": 2023, "venue": "ACL"}))["result"]
            self.assertEqual([c["title"] for c in result["candidates"]], ["Evidence", "Second"])
            self.assertIn("publication_year%3A%3E2022", request.call_args.args[0])
            self.assertIn("1 had no verified conference", result["coverage"]["gaps"][0])
            self.assertEqual(result["provider"], "OpenAlex")
            sid = result["search_id"]
            self.call("candidate.decide", **self.topic, search_id=sid,
                      candidate_id=result["candidates"][0]["candidate_id"], decision="exclude")
            added = self.call("candidate.decide", **self.topic, search_id=sid,
                              candidate_id=result["candidates"][1]["candidate_id"], decision="add")
            self.assertEqual(added["available_scope"], "metadata")
            refined = self.finish(self.start_search(previous_search_id=sid))["result"]
            self.assertEqual(refined["excluded"][0]["title"], "Evidence")
            self.assertEqual(refined["candidates"][0]["decision"], "added")
        with patch("bibliography.fetch", return_value=b'{"results":[]}'):
            task = self.finish(self.start_search(query="citation evidence"))
            self.assertEqual(task["result"]["candidates"], [])
            self.assertEqual(task["status"], "completed")

    def test_pdf_download_skips_html_and_keeps_original_bytes(self):
        pdf = sample_pdf("A result from page one.")
        address = [(2, 1, 6, "", ("93.184.216.34", 443))]
        with patch("bibliography.socket.getaddrinfo", return_value=address), patch("bibliography.build_opener") as opener:
            opener.return_value.open.side_effect = [BytesIO(b"<html>Publisher login</html>"), BytesIO(pdf)]
            self.assertEqual(download_open_pdf(["https://example.org/publisher", "https://example.org/archive"]), pdf)
            self.assertEqual(opener.return_value.open.call_count, 2)

    def test_discovery_download_retries_and_opens_original_pdf(self):
        url = "https://example.org/paper.pdf"
        record = {"id": "https://openalex.org/W1234", "display_name": "HRI",
                  "abstract_inverted_index": {"Abstract": [0]},
                  "best_oa_location": {"is_oa": True, "pdf_url": url}}
        with patch("bibliography.fetch", return_value=json.dumps({"results": [record]}).encode()):
            result = self.finish(self.start_search(query="citation evidence"))["result"]
        candidate = result["candidates"][0]
        self.assertEqual(candidate["pdf_urls"], [url])
        params = {**self.topic, "search_id": result["search_id"], "candidate_id": candidate["candidate_id"], "decision": "add"}
        pdf = sample_pdf("Evidence from the complete paper.")
        with patch("papertrace.download_open_pdf", side_effect=[None, pdf]) as download:
            abstract = self.call("candidate.decide", **params)
            self.assertEqual(abstract["available_scope"], "abstract")
            saved = self.call("candidate.decide", **params)
            self.assertEqual(saved["available_scope"], "full_text")
            self.assertEqual(saved["paper_id"], abstract["paper_id"])
            self.assertEqual(self.call("candidate.decide", **params)["source_version_id"], saved["source_version_id"])
            self.assertEqual(download.call_count, 2)
        document = self.call("reader.pdf", **self.topic, source_version_id=saved["source_version_id"])
        self.assertEqual(base64.b64decode(document["content"]), pdf)

    def test_discovery_failure_and_cancellation_do_not_save_candidates(self):
        with patch("bibliography.fetch", side_effect=PublicServiceError("SERVICE_RATE_LIMITED", "Rate limited.")):
            failed = self.finish(self.start_search(query="citation evidence"))
            self.assertEqual(failed["issue"]["reason"], "SERVICE_RATE_LIMITED")
        entered, release = threading.Event(), threading.Event()
        def slow_fetch(*_):
            entered.set()
            release.wait(3)
            return b'{"results":[]}'
        with patch("bibliography.fetch", side_effect=slow_fetch):
            task = self.start_search(query="citation evidence")
            try:
                self.assertTrue(entered.wait(2))
                self.assertEqual(self.call("task.cancel", task_id=task)["status"], "cancelled")
            finally:
                release.set()
            deadline = time.monotonic() + 3
            while task in self.worker.inflight and time.monotonic() < deadline:
                time.sleep(.01)
            self.assertNotIn(task, self.worker.inflight)
        self.assertEqual(self.call("discovery.latest", **self.topic), {})

    def test_identifier_import_edits_and_pdf_resume_survive_restart(self):
        row = {"message": {"DOI": "10.18653/v1/2023.emnlp-main.398", "title": ["Enabling LLMs"],
                           "author": [{"given": "Tianyu", "family": "Gao"}],
                           "issued": {"date-parts": [[2023]]}, "container-title": ["EMNLP"]}}
        with patch("bibliography.fetch", return_value=json.dumps(row).encode()):
            preview = self.call("library.preview_identifier", **self.topic, identifier="https://doi.org/" + row["message"]["DOI"])
        self.assertEqual(self.call("library.list", **self.topic)["items"], [])
        other = self.call("topic.create", title="Other")
        key = {"preview_id": preview["preview_id"]}
        self.call("library.commit_identifier", **other, **key, error="NOT_FOUND")
        first = self.call("library.commit_identifier", **self.topic, **key)
        self.assertEqual(first["available_scope"], "metadata")
        self.assertTrue(self.call("library.commit_identifier", **self.topic, **key)["already_linked"])
        paper = {"paper_id": first["paper_id"], **self.topic}
        revision = self.call("library.metadata", **paper)["revision"]
        edits = {"base_revision": revision, "changes": {"title": "My corrected paper"}}
        self.call("library.update_metadata", **paper, **edits)
        self.call("library.update_metadata", **paper, **edits, error="STALE_REVISION")
        content = base64.b64encode(sample_pdf("Citations support answers.")).decode()
        pdf = self.call("library.import_pdf", **paper, name="paper.pdf", content=content)
        self.assertTrue(self.call("library.import_pdf", **paper, name="again.pdf", content=content)["duplicate"])
        session = self.call("session.create", **self.topic)
        scope = {**session, "source_version_id": pdf["source_version_id"]}
        pid = self.call("source.read", **scope)["passages"][0]["passage_id"]
        self.assertEqual(self.call("reader.bookmark", **scope, passage_id=pid), {"passage_id": pid})
        saved = {"page": 1, "zoom": 1.4, "offset": 0.25}
        self.call("reader.bookmark", **scope, **saved)
        self.call("reader.bookmark", **scope, **{**saved, "page": 2}, error="INVALID_PARAMS")
        new = self.call("library.import_pdf", **paper, name="revised.pdf",
                        content=base64.b64encode(sample_pdf("A different version.")).decode())
        self.worker.close()
        self.worker = Worker(self.workspace, self.messages.append)
        self.assertEqual(self.call("reader.position", **scope), saved)
        self.assertEqual(self.call("reader.position", **{**scope, "source_version_id": new["source_version_id"]}), {})
        self.assertEqual(self.call("library.metadata", **paper)["metadata"]["title"], "My corrected paper")
        self.assertEqual(self.call("session.get", **session)["reader"], {"source_version_id": scope["source_version_id"], **saved})


if __name__ == "__main__":
    unittest.main()
