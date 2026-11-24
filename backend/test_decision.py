from contextlib import closing
import json
from pathlib import Path
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Event, Thread
import unittest
from unittest.mock import patch

from decision import Reviewer, request
from model_agent import ModelAgent
from papertrace import Worker


class ReviewFlow(unittest.TestCase):
    def test_http_contract(self):
        received = []
        class Endpoint(BaseHTTPRequestHandler):
            def do_POST(self):
                data = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                received.append(data)
                reply = {"answers": {"check": {"choice": "yes", "probabilities": {"yes": .9, "no": .1}}}}
                self.send_response(200)
                self.end_headers()
                self.wfile.write(json.dumps(reply).encode())

            def log_message(self, *args):
                pass

        with ThreadingHTTPServer(("127.0.0.1", 0), Endpoint) as server, patch("decision.store", return_value=None):
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                cfg = {"model": "fixture", "endpoint": f"http://127.0.0.1:{server.server_port}/v1/systemone"}
                criteria = {"yes": "Yes", "no": "No"}
                result = request(cfg, "sample", {"check": {"type": "choice", "criteria": criteria}})
                self.assertEqual(result["check"]["choice"], "yes")
                self.assertEqual(received[0]["model"], "fixture")
            finally:
                server.shutdown()
                thread.join()

    def test_rank_cache_and_configuration_change(self):
        with tempfile.TemporaryDirectory() as directory, closing(Worker(Path(directory), lambda _: None)) as worker:
            with patch.object(worker, "credential_status", return_value={"configured": False, "stored": False, "preview": None}):
                saved = worker.services_config()
                cfg = {"enabled": True, "endpoint": "http://localhost:19999/v1/systemone", "model": "test"}
                worker.save_services(dict(saved, base_revision=saved["revision"], reviewer=cfg))
            reviewer = Reviewer(worker, cfg, "topic")
            rows = [{"preview": "unrelated"}, {"preview": "direct evidence"}]
            with patch("decision.request", return_value={"candidate_0": {"noul": .1}, "candidate_1": {"noul": .9}}) as send:
                self.assertEqual(reviewer.rank("test", rows), rows[::-1])
                self.assertEqual(reviewer.rank("test", rows), rows[::-1])
                self.assertEqual(send.call_count, 1)
                with patch.object(worker, "reviewer_config", return_value=dict(cfg, enabled=False)):
                    self.assertEqual(reviewer.rank("test", rows), rows)
                    self.assertEqual(send.call_count, 1)
            with patch("decision.request", side_effect=OSError):
                self.assertEqual(reviewer.rank("new query", rows), rows)
                self.assertTrue(reviewer.failed)

    def test_one_revision_must_have_verified_quote(self):
        from unittest.mock import Mock
        passage = {"source_version_id": "v", "passage_id": "p", "text": "Tested on two images."}
        ref = {"quote": passage["text"], "passage": passage}
        agent = ModelAgent(Path("."), "fixture")
        for quote, accepted in [(passage["text"], True), ("unsupported quotation", False)]:
            with self.subTest(quote=quote):
                agent.reviewer = Mock()
                agent.reviewer.claim.side_effect = ["partial", "supported"]
                revised = {"revisions": [{"index": 0, "text": "Two images were tested.",
                                          "evidence": [{"id": "p", "quote": quote}]}]}
                claims = [{"text": "All images were tested.", "references": [ref], "wiki_reason": "result"}]
                with patch.object(agent, "completion", return_value=({"content": json.dumps(revised)}, {}, "stop")) as main:
                    result = agent.review_answer(claims, {"p": passage}, [], "How many?", Event())
                main.assert_called_once()
                self.assertEqual(bool(result[0]["references"]), accepted)
                if not accepted:
                    self.assertNotIn("wiki_reason", result[0])
