# Review Checklist

See [REVIEW_RESULTS.md](REVIEW_RESULTS.md) for the latest findings. All 84 tasks and 14 relations have been examined.

## Paper Relations

| ID | Citation Intent | Body PDF Pages |
| --- | --- | --- |
| fid_cites_dpr | method_use | 3 |
| qasper_cites_s2orc | data_use, method_use | 2, 2 |
| specter_cites_scibert | method_use, result_comparison | 3, 7 |
| vitaminc_cites_fever | data_use | 1, 4 |
| multifc_cites_fever | background | 1 |
| fever2_cites_fever | data_use | 2 |
| dpr_cites_drqa | background, method_use | 1, 4 |
| dpr_cites_orqa | background | 1 |
| scitldr_cites_s2orc | method_use | 3 |
| scitldr_cites_scicite | background | 2 |
| scibert_cites_scicite | data_use | 2 |
| scifact_cites_fever | background | 2 |
| scifact_cites_eraser | background | 5 |
| alce_cites_rarr | background | 4 |

## Tasks

| ID | Type | Review Outcome | Evidence Locations |
| --- | --- | --- | --- |
| dpr_qa_001 | reading_qa | complete_within_declared_scope | dpr PDF p. 1, Abstract, dpr_p1_753 |
| dpr_citation_match_001 | citation_annotation | partial | dpr PDF p. 1, Abstract, dpr_p1_753. fid PDF p. 3, 3 Method, Retrieval, fid_p3_1289 . fid PDF p. 2, 2 Related work, fid_p2_2666 |
| dpr_check_supported | citation_check | complete_within_declared_scope | dpr PDF p. 1, Abstract, dpr_p1_753 |
| dpr_check_contradicted | citation_check | complete_within_declared_scope | dpr PDF p. 1, Abstract, dpr_p1_753 |
| fid_qa_001 | reading_qa | complete_within_declared_scope | fid PDF p. 3, 3 Method, Reading, fid_p3_1863. fid PDF p. 3, 3 Method, Reading, fid_p3_2222. fid PDF p. 3, 3 Method, Reading, fid_p3_2418 |
| fid_citation_match_001 | citation_annotation | partial | fid PDF p. 3, 3 Method, Reading, fid_p3_1863. fid PDF p. 3, 3 Method, Reading, fid_p3_2222. fid PDF p. 3, 3 Method, Reading, fid_p3_2418 |
| fid_check_supported | citation_check | complete_within_declared_scope | fid PDF p. 3, 3 Method, Reading, fid_p3_1863. fid PDF p. 3, 3 Method, Reading, fid_p3_2222. fid PDF p. 3, 3 Method, Reading, fid_p3_2418 |
| fid_check_contradicted | citation_check | complete_within_declared_scope | fid PDF p. 3, 3 Method, Reading, fid_p3_1863. fid PDF p. 3, 3 Method, Reading, fid_p3_2222. fid PDF p. 3, 3 Method, Reading, fid_p3_2418 |
| s2orc_qa_001 | reading_qa | complete_within_declared_scope | s2orc PDF p. 1, Abstract, s2orc_p1_501 |
| s2orc_citation_match_001 | citation_annotation | partial | s2orc PDF p. 1, Abstract, s2orc_p1_501 |
| s2orc_check_supported | citation_check | complete_within_declared_scope | s2orc PDF p. 1, Abstract, s2orc_p1_501 |
| s2orc_check_contradicted | citation_check | complete_within_declared_scope | s2orc PDF p. 1, Abstract, s2orc_p1_501 |
| qasper_qa_001 | reading_qa | complete_within_declared_scope | qasper PDF p. 1, Abstract, qasper_p1_1153 |
| qasper_citation_match_001 | citation_annotation | partial | qasper PDF p. 1, Abstract, qasper_p1_1153 |
| qasper_check_supported | citation_check | complete_within_declared_scope | qasper PDF p. 1, Abstract, qasper_p1_1153 |
| qasper_check_contradicted | citation_check | complete_within_declared_scope | qasper PDF p. 1, Abstract, qasper_p1_1153 |
| fever_qa_001 | reading_qa | complete_within_declared_scope | fever PDF p. 1, Abstract, fever_p1_586 |
| fever_citation_match_001 | citation_annotation | partial | fever PDF p. 1, Abstract, fever_p1_586. scifact PDF p. 3, 2 Background and task definition, scifact_p3_802 |
| fever_check_supported | citation_check | complete_within_declared_scope | fever PDF p. 1, Abstract, fever_p1_586 |
| fever_check_contradicted | citation_check | complete_within_declared_scope | fever PDF p. 1, Abstract, fever_p1_586 |
| scifact_qa_001 | reading_qa | complete_within_declared_scope | scifact PDF p. 1, Abstract, scifact_p1_542 |
| scifact_citation_match_001 | citation_annotation | partial | scifact PDF p. 1, Abstract, scifact_p1_542 |
| scifact_check_supported | citation_check | complete_within_declared_scope | scifact PDF p. 1, Abstract, scifact_p1_542 |
| scifact_check_contradicted | citation_check | complete_within_declared_scope | scifact PDF p. 1, Abstract, scifact_p1_542 |
| drqa_qa_001 | reading_qa | complete_within_declared_scope | drqa PDF p. 1, Abstract, drqa_p1_1155 |
| drqa_citation_match_001 | citation_annotation | partial | drqa PDF p. 1, Abstract, drqa_p1_1155 |
| drqa_check_supported | citation_check | complete_within_declared_scope | drqa PDF p. 1, Abstract, drqa_p1_1155 |
| drqa_check_contradicted | citation_check | complete_within_declared_scope | drqa PDF p. 1, Abstract, drqa_p1_1155 |
| orqa_qa_001 | reading_qa | complete_within_declared_scope | orqa PDF p. 1, Abstract, orqa_p1_1023 |
| orqa_citation_match_001 | citation_annotation | partial | orqa PDF p. 1, Abstract, orqa_p1_1023. dpr PDF p. 1, 1 Introduction, dpr_p1_3791 |
| orqa_check_supported | citation_check | complete_within_declared_scope | orqa PDF p. 1, Abstract, orqa_p1_1023 |
| orqa_check_contradicted | citation_check | complete_within_declared_scope | orqa PDF p. 1, Abstract, orqa_p1_1023 |
| alce_qa_001 | reading_qa | complete_within_declared_scope | alce PDF p. 1, Abstract, alce_p1_1115 |
| alce_citation_match_001 | citation_annotation | partial | alce PDF p. 1, Abstract, alce_p1_1115 |
| alce_check_supported | citation_check | complete_within_declared_scope | alce PDF p. 1, Abstract, alce_p1_1115 |
| alce_check_contradicted | citation_check | complete_within_declared_scope | alce PDF p. 1, Abstract, alce_p1_1115 |
| rarr_qa_001 | reading_qa | complete_within_declared_scope | rarr PDF p. 1, Abstract, rarr_p1_1136 |
| rarr_citation_match_001 | citation_annotation | partial | rarr PDF p. 1, Abstract, rarr_p1_1136 |
| rarr_check_supported | citation_check | complete_within_declared_scope | rarr PDF p. 1, Abstract, rarr_p1_1136 |
| rarr_check_contradicted | citation_check | complete_within_declared_scope | rarr PDF p. 1, Abstract, rarr_p1_1136 |
| scicite_qa_001 | reading_qa | complete_within_declared_scope | scicite PDF p. 3, 2.1 Structural scaffolds, scicite_p3_26. scicite PDF p. 3, 2.1 Structural scaffolds, scicite_p3_680 |
| scicite_citation_match_001 | citation_annotation | partial | scicite PDF p. 3, 2.1 Structural scaffolds, scicite_p3_26. scicite PDF p. 3, 2.1 Structural scaffolds, scicite_p3_680 |
| scicite_check_supported | citation_check | complete_within_declared_scope | scicite PDF p. 3, 2.1 Structural scaffolds, scicite_p3_26. scicite PDF p. 3, 2.1 Structural scaffolds, scicite_p3_680 |
| scicite_check_contradicted | citation_check | complete_within_declared_scope | scicite PDF p. 3, 2.1 Structural scaffolds, scicite_p3_26. scicite PDF p. 3, 2.1 Structural scaffolds, scicite_p3_680 |
| scibert_qa_001 | reading_qa | complete_within_declared_scope | scibert PDF p. 1, 2 Methods, Background, scibert_p1_3523 |
| scibert_citation_match_001 | citation_annotation | partial | scibert PDF p. 1, 2 Methods, Background, scibert_p1_3523. specter PDF p. 2, 2.2 Background, specter_p2_2634. s2orc PDF p. 6, 5 Pretraining BERT on S2ORC, s2orc_p6_2759 |
| scibert_check_supported | citation_check | complete_within_declared_scope | scibert PDF p. 1, 2 Methods, Background, scibert_p1_3523 |
| scibert_check_contradicted | citation_check | complete_within_declared_scope | scibert PDF p. 1, 2 Methods, Background, scibert_p1_3523 |
| specter_qa_001 | reading_qa | complete_within_declared_scope | specter PDF p. 1, 1 Introduction, specter_p1_3872 |
| specter_citation_match_001 | citation_annotation | partial | specter PDF p. 1, 1 Introduction, specter_p1_3872 |
| specter_check_supported | citation_check | complete_within_declared_scope | specter PDF p. 1, 1 Introduction, specter_p1_3872 |
| specter_check_contradicted | citation_check | complete_within_declared_scope | specter PDF p. 1, 1 Introduction, specter_p1_3872 |
| scitldr_qa_001 | reading_qa | complete_within_declared_scope | scitldr PDF p. 2, 1 Introduction, scitldr_p2_680 |
| scitldr_citation_match_001 | citation_annotation | partial | scitldr PDF p. 2, 1 Introduction, scitldr_p2_680 |
| scitldr_check_supported | citation_check | complete_within_declared_scope | scitldr PDF p. 2, 1 Introduction, scitldr_p2_680 |
| scitldr_check_contradicted | citation_check | complete_within_declared_scope | scitldr PDF p. 2, 1 Introduction, scitldr_p2_680 |
| vitaminc_qa_001 | reading_qa | complete_within_declared_scope | vitaminc PDF p. 1, Abstract, vitaminc_p1_1139 |
| vitaminc_citation_match_001 | citation_annotation | partial | vitaminc PDF p. 1, Abstract, vitaminc_p1_1139 |
| vitaminc_check_supported | citation_check | complete_within_declared_scope | vitaminc PDF p. 1, Abstract, vitaminc_p1_1139 |
| vitaminc_check_contradicted | citation_check | complete_within_declared_scope | vitaminc PDF p. 1, Abstract, vitaminc_p1_1139 |
| multifc_qa_001 | reading_qa | complete_within_declared_scope | multifc PDF p. 1, Abstract, multifc_p1_744 |
| multifc_citation_match_001 | citation_annotation | partial | multifc PDF p. 1, Abstract, multifc_p1_744 |
| multifc_check_supported | citation_check | complete_within_declared_scope | multifc PDF p. 1, Abstract, multifc_p1_744 |
| multifc_check_contradicted | citation_check | complete_within_declared_scope | multifc PDF p. 1, Abstract, multifc_p1_744 |
| eraser_qa_001 | reading_qa | complete_within_declared_scope | eraser PDF p. 1, Abstract, eraser_p1_1239 |
| eraser_citation_match_001 | citation_annotation | partial | eraser PDF p. 1, Abstract, eraser_p1_1239 |
| eraser_check_supported | citation_check | complete_within_declared_scope | eraser PDF p. 1, Abstract, eraser_p1_1239 |
| eraser_check_contradicted | citation_check | complete_within_declared_scope | eraser PDF p. 1, Abstract, eraser_p1_1239 |
| fever2_qa_001 | reading_qa | complete_within_declared_scope | fever2 PDF p. 1, Abstract, fever2_p1_816 |
| fever2_citation_match_001 | citation_annotation | partial | fever2 PDF p. 1, Abstract, fever2_p1_816 |
| fever2_check_supported | citation_check | complete_within_declared_scope | fever2 PDF p. 1, Abstract, fever2_p1_816 |
| fever2_check_contradicted | citation_check | complete_within_declared_scope | fever2 PDF p. 1, Abstract, fever2_p1_816 |
| dpr_scope_001 | citation_check | complete_within_declared_scope | dpr PDF p. 1, Abstract, dpr_p1_753 |
| fid_scope_001 | citation_check | complete_within_declared_scope | fid PDF p. 3, 3 Method, Reading, fid_p3_2418 |
| specter_scope_001 | citation_check | complete_within_declared_scope | specter PDF p. 1, Abstract, specter_p1_1501 |
| claim_verification_discovery_001 | literature_discovery | complete_within_declared_scope | fever PDF p. 1, 1 Introduction, fever_p1_3444. vitaminc PDF p. 3, 3.2 Writing Claims, vitaminc_p3_2623. fever2 PDF p. 2, 2.1 Task Phases, fever2_p2_1070 . fever2 PDF p. 1, Abstract, fever2_p1_617 |
| retrieval_qa_discovery_001 | literature_discovery | complete_within_declared_scope | dpr PDF p. 2, 1 Introduction, dpr_p2_544. orqa PDF p. 3, 3 Open-Retrieval Question Answering, orqa_p3_2981 |
| scientific_reading_discovery_001 | literature_discovery | complete_within_declared_scope | s2orc PDF p. 3, 2.1 Processing PDFs, s2orc_p3_1126 |
| fid_missing_file | citation_check | fixture_definition_checked_not_executed | None. The fixture makes the required full text unavailable. |
| qasper_missing_file | citation_check | fixture_definition_checked_not_executed | None. The fixture makes the required full text unavailable. |
| scifact_missing_file | citation_check | fixture_definition_checked_not_executed | None. The fixture makes the required full text unavailable. |
| compare_drqa_dpr | paper_comparison | complete_within_declared_scope | drqa PDF p. 1, Abstract, drqa_p1_1155. dpr PDF p. 1, Abstract, dpr_p1_753. drqa PDF p. 5, 4 Data, drqa_p5_308. drqa PDF p. 5, 4.1 Wikipedia, drqa_p5_730. dpr PDF p. 3, 3.2 Training, dpr_p3_2152. dpr PDF p. 4, 4.1 Wikipedia Data Pre-processing, dpr_p4_507. dpr PDF p. 7, 6.1 End-to-end QA System, dpr_p7_2767 |
| compare_scibert_specter | paper_comparison | complete_within_declared_scope | scibert PDF p. 1, 2 Methods, Background, scibert_p1_3523. specter PDF p. 1, 1 Introduction, specter_p1_3872. specter PDF p. 3, 2.3 Citation-Based Pretraining Objective, specter_p3_735. scibert PDF p. 2, 2 Methods, Corpus, scibert_p2_423. specter PDF p. 2, 2.2 Document Representation, specter_p2_3614. specter PDF p. 5, 4 Experiments, specter_p5_3376. specter PDF p. 6, 4 Experiments, Baseline Methods, specter_p6_574. specter PDF p. 7, Table 1, specter_p7_747 |
| compare_fever_scifact | paper_comparison | complete_within_declared_scope | fever PDF p. 1, Abstract, fever_p1_586. scifact PDF p. 1, Abstract, scifact_p1_542. fever PDF p. 1, 1 Introduction, fever_p1_3603. scifact PDF p. 3, 2 Task Definition, scifact_p3_1640. scifact PDF p. 3, 2 Task Definition, scifact_p3_454 |
