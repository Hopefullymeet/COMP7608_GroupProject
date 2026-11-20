"""Regression coverage for offline citation navigation and PDF manuscript audits."""

import base64
from pathlib import Path
import tempfile
import threading
import time
import unittest

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

    def start(self, draft):
        v = draft["versions"][0]
        args = {"topic_id": self.topic, "kind": "citation_audit", "input": {
            "draft_id": draft["draft_id"], "version_id": v["version_id"],
            "sentence_ids": [s["id"] for s in v["sentences"]],
            "source_versions": [self.paper["source_version_id"], self.wrong["source_version_id"]],
        }}
        prepared = call(self.worker, "task.prepare", **args)
        started = call(self.worker, "task.start", **args, confirmation_id=prepared["confirmation_id"])
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            task = call(self.worker, "task.get", task_id=started["task_id"])
            if task["status"] not in ("queued", "running"):
                return prepared, task
            time.sleep(.015)
        self.fail("Audit did not finish.")

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
        self.worker.dsh = model
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
        self.worker.dsh = None
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
        call(self.worker, "draft.resolve_reference", **ref_target, ref_key=ref_key, paper_id=None)
        self.assertFalse(call(self.worker, "synthesis.wiki", topic_id=self.topic)["items"][0]["needs_review"])
        self.import_pdf("Dataset v2", "A benchmark for evidence attribution", "Jane Doe",
                        "An updated evaluation now examines smaller groups.", paper_id=self.paper["paper_id"])
        stale = call(self.worker, "draft.list", topic_id=self.topic)["items"][0]["versions"][0]["stale_sentence_ids"]
        self.assertEqual(set(stale), {s["id"] for s in version["sentences"][:2]})
        with self.assertRaisesRegex(Exception, "Check the current cited paper"):
            call(self.worker, "export.create", **target, format="bibliography", item_ids=[findings[0]["finding_id"]])
