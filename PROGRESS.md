# Current Progress

Updated 2026-11-23. The project is in implementation. The test paper collection and reference records are ready for further review.

## Completed

- Submitted the Group 52 proposal and completed the [MVP design](docs/PaperTrace_MVP_Design.md) and [project, technical, and design handoff package](docs/deliverables/PaperTrace_Handoff_20261109/).
- The visual prototype (`visual-prototype`) passed review. It covers discovery, reading questions, evidence locations, comparison, and workspace pages. It uses sample data. See the [prototype instructions](prototype/AGENTS.md) for its scope.
- Translated pending test data documentation, review explanations, historical record text, and generated checklist text into English. The ZIP backup is excluded from Git. The three original Chinese review copies are also included as historical backups. IDs, labels, source excerpts, and review status fields are preserved.
- Included all 18 original PDFs in `data-preparation/corpus/` on `test/data-preparation`, alongside the existing page text and source records.

## In Progress

- Test data in `data-preparation/` covers 18 papers, 84 tasks, and 14 relations. Of these, 63 tasks were checked within their stated scope, 18 citation matching tasks retain unjudged candidates, and 3 unavailable full text cases received definition checks only. Positive sources, comparison evidence, and citation intents have been corrected. See `data-preparation/review/REVIEW_RESULTS.md` for individual findings. Earlier records and the ZIP backup are preserved.
- Frontend, backend, and agent workflows are under development. Search interfaces, model choices, and the demonstration field remain to be confirmed.

## Next Steps

- Continue independent review and disagreement resolution, including the 85 citation candidates that have only been screened. The exact DPR preprint revision cited by FiD remains unresolved. Use separate papers for final evaluation and split by paper family. Keep reference answers outside the system index and Wiki. Test data changes are maintained on `test/data-preparation`. System performance tests have not been run.
- Agree on the Library integration contract, check the demonstration paper abstracts against their sources, and integrate paper search, reading questions, and evidence locations.
