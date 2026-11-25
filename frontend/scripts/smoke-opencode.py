"""Run the desktop worker against a real OpenCode process and a local test model.

Requires opencode on PATH and PAPERTRACE_ACP_TEST_PDF pointing to the original PDF.
Only model decisions are scripted. OpenCode must discover and invoke both MCP tools.
"""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from threading import Thread
import unittest


def passages(content):
    if isinstance(content, str):
        return passages(json.loads(content))
    if isinstance(content, list):
        return [row for item in content for row in passages(item)]
    if isinstance(content, dict):
        if "passage_id" in content:
            return [content]
        if "text" in content:
            return passages(content["text"])
    return []


class Model(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        tools = [item["function"]["name"] for item in request.get("tools", [])]
        outputs = [m["content"] for m in request["messages"] if m["role"] == "tool"]
        call = None
        if not outputs:
            call = next((name for name in tools if name.endswith("paper_search")), None)
            args = {"query": "subsequent", "version": ""}
        elif len(outputs) == 1:
            call = next(name for name in tools if name.endswith("paper_read"))
            args = {"ids": [p["passage_id"] for p in passages(outputs[0]) if p.get("page") == 3][:4]}
        if call:
            delta = {"tool_calls": [{"index": 0, "id": f"call_{len(outputs)}", "type": "function",
                                     "function": {"name": call, "arguments": json.dumps(args)}}]}
        elif outputs:
            row = next(p for p in passages(outputs[-1]) if p.get("page") == 3 and "subsequent positions" in p["text"])
            evidence = [[{"id": row["passage_id"], "quote": "subsequent positions"}]]
            delta = {"content": "The decoder masks future positions.\n<<<EVIDENCE>>>\n" + json.dumps(evidence)}
        else:
            delta = {"content": "OK"}
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        for event, stop in [(delta, None), ({}, "tool_calls" if call else "stop")]:
            chunk = {"id": "fixture", "object": "chat.completion.chunk", "model": "fixture", "created": 1,
                     "choices": [{"index": 0, "delta": event, "finish_reason": stop}]}
            self.wfile.write(("data: " + json.dumps(chunk) + "\n\n").encode())
        self.wfile.write(b"data: [DONE]\n\n")


def main():
    if not Path(os.environ["PAPERTRACE_ACP_TEST_PDF"]).is_file():
        raise SystemExit("Missing acceptance PDF")
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
    with ThreadingHTTPServer(("127.0.0.1", 0), Model) as server, TemporaryDirectory() as tmp:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        for key in ("XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME"):
            os.environ[key] = str(Path(tmp) / key)
        os.environ["PAPERTRACE_ACP_LOCAL_TEST_MODEL"] = "1"
        config = Path(os.environ["XDG_CONFIG_HOME"]) / "opencode"
        config.mkdir(parents=True)
        provider = {"npm": "@ai-sdk/openai-compatible", "name": "Acceptance",
                    "options": {"baseURL": f"http://127.0.0.1:{server.server_port}/v1", "apiKey": "fixture"},
                    "models": {"fixture": {"name": "fixture"}}}
        (config / "opencode.json").write_text(json.dumps({"model": "acceptance/fixture",
            "small_model": "acceptance/fixture", "provider": {"acceptance": provider}}))
        try:
            suite = unittest.defaultTestLoader.loadTestsFromName("test_opencode_acp")
            return unittest.TextTestRunner().run(suite).wasSuccessful()
        finally:
            server.shutdown()
            thread.join()


if __name__ == "__main__":
    raise SystemExit(0 if main() else 1)
