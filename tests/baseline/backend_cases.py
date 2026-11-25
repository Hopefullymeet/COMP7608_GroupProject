"""Execute the upstream integration tests that implement the baseline scenarios."""
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from contextlib import ExitStack

CASES = {
    "CMP-01": ["test_literature.LiteratureTest.test_focused_comparison_and_revision"],
    "CMP-02": ["test_comparison_recovery.ComparisonRecovery.test_truncated_response_recovers_only_verified_cells"],
    "WIKI-01": ["test_literature.LiteratureTest.test_source_gaps_exact_anchors_and_wiki_recheck"],
    "REV-01": ["test_decision.ReviewFlow.test_one_revision_must_have_verified_quote"],
    "CFG-02": ["test_papertrace.CredentialTest.test_named_credentials_share_a_library_and_bind_services_independently"],
    "AGT-01": ["test_model_research.ModelResearchTest.test_truncated_tool_call_is_not_executed"],
    "CIT-01": ["test_citations.TestCitationWorkflow.test_suggestions_ground_unreferenced_clauses_and_recheck_changed_source"],
    "LIB-02": ["test_papertrace.ContractTest.test_paper_alias_survives_restart_and_keeps_original_title"],
    "READ-01": ["test_reader.ReaderTest.test_figure_mention_without_detected_object_is_page_only"],
    "READ-02": ["test_reader.ReaderTest.test_embedded_notes_retain_rotated_page_location_and_original_bytes"],
    "TR-01": ["test_reader.ReaderTest.test_translation_consent_selection_partial_page_retry_and_cache"],
    "IMP-01": ["test_papertrace.BibliographyContractTest.test_preview_identifies_duplicate_rows_without_forcing_one_selection",
               "test_papertrace.BibliographyContractTest.test_offline_bibliography_preview_selective_commit_and_replay"],
    "IMP-02": ["test_papertrace.BibliographyContractTest.test_zotero_rdf_import_preserves_collection_note_and_pdf_attachment"],
    "CFG-01": ["test_papertrace.ContractTest.test_service_configuration_uses_the_desktop_contract"],
    "META-01": ["test_venue_ranks.VenueRanksTest.test_custom_catalog_and_failed_replacement_are_atomic"],
}

if __name__ == "__main__":
    directory = Path(sys.argv[1]).resolve(strict=True)
    os.chdir(directory)
    sys.path.insert(0, str(directory))
    import papertrace  # Load credential bindings before substituting the isolated test providers.
    passed = True
    for case, methods in CASES.items():
        print(case, flush=True)
        with ExitStack() as isolation:
            # Credential library regression supplies its own isolated vault and catalog.
            if case != "CFG-02":
                for name in ("credentials.system_key", "papertrace.system_key", "papertrace.active_connection", "credentials.active_connection"):
                    isolation.enter_context(patch(name, return_value=None))
            isolation.enter_context(patch.dict(os.environ, DEEPSEEK_API_KEY=""))
            suite = unittest.defaultTestLoader.loadTestsFromNames(methods)
            result = unittest.TextTestRunner(verbosity=2).run(suite)
            passed &= result.wasSuccessful() and not result.skipped
    sys.exit(0 if passed else 1)
