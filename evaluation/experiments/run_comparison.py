"""Evaluate the desktop Compare RPC on the three input-only pilot cases."""
from datetime import datetime, timezone
import json
import tempfile
from pathlib import Path
from run_product import DATA, HERE, Meter, Worker, call, load, run_task


def compare(case):
    inp = case["input"]
    question = inp["question_or_draft"]
    dims = question.split("in terms of ",1)[1].split(". Can",1)[0].split(", ")
    dims.append("Comparability of reported scores")
    with tempfile.TemporaryDirectory() as tmp:
        worker = Worker(Path(tmp), lambda _: None)
        try:
            meter = Meter(tmp)
            worker.agent = meter
            config = worker.service_settings()
            if config["model"] != "deepseek-flash" or config["endpoint"].rstrip("/") not in ("https://api.deepseek.com","https://api.deepseek.com/v1") or not meter.key or worker.reviewer_config()["enabled"]:
                raise RuntimeError("Expected configured DeepSeek primary model and disabled reviewer")
            topic = call(worker,"topic.create",title=case["topic"])["topic_id"]
            papers = {}
            for paper in inp["allowed_paper_ids"]:
                result = call(worker,"library.import_pdf",topic_id=topic,path=str(DATA/"corpus"/paper/"paper.pdf"))
                papers[result["source_version_id"]] = paper
            body = dict(source_versions=list(papers),question=question,dimensions=dims)
            row = run_task(worker,topic,"paper_comparison",body)
            row.update(input=body,papers=papers,requests=meter.requests,model=config["model"])
            row["records"] = call(worker,"comparison.list",topic_id=topic)["items"]
            row["evidence"] = {}
            for record in row["records"]:
                for cell in record["cells"]:
                    for anchor in cell["anchor_ids"]:
                        hit = call(worker,"evidence.open",topic_id=topic,anchor_id=anchor)
                        row["evidence"][anchor] = dict(quote=hit["quote"],paper=papers[hit["source"]["source_version_id"]],passages=hit["source"]["passages"])
            return row
        finally:
            worker.close()


if __name__ == "__main__":
    cases = [c for c in map(json.loads,(DATA/"review/task_inputs.jsonl").read_text(encoding="utf8").splitlines()) if c["task_type"]=="paper_comparison"]
    path=HERE/"results"/"app-comparison.jsonl"
    path.parent.mkdir(exist_ok=True)
    done={(r["case_id"],r["repeat"]) for r in map(json.loads,path.read_text(encoding="utf8").splitlines())} if path.exists() else set()
    for rnd in (1,2):
        for case in cases:
            if (case["case_id"],rnd) in done:
                continue
            date=datetime.now(timezone.utc).isoformat()
            row=compare(case)
            row.update(case_id=case["case_id"],repeat=rnd,date=date)
            with path.open("a",encoding="utf8") as f:
                f.write(json.dumps(row,ensure_ascii=False)+"\n")
            print(case["case_id"],rnd,row["snapshot"]["status"],flush=True)
