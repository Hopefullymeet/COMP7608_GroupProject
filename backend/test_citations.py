"""Regression coverage for offline citation navigation and PDF manuscript audits."""

from contextlib import ExitStack
import base64
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from citations import grobid_index, parse_document
from evaluate_synthesis import call
from literature import init_corpus, poppler
from papertrace import Worker


def make_pdf(*lines):
    commands = ["BT /F1 10 Tf 40 740 Td 18 TL"]
    for i, line in enumerate(lines):
        escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        commands.append(("T* " if i else "") + f"({escaped}) Tj")
    content = ("\n".join(commands) + "\nET").encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n%s\nendstream" % (len(content), content),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    data = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, item in enumerate(objects, 1):
        offsets.append(len(data))
        data.extend(b"%d 0 obj\n%s\nendobj\n" % (i, item))
    pointer = len(data)
    data.extend(b"xref\n0 6\n0000000000 65535 f \n" + b"".join(b"%010d 00000 n \n" % p for p in offsets))
    data.extend(b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % pointer)
    return base64.b64encode(data).decode()


class TestIndexer(unittest.TestCase):
    def test_empty_topic_draft_import_without_poppler_or_pypdf(self):
        with tempfile.TemporaryDirectory() as directory, ExitStack() as cleanup:
            root = Path(directory)
            (root / "pypdf.py").write_text("raise ImportError('unavailable')")
            worker = Worker(root, lambda _: None)
            cleanup.callback(worker.close)
            topic = call(worker, "topic.create", title="Empty topic")["topic_id"]
            path = root / "Draft.pdf"
            path.write_bytes(base64.b64decode(make_pdf("Draft title", "This method is cited [1].",
                                  "References", "[1] Jane Doe. 2020. A study of reference matching.")))
            with patch("literature.poppler", return_value=str(root / "missing-pdftotext")), patch.dict(
                    os.environ, PYTHONPATH=os.pathsep.join([directory, os.getenv("PYTHONPATH", "")])):
                draft = call(worker, "draft.import", topic_id=topic, path=str(path))
            version = draft["versions"][0]
            self.assertEqual(version["page_count"], 1)
            self.assertEqual(version["references"][0]["status"], "unmatched")
            self.assertEqual(version["sentences"][0]["cites"], ["1"])

    def test_author_year_and_index_only_mentions(self):
        result = parse_document(["Article\nAuthor\nThe dataset is reused (Doe et al., 2020).\nReferences\n"
                                 "Jane Doe, Alice North. 2020. A benchmark for evidence attribution. In Proceedings.\n"])
        self.assertEqual(len(result["references"]), 1)
        self.assertEqual(result["sentences"][0]["cites"], ["1"])
        self.assertEqual(result["references"][0]["mentions"][0]["page"], 1)

    def test_grobid_adapter_preserves_page(self):
        xml = """<TEI xmlns="http://www.tei-c.org/ns/1.0">
          <text><body><p><s>We use the evaluation task <ref type="bibr" target="#b1" coords="2,10,10,20,6">[1]</ref>.</s></p></body>
          <back><listBibl><biblStruct xml:id="b1"><analytic><title>A paper about evaluation tasks</title></analytic>
          <monogr><imprint><date when="2020"/></imprint></monogr></biblStruct></listBibl></back></text>
          </TEI>"""
        parsed = grobid_index(xml, {"page_count": 3})
        self.assertEqual(parsed["sentences"][0]["page"], 2)
        self.assertEqual(parsed["references"][0]["key"], "b1")
        self.assertEqual(parsed["references"][0]["mentions"][0]["page"], 2)


class TestCitationWorkflow(unittest.TestCase):
    def setUp(self):
        if poppler("pdftotext") == "pdftotext":
            import shutil
            if not shutil.which("pdftotext"):
                self.skipTest("Poppler required")
        context = tempfile.TemporaryDirectory()
        self.addCleanup(context.cleanup)
        self.dir = Path(context.name)
        self.worker = Worker(self.dir, lambda _: None)
        self.addCleanup(self.worker.close)
        self.topic = call(self.worker, "topic.create", title="Citation tests")["topic_id"]
        self.other = call(self.worker, "topic.create", title="Other topic")["topic_id"]
        self.paper = self.import_pdf("Dataset", "A benchmark for evidence attribution", "Jane Doe",
                                     "The evaluation uses human-checked citation evidence.")
        self.wrong = self.import_pdf("Unrelated", "A separate benchmark for retrieval speed", "Dana Roe",
                                      "This paper measures runtime and retrieval throughput.")
        self.draft_text = (
            "Claims in a draft", "Student Author",
            "The evaluation uses human-checked evidence [1].",
            "Human-checked evidence and full reproducibility were demonstrated [1].",
            "Human-checked evidence was evaluated in the throughput benchmark [2].",
            "A missing study corroborates the result [3].", "References",
            "[1] Jane Doe. 2020. A benchmark for evidence attribution.",
            "[2] Dana Roe. 2020. A separate benchmark for retrieval speed.",
            "[3] Sam Smith. 2024. A study outside the available corpus.",
        )

    def import_pdf(self, name, *lines, **params):
        return call(self.worker, "library.import_pdf", topic_id=self.topic,
                    name=name + ".pdf", content=make_pdf(*lines), **params)

    def import_draft(self):
        return call(self.worker, "draft.import", topic_id=self.topic, name="Draft.pdf", content=make_pdf(*self.draft_text))

    def test_suggestions_ground_unreferenced_clauses_and_recheck_changed_source(self):
        v1, v2 = (paper["source_version_id"] for paper in (self.paper, self.wrong))
        sources = [call(self.worker, "source.read", topic_id=self.topic, source_version_id=version)["passages"][0]
                   for version in (v1, v2)]
        first, second = "The evaluation uses human-checked evidence", "the throughput study measures runtime"
        sentence = f"{first}, while {second}, although independent replication remains to be shown."
        draft = call(self.worker, "draft.import", topic_id=self.topic, name="Draft.pdf", content=make_pdf(sentence))
        snapshot = draft["versions"][0]
        self.assertFalse(snapshot["sentences"])
        worker = self.worker
        target = {"topic_id": self.topic, "draft_id": draft["draft_id"], "version_id": snapshot["version_id"]}
        with worker.lock, worker.db:
            legacy = worker.get("pdf_draft", draft["draft_id"])
            legacy["versions"][0].pop("uncited_sentences")
            worker.put("pdf_draft", draft["draft_id"], legacy)
        restored = call(worker, "draft.prose", **target)["sentences"]
        self.assertEqual(restored, call(worker, "draft.prose", **target)["sentences"])
        sid = restored[0]["id"]

        class Model:
            key = "fixture"

            def suggest_citations(self, sentences, selected, cancelled, progress):
                assert {s["source_version_id"] for s in selected} == {v1, v2}
                progress("paper_read", "Read both permitted sources")
                seen = {p["passage_id"]: {"source_version_id": v} for p, v in zip(sources, (v1, v2))}
                return {"suggestions": [{"id": sentences[0]["id"], "claims": [
                    {"text": first, "status": "supported", "limit": "Human evaluation only", "evidence": [
                        {"id": sources[0]["passage_id"], "quote": "uses human-checked citation evidence."}]},
                    {"text": second, "status": "partial", "limit": "Separate throughput benchmark", "evidence": [
                        {"id": sources[1]["passage_id"], "quote": "measures runtime and retrieval throughput."},
                        {"id": sources[0]["passage_id"], "quote": "An invented quote has no passage match."}]},
                ]}]}, seen, [], {"model_steps": 1}, None

        self.worker.agent = Model()
        args = {"topic_id": self.topic, "kind": "citation_suggest", "input": {
            "draft_id": draft["draft_id"], "version_id": snapshot["version_id"], "sentence_ids": [sid],
            "source_versions": [v1, v2],
        }}
        prepared = call(worker, "task.prepare", **args)
        self.assertEqual(prepared["source_versions"], [v2, v1])
        task_id = call(worker, "task.start", **args, confirmation_id=prepared["confirmation_id"])["task_id"]
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            task = call(worker, "task.get", task_id=task_id)
            if task["status"] not in ("queued", "running"):
                break
            time.sleep(.015)
        self.assertEqual(task["status"], "completed", task)

        def current():
            return call(worker, "draft.list", topic_id=self.topic)["items"][0]["versions"][0]

        report = current()["reports"][0]
        finding = report["findings"][0]
        self.assertEqual([c["status"] for c in finding["claims"]],
                         ["supported", "partial", "evidence_not_established"])
        refs = [aid for claim in finding["claims"] for aid in claim["anchor_ids"]]
        self.assertEqual(len(refs), 2)
        evidence = call(worker, "evidence.open", topic_id=self.topic, anchor_id=refs[0])
        self.assertEqual(evidence["source"]["source_version_id"], v1)
        self.assertEqual(evidence["source"]["passages"][0]["page"], 1)
        target.update(report_id=report["report_id"])
        call(worker, "audit.review", **target, finding_id=finding["finding_id"], decision="accept")
        call(worker, "audit.save_to_wiki", **target, finding_id=finding["finding_id"])
        exported = call(worker, "export.create", **target, format="evidence", include_originals=False,
                        item_ids=[finding["finding_id"]])
        self.assertIn("independent replication", exported["files"][0]["text"])

        self.import_pdf("Dataset new", "New version with changed source.", paper_id=self.paper["paper_id"])
        revised = current()
        self.assertEqual(revised["stale_suggestion_sentence_ids"], [sid])
        self.assertEqual(revised["stale_sentence_ids"], [])
        self.assertTrue(call(worker, "synthesis.wiki", topic_id=self.topic)["items"][0]["needs_review"])
        self.assertEqual(call(worker, "evidence.open", topic_id=self.topic, anchor_id=refs[0])["quote"], evidence["quote"])

    def start(self, draft, **options):
        v = draft["versions"][0]
        args = {"topic_id": self.topic, "kind": "citation_audit", "input": {
            "draft_id": draft["draft_id"], "version_id": v["version_id"],
            "sentence_ids": [s["id"] for s in v["sentences"]],
            "source_versions": [self.paper["source_version_id"], self.wrong["source_version_id"]],
        }}
        args["input"].update(options)
        prepared = call(self.worker, "task.prepare", **args)
        started = call(self.worker, "task.start", **args, confirmation_id=prepared["confirmation_id"])
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            task = call(self.worker, "task.get", task_id=started["task_id"])
            if task["status"] not in ("queued", "running"):
                return prepared, task
            time.sleep(.015)
        self.fail("Audit did not finish.")

    def test_whole_manuscript_secondary_source_and_missing_original(self):
        statement = "The earlier study used human-checked evidence [1, 2]."
        review = self.import_pdf("Survey", "A survey of evidence retrieval methods", "Mary Lane",
                                 statement, "References", self.draft_text[-3],
                                 "[2] Sam Smith. 2024. A study outside the available corpus. doi:10.1234/missing")
        draft = call(self.worker, "draft.import", topic_id=self.topic, name="Author.pdf", content=make_pdf(
            "Assessing retrieval methods", "Student Author", "The evaluation used human-checked evidence [1].",
            "References", "[1] Mary Lane. 2022. A survey of evidence retrieval methods."))
        worker, topic = self.worker, self.topic
        versions = [review["source_version_id"], self.paper["source_version_id"]]
        excerpts = dict(zip(versions, [statement, "The evaluation uses human-checked citation evidence."]))
        class Model:
            key = "fixture"
            def audit(inner, checks, sources, cancelled, language=None):
                vid = sources[0]["source_version_id"]
                p = call(worker, "source.read", topic_id=topic, source_version_id=vid)["passages"][0]
                return {"checks": [{"id": "0", "status": "partial", "limit": "仅限此语料" if language == "zh-CN" else "Corpus only",
                                    "evidence": [{"id": p["passage_id"], "quote": excerpts[vid]}]}]}, {
                    p["passage_id"]: {"source_version_id": vid}}, [], {}, None

        worker.agent = Model()
        worker.topic_wiki.model = lambda: {"model": "fixture"}
        def reply(model, system, data, parse):
            if "records" in data:
                self.assertIn("current question", system)
                self.assertNotIn("in Simplified Chinese", system)
                self.assertNotIn("in English", system)
                return parse({"text": "The survey cites a prior study.", "anchor_ids": [
                    data["records"][0]["evidence"][0]["id"], "invented"]})
            return parse({"summary": "One original source is missing."})
        worker.topic_wiki.request = reply
        _, task = self.start(draft, whole_document=True, source_versions=versions)
        def report():
            return call(worker, "draft.list", topic_id=topic)["items"][0]["versions"][0]["reports"][0]
        finding = report()["findings"][0]
        chain = finding["chain"]
        self.assertEqual(len(chain), 3, (chain, report()))
        self.assertEqual(task["status"], "partial")
        self.assertEqual(chain[0]["version"], versions[0])
        self.assertEqual({node["version"] for node in chain[1:]}, {versions[1], None})
        chain = [chain[0], next(n for n in chain if n["version"] == versions[1]), next(n for n in chain if n["version"] is None)]
        self.assertEqual(chain[2]["link"], "https://doi.org/10.1234/missing")
        self.assertEqual(chain[1]["parent"], 0)
        self.assertTrue(chain[1]["anchor_ids"])
        for question, language in [("Which source was missing?", "zh-CN"), ("缺失的是哪篇文献？", "en")]:
            _, task = self.start(draft, whole_document=True, source_versions=versions, language=language,
                                 question=question, report_id=report()["report_id"])
            self.assertEqual(task["status"], "completed", task)
            self.assertEqual(report()["discussion"][-1]["question"], question)
        self.assertEqual(len(report()["discussion"][0]["anchor_ids"]), 1)
        added = self.import_pdf("Missing", "A study outside the available corpus", "Sam Smith",
                                "Persistent ID doi:10.1234/missing", "Replication used the same evidence labels.")
        self.assertTrue(report()["findings"][0]["needs_review"])
        new_version = added["source_version_id"]
        excerpts[new_version] = "Replication used the same evidence labels."
        _, task = self.start(draft, whole_document=True, source_versions=[*versions, new_version])
        self.assertEqual(task["status"], "completed", task)
        self.assertIn(new_version, [n["version"] for n in report()["findings"][0]["chain"]])
        self.assertFalse(report()["findings"][0]["needs_review"])
        self.assertFalse(call(worker, "draft.list", topic_id=self.other)["items"])

        old_id = report()["report_id"]
        self.start(draft, whole_document=True, source_versions=[*versions, new_version], language="zh-CN")
        self.assertEqual(report()["language"], "zh-CN")
        self.assertEqual(report()["findings"][0]["claims"][0]["limit"], "仅限此语料")
        history = call(worker, "audit.history")["items"]
        self.assertEqual(history[0]["report_id"], report()["report_id"])
        self.assertIn(old_id, [row["report_id"] for row in history])
        self.assertEqual(history[0]["version_id"], draft["versions"][0]["version_id"])

    def test_manuscript_reader_marks(self):
        draft = self.import_draft()
        scope = {"draft_id": draft["draft_id"], "source_version_id": draft["versions"][0]["version_id"], "topic_id": self.topic}
        self.assertTrue(call(self.worker, "reader.pdf", **scope)["content"])
        saved = call(self.worker, "reader.mark_save", **scope, kind="highlight", page=1,
                     rects=[[.2, .2, .4, .3]], quote="test")
        self.assertEqual(call(self.worker, "reader.marks", **scope)["items"], [saved])
        call(self.worker, "reader.mark_delete", **scope, mark_id=saved["mark_id"], base_revision=saved["revision"])
        self.assertEqual(call(self.worker, "reader.marks", **scope)["items"], [])

    def test_page_marks_keep_parallel_and_repeated_citations_at_their_own_locations(self):
        content = (Path(__file__).resolve().parents[1] / "docs/examples/CV-Citation-Check.pdf").read_bytes()
        draft = call(self.worker, "draft.import", topic_id=self.topic, name="CV.pdf",
                     content=base64.b64encode(content).decode())
        version = draft["versions"][0]
        page = call(self.worker, "draft.page", topic_id=self.topic, draft_id=draft["draft_id"],
                    version_id=version["version_id"], page=1)
        marks = page["marks"]
        self.assertEqual([m["label"] for m in marks], ["[1]", "[2]", "[3]", "[4]", "[1, 2]", "[2]", "[1]"])
        self.assertEqual(marks[4]["keys"], ["1", "2"])
        self.assertEqual(len(marks[4]["boxes"]), 1)
        self.assertEqual(len({m["sentence_id"] for m in marks}), 7)
        self.assertTrue(all(0 <= x < r <= 1 and 0 <= y < b <= 1
                            for m in marks for x, y, r, b in m["boxes"]))

    def test_offline_bidirectional_navigation_and_migration(self):
        citing = self.import_pdf("Citing", *self.draft_text)
        info = {"topic_id": self.topic, "source_version_id": citing["source_version_id"]}
        results = call(self.worker, "literature.refs", **info)["items"]
        self.assertEqual(results[0]["target_version_id"], self.paper["source_version_id"])
        self.assertEqual(len(results[0]["mentions"]), 2)
        incoming = call(self.worker, "literature.refs", topic_id=self.topic,
                        source_version_id=self.paper["source_version_id"], direction="incoming")["items"]
        self.assertEqual(incoming[0]["citing_version_id"], citing["source_version_id"])
        passages = call(self.worker, "source.read", **info)["passages"]
        with self.worker.lock, self.worker.db:
            self.worker.db.execute("DROP TABLE passage_lookup")
            init_corpus(self.worker.db)
        self.assertTrue(passages)
        self.assertEqual(call(self.worker, "source.read", **info)["passages"], passages)
        self.assertTrue(call(self.worker, "source.page", **info, page=1)["png"])
        with self.assertRaises(Exception):
            call(self.worker, "literature.refs", topic_id=self.other, source_version_id=info["source_version_id"])

    def test_pdf_audit_support_partial_unrelated_and_missing(self):
        first_version = self.paper["source_version_id"]
        context = call(self.worker, "source.read", topic_id=self.topic, source_version_id=first_version)["passages"][0]

        class Model:
            key = "fixture"
            calls = 0

            def audit(inner, checks, sources, cancelled, progress=None):
                inner.calls += 1
                seen = {context["passage_id"]: {"source_version_id": first_version}}
                statuses = ("supported", "partial", "evidence_not_established")
                checks = [{"id": j["id"], "status": status, "limit": "Specified corpus",
                           "evidence": [{"id": context["passage_id"], "quote": "uses human-checked citation evidence."}]}
                          for j, status in zip(checks, statuses)]
                return {"checks": checks}, seen, [], {"model_steps": 1}, None

        model = Model()
        self.worker.agent = model
        manuscript = self.import_draft()
        self.assertEqual(self.import_draft()["draft_id"], manuscript["draft_id"])
        self.assertTrue(call(self.worker, "draft.page", topic_id=self.topic, draft_id=manuscript["draft_id"],
                             version_id=manuscript["versions"][0]["version_id"], page=1)["png"])
        prepare, task = self.start(manuscript)
        self.assertEqual(task["status"], "partial")
        self.assertTrue(prepare["transfers"])
        current = call(self.worker, "draft.list", topic_id=self.topic)["items"][0]
        version = current["versions"][0]
        report = version["reports"][0]
        findings = report["findings"]
        self.assertEqual([f["claims"][0]["status"] for f in findings],
                         ["supported", "partial", "evidence_not_established", "blocked"])
        self.assertFalse(findings[2]["claims"][0]["anchor_ids"])
        target = {"topic_id": self.topic, "draft_id": current["draft_id"],
                  "version_id": version["version_id"], "report_id": report["report_id"]}
        for finding in findings[:2]:
            call(self.worker, "audit.review", **target, finding_id=finding["finding_id"], decision="accept")
        call(self.worker, "audit.save_to_wiki", **target, finding_id=findings[0]["finding_id"])
        wiki = call(self.worker, "synthesis.wiki", topic_id=self.topic)["items"]
        self.assertEqual(wiki[0]["anchor_ids"], findings[0]["claims"][0]["anchor_ids"])
        exported = call(self.worker, "export.create", **target, format="evidence", include_originals=False,
                        item_ids=[f["finding_id"] for f in findings[:2]])
        import re
        cite = re.search(r"\[@(pt\w+)\]", exported["files"][0]["text"])[1]
        self.assertIn("{" + cite + ",", exported["files"][1]["text"])
        self.assertIn("PDF p. 1", exported["files"][0]["text"])

        # Only the unchecked, unusable citation remains selected on a cached run.
        self.worker.agent = None
        current["versions"][0]["sentences"] = version["sentences"][:2]
        cached_prepare, cached = self.start(current)
        self.assertEqual(cached_prepare["transfers"], [])
        self.assertEqual(cached["status"], "completed")
        self.assertEqual(model.calls, 1)
        ref_target = {k: v for k, v in target.items() if k != "report_id"}
        ref_key = findings[0]["ref_key"]
        call(self.worker, "draft.resolve_reference", **ref_target, ref_key=ref_key, paper_id=self.wrong["paper_id"])
        with self.assertRaisesRegex(Exception, "Check the current cited paper"):
            call(self.worker, "audit.save_to_wiki", **target, finding_id=findings[0]["finding_id"])
        with self.assertRaisesRegex(Exception, "Check the current cited paper"):
            call(self.worker, "audit.review", **target, finding_id=findings[0]["finding_id"], decision="accept")
        with self.assertRaisesRegex(Exception, "Check the current cited paper"):
            call(self.worker, "export.create", **target, format="evidence", item_ids=[findings[0]["finding_id"]])
        wiki_after = call(self.worker, "synthesis.wiki", topic_id=self.topic)["items"]
        self.assertTrue(wiki_after[0]["needs_review"])
        scope_input = {"topic_id": self.topic, "input": {"source_versions": [
            first_version, self.wrong["source_version_id"]]}}
        _, leads = self.worker.research.scope(scope_input)
        stale_lead = next(item for item in leads if item["id"] == wiki_after[0]["id"])
        self.assertTrue(stale_lead["needs_review"])
        self.assertEqual(stale_lead["passage_ids"], [])

        one_sentence = {**current, "versions": [{**version, "sentences": version["sentences"][:1]}]}
        _, failed_check = self.start(one_sentence)
        self.assertEqual(failed_check["status"], "partial")
        self.assertIn(findings[0]["sentence_id"], call(self.worker, "draft.list", topic_id=self.topic)
                      ["items"][0]["versions"][0]["stale_sentence_ids"])

        new_context = call(self.worker, "source.read", topic_id=self.topic,
                           source_version_id=self.wrong["source_version_id"])["passages"][0]
        new_version = self.wrong["source_version_id"]

        class RecheckModel:
            key = "fixture"

            def audit(inner, checks, sources, cancelled, progress=None):
                self.assertEqual([c["source_version_id"] for c in checks], [new_version])
                return {"checks": [{"id": checks[0]["id"], "status": "evidence_not_established", "limit": "Different study",
                                    "evidence": [{"id": new_context["passage_id"],
                                                  "quote": "This paper measures runtime and retrieval throughput."}]}]}, {
                    new_context["passage_id"]: {"source_version_id": new_version}}, [], {}, None

        self.worker.agent = RecheckModel()
        _, rechecked = self.start(one_sentence)
        self.assertEqual(rechecked["status"], "completed")
        reports = call(self.worker, "draft.list", topic_id=self.topic)["items"][0]["versions"][0]
        self.assertNotIn(findings[0]["sentence_id"], reports["stale_sentence_ids"])
        self.assertIn(findings[1]["sentence_id"], reports["stale_sentence_ids"])
        self.assertTrue(reports["reports"][-1]["findings"][0]["needs_review"])
        call(self.worker, "draft.resolve_reference", **ref_target, ref_key=ref_key, paper_id=None)
        self.assertFalse(call(self.worker, "synthesis.wiki", topic_id=self.topic)["items"][0]["needs_review"])
        self.import_pdf("Dataset v2", "A benchmark for evidence attribution", "Jane Doe",
                        "An updated evaluation now examines smaller groups.", paper_id=self.paper["paper_id"])
        stale = call(self.worker, "draft.list", topic_id=self.topic)["items"][0]["versions"][0]["stale_sentence_ids"]
        self.assertEqual(set(stale), {s["id"] for s in version["sentences"][:2]})
        with self.assertRaisesRegex(Exception, "Check the current cited paper"):
            call(self.worker, "export.create", **target, format="bibliography", item_ids=[findings[0]["finding_id"]])
