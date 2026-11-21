# First Source Review

The first review covered 10 tasks and 2 relations. The collection retained 84 tasks, 14 relations, and the pilot split. No papers were added and no system performance tests were run.

| Task ID | Findings and Changes |
| --- | --- |
| dpr_check_supported | Retained the supported label because the abstract explicitly describes dense representations and a dual encoder. The encoder description on PDF page 3 was also checked to distinguish retrieval representations from the full QA system. |
| dpr_check_contradicted | Split the sentence into two claims: using only sparse vectors and not learning dense representations. Both conflict with the abstract. |
| fid_check_supported | Recorded independent encoding and joint decoder processing as separate atomic claims. Replaced the excerpt with text from page 3 that excludes intervening footnotes. |
| fid_check_contradicted | Retained the contradicted label because joint encoding of all passages conflicts with the independent encoding described on page 3. Replaced the excerpt affected by footnotes. |
| qasper_qa_001 | Retained the answer after checking the abstract. Clarified that question writers read only titles and abstracts, while a separate group of NLP practitioners supplies answers and evidence. |
| s2orc_check_contradicted | The abstract distinguishes metadata for 81.1M papers from 8.1M open access full texts. The claim that all papers have full text conflicts with the statistics for this version. |
| specter_scope_001 | The original passage concerned inference without citations and was only weakly related to a broad performance claim. Replaced it with the abstract passage describing seven evaluation tasks. The judgment remains limited to the supplied passage. |
| fid_missing_file | This records expected behavior under an access failure, not an observed system result. Retained a null semantic label and blocked status, and added an answer explaining that verification cannot be completed. |
| compare_fever_scifact | Added the evidence sentence description from FEVER page 1 and the atomic claim and abstract evidence definitions from SciFact page 3. Completed the comparison dimensions without comparing scores across different tasks. |
| fid_citation_match_001 | FiD page 3 provides a valid positive source. Replaced the excerpt crossing columns. Other candidates have not been exhaustively checked and are not treated as negatives. |

## Citation Relations

The identity of the DPR work cited by FiD and the use of its method were checked. The bibliography gives arXiv:2004.04906 without a revision number. Equivalence between the cited preprint and the conference version remains unverified.

Added the bibliography entry for SciCite on SciBERT page 5. All 14 relations now include body and bibliography evidence, but this first review covered only 2 relations.

## Evidence Checks

Rendered and inspected the first pages of DPR, QASPER, S2ORC, FEVER, SciFact, and SPECTER. Also checked the FiD method on page 3, bibliography entries, and other specified sections. Excerpts retain their original extracted text and character offsets.

## Next Steps

Do not rerun prepare_annotations.py over these changes. Use validate_data.py to check data consistency. Passing validation confirms file and excerpt consistency, not the correctness of semantic labels.
