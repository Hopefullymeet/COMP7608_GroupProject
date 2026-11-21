import json
from pathlib import Path
import queue
import sqlite3
import subprocess
import sys
import tempfile
import threading
import unittest

from papertrace import Worker
from dsh import read_json_answer


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


class Client:
    def __init__(self, directory):
        self.child = subprocess.Popen(
            [sys.executable, "-u", str(Path(__file__).with_name("papertrace.py")), str(directory)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            encoding="utf-8", bufsize=1,
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
        provider = config["model_id"]
        self.assertEqual(config["models"][0]["id"], provider)
        self.assertNotIn("key", config["models"][0])
        request = {k: v for k, v in config.items() if k != "revision"}
        request.update(base_revision=config["revision"], operation_id="save-model")
        request["models"][0]["model"] = "example-research-model"
        tampered = {**request, "models": [{**request["models"][0], "endpoint": "https://example.invalid"}]}
        self.assertEqual(self.client.call("services.save", **tampered)["error"]["data"]["reason"],
                         "SETTINGS_READ_ONLY")
        saved = self.client.result("services.save", **request)
        self.assertNotEqual(saved["revision"], config["revision"])
        self.assertEqual(saved["models"][0]["model"], "example-research-model")
        self.assertEqual(self.client.result("services.save", **request), saved)
        self.assertEqual(
            self.client.call("services.save", **{**request, "operation_id": "old-revision"})["error"]["data"]["reason"],
            "STALE_REVISION")
        unchanged = {k: v for k, v in saved.items() if k != "revision"}
        unchanged.update(base_revision=saved["revision"], operation_id="save-unchanged")
        self.assertEqual(self.client.result("services.save", **unchanged), saved)
        self.restart()
        self.assertEqual(self.client.result("services.get"), saved)

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


if __name__ == "__main__":
    unittest.main()
