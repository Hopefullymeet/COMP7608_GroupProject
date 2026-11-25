import base64
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import time
from unittest import TestCase, skipUnless
from uuid import uuid4

from opencode_acp import MARKER, resolve
from papertrace import Worker


class References(TestCase):
    def test_only_matching_read_passage_and_quote_get_anchor(self):
        passage = {"passage_id": "p3", "page": 3, "text": "prevent positions from attending to subsequent positions"}
        evidence = [[{"id": "p3", "quote": "prevent positions"}], [{"id": "other", "quote": "prevent positions"}],
                    [{"id": "p3", "quote": "permit positions"}]]
        claims = resolve("Supported\nWrong ID\nWrong quote\n" + MARKER + json.dumps(evidence), {"p3": passage})
        self.assertEqual([len(c["references"]) for c in claims], [1, 0, 0])
        self.assertFalse(resolve("No evidence", {})[0]["references"])


@skipUnless(os.getenv("PAPERTRACE_ACP_TEST_PDF"), "Requires OpenCode and the original Attention Is All You Need PDF")
class OpenCodeDesktopWorker(TestCase):
    @skipUnless(os.getenv("PAPERTRACE_ACP_LOCAL_TEST_MODEL"), "Requires the local acceptance model")
    def test_live_probe_cancel_and_disconnect(self):
        from subprocess import Popen
        from threading import Event
        from unittest.mock import patch
        from opencode_acp import client, ModelFailure, probe

        self.assertTrue(probe()["ok"])
        for mode in ("cancel", "disconnect"):
            with self.subTest(mode=mode), TemporaryDirectory() as cwd:
                children = []
                def start(args, **kwargs):
                    proc = Popen(args, **kwargs)
                    children.append(proc)
                    return proc
                stop = Event()
                with patch("opencode_acp.subprocess.Popen", start), self.assertRaises(ModelFailure) as failure:
                    with client(cwd, stop) as request:
                        sid = request("session/new", {"cwd": cwd, "mcpServers": []})["sessionId"]
                        if mode == "disconnect":
                            children[0].kill()
                            children[0].wait()
                        def on_update(event):
                            if event.get("sessionUpdate") == "agent_message_chunk":
                                stop.set()
                        request("session/prompt", {"sessionId": sid, "prompt": [{"type": "text", "text": "Reply OK"}]}, on_update)
                expected = "TASK_CANCELLED" if mode == "cancel" else "OPENCODE_DISCONNECTED"
                self.assertEqual(failure.exception.issue["reason"], expected)

    def test_attention_page_three(self):
        replies = {}
        def receive(msg):
            if "id" in msg:
                replies[msg["id"]] = msg
        with TemporaryDirectory() as directory:
            worker = Worker(Path(directory), receive)
            def call(method, **params):
                rid = uuid4().hex
                if method in worker.writes:
                    params["operation_id"] = rid
                worker.process({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
                reply = replies.pop(rid)
                self.assertIn("result", reply, reply)
                return reply["result"]
            try:
                topic = call("topic.create", title="Transformer")["topic_id"]
                config = call("services.get")
                call("services.save", **dict(config, reading_agent="opencode"), base_revision=config["revision"])
                session = call("session.create", topic_id=topic)["session_id"]
                config = call("services.get")
                call("services.save", **dict(config, reading_agent="builtin"), base_revision=config["revision"])
                self.assertEqual(call("session.get", topic_id=topic, session_id=session)["reading_agent"], "opencode")
                paper = call("library.import_pdf", topic_id=topic, name="Attention Is All You Need.pdf",
                             content=base64.b64encode(Path(os.environ["PAPERTRACE_ACP_TEST_PDF"]).read_bytes()).decode())
                args = dict(kind="reading_qa", session_id=session, topic_id=topic, input={
                    "question": "Can the decoder attend to subsequent positions? Quote the masking explanation from section 3.1.",
                    "sources": [dict(paper_id=paper["paper_id"], source_version_id=paper["source_version_id"], requested_scope="full_text")]})
                confirmation = call("task.prepare", **args)
                self.assertEqual(confirmation["transfers"][0]["endpoint"], "OpenCode")
                tid = call("task.start", **args, confirmation_id=confirmation["confirmation_id"])["task_id"]
                deadline = time.monotonic() + 330
                while time.monotonic() < deadline:
                    task = call("task.get", task_id=tid)
                    if task["status"] not in ("queued", "running"):
                        break
                    time.sleep(.2)
                self.assertEqual(task["status"], "completed", task.get("issue"))
                worker.close()
                worker = Worker(Path(directory), receive)
                reopened = call("session.get", topic_id=topic, session_id=session)
                self.assertEqual(reopened["reading_agent"], "opencode")
                self.assertEqual(reopened["turns"][-1]["answer"], task["result"])
                anchors = [a for s in task["result"]["sentences"] for a in s["anchor_ids"]]
                opened = [call("evidence.open", topic_id=topic, anchor_id=a) for a in anchors]
                self.assertTrue(any(p.get("page") == 3 and p["passage_id"] == anchor["passage_id"]
                                    and anchor["quote"] in p["text"] for anchor in opened for p in anchor["source"]["passages"]))
            finally:
                worker.close()


class TransportFailures(TestCase):
    def test_cancel_disconnect_and_auth_required(self):
        from subprocess import Popen
        from sys import executable
        from threading import Event
        from unittest.mock import patch
        from opencode_acp import client, ModelFailure

        # A subprocess exercises actual stdin/stdout framing and process cleanup on both OSes.
        program = """
import json, sys
from pathlib import Path
mode = sys.argv[1]
for line in sys.stdin:
    msg = json.loads(line)
    method = msg["method"]
    reply = {"jsonrpc":"2.0","id":msg.get("id")}
    if method == "initialize":
        reply["result"] = {"protocolVersion":1,"agentCapabilities":{"mcpCapabilities":{"http":True}}}
    elif method == "session/cancel":
        Path("cancel-seen").touch()
        break
    elif mode == "disconnect":
        break
    elif mode == "auth":
        reply["error"] = {"code":-32000,"message":"Authentication required"}
    else:
        continue
    print(json.dumps(reply),flush=True)
"""
        for mode, reason in (("cancel", "TASK_CANCELLED"), ("disconnect", "OPENCODE_DISCONNECTED"),
                             ("auth", "OPENCODE_LOGIN_REQUIRED")):
            with self.subTest(mode=mode), TemporaryDirectory() as cwd:
                def start(args, **kwargs):
                    return Popen([executable, "-u", "-c", program, mode], **kwargs)
                stop = Event()
                with patch("opencode_acp.executable", return_value=executable), patch("opencode_acp.subprocess.Popen", start):
                    with self.assertRaises(ModelFailure) as caught:
                        with client(cwd, stop) as request:
                            if mode == "cancel":
                                stop.set()
                            request("session/prompt", {"sessionId":"session", "prompt":[]})
                self.assertEqual(caught.exception.issue["reason"], reason)
                self.assertEqual((Path(cwd)/"cancel-seen").exists(), mode == "cancel")
