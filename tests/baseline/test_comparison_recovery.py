import json
from pathlib import Path
from threading import Event
import unittest
from unittest.mock import patch

from model_agent import ModelAgent


class ComparisonRecovery(unittest.TestCase):
    def test_truncated_response_recovers_only_verified_cells(self):
        runtime = ModelAgent(Path("."), "fixture")
        passage = {"source_version_id": "a", "passage_id": "pa", "page": 1, "text": "A uses lexical retrieval."}
        cell = {"dimension": "method", "version": "a", "text": passage["text"], "status": "evidenced",
                "evidence": [{"id": "pa", "quote": passage["text"]}]}
        response = {"cells": [cell, {**cell, "version": "b"}]}
        replies = [({"content": '{"cells":'}, {}, "length"), ({"content": json.dumps(response)}, {}, "stop")]
        with patch.object(runtime, "completion", side_effect=replies) as model:
            raw, _, _, _, issue = runtime.run("Compare methods.", Event(), fixed={"pa": passage},
                                              comparison_pairs={("method", "a"), ("method", "b")})
        self.assertIsNone(issue)
        self.assertEqual(model.call_count, 2)
        self.assertEqual(raw["cells"], [cell])
