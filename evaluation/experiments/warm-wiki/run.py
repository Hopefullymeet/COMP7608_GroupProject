"""Real reading history, frozen workspace, fresh-session paired Wiki evaluation."""
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
import shutil
import sys
import tempfile
import time
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))
from run_product import Worker, Meter, call, run_task, DATA, load
from summarize import read

DESIGN = load(ROOT/"design.json")
OUT = ROOT/"results"


class LoggedMeter(Meter):
    def __init__(self, path):
        super().__init__(path)
        self.contexts = []

    def answer_full_text(self, question, sources, cancelled, memory=None, **kwargs):
        self.contexts.append(list(memory or []))
        return super().answer_full_text(question, sources, cancelled, memory=memory, **kwargs)


def opened(path):
    w = Worker(path,lambda _: None)
    cfg = w.service_settings()
    w.agent = LoggedMeter(path)
    if cfg["model"] != "deepseek-flash" or cfg["endpoint"].rstrip("/") not in ("https://api.deepseek.com","https://api.deepseek.com/v1") or not w.agent.key or w.reviewer_config()["enabled"]:
        w.close()
        raise RuntimeError("Expected authorized DeepSeek primary model with optional reviewer disabled")
    return w


def ask(w,topic,source,question):
    session = call(w,"session.create",topic_id=topic)["session_id"]
    body=dict(question=question,sources=[dict(paper_id=source["paper_id"],source_version_id=source["source_version_id"],requested_scope="full_text")])
    row=run_task(w,topic,"reading_qa",body,session)
    row.update(session=session,question=question,requests=w.agent.requests,contexts=w.agent.contexts,model="deepseek-flash")
    row["items"]=(row["snapshot"].get("result") or {}).get("sentences",[])
    row["evidence"]={}
    for item in row["items"]:
        for aid in item["anchor_ids"]:
            hit=call(w,"evidence.open",topic_id=topic,anchor_id=aid)
            row["evidence"][aid]=dict(quote=hit["quote"],pages=[p["page"] for p in hit["source"]["passages"]],
                verbatim=any(hit["quote"] in p["text"] for p in hit["source"]["passages"]),
                correct_version=hit["source"]["source_version_id"]==source["source_version_id"])
    return row


def freeze(paper,folder):
    folder.mkdir()
    w=opened(folder)
    try:
        topic=call(w,"topic.create",title="Reading log")["topic_id"]
        src=call(w,"library.import_pdf",topic_id=topic,path=str(DATA/"corpus"/paper/"paper.pdf"))
        seed=ask(w,topic,src,DESIGN["history_question"])
        # Store only a checked original excerpt as the prior finding.
        chosen=next((a for a,h in seed["evidence"].items() if h["verbatim"] and h["correct_version"]),None)
        if chosen is None:
            (OUT/(paper+"-seed-failed.json")).write_text(json.dumps(seed,ensure_ascii=False),encoding="utf8")
            raise RuntimeError("No verified seed finding for "+paper)
        call(w,"note.save",topic_id=topic,session_id=seed["session"],origin="answer",
             text=seed["evidence"][chosen]["quote"],anchor_ids=[chosen])
        note="Open for next session: "+DESIGN["cases"][paper][0]
        call(w,"wiki.edit",topic_id=topic,action="add",kind="open_question",text=note)
        deadline=time.monotonic()+45
        while w.topic_wiki.running and time.monotonic()<deadline:
            time.sleep(.1)
        if w.topic_wiki.running:
            raise RuntimeError("Wiki has pending writes")
        with w.lock,w.db:
            wiki=w.topic_wiki.load(topic)
        assert any(e["text"]==note and e["pinned"] for e in wiki["entries"])
        assert any(chosen in e["anchor_ids"] for e in wiki["entries"])
    finally:
        w.close()
    return dict(topic=topic,source=src,seed=seed,wiki=wiki,open_note=note,
                snapshot_sha256=hashlib.sha256((folder/"workspace.sqlite3").read_bytes()).hexdigest())


def paper_run(paper):
    folder=OUT/("snapshot-"+paper)
    setup=OUT/(paper+"-history.json")
    if setup.exists():
        meta=load(setup)
    else:
        meta=freeze(paper,folder)
        setup.write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding="utf8")
    source=meta["source"]
    output=OUT/(paper+"-trials.jsonl")
    done={(r["repeat"],r["task"],r["condition"]) for r in read(output)}
    control=next(r["input"]["question_or_draft"] for r in read(DATA/"review/task_inputs.jsonl") if r["case_id"]==paper+"_qa_001")
    for repeat in (1,2):
        for idx,(task,q) in enumerate([("followup",DESIGN["followup"]),("independent",control)]):
            order=("on","off") if (repeat+idx+list(DESIGN["cases"]).index(paper))%2 else ("off","on")
            for condition in order:
                if (repeat,task,condition) in done:
                    continue
                with tempfile.TemporaryDirectory() as tmp:
                    clone=Path(tmp)/"workspace"
                    shutil.copytree(folder,clone)
                    assert hashlib.sha256((clone/"workspace.sqlite3").read_bytes()).hexdigest()==meta["snapshot_sha256"]
                    w=opened(clone)
                    try:
                        if condition=="off":
                            with patch.object(w.topic_wiki,"reading_context",return_value=[]):
                                r=ask(w,meta["topic"],source,q)
                        else:
                            r=ask(w,meta["topic"],source,q)
                        r.update(paper=paper,condition=condition,repeat=repeat,task=task,snapshot_sha256=meta["snapshot_sha256"],date=datetime.now(timezone.utc).isoformat())
                        assert r["session"] != meta["seed"]["session"]
                        with output.open("a",encoding="utf8") as f:
                            f.write(json.dumps(r,ensure_ascii=False)+"\n")
                        print(paper,repeat,task,condition,r["snapshot"]["status"],flush=True)
                    finally:
                        w.close()


if __name__=="__main__":
    OUT.mkdir(exist_ok=True)
    with ProcessPoolExecutor(max_workers=6) as pool:
        list(pool.map(paper_run,DESIGN["cases"]))
