"""Replay the desktop reading workflow with a scripted HTTP model on localhost."""
import argparse
from http.server import ThreadingHTTPServer
import json
import os
from pathlib import Path
import sys
import threading
import time
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "backend"))

from model_agent import ModelAgent
from test_literature import LiteratureTest
from test_model_research import ScriptedProvider


def replay(fixture, session, case):
    name = case["source"]
    paper = {"Alpha": fixture.a, "Beta": fixture.b}[name]
    version = paper["source_version_id"]
    query = dict(kind="reading_qa", topic_id=fixture.topic, session_id=session,
                 input={"question": case["question"], "sources": [{
                     "paper_id": paper["paper_id"], "source_version_id": version, "requested_scope": "full_text"}]})
    approval = fixture.call("task.prepare", **query)["confirmation_id"]
    task = fixture.call("task.start", confirmation_id=approval, **query)["task_id"]
    start = time.monotonic()
    while time.monotonic() - start < 60:
        state = fixture.call("task.get", task_id=task)
        if state["status"] not in ("queued", "running"):
            break
        time.sleep(.05)
    history = fixture.call("task.history", topic_id=fixture.topic)["items"]
    steps = next(row["steps"] for row in history if row["task_id"] == task)
    sentences = state.get("result", {}).get("sentences", [])
    anchors = []
    for sentence in sentences:
        for aid in sentence.get("anchor_ids", []):
            hit = fixture.call("evidence.open", topic_id=fixture.topic, anchor_id=aid)
            anchors.append({"page": hit["source"]["passages"][0]["page"], "quote": hit["quote"],
                            "within_selected_version": hit["source"]["source_version_id"] == version,
                            "verbatim": hit["quote"] in hit["source"]["passages"][0]["text"]})
    issue = state.get("issue", {}).get("reason")
    passed = state["status"] == case["expected_status"] and issue == case.get("expected_issue")
    if issue:
        passed = passed and not sentences
    else:
        passed = (passed and bool(anchors) and all(a["within_selected_version"] and a["verbatim"] for a in anchors)
                  and any(case.get("expected_quote") == a["quote"].strip() for a in anchors))
    return {"id": case["id"], "question": case["question"], "selected_paper": name,
            "steps": [{k: step[k] for k in ("title", "detail") if k in step} for step in steps],
            "status": state["status"], "issue": issue, "answers": [s["text"] for s in sentences],
            "anchors": anchors, "elapsed_seconds": round(time.monotonic() - start, 3), "passed": passed}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Write the observed results to this JSON file")
    args = parser.parse_args()
    os.environ["NO_PROXY"] = "127.0.0.1,localhost"
    # Use the private Node that the build downloads on machines without a native Node 24.
    private = list((ROOT / ".papertrace-build").glob("node-v24.*-*/node.exe" if os.name == "nt" else "node-v24.*-*/bin/node"))
    if private:
        os.environ["PAPERTRACE_NODE"] = str(private[0])
    fixture = LiteratureTest()
    try:
        # A saved desktop provider takes precedence over workspace settings.
        # Keep the replay on localhost even when the reader has configured one.
        fixture.enterContext(patch("papertrace.active_connection", return_value=None))
        fixture.enterContext(patch("papertrace.system_key", return_value=None))
        fixture.setUp()
        with ThreadingHTTPServer(("127.0.0.1", 0), ScriptedProvider) as provider:
            thread = threading.Thread(target=provider.serve_forever, daemon=True)
            thread.start()
            try:
                agent = ModelAgent(Path(fixture.workspace.name), "loopback-fixture")
                agent.endpoint = f"http://127.0.0.1:{provider.server_port}"
                fixture.worker.agent = agent
                fixture.worker.discovery_fixture = False
                config = fixture.call("services.get")
                revision = config.pop("revision")
                config["models"][0].update(endpoint=agent.endpoint, model="loopback-fixture")
                saved = fixture.call("services.save", base_revision=revision, **config)
                if saved["models"][0]["endpoint"] != agent.endpoint:
                    raise RuntimeError("Replay requires the loopback provider.")
                session = fixture.call("session.create", topic_id=fixture.topic)["session_id"]
                records = [replay(fixture, session, case) for case in json.loads((HERE / "cases.json").read_text())]
            finally:
                provider.shutdown()
                thread.join()
    finally:
        fixture.doCleanups()
    result = {"provider": "deterministic loopback fixture", "cases_passed": sum(r["passed"] for r in records),
              "cases_total": len(records), "traces": records}
    text = json.dumps(result, indent=2, ensure_ascii=False)
    if args.output:
        args.output.write_text(text + "\n", encoding="utf-8")
    print(text)
    return 0 if all(row["passed"] for row in records) else 1


if __name__ == "__main__":
    sys.exit(main())
