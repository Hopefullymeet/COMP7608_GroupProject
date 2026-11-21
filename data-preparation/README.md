# Test Data Collection and Annotation

This directory contains the work for group task 3: paper materials, evidence for paper relations, and tasks with reference answers. The current collection and initial annotation are saved locally. Task 4 handles model runs and automated scoring.

## Current Materials

The collection contains 18 papers and 249 PDF pages across three research topics, with six papers per topic. Saved materials include official source pages, BibTeX, authors, DOIs, version identifiers, PDF hashes, and page text.

| Topic | Papers |
| --- | --- |
| Retrieval, question answering, and citation generation | DrQA, ORQA, DPR, FiD, ALCE, RARR |
| Scientific paper reading and representation | S2ORC, QASPER, SciCite, SciBERT, SPECTER, SciTLDR |
| Fact checking and evidence assessment | FEVER, SciFact, VitaminC, MultiFC, ERASER, FEVER2.0 |

These papers are the materials the system will read and compare. Their published datasets have not been directly incorporated into this test collection. Sources, authors, and publication dates are listed in `manifest.json`. Original materials are in `corpus/`. PDF page numbers count from 1 using the file page order.

There are 14 paper relations. Each includes body page numbers, source excerpts, citation intent, and version information. All 14 have bibliography evidence. The SciBERT bibliography entry for SciCite was checked during review. String search candidates are also retained. A missing search match does not prove that no citation exists.

| Task | Count | Content |
| --- | --- | --- |
| Reading question answering | 18 | Methods, data sources, evidence units, and evaluation definitions |
| Citation matching | 18 | Find papers and passages that support a claim |
| Citation checking | 42 | 18 supported, 18 contradicted, 3 not established, and 3 unavailable full text cases |
| Literature discovery | 3 | Find papers in the collection for a research request |
| Paper comparison | 3 | Compare methods and tasks, and explain whether reported scores can be compared directly |

All 84 tasks have source review records with status `assistant_source_checked`. The 18 citation matching tasks remain partially complete because some candidates are unjudged. The 3 unavailable full text cases received fixture definition checks only. No system run was performed. These are controlled examples based on source papers. Supported and contradicted variants often share the same fact, so they are not 84 independent natural examples. They are useful for integration, trial annotation, and finding obvious errors. They are not final evaluation references.

## Reading the Files

Start with `review/REVIEW.md`, which lists relation IDs, task IDs, and evidence pages. Full tasks and reference answers are in `review/cases.jsonl`. Paper relations are in `review/relations.jsonl`. `review/task_inputs.jsonl` contains only task inputs for task 4.

`review/annotation_template.json` describes shared fields. The older `pilot_drafts.jsonl` contains the first two examples. It is retained as history and is not counted together with `cases.jsonl`.

## Annotation Method

First check the paper identity and version, then read the body citation and bibliography entry. A citation connection means only that A cites B. Record citation intent separately as background, method use, data use, method extension, or result comparison. Support judgments concern a specific claim and source. They cannot be inferred from a citation connection alone.

Split compound sentences into atomic claims. Check quantifiers, negation, and conditions. Use `supported`, `contradicted`, and `not_established`. If only part of a sentence is supported, record separate judgments for its parts. When a required file is unavailable, retain a null semantic label and `blocked`. Missing access is neither contradiction nor insufficient source evidence.

Each evidence record includes the paper ID, PDF hash, page, section, original excerpt, context, and text offsets. Offsets refer to character positions in `pages.json`, not PDF coordinates. Search may normalize ligatures and line breaks, but saved excerpts retain the extracted text. SciTLDR text extraction contains null characters, while its PDF remains readable. Check the PDF during source review, especially for columns, figures, tables, and references.

The three `not_established` cases are restricted to their supplied passages. They do not establish an absence of evidence throughout the full paper. Task 4 must block access to the specified files for the three unavailable full text fixtures. If the files remain accessible, the intended test conditions have not been created.

Citation matching includes supported candidates and unjudged candidates. Unjudged candidates are not negatives. Literature discovery records contain preliminary relevance grades for all allowed candidates. Complete the remaining judgments and review the grades before using them as final references for recall or ranking metrics.

## Further Review

Reviewers should independently check the same records and add their identifiers, labels, evidence, and reasons to `annotations`. Resolve disagreements through a third reviewer or discussion, then record the final labels, reasons, and time in `adjudication`. Use `adjudicated` only after that process is complete.

Priorities are as follows.

1. FiD cites a DPR arXiv preprint, while this collection holds the conference version. Check version evidence before relying on version specific claims.
2. Check the completed SciBERT and SciCite bibliography match and citation intent.
3. Check that contradicted variants conflict with the source. A missing mention is not contradiction.
4. Complete citation matching candidate judgments and review the discovery relevance grades.
5. Use new papers and natural drafts for the final report. Split development and test materials by paper family. Keep trial annotation materials in the pilot split.

Most papers are older NLP work, so model pretraining exposure remains a concern. The three topics are not three independent disciplines. A final demonstration in medicine or another field needs papers and qualified review from that field.

## Integration and Reproduction

`corpus/` contains materials the system may read. Answers, labels, evidence reference tables, and relation references in `review/` must stay outside the system index, Wiki, and prompts. Passages in `provided_passages` cases are explicit inputs and may be supplied to the system. Unavailable full text fixtures require file access restrictions.

Use Python 3.10 or later. Install `requirements.txt` in a separate environment before running these commands.

```bash
python collect.py
python prepare_annotations.py
python validate_data.py
```

The collector reuses existing PDFs. It records download failures and exits with a failure status when needed. The preparation script regenerates initial drafts and overwrites edits to its generated files. Freeze a copy before review and stop rerunning the preparation script on reviewed materials.

The validator checks file completeness, hashes, excerpt offsets, IDs, and field references. It does not run a model or establish semantic correctness. Results are saved in `review/validation_report.json`. PDFs are excluded from Git by default. Check each paper's license before public distribution. This work is maintained on the `test/data-preparation` branch.

The first review covered 10 tasks and 2 relations. Its findings are retained in `review/SOURCE_REVIEW.md`.

## Full Collection Review

All 84 tasks and 14 relations have been examined. The 18 citation matching tasks retain unjudged candidates, which cannot count as negatives. Another 63 tasks were checked within their stated scope. The 3 unavailable full text cases received definition checks only, without system execution. See `review/REVIEW_RESULTS.md` for individual findings and `review/review_changes.jsonl` for before and after records. The earlier 10 task review remains as history.

SPECTER and SciBERT can be compared within the shared SciDocs experiments in SPECTER Table 1. Scores across their separate original tasks cannot simply be subtracted. Citation matching now includes additional positive sources supported by other papers' body text. The available evidence still does not identify the exact DPR preprint revision cited by FiD.

## Local Files Excluded from Git

Chinese review copies, the ZIP backup, and `.DS_Store` files are retained locally and excluded by ignore rules. They are not part of the submission. Original source materials and existing review history are preserved.
