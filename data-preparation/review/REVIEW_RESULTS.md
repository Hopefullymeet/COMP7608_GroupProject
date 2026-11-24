# PaperTrace Test Data Review Results

Review date: 2026-11-21.

This review covers 18 papers, 84 tasks, and 14 citation relations.

## Review Coverage

All tasks were examined individually. Candidates for the 18 citation matching tasks were screened, but some received only topic and passage screening rather than a complete support judgment. These tasks remain partially complete. Another 63 tasks were reviewed within their stated scope. The 3 unavailable full text cases received fixture definition checks only.

Body text and bibliography entries were checked for all relations. The identity and method use of DPR in FiD can be confirmed, but the exact cited preprint revision remains unknown.

Main corrections concern FiD footnotes across columns, atomic claim splitting, missing positive citation sources, method use in QASPER and DPR, and the comparability of SPECTER and SciBERT in a shared evaluation.

## Decision Rules

Support and contradiction require source evidence. Lack of a mention is not contradiction. Passage tasks are judged only against their supplied text. Unavailable full text fixtures retain null semantic labels and are not reported as executed tests. Unjudged candidates are not negatives. Full text may be indexed, but answers, review records, and evidence reference tables must remain outside the system index and Wiki.

Rendered and inspected the first page of all 18 papers, FiD page 3, SciTLDR pages 2, 3, and 10, the table on SPECTER page 7, and SciCite page 3. The reading lists identify sections checked for the questions, not a word by word reading of all 249 pages. The FiD decoder sentence splits a word across columns. Original fragments and their continuation are retained without treating footnotes or reconstructed words as source text.

## Review by Paper

### dpr

Paper: Dense Passage Retrieval for Open-Domain Question Answering. Saved version: 2020.emnlp-main.550. Reviewed PDF pages: 1, 2, 3, 4, 5, 7, 10.

The abstract states that dense representations are learned. Pages 2 and 3 explain the dual encoder, dot product retrieval, and training.

#### dpr_qa_001

Task: What representation and encoder framework does DPR use for retrieval?

The review outcome is complete_within_declared_scope. The previous reference was recorded as agree_with_scope_notes.

Reference answer: DPR learns dense representations with a dual encoder framework.

Evidence locations: dpr PDF p. 1, Abstract, dpr_p1_753

Checked the question, answer, and evidence scope, retaining or clarifying source qualifications.

#### dpr_citation_match_001

Additional evidence: fid PDF p. 2, 2 Related work, fid_p2_2666, together with the other excerpts, establishes the training basis or Wikipedia source scope.

Task: DPR learns dense representations with a dual encoder framework.

The review outcome is partial. The previous reference was recorded as revised.

Reference answer: DPR learns dense representations with a dual encoder framework.

Evidence locations: dpr PDF p. 1, Abstract, dpr_p1_753. fid PDF p. 3, 3 Method, Retrieval, fid_p3_1289

Screened the topics and matching passages of all allowed candidates and added positive sources with evidence. Other candidates remain unjudged after screening.

| Candidate Paper | Judgment     | Reason                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| dpr      | supports | The body text supports the target claim about dpr.                        |
| fid      | supports | The body text supports the target claim about dpr.                        |
| drqa     | unjudged | This paper mainly concerns Wikipedia retrieval and extractive reading. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| orqa     | unjudged | This paper mainly concerns open retrieval question answering and ICT pretraining. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| alce     | unjudged | This paper mainly concerns text generation with citations and its evaluation. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| rarr     | unjudged | This paper mainly concerns finding evidence for existing text and revising it. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |

Open issue: Some candidates have only been screened and lack complete support judgments. They cannot be used as negatives.

#### dpr_check_supported

Task: DPR learns dense representations with a dual encoder framework.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: DPR learns dense representations with a dual encoder framework.

Claim c1: DPR learns dense representations. Label: supported, Execution status: read. Reason: The abstract states that dense representations are learned. Pages 2 and 3 explain the dual encoder, dot product retrieval, and training. The claim accurately restates these facts.
Claim c2: DPR uses a dual encoder framework. Label: supported, Execution status: read. Reason: The abstract states that dense representations are learned. Pages 2 and 3 explain the dual encoder, dot product retrieval, and training. The claim accurately restates these facts.

Evidence locations: dpr PDF p. 1, Abstract, dpr_p1_753

Checked atomic claims, support direction, quantifiers, and evidence scope. The abstract states that dense representations are learned. Pages 2 and 3 explain the dual encoder, dot product retrieval, and training.

#### dpr_check_contradicted

Task: DPR uses only sparse keyword vectors and does not learn dense representations.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: DPR learns dense representations with a dual encoder framework.

Claim c1: DPR uses only sparse keyword vectors. Label: contradicted, Execution status: read. Reason: The abstract states that dense representations are learned. Pages 2 and 3 explain the dual encoder, dot product retrieval, and training. The claim conflicts with these explicit facts.
Claim c2: DPR does not learn dense representations. Label: contradicted, Execution status: read. Reason: The abstract states that dense representations are learned. Pages 2 and 3 explain the dual encoder, dot product retrieval, and training. The claim conflicts with these explicit facts.

Evidence locations: dpr PDF p. 1, Abstract, dpr_p1_753

Checked atomic claims, support direction, quantifiers, and evidence scope. The abstract states that dense representations are learned. Pages 2 and 3 explain the dual encoder, dot product retrieval, and training.

#### dpr_scope_001

Task: The method in Dense Passage Retrieval for Open-Domain Question Answering improves performance on every possible task and language.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: The supplied passage does not establish a universal claim about all tasks and languages.

Claim c1: The method in Dense Passage Retrieval for Open-Domain Question Answering improves performance on every possible task and language. Label: not_established, Execution status: read. Reason: The supplied passage does not establish improvement across every task and language. This judgment is limited to the input passage and does not claim an absence of evidence throughout the paper.

Evidence locations: dpr PDF p. 1, Abstract, dpr_p1_753

Assigned not_established using only the supplied passage, without importing outside full text to refute the claim.

The judgment is restricted to the supplied passage.

### fid

Paper: Leveraging Passage Retrieval with Generative Models for Open Domain Question Answering. Saved version: 2021.eacl-main.74. Reviewed PDF pages: 1, 2, 3, 6.

Page 3 distinguishes independent encoder processing from joint decoder processing. The original long excerpt included footnotes and was replaced with shorter source spans.

#### fid_qa_001

Task: How does FiD process passages in the encoder and combine them in the decoder?

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: FiD encodes each passage independently and lets the decoder attend to the combined representations.

Evidence locations: fid PDF p. 3, 3 Method, Reading, fid_p3_1863. fid PDF p. 3, 3 Method, Reading, fid_p3_2222. fid PDF p. 3, 3 Method, Reading, fid_p3_2418

Checked the question, answer, and evidence scope, retaining or clarifying source qualifications.

#### fid_citation_match_001

Task: FiD encodes each passage independently and lets the decoder attend to the combined representations.

The review outcome is partial. The previous reference was recorded as revised.

Reference answer: FiD encodes each passage independently and lets the decoder attend to the combined representations.

Evidence locations: fid PDF p. 3, 3 Method, Reading, fid_p3_1863. fid PDF p. 3, 3 Method, Reading, fid_p3_2222. fid PDF p. 3, 3 Method, Reading, fid_p3_2418

Screened the topics and matching passages of all allowed candidates and added positive sources with evidence. Other candidates remain unjudged after screening.

| Candidate Paper | Judgment     | Reason                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| dpr      | unjudged | This paper mainly concerns dense retrieval with a dual encoder. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| fid      | supports | The body text supports the target claim about fid.                        |
| drqa     | unjudged | This paper mainly concerns Wikipedia retrieval and extractive reading. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| orqa     | unjudged | This paper mainly concerns open retrieval question answering and ICT pretraining. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| alce     | unjudged | This paper mainly concerns text generation with citations and its evaluation. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| rarr     | unjudged | This paper mainly concerns finding evidence for existing text and revising it. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |

Open issue: Some candidates have only been screened and lack complete support judgments. They cannot be used as negatives.

#### fid_check_supported

Task: FiD encodes each passage independently and lets the decoder attend to the combined representations.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: FiD encodes each passage independently and lets the decoder attend to the combined representations.

Claim c1: FiD encodes retrieved passages independently from other passages. Label: supported, Execution status: read. Reason: Page 3 distinguishes independent encoder processing from joint decoder processing. The original long excerpt included footnotes and was replaced with shorter source spans. The claim accurately restates these facts.
Claim c2: FiD lets the decoder attend to the combined passage representations. Label: supported, Execution status: read. Reason: Page 3 distinguishes independent encoder processing from joint decoder processing. The original long excerpt included footnotes and was replaced with shorter source spans. The claim accurately restates these facts.

Evidence locations: fid PDF p. 3, 3 Method, Reading, fid_p3_1863. fid PDF p. 3, 3 Method, Reading, fid_p3_2222. fid PDF p. 3, 3 Method, Reading, fid_p3_2418

Checked atomic claims, support direction, quantifiers, and evidence scope. Page 3 distinguishes independent encoder processing from joint decoder processing. The original long excerpt included footnotes and was replaced with shorter source spans.

#### fid_check_contradicted

Task: FiD jointly encodes all retrieved passages in a single encoder sequence before decoding.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: FiD encodes each passage independently and lets the decoder attend to the combined representations.

Claim c1: FiD jointly encodes all retrieved passages in a single encoder sequence before decoding. Label: contradicted, Execution status: read. Reason: Page 3 distinguishes independent encoder processing from joint decoder processing. The original long excerpt included footnotes and was replaced with shorter source spans. The claim conflicts with these explicit facts.

Evidence locations: fid PDF p. 3, 3 Method, Reading, fid_p3_1863. fid PDF p. 3, 3 Method, Reading, fid_p3_2222. fid PDF p. 3, 3 Method, Reading, fid_p3_2418

Checked atomic claims, support direction, quantifiers, and evidence scope. Page 3 distinguishes independent encoder processing from joint decoder processing. The original long excerpt included footnotes and was replaced with shorter source spans.

#### fid_scope_001

Task: The method in Leveraging Passage Retrieval with Generative Models for Open Domain Question Answering improves performance on every possible task and language.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: The supplied passage does not establish a universal claim about all tasks and languages.

Claim c1: The method in Leveraging Passage Retrieval with Generative Models for Open Domain Question Answering improves performance on every possible task and language. Label: not_established, Execution status: read. Reason: The supplied passage does not establish improvement across every task and language. This judgment is limited to the input passage and does not claim an absence of evidence throughout the paper.

Evidence locations: fid PDF p. 3, 3 Method, Reading, fid_p3_2418

Assigned not_established using only the supplied passage, without importing outside full text to refute the claim.

The judgment is restricted to the supplied passage.

#### fid_missing_file

Task: FiD encodes each passage independently and lets the decoder attend to the combined representations.

The review outcome is fixture_definition_checked_not_executed. The previous reference was recorded as revised.

Reference answer: The fixture makes the required full text unavailable, so verification cannot currently be completed. Report the missing material without issuing a support or contradiction verdict.

Claim c1: FiD encodes each passage independently and lets the decoder attend to the combined representations. Label: None, Execution status: blocked. Reason: The task fixture removes access to the required full text. Missing access does not imply refutation.

Evidence locations: None. The fixture makes the required full text unavailable.

Checked only the unavailable full text fixture and expected response. Neither a model run nor a file blocking test was performed. Retained null and blocked.

### s2orc

Paper: S2ORC: The Semantic Scholar Open Research Corpus. Saved version: 2020.acl-main.447. Reviewed PDF pages: 1, 2, 3, 6, 7.

Pages 1 and 2 distinguish 81.1M bibliographic nodes from 8.1M open access full texts. Page 3 describes links between inline citations and bibliography entries. These counts apply only to the collected version.

#### s2orc_qa_001

Task: How many papers have structured full text in the S2ORC release described here?

The review outcome is complete_within_declared_scope. The previous reference was recorded as agree_with_scope_notes.

Reference answer: The reported S2ORC release contains structured full text for 8.1 million open access papers.

Evidence locations: s2orc PDF p. 1, Abstract, s2orc_p1_501

Checked the question, answer, and evidence scope, retaining or clarifying source qualifications.

#### s2orc_citation_match_001

Task: The reported S2ORC release contains structured full text for 8.1 million open access papers.

The review outcome is partial. The previous reference was recorded as revised.

Reference answer: The reported S2ORC release contains structured full text for 8.1 million open access papers.

Evidence locations: s2orc PDF p. 1, Abstract, s2orc_p1_501

Screened the topics and matching passages of all allowed candidates and added positive sources with evidence. Other candidates remain unjudged after screening.

| Candidate Paper | Judgment     | Reason                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| s2orc    | supports | The body text supports the target claim about s2orc.                      |
| qasper   | unjudged | This paper mainly concerns full paper question answering with annotated evidence. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| scicite  | unjudged | This paper mainly concerns citation intent classification. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| scibert  | unjudged | This paper mainly concerns a language model pretrained on scientific text. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| specter  | unjudged | This paper mainly concerns learning paper representations from citations. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| scitldr  | unjudged | This paper mainly concerns extreme summarization of scientific papers. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |

Open issue: Some candidates have only been screened and lack complete support judgments. They cannot be used as negatives.

#### s2orc_check_supported

Task: The reported S2ORC release contains structured full text for 8.1 million open access papers.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: The reported S2ORC release contains structured full text for 8.1 million open access papers.

Claim c1: The reported S2ORC release contains structured full text for 8.1 million open access papers. Label: supported, Execution status: read. Reason: Pages 1 and 2 distinguish 81.1M bibliographic nodes from 8.1M open access full texts. Page 3 describes links between inline citations and bibliography entries. These counts apply only to the collected version. The claim accurately restates these facts.

Evidence locations: s2orc PDF p. 1, Abstract, s2orc_p1_501

Checked atomic claims, support direction, quantifiers, and evidence scope. Pages 1 and 2 distinguish 81.1M bibliographic nodes from 8.1M open access full texts. Page 3 describes links between inline citations and bibliography entries. These counts apply only to the collected version.

#### s2orc_check_contradicted

Task: All 81.1 million papers in the reported S2ORC release have structured full text.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: The reported S2ORC release contains structured full text for 8.1 million open access papers.

Claim c1: All 81.1 million papers in the reported S2ORC release have structured full text. Label: contradicted, Execution status: read. Reason: Pages 1 and 2 distinguish 81.1M bibliographic nodes from 8.1M open access full texts. Page 3 describes links between inline citations and bibliography entries. These counts apply only to the collected version. The claim conflicts with these explicit facts.

Evidence locations: s2orc PDF p. 1, Abstract, s2orc_p1_501

Checked atomic claims, support direction, quantifiers, and evidence scope. Pages 1 and 2 distinguish 81.1M bibliographic nodes from 8.1M open access full texts. Page 3 describes links between inline citations and bibliography entries. These counts apply only to the collected version.

### qasper

Paper: A Dataset of Information-Seeking Questions and Answers Anchored in Research Papers. Saved version: 2021.naacl-main.365. Reviewed PDF pages: 1, 2, 11.

The abstract and page 2 state that question writers see only titles and abstracts, while another group provides answers and evidence. Full text is used to answer questions, not read by the question writers beforehand.

#### qasper_qa_001

Task: What do QASPER question writers read, and who supplies answers and evidence?

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: Question writers are NLP practitioners who read only the title and abstract. A separate set of NLP practitioners supplies the answers and supporting evidence.

Evidence locations: qasper PDF p. 1, Abstract, qasper_p1_1153

Checked the question, answer, and evidence scope, retaining or clarifying source qualifications.

#### qasper_citation_match_001

Task: QASPER question writers read the title and abstract, and a separate group supplies answers and evidence.

The review outcome is partial. The previous reference was recorded as revised.

Reference answer: QASPER question writers read the title and abstract, and a separate group supplies answers and evidence.

Evidence locations: qasper PDF p. 1, Abstract, qasper_p1_1153

Screened the topics and matching passages of all allowed candidates and added positive sources with evidence. Other candidates remain unjudged after screening.

| Candidate Paper | Judgment     | Reason                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| s2orc    | unjudged | This paper mainly concerns a structured corpus of scientific papers. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| qasper   | supports | The body text supports the target claim about qasper.                     |
| scicite  | unjudged | This paper mainly concerns citation intent classification. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| scibert  | unjudged | This paper mainly concerns a language model pretrained on scientific text. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| specter  | unjudged | This paper mainly concerns learning paper representations from citations. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| scitldr  | unjudged | This paper mainly concerns extreme summarization of scientific papers. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |

Open issue: Some candidates have only been screened and lack complete support judgments. They cannot be used as negatives.

#### qasper_check_supported

Task: QASPER question writers read the title and abstract, and a separate group supplies answers and evidence.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: QASPER question writers read the title and abstract, and a separate group supplies answers and evidence.

Claim c1: QASPER question writers read only the title and abstract. Label: supported, Execution status: read. Reason: The abstract and page 2 state that question writers see only titles and abstracts, while another group provides answers and evidence. Full text is used to answer questions, not read by the question writers beforehand. The claim accurately restates these facts.
Claim c2: A separate set of NLP practitioners supplies QASPER answers and supporting evidence. Label: supported, Execution status: read. Reason: The abstract and page 2 state that question writers see only titles and abstracts, while another group provides answers and evidence. Full text is used to answer questions, not read by the question writers beforehand. The claim accurately restates these facts.

Evidence locations: qasper PDF p. 1, Abstract, qasper_p1_1153

Checked atomic claims, support direction, quantifiers, and evidence scope. The abstract and page 2 state that question writers see only titles and abstracts, while another group provides answers and evidence. Full text is used to answer questions, not read by the question writers beforehand.

#### qasper_check_contradicted

Task: QASPER question writers read the full paper before writing their questions.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: QASPER question writers read the title and abstract, and a separate group supplies answers and evidence.

Claim c1: QASPER question writers read the full paper before writing their questions. Label: contradicted, Execution status: read. Reason: The abstract and page 2 state that question writers see only titles and abstracts, while another group provides answers and evidence. Full text is used to answer questions, not read by the question writers beforehand. The claim conflicts with these explicit facts.

Evidence locations: qasper PDF p. 1, Abstract, qasper_p1_1153

Checked atomic claims, support direction, quantifiers, and evidence scope. The abstract and page 2 state that question writers see only titles and abstracts, while another group provides answers and evidence. Full text is used to answer questions, not read by the question writers beforehand.

#### qasper_missing_file

Task: QASPER question writers read the title and abstract, and a separate group supplies answers and evidence.

The review outcome is fixture_definition_checked_not_executed. The previous reference was recorded as revised.

Reference answer: The fixture makes the required full text unavailable, so verification cannot currently be completed. Report the missing material without issuing a support or contradiction verdict.

Claim c1: QASPER question writers read the title and abstract, and a separate group supplies answers and evidence. Label: None, Execution status: blocked. Reason: The task fixture removes access to the required full text. Missing access does not imply refutation.

Evidence locations: None. The fixture makes the required full text unavailable.

Checked only the unavailable full text fixture and expected response. Neither a model run nor a file blocking test was performed. Retained null and blocked.

### fever

Paper: FEVER: a Large-scale Dataset for Fact Extraction and VERification. Saved version: N18-1074. Reviewed PDF pages: 1, 2.

The abstract and pages 1 and 2 describe creating claims by modifying Wikipedia sentences, with evidence sentences for support or refutation.

#### fever_qa_001

Task: How were claims generated for FEVER?

The review outcome is complete_within_declared_scope. The previous reference was recorded as agree_with_scope_notes.

Reference answer: FEVER claims were generated by altering sentences extracted from Wikipedia.

Evidence locations: fever PDF p. 1, Abstract, fever_p1_586

Checked the question, answer, and evidence scope, retaining or clarifying source qualifications.

#### fever_citation_match_001

Task: FEVER claims were generated by altering sentences extracted from Wikipedia.

The review outcome is partial. The previous reference was recorded as revised.

Reference answer: FEVER claims were generated by altering sentences extracted from Wikipedia.

Evidence locations: fever PDF p. 1, Abstract, fever_p1_586. scifact PDF p. 3, 2 Background and task definition, scifact_p3_802

Screened the topics and matching passages of all allowed candidates and added positive sources with evidence. Other candidates remain unjudged after screening.

| Candidate Paper | Judgment     | Reason                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| fever    | supports | The body text supports the target claim about fever.                      |
| scifact  | supports | The body text supports the target claim about fever.                      |
| vitaminc | unjudged | This paper mainly concerns robust fact verification under evidence revisions. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| multifc  | unjudged | This paper mainly concerns fact checking data from real websites. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| eraser   | unjudged | This paper mainly concerns evaluation of supporting rationales. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| fever2   | unjudged | This paper mainly concerns an adversarial fact verification shared task. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |

Open issue: Some candidates have only been screened and lack complete support judgments. They cannot be used as negatives.

#### fever_check_supported

Task: FEVER claims were generated by altering sentences extracted from Wikipedia.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: FEVER claims were generated by altering sentences extracted from Wikipedia.

Claim c1: FEVER claims were generated by altering sentences extracted from Wikipedia. Label: supported, Execution status: read. Reason: The abstract and pages 1 and 2 describe creating claims by modifying Wikipedia sentences, with evidence sentences for support or refutation. The claim accurately restates these facts.

Evidence locations: fever PDF p. 1, Abstract, fever_p1_586

Checked atomic claims, support direction, quantifiers, and evidence scope. The abstract and pages 1 and 2 describe creating claims by modifying Wikipedia sentences, with evidence sentences for support or refutation.

#### fever_check_contradicted

Task: FEVER claims were collected exclusively from clinical trial reports.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: FEVER claims were generated by altering sentences extracted from Wikipedia.

Claim c1: FEVER claims were collected exclusively from clinical trial reports. Label: contradicted, Execution status: read. Reason: The abstract and pages 1 and 2 describe creating claims by modifying Wikipedia sentences, with evidence sentences for support or refutation. The claim conflicts with these explicit facts.

Evidence locations: fever PDF p. 1, Abstract, fever_p1_586

Checked atomic claims, support direction, quantifiers, and evidence scope. The abstract and pages 1 and 2 describe creating claims by modifying Wikipedia sentences, with evidence sentences for support or refutation.

### scifact

Paper: Fact or Fiction: Verifying Scientific Claims. Saved version: 2020.emnlp-main.609. Reviewed PDF pages: 1, 2, 3, 5, 10, 11.

Pages 1 to 3 describe reformulating citation sentences into scientific claims and labeling individual sources using abstracts and rationale sentences. This is not a global truth judgment based on complete paper texts.

#### scifact_qa_001

Task: What source material is paired with the expert written claims in SciFact?

The review outcome is complete_within_declared_scope. The previous reference was recorded as agree_with_scope_notes.

Reference answer: SciFact pairs expert written scientific claims with evidence containing abstracts.

Evidence locations: scifact PDF p. 1, Abstract, scifact_p1_542

Checked the question, answer, and evidence scope, retaining or clarifying source qualifications.

#### scifact_citation_match_001

Task: SciFact pairs expert written scientific claims with evidence containing abstracts.

The review outcome is partial. The previous reference was recorded as revised.

Reference answer: SciFact pairs expert written scientific claims with evidence containing abstracts.

Evidence locations: scifact PDF p. 1, Abstract, scifact_p1_542

Screened the topics and matching passages of all allowed candidates and added positive sources with evidence. Other candidates remain unjudged after screening.

| Candidate Paper | Judgment     | Reason                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| fever    | unjudged | This paper mainly concerns Wikipedia claim verification with evidence. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| scifact  | supports | The body text supports the target claim about scifact.                    |
| vitaminc | unjudged | This paper mainly concerns robust fact verification under evidence revisions. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| multifc  | unjudged | This paper mainly concerns fact checking data from real websites. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| eraser   | unjudged | This paper mainly concerns evaluation of supporting rationales. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| fever2   | unjudged | This paper mainly concerns an adversarial fact verification shared task. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |

Open issue: Some candidates have only been screened and lack complete support judgments. They cannot be used as negatives.

#### scifact_check_supported

Task: SciFact pairs expert written scientific claims with evidence containing abstracts.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: SciFact pairs expert written scientific claims with evidence containing abstracts.

Claim c1: SciFact pairs expert written scientific claims with evidence containing abstracts. Label: supported, Execution status: read. Reason: Pages 1 to 3 describe reformulating citation sentences into scientific claims and labeling individual sources using abstracts and rationale sentences. This is not a global truth judgment based on complete paper texts. The claim accurately restates these facts.

Evidence locations: scifact PDF p. 1, Abstract, scifact_p1_542

Checked atomic claims, support direction, quantifiers, and evidence scope. Pages 1 to 3 describe reformulating citation sentences into scientific claims and labeling individual sources using abstracts and rationale sentences. This is not a global truth judgment based on complete paper texts.

#### scifact_check_contradicted

Task: SciFact annotations described in the abstract are based exclusively on complete paper texts rather than abstracts.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: SciFact pairs expert written scientific claims with evidence containing abstracts.

Claim c1: SciFact annotations described in the abstract are based exclusively on complete paper texts rather than abstracts. Label: contradicted, Execution status: read. Reason: Pages 1 to 3 describe reformulating citation sentences into scientific claims and labeling individual sources using abstracts and rationale sentences. This is not a global truth judgment based on complete paper texts. The claim conflicts with these explicit facts.

Evidence locations: scifact PDF p. 1, Abstract, scifact_p1_542

Checked atomic claims, support direction, quantifiers, and evidence scope. Pages 1 to 3 describe reformulating citation sentences into scientific claims and labeling individual sources using abstracts and rationale sentences. This is not a global truth judgment based on complete paper texts.

#### scifact_missing_file

Task: SciFact pairs expert written scientific claims with evidence containing abstracts.

The review outcome is fixture_definition_checked_not_executed. The previous reference was recorded as revised.

Reference answer: The fixture makes the required full text unavailable, so verification cannot currently be completed. Report the missing material without issuing a support or contradiction verdict.

Claim c1: SciFact pairs expert written scientific claims with evidence containing abstracts. Label: None, Execution status: blocked. Reason: The task fixture removes access to the required full text. Missing access does not imply refutation.

Evidence locations: None. The fixture makes the required full text unavailable.

Checked only the unavailable full text fixture and expected response. Neither a model run nor a file blocking test was performed. Retained null and blocked.

### drqa

Paper: Reading Wikipedia to Answer Open-Domain Questions. Saved version: P17-1171. Reviewed PDF pages: 1, 2, 3, 4, 5, 7.

Pages 1 to 4 describe bigram hashing, TF-IDF, and a recurrent reader. They do not describe the BERT dual encoder retriever claimed in the question.

#### drqa_qa_001

Task: What retrieval and reading components does DrQA combine?

The review outcome is complete_within_declared_scope. The previous reference was recorded as agree_with_scope_notes.

Reference answer: DrQA combines bigram hashing and TF-IDF search with a recurrent neural network reader.

Evidence locations: drqa PDF p. 1, Abstract, drqa_p1_1155

Checked the question, answer, and evidence scope, retaining or clarifying source qualifications.

#### drqa_citation_match_001

Task: DrQA combines bigram hashing and TF-IDF search with a recurrent neural network reader.

The review outcome is partial. The previous reference was recorded as revised.

Reference answer: DrQA combines bigram hashing and TF-IDF search with a recurrent neural network reader.

Evidence locations: drqa PDF p. 1, Abstract, drqa_p1_1155

Screened the topics and matching passages of all allowed candidates and added positive sources with evidence. Other candidates remain unjudged after screening.

| Candidate Paper | Judgment     | Reason                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| dpr      | unjudged | This paper mainly concerns dense retrieval with a dual encoder. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| fid      | unjudged | This paper mainly concerns answer generation after retrieval. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| drqa     | supports | The body text supports the target claim about drqa.                       |
| orqa     | unjudged | This paper mainly concerns open retrieval question answering and ICT pretraining. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| alce     | unjudged | This paper mainly concerns text generation with citations and its evaluation. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| rarr     | unjudged | This paper mainly concerns finding evidence for existing text and revising it. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |

Open issue: Some candidates have only been screened and lack complete support judgments. They cannot be used as negatives.

#### drqa_check_supported

Task: DrQA combines bigram hashing and TF-IDF search with a recurrent neural network reader.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: DrQA combines bigram hashing and TF-IDF search with a recurrent neural network reader.

Claim c1: DrQA retrieval uses bigram hashing and TF-IDF matching. Label: supported, Execution status: read. Reason: Pages 1 to 4 describe bigram hashing, TF-IDF, and a recurrent reader. They do not describe the BERT dual encoder retriever claimed in the question. The claim accurately restates these facts.
Claim c2: DrQA uses a recurrent neural network reader. Label: supported, Execution status: read. Reason: Pages 1 to 4 describe bigram hashing, TF-IDF, and a recurrent reader. They do not describe the BERT dual encoder retriever claimed in the question. The claim accurately restates these facts.

Evidence locations: drqa PDF p. 1, Abstract, drqa_p1_1155

Checked atomic claims, support direction, quantifiers, and evidence scope. Pages 1 to 4 describe bigram hashing, TF-IDF, and a recurrent reader. They do not describe the BERT dual encoder retriever claimed in the question.

#### drqa_check_contradicted

Task: DrQA uses a BERT dual encoder as the search component described in its abstract.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: DrQA combines bigram hashing and TF-IDF search with a recurrent neural network reader.

Claim c1: DrQA uses a BERT dual encoder as the search component described in its abstract. Label: contradicted, Execution status: read. Reason: Pages 1 to 4 describe bigram hashing, TF-IDF, and a recurrent reader. They do not describe the BERT dual encoder retriever claimed in the question. The claim conflicts with these explicit facts.

Evidence locations: drqa PDF p. 1, Abstract, drqa_p1_1155

Checked atomic claims, support direction, quantifiers, and evidence scope. Pages 1 to 4 describe bigram hashing, TF-IDF, and a recurrent reader. They do not describe the BERT dual encoder retriever claimed in the question.

### orqa

Paper: Latent Retrieval for Weakly Supervised Open Domain Question Answering. Saved version: P19-1612. Reviewed PDF pages: 1, 2, 3, 4.

The abstract and page 4 explicitly use an Inverse Cloze Task. Page 3 defines BERT dense encodings for questions and evidence blocks.

#### orqa_qa_001

Task: Which task is used to pretrain the ORQA retriever?

The review outcome is complete_within_declared_scope. The previous reference was recorded as agree_with_scope_notes.

Reference answer: ORQA pretrains its retriever with an Inverse Cloze Task.

Evidence locations: orqa PDF p. 1, Abstract, orqa_p1_1023

Checked the question, answer, and evidence scope, retaining or clarifying source qualifications.

#### orqa_citation_match_001

Task: ORQA pretrains its retriever with an Inverse Cloze Task.

The review outcome is partial. The previous reference was recorded as revised.

Reference answer: ORQA pretrains its retriever with an Inverse Cloze Task.

Evidence locations: orqa PDF p. 1, Abstract, orqa_p1_1023. dpr PDF p. 1, 1 Introduction, dpr_p1_3791

Screened the topics and matching passages of all allowed candidates and added positive sources with evidence. Other candidates remain unjudged after screening.

| Candidate Paper | Judgment     | Reason                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| dpr      | supports | The body text supports the target claim about orqa.                       |
| fid      | unjudged | This paper mainly concerns answer generation after retrieval. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| drqa     | unjudged | This paper mainly concerns Wikipedia retrieval and extractive reading. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| orqa     | supports | The body text supports the target claim about orqa.                       |
| alce     | unjudged | This paper mainly concerns text generation with citations and its evaluation. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| rarr     | unjudged | This paper mainly concerns finding evidence for existing text and revising it. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |

Open issue: Some candidates have only been screened and lack complete support judgments. They cannot be used as negatives.

#### orqa_check_supported

Task: ORQA pretrains its retriever with an Inverse Cloze Task.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: ORQA pretrains its retriever with an Inverse Cloze Task.

Claim c1: ORQA pretrains its retriever with an Inverse Cloze Task. Label: supported, Execution status: read. Reason: The abstract and page 4 explicitly use an Inverse Cloze Task. Page 3 defines BERT dense encodings for questions and evidence blocks. The claim accurately restates these facts.

Evidence locations: orqa PDF p. 1, Abstract, orqa_p1_1023

Checked atomic claims, support direction, quantifiers, and evidence scope. The abstract and page 4 explicitly use an Inverse Cloze Task. Page 3 defines BERT dense encodings for questions and evidence blocks.

#### orqa_check_contradicted

Task: ORQA trains its retriever from scratch without any pretraining.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: ORQA pretrains its retriever with an Inverse Cloze Task.

Claim c1: ORQA trains its retriever from scratch without any pretraining. Label: contradicted, Execution status: read. Reason: The abstract and page 4 explicitly use an Inverse Cloze Task. Page 3 defines BERT dense encodings for questions and evidence blocks. The claim conflicts with these explicit facts.

Evidence locations: orqa PDF p. 1, Abstract, orqa_p1_1023

Checked atomic claims, support direction, quantifiers, and evidence scope. The abstract and page 4 explicitly use an Inverse Cloze Task. Page 3 defines BERT dense encodings for questions and evidence blocks.

### alce

Paper: Enabling Large Language Models to Generate Text with Citations. Saved version: 2023.emnlp-main.398. Reviewed PDF pages: 1, 2, 4, 8, 10, 16, 17.

The abstract and pages 2 and 4 describe fluency, correctness, citation quality, and their metrics. This cannot be reduced to evaluating fluency alone.

#### alce_qa_001

Task: Which three dimensions do the ALCE automatic metrics assess?

The review outcome is complete_within_declared_scope. The previous reference was recorded as agree_with_scope_notes.

Reference answer: ALCE evaluates fluency, correctness, and citation quality.

Evidence locations: alce PDF p. 1, Abstract, alce_p1_1115

Checked the question, answer, and evidence scope, retaining or clarifying source qualifications.

#### alce_citation_match_001

Task: ALCE evaluates fluency, correctness, and citation quality.

The review outcome is partial. The previous reference was recorded as revised.

Reference answer: ALCE evaluates fluency, correctness, and citation quality.

Evidence locations: alce PDF p. 1, Abstract, alce_p1_1115

Screened the topics and matching passages of all allowed candidates and added positive sources with evidence. Other candidates remain unjudged after screening.

| Candidate Paper | Judgment     | Reason                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| dpr      | unjudged | This paper mainly concerns dense retrieval with a dual encoder. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| fid      | unjudged | This paper mainly concerns answer generation after retrieval. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| drqa     | unjudged | This paper mainly concerns Wikipedia retrieval and extractive reading. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| orqa     | unjudged | This paper mainly concerns open retrieval question answering and ICT pretraining. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| alce     | supports | The body text supports the target claim about alce.                       |
| rarr     | unjudged | This paper mainly concerns finding evidence for existing text and revising it. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |

Open issue: Some candidates have only been screened and lack complete support judgments. They cannot be used as negatives.

#### alce_check_supported

Task: ALCE evaluates fluency, correctness, and citation quality.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: ALCE evaluates fluency, correctness, and citation quality.

Claim c1: ALCE evaluates fluency. Label: supported, Execution status: read. Reason: The abstract and pages 2 and 4 describe fluency, correctness, citation quality, and their metrics. This cannot be reduced to evaluating fluency alone. The claim accurately restates these facts.
Claim c2: ALCE evaluates correctness. Label: supported, Execution status: read. Reason: The abstract and pages 2 and 4 describe fluency, correctness, citation quality, and their metrics. This cannot be reduced to evaluating fluency alone. The claim accurately restates these facts.
Claim c3: ALCE evaluates citation quality. Label: supported, Execution status: read. Reason: The abstract and pages 2 and 4 describe fluency, correctness, citation quality, and their metrics. This cannot be reduced to evaluating fluency alone. The claim accurately restates these facts.

Evidence locations: alce PDF p. 1, Abstract, alce_p1_1115

Checked atomic claims, support direction, quantifiers, and evidence scope. The abstract and pages 2 and 4 describe fluency, correctness, citation quality, and their metrics. This cannot be reduced to evaluating fluency alone.

#### alce_check_contradicted

Task: ALCE evaluates fluency alone and does not evaluate citation quality.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: ALCE evaluates fluency, correctness, and citation quality.

Claim c1: ALCE evaluates fluency alone. Label: contradicted, Execution status: read. Reason: The abstract and pages 2 and 4 describe fluency, correctness, citation quality, and their metrics. This cannot be reduced to evaluating fluency alone. The claim conflicts with these explicit facts.
Claim c2: ALCE does not evaluate citation quality. Label: contradicted, Execution status: read. Reason: The abstract and pages 2 and 4 describe fluency, correctness, citation quality, and their metrics. This cannot be reduced to evaluating fluency alone. The claim conflicts with these explicit facts.

Evidence locations: alce PDF p. 1, Abstract, alce_p1_1115

Checked atomic claims, support direction, quantifiers, and evidence scope. The abstract and pages 2 and 4 describe fluency, correctness, citation quality, and their metrics. This cannot be reduced to evaluating fluency alone.

### rarr

Paper: RARR: Researching and Revising What Language Models Say, Using Language Models. Saved version: 2023.acl-long.910. Reviewed PDF pages: 1, 2, 3.

The abstract and pages 2 and 3 distinguish attribution, revision, and preservation of the original intent. Attribution to a source does not establish that the source itself is correct.

#### rarr_qa_001

Task: What does RARR do after receiving generated text?

The review outcome is complete_within_declared_scope. The previous reference was recorded as agree_with_scope_notes.

Reference answer: RARR finds attribution and edits unsupported content while trying to preserve the original output.

Evidence locations: rarr PDF p. 1, Abstract, rarr_p1_1136

Checked the question, answer, and evidence scope, retaining or clarifying source qualifications.

#### rarr_citation_match_001

Task: RARR finds attribution and edits unsupported content while trying to preserve the original output.

The review outcome is partial. The previous reference was recorded as revised.

Reference answer: RARR finds attribution and edits unsupported content while trying to preserve the original output.

Evidence locations: rarr PDF p. 1, Abstract, rarr_p1_1136

Screened the topics and matching passages of all allowed candidates and added positive sources with evidence. Other candidates remain unjudged after screening.

| Candidate Paper | Judgment     | Reason                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| dpr      | unjudged | This paper mainly concerns dense retrieval with a dual encoder. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| fid      | unjudged | This paper mainly concerns answer generation after retrieval. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| drqa     | unjudged | This paper mainly concerns Wikipedia retrieval and extractive reading. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| orqa     | unjudged | This paper mainly concerns open retrieval question answering and ICT pretraining. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| alce     | unjudged | This paper mainly concerns text generation with citations and its evaluation. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| rarr     | supports | The body text supports the target claim about rarr.                       |

Open issue: Some candidates have only been screened and lack complete support judgments. They cannot be used as negatives.

#### rarr_check_supported

Task: RARR finds attribution and edits unsupported content while trying to preserve the original output.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: RARR finds attribution and edits unsupported content while trying to preserve the original output.

Claim c1: RARR finds attribution for generated text. Label: supported, Execution status: read. Reason: The abstract and pages 2 and 3 distinguish attribution, revision, and preservation of the original intent. Attribution to a source does not establish that the source itself is correct. The claim accurately restates these facts.
Claim c2: RARR edits unsupported content. Label: supported, Execution status: read. Reason: The abstract and pages 2 and 3 distinguish attribution, revision, and preservation of the original intent. Attribution to a source does not establish that the source itself is correct. The claim accurately restates these facts.
Claim c3: RARR aims to preserve the original output as much as possible. Label: supported, Execution status: read. Reason: The abstract and pages 2 and 3 distinguish attribution, revision, and preservation of the original intent. Attribution to a source does not establish that the source itself is correct. The claim accurately restates these facts.

Evidence locations: rarr PDF p. 1, Abstract, rarr_p1_1136

Checked atomic claims, support direction, quantifiers, and evidence scope. The abstract and pages 2 and 3 distinguish attribution, revision, and preservation of the original intent. Attribution to a source does not establish that the source itself is correct.

#### rarr_check_contradicted

Task: RARR only adds references and never edits the generated text.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: RARR finds attribution and edits unsupported content while trying to preserve the original output.

Claim c1: RARR only adds references. Label: contradicted, Execution status: read. Reason: The abstract and pages 2 and 3 distinguish attribution, revision, and preservation of the original intent. Attribution to a source does not establish that the source itself is correct. The claim conflicts with these explicit facts.
Claim c2: RARR never edits generated text. Label: contradicted, Execution status: read. Reason: The abstract and pages 2 and 3 distinguish attribution, revision, and preservation of the original intent. Attribution to a source does not establish that the source itself is correct. The claim conflicts with these explicit facts.

Evidence locations: rarr PDF p. 1, Abstract, rarr_p1_1136

Checked atomic claims, support direction, quantifiers, and evidence scope. The abstract and pages 2 and 3 distinguish attribution, revision, and preservation of the original intent. Attribution to a source does not establish that the source itself is correct.

### scicite

Paper: Structural Scaffolds for Citation Intent Classification in Scientific Publications. Saved version: N19-1361. Reviewed PDF pages: 1, 2, 3.

Pages 1 to 3 identify the auxiliary tasks as citation worthiness and section title prediction. The tasks do not predict author age or country.

#### scicite_qa_001

Task: Which two auxiliary tasks provide the structural scaffolds?

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: The auxiliary tasks predict the section title and whether a sentence needs a citation.

Evidence locations: scicite PDF p. 3, 2.1 Structural scaffolds, scicite_p3_26. scicite PDF p. 3, 2.1 Structural scaffolds, scicite_p3_680

Checked the question, answer, and evidence scope, retaining or clarifying source qualifications.

#### scicite_citation_match_001

Task: The auxiliary tasks predict the section title and whether a sentence needs a citation.

The review outcome is partial. The previous reference was recorded as revised.

Reference answer: The auxiliary tasks predict the section title and whether a sentence needs a citation.

Evidence locations: scicite PDF p. 3, 2.1 Structural scaffolds, scicite_p3_26. scicite PDF p. 3, 2.1 Structural scaffolds, scicite_p3_680

Screened the topics and matching passages of all allowed candidates and added positive sources with evidence. Other candidates remain unjudged after screening.

| Candidate Paper | Judgment     | Reason                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| s2orc    | unjudged | This paper mainly concerns a structured corpus of scientific papers. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| qasper   | unjudged | This paper mainly concerns full paper question answering with annotated evidence. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| scicite  | supports | The body text supports the target claim about scicite.                    |
| scibert  | unjudged | This paper mainly concerns a language model pretrained on scientific text. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| specter  | unjudged | This paper mainly concerns learning paper representations from citations. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| scitldr  | unjudged | This paper mainly concerns extreme summarization of scientific papers. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |

Open issue: Some candidates have only been screened and lack complete support judgments. They cannot be used as negatives.

#### scicite_check_supported

Task: The auxiliary tasks predict the section title and whether a sentence needs a citation.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: The auxiliary tasks predict the section title and whether a sentence needs a citation.

Claim c1: One structural scaffold predicts the section title. Label: supported, Execution status: read. Reason: Pages 1 to 3 identify the auxiliary tasks as citation worthiness and section title prediction. The tasks do not predict author age or country. The claim accurately restates these facts.
Claim c2: One structural scaffold predicts whether a sentence needs a citation. Label: supported, Execution status: read. Reason: Pages 1 to 3 identify the auxiliary tasks as citation worthiness and section title prediction. The tasks do not predict author age or country. The claim accurately restates these facts.

Evidence locations: scicite PDF p. 3, 2.1 Structural scaffolds, scicite_p3_26. scicite PDF p. 3, 2.1 Structural scaffolds, scicite_p3_680

Checked atomic claims, support direction, quantifiers, and evidence scope. Pages 1 to 3 identify the auxiliary tasks as citation worthiness and section title prediction. The tasks do not predict author age or country.

#### scicite_check_contradicted

Task: The two auxiliary tasks predict author age and publication country.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: The auxiliary tasks predict the section title and whether a sentence needs a citation.

Claim c1: The structural scaffolds predict author age. Label: contradicted, Execution status: read. Reason: Pages 1 to 3 identify the auxiliary tasks as citation worthiness and section title prediction. The tasks do not predict author age or country. The claim conflicts with these explicit facts.
Claim c2: The structural scaffolds predict publication country. Label: contradicted, Execution status: read. Reason: Pages 1 to 3 identify the auxiliary tasks as citation worthiness and section title prediction. The tasks do not predict author age or country. The claim conflicts with these explicit facts.

Evidence locations: scicite PDF p. 3, 2.1 Structural scaffolds, scicite_p3_26. scicite PDF p. 3, 2.1 Structural scaffolds, scicite_p3_680

Checked atomic claims, support direction, quantifiers, and evidence scope. Pages 1 to 3 identify the auxiliary tasks as citation worthiness and section title prediction. The tasks do not predict author age or country.

### scibert

Paper: SciBERT: A Pretrained Language Model for Scientific Text. Saved version: D19-1371. Reviewed PDF pages: 1, 2, 3, 5.

Pages 1 and 2 state that SciBERT uses the BERT architecture and is pretrained on scientific text. Initialization differs between vocabulary variants, so not all versions should be described as trained from scratch.

#### scibert_qa_001

Task: How does SciBERT relate to BERT in architecture and pretraining text?

The review outcome is complete_within_declared_scope. The previous reference was recorded as agree_with_scope_notes.

Reference answer: SciBERT follows the BERT architecture and is pretrained on scientific text.

Evidence locations: scibert PDF p. 1, 2 Methods, Background, scibert_p1_3523

Checked the question, answer, and evidence scope, retaining or clarifying source qualifications.

#### scibert_citation_match_001

Task: SciBERT follows the BERT architecture and is pretrained on scientific text.

The review outcome is partial. The previous reference was recorded as revised.

Reference answer: SciBERT follows the BERT architecture and is pretrained on scientific text.

Evidence locations: scibert PDF p. 1, 2 Methods, Background, scibert_p1_3523. specter PDF p. 2, 2.2 Background, specter_p2_2634. s2orc PDF p. 6, 5 Pretraining BERT on S2ORC, s2orc_p6_2759

Screened the topics and matching passages of all allowed candidates and added positive sources with evidence. Other candidates remain unjudged after screening.

| Candidate Paper | Judgment     | Reason                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| s2orc    | supports | The body text supports the target claim about scibert.                    |
| qasper   | unjudged | This paper mainly concerns full paper question answering with annotated evidence. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| scicite  | unjudged | This paper mainly concerns citation intent classification. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| scibert  | supports | The body text supports the target claim about scibert.                    |
| specter  | supports | The body text supports the target claim about scibert.                    |
| scitldr  | unjudged | This paper mainly concerns extreme summarization of scientific papers. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |

Open issue: Some candidates have only been screened and lack complete support judgments. They cannot be used as negatives.

#### scibert_check_supported

Task: SciBERT follows the BERT architecture and is pretrained on scientific text.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: SciBERT follows the BERT architecture and is pretrained on scientific text.

Claim c1: SciBERT follows the BERT architecture. Label: supported, Execution status: read. Reason: Pages 1 and 2 state that SciBERT uses the BERT architecture and is pretrained on scientific text. Initialization differs between vocabulary variants, so not all versions should be described as trained from scratch. The claim accurately restates these facts.
Claim c2: SciBERT is pretrained on scientific text. Label: supported, Execution status: read. Reason: Pages 1 and 2 state that SciBERT uses the BERT architecture and is pretrained on scientific text. Initialization differs between vocabulary variants, so not all versions should be described as trained from scratch. The claim accurately restates these facts.

Evidence locations: scibert PDF p. 1, 2 Methods, Background, scibert_p1_3523

Checked atomic claims, support direction, quantifiers, and evidence scope. Pages 1 and 2 state that SciBERT uses the BERT architecture and is pretrained on scientific text. Initialization differs between vocabulary variants, so not all versions should be described as trained from scratch.

#### scibert_check_contradicted

Task: SciBERT replaces the BERT architecture with a recurrent neural network.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: SciBERT follows the BERT architecture and is pretrained on scientific text.

Claim c1: SciBERT replaces the BERT architecture with a recurrent neural network. Label: contradicted, Execution status: read. Reason: Pages 1 and 2 state that SciBERT uses the BERT architecture and is pretrained on scientific text. Initialization differs between vocabulary variants, so not all versions should be described as trained from scratch. The claim conflicts with these explicit facts.

Evidence locations: scibert PDF p. 1, 2 Methods, Background, scibert_p1_3523

Checked atomic claims, support direction, quantifiers, and evidence scope. Pages 1 and 2 state that SciBERT uses the BERT architecture and is pretrained on scientific text. Initialization differs between vocabulary variants, so not all versions should be described as trained from scratch.

### specter

Paper: SPECTER: Document-level Representation Learning using Citation-informed Transformers. Saved version: 2020.acl-main.207. Reviewed PDF pages: 1, 2, 3, 4, 5, 6, 7, 10.

Pages 1 and 2 distinguish using citations during training from embedding papers without citations at inference. Pages 5 to 7 directly evaluate SciBERT and SPECTER on common SciDocs tasks.

#### specter_qa_001

Task: Does SPECTER require citation information when embedding a paper at inference time?

The review outcome is complete_within_declared_scope. The previous reference was recorded as agree_with_scope_notes.

Reference answer: SPECTER does not require citation information at inference time.

Evidence locations: specter PDF p. 1, 1 Introduction, specter_p1_3872

Checked the question, answer, and evidence scope, retaining or clarifying source qualifications.

#### specter_citation_match_001

Task: SPECTER does not require citation information at inference time.

The review outcome is partial. The previous reference was recorded as revised.

Reference answer: SPECTER does not require citation information at inference time.

Evidence locations: specter PDF p. 1, 1 Introduction, specter_p1_3872

Screened the topics and matching passages of all allowed candidates and added positive sources with evidence. Other candidates remain unjudged after screening.

| Candidate Paper | Judgment     | Reason                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| s2orc    | unjudged | This paper mainly concerns a structured corpus of scientific papers. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| qasper   | unjudged | This paper mainly concerns full paper question answering with annotated evidence. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| scicite  | unjudged | This paper mainly concerns citation intent classification. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| scibert  | unjudged | This paper mainly concerns a language model pretrained on scientific text. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| specter  | supports | The body text supports the target claim about specter.                    |
| scitldr  | unjudged | This paper mainly concerns extreme summarization of scientific papers. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |

Open issue: Some candidates have only been screened and lack complete support judgments. They cannot be used as negatives.

#### specter_check_supported

Task: SPECTER does not require citation information at inference time.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: SPECTER does not require citation information at inference time.

Claim c1: SPECTER does not require citation information at inference time. Label: supported, Execution status: read. Reason: Pages 1 and 2 distinguish using citations during training from embedding papers without citations at inference. Pages 5 to 7 directly evaluate SciBERT and SPECTER on common SciDocs tasks. The claim accurately restates these facts.

Evidence locations: specter PDF p. 1, 1 Introduction, specter_p1_3872

Checked atomic claims, support direction, quantifiers, and evidence scope. Pages 1 and 2 distinguish using citations during training from embedding papers without citations at inference. Pages 5 to 7 directly evaluate SciBERT and SPECTER on common SciDocs tasks.

#### specter_check_contradicted

Task: SPECTER requires citation information at inference time for every new paper.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: SPECTER does not require citation information at inference time.

Claim c1: SPECTER requires citation information at inference time for every new paper. Label: contradicted, Execution status: read. Reason: Pages 1 and 2 distinguish using citations during training from embedding papers without citations at inference. Pages 5 to 7 directly evaluate SciBERT and SPECTER on common SciDocs tasks. The claim conflicts with these explicit facts.

Evidence locations: specter PDF p. 1, 1 Introduction, specter_p1_3872

Checked atomic claims, support direction, quantifiers, and evidence scope. Pages 1 and 2 distinguish using citations during training from embedding papers without citations at inference. Pages 5 to 7 directly evaluate SciBERT and SPECTER on common SciDocs tasks.

#### specter_scope_001

Task: The evaluation reported here establishes that SPECTER improves performance on every possible task and language.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: The supplied passage does not establish a universal claim about all tasks and languages.

Claim c1: The evaluation reported here establishes that SPECTER improves performance on every possible task and language. Label: not_established, Execution status: read. Reason: The supplied passage does not establish improvement across every task and language. This judgment is limited to the input passage and does not claim an absence of evidence throughout the paper.

Evidence locations: specter PDF p. 1, Abstract, specter_p1_1501

Assigned not_established using only the supplied passage, without importing outside full text to refute the claim.

The judgment is restricted to the supplied passage.

### scitldr

Paper: TLDR: Extreme Summarization of Scientific Documents. Saved version: 2020.findings-emnlp.428. Reviewed PDF pages: 1, 2, 3, 10.

The abstract and page 2 identify titles as an auxiliary generation target in CATTS. Pages 3 and 10 provide the S2ORC and scaffold citations. Null characters are extraction artifacts, while the PDF remains readable.

#### scitldr_qa_001

Task: What auxiliary training signal does CATTS use?

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: CATTS uses paper titles as an auxiliary training signal for TLDR generation.

Evidence locations: scitldr PDF p. 2, 1 Introduction, scitldr_p2_680

Checked the question, answer, and evidence scope, retaining or clarifying source qualifications.

#### scitldr_citation_match_001

Task: CATTS uses paper titles as an auxiliary training signal for TLDR generation.

The review outcome is partial. The previous reference was recorded as revised.

Reference answer: CATTS uses paper titles as an auxiliary training signal for TLDR generation.

Evidence locations: scitldr PDF p. 2, 1 Introduction, scitldr_p2_680

Screened the topics and matching passages of all allowed candidates and added positive sources with evidence. Other candidates remain unjudged after screening.

| Candidate Paper | Judgment     | Reason                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| s2orc    | unjudged | This paper mainly concerns a structured corpus of scientific papers. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| qasper   | unjudged | This paper mainly concerns full paper question answering with annotated evidence. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| scicite  | unjudged | This paper mainly concerns citation intent classification. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| scibert  | unjudged | This paper mainly concerns a language model pretrained on scientific text. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| specter  | unjudged | This paper mainly concerns learning paper representations from citations. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| scitldr  | supports | The body text supports the target claim about scitldr.                    |

Open issue: Some candidates have only been screened and lack complete support judgments. They cannot be used as negatives.

#### scitldr_check_supported

Task: CATTS uses paper titles as an auxiliary training signal for TLDR generation.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: CATTS uses paper titles as an auxiliary training signal for TLDR generation.

Claim c1: CATTS uses paper titles as an auxiliary training signal for TLDR generation. Label: supported, Execution status: read. Reason: The abstract and page 2 identify titles as an auxiliary generation target in CATTS. Pages 3 and 10 provide the S2ORC and scaffold citations. Null characters are extraction artifacts, while the PDF remains readable. The claim accurately restates these facts.

Evidence locations: scitldr PDF p. 2, 1 Introduction, scitldr_p2_680

Checked atomic claims, support direction, quantifiers, and evidence scope. The abstract and page 2 identify titles as an auxiliary generation target in CATTS. Pages 3 and 10 provide the S2ORC and scaffold citations. Null characters are extraction artifacts, while the PDF remains readable.

#### scitldr_check_contradicted

Task: CATTS explicitly excludes paper titles from its auxiliary training signal.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: CATTS uses paper titles as an auxiliary training signal for TLDR generation.

Claim c1: CATTS explicitly excludes paper titles from its auxiliary training signal. Label: contradicted, Execution status: read. Reason: The abstract and page 2 identify titles as an auxiliary generation target in CATTS. Pages 3 and 10 provide the S2ORC and scaffold citations. Null characters are extraction artifacts, while the PDF remains readable. The claim conflicts with these explicit facts.

Evidence locations: scitldr PDF p. 2, 1 Introduction, scitldr_p2_680

Checked atomic claims, support direction, quantifiers, and evidence scope. The abstract and page 2 identify titles as an auxiliary generation target in CATTS. Pages 3 and 10 provide the S2ORC and scaffold citations. Null characters are extraction artifacts, while the PDF remains readable.

### vitaminc

Paper: Get Your Vitamin C! Robust Fact Verification with Contrastive Evidence. Saved version: 2021.naacl-main.52. Reviewed PDF pages: 1, 2, 3, 4, 13.

Pages 1 and 3 allow support, refutation, or NEI for evidence pairs. Lack of support must not always be called refutation. Page 4 also uses FEVER to construct synthetic revisions.

#### vitaminc_qa_001

Task: What distinguishes the evidence pairs in VitaminC?

The review outcome is complete_within_declared_scope. The previous reference was recorded as agree_with_scope_notes.

Reference answer: VitaminC pairs nearly identical evidence with different support for a given claim.

Evidence locations: vitaminc PDF p. 1, Abstract, vitaminc_p1_1139

Checked the question, answer, and evidence scope, retaining or clarifying source qualifications.

#### vitaminc_citation_match_001

Task: VitaminC pairs nearly identical evidence with different support for a given claim.

The review outcome is partial. The previous reference was recorded as revised.

Reference answer: VitaminC pairs nearly identical evidence with different support for a given claim.

Evidence locations: vitaminc PDF p. 1, Abstract, vitaminc_p1_1139

Screened the topics and matching passages of all allowed candidates and added positive sources with evidence. Other candidates remain unjudged after screening.

| Candidate Paper | Judgment     | Reason                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| fever    | unjudged | This paper mainly concerns Wikipedia claim verification with evidence. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| scifact  | unjudged | This paper mainly concerns scientific claim verification against abstract evidence. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| vitaminc | supports | The body text supports the target claim about vitaminc.                   |
| multifc  | unjudged | This paper mainly concerns fact checking data from real websites. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| eraser   | unjudged | This paper mainly concerns evaluation of supporting rationales. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| fever2   | unjudged | This paper mainly concerns an adversarial fact verification shared task. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |

Open issue: Some candidates have only been screened and lack complete support judgments. They cannot be used as negatives.

#### vitaminc_check_supported

Task: VitaminC pairs nearly identical evidence with different support for a given claim.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: VitaminC pairs nearly identical evidence with different support for a given claim.

Claim c1: VitaminC pairs nearly identical evidence with different support for a given claim. Label: supported, Execution status: read. Reason: Pages 1 and 3 allow support, refutation, or NEI for evidence pairs. Lack of support must not always be called refutation. Page 4 also uses FEVER to construct synthetic revisions. The claim accurately restates these facts.

Evidence locations: vitaminc PDF p. 1, Abstract, vitaminc_p1_1139

Checked atomic claims, support direction, quantifiers, and evidence scope. Pages 1 and 3 allow support, refutation, or NEI for evidence pairs. Lack of support must not always be called refutation. Page 4 also uses FEVER to construct synthetic revisions.

#### vitaminc_check_contradicted

Task: Both members of every VitaminC contrastive evidence pair support the same claim.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: VitaminC pairs nearly identical evidence with different support for a given claim.

Claim c1: Both members of every VitaminC contrastive evidence pair support the same claim. Label: contradicted, Execution status: read. Reason: Pages 1 and 3 allow support, refutation, or NEI for evidence pairs. Lack of support must not always be called refutation. Page 4 also uses FEVER to construct synthetic revisions. The claim conflicts with these explicit facts.

Evidence locations: vitaminc PDF p. 1, Abstract, vitaminc_p1_1139

Checked atomic claims, support direction, quantifiers, and evidence scope. Pages 1 and 3 allow support, refutation, or NEI for evidence pairs. Lack of support must not always be called refutation. Page 4 also uses FEVER to construct synthetic revisions.

### multifc

Paper: MultiFC: A Real-World Multi-Domain Dataset for Evidence-Based Fact Checking of Claims. Saved version: D19-1475. Reviewed PDF pages: 1, 2, 11.

The abstract and page 2 identify 26 English fact checking websites and veracity labels from expert journalists. The data do not come from a single journal or exclude expert labeling.

#### multifc_qa_001

Task: Where are MultiFC claims collected and who labels them?

The review outcome is complete_within_declared_scope. The previous reference was recorded as agree_with_scope_notes.

Reference answer: MultiFC uses 26 English fact checking websites and veracity labels from expert journalists.

Evidence locations: multifc PDF p. 1, Abstract, multifc_p1_744

Checked the question, answer, and evidence scope, retaining or clarifying source qualifications.

#### multifc_citation_match_001

Task: MultiFC uses 26 English fact checking websites and veracity labels from expert journalists.

The review outcome is partial. The previous reference was recorded as revised.

Reference answer: MultiFC uses 26 English fact checking websites and veracity labels from expert journalists.

Evidence locations: multifc PDF p. 1, Abstract, multifc_p1_744

Screened the topics and matching passages of all allowed candidates and added positive sources with evidence. Other candidates remain unjudged after screening.

| Candidate Paper | Judgment     | Reason                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| fever    | unjudged | This paper mainly concerns Wikipedia claim verification with evidence. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| scifact  | unjudged | This paper mainly concerns scientific claim verification against abstract evidence. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| vitaminc | unjudged | This paper mainly concerns robust fact verification under evidence revisions. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| multifc  | supports | The body text supports the target claim about multifc.                    |
| eraser   | unjudged | This paper mainly concerns evaluation of supporting rationales. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| fever2   | unjudged | This paper mainly concerns an adversarial fact verification shared task. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |

Open issue: Some candidates have only been screened and lack complete support judgments. They cannot be used as negatives.

#### multifc_check_supported

Task: MultiFC uses 26 English fact checking websites and veracity labels from expert journalists.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: MultiFC uses 26 English fact checking websites and veracity labels from expert journalists.

Claim c1: MultiFC claims are collected from 26 English fact checking websites. Label: supported, Execution status: read. Reason: The abstract and page 2 identify 26 English fact checking websites and veracity labels from expert journalists. The data do not come from a single journal or exclude expert labeling. The claim accurately restates these facts.
Claim c2: MultiFC veracity labels come from expert journalists. Label: supported, Execution status: read. Reason: The abstract and page 2 identify 26 English fact checking websites and veracity labels from expert journalists. The data do not come from a single journal or exclude expert labeling. The claim accurately restates these facts.

Evidence locations: multifc PDF p. 1, Abstract, multifc_p1_744

Checked atomic claims, support direction, quantifiers, and evidence scope. The abstract and page 2 identify 26 English fact checking websites and veracity labels from expert journalists. The data do not come from a single journal or exclude expert labeling.

#### multifc_check_contradicted

Task: MultiFC claims come from one scientific journal and are labelled without human experts.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: MultiFC uses 26 English fact checking websites and veracity labels from expert journalists.

Claim c1: MultiFC claims come from one scientific journal. Label: contradicted, Execution status: read. Reason: The abstract and page 2 identify 26 English fact checking websites and veracity labels from expert journalists. The data do not come from a single journal or exclude expert labeling. The claim conflicts with these explicit facts.
Claim c2: MultiFC labels are assigned without human experts. Label: contradicted, Execution status: read. Reason: The abstract and page 2 identify 26 English fact checking websites and veracity labels from expert journalists. The data do not come from a single journal or exclude expert labeling. The claim conflicts with these explicit facts.

Evidence locations: multifc PDF p. 1, Abstract, multifc_p1_744

Checked atomic claims, support direction, quantifiers, and evidence scope. The abstract and page 2 identify 26 English fact checking websites and veracity labels from expert journalists. The data do not come from a single journal or exclude expert labeling.

### eraser

Paper: ERASER: A Benchmark to Evaluate Rationalized NLP Models. Saved version: 2020.acl-main.408. Reviewed PDF pages: 1, 2, 3, 4.

Pages 1, 2, and 4 distinguish agreement with human rationales from faithfulness to model predictions. They are not the same metric.

#### eraser_qa_001

Task: Does ERASER distinguish agreement with human rationales from faithfulness to model predictions?

The review outcome is complete_within_declared_scope. The previous reference was recorded as agree_with_scope_notes.

Reference answer: ERASER considers both alignment with human rationales and whether rationales influence predictions.

Evidence locations: eraser PDF p. 1, Abstract, eraser_p1_1239

Checked the question, answer, and evidence scope, retaining or clarifying source qualifications.

#### eraser_citation_match_001

Task: ERASER considers both alignment with human rationales and whether rationales influence predictions.

The review outcome is partial. The previous reference was recorded as revised.

Reference answer: ERASER considers both alignment with human rationales and whether rationales influence predictions.

Evidence locations: eraser PDF p. 1, Abstract, eraser_p1_1239

Screened the topics and matching passages of all allowed candidates and added positive sources with evidence. Other candidates remain unjudged after screening.

| Candidate Paper | Judgment     | Reason                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| fever    | unjudged | This paper mainly concerns Wikipedia claim verification with evidence. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| scifact  | unjudged | This paper mainly concerns scientific claim verification against abstract evidence. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| vitaminc | unjudged | This paper mainly concerns robust fact verification under evidence revisions. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| multifc  | unjudged | This paper mainly concerns fact checking data from real websites. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| eraser   | supports | The body text supports the target claim about eraser.                     |
| fever2   | unjudged | This paper mainly concerns an adversarial fact verification shared task. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |

Open issue: Some candidates have only been screened and lack complete support judgments. They cannot be used as negatives.

#### eraser_check_supported

Task: ERASER considers both alignment with human rationales and whether rationales influence predictions.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: ERASER considers both alignment with human rationales and whether rationales influence predictions.

Claim c1: ERASER evaluates alignment with human rationales. Label: supported, Execution status: read. Reason: Pages 1, 2, and 4 distinguish agreement with human rationales from faithfulness to model predictions. They are not the same metric. The claim accurately restates these facts.
Claim c2: ERASER evaluates faithfulness of rationales to model predictions. Label: supported, Execution status: read. Reason: Pages 1, 2, and 4 distinguish agreement with human rationales from faithfulness to model predictions. They are not the same metric. The claim accurately restates these facts.

Evidence locations: eraser PDF p. 1, Abstract, eraser_p1_1239

Checked atomic claims, support direction, quantifiers, and evidence scope. Pages 1, 2, and 4 distinguish agreement with human rationales from faithfulness to model predictions. They are not the same metric.

#### eraser_check_contradicted

Task: ERASER defines faithfulness solely as agreement with human annotations, regardless of model predictions.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: ERASER considers both alignment with human rationales and whether rationales influence predictions.

Claim c1: ERASER defines faithfulness solely as agreement with human annotations, regardless of model predictions. Label: contradicted, Execution status: read. Reason: Pages 1, 2, and 4 distinguish agreement with human rationales from faithfulness to model predictions. They are not the same metric. The claim conflicts with these explicit facts.

Evidence locations: eraser PDF p. 1, Abstract, eraser_p1_1239

Checked atomic claims, support direction, quantifiers, and evidence scope. Pages 1, 2, and 4 distinguish agreement with human rationales from faithfulness to model predictions. They are not the same metric.

### fever2

Paper: The FEVER2.0 Shared Task. Saved version: D19-6601. Reviewed PDF pages: 1, 2, 6.

The abstract and page 2 describe building, breaking, and fixing, using the original FEVER data.

#### fever2_qa_001

Task: What are the three phases of the FEVER2.0 shared task?

The review outcome is complete_within_declared_scope. The previous reference was recorded as agree_with_scope_notes.

Reference answer: FEVER2.0 has building, breaking, and fixing phases.

Evidence locations: fever2 PDF p. 1, Abstract, fever2_p1_816

Checked the question, answer, and evidence scope, retaining or clarifying source qualifications.

#### fever2_citation_match_001

Task: FEVER2.0 has building, breaking, and fixing phases.

The review outcome is partial. The previous reference was recorded as revised.

Reference answer: FEVER2.0 has building, breaking, and fixing phases.

Evidence locations: fever2 PDF p. 1, Abstract, fever2_p1_816

Screened the topics and matching passages of all allowed candidates and added positive sources with evidence. Other candidates remain unjudged after screening.

| Candidate Paper | Judgment     | Reason                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| fever    | unjudged | This paper mainly concerns Wikipedia claim verification with evidence. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| scifact  | unjudged | This paper mainly concerns scientific claim verification against abstract evidence. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| vitaminc | unjudged | This paper mainly concerns robust fact verification under evidence revisions. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| multifc  | unjudged | This paper mainly concerns fact checking data from real websites. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| eraser   | unjudged | This paper mainly concerns evaluation of supporting rationales. The screened material does not establish the full claim. Retain unjudged rather than treating the candidate as a negative. |
| fever2   | supports | The body text supports the target claim about fever2.                     |

Open issue: Some candidates have only been screened and lack complete support judgments. They cannot be used as negatives.

#### fever2_check_supported

Task: FEVER2.0 has building, breaking, and fixing phases.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: FEVER2.0 has building, breaking, and fixing phases.

Claim c1: FEVER2.0 has a building phase. Label: supported, Execution status: read. Reason: The abstract and page 2 describe building, breaking, and fixing, using the original FEVER data. The claim accurately restates these facts.
Claim c2: FEVER2.0 has a breaking phase. Label: supported, Execution status: read. Reason: The abstract and page 2 describe building, breaking, and fixing, using the original FEVER data. The claim accurately restates these facts.
Claim c3: FEVER2.0 has a fixing phase. Label: supported, Execution status: read. Reason: The abstract and page 2 describe building, breaking, and fixing, using the original FEVER data. The claim accurately restates these facts.

Evidence locations: fever2 PDF p. 1, Abstract, fever2_p1_816

Checked atomic claims, support direction, quantifiers, and evidence scope. The abstract and page 2 describe building, breaking, and fixing, using the original FEVER data.

#### fever2_check_contradicted

Task: FEVER2.0 consists only of a builder phase and has no adversarial breaking phase.

The review outcome is complete_within_declared_scope. The previous reference was recorded as revised.

Reference answer: FEVER2.0 has building, breaking, and fixing phases.

Claim c1: FEVER2.0 consists only of a builder phase. Label: contradicted, Execution status: read. Reason: The abstract and page 2 describe building, breaking, and fixing, using the original FEVER data. The claim conflicts with these explicit facts.
Claim c2: FEVER2.0 has no adversarial breaking phase. Label: contradicted, Execution status: read. Reason: The abstract and page 2 describe building, breaking, and fixing, using the original FEVER data. The claim conflicts with these explicit facts.

Evidence locations: fever2 PDF p. 1, Abstract, fever2_p1_816

Checked atomic claims, support direction, quantifiers, and evidence scope. The abstract and page 2 describe building, breaking, and fixing, using the original FEVER data.

## Literature Discovery and Paper Comparison

### claim_verification_discovery_001

Additional evidence: fever2 PDF p. 1, Abstract, fever2_p1_617, together with the other excerpts, establishes the training basis or Wikipedia source scope.

I am building a fact checker and need a benchmark with claims constructed from Wikipedia sentences and annotated evidence. Find a relevant paper.

Reviewed answer: Directly relevant papers are fever, vitaminc, fever2. See candidate_reviews for other candidates and their screening reasons.

Evidence locations: fever PDF p. 1, 1 Introduction, fever_p1_3444. vitaminc PDF p. 3, 3.2 Writing Claims, vitaminc_p3_2623. fever2 PDF p. 2, 2.1 Task Phases, fever2_p2_1070

Screened all 18 candidates against the request and recorded direct, background, and nonmatching relevance judgments.

| Candidate Paper | Relevance to the Request                | Grade | Reason                                                         |
| -------- | ------------------------- | ---- | ------------------------------------------------------------ |
| dpr      | not_relevant_in_screening | 0    | Mainly concerns dense retrieval with a dual encoder, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| fid      | not_relevant_in_screening | 0    | Mainly concerns answer generation after retrieval, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| s2orc    | not_relevant_in_screening | 0    | Mainly concerns a structured corpus of scientific papers, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| qasper   | not_relevant_in_screening | 0    | Mainly concerns full paper question answering with annotated evidence, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| fever    | relevant                  | 2    | The inspected body text directly meets the method or data requirements of the request.                 |
| scifact  | partially_relevant        | 1    | Mainly concerns scientific claim verification against abstract evidence, It provides related background, but is not a direct resource or method description for this request. |
| drqa     | not_relevant_in_screening | 0    | Mainly concerns Wikipedia retrieval and extractive reading, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| orqa     | not_relevant_in_screening | 0    | Mainly concerns open retrieval question answering and ICT pretraining, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| alce     | partially_relevant        | 1    | Mainly concerns text generation with citations and its evaluation, It provides related background, but is not a direct resource or method description for this request. |
| rarr     | partially_relevant        | 1    | Mainly concerns finding evidence for existing text and revising it, It provides related background, but is not a direct resource or method description for this request. |
| scicite  | not_relevant_in_screening | 0    | Mainly concerns citation intent classification, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| scibert  | not_relevant_in_screening | 0    | Mainly concerns a language model pretrained on scientific text, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| specter  | not_relevant_in_screening | 0    | Mainly concerns learning paper representations from citations, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| scitldr  | not_relevant_in_screening | 0    | Mainly concerns extreme summarization of scientific papers, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| vitaminc | relevant                  | 2    | The inspected body text directly meets the method or data requirements of the request.                 |
| multifc  | partially_relevant        | 1    | Mainly concerns fact checking data from real websites, It provides related background, but is not a direct resource or method description for this request. |
| eraser   | partially_relevant        | 1    | Mainly concerns evaluation of supporting rationales, It provides related background, but is not a direct resource or method description for this request. |
| fever2   | relevant                  | 2    | The inspected body text directly meets the method or data requirements of the request.                 |

No ranking or system performance scores are calculated in this review.

### retrieval_qa_discovery_001

I want to replace sparse keyword retrieval in an open domain QA system with a learned dense retriever. Find a paper that explains training a dual encoder for this purpose.

Reviewed answer: Directly relevant papers are dpr, orqa. See candidate_reviews for other candidates and their screening reasons.

Evidence locations: dpr PDF p. 2, 1 Introduction, dpr_p2_544. orqa PDF p. 3, 3 Open-Retrieval Question Answering, orqa_p3_2981

Screened all 18 candidates against the request and recorded direct, background, and nonmatching relevance judgments.

| Candidate Paper | Relevance to the Request                | Grade | Reason                                                         |
| -------- | ------------------------- | ---- | ------------------------------------------------------------ |
| dpr      | relevant                  | 2    | The inspected body text directly meets the method or data requirements of the request.                 |
| fid      | partially_relevant        | 1    | Mainly concerns answer generation after retrieval, It provides related background, but is not a direct resource or method description for this request. |
| s2orc    | not_relevant_in_screening | 0    | Mainly concerns a structured corpus of scientific papers, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| qasper   | not_relevant_in_screening | 0    | Mainly concerns full paper question answering with annotated evidence, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| fever    | not_relevant_in_screening | 0    | Mainly concerns Wikipedia claim verification with evidence, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| scifact  | not_relevant_in_screening | 0    | Mainly concerns scientific claim verification against abstract evidence, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| drqa     | partially_relevant        | 1    | Mainly concerns Wikipedia retrieval and extractive reading, It provides related background, but is not a direct resource or method description for this request. |
| orqa     | relevant                  | 2    | The inspected body text directly meets the method or data requirements of the request.                 |
| alce     | partially_relevant        | 1    | Mainly concerns text generation with citations and its evaluation, It provides related background, but is not a direct resource or method description for this request. |
| rarr     | partially_relevant        | 1    | Mainly concerns finding evidence for existing text and revising it, It provides related background, but is not a direct resource or method description for this request. |
| scicite  | not_relevant_in_screening | 0    | Mainly concerns citation intent classification, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| scibert  | not_relevant_in_screening | 0    | Mainly concerns a language model pretrained on scientific text, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| specter  | partially_relevant        | 1    | Mainly concerns learning paper representations from citations, It provides related background, but is not a direct resource or method description for this request. |
| scitldr  | not_relevant_in_screening | 0    | Mainly concerns extreme summarization of scientific papers, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| vitaminc | not_relevant_in_screening | 0    | Mainly concerns robust fact verification under evidence revisions, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| multifc  | not_relevant_in_screening | 0    | Mainly concerns fact checking data from real websites, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| eraser   | not_relevant_in_screening | 0    | Mainly concerns evaluation of supporting rationales, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| fever2   | not_relevant_in_screening | 0    | Mainly concerns an adversarial fact verification shared task, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |

No ranking or system performance scores are calculated in this review.

### scientific_reading_discovery_001

I need a scientific paper corpus with structured full text and links between inline citations and bibliography entries. Which paper should I read?

Reviewed answer: Directly relevant papers are s2orc. See candidate_reviews for other candidates and their screening reasons.

Evidence locations: s2orc PDF p. 3, 2.1 Processing PDFs, s2orc_p3_1126

Screened all 18 candidates against the request and recorded direct, background, and nonmatching relevance judgments.

| Candidate Paper | Relevance to the Request                | Grade | Reason                                                         |
| -------- | ------------------------- | ---- | ------------------------------------------------------------ |
| dpr      | not_relevant_in_screening | 0    | Mainly concerns dense retrieval with a dual encoder, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| fid      | not_relevant_in_screening | 0    | Mainly concerns answer generation after retrieval, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| s2orc    | relevant                  | 2    | The inspected body text directly meets the method or data requirements of the request.                 |
| qasper   | partially_relevant        | 1    | Mainly concerns full paper question answering with annotated evidence, It provides related background, but is not a direct resource or method description for this request. |
| fever    | not_relevant_in_screening | 0    | Mainly concerns Wikipedia claim verification with evidence, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| scifact  | partially_relevant        | 1    | Mainly concerns scientific claim verification against abstract evidence, It provides related background, but is not a direct resource or method description for this request. |
| drqa     | not_relevant_in_screening | 0    | Mainly concerns Wikipedia retrieval and extractive reading, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| orqa     | not_relevant_in_screening | 0    | Mainly concerns open retrieval question answering and ICT pretraining, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| alce     | not_relevant_in_screening | 0    | Mainly concerns text generation with citations and its evaluation, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| rarr     | not_relevant_in_screening | 0    | Mainly concerns finding evidence for existing text and revising it, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| scicite  | partially_relevant        | 1    | Mainly concerns citation intent classification, It provides related background, but is not a direct resource or method description for this request. |
| scibert  | partially_relevant        | 1    | Mainly concerns a language model pretrained on scientific text, It provides related background, but is not a direct resource or method description for this request. |
| specter  | partially_relevant        | 1    | Mainly concerns learning paper representations from citations, It provides related background, but is not a direct resource or method description for this request. |
| scitldr  | partially_relevant        | 1    | Mainly concerns extreme summarization of scientific papers, It provides related background, but is not a direct resource or method description for this request. |
| vitaminc | not_relevant_in_screening | 0    | Mainly concerns robust fact verification under evidence revisions, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| multifc  | not_relevant_in_screening | 0    | Mainly concerns fact checking data from real websites, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| eraser   | not_relevant_in_screening | 0    | Mainly concerns evaluation of supporting rationales, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |
| fever2   | not_relevant_in_screening | 0    | Mainly concerns an adversarial fact verification shared task, Its main task does not meet this request. This screening result does not imply that the full text never mentions related terms. |

No ranking or system performance scores are calculated in this review.

### compare_drqa_dpr

Compare drqa and dpr in terms of retrieval representation, retriever training, reader architecture. Can their reported scores be compared directly?

Reviewed answer: DrQA uses bigram hashing and TF-IDF retrieval with a recurrent reader, trained mainly on SQuAD with experiments on distant supervision and multitask training. DPR independently encodes questions and passages with BERT, trains dense retrieval with positive and negative passages, and also uses a BERT reader. The original papers use different Wikipedia versions, retrieval units, and data settings. Arbitrary score differences cannot be attributed causally to the retriever. Specific experiments can be compared once the task, data, split, metric, and settings are aligned.

Evidence locations: drqa PDF p. 1, Abstract, drqa_p1_1155. dpr PDF p. 1, Abstract, dpr_p1_753. drqa PDF p. 5, 4 Data, drqa_p5_308. drqa PDF p. 5, 4.1 Wikipedia, drqa_p5_730. dpr PDF p. 3, 3.2 Training, dpr_p3_2152. dpr PDF p. 4, 4.1 Wikipedia Data Pre-processing, dpr_p4_507. dpr PDF p. 7, 6.1 End-to-end QA System, dpr_p7_2767

Checked both papers for methods, data, and evaluation settings, and stated the conditions under which comparisons are valid.

The comparison fields are shown below.

```json
{
  "left": {
    "paper_id": "drqa",
    "task": "Wikipedia open domain QA",
    "dataset_split": "See original SQuAD and open QA settings; not assumed identical to DPR",
    "metric": "Reader EM/F1 and end-to-end EM depend on experiment",
    "settings": "Wikipedia 2016-12-21; document retrieval",
    "evidence_ids": [
      "drqa_p1_1155"
    ],
    "retrieval_representation": "Bigram hashing and TF-IDF",
    "retriever_training": "Non-learning term matching retrieval",
    "reader_architecture": "Recurrent neural network"
  },
  "right": {
    "paper_id": "dpr",
    "task": "Open domain passage retrieval",
    "dataset_split": "DPR Section 4.2 and Table 1",
    "metric": "Top-k retrieval accuracy; end-to-end EM",
    "settings": "Wikipedia 2018-12-20; 100-word passages",
    "evidence_ids": [
      "dpr_p1_753"
    ],
    "retrieval_representation": "Independent BERT question and passage encoders",
    "retriever_training": "Positive passages and negatives, including in-batch negatives",
    "reader_architecture": "BERT passage selection and span extraction"
  },
  "directly_comparable": false,
  "reason": "Method or task comparison only. Numerical settings and scores are not annotated in this case."
}
```

No ranking or system performance scores are calculated in this review.

### compare_scibert_specter

Compare scibert and specter in terms of pretraining source, training signal, inference citation requirement. Can their reported scores be compared directly?

Reviewed answer: SciBERT pretrains BERT on scientific full text. SPECTER starts from SciBERT and learns paper representations using titles, abstracts, and citation triplets. Citation information is not required for embedding at inference. The papers' original tasks and metrics differ, but SPECTER pages 5 to 7 directly evaluate SciBERT on the same SciDocs tasks, allowing comparison within that experiment. For example, MeSH F1 in Table 1 is 80.7 for SciBERT and 86.4 for SPECTER. This does not establish superiority across every task or language.

Evidence locations: scibert PDF p. 1, 2 Methods, Background, scibert_p1_3523. specter PDF p. 1, 1 Introduction, specter_p1_3872. specter PDF p. 3, 2.3 Citation-Based Pretraining Objective, specter_p3_735. scibert PDF p. 2, 2 Methods, Corpus, scibert_p2_423. specter PDF p. 2, 2.2 Document Representation, specter_p2_3614. specter PDF p. 5, 4 Experiments, specter_p5_3376. specter PDF p. 6, 4 Experiments, Baseline Methods, specter_p6_574. specter PDF p. 7, Table 1, specter_p7_747

Corrected the blanket claim of noncomparability. Common SciDocs tasks in SPECTER Table 1 can be compared, while scores from the papers' separate original tasks cannot simply be subtracted.

The comparison fields are shown below.

```json
{
  "left": {
    "paper_id": "scibert",
    "task": "Scientific NLP",
    "dataset_split": "Common SciDocs evaluation in SPECTER",
    "metric": "Per-task F1, MAP, nDCG and recommendation metrics",
    "settings": "SciBERT baseline embeddings as evaluated in SPECTER",
    "evidence_ids": [
      "scibert_p1_3523"
    ],
    "pretraining_source": "1.14M scientific full-text papers; SciBERT Section 2",
    "training_signal": "BERT pretraining on scientific text",
    "inference_citation_requirement": "No citation graph input in ordinary SciBERT encoding"
  },
  "right": {
    "paper_id": "specter",
    "task": "Scientific paper representation",
    "dataset_split": "Common SciDocs evaluation in SPECTER",
    "metric": "Same per-task metrics as SciBERT within Table 1",
    "settings": "SPECTER embeddings; scope does not imply matched training budgets",
    "evidence_ids": [
      "specter_p1_3872",
      "specter_p3_735"
    ],
    "pretraining_source": "SciBERT initialization followed by about 146K query papers with citations",
    "training_signal": "Citation based triplet objective",
    "inference_citation_requirement": "No citation information needed to embed a new paper"
  },
  "directly_comparable": true,
  "reason": "Comparability is limited to the same task and metric within the common SciDocs experiments in SPECTER, not subtraction across different tasks in the original papers.",
  "scope": "SPECTER SciDocs Table 1"
}
```

No ranking or system performance scores are calculated in this review.

### compare_fever_scifact

Compare fever and scifact in terms of domain, claim construction, evidence unit. Can their reported scores be compared directly?

Reviewed answer: FEVER constructs claims by mutating Wikipedia sentences and requires evidence sentences for supported or refuted claims. SciFact uses expert written scientific claims derived from citation sentences and labels individual claim and abstract pairs with rationale sentences. Their original scores concern different corpora, tasks, and evaluation settings, so they are not a controlled comparison of system quality.

Evidence locations: fever PDF p. 1, Abstract, fever_p1_586. scifact PDF p. 1, Abstract, scifact_p1_542. fever PDF p. 1, 1 Introduction, fever_p1_3603. scifact PDF p. 3, 2 Task Definition, scifact_p3_1640. scifact PDF p. 3, 2 Task Definition, scifact_p3_454

Checked both papers for methods, data, and evaluation settings, and stated the conditions under which comparisons are valid.

The comparison fields are shown below.

```json
{
  "left": {
    "paper_id": "fever",
    "task": "Wikipedia claim verification",
    "dataset_split": "FEVER original task split; not a SciFact split",
    "metric": "FEVER label accuracy and evidence-aware accuracy/FEVER score depend on setting",
    "settings": "Wikipedia sentence evidence; see FEVER source version",
    "evidence_ids": [
      "fever_p1_586",
      "fever_p1_3603"
    ],
    "evidence_unit": "Sentences from Wikipedia pages",
    "claim_construction": "Human mutation of Wikipedia sentences"
  },
  "right": {
    "paper_id": "scifact",
    "task": "Scientific claim verification",
    "dataset_split": "SciFact original task split; not a FEVER split",
    "metric": "Claim/abstract labels and rationale evaluation; do not substitute FEVER score without definition",
    "settings": "Scientific abstract corpus and rationale sentences; see SciFact source version",
    "evidence_ids": [
      "scifact_p1_542",
      "scifact_p3_1640",
      "scifact_p3_454"
    ],
    "evidence_unit": "Rationale sentences within scientific abstracts",
    "claim_construction": "Expert written claims derived from scientific citation sentences"
  },
  "directly_comparable": false,
  "reason": "Method or task comparison only. Numerical settings and scores are not annotated in this case."
}
```

No ranking or system performance scores are calculated in this review.

## 14 Paper Relations

### fid_cites_dpr

fid cites dpr. The citation is present. Recorded intent: method_use.

Body locations: fid PDF p. 3, 3 Method, Retrieval, fid_p3_951

Bibliography locations: fid PDF p. 6, References, fid_p6_280

Checked the retrieval section on FiD PDF page 3 and the bibliography on page 6, confirming the work identity and method use. The bibliography omits an arXiv revision number. The available material cannot identify the exact cited revision or establish byte identity with the conference version.

Version assessment: {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "unresolved", "source_version": "2021.eacl-main.74", "target_library_version": "2020.emnlp-main.550", "note": "Matching the work identity does not establish byte identity between the cited PDF and the library PDF."}

Previous reference assessment: revised. Open issue: The bibliography does not identify the exact cited preprint revision.

### qasper_cites_s2orc

qasper cites s2orc. The citation is present. Recorded intent: data_use, method_use.

Body locations: qasper PDF p. 2, 2.1 Papers, qasper_p2_2094. qasper PDF p. 2, 2.1 Papers, qasper_p2_2658

Bibliography locations: qasper PDF p. 11, References, qasper_p11_1857

QASPER filters the S2ORC corpus and uses its LaTeX parser. The source names corpus releases 20190928 and 20200705v1. These are corpus versions, not revisions of the S2ORC paper.

Version assessment: {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "not_claimed_byte_identical", "source_version": "2021.naacl-main.365", "target_library_version": "2020.acl-main.447", "note": "Matching the work identity does not establish byte identity between the cited PDF and the library PDF."}

Previous reference assessment: revised.

### specter_cites_scibert

specter cites scibert. The citation is present. Recorded intent: method_use, result_comparison.

Body locations: specter PDF p. 3, 2.2 Document Representation, specter_p3_22. specter PDF p. 7, Table 1, specter_p7_747

Bibliography locations: specter PDF p. 10, References, specter_p10_77

SciBERT is used for initialization and as a baseline in the shared SciDocs experiments. Comparisons apply to the specific tasks and metrics in that paper, not universal superiority or causal attribution to one component.

Version assessment: {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "not_claimed_byte_identical", "source_version": "2020.acl-main.207", "target_library_version": "D19-1371", "note": "Matching the work identity does not establish byte identity between the cited PDF and the library PDF."}

Previous reference assessment: revised.

### vitaminc_cites_fever

vitaminc cites fever. The citation is present. Recorded intent: data_use.

Body locations: vitaminc PDF p. 1, 1 Introduction, vitaminc_p1_3881. vitaminc PDF p. 4, 3.3 Adding Synthetic Revisions, vitaminc_p4_2314

Bibliography locations: vitaminc PDF p. 13, References, vitaminc_p13_547

The citation concerns FEVER training data and data for synthetic revisions. The 56% and 86% figures on page 1 compare training settings within the study. They are not a comparison of the original systems reported by two papers.

Version assessment: {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "not_claimed_byte_identical", "source_version": "2021.naacl-main.52", "target_library_version": "N18-1074", "note": "Matching the work identity does not establish byte identity between the cited PDF and the library PDF."}

Previous reference assessment: revised.

### multifc_cites_fever

multifc cites fever. The citation is present. Recorded intent: background.

Body locations: multifc PDF p. 1, 1 Introduction, multifc_p1_2225

Bibliography locations: multifc PDF p. 11, References, multifc_p11_1805

This is a dataset construction contrast, not a performance comparison.

Version assessment: {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "not_claimed_byte_identical", "source_version": "D19-1475", "target_library_version": "N18-1074", "note": "Matching the work identity does not establish byte identity between the cited PDF and the library PDF."}

Previous reference assessment: revised.

### fever2_cites_fever

fever2 cites fever. The citation is present. Recorded intent: data_use.

Body locations: fever2 PDF p. 2, 2 Task Description, Build-It, fever2_p2_378

Bibliography locations: fever2 PDF p. 6, References, fever2_p6_1026

The task uses the original FEVER dataset and adds adversarial evaluation.

Version assessment: {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "not_claimed_byte_identical", "source_version": "D19-6601", "target_library_version": "N18-1074", "note": "Matching the work identity does not establish byte identity between the cited PDF and the library PDF."}

Previous reference assessment: revised.

### dpr_cites_drqa

dpr cites drqa. The citation is present. Recorded intent: background, method_use.

Body locations: dpr PDF p. 1, 1 Introduction, dpr_p1_1754. dpr PDF p. 4, 4.1 Wikipedia Data Pre-processing, dpr_p4_609

Bibliography locations: dpr PDF p. 10, References, dpr_p10_502

The introduction cites DrQA as background for retrieval and reading, and page 4 explicitly reuses its preprocessing code. This does not establish reuse of the entire DrQA model.

Version assessment: {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "not_claimed_byte_identical", "source_version": "2020.emnlp-main.550", "target_library_version": "P17-1171", "note": "Matching the work identity does not establish byte identity between the cited PDF and the library PDF."}

Previous reference assessment: revised.

### dpr_cites_orqa

dpr cites orqa. The citation is present. Recorded intent: background.

Body locations: dpr PDF p. 1, 1 Introduction, dpr_p1_3791

Bibliography locations: dpr PDF p. 10, References, dpr_p10_4068

The passage discusses prior dense retrieval and inverse cloze pretraining.

Version assessment: {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "not_claimed_byte_identical", "source_version": "2020.emnlp-main.550", "target_library_version": "P19-1612", "note": "Matching the work identity does not establish byte identity between the cited PDF and the library PDF."}

Previous reference assessment: revised.

### scitldr_cites_s2orc

scitldr cites s2orc. The citation is present. Recorded intent: method_use.

Body locations: scitldr PDF p. 3, 2 Dataset Construction, scitldr_p3_1854

Bibliography locations: scitldr PDF p. 10, References, scitldr_p10_4891

The S2ORC parser is used to process PDFs. This does not mean all SciTLDR papers are drawn from a fixed S2ORC release.

Version assessment: {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "not_claimed_byte_identical", "source_version": "2020.findings-emnlp.428", "target_library_version": "2020.acl-main.447", "note": "Matching the work identity does not establish byte identity between the cited PDF and the library PDF."}

Previous reference assessment: revised.

### scitldr_cites_scicite

scitldr cites scicite. The citation is present. Recorded intent: background.

Body locations: scitldr PDF p. 2, 1 Introduction, scitldr_p2_395

Bibliography locations: scitldr PDF p. 10, References, scitldr_p10_276

The passage cites the idea of scaffold tasks. It does not claim to reuse the SciCite dataset.

Version assessment: {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "not_claimed_byte_identical", "source_version": "2020.findings-emnlp.428", "target_library_version": "N19-1361", "note": "Matching the work identity does not establish byte identity between the cited PDF and the library PDF."}

Previous reference assessment: revised.

### scibert_cites_scicite

scibert cites scicite. The citation is present. Recorded intent: data_use.

Body locations: scibert PDF p. 2, 3.2 Datasets, scibert_p2_1987

Bibliography locations: scibert PDF p. 5, References, scibert_p5_2636

Checked the SciBERT bibliography on page 5. The authors, title, venue, and pages match SciCite. Page 2 lists SciCite as a citation intent dataset, so data_use is retained.

Version assessment: {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "not_claimed_byte_identical", "source_version": "D19-1371", "target_library_version": "N19-1361", "note": "Matching the work identity does not establish byte identity between the cited PDF and the library PDF."}

Previous reference assessment: revised.

### scifact_cites_fever

scifact cites fever. The citation is present. Recorded intent: background.

Body locations: scifact PDF p. 2, 1 Introduction, scifact_p2_2452

Bibliography locations: scifact PDF p. 11, References, scifact_p11_1484

This statement motivates a baseline. It is not a claim that SciFact copies FEVER evidence or labels.

Version assessment: {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "not_claimed_byte_identical", "source_version": "2020.emnlp-main.609", "target_library_version": "N18-1074", "note": "Matching the work identity does not establish byte identity between the cited PDF and the library PDF."}

Previous reference assessment: revised.

### scifact_cites_eraser

scifact cites eraser. The citation is present. Recorded intent: background.

Body locations: scifact PDF p. 5, 4 Evaluation, scifact_p5_1959

Bibliography locations: scifact PDF p. 10, References, scifact_p10_2286

This relation confirms a reference to the ERASER style oracle evaluation setting. It does not establish use of the complete ERASER data. SciFact is not listed in Table 1 on page 3 of the local ERASER version, so the difference between sources about inclusion remains a version question.

Version assessment: {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "not_claimed_byte_identical", "source_version": "2020.emnlp-main.609", "target_library_version": "2020.acl-main.408", "note": "Matching the work identity does not establish byte identity between the cited PDF and the library PDF."}

Previous reference assessment: revised.

### alce_cites_rarr

alce cites rarr. The citation is present. Recorded intent: background.

Body locations: alce PDF p. 4, 3 Evaluation, alce_p4_1699

Bibliography locations: alce PDF p. 10, References, alce_p10_3948

The citation is in a discussion of factual correctness evaluation, not evidence that ALCE uses the RARR editing pipeline.

Version assessment: {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "not_claimed_byte_identical", "source_version": "2023.emnlp-main.398", "target_library_version": "2023.acl-long.910", "note": "Matching the work identity does not establish byte identity between the cited PDF and the library PDF."}

Previous reference assessment: revised.

## Open Issues and Delivery Limits

The 84 tasks share facts and controlled variants and cannot be treated as 84 independent natural examples. Most papers are older NLP work, leaving limitations in pretraining contamination and disciplinary coverage.

Unjudged citation matching candidates cannot serve as negatives for complete recall or nDCG evaluation. Literature discovery relevance reflects screening against the current research requests.

The common SciDocs comparison in SPECTER is retained, but does not establish equal training budgets or superiority on all tasks. The exact DPR revision cited by FiD needs additional material. SciFact's statement about ERASER inclusion differs from the local ERASER table and is retained as a version question, not a data use conclusion.

File validation, source review, and system performance testing are recorded separately. validate_data.py checks only file and evidence consistency. This review reports no model predictions, accuracy, cost, or recovery rate results.
