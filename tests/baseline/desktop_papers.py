"""Paid end-to-end checks through the same worker RPC methods used by the desktop client."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import time

from paper_eval import DATA, Worker, call, lines


def exercise(case):
    inp = case["input"]
    with TemporaryDirectory() as work, closing(Worker(Path(work), lambda _: None)) as worker:
        topic = call(worker, "topic.create", title=case["case_id"])["topic_id"]
        sources = {}
        for pid in inp["allowed_paper_ids"]:
            path = Path(work) / (pid + ".pdf")
            path.symlink_to(DATA / "corpus" / pid / "paper.pdf")
            src = call(worker, "library.import_pdf", topic_id=topic, path=str(path))
            sources[src["source_version_id"]] = (src["paper_id"], pid)
        task = dict(topic_id=topic, kind=case["task_type"])
        question = inp["question_or_draft"]
        if case["task_type"] == "reading_qa":
            task["session_id"] = call(worker, "session.create", topic_id=topic)["session_id"]
            task["input"] = dict(question=question, sources=[
                dict(source_version_id=v, paper_id=ids[0], requested_scope="full_text") for v, ids in sources.items()])
        else:
            # These input questions explicitly list the dimensions as a comma-separated phrase.
            dimensions = question.split("in terms of ", 1)[1].split(". Can", 1)[0].split(", ")
            task["input"] = dict(question=question, source_versions=list(sources), dimensions=dimensions)
        start = time.monotonic()
        confirmation = call(worker, "task.prepare", **task)
        task_id = call(worker, "task.start", confirmation_id=confirmation["confirmation_id"], **task)["task_id"]
        while time.monotonic() - start < 300:
            state = call(worker, "task.get", task_id=task_id)
            if state["status"] not in ("queued", "running"):
                break
            time.sleep(.25)
        else:
            call(worker, "task.cancel", task_id=task_id)
            raise TimeoutError(case["case_id"])
        out = dict(case_id=case["case_id"], task=case["task_type"], status=state["status"],
                   issue=state.get("issue", {}).get("reason"), seconds=round(time.monotonic() - start, 2))
        result = state.get("result") or {}
        if case["task_type"] == "paper_comparison" and result.get("record_id"):
            items = call(worker, "comparison.list", topic_id=topic)["items"]
            rows = next(x["cells"] for x in items if x["comparison_id"] == result["record_id"])
        else:
            rows = result.get("sentences", [])
        out["rows"] = []
        for r in rows:
            anchors = []
            for aid in r.get("anchor_ids", []):
                opened = call(worker, "evidence.open", topic_id=topic, anchor_id=aid)
                version = opened["source"]["source_version_id"]
                passage = opened["source"]["passages"][0]
                anchors.append(dict(paper=sources[version][1], page=passage["page"], quote=opened["quote"],
                                    valid=bool(opened["quote"]) and opened["quote"] in passage["text"] and
                                    version == r.get("source_version_id", version)))
            out["rows"].append(dict(text=r["text"], state=r.get("status", r.get("assessment")),
                                    dimension=r.get("dimension"), anchors=anchors))
        return out


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--task", choices=("reading_qa", "paper_comparison"))
    args = parser.parse_args()
    cases = [c for c in lines("task_inputs.jsonl") if c["task_type"] in ("reading_qa", "paper_comparison")]
    if args.task:
        cases = [c for c in cases if c["task_type"] == args.task]
    with args.output.open("x") as out, ThreadPoolExecutor(6) as pool:
        for record in pool.map(exercise, cases):
            print(json.dumps(record, ensure_ascii=False), file=out, flush=True)
