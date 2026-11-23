"""Catalog import, publication eligibility, and UI-facing metadata regression tests."""

import base64
import sqlite3
from pathlib import Path
import tempfile
import unittest
from uuid import uuid4

from papertrace import Worker
from test_literature import sample_pdf
from venue_ranks import csv_records, import_catalog, init_venue_ranks, lookup_rankings, pdf_venue


SOURCE = "https://example.test/catalog"


def entry(result, scheme):
    return next(item for item in result["items"] if item["scheme"] == scheme)


def journal(venue, value, codes="1932-6203", category=""):
    return {"venue": venue, "venue_type": "journal", "value": value, "issns": codes, "category": category}


class VenueRanksTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        init_venue_ranks(self.db)

    def test_multiple_categories_version_and_exact_issn(self):
        import_catalog(self.db, "jcr", "2024", 2024, SOURCE, [
            journal("Example Journal", "Q1", category="Biology"),
            journal("Example Journal", "Q2", category="Medicine"),
            journal("Same name mistake", "Q4", "1234-5679"),
        ])
        import_catalog(self.db, "jcr", "2025", 2025, SOURCE, [journal("Example Journal", "Q3")])
        metadata = {"venue": "Same name mistake", "issns": ["19326203"], "venue_type": "journal"}
        latest = entry(lookup_rankings(self.db, metadata), "jcr")
        self.assertEqual(latest["entries"][0]["value"], "Q3")
        old = entry(lookup_rankings(self.db, metadata, 2024), "jcr")
        self.assertEqual([(r["category"], r["value"], r["matched_by"]) for r in old["entries"]],
                         [("Biology", "Q1", "issn"), ("Medicine", "Q2", "issn")])
        self.assertEqual(old["source_url"], SOURCE)
        missing = entry(lookup_rankings(self.db, {**metadata, "issns": ["0378-5955"]}, 2024), "jcr")
        self.assertEqual(missing["status"], "not_found")
        self.assertEqual(entry(lookup_rankings(self.db, metadata, 2021), "jcr")["status"], "catalog_missing")

    def test_ccf_track_preprint_and_ambiguous_acronym(self):
        row = {"venue": "Conference on Example Topics", "venue_type": "conference", "value": "A", "aliases": "CET"}
        import_catalog(self.db, "ccf", "v1", 2025, SOURCE, [row])
        metadata = {"venue": "Proceedings of the 31st Conference on Example Topics", "venue_type": "conference"}
        result = lookup_rankings(self.db, metadata)
        self.assertEqual(entry(result, "ccf")["applicability"], "verify_track")
        self.assertEqual(entry(result, "jcr")["status"], "not_applicable")
        regular = entry(lookup_rankings(self.db, {**metadata, "publication_track": "regular"}), "ccf")
        self.assertEqual(regular["applicability"], "confirmed")
        workshop = {**metadata, "venue": "CET", "publication_track": "other"}
        self.assertEqual(entry(lookup_rankings(self.db, workshop), "ccf")["status"], "not_applicable")
        self.assertEqual(entry(lookup_rankings(self.db, {**metadata, "venue": "Findings of CET"}), "ccf")["status"],
                         "not_applicable")
        self.assertEqual(entry(lookup_rankings(self.db, {**metadata, "venue_type": "preprint"}), "ccf")["status"],
                         "not_applicable")
        import_catalog(self.db, "ccf", "v1", 2025, SOURCE, [
            row, {**row, "venue": "Conference on Different Topics", "value": "B"}])
        ambiguous = entry(lookup_rankings(self.db, {"venue": "CET", "venue_type": "conference"}), "ccf")
        self.assertEqual(ambiguous["status"], "ambiguous")
        self.assertEqual(ambiguous["entries"], [])

    def test_custom_catalog_and_failed_replacement_are_atomic(self):
        spec = {"label": "Institution List", "metric": "rank", "venue_types": ("journal",)}
        import_catalog(self.db, "institution", "v1", 2025, SOURCE, [journal("A", "Tier 1")], **spec)
        with self.assertRaises(ValueError):
            import_catalog(self.db, "institution", "v1", 2025, SOURCE, [
                journal("B", "Tier 2"), journal("", "Tier 3")], **spec)
        result = lookup_rankings(self.db, {"issns": ["1932-6203"]})
        self.assertEqual(entry(result, "institution")["entries"][0]["value"], "Tier 1")
        self.assertEqual(entry(result, "jcr")["status"], "catalog_missing")
        self.assertEqual(entry(lookup_rankings(self.db, {}), "jcr")["status"], "venue_unknown")
        with self.assertRaises(ValueError):
            import_catalog(self.db, "cas", "2026", 2026, SOURCE, [journal("A", "1区")])

    def test_native_sjr_csv_explicitly_labels_best_quartile(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sjr.csv"
            path.write_text('Title;Issn;SJR Best Quartile\nExample Journal;19326203;Q2\n', encoding="utf-8")
            import_catalog(self.db, "sjr", "2024", 2024, SOURCE, csv_records(path, "sjr", "sjr"))
        result = entry(lookup_rankings(self.db, {"issns": ["1932-6203"]}), "sjr")
        self.assertEqual(result["entries"][0]["category"], "Best quartile")

    def test_pdf_match_appears_in_existing_metadata_rpc(self):
        with tempfile.TemporaryDirectory() as directory:
            replies = []
            worker = Worker(Path(directory), replies.append)
            def call(method, **params):
                if method in Worker.writes:
                    params["operation_id"] = uuid4().hex
                worker.process({"jsonrpc": "2.0", "id": method, "method": method, "params": params})
                return replies[-1]["result"]
            try:
                topic = call("topic.create", title="Test")
                catalog = [journal("Example Journal", "SCIE")]
                with worker.lock:
                    import_catalog(worker.db, "scie", "2025", 2025, SOURCE, catalog)
                content = base64.b64encode(sample_pdf("ISSN: 1932-6203")).decode()
                paper = call("library.import_pdf", **topic, name="open paper.pdf", content=content)
                result = call("library.metadata", **topic, paper_id=paper["paper_id"])
                self.assertEqual(result["rankings"]["venue_source"], "PDF")
                self.assertEqual(entry(result["rankings"], "scie")["status"], "matched")
                corrected = call("library.update_metadata", **topic, paper_id=paper["paper_id"],
                                 base_revision=result["revision"], changes={"venue": "New Journal", "issns": ["0378-5955"]})
                self.assertEqual(entry(corrected["rankings"], "scie")["status"], "not_found")
                self.assertEqual(pdf_venue("Journal: Example Journal\nReferences\nISSN: 1932-6203"),
                                 {"venue": "Example Journal", "venue_type": "journal"})
            finally:
                worker.close()


if __name__ == "__main__":
    unittest.main()
