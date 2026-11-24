"""Reader regressions for version geometry, localized visual search and PDF export."""

import base64
from pathlib import Path
import tempfile
import time
import unittest

from model_agent import failure
from evaluate_synthesis import call
from literature import LiteratureError
from papertrace import RpcError, Worker
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

    def test_translation_consent_selection_partial_page_retry_and_cache(self):
        with self.engine.open() as doc:
            page = doc.new_page()
            page.insert_text((72, 80), "Evidence retrieval")
            page.insert_text((72, 140), "Private paragraph outside selection")
            second = doc.new_page()
            second.insert_text((72, 80), "Second page contribution")
            content = base64.b64encode(doc.tobytes()).decode("ascii")
        paper = call(self.worker, "library.import_pdf", topic_id=self.topic, name="Translation.pdf", content=content)
        version = paper["source_version_id"]
        inputs = []
        failures = {"Second page contribution"}

        class Model:
            key = "local-test"

            def translate(self, units, language, glossary, cancelled):
                excerpt = [unit["source"] for unit in units]
                inputs.append((excerpt, language, glossary))
                if failures.intersection(excerpt):
                    raise failure()
                return {unit["id"]: "译文 " + unit["source"] for unit in units}

        self.worker.agent = Model()
        common = {"topic_id": self.topic, "kind": "reader_translation"}
        target = {"source_version_id": version, "target_language": "zh-CN", "glossary": {"Evidence": "证据"}}
        selection = {**common, "input": {**target, "page": 1, "rects": [[.10, .07, .40, .11]]}}

        def prepare(request):
            return call(self.worker, "task.prepare", **request)

        def run(request, prepared):
            task_id = call(self.worker, "task.start", confirmation_id=prepared["confirmation_id"], **request)["task_id"]
            for _ in range(150):
                task = call(self.worker, "task.get", task_id=task_id)
                if task["status"] not in ("queued", "running"):
                    return task
                time.sleep(.02)
            self.fail("Translation did not finish.")

        consent = prepare(selection)
        self.assertEqual(len(consent["transfers"]), 1)
        self.assertEqual(consent["source_versions"], [version])
        self.assertEqual(consent["translation_scope"], {"target_language": "zh-CN", "glossary": {"Evidence": "证据"},
                                                        "pages": [{"page": 1, "status": "pending"}]})
        tampered = {**selection, "input": {**selection["input"], "target_language": "ja"}}
        with self.assertRaises(RpcError) as denied:
            run(tampered, consent)
        self.assertEqual(denied.exception.issue["reason"], "CONFIRMATION_REQUIRED")
        self.assertEqual(inputs, [])
        self.assertEqual(run(selection, consent)["status"], "completed")
        self.assertEqual(inputs, [(["Evidence retrieval"], "zh-CN", {"Evidence": "证据"})])
        scope = {"topic_id": self.topic, "source_version_id": version, "page": 1}
        record, = call(self.worker, "reader.translations", **scope)["items"]
        self.assertEqual(record["scope"], "selection")
        self.assertEqual(record["glossary"], target["glossary"])
        self.assertEqual(call(self.worker, "reader.translations", **scope,
                              translation_id=record["translation_id"])["items"], [record])
        self.assertEqual(record["segments"][0]["rects"], selection["input"]["rects"])
        cached = prepare(selection)
        self.assertEqual(cached["transfers"], [])
        self.assertEqual(cached["translation_scope"]["pages"], [{"page": 1, "status": "cached"}])
        self.assertTrue(run(selection, cached)["result"]["pages"][0]["cached"])

        pages = {**common, "input": {**target, "pages": [1, 2]}}
        first = run(pages, prepare(pages))
        self.assertEqual(first["status"], "partial")
        self.assertEqual(first["issue"]["details"]["pages"][0]["page"], 2)
        failures.clear()
        results = run(pages, prepare(pages))["result"]["pages"]
        self.assertEqual([(row["page"], row["cached"]) for row in results], [(1, True), (2, False)])
        self.assertEqual(sum("Private paragraph outside selection" in text for text, _, _ in inputs), 1)
        self.assertEqual(len(call(self.worker, "reader.translations", **scope)["items"]), 2)
        other = call(self.worker, "topic.create", title="Other")["topic_id"]
        with self.assertRaises(RpcError) as denied:
            call(self.worker, "reader.translations", **{**scope, "topic_id": other})
        self.assertEqual(denied.exception.issue["reason"], "NOT_FOUND")

    def test_embedded_notes_retain_rotated_page_location_and_original_bytes(self):
        with self.engine.open() as doc:
            page = doc.new_page()
            page.insert_text((72, 90), "Research evidence")
            mark = page.add_highlight_annot(page.search_for("Research evidence", quads=True))
            mark.set_info(title="Reader", content="Check the source")
            mark.update()
            page.set_rotation(90)
            doc.new_page()
            content = base64.b64encode(doc.tobytes()).decode("ascii")

        paper = call(self.worker, "library.import_pdf", topic_id=self.topic, name="Annotated.pdf", content=content)
        args = {"topic_id": self.topic, "source_version_id": paper["source_version_id"]}
        result = call(self.worker, "reader.embedded_marks", **args, page=1)
        self.assertFalse(result["truncated"])
        self.assertEqual(len(result["items"]), 1)
        annotation = result["items"][0]
        self.assertEqual(annotation["kind"], "Highlight")
        self.assertEqual(annotation["quote"], "Research evidence")
        self.assertEqual(annotation["note"], "Check the source")
        self.assertEqual(annotation["author"], "Reader")
        self.assertEqual(len(annotation["rects"]), 1)
        left, top, right, bottom = annotation["rects"][0]
        self.assertTrue(0.8 < left < right <= 1)
        self.assertTrue(0 <= top < bottom < 0.5)
        self.assertEqual(call(self.worker, "reader.embedded_marks", **args, page=2)["items"], [])
        other = call(self.worker, "topic.create", title="Outside")["topic_id"]
        with self.assertRaises(RpcError) as failure:
            call(self.worker, "reader.embedded_marks", **{**args, "topic_id": other}, page=1)
        self.assertEqual(failure.exception.issue["reason"], "NOT_FOUND")
        self.assertEqual(call(self.worker, "reader.marks", **args)["items"], [])
        self.assertEqual(call(self.worker, "reader.pdf", **args)["content"], content)

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

    def test_figure_lookup_turn_returns_original_region_and_rejects_unknown_ids(self):
        topic = self.topic
        source = call(self.worker, "library.import_pdf", topic_id=topic, name="Flow.pdf",
                      content=self.pdf("Figure 1: Retrieval pipeline.", True))
        version = source["source_version_id"]
        figure = call(self.worker, "visual.objects", topic_id=topic, source_version_id=version)["items"][0]
        session = call(self.worker, "session.create", topic_id=topic)["session_id"]
        params = dict(topic_id=topic, session_id=session, kind="reading_qa", input={
            "question": "有没有讲检索流程的图？", "figure_lookup_only": True,
            "figure_refs": [{"version": version, "id": figure["object_id"]}],
            "sources": [{"source_version_id": version, "paper_id": source["paper_id"], "requested_scope": "full_text"}]})
        prepared = call(self.worker, "task.prepare", **params)
        task = call(self.worker, "task.start", confirmation_id=prepared["confirmation_id"], **params)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            with self.worker.lock:
                turns = self.worker.get("session", session)["turns"]
            if turns:
                break
            time.sleep(.02)
        self.assertEqual(turns[0]["task_id"], task["task_id"])
        self.assertEqual(turns[0]["answer"]["figures"][0]["rect"], figure["rect"])
        params["input"]["figure_refs"][0]["id"] = "unknown"
        with self.assertRaises(RpcError):
            call(self.worker, "task.prepare", **params)

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

        self.worker.agent = ScopedModel()
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

        # A large document takes more than one task; the next task reuses completed descriptions.
        reader.objects = lambda *_: [{"object_id": f"batch-{i}", "kind": "figure", "page": 1, "rect": []}
                                     for i in range(25)]
        reader.crop = lambda *_: (None, b"image")
        batch = index()
        self.assertEqual(batch["status"], "partial")
        self.assertEqual(batch["issue"]["reason"], "VISUAL_BATCH_REMAINING")
        self.assertEqual((batch["result"]["indexed"], batch["result"]["remaining"]), (24, 1))
        final = index()
        self.assertEqual(final["status"], "completed")
        self.assertEqual((final["result"]["indexed"], final["result"]["remaining"]), (1, 0))
        self.assertEqual(index()["result"]["indexed"], 0)
