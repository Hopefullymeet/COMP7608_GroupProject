"""Reader regressions for version geometry, localized visual search and PDF export."""

import base64
from pathlib import Path
import tempfile
import time
import unittest

from evaluate_synthesis import call
from literature import LiteratureError
from papertrace import Worker
from reader import pdf_engine


class ReaderTest(unittest.TestCase):
    def setUp(self):
        try:
            self.engine = pdf_engine()
        except LiteratureError:
            self.skipTest("Optional PDF layout engine is missing")
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.worker = Worker(Path(directory.name), lambda _: None)
        self.addCleanup(self.worker.close)
        self.topic = call(self.worker, "topic.create", title="Reader fixture")["topic_id"]

    def pdf(self, caption, flow):
        doc = self.engine.open()
        page = doc.new_page()
        if flow:
            for i, color in enumerate(((1, 0, 0), (0, 0, 1), (0, .8, 0))):
                x = 100 + 100 * i
                page.draw_rect(self.engine.Rect(x, 100, x + 90, 170), color=color, fill=color)
                page.draw_line(self.engine.Point(x + 30, 172), self.engine.Point(x + 30, 195), color=color)
                page.draw_circle(self.engine.Point(x + 30, 201), 7, color=color, fill=color)
            page.insert_text((110, 148), "Retrieval", fontsize=11)
        else:
            page.draw_rect(self.engine.Rect(110, 100, 390, 210), color=(0, 0, 0))
        page.insert_text((100, 240), caption)
        content = doc.tobytes()
        doc.close()
        return base64.b64encode(content).decode("ascii")

    def test_local_search_annotation_export_and_topic_boundary(self):
        original = self.pdf("Figure 1: Overview of the experiment.", True)
        correct = call(self.worker, "library.import_pdf", topic_id=self.topic, name="Flow.pdf", content=original)
        other = call(self.worker, "library.import_pdf", topic_id=self.topic, name="Results.pdf",
                     content=self.pdf("Figure 1: Evaluation scores.", False))
        matches = call(self.worker, "visual.search", topic_id=self.topic,
                       source_versions=[other["source_version_id"], correct["source_version_id"]],
                       query="有不同颜色的几个框，描述怎么检索")
        obj = matches["items"][0]
        self.assertEqual(obj["source_version_id"], correct["source_version_id"])
        self.assertEqual(obj["match_kind"], "region")
        target = {"topic_id": self.topic, "source_version_id": obj["source_version_id"]}
        crop = call(self.worker, "visual.crop", **target, page=1, rect=obj["rect"])
        self.assertTrue(base64.b64decode(crop["image"]).startswith(b"\x89PNG"))
        mark = call(self.worker, "reader.mark_save", **target, page=1, kind="region",
                    rects=[obj["rect"]], note="A note kept outside the original file.")
        self.assertEqual(call(self.worker, "reader.marks", **target)["items"][0], mark)
        with self.assertRaisesRegex(LiteratureError, "Reload"):
            call(self.worker, "reader.mark_delete", **target, mark_id=mark["mark_id"], base_revision="old")
        duplicate = call(self.worker, "reader.export", **target)
        with self.engine.open(stream=base64.b64decode(duplicate["content"]), filetype="pdf") as annotated:
            self.assertIn("kept outside", next(annotated[0].annots()).info["content"])
        self.assertEqual(call(self.worker, "reader.pdf", **target)["content"], original)
        saved = call(self.worker, "reader.mark_to_wiki", **target, mark_id=mark["mark_id"])
        wiki = call(self.worker, "synthesis.wiki", topic_id=self.topic)["items"]
        item = next(item for item in wiki if item["id"] == saved["item_id"])
        evidence = call(self.worker, "evidence.open", topic_id=self.topic, anchor_id=item["anchor_ids"][0])
        self.assertEqual(evidence["region"], {"page": 1, "rect": obj["rect"]})
        outside = call(self.worker, "topic.create", title="Other topic")["topic_id"]
        with self.assertRaises(Exception):
            call(self.worker, "visual.crop", **{**target, "topic_id": outside}, page=1, rect=obj["rect"])

    def test_figure_mention_without_detected_object_is_page_only(self):
        paper = call(self.worker, "library.import_pdf", topic_id=self.topic, name="Mention.pdf",
                     content=self.pdf("The architecture in Figure 9 explains the checkpoint recovery decisions.", False))
        result = call(self.worker, "visual.search", topic_id=self.topic,
                      source_versions=[paper["source_version_id"]], query="checkpoint recovery graph")
        self.assertEqual([(r["page"], r["match_kind"], r["rect"]) for r in result["items"]],
                         [(1, "page", [0, 0, 1, 1])])

    def test_selected_text_question_sends_only_the_region(self):
        original = self.pdf("Figure 1: Overview of the experiment.", True)
        paper = call(self.worker, "library.import_pdf", topic_id=self.topic, name="Flow.pdf", content=original)
        version = paper["source_version_id"]
        model_inputs = []

        class ScopedModel:
            key = "fixture"

            def answer(self, question, sources, cancelled, context):
                model_inputs.extend(sources[0]["passages"])
                return [{"text": "The label refers to evidence retrieval."}], {}

        self.worker.dsh = ScopedModel()
        with self.engine.open(stream=base64.b64decode(original), filetype="pdf") as document:
            width, height = document[0].rect.width, document[0].rect.height
        selected = [102 / width, 136 / height, 180 / width, 155 / height]
        session = call(self.worker, "session.create", topic_id=self.topic)["session_id"]
        other_session = call(self.worker, "session.create", topic_id=self.topic)["session_id"]
        request = {"topic_id": self.topic, "session_id": session, "kind": "reader_question", "input": {
            "source_version_id": version, "page": 1, "rect": selected, "rects": [selected],
            "question": "What does this label mean?", "medium": "text"}}
        prepare = call(self.worker, "task.prepare", **request)
        self.assertEqual(prepare["transfers"][0]["data_categories"], ["Only the selected text and the question"])
        task_id = call(self.worker, "task.start", **request, confirmation_id=prepare["confirmation_id"])["task_id"]
        for _ in range(150):
            task = call(self.worker, "task.get", task_id=task_id)
            if task["status"] not in ("queued", "running"):
                break
            time.sleep(.02)
        self.assertEqual(task["status"], "completed")
        self.assertEqual([p["text"] for p in model_inputs], ["Retrieval"])
        answer = call(self.worker, "reader.answers", topic_id=self.topic)["items"][0]
        self.assertEqual(answer["rect"], selected)
        self.assertEqual(answer["source_excerpt"], "Retrieval")
        self.assertEqual(call(self.worker, "reader.answers", topic_id=self.topic, session_id=session)["items"], [answer])
        self.assertEqual(call(self.worker, "reader.answers", topic_id=self.topic, session_id=other_session)["items"], [])

    def test_visual_descriptions_are_retryable_and_reused(self):
        paper = call(self.worker, "library.import_pdf", topic_id=self.topic, name="Flow.pdf",
                     content=self.pdf("Figure 1: Overview of the experiment.", True))
        version = paper["source_version_id"]
        reader = self.worker.reader
        reader.vision_model = "fixture"
        attempts = []

        def describe(image, prompt):
            attempts.append(image)
            if len(attempts) == 1:
                raise LiteratureError("VISION_UNAVAILABLE", "No answer")
            return "Tangerine rectangles"

        reader.vision = describe
        request = {"topic_id": self.topic, "kind": "visual_index", "input": {"source_version_id": version}}

        def index():
            prepare = call(self.worker, "task.prepare", **request)
            self.assertEqual(prepare["transfers"], [])
            task_id = call(self.worker, "task.start", **request, confirmation_id=prepare["confirmation_id"])["task_id"]
            for _ in range(150):
                task = call(self.worker, "task.get", task_id=task_id)
                if task["status"] not in ("queued", "running"):
                    return task
                time.sleep(.02)
            self.fail("Figure indexing did not finish.")

        first = index()
        self.assertEqual(first["status"], "partial")
        self.assertEqual(index()["result"]["indexed"], 1)
        self.assertEqual(index()["result"]["indexed"], 0)
        matches = call(self.worker, "visual.search", topic_id=self.topic, source_versions=[version], query="tangerine")
        self.assertEqual(matches["items"][0]["label"], "Figure 1")
        self.assertEqual(len(attempts), first["result"]["indexed"] + 2)
