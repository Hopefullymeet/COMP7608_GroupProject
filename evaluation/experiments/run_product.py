"""Run the submitted worker on one isolated pilot case per workspace."""
import argparse
import hashlib
import json
import sys
import tempfile
import textwrap
import unicodedata
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
APP = HERE.parents[1]
DATA = APP / "data-preparation"
sys.path.insert(0, str(APP / "backend"))
from worker_rpc import call
from model_agent import ModelAgent
from papertrace import Worker
from test_citations import make_pdf


def load(path):
    return json.loads(path.read_text(encoding="utf8"))


class Meter(ModelAgent):
    def __init__(self, workspace):
        super().__init__(workspace)
        self.requests = []

    def completion(self, *args, **kwargs):
        entry = {"model": self.model, "usage": None}
        self.requests.append(entry)
        result = super().completion(*args, **kwargs)
        entry["usage"] = result[1] or None
        return result


def run_task(worker, topic, kind, body, session=None):
    params = dict(topic_id=topic, kind=kind, input=body)
    if session:
        params["session_id"] = session
    confirmation = call(worker, "task.prepare", **params)["confirmation_id"]
    task = call(worker, "task.start", confirmation_id=confirmation, **params)["task_id"]
    start = time.monotonic()
    while time.monotonic() - start < 300:
        snapshot = call(worker, "task.get", task_id=task)
        if snapshot["status"] not in ("queued", "running"):
            break
        time.sleep(.15)
    else:
        call(worker, "task.cancel", task_id=task)
        raise TimeoutError("Evaluation deadline reached")
    history = call(worker, "task.history", topic_id=topic)["items"]
    row = next(r for r in history if r["task_id"] == task)
    return dict(snapshot=snapshot, seconds=round(time.monotonic()-start, 3), steps=row["steps"])


def product(worker, case, manifest):
    inp = case["input"]
    paper_id, = inp["allowed_paper_ids"]
    paper = manifest[paper_id]
    topic = call(worker, "topic.create", title=case["topic"])["topic_id"]
    question = inp["question_or_draft"]
    source = None
    if not inp.get("fixture"):
        if inp["reading_scope"] == "provided_passages":
            # Expose only the supplied excerpt, keeping the original page in the case input.
            lines = [line for p in inp["passages"] for line in textwrap.wrap(unicodedata.normalize("NFKC", p["text"]), 78)]
            params = dict(name=paper_id+".pdf", content=make_pdf(*lines))
        else:
            params = dict(path=str(DATA / paper["pdf_path"]))
        source = call(worker, "library.import_pdf", topic_id=topic, **params)
    if case["task_type"] == "reading_qa":
        session = call(worker, "session.create", topic_id=topic)["session_id"]
        body = {"question": question, "sources": [{k: source[k] for k in ("paper_id","source_version_id")}]}
        body["sources"][0]["requested_scope"] = "full_text"
        row = run_task(worker, topic, "reading_qa", body, session)
        items = (row["snapshot"].get("result") or {}).get("sentences", [])
    else:
        lines = [*textwrap.wrap(question.rstrip(".")+" [1].", 78),
                 "References", *textwrap.wrap("[1] "+paper["authors"][0]+". "+paper["title"]+".", 78)]
        draft = call(worker, "draft.import", topic_id=topic, name="case.pdf", content=make_pdf(*lines))
        v = draft["versions"][0]
        target = dict(draft_id=draft["draft_id"], version_id=v["version_id"])
        sid, = [s["id"] for s in v["sentences"] if s["cites"] == ["1"]]
        if source:
            call(worker, "draft.resolve_reference", topic_id=topic, **target, ref_key="1", paper_id=source["paper_id"])
        body = dict(**target, sentence_ids=[sid], source_versions=[source["source_version_id"]] if source else [])
        row = run_task(worker, topic, "citation_audit", body)
        reports = call(worker, "draft.list", topic_id=topic)["items"][0]["versions"][0]["reports"]
        items = [claim for report in reports for finding in report["findings"] for claim in finding["claims"]]
    row["items"] = items
    row["evidence"] = {}
    for item in items:
        for aid in item.get("anchor_ids", []):
            hit = call(worker, "evidence.open", topic_id=topic, anchor_id=aid)
            row["evidence"][aid] = dict(quote=hit["quote"], passages=hit["source"]["passages"],
                correct_version=bool(source and hit["source"]["source_version_id"] == source["source_version_id"]))
    return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", action="append")
    parser.add_argument("--missing-only", action="store_true")
    parser.add_argument("--rounds", type=int, default=2)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    manifest = {p["paper_id"]:p for p in load(DATA/"manifest.json")}
    inputs = (DATA/"review/task_inputs.jsonl").read_text(encoding="utf8").splitlines()
    cases = [c for c in map(json.loads,inputs) if c["task_type"] in ("reading_qa","citation_check")]
    if args.case:
        cases = [c for c in cases if c["case_id"] in args.case]
        if set(args.case) != {c["case_id"] for c in cases}:
            parser.error("Unknown case ID")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256((APP/"backend"/"model_agent.py").read_bytes()).hexdigest()
    done = set()
    if args.output.exists():
        done = {(r["case_id"],r["repeat"]) for r in map(json.loads,args.output.read_text(encoding="utf8").splitlines())}
    for repeat in range(1,args.rounds+1):
        for case in cases:
            missing = bool(case["input"].get("fixture"))
            if missing and repeat > 1 or args.missing_only and not missing or (case["case_id"],repeat) in done:
                continue
            with tempfile.TemporaryDirectory() as directory:
                worker = Worker(Path(directory), lambda _: None)
                try:
                    meter = Meter(directory)
                    worker.agent = meter
                    if not missing and not meter.key:
                        raise SystemExit("PaperTrace model credential unavailable")
                    config = worker.service_settings()
                    if config["model"] != "deepseek-flash" or config["endpoint"].rstrip("/") not in ("https://api.deepseek.com", "https://api.deepseek.com/v1"):
                        raise RuntimeError("Expected the configured DeepSeek Flash service")
                    if worker.reviewer_config()["enabled"]:
                        raise SystemExit("Disable optional reviewer for comparable primary-model metering")
                    row = dict(case_id=case["case_id"], repeat=repeat, task=case["task_type"], scope=case["input"]["reading_scope"],
                        model=config["model"], date=datetime.now(timezone.utc).isoformat(), model_agent_sha256=digest)
                    try:
                        row.update(product(worker, case, manifest))
                    except Exception as err:
                        row["runner_error"] = type(err).__name__+": "+str(err)
                    row["requests"] = meter.requests
                    with args.output.open("a", encoding="utf8") as stream:
                        stream.write(json.dumps(row, ensure_ascii=False)+"\n")
                    print(case["case_id"],repeat,row.get("runner_error") or row["snapshot"]["status"],flush=True)
                    if "runner_error" in row:
                        raise SystemExit(1)
                finally:
                    worker.close()


if __name__ == "__main__":
    main()
