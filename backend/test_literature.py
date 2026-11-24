"""Regression tests for evidence gating and persistent Wiki revision handling."""

import base64
from contextlib import closing
import json
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile
import time
import unittest
from unittest.mock import patch
from uuid import uuid4

from model_agent import ModelAgent, failure
from literature import body_passage_starts, poppler
from papertrace import Worker
from research_tools import ResearchTools, open_corpus


def sample_pdf(body):
    stream = f"BT /F1 12 Tf 45 740 Td ({body}) Tj ET".encode("ascii")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    data = b"%PDF-1.4\n"
    offsets = []
    for i, item in enumerate(objects, 1):
        offsets.append(len(data))
        data += b"%d 0 obj\n%s\nendobj\n" % (i, item)
    tail = b"xref\n0 6\n0000000000 65535 f \n" + b"".join(b"%010d 00000 n \n" % p for p in offsets)
    return data + tail + b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % len(data)


class ScriptedSynthesis:
    key = "test"
    endpoint = "http://127.0.0.1"

    def __init__(self, workspace):
        self.database = Path(workspace) / "workspace.sqlite3"
        self.leads = []

    def synthesize(self, question, sources, wiki, cancelled, progress, mode, dimensions=None):
        self.leads = wiki
        seen = {}
        refs = []
        with closing(sqlite3.connect(self.database)) as reader:
            for source in sources:
                version = source["source_version_id"]
                pid, page, body = reader.execute(
                    "SELECT passage_id,page,text FROM paper_passages WHERE version_id = ?", (version,)).fetchone()
                seen[pid] = {"passage_id": pid, "source_version_id": version, "page": page, "text": body}
                refs.append({"id": pid, "quote": body})
        left, right = [s["source_version_id"] for s in sources]
        point = {"title": "Evaluate answers with evidence", "claims": [
            {"text": "The first source establishes the benchmark.", "assessment": "supported",
             "contributions": [{"version": left, "role": "Defines the evaluation task", "assessment": "supported",
                                "evidence": [refs[0]]}]},
            {"text": "The second shows a universal improvement.", "assessment": "supported",
             "contributions": [{"version": right, "role": "Evaluation result", "assessment": "partial",
                                "evidence": [refs[1]]}, {"version": right, "role": "Invalid source", "assessment": "supported",
                                                       "evidence": [refs[0], {**refs[1], "quote": "Fabricated exact-looking excerpt."}]}]},
        ]}
        if wiki:
            point["prior_id"] = next(item["id"] for item in wiki if item["kind"] == "point")
        relations = [{"from": right, "to": left, "subject": "Repurposes a benchmark.", "kind": "uses_benchmark",
                      "from_evidence": [refs[1]], "to_evidence": [refs[0]], "citation_evidence": [refs[1]]},
                     {"from": right, "to": left, "subject": "Incompatible experimental settings.", "kind": "conflicts",
                      "from_evidence": [refs[1]], "to_evidence": [refs[0]], "comparability": "not_comparable"}]
        cells = [{"dimension": d, "version": src, "evidence": [ref], "text": ref["quote"], "status": "evidenced"}
                 for d in dimensions or [] for src, ref in zip((left, right), refs)]
        trace = [{"kind": "tool", "title": "paper_read", "detail": "2 result(s)."}]
        progress("paper_read", "2 result(s).")
        return {"points": [point], "relations": relations, "gaps": [], "cells": cells}, seen, trace, {}, None


@unittest.skipUnless(shutil.which(poppler("pdftotext")), "Poppler is required")
class BodyEvidenceTest(unittest.TestCase):
    def test_abstract_across_chunks_and_body_on_same_page(self):
        rows = [("a", 1, "Title Abstract—We report an improvement."),
                ("b", 1, "More abstract text. I. INTRODUCTION Actual body evidence."),
                ("c", 2, "Methods and experimental conditions.")]
        starts = body_passage_starts(rows)
        self.assertEqual([text[starts.get(pid, 0):].strip() for pid, _, text in rows],
                         ["", "Actual body evidence.", rows[2][2]])
        self.assertEqual(body_passage_starts([("a", 1, "Methods and experimental conditions.")]), {})


class LiteratureTest(unittest.TestCase):
    def test_read_budget_counts_new_passages_and_keeps_rows_that_fit(self):
        sources = [{"source_version_id": version, "available_scope": "full_text"}
                   for version in self.versions]
        tools = ResearchTools(Path(self.workspace.name), sources, [], passage_limit=1)
        ids = [tools.search(["benchmark"], version)[0]["passage_id"] for version in self.versions]
        result = tools.read(ids)
        self.assertTrue(result["limit_reached"])
        self.assertEqual([row["passage_id"] for row in result["passages"]], ids[:1])
        self.assertEqual(tools.read(ids[:1]), result["passages"])

    @unittest.skipUnless(os.name == "nt", "Windows extended workspace path")
    def test_desktop_extended_path_can_read_scoped_passages(self):
        root = Path("\\\\?\\" + str(Path(self.workspace.name).resolve()))
        version = self.versions[0]
        tools = ResearchTools(root, [{"source_version_id": version, "available_scope": "full_text"}], [])
        for question in ("benchmark", "zzznomatch"):
            with self.subTest(question=question):
                passages = tools.initial_readings(question)
                self.assertTrue(passages)
                rows = tools.read([passages[0]["passage_id"]])
                self.assertTrue(all(row["source_version_id"] == version for row in rows))
        with open_corpus(tools.database) as db, self.assertRaisesRegex(sqlite3.OperationalError, "readonly"):
            db.execute("CREATE TABLE unexpected_write (id)")

    def setUp(self):
        self.workspace = tempfile.TemporaryDirectory()
        self.worker = Worker(Path(self.workspace.name), self.receive)
        self.replies = {}
        self.addCleanup(self.workspace.cleanup)
        self.addCleanup(self.worker.close)
        self.worker.agent = ScriptedSynthesis(self.workspace.name)
        self.topic = self.call("topic.create", title="Evidence")["topic_id"]
        self.other = self.call("topic.create", title="Other")["topic_id"]
        self.a = self.save_pdf("Alpha", "Alpha proposes the benchmark for evidence attribution.")
        self.b = self.save_pdf("Beta", "Beta uses the Alpha benchmark with a different test split.")
        self.versions = [self.a["source_version_id"], self.b["source_version_id"]]

    def receive(self, message):
        if message.get("id"):
            self.replies[message["id"]] = message

    def call(self, method, error=None, **params):
        rid = uuid4().hex
        if method in Worker.writes:
            params.setdefault("operation_id", rid)
        self.worker.process({"method": method, "jsonrpc": "2.0", "id": rid, "params": params})
        result = self.replies.pop(rid)
        if error:
            return self.assertEqual(result.get("error", {}).get("data", {}).get("reason"), error)
        self.assertIn("result", result, result)
        return result["result"]

    def save_pdf(self, name, text, **params):
        return self.call("library.import_pdf", topic_id=self.topic, name=name + ".pdf",
                         content=base64.b64encode(sample_pdf(text)).decode(), **params)

    def test_wiki_retains_multiple_findings_but_only_links_verified_body_on_home(self):
        paper = self.save_pdf("Test", "Abstract. Faster. 1. Introduction. Stable. Accurate.")
        vid = paper["source_version_id"]
        with self.worker.lock, self.worker.db:
            pid, text = self.worker.db.execute("SELECT passage_id,text FROM paper_passages WHERE version_id=?", (vid,)).fetchone()
            task = {"topic_id": self.topic}
            passage = {"passage_id": pid, "source_version_id": vid, "paper_id": paper["paper_id"], "page": 1, "text": text}
            ids = [self.worker.store_anchor(task, "msg", passage, q) for q in ("Faster.", "Stable.", "Accurate.")]
            sid = self.worker.dispatch("session.create", task, [])["session_id"]
            session = self.worker.get("session", sid)
            session["turns"].append({"task_id": "test-turn", "question": "Compare results.",
                                     "answer": {"sentences": [{"text": str(i), "anchor_ids": [aid]} for i, aid in enumerate(ids)]},
                                     "wiki_review": {"model": "test", "findings": {"0":"lead", "1":"result", "2":"result"},
                                                     "questions": ["Does this generalize?"]}})
            self.worker.put("session", sid, session)
            wiki = self.worker.topic_wiki.get(self.topic)
            entries = [e for e in wiki["entries"] if e["origin"] == "qa"]
            self.assertEqual([e["kind"] for e in entries], ["finding"] * 3 + ["open_question"])
            self.assertEqual(wiki["home_points"], [e["entry_id"] for e in entries[1:3]])
            self.assertEqual(wiki["map_sources"][ids[0]]["section"], "abstract_or_front_matter")
            for aid in ids[1:]:
                located = self.worker.dispatch("evidence.open", {"anchor_id": aid}, [])
                self.assertEqual(located["source"]["passages"][0]["page"], 1)
                self.assertIn(located["quote"], located["source"]["passages"][0]["text"])
            self.assertEqual(self.worker.topic_wiki.get(self.topic)["home_points"], wiki["home_points"])

    def run_task(self, versions, kind="literature_synthesis"):
        input_ = {"source_versions": versions, "question": "How can answers be supported?"}
        if kind == "paper_comparison":
            input_["dimensions"] = ["Benchmark", "Data split"]
        args = {"kind": kind, "input": input_, "topic_id": self.topic}
        prepared = self.call("task.prepare", **args)
        self.assertTrue(prepared["transfers"])
        task_id = self.call("task.start", confirmation_id=prepared["confirmation_id"], **args)["task_id"]
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            snapshot = self.call("task.get", task_id=task_id)
            if snapshot["status"] not in ("queued", "running"):
                self.assertIn("result", snapshot, snapshot)
                return snapshot
            time.sleep(.03)
        self.fail("Synthesis did not finish.")

    def test_outline_keeps_preset_selected_at_confirmation(self):
        args = {"kind": "literature_synthesis", "topic_id": self.topic,
                "input": {"question": "Which results agree?", "source_versions": self.versions}}
        self.call("preset.save", mode="fixed")
        prepared = self.call("task.prepare", **args)
        self.assertNotIn("Relevant reviewed Wiki entries", prepared["transfers"][0]["data_categories"])
        self.call("preset.save", mode="wiki")
        started = self.call("task.start", confirmation_id=prepared["confirmation_id"], **args)
        with self.worker.lock:
            self.assertEqual(self.worker.get("task", started["task_id"])["input"]["mode"], "fixed")
        following = self.call("task.prepare", **args)
        self.assertIn("Relevant reviewed Wiki entries", following["transfers"][0]["data_categories"])

    def test_preview_pdf_reuses_parsing_without_saving_a_paper(self):
        pdf = {"name": "New source.pdf",
               "content": base64.b64encode(sample_pdf("The PDF contains evidence text.")).decode()}
        self.assertEqual(self.call("library.preview_pdf", **pdf), {"parsed": True})
        self.call("library.preview_pdf", error="INVALID_PDF", name=pdf["name"], content="invalid")
        self.assertEqual(self.call("library.list", topic_id=self.other)["items"], [])
        with patch("workbench.extract_pdf", side_effect=AssertionError("PDF was parsed a second time")):
            imported = self.call("library.import_pdf", topic_id=self.other, **pdf)
        doc = self.call("source.read", topic_id=self.other, source_version_id=imported["source_version_id"])
        self.assertEqual(doc["passages"][0]["text"], "The PDF contains evidence text.")

    def test_parsed_pdf_chunks_become_topic_wiki_entries_with_page_evidence(self):
        entries = self.call("wiki.get", topic_id=self.topic)["entries"]
        pdf = [e for e in entries if e["origin"] == "pdf"]
        self.assertEqual({e["text"].split(":")[0] for e in pdf}, {"Alpha", "Beta"})
        for entry in pdf:
            located = self.call("evidence.open", topic_id=self.topic, anchor_id=entry["anchor_ids"][0])
            self.assertEqual(located["read_scope"], "full_text")
            self.assertIn(located["quote"], entry["text"])
        self.assertEqual(self.call("wiki.get", topic_id=self.other)["entries"], [])
        again = self.call("wiki.get", topic_id=self.topic)["entries"]
        self.assertCountEqual([e for e in again if e["origin"] == "pdf"], pdf)

    def test_pdf_round_trip_and_topic_boundaries(self):
        duplicate = self.save_pdf("Alpha duplicated", "Alpha proposes the benchmark for evidence attribution.")
        self.assertTrue(duplicate["duplicate"])
        self.assertEqual(self.versions[0], duplicate["source_version_id"])
        self.save_pdf("Alpha on the wrong record", "Alpha proposes the benchmark for evidence attribution.",
                      paper_id=self.b["paper_id"], error="IDENTITY_CONFLICT")
        self.assertEqual(self.worker.db.execute("SELECT COUNT(*) FROM pdf_files").fetchone()[0], 2)
        self.call("source.read", topic_id=self.other, source_version_id=self.versions[0], error="NOT_FOUND")
        self.call("task.prepare", kind="literature_synthesis", topic_id=self.other, error="NOT_FOUND",
                  input={"question": "Question", "source_versions": self.versions})
        doc = self.call("source.read", topic_id=self.topic, source_version_id=self.versions[0])
        self.assertEqual(doc["passages"][0]["page"], 1)
        if shutil.which(poppler("pdftoppm")):
            page = self.call("source.page", topic_id=self.topic, source_version_id=self.versions[0], page=1)
            self.assertTrue(base64.b64decode(page["png"]).startswith(b"\x89PNG"))

    def test_topic_folders_are_independent_and_unlink_clears_membership(self):
        pid = self.a["paper_id"]
        self.call("library.organize", paper_ids=[pid], action="link", value=self.other)
        for topic in (self.topic, self.other):
            folder = self.call("library.folder_create", topic_id=topic, name="Methods")["id"]
            self.call("library.folder_move", topic_id=topic, folder_id=folder, paper_ids=[pid])
            self.assertEqual(self.call("library.folders", topic_id=topic)["assignments"][pid], folder)
        self.call("library.folder_move", topic_id=self.topic, folder_id=folder, paper_ids=[pid], error="INVALID_PARAMS")
        self.call("library.organize", paper_ids=[pid], action="unlink", value=self.topic)
        self.call("library.organize", paper_ids=[pid], action="link", value=self.topic)
        self.assertEqual(self.call("library.folders", topic_id=self.topic)["assignments"], {})
        self.assertEqual(self.call("library.folders", topic_id=self.other)["assignments"][pid], folder)
        self.call("library.folder_move", topic_id=self.other, folder_id="", paper_ids=[pid])
        self.assertEqual(self.call("library.folders", topic_id=self.other)["assignments"], {})

    def test_organize_batch_preserves_scoped_historic_evidence(self):
        ids = [self.a["paper_id"], self.b["paper_id"]]
        args = {"paper_ids": ids, "action": "tag", "value": " Citation research "}
        self.call("library.organize", **{**args, "paper_ids": [ids[0], "missing"]}, error="NOT_FOUND")
        self.assertTrue(all(not paper["tags"] for paper in self.call("library.catalog")["papers"]))
        self.assertEqual(self.call("library.organize", **args), {"changed": 2})
        self.assertEqual(self.call("library.organize", **args), {"changed": 0})
        self.assertTrue(all(paper["tags"] == ["Citation research"] for paper in self.call("library.catalog")["papers"]))
        self.assertEqual(self.call("library.organize", **{**args, "action": "untag"}), {"changed": 2})
        self.assertEqual(self.call("library.organize", paper_ids=ids, action="link", value=self.other), {"changed": 2})

        self.run_task(self.versions)
        outline = self.call("synthesis.list", topic_id=self.topic)["items"][0]
        anchor = outline["points"][0]["claims"][0]["contributions"][0]["anchor_ids"][0]
        evidence = self.call("evidence.open", topic_id=self.topic, anchor_id=anchor)
        self.assertEqual(self.call("library.organize", paper_ids=[ids[0]], action="unlink",
                                   value=self.topic), {"changed": 1})
        self.assertEqual([p["paper_id"] for p in self.call("library.list", topic_id=self.topic)["items"]], [ids[1]])
        self.assertEqual({p["paper_id"] for p in self.call("library.list", topic_id=self.other)["items"]}, set(ids))
        scope = {"topic_id": self.topic, "source_version_id": self.versions[0]}
        self.call("source.read", **scope, error="NOT_FOUND")
        self.call("source.page", **scope, page=1, error="NOT_FOUND")
        self.assertEqual(self.call("evidence.open", topic_id=self.topic, anchor_id=anchor), evidence)
        self.call("evidence.open", topic_id=self.other, anchor_id=anchor, error="NOT_FOUND")
        self.call("source.page", **scope, page=2, anchor_id=anchor, error="NOT_FOUND")
        self.call("source.page", **{**scope, "source_version_id": self.versions[1]},
                  page=1, anchor_id=anchor, error="NOT_FOUND")
        self.call("source.page", **{**scope, "topic_id": self.other}, page=1, anchor_id=anchor, error="NOT_FOUND")
        if shutil.which(poppler("pdftoppm")):
            page = self.call("source.page", **scope, page=1, anchor_id=anchor)
            self.assertTrue(base64.b64decode(page["png"]).startswith(b"\x89PNG"))

    def test_interrupted_full_text_answer_reports_read_coverage_without_saving_a_turn(self):
        session = self.call("session.create", topic_id=self.topic)["session_id"]
        version = self.versions[0]
        passage = self.call("source.read", topic_id=self.topic, source_version_id=version)["passages"][0]
        seen = {passage["passage_id"]: {**passage, "source_version_id": version}}
        runtime = ModelAgent(self.workspace.name, "fixture")
        self.worker.agent = runtime
        args = {"kind": "reading_qa", "topic_id": self.topic, "session_id": session, "input": {
            "question": "How was the benchmark built?",
            "sources": [{"paper_id": self.a["paper_id"], "source_version_id": version,
                         "requested_scope": "full_text"}],
        }}
        def run():
            prepared = self.call("task.prepare", **args)
            task = self.call("task.start", confirmation_id=prepared["confirmation_id"], **args)["task_id"]
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                snapshot = self.call("task.get", task_id=task)
                if snapshot["status"] not in ("queued", "running"):
                    return snapshot
                time.sleep(.03)
            self.fail("Reading task did not finish.")

        interruption = {"reason": "MODEL_UNAVAILABLE", "retryable": True, "next_action": "retry"}
        for raw, provider_issue, reason in (
            ({}, interruption, "MODEL_UNAVAILABLE"),
            ({"unexpected": True}, None, "MODEL_OUTPUT_INVALID"),
        ):
            with self.subTest(reason=reason), patch.object(
                ModelAgent, "run_research", return_value=(raw, seen, [], {}, provider_issue),
            ):
                snapshot = run()
                self.assertEqual(snapshot["status"], "failed")
                self.assertNotIn("result", snapshot)
                self.assertEqual(snapshot["issue"]["reason"], reason)
                self.assertTrue(snapshot["issue"]["retryable"])
                self.assertEqual(snapshot["issue"]["details"]["read_sources"], [
                    {"source_version_id": version, "read_scope": "full_text"},
                ])
        for scope, method in (("full_text", "answer_full_text"), ("abstract", "answer")):
            with self.subTest(scope=scope), patch.object(ModelAgent, method, side_effect=failure()):
                args["input"]["sources"][0]["requested_scope"] = scope
                snapshot = run()
                self.assertEqual(snapshot["status"], "failed")
                self.assertEqual(snapshot["issue"]["details"]["read_sources"], [
                    {"source_version_id": version, "read_scope": "none"},
                ])
        self.assertEqual(self.call("session.get", topic_id=self.topic, session_id=session)["turns"], [])

        args["input"]["sources"][0]["requested_scope"] = "full_text"
        answer = {"sentences": [{"text": "The source defines the benchmark.",
                                 "evidence": [{"id": passage["passage_id"], "quote": passage["text"]}]}]}
        budget = {"reason": "TASK_BUDGET_EXHAUSTED", "retryable": False, "next_action": "adjust_budget"}
        with patch.object(ModelAgent, "run_research", return_value=(answer, seen, [], {}, budget)):
            snapshot = run()
        self.assertEqual(snapshot["status"], "partial")
        self.assertEqual(snapshot["issue"]["reason"], budget["reason"])
        self.assertTrue(snapshot["result"]["sentences"][0]["anchor_ids"])

    def test_live_reading_uses_configured_endpoint_without_harness_installed(self):
        self.worker.agent = None
        self.worker.discovery_fixture = False
        with patch("papertrace.deepseek_api_key", return_value="fixture"):
            self.check_reading_uses_configured_endpoint()

    def test_reading_dispatch_error_leaves_queue_available(self):
        session = self.call("session.create", topic_id=self.topic)["session_id"]
        args = {"kind": "reading_qa", "topic_id": self.topic, "session_id": session,
                "input": {"question": "Which benchmark?", "sources": [{
                    "paper_id": self.a["paper_id"], "source_version_id": self.versions[0],
                    "requested_scope": "full_text"}]}}
        with patch.object(self.worker, "run_model_reading", side_effect=TypeError("dispatch failure")):
            prepared = self.call("task.prepare", **args)
            task = self.call("task.start", confirmation_id=prepared["confirmation_id"], **args)
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                snapshot = self.call("task.get", task_id=task["task_id"])
                if snapshot["status"] == "failed":
                    break
                time.sleep(.03)
            else:
                self.fail("Dispatch failure left the task active")
            self.assertTrue(snapshot["issue"]["retryable"])
        self.worker.agent = None
        with patch("papertrace.deepseek_api_key", return_value="fixture"):
            self.check_reading_uses_configured_endpoint()

    def check_reading_uses_configured_endpoint(self):
        session = self.call("session.create", topic_id=self.topic)["session_id"]
        version = self.versions[0]
        passage = self.call("source.read", topic_id=self.topic, source_version_id=version)["passages"][0]
        endpoint = self.worker.services_config()["models"][0]["endpoint"]
        args = {"kind": "reading_qa", "topic_id": self.topic, "session_id": session, "input": {
            "question": "这些论文有什么和benchmark相关的信息？",
            "sources": [{"paper_id": self.a["paper_id"], "source_version_id": version,
                         "requested_scope": "full_text"}],
        }}
        answer = {"sentences": [{"text": "Alpha 提出了基准。", "evidence": [
            {"id": passage["passage_id"], "quote": passage["text"]},
            {"id": passage["passage_id"], "quote": "An invented excerpt."},
        ]}]}
        prepared = self.call("task.prepare", **args)
        self.assertEqual(prepared["transfers"][0]["endpoint"], endpoint)
        with patch("papertrace.build_opener") as opener:
            response = opener.return_value.open.return_value.__enter__.return_value
            response.headers = {"Content-Type": "application/json"}
            response.read.return_value = json.dumps({
                "choices": [{"message": {"content": json.dumps(answer)}}],
            }).encode()
            task_id = self.call("task.start", confirmation_id=prepared["confirmation_id"], **args)["task_id"]
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                snapshot = self.call("task.get", task_id=task_id)
                if snapshot["status"] not in ("queued", "running"):
                    break
                time.sleep(.03)
            request = opener.return_value.open.call_args.args[0]
            self.assertEqual(request.full_url, endpoint + "/chat/completions")
            sent = json.loads(json.loads(request.data)["messages"][1]["content"])
            self.assertEqual([row["id"] for row in sent["passages"]], [passage["passage_id"]])
        self.assertEqual(snapshot["status"], "completed")
        anchors = snapshot["result"]["sentences"][0]["anchor_ids"]
        self.assertEqual(len(anchors), 1)
        self.assertEqual(self.call("evidence.open", topic_id=self.topic, anchor_id=anchors[0])["quote"],
                         passage["text"])

    def test_source_gaps_exact_anchors_and_wiki_recheck(self):
        snapshot = self.run_task(self.versions)
        self.assertEqual(snapshot["status"], "partial")
        outline = self.call("synthesis.list", topic_id=self.topic)["items"][0]
        self.assertEqual(snapshot["result"]["record_id"], outline["record_id"])
        point = outline["points"][0]
        self.assertEqual([c["assessment"] for c in point["claims"]], ["supported", "partial"])
        self.assertEqual(len(point["claims"][1]["contributions"]), 1)
        self.assertEqual([r["kind"] for r in outline["relations"]], ["uses_benchmark", "compares"])
        anchor = point["claims"][0]["contributions"][0]["anchor_ids"][0]
        located = self.call("evidence.open", topic_id=self.topic, anchor_id=anchor)
        self.assertIn(located["quote"], located["source"]["passages"][0]["text"])
        self.call("evidence.open", topic_id=self.other, anchor_id=anchor, error="NOT_FOUND")

        params = {"topic_id": self.topic, "record_id": outline["record_id"], "item_ids": [point["id"]],
                  "base_revision": ""}
        export = {k: v for k, v in params.items() if k != "base_revision"}
        self.assertTrue(self.call("export.create", format="evidence", **export)["saved"])
        wiki = self.call("synthesis.review", **params)
        self.assertEqual(len(wiki["items"]), 1)
        self.call("synthesis.review", **params, error="STALE_REVISION")
        self.run_task(self.versions)
        self.assertTrue(self.worker.agent.leads[0]["passage_ids"])
        version = self.save_pdf("Alpha v2", "Alpha revises the benchmark and adds a separate test set.",
                                paper_id=self.a["paper_id"])["source_version_id"]
        wiki = self.call("synthesis.wiki", topic_id=self.topic)
        self.assertTrue(wiki["items"][0]["needs_review"])
        archived = next(r for r in self.call("synthesis.list", topic_id=self.topic)["items"]
                        if r["record_id"] == outline["record_id"])
        self.assertIn(point["id"], archived["stale_item_ids"])
        self.call("export.create", format="evidence", **export, error="STALE_REVISION")
        self.assertEqual(self.call("evidence.open", topic_id=self.topic, anchor_id=anchor)["quote"], located["quote"])
        self.call("synthesis.review", **{**params, "base_revision": wiki["revision"]}, error="STALE_REVISION")
        self.run_task([version, self.versions[1]])
        self.assertTrue(self.worker.agent.leads[0]["needs_review"])
        self.assertEqual(self.worker.agent.leads[0]["passage_ids"], [])
        revised = self.call("synthesis.list", topic_id=self.topic)["items"][0]
        params.update(record_id=revised["record_id"], base_revision=wiki["revision"], item_ids=[revised["points"][0]["id"]])
        wiki = self.call("synthesis.review", **params)
        self.assertFalse(wiki["items"][0]["needs_review"])
        self.assertEqual(wiki["items"][0]["id"], point["id"])
        self.assertEqual(len(wiki["history"]), 1)

    def test_budget_keeps_read_pages_and_reports_missing_work(self):
        class BudgetReached(ScriptedSynthesis):
            def synthesize(self, *args, **kwargs):
                _, seen, trace, usage, _ = super().synthesize(*args, **kwargs)
                return {}, seen, trace, usage, {
                    "reason": "TASK_BUDGET_EXHAUSTED", "retryable": False, "next_action": "adjust_budget",
                }

        self.worker.agent = BudgetReached(self.workspace.name)
        terminal = self.run_task(self.versions)
        self.assertEqual(terminal["issue"]["reason"], "TASK_BUDGET_EXHAUSTED")
        record = self.call("synthesis.list", topic_id=self.topic)["items"][0]
        self.assertEqual(record["points"], [])
        self.assertEqual(len(record["read_anchor_ids"]), 2)
        self.assertTrue(any("budget" in gap for gap in record["gaps"]))
        for anchor in record["read_anchor_ids"]:
            item = self.call("evidence.open", topic_id=self.topic, anchor_id=anchor)
            self.assertEqual(item["source"]["passages"][0]["page"], 1)

    def test_conflict_is_preserved_in_an_aligned_comparison(self):
        from literature import synthesis_result

        left, right = self.versions
        matches = {axis: {"match": "same", "detail": "Same experimental condition"}
                   for axis in ("task", "dataset", "split", "metric", "setting")}
        originals = {"one": {"source_version_id": left, "text": "The treatment improved the outcome."},
                     "two": {"source_version_id": right, "text": "The treatment worsened the outcome."}}
        a = {"id": "one", "quote": originals["one"]["text"]}
        b = {"id": "two", "quote": originals["two"]["text"]}
        raw = {"relations": [
            {"kind": "conflicts", "from": left, "to": right, "subject": "Same outcome in two experiments.",
             "comparability": "comparable", "alignment": matches, "from_evidence": [a], "to_evidence": [b]},
        ]}
        result = synthesis_result(raw, originals, self.versions, {}, lambda passage, quote: quote)
        self.assertEqual(result["relations"][0]["status"], "disputed")
        self.assertEqual(result["relations"][0]["anchor_ids"], [a["quote"], b["quote"]])
        matches["split"]["match"] = "unknown"
        result = synthesis_result(raw, originals, self.versions, {}, lambda passage, quote: quote)
        self.assertEqual(result["relations"][0]["comparability"], "unclear")
        self.assertEqual(result["relations"][0]["kind"], "compares")

    def test_focused_comparison_and_revision(self):
        self.run_task(self.versions, "paper_comparison")
        record = self.call("comparison.list", topic_id=self.topic)["items"][0]
        self.assertEqual(len(record["cells"]), 4)
        self.assertTrue(all(cell["anchor_ids"] for cell in record["cells"]))
        record["cells"][0]["text"] = "Corrected reading by a reviewer."
        saved = self.call("comparison.save", topic_id=self.topic, comparison_id=record["comparison_id"],
                          base_revision=record["revision"], cells=record["cells"])
        self.assertEqual(saved["cells"][0]["text"], "Corrected reading by a reviewer.")
        self.assertEqual(len(saved["history"]), 1)
