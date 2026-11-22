import base64
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
from unittest.mock import patch
from uuid import uuid4

from papertrace import Worker
from dsh import read_json_answer
from bibliography import PublicServiceError
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
