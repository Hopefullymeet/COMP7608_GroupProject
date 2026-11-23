# PaperTrace 测试数据逐条复核报告

复核时间为 2026-11-21。

本轮覆盖 18 篇论文、84 条任务和 14 条引用关系。

## 完成范围

全部任务均已逐条检查。18 条引用匹配的候选已逐个筛查，但尚有候选只作主题与相关段落筛查，未作穷尽式支持判断，这些任务记为部分完成。其余 63 条普通任务已完成约定范围内的原文或需求复核，3 条不可读场景仅完成测试定义检查。

论文关系均核对了正文和书目。FiD 引用 DPR 的论文身份与方法使用可以确认，具体预印本修订号仍无法确定。

发现的主要修正包括 FiD 跨栏脚注、原子论述拆分、遗漏的引用正例、QASPER 和 DPR 的方法使用关系，以及 SPECTER 与 SciBERT 的共同评估可比性。

## 判定口径

支持和冲突必须有原文；未提到不等于冲突。给定片段任务只判断输入片段。不可读 fixture 保留空语义标签，未宣称实际运行。候选未判断不当作负例。全文文件可供系统检索，但答案、复核记录和证据索引不得进入系统索引或 Wiki。

所有 18 篇首页已渲染查看，另查看 FiD 第 3 页、SciTLDR 第 2、3、10 页、SPECTER 第 7 页表格和 SciCite 第 3 页。阅读清单记录的是为当前问题检查的章节，不表示逐字阅读全部 249 页。FiD 解码器原句跨栏断词，保留原始片段并标出延续位置，没有把脚注或补写词算成完整原句。

## 逐篇任务复核

### dpr

论文为 Dense Passage Retrieval for Open-Domain Question Answering。保存版本为 2020.emnlp-main.550。本轮查阅 PDF 页码为 1, 2, 3, 4, 5, 7, 10。

摘要明确说明学习稠密表示；第 2、3 页进一步给出双编码器、点积检索和训练定义。

#### dpr_qa_001

题目为 What representation and encoder framework does DPR use for retrieval?

复核结果为 complete_within_declared_scope。与旧参考的关系为 agree_with_scope_notes。

参考回答为 DPR learns dense representations with a dual encoder framework.

证据位置为 dpr PDF 第 1 页，Abstract，dpr_p1_753

已核问题、答案和原文范围，保留或补全来源限定。

#### dpr_citation_match_001

补充证据为 fid PDF 第 2 页，2 Related work，fid_p2_2666，与其他原文共同覆盖训练依据或维基百科材料范围。

题目为 DPR learns dense representations with a dual encoder framework.

复核结果为 partial。与旧参考的关系为 revised。

参考回答为 DPR learns dense representations with a dual encoder framework.

证据位置为 dpr PDF 第 1 页，Abstract，dpr_p1_753；fid PDF 第 3 页，3 Method, Retrieval，fid_p3_1289

已检查全部允许候选的主题和相关命中段落，补充确有证据的正例。其余候选只完成筛查，保留未判断。

| 候选论文 | 判断     | 理由                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| dpr      | supports | 实际正文可以支持关于 dpr 的目标论述。                        |
| fid      | supports | 实际正文可以支持关于 dpr 的目标论述。                        |
| drqa     | unjudged | 本篇主要讨论维基百科检索与抽取阅读。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| orqa     | unjudged | 本篇主要讨论开放检索问答与 ICT 预训练。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| alce     | unjudged | 本篇主要讨论生成引用及其自动评价。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| rarr     | unjudged | 本篇主要讨论为已有文本找依据并修订。已查内容不足以建立目标整句；保留未判断，不作为负例。 |

仍需处理：尚有候选仅筛查而未作完整支持判断，不能用作负例。

#### dpr_check_supported

题目为 DPR learns dense representations with a dual encoder framework.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 DPR learns dense representations with a dual encoder framework.

论述 c1：DPR learns dense representations.。标签为 supported，执行状态为 read。理由为 摘要明确说明学习稠密表示；第 2、3 页进一步给出双编码器、点积检索和训练定义。 原论述准确复述这些事实。
论述 c2：DPR uses a dual encoder framework.。标签为 supported，执行状态为 read。理由为 摘要明确说明学习稠密表示；第 2、3 页进一步给出双编码器、点积检索和训练定义。 原论述准确复述这些事实。

证据位置为 dpr PDF 第 1 页，Abstract，dpr_p1_753

已核对原子论述、支持方向、量词和证据范围。 摘要明确说明学习稠密表示；第 2、3 页进一步给出双编码器、点积检索和训练定义。

#### dpr_check_contradicted

题目为 DPR uses only sparse keyword vectors and does not learn dense representations.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 DPR learns dense representations with a dual encoder framework.

论述 c1：DPR uses only sparse keyword vectors.。标签为 contradicted，执行状态为 read。理由为 摘要明确说明学习稠密表示；第 2、3 页进一步给出双编码器、点积检索和训练定义。 原论述与这些明确事实相反。
论述 c2：DPR does not learn dense representations.。标签为 contradicted，执行状态为 read。理由为 摘要明确说明学习稠密表示；第 2、3 页进一步给出双编码器、点积检索和训练定义。 原论述与这些明确事实相反。

证据位置为 dpr PDF 第 1 页，Abstract，dpr_p1_753

已核对原子论述、支持方向、量词和证据范围。 摘要明确说明学习稠密表示；第 2、3 页进一步给出双编码器、点积检索和训练定义。

#### dpr_scope_001

题目为 The method in Dense Passage Retrieval for Open-Domain Question Answering improves performance on every possible task and language.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 The supplied passage does not establish a universal claim about all tasks and languages.

论述 c1：The method in Dense Passage Retrieval for Open-Domain Question Answering improves performance on every possible task and language.。标签为 not_established，执行状态为 read。理由为 给定片段没有建立对所有任务和语言均提升的普遍结论。本判断仅针对输入片段，不是全文缺失证据的断言。

证据位置为 dpr PDF 第 1 页，Abstract，dpr_p1_753

只按给定片段作 not_established 判断，不借用未提供全文反驳。

限制为只判断输入片段。

### fid

论文为 Leveraging Passage Retrieval with Generative Models for Open Domain Question Answering。保存版本为 2021.eacl-main.74。本轮查阅 PDF 页码为 1, 2, 3, 6。

第 3 页区分编码器独立处理与解码器共同处理。原长引句混入脚注，改用两个连续的短证据。

#### fid_qa_001

题目为 How does FiD process passages in the encoder and combine them in the decoder?

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 FiD encodes each passage independently and lets the decoder attend to the combined representations.

证据位置为 fid PDF 第 3 页，3 Method, Reading，fid_p3_1863；fid PDF 第 3 页，3 Method, Reading，fid_p3_2222；fid PDF 第 3 页，3 Method, Reading，fid_p3_2418

已核问题、答案和原文范围，保留或补全来源限定。

#### fid_citation_match_001

题目为 FiD encodes each passage independently and lets the decoder attend to the combined representations.

复核结果为 partial。与旧参考的关系为 revised。

参考回答为 FiD encodes each passage independently and lets the decoder attend to the combined representations.

证据位置为 fid PDF 第 3 页，3 Method, Reading，fid_p3_1863；fid PDF 第 3 页，3 Method, Reading，fid_p3_2222；fid PDF 第 3 页，3 Method, Reading，fid_p3_2418

已检查全部允许候选的主题和相关命中段落，补充确有证据的正例。其余候选只完成筛查，保留未判断。

| 候选论文 | 判断     | 理由                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| dpr      | unjudged | 本篇主要讨论稠密检索与双编码器。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| fid      | supports | 实际正文可以支持关于 fid 的目标论述。                        |
| drqa     | unjudged | 本篇主要讨论维基百科检索与抽取阅读。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| orqa     | unjudged | 本篇主要讨论开放检索问答与 ICT 预训练。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| alce     | unjudged | 本篇主要讨论生成引用及其自动评价。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| rarr     | unjudged | 本篇主要讨论为已有文本找依据并修订。已查内容不足以建立目标整句；保留未判断，不作为负例。 |

仍需处理：尚有候选仅筛查而未作完整支持判断，不能用作负例。

#### fid_check_supported

题目为 FiD encodes each passage independently and lets the decoder attend to the combined representations.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 FiD encodes each passage independently and lets the decoder attend to the combined representations.

论述 c1：FiD encodes retrieved passages independently from other passages.。标签为 supported，执行状态为 read。理由为 第 3 页区分编码器独立处理与解码器共同处理。原长引句混入脚注，改用两个连续的短证据。 原论述准确复述这些事实。
论述 c2：FiD lets the decoder attend to the combined passage representations.。标签为 supported，执行状态为 read。理由为 第 3 页区分编码器独立处理与解码器共同处理。原长引句混入脚注，改用两个连续的短证据。 原论述准确复述这些事实。

证据位置为 fid PDF 第 3 页，3 Method, Reading，fid_p3_1863；fid PDF 第 3 页，3 Method, Reading，fid_p3_2222；fid PDF 第 3 页，3 Method, Reading，fid_p3_2418

已核对原子论述、支持方向、量词和证据范围。 第 3 页区分编码器独立处理与解码器共同处理。原长引句混入脚注，改用两个连续的短证据。

#### fid_check_contradicted

题目为 FiD jointly encodes all retrieved passages in a single encoder sequence before decoding.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 FiD encodes each passage independently and lets the decoder attend to the combined representations.

论述 c1：FiD jointly encodes all retrieved passages in a single encoder sequence before decoding.。标签为 contradicted，执行状态为 read。理由为 第 3 页区分编码器独立处理与解码器共同处理。原长引句混入脚注，改用两个连续的短证据。 原论述与这些明确事实相反。

证据位置为 fid PDF 第 3 页，3 Method, Reading，fid_p3_1863；fid PDF 第 3 页，3 Method, Reading，fid_p3_2222；fid PDF 第 3 页，3 Method, Reading，fid_p3_2418

已核对原子论述、支持方向、量词和证据范围。 第 3 页区分编码器独立处理与解码器共同处理。原长引句混入脚注，改用两个连续的短证据。

#### fid_scope_001

题目为 The method in Leveraging Passage Retrieval with Generative Models for Open Domain Question Answering improves performance on every possible task and language.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 The supplied passage does not establish a universal claim about all tasks and languages.

论述 c1：The method in Leveraging Passage Retrieval with Generative Models for Open Domain Question Answering improves performance on every possible task and language.。标签为 not_established，执行状态为 read。理由为 给定片段没有建立对所有任务和语言均提升的普遍结论。本判断仅针对输入片段，不是全文缺失证据的断言。

证据位置为 fid PDF 第 3 页，3 Method, Reading，fid_p3_2418

只按给定片段作 not_established 判断，不借用未提供全文反驳。

限制为只判断输入片段。

#### fid_missing_file

题目为 FiD encodes each passage independently and lets the decoder attend to the combined representations.

复核结果为 fixture_definition_checked_not_executed。与旧参考的关系为 revised。

参考回答为 所需全文被测试条件设为不可访问，暂时无法核验。应报告材料缺口，不给出支持或冲突结论。

论述 c1：FiD encodes each passage independently and lets the decoder attend to the combined representations.。标签为 None，执行状态为 blocked。理由为 The task fixture removes access to the required full text. Missing access does not imply refutation.

证据位置为 无，测试条件为所需全文不可访问。

只核对不可读 fixture 与预期响应；未运行模型或屏蔽文件测试。保留 null 与 blocked。

### s2orc

论文为 S2ORC: The Semantic Scholar Open Research Corpus。保存版本为 2020.acl-main.447。本轮查阅 PDF 页码为 1, 2, 3, 6, 7。

第 1、2 页区分 81.1M 书目节点和 8.1M 开放获取全文；第 3 页明确正文引用与书目链接。数字只适用于所收集版本。

#### s2orc_qa_001

题目为 How many papers have structured full text in the S2ORC release described here?

复核结果为 complete_within_declared_scope。与旧参考的关系为 agree_with_scope_notes。

参考回答为 The reported S2ORC release contains structured full text for 8.1 million open access papers.

证据位置为 s2orc PDF 第 1 页，Abstract，s2orc_p1_501

已核问题、答案和原文范围，保留或补全来源限定。

#### s2orc_citation_match_001

题目为 The reported S2ORC release contains structured full text for 8.1 million open access papers.

复核结果为 partial。与旧参考的关系为 revised。

参考回答为 The reported S2ORC release contains structured full text for 8.1 million open access papers.

证据位置为 s2orc PDF 第 1 页，Abstract，s2orc_p1_501

已检查全部允许候选的主题和相关命中段落，补充确有证据的正例。其余候选只完成筛查，保留未判断。

| 候选论文 | 判断     | 理由                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| s2orc    | supports | 实际正文可以支持关于 s2orc 的目标论述。                      |
| qasper   | unjudged | 本篇主要讨论论文全文问答及证据标注。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| scicite  | unjudged | 本篇主要讨论引用意图分类。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| scibert  | unjudged | 本篇主要讨论科学文本预训练语言模型。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| specter  | unjudged | 本篇主要讨论利用引用训练论文表示。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| scitldr  | unjudged | 本篇主要讨论科学论文极短摘要。已查内容不足以建立目标整句；保留未判断，不作为负例。 |

仍需处理：尚有候选仅筛查而未作完整支持判断，不能用作负例。

#### s2orc_check_supported

题目为 The reported S2ORC release contains structured full text for 8.1 million open access papers.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 The reported S2ORC release contains structured full text for 8.1 million open access papers.

论述 c1：The reported S2ORC release contains structured full text for 8.1 million open access papers.。标签为 supported，执行状态为 read。理由为 第 1、2 页区分 81.1M 书目节点和 8.1M 开放获取全文；第 3 页明确正文引用与书目链接。数字只适用于所收集版本。 原论述准确复述这些事实。

证据位置为 s2orc PDF 第 1 页，Abstract，s2orc_p1_501

已核对原子论述、支持方向、量词和证据范围。 第 1、2 页区分 81.1M 书目节点和 8.1M 开放获取全文；第 3 页明确正文引用与书目链接。数字只适用于所收集版本。

#### s2orc_check_contradicted

题目为 All 81.1 million papers in the reported S2ORC release have structured full text.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 The reported S2ORC release contains structured full text for 8.1 million open access papers.

论述 c1：All 81.1 million papers in the reported S2ORC release have structured full text.。标签为 contradicted，执行状态为 read。理由为 第 1、2 页区分 81.1M 书目节点和 8.1M 开放获取全文；第 3 页明确正文引用与书目链接。数字只适用于所收集版本。 原论述与这些明确事实相反。

证据位置为 s2orc PDF 第 1 页，Abstract，s2orc_p1_501

已核对原子论述、支持方向、量词和证据范围。 第 1、2 页区分 81.1M 书目节点和 8.1M 开放获取全文；第 3 页明确正文引用与书目链接。数字只适用于所收集版本。

### qasper

论文为 A Dataset of Information-Seeking Questions and Answers Anchored in Research Papers。保存版本为 2021.naacl-main.365。本轮查阅 PDF 页码为 1, 2, 11。

摘要和第 2 页明确提问者只看标题与摘要，另一组提供答案与证据；全文是作答来源，不能写成提问者已读全文。

#### qasper_qa_001

题目为 What do QASPER question writers read, and who supplies answers and evidence?

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 Question writers are NLP practitioners who read only the title and abstract. A separate set of NLP practitioners supplies the answers and supporting evidence.

证据位置为 qasper PDF 第 1 页，Abstract，qasper_p1_1153

已核问题、答案和原文范围，保留或补全来源限定。

#### qasper_citation_match_001

题目为 QASPER question writers read the title and abstract, and a separate group supplies answers and evidence.

复核结果为 partial。与旧参考的关系为 revised。

参考回答为 QASPER question writers read the title and abstract, and a separate group supplies answers and evidence.

证据位置为 qasper PDF 第 1 页，Abstract，qasper_p1_1153

已检查全部允许候选的主题和相关命中段落，补充确有证据的正例。其余候选只完成筛查，保留未判断。

| 候选论文 | 判断     | 理由                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| s2orc    | unjudged | 本篇主要讨论结构化科研论文语料。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| qasper   | supports | 实际正文可以支持关于 qasper 的目标论述。                     |
| scicite  | unjudged | 本篇主要讨论引用意图分类。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| scibert  | unjudged | 本篇主要讨论科学文本预训练语言模型。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| specter  | unjudged | 本篇主要讨论利用引用训练论文表示。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| scitldr  | unjudged | 本篇主要讨论科学论文极短摘要。已查内容不足以建立目标整句；保留未判断，不作为负例。 |

仍需处理：尚有候选仅筛查而未作完整支持判断，不能用作负例。

#### qasper_check_supported

题目为 QASPER question writers read the title and abstract, and a separate group supplies answers and evidence.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 QASPER question writers read the title and abstract, and a separate group supplies answers and evidence.

论述 c1：QASPER question writers read only the title and abstract.。标签为 supported，执行状态为 read。理由为 摘要和第 2 页明确提问者只看标题与摘要，另一组提供答案与证据；全文是作答来源，不能写成提问者已读全文。 原论述准确复述这些事实。
论述 c2：A separate set of NLP practitioners supplies QASPER answers and supporting evidence.。标签为 supported，执行状态为 read。理由为 摘要和第 2 页明确提问者只看标题与摘要，另一组提供答案与证据；全文是作答来源，不能写成提问者已读全文。 原论述准确复述这些事实。

证据位置为 qasper PDF 第 1 页，Abstract，qasper_p1_1153

已核对原子论述、支持方向、量词和证据范围。 摘要和第 2 页明确提问者只看标题与摘要，另一组提供答案与证据；全文是作答来源，不能写成提问者已读全文。

#### qasper_check_contradicted

题目为 QASPER question writers read the full paper before writing their questions.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 QASPER question writers read the title and abstract, and a separate group supplies answers and evidence.

论述 c1：QASPER question writers read the full paper before writing their questions.。标签为 contradicted，执行状态为 read。理由为 摘要和第 2 页明确提问者只看标题与摘要，另一组提供答案与证据；全文是作答来源，不能写成提问者已读全文。 原论述与这些明确事实相反。

证据位置为 qasper PDF 第 1 页，Abstract，qasper_p1_1153

已核对原子论述、支持方向、量词和证据范围。 摘要和第 2 页明确提问者只看标题与摘要，另一组提供答案与证据；全文是作答来源，不能写成提问者已读全文。

#### qasper_missing_file

题目为 QASPER question writers read the title and abstract, and a separate group supplies answers and evidence.

复核结果为 fixture_definition_checked_not_executed。与旧参考的关系为 revised。

参考回答为 所需全文被测试条件设为不可访问，暂时无法核验。应报告材料缺口，不给出支持或冲突结论。

论述 c1：QASPER question writers read the title and abstract, and a separate group supplies answers and evidence.。标签为 None，执行状态为 blocked。理由为 The task fixture removes access to the required full text. Missing access does not imply refutation.

证据位置为 无，测试条件为所需全文不可访问。

只核对不可读 fixture 与预期响应；未运行模型或屏蔽文件测试。保留 null 与 blocked。

### fever

论文为 FEVER: a Large-scale Dataset for Fact Extraction and VERification。保存版本为 N18-1074。本轮查阅 PDF 页码为 1, 2。

摘要和第 1、2 页明确通过改写维基百科句子生成论述，并为支持或反驳提供证据句。

#### fever_qa_001

题目为 How were claims generated for FEVER?

复核结果为 complete_within_declared_scope。与旧参考的关系为 agree_with_scope_notes。

参考回答为 FEVER claims were generated by altering sentences extracted from Wikipedia.

证据位置为 fever PDF 第 1 页，Abstract，fever_p1_586

已核问题、答案和原文范围，保留或补全来源限定。

#### fever_citation_match_001

题目为 FEVER claims were generated by altering sentences extracted from Wikipedia.

复核结果为 partial。与旧参考的关系为 revised。

参考回答为 FEVER claims were generated by altering sentences extracted from Wikipedia.

证据位置为 fever PDF 第 1 页，Abstract，fever_p1_586；scifact PDF 第 3 页，2 Background and task definition，scifact_p3_802

已检查全部允许候选的主题和相关命中段落，补充确有证据的正例。其余候选只完成筛查，保留未判断。

| 候选论文 | 判断     | 理由                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| fever    | supports | 实际正文可以支持关于 fever 的目标论述。                      |
| scifact  | supports | 实际正文可以支持关于 fever 的目标论述。                      |
| vitaminc | unjudged | 本篇主要讨论证据修订下的稳健事实核验。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| multifc  | unjudged | 本篇主要讨论真实网站事实核查数据。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| eraser   | unjudged | 本篇主要讨论解释依据的评价。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| fever2   | unjudged | 本篇主要讨论对抗式事实核验共享任务。已查内容不足以建立目标整句；保留未判断，不作为负例。 |

仍需处理：尚有候选仅筛查而未作完整支持判断，不能用作负例。

#### fever_check_supported

题目为 FEVER claims were generated by altering sentences extracted from Wikipedia.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 FEVER claims were generated by altering sentences extracted from Wikipedia.

论述 c1：FEVER claims were generated by altering sentences extracted from Wikipedia.。标签为 supported，执行状态为 read。理由为 摘要和第 1、2 页明确通过改写维基百科句子生成论述，并为支持或反驳提供证据句。 原论述准确复述这些事实。

证据位置为 fever PDF 第 1 页，Abstract，fever_p1_586

已核对原子论述、支持方向、量词和证据范围。 摘要和第 1、2 页明确通过改写维基百科句子生成论述，并为支持或反驳提供证据句。

#### fever_check_contradicted

题目为 FEVER claims were collected exclusively from clinical trial reports.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 FEVER claims were generated by altering sentences extracted from Wikipedia.

论述 c1：FEVER claims were collected exclusively from clinical trial reports.。标签为 contradicted，执行状态为 read。理由为 摘要和第 1、2 页明确通过改写维基百科句子生成论述，并为支持或反驳提供证据句。 原论述与这些明确事实相反。

证据位置为 fever PDF 第 1 页，Abstract，fever_p1_586

已核对原子论述、支持方向、量词和证据范围。 摘要和第 1、2 页明确通过改写维基百科句子生成论述，并为支持或反驳提供证据句。

### scifact

论文为 Fact or Fiction: Verifying Scientific Claims。保存版本为 2020.emnlp-main.609。本轮查阅 PDF 页码为 1, 2, 3, 5, 10, 11。

第 1 至 3 页明确科学论述来自改写引用语句，以摘要及 rationale 句子标注单来源关系，不是对全文作全局真伪判定。

#### scifact_qa_001

题目为 What source material is paired with the expert written claims in SciFact?

复核结果为 complete_within_declared_scope。与旧参考的关系为 agree_with_scope_notes。

参考回答为 SciFact pairs expert written scientific claims with evidence containing abstracts.

证据位置为 scifact PDF 第 1 页，Abstract，scifact_p1_542

已核问题、答案和原文范围，保留或补全来源限定。

#### scifact_citation_match_001

题目为 SciFact pairs expert written scientific claims with evidence containing abstracts.

复核结果为 partial。与旧参考的关系为 revised。

参考回答为 SciFact pairs expert written scientific claims with evidence containing abstracts.

证据位置为 scifact PDF 第 1 页，Abstract，scifact_p1_542

已检查全部允许候选的主题和相关命中段落，补充确有证据的正例。其余候选只完成筛查，保留未判断。

| 候选论文 | 判断     | 理由                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| fever    | unjudged | 本篇主要讨论维基百科论述与证据核验。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| scifact  | supports | 实际正文可以支持关于 scifact 的目标论述。                    |
| vitaminc | unjudged | 本篇主要讨论证据修订下的稳健事实核验。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| multifc  | unjudged | 本篇主要讨论真实网站事实核查数据。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| eraser   | unjudged | 本篇主要讨论解释依据的评价。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| fever2   | unjudged | 本篇主要讨论对抗式事实核验共享任务。已查内容不足以建立目标整句；保留未判断，不作为负例。 |

仍需处理：尚有候选仅筛查而未作完整支持判断，不能用作负例。

#### scifact_check_supported

题目为 SciFact pairs expert written scientific claims with evidence containing abstracts.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 SciFact pairs expert written scientific claims with evidence containing abstracts.

论述 c1：SciFact pairs expert written scientific claims with evidence containing abstracts.。标签为 supported，执行状态为 read。理由为 第 1 至 3 页明确科学论述来自改写引用语句，以摘要及 rationale 句子标注单来源关系，不是对全文作全局真伪判定。 原论述准确复述这些事实。

证据位置为 scifact PDF 第 1 页，Abstract，scifact_p1_542

已核对原子论述、支持方向、量词和证据范围。 第 1 至 3 页明确科学论述来自改写引用语句，以摘要及 rationale 句子标注单来源关系，不是对全文作全局真伪判定。

#### scifact_check_contradicted

题目为 SciFact annotations described in the abstract are based exclusively on complete paper texts rather than abstracts.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 SciFact pairs expert written scientific claims with evidence containing abstracts.

论述 c1：SciFact annotations described in the abstract are based exclusively on complete paper texts rather than abstracts.。标签为 contradicted，执行状态为 read。理由为 第 1 至 3 页明确科学论述来自改写引用语句，以摘要及 rationale 句子标注单来源关系，不是对全文作全局真伪判定。 原论述与这些明确事实相反。

证据位置为 scifact PDF 第 1 页，Abstract，scifact_p1_542

已核对原子论述、支持方向、量词和证据范围。 第 1 至 3 页明确科学论述来自改写引用语句，以摘要及 rationale 句子标注单来源关系，不是对全文作全局真伪判定。

#### scifact_missing_file

题目为 SciFact pairs expert written scientific claims with evidence containing abstracts.

复核结果为 fixture_definition_checked_not_executed。与旧参考的关系为 revised。

参考回答为 所需全文被测试条件设为不可访问，暂时无法核验。应报告材料缺口，不给出支持或冲突结论。

论述 c1：SciFact pairs expert written scientific claims with evidence containing abstracts.。标签为 None，执行状态为 blocked。理由为 The task fixture removes access to the required full text. Missing access does not imply refutation.

证据位置为 无，测试条件为所需全文不可访问。

只核对不可读 fixture 与预期响应；未运行模型或屏蔽文件测试。保留 null 与 blocked。

### drqa

论文为 Reading Wikipedia to Answer Open-Domain Questions。保存版本为 P17-1171。本轮查阅 PDF 页码为 1, 2, 3, 4, 5, 7。

第 1 至 4 页明确描述 bigram、TF-IDF 和循环网络阅读器；没有使用题目所说的 BERT 双编码检索。

#### drqa_qa_001

题目为 What retrieval and reading components does DrQA combine?

复核结果为 complete_within_declared_scope。与旧参考的关系为 agree_with_scope_notes。

参考回答为 DrQA combines bigram hashing and TF-IDF search with a recurrent neural network reader.

证据位置为 drqa PDF 第 1 页，Abstract，drqa_p1_1155

已核问题、答案和原文范围，保留或补全来源限定。

#### drqa_citation_match_001

题目为 DrQA combines bigram hashing and TF-IDF search with a recurrent neural network reader.

复核结果为 partial。与旧参考的关系为 revised。

参考回答为 DrQA combines bigram hashing and TF-IDF search with a recurrent neural network reader.

证据位置为 drqa PDF 第 1 页，Abstract，drqa_p1_1155

已检查全部允许候选的主题和相关命中段落，补充确有证据的正例。其余候选只完成筛查，保留未判断。

| 候选论文 | 判断     | 理由                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| dpr      | unjudged | 本篇主要讨论稠密检索与双编码器。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| fid      | unjudged | 本篇主要讨论检索后生成答案。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| drqa     | supports | 实际正文可以支持关于 drqa 的目标论述。                       |
| orqa     | unjudged | 本篇主要讨论开放检索问答与 ICT 预训练。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| alce     | unjudged | 本篇主要讨论生成引用及其自动评价。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| rarr     | unjudged | 本篇主要讨论为已有文本找依据并修订。已查内容不足以建立目标整句；保留未判断，不作为负例。 |

仍需处理：尚有候选仅筛查而未作完整支持判断，不能用作负例。

#### drqa_check_supported

题目为 DrQA combines bigram hashing and TF-IDF search with a recurrent neural network reader.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 DrQA combines bigram hashing and TF-IDF search with a recurrent neural network reader.

论述 c1：DrQA retrieval uses bigram hashing and TF-IDF matching.。标签为 supported，执行状态为 read。理由为 第 1 至 4 页明确描述 bigram、TF-IDF 和循环网络阅读器；没有使用题目所说的 BERT 双编码检索。 原论述准确复述这些事实。
论述 c2：DrQA uses a recurrent neural network reader.。标签为 supported，执行状态为 read。理由为 第 1 至 4 页明确描述 bigram、TF-IDF 和循环网络阅读器；没有使用题目所说的 BERT 双编码检索。 原论述准确复述这些事实。

证据位置为 drqa PDF 第 1 页，Abstract，drqa_p1_1155

已核对原子论述、支持方向、量词和证据范围。 第 1 至 4 页明确描述 bigram、TF-IDF 和循环网络阅读器；没有使用题目所说的 BERT 双编码检索。

#### drqa_check_contradicted

题目为 DrQA uses a BERT dual encoder as the search component described in its abstract.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 DrQA combines bigram hashing and TF-IDF search with a recurrent neural network reader.

论述 c1：DrQA uses a BERT dual encoder as the search component described in its abstract.。标签为 contradicted，执行状态为 read。理由为 第 1 至 4 页明确描述 bigram、TF-IDF 和循环网络阅读器；没有使用题目所说的 BERT 双编码检索。 原论述与这些明确事实相反。

证据位置为 drqa PDF 第 1 页，Abstract，drqa_p1_1155

已核对原子论述、支持方向、量词和证据范围。 第 1 至 4 页明确描述 bigram、TF-IDF 和循环网络阅读器；没有使用题目所说的 BERT 双编码检索。

### orqa

论文为 Latent Retrieval for Weakly Supervised Open Domain Question Answering。保存版本为 P19-1612。本轮查阅 PDF 页码为 1, 2, 3, 4。

摘要及第 4 页明确使用 Inverse Cloze Task；第 3 页给出问题与证据块的 BERT 稠密编码。

#### orqa_qa_001

题目为 Which task is used to pretrain the ORQA retriever?

复核结果为 complete_within_declared_scope。与旧参考的关系为 agree_with_scope_notes。

参考回答为 ORQA pretrains its retriever with an Inverse Cloze Task.

证据位置为 orqa PDF 第 1 页，Abstract，orqa_p1_1023

已核问题、答案和原文范围，保留或补全来源限定。

#### orqa_citation_match_001

题目为 ORQA pretrains its retriever with an Inverse Cloze Task.

复核结果为 partial。与旧参考的关系为 revised。

参考回答为 ORQA pretrains its retriever with an Inverse Cloze Task.

证据位置为 orqa PDF 第 1 页，Abstract，orqa_p1_1023；dpr PDF 第 1 页，1 Introduction，dpr_p1_3791

已检查全部允许候选的主题和相关命中段落，补充确有证据的正例。其余候选只完成筛查，保留未判断。

| 候选论文 | 判断     | 理由                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| dpr      | supports | 实际正文可以支持关于 orqa 的目标论述。                       |
| fid      | unjudged | 本篇主要讨论检索后生成答案。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| drqa     | unjudged | 本篇主要讨论维基百科检索与抽取阅读。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| orqa     | supports | 实际正文可以支持关于 orqa 的目标论述。                       |
| alce     | unjudged | 本篇主要讨论生成引用及其自动评价。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| rarr     | unjudged | 本篇主要讨论为已有文本找依据并修订。已查内容不足以建立目标整句；保留未判断，不作为负例。 |

仍需处理：尚有候选仅筛查而未作完整支持判断，不能用作负例。

#### orqa_check_supported

题目为 ORQA pretrains its retriever with an Inverse Cloze Task.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 ORQA pretrains its retriever with an Inverse Cloze Task.

论述 c1：ORQA pretrains its retriever with an Inverse Cloze Task.。标签为 supported，执行状态为 read。理由为 摘要及第 4 页明确使用 Inverse Cloze Task；第 3 页给出问题与证据块的 BERT 稠密编码。 原论述准确复述这些事实。

证据位置为 orqa PDF 第 1 页，Abstract，orqa_p1_1023

已核对原子论述、支持方向、量词和证据范围。 摘要及第 4 页明确使用 Inverse Cloze Task；第 3 页给出问题与证据块的 BERT 稠密编码。

#### orqa_check_contradicted

题目为 ORQA trains its retriever from scratch without any pretraining.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 ORQA pretrains its retriever with an Inverse Cloze Task.

论述 c1：ORQA trains its retriever from scratch without any pretraining.。标签为 contradicted，执行状态为 read。理由为 摘要及第 4 页明确使用 Inverse Cloze Task；第 3 页给出问题与证据块的 BERT 稠密编码。 原论述与这些明确事实相反。

证据位置为 orqa PDF 第 1 页，Abstract，orqa_p1_1023

已核对原子论述、支持方向、量词和证据范围。 摘要及第 4 页明确使用 Inverse Cloze Task；第 3 页给出问题与证据块的 BERT 稠密编码。

### alce

论文为 Enabling Large Language Models to Generate Text with Citations。保存版本为 2023.emnlp-main.398。本轮查阅 PDF 页码为 1, 2, 4, 8, 10, 16, 17。

摘要、第 2 页和第 4 页分别说明流畅性、正确性、引用质量及其指标。不能把三者缩成只评流畅性。

#### alce_qa_001

题目为 Which three dimensions do the ALCE automatic metrics assess?

复核结果为 complete_within_declared_scope。与旧参考的关系为 agree_with_scope_notes。

参考回答为 ALCE evaluates fluency, correctness, and citation quality.

证据位置为 alce PDF 第 1 页，Abstract，alce_p1_1115

已核问题、答案和原文范围，保留或补全来源限定。

#### alce_citation_match_001

题目为 ALCE evaluates fluency, correctness, and citation quality.

复核结果为 partial。与旧参考的关系为 revised。

参考回答为 ALCE evaluates fluency, correctness, and citation quality.

证据位置为 alce PDF 第 1 页，Abstract，alce_p1_1115

已检查全部允许候选的主题和相关命中段落，补充确有证据的正例。其余候选只完成筛查，保留未判断。

| 候选论文 | 判断     | 理由                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| dpr      | unjudged | 本篇主要讨论稠密检索与双编码器。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| fid      | unjudged | 本篇主要讨论检索后生成答案。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| drqa     | unjudged | 本篇主要讨论维基百科检索与抽取阅读。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| orqa     | unjudged | 本篇主要讨论开放检索问答与 ICT 预训练。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| alce     | supports | 实际正文可以支持关于 alce 的目标论述。                       |
| rarr     | unjudged | 本篇主要讨论为已有文本找依据并修订。已查内容不足以建立目标整句；保留未判断，不作为负例。 |

仍需处理：尚有候选仅筛查而未作完整支持判断，不能用作负例。

#### alce_check_supported

题目为 ALCE evaluates fluency, correctness, and citation quality.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 ALCE evaluates fluency, correctness, and citation quality.

论述 c1：ALCE evaluates fluency.。标签为 supported，执行状态为 read。理由为 摘要、第 2 页和第 4 页分别说明流畅性、正确性、引用质量及其指标。不能把三者缩成只评流畅性。 原论述准确复述这些事实。
论述 c2：ALCE evaluates correctness.。标签为 supported，执行状态为 read。理由为 摘要、第 2 页和第 4 页分别说明流畅性、正确性、引用质量及其指标。不能把三者缩成只评流畅性。 原论述准确复述这些事实。
论述 c3：ALCE evaluates citation quality.。标签为 supported，执行状态为 read。理由为 摘要、第 2 页和第 4 页分别说明流畅性、正确性、引用质量及其指标。不能把三者缩成只评流畅性。 原论述准确复述这些事实。

证据位置为 alce PDF 第 1 页，Abstract，alce_p1_1115

已核对原子论述、支持方向、量词和证据范围。 摘要、第 2 页和第 4 页分别说明流畅性、正确性、引用质量及其指标。不能把三者缩成只评流畅性。

#### alce_check_contradicted

题目为 ALCE evaluates fluency alone and does not evaluate citation quality.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 ALCE evaluates fluency, correctness, and citation quality.

论述 c1：ALCE evaluates fluency alone.。标签为 contradicted，执行状态为 read。理由为 摘要、第 2 页和第 4 页分别说明流畅性、正确性、引用质量及其指标。不能把三者缩成只评流畅性。 原论述与这些明确事实相反。
论述 c2：ALCE does not evaluate citation quality.。标签为 contradicted，执行状态为 read。理由为 摘要、第 2 页和第 4 页分别说明流畅性、正确性、引用质量及其指标。不能把三者缩成只评流畅性。 原论述与这些明确事实相反。

证据位置为 alce PDF 第 1 页，Abstract，alce_p1_1115

已核对原子论述、支持方向、量词和证据范围。 摘要、第 2 页和第 4 页分别说明流畅性、正确性、引用质量及其指标。不能把三者缩成只评流畅性。

### rarr

论文为 RARR: Researching and Revising What Language Models Say, Using Language Models。保存版本为 2023.acl-long.910。本轮查阅 PDF 页码为 1, 2, 3。

摘要和第 2、3 页区分归因、修订和保留原意。归因于某个来源并不保证该来源本身正确。

#### rarr_qa_001

题目为 What does RARR do after receiving generated text?

复核结果为 complete_within_declared_scope。与旧参考的关系为 agree_with_scope_notes。

参考回答为 RARR finds attribution and edits unsupported content while trying to preserve the original output.

证据位置为 rarr PDF 第 1 页，Abstract，rarr_p1_1136

已核问题、答案和原文范围，保留或补全来源限定。

#### rarr_citation_match_001

题目为 RARR finds attribution and edits unsupported content while trying to preserve the original output.

复核结果为 partial。与旧参考的关系为 revised。

参考回答为 RARR finds attribution and edits unsupported content while trying to preserve the original output.

证据位置为 rarr PDF 第 1 页，Abstract，rarr_p1_1136

已检查全部允许候选的主题和相关命中段落，补充确有证据的正例。其余候选只完成筛查，保留未判断。

| 候选论文 | 判断     | 理由                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| dpr      | unjudged | 本篇主要讨论稠密检索与双编码器。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| fid      | unjudged | 本篇主要讨论检索后生成答案。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| drqa     | unjudged | 本篇主要讨论维基百科检索与抽取阅读。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| orqa     | unjudged | 本篇主要讨论开放检索问答与 ICT 预训练。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| alce     | unjudged | 本篇主要讨论生成引用及其自动评价。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| rarr     | supports | 实际正文可以支持关于 rarr 的目标论述。                       |

仍需处理：尚有候选仅筛查而未作完整支持判断，不能用作负例。

#### rarr_check_supported

题目为 RARR finds attribution and edits unsupported content while trying to preserve the original output.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 RARR finds attribution and edits unsupported content while trying to preserve the original output.

论述 c1：RARR finds attribution for generated text.。标签为 supported，执行状态为 read。理由为 摘要和第 2、3 页区分归因、修订和保留原意。归因于某个来源并不保证该来源本身正确。 原论述准确复述这些事实。
论述 c2：RARR edits unsupported content.。标签为 supported，执行状态为 read。理由为 摘要和第 2、3 页区分归因、修订和保留原意。归因于某个来源并不保证该来源本身正确。 原论述准确复述这些事实。
论述 c3：RARR aims to preserve the original output as much as possible.。标签为 supported，执行状态为 read。理由为 摘要和第 2、3 页区分归因、修订和保留原意。归因于某个来源并不保证该来源本身正确。 原论述准确复述这些事实。

证据位置为 rarr PDF 第 1 页，Abstract，rarr_p1_1136

已核对原子论述、支持方向、量词和证据范围。 摘要和第 2、3 页区分归因、修订和保留原意。归因于某个来源并不保证该来源本身正确。

#### rarr_check_contradicted

题目为 RARR only adds references and never edits the generated text.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 RARR finds attribution and edits unsupported content while trying to preserve the original output.

论述 c1：RARR only adds references.。标签为 contradicted，执行状态为 read。理由为 摘要和第 2、3 页区分归因、修订和保留原意。归因于某个来源并不保证该来源本身正确。 原论述与这些明确事实相反。
论述 c2：RARR never edits generated text.。标签为 contradicted，执行状态为 read。理由为 摘要和第 2、3 页区分归因、修订和保留原意。归因于某个来源并不保证该来源本身正确。 原论述与这些明确事实相反。

证据位置为 rarr PDF 第 1 页，Abstract，rarr_p1_1136

已核对原子论述、支持方向、量词和证据范围。 摘要和第 2、3 页区分归因、修订和保留原意。归因于某个来源并不保证该来源本身正确。

### scicite

论文为 Structural Scaffolds for Citation Intent Classification in Scientific Publications。保存版本为 N19-1361。本轮查阅 PDF 页码为 1, 2, 3。

第 1 至 3 页明确辅助任务为 citation worthiness 与 section title。模型的实际任务与作者年龄、国家无关。

#### scicite_qa_001

题目为 Which two auxiliary tasks provide the structural scaffolds?

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 The auxiliary tasks predict the section title and whether a sentence needs a citation.

证据位置为 scicite PDF 第 3 页，2.1 Structural scaffolds，scicite_p3_26；scicite PDF 第 3 页，2.1 Structural scaffolds，scicite_p3_680

已核问题、答案和原文范围，保留或补全来源限定。

#### scicite_citation_match_001

题目为 The auxiliary tasks predict the section title and whether a sentence needs a citation.

复核结果为 partial。与旧参考的关系为 revised。

参考回答为 The auxiliary tasks predict the section title and whether a sentence needs a citation.

证据位置为 scicite PDF 第 3 页，2.1 Structural scaffolds，scicite_p3_26；scicite PDF 第 3 页，2.1 Structural scaffolds，scicite_p3_680

已检查全部允许候选的主题和相关命中段落，补充确有证据的正例。其余候选只完成筛查，保留未判断。

| 候选论文 | 判断     | 理由                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| s2orc    | unjudged | 本篇主要讨论结构化科研论文语料。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| qasper   | unjudged | 本篇主要讨论论文全文问答及证据标注。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| scicite  | supports | 实际正文可以支持关于 scicite 的目标论述。                    |
| scibert  | unjudged | 本篇主要讨论科学文本预训练语言模型。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| specter  | unjudged | 本篇主要讨论利用引用训练论文表示。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| scitldr  | unjudged | 本篇主要讨论科学论文极短摘要。已查内容不足以建立目标整句；保留未判断，不作为负例。 |

仍需处理：尚有候选仅筛查而未作完整支持判断，不能用作负例。

#### scicite_check_supported

题目为 The auxiliary tasks predict the section title and whether a sentence needs a citation.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 The auxiliary tasks predict the section title and whether a sentence needs a citation.

论述 c1：One structural scaffold predicts the section title.。标签为 supported，执行状态为 read。理由为 第 1 至 3 页明确辅助任务为 citation worthiness 与 section title。模型的实际任务与作者年龄、国家无关。 原论述准确复述这些事实。
论述 c2：One structural scaffold predicts whether a sentence needs a citation.。标签为 supported，执行状态为 read。理由为 第 1 至 3 页明确辅助任务为 citation worthiness 与 section title。模型的实际任务与作者年龄、国家无关。 原论述准确复述这些事实。

证据位置为 scicite PDF 第 3 页，2.1 Structural scaffolds，scicite_p3_26；scicite PDF 第 3 页，2.1 Structural scaffolds，scicite_p3_680

已核对原子论述、支持方向、量词和证据范围。 第 1 至 3 页明确辅助任务为 citation worthiness 与 section title。模型的实际任务与作者年龄、国家无关。

#### scicite_check_contradicted

题目为 The two auxiliary tasks predict author age and publication country.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 The auxiliary tasks predict the section title and whether a sentence needs a citation.

论述 c1：The structural scaffolds predict author age.。标签为 contradicted，执行状态为 read。理由为 第 1 至 3 页明确辅助任务为 citation worthiness 与 section title。模型的实际任务与作者年龄、国家无关。 原论述与这些明确事实相反。
论述 c2：The structural scaffolds predict publication country.。标签为 contradicted，执行状态为 read。理由为 第 1 至 3 页明确辅助任务为 citation worthiness 与 section title。模型的实际任务与作者年龄、国家无关。 原论述与这些明确事实相反。

证据位置为 scicite PDF 第 3 页，2.1 Structural scaffolds，scicite_p3_26；scicite PDF 第 3 页，2.1 Structural scaffolds，scicite_p3_680

已核对原子论述、支持方向、量词和证据范围。 第 1 至 3 页明确辅助任务为 citation worthiness 与 section title。模型的实际任务与作者年龄、国家无关。

### scibert

论文为 SciBERT: A Pretrained Language Model for Scientific Text。保存版本为 D19-1371。本轮查阅 PDF 页码为 1, 2, 3, 5。

第 1、2 页明确沿用 BERT 架构并在科学文本上预训练；不同词表版本是否从原权重初始化另有区别，不能泛称所有版本从零训练。

#### scibert_qa_001

题目为 How does SciBERT relate to BERT in architecture and pretraining text?

复核结果为 complete_within_declared_scope。与旧参考的关系为 agree_with_scope_notes。

参考回答为 SciBERT follows the BERT architecture and is pretrained on scientific text.

证据位置为 scibert PDF 第 1 页，2 Methods, Background，scibert_p1_3523

已核问题、答案和原文范围，保留或补全来源限定。

#### scibert_citation_match_001

题目为 SciBERT follows the BERT architecture and is pretrained on scientific text.

复核结果为 partial。与旧参考的关系为 revised。

参考回答为 SciBERT follows the BERT architecture and is pretrained on scientific text.

证据位置为 scibert PDF 第 1 页，2 Methods, Background，scibert_p1_3523；specter PDF 第 2 页，2.2 Background，specter_p2_2634；s2orc PDF 第 6 页，5 Pretraining BERT on S2ORC，s2orc_p6_2759

已检查全部允许候选的主题和相关命中段落，补充确有证据的正例。其余候选只完成筛查，保留未判断。

| 候选论文 | 判断     | 理由                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| s2orc    | supports | 实际正文可以支持关于 scibert 的目标论述。                    |
| qasper   | unjudged | 本篇主要讨论论文全文问答及证据标注。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| scicite  | unjudged | 本篇主要讨论引用意图分类。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| scibert  | supports | 实际正文可以支持关于 scibert 的目标论述。                    |
| specter  | supports | 实际正文可以支持关于 scibert 的目标论述。                    |
| scitldr  | unjudged | 本篇主要讨论科学论文极短摘要。已查内容不足以建立目标整句；保留未判断，不作为负例。 |

仍需处理：尚有候选仅筛查而未作完整支持判断，不能用作负例。

#### scibert_check_supported

题目为 SciBERT follows the BERT architecture and is pretrained on scientific text.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 SciBERT follows the BERT architecture and is pretrained on scientific text.

论述 c1：SciBERT follows the BERT architecture.。标签为 supported，执行状态为 read。理由为 第 1、2 页明确沿用 BERT 架构并在科学文本上预训练；不同词表版本是否从原权重初始化另有区别，不能泛称所有版本从零训练。 原论述准确复述这些事实。
论述 c2：SciBERT is pretrained on scientific text.。标签为 supported，执行状态为 read。理由为 第 1、2 页明确沿用 BERT 架构并在科学文本上预训练；不同词表版本是否从原权重初始化另有区别，不能泛称所有版本从零训练。 原论述准确复述这些事实。

证据位置为 scibert PDF 第 1 页，2 Methods, Background，scibert_p1_3523

已核对原子论述、支持方向、量词和证据范围。 第 1、2 页明确沿用 BERT 架构并在科学文本上预训练；不同词表版本是否从原权重初始化另有区别，不能泛称所有版本从零训练。

#### scibert_check_contradicted

题目为 SciBERT replaces the BERT architecture with a recurrent neural network.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 SciBERT follows the BERT architecture and is pretrained on scientific text.

论述 c1：SciBERT replaces the BERT architecture with a recurrent neural network.。标签为 contradicted，执行状态为 read。理由为 第 1、2 页明确沿用 BERT 架构并在科学文本上预训练；不同词表版本是否从原权重初始化另有区别，不能泛称所有版本从零训练。 原论述与这些明确事实相反。

证据位置为 scibert PDF 第 1 页，2 Methods, Background，scibert_p1_3523

已核对原子论述、支持方向、量词和证据范围。 第 1、2 页明确沿用 BERT 架构并在科学文本上预训练；不同词表版本是否从原权重初始化另有区别，不能泛称所有版本从零训练。

### specter

论文为 SPECTER: Document-level Representation Learning using Citation-informed Transformers。保存版本为 2020.acl-main.207。本轮查阅 PDF 页码为 1, 2, 3, 4, 5, 6, 7, 10。

第 1、2 页区分训练时使用引用和嵌入推理时无需引用。第 5 至 7 页在共同 SciDocs 任务上直接评估 SciBERT 与 SPECTER。

#### specter_qa_001

题目为 Does SPECTER require citation information when embedding a paper at inference time?

复核结果为 complete_within_declared_scope。与旧参考的关系为 agree_with_scope_notes。

参考回答为 SPECTER does not require citation information at inference time.

证据位置为 specter PDF 第 1 页，1 Introduction，specter_p1_3872

已核问题、答案和原文范围，保留或补全来源限定。

#### specter_citation_match_001

题目为 SPECTER does not require citation information at inference time.

复核结果为 partial。与旧参考的关系为 revised。

参考回答为 SPECTER does not require citation information at inference time.

证据位置为 specter PDF 第 1 页，1 Introduction，specter_p1_3872

已检查全部允许候选的主题和相关命中段落，补充确有证据的正例。其余候选只完成筛查，保留未判断。

| 候选论文 | 判断     | 理由                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| s2orc    | unjudged | 本篇主要讨论结构化科研论文语料。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| qasper   | unjudged | 本篇主要讨论论文全文问答及证据标注。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| scicite  | unjudged | 本篇主要讨论引用意图分类。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| scibert  | unjudged | 本篇主要讨论科学文本预训练语言模型。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| specter  | supports | 实际正文可以支持关于 specter 的目标论述。                    |
| scitldr  | unjudged | 本篇主要讨论科学论文极短摘要。已查内容不足以建立目标整句；保留未判断，不作为负例。 |

仍需处理：尚有候选仅筛查而未作完整支持判断，不能用作负例。

#### specter_check_supported

题目为 SPECTER does not require citation information at inference time.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 SPECTER does not require citation information at inference time.

论述 c1：SPECTER does not require citation information at inference time.。标签为 supported，执行状态为 read。理由为 第 1、2 页区分训练时使用引用和嵌入推理时无需引用。第 5 至 7 页在共同 SciDocs 任务上直接评估 SciBERT 与 SPECTER。 原论述准确复述这些事实。

证据位置为 specter PDF 第 1 页，1 Introduction，specter_p1_3872

已核对原子论述、支持方向、量词和证据范围。 第 1、2 页区分训练时使用引用和嵌入推理时无需引用。第 5 至 7 页在共同 SciDocs 任务上直接评估 SciBERT 与 SPECTER。

#### specter_check_contradicted

题目为 SPECTER requires citation information at inference time for every new paper.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 SPECTER does not require citation information at inference time.

论述 c1：SPECTER requires citation information at inference time for every new paper.。标签为 contradicted，执行状态为 read。理由为 第 1、2 页区分训练时使用引用和嵌入推理时无需引用。第 5 至 7 页在共同 SciDocs 任务上直接评估 SciBERT 与 SPECTER。 原论述与这些明确事实相反。

证据位置为 specter PDF 第 1 页，1 Introduction，specter_p1_3872

已核对原子论述、支持方向、量词和证据范围。 第 1、2 页区分训练时使用引用和嵌入推理时无需引用。第 5 至 7 页在共同 SciDocs 任务上直接评估 SciBERT 与 SPECTER。

#### specter_scope_001

题目为 The evaluation reported here establishes that SPECTER improves performance on every possible task and language.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 The supplied passage does not establish a universal claim about all tasks and languages.

论述 c1：The evaluation reported here establishes that SPECTER improves performance on every possible task and language.。标签为 not_established，执行状态为 read。理由为 给定片段没有建立对所有任务和语言均提升的普遍结论。本判断仅针对输入片段，不是全文缺失证据的断言。

证据位置为 specter PDF 第 1 页，Abstract，specter_p1_1501

只按给定片段作 not_established 判断，不借用未提供全文反驳。

限制为只判断输入片段。

### scitldr

论文为 TLDR: Extreme Summarization of Scientific Documents。保存版本为 2020.findings-emnlp.428。本轮查阅 PDF 页码为 1, 2, 3, 10。

摘要与第 2 页明确 CATTS 把标题作为辅助生成目标。第 3、10 页用于核对 S2ORC 和 scaffolds 引用。空字符来自文本提取，PDF 页面可读。

#### scitldr_qa_001

题目为 What auxiliary training signal does CATTS use?

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 CATTS uses paper titles as an auxiliary training signal for TLDR generation.

证据位置为 scitldr PDF 第 2 页，1 Introduction，scitldr_p2_680

已核问题、答案和原文范围，保留或补全来源限定。

#### scitldr_citation_match_001

题目为 CATTS uses paper titles as an auxiliary training signal for TLDR generation.

复核结果为 partial。与旧参考的关系为 revised。

参考回答为 CATTS uses paper titles as an auxiliary training signal for TLDR generation.

证据位置为 scitldr PDF 第 2 页，1 Introduction，scitldr_p2_680

已检查全部允许候选的主题和相关命中段落，补充确有证据的正例。其余候选只完成筛查，保留未判断。

| 候选论文 | 判断     | 理由                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| s2orc    | unjudged | 本篇主要讨论结构化科研论文语料。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| qasper   | unjudged | 本篇主要讨论论文全文问答及证据标注。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| scicite  | unjudged | 本篇主要讨论引用意图分类。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| scibert  | unjudged | 本篇主要讨论科学文本预训练语言模型。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| specter  | unjudged | 本篇主要讨论利用引用训练论文表示。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| scitldr  | supports | 实际正文可以支持关于 scitldr 的目标论述。                    |

仍需处理：尚有候选仅筛查而未作完整支持判断，不能用作负例。

#### scitldr_check_supported

题目为 CATTS uses paper titles as an auxiliary training signal for TLDR generation.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 CATTS uses paper titles as an auxiliary training signal for TLDR generation.

论述 c1：CATTS uses paper titles as an auxiliary training signal for TLDR generation.。标签为 supported，执行状态为 read。理由为 摘要与第 2 页明确 CATTS 把标题作为辅助生成目标。第 3、10 页用于核对 S2ORC 和 scaffolds 引用。空字符来自文本提取，PDF 页面可读。 原论述准确复述这些事实。

证据位置为 scitldr PDF 第 2 页，1 Introduction，scitldr_p2_680

已核对原子论述、支持方向、量词和证据范围。 摘要与第 2 页明确 CATTS 把标题作为辅助生成目标。第 3、10 页用于核对 S2ORC 和 scaffolds 引用。空字符来自文本提取，PDF 页面可读。

#### scitldr_check_contradicted

题目为 CATTS explicitly excludes paper titles from its auxiliary training signal.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 CATTS uses paper titles as an auxiliary training signal for TLDR generation.

论述 c1：CATTS explicitly excludes paper titles from its auxiliary training signal.。标签为 contradicted，执行状态为 read。理由为 摘要与第 2 页明确 CATTS 把标题作为辅助生成目标。第 3、10 页用于核对 S2ORC 和 scaffolds 引用。空字符来自文本提取，PDF 页面可读。 原论述与这些明确事实相反。

证据位置为 scitldr PDF 第 2 页，1 Introduction，scitldr_p2_680

已核对原子论述、支持方向、量词和证据范围。 摘要与第 2 页明确 CATTS 把标题作为辅助生成目标。第 3、10 页用于核对 S2ORC 和 scaffolds 引用。空字符来自文本提取，PDF 页面可读。

### vitaminc

论文为 Get Your Vitamin C! Robust Fact Verification with Contrastive Evidence。保存版本为 2021.naacl-main.52。本轮查阅 PDF 页码为 1, 2, 3, 4, 13。

第 1、3 页明确成对证据可能支持、反驳或 NEI，不能把非支持一律写成反驳。第 4 页还使用 FEVER 构造合成修订。

#### vitaminc_qa_001

题目为 What distinguishes the evidence pairs in VitaminC?

复核结果为 complete_within_declared_scope。与旧参考的关系为 agree_with_scope_notes。

参考回答为 VitaminC pairs nearly identical evidence with different support for a given claim.

证据位置为 vitaminc PDF 第 1 页，Abstract，vitaminc_p1_1139

已核问题、答案和原文范围，保留或补全来源限定。

#### vitaminc_citation_match_001

题目为 VitaminC pairs nearly identical evidence with different support for a given claim.

复核结果为 partial。与旧参考的关系为 revised。

参考回答为 VitaminC pairs nearly identical evidence with different support for a given claim.

证据位置为 vitaminc PDF 第 1 页，Abstract，vitaminc_p1_1139

已检查全部允许候选的主题和相关命中段落，补充确有证据的正例。其余候选只完成筛查，保留未判断。

| 候选论文 | 判断     | 理由                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| fever    | unjudged | 本篇主要讨论维基百科论述与证据核验。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| scifact  | unjudged | 本篇主要讨论科学论述与摘要证据核验。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| vitaminc | supports | 实际正文可以支持关于 vitaminc 的目标论述。                   |
| multifc  | unjudged | 本篇主要讨论真实网站事实核查数据。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| eraser   | unjudged | 本篇主要讨论解释依据的评价。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| fever2   | unjudged | 本篇主要讨论对抗式事实核验共享任务。已查内容不足以建立目标整句；保留未判断，不作为负例。 |

仍需处理：尚有候选仅筛查而未作完整支持判断，不能用作负例。

#### vitaminc_check_supported

题目为 VitaminC pairs nearly identical evidence with different support for a given claim.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 VitaminC pairs nearly identical evidence with different support for a given claim.

论述 c1：VitaminC pairs nearly identical evidence with different support for a given claim.。标签为 supported，执行状态为 read。理由为 第 1、3 页明确成对证据可能支持、反驳或 NEI，不能把非支持一律写成反驳。第 4 页还使用 FEVER 构造合成修订。 原论述准确复述这些事实。

证据位置为 vitaminc PDF 第 1 页，Abstract，vitaminc_p1_1139

已核对原子论述、支持方向、量词和证据范围。 第 1、3 页明确成对证据可能支持、反驳或 NEI，不能把非支持一律写成反驳。第 4 页还使用 FEVER 构造合成修订。

#### vitaminc_check_contradicted

题目为 Both members of every VitaminC contrastive evidence pair support the same claim.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 VitaminC pairs nearly identical evidence with different support for a given claim.

论述 c1：Both members of every VitaminC contrastive evidence pair support the same claim.。标签为 contradicted，执行状态为 read。理由为 第 1、3 页明确成对证据可能支持、反驳或 NEI，不能把非支持一律写成反驳。第 4 页还使用 FEVER 构造合成修订。 原论述与这些明确事实相反。

证据位置为 vitaminc PDF 第 1 页，Abstract，vitaminc_p1_1139

已核对原子论述、支持方向、量词和证据范围。 第 1、3 页明确成对证据可能支持、反驳或 NEI，不能把非支持一律写成反驳。第 4 页还使用 FEVER 构造合成修订。

### multifc

论文为 MultiFC: A Real-World Multi-Domain Dataset for Evidence-Based Fact Checking of Claims。保存版本为 D19-1475。本轮查阅 PDF 页码为 1, 2, 11。

摘要和第 2 页明确来源为 26 个英文事实核查网站，真值标签来自专家记者。不是单一期刊或无人标注的数据。

#### multifc_qa_001

题目为 Where are MultiFC claims collected and who labels them?

复核结果为 complete_within_declared_scope。与旧参考的关系为 agree_with_scope_notes。

参考回答为 MultiFC uses 26 English fact checking websites and veracity labels from expert journalists.

证据位置为 multifc PDF 第 1 页，Abstract，multifc_p1_744

已核问题、答案和原文范围，保留或补全来源限定。

#### multifc_citation_match_001

题目为 MultiFC uses 26 English fact checking websites and veracity labels from expert journalists.

复核结果为 partial。与旧参考的关系为 revised。

参考回答为 MultiFC uses 26 English fact checking websites and veracity labels from expert journalists.

证据位置为 multifc PDF 第 1 页，Abstract，multifc_p1_744

已检查全部允许候选的主题和相关命中段落，补充确有证据的正例。其余候选只完成筛查，保留未判断。

| 候选论文 | 判断     | 理由                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| fever    | unjudged | 本篇主要讨论维基百科论述与证据核验。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| scifact  | unjudged | 本篇主要讨论科学论述与摘要证据核验。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| vitaminc | unjudged | 本篇主要讨论证据修订下的稳健事实核验。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| multifc  | supports | 实际正文可以支持关于 multifc 的目标论述。                    |
| eraser   | unjudged | 本篇主要讨论解释依据的评价。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| fever2   | unjudged | 本篇主要讨论对抗式事实核验共享任务。已查内容不足以建立目标整句；保留未判断，不作为负例。 |

仍需处理：尚有候选仅筛查而未作完整支持判断，不能用作负例。

#### multifc_check_supported

题目为 MultiFC uses 26 English fact checking websites and veracity labels from expert journalists.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 MultiFC uses 26 English fact checking websites and veracity labels from expert journalists.

论述 c1：MultiFC claims are collected from 26 English fact checking websites.。标签为 supported，执行状态为 read。理由为 摘要和第 2 页明确来源为 26 个英文事实核查网站，真值标签来自专家记者。不是单一期刊或无人标注的数据。 原论述准确复述这些事实。
论述 c2：MultiFC veracity labels come from expert journalists.。标签为 supported，执行状态为 read。理由为 摘要和第 2 页明确来源为 26 个英文事实核查网站，真值标签来自专家记者。不是单一期刊或无人标注的数据。 原论述准确复述这些事实。

证据位置为 multifc PDF 第 1 页，Abstract，multifc_p1_744

已核对原子论述、支持方向、量词和证据范围。 摘要和第 2 页明确来源为 26 个英文事实核查网站，真值标签来自专家记者。不是单一期刊或无人标注的数据。

#### multifc_check_contradicted

题目为 MultiFC claims come from one scientific journal and are labelled without human experts.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 MultiFC uses 26 English fact checking websites and veracity labels from expert journalists.

论述 c1：MultiFC claims come from one scientific journal.。标签为 contradicted，执行状态为 read。理由为 摘要和第 2 页明确来源为 26 个英文事实核查网站，真值标签来自专家记者。不是单一期刊或无人标注的数据。 原论述与这些明确事实相反。
论述 c2：MultiFC labels are assigned without human experts.。标签为 contradicted，执行状态为 read。理由为 摘要和第 2 页明确来源为 26 个英文事实核查网站，真值标签来自专家记者。不是单一期刊或无人标注的数据。 原论述与这些明确事实相反。

证据位置为 multifc PDF 第 1 页，Abstract，multifc_p1_744

已核对原子论述、支持方向、量词和证据范围。 摘要和第 2 页明确来源为 26 个英文事实核查网站，真值标签来自专家记者。不是单一期刊或无人标注的数据。

### eraser

论文为 ERASER: A Benchmark to Evaluate Rationalized NLP Models。保存版本为 2020.acl-main.408。本轮查阅 PDF 页码为 1, 2, 3, 4。

第 1、2、4 页明确区分人类依据一致性与对模型预测的忠实性；两者不是同一个指标。

#### eraser_qa_001

题目为 Does ERASER distinguish agreement with human rationales from faithfulness to model predictions?

复核结果为 complete_within_declared_scope。与旧参考的关系为 agree_with_scope_notes。

参考回答为 ERASER considers both alignment with human rationales and whether rationales influence predictions.

证据位置为 eraser PDF 第 1 页，Abstract，eraser_p1_1239

已核问题、答案和原文范围，保留或补全来源限定。

#### eraser_citation_match_001

题目为 ERASER considers both alignment with human rationales and whether rationales influence predictions.

复核结果为 partial。与旧参考的关系为 revised。

参考回答为 ERASER considers both alignment with human rationales and whether rationales influence predictions.

证据位置为 eraser PDF 第 1 页，Abstract，eraser_p1_1239

已检查全部允许候选的主题和相关命中段落，补充确有证据的正例。其余候选只完成筛查，保留未判断。

| 候选论文 | 判断     | 理由                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| fever    | unjudged | 本篇主要讨论维基百科论述与证据核验。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| scifact  | unjudged | 本篇主要讨论科学论述与摘要证据核验。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| vitaminc | unjudged | 本篇主要讨论证据修订下的稳健事实核验。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| multifc  | unjudged | 本篇主要讨论真实网站事实核查数据。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| eraser   | supports | 实际正文可以支持关于 eraser 的目标论述。                     |
| fever2   | unjudged | 本篇主要讨论对抗式事实核验共享任务。已查内容不足以建立目标整句；保留未判断，不作为负例。 |

仍需处理：尚有候选仅筛查而未作完整支持判断，不能用作负例。

#### eraser_check_supported

题目为 ERASER considers both alignment with human rationales and whether rationales influence predictions.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 ERASER considers both alignment with human rationales and whether rationales influence predictions.

论述 c1：ERASER evaluates alignment with human rationales.。标签为 supported，执行状态为 read。理由为 第 1、2、4 页明确区分人类依据一致性与对模型预测的忠实性；两者不是同一个指标。 原论述准确复述这些事实。
论述 c2：ERASER evaluates faithfulness of rationales to model predictions.。标签为 supported，执行状态为 read。理由为 第 1、2、4 页明确区分人类依据一致性与对模型预测的忠实性；两者不是同一个指标。 原论述准确复述这些事实。

证据位置为 eraser PDF 第 1 页，Abstract，eraser_p1_1239

已核对原子论述、支持方向、量词和证据范围。 第 1、2、4 页明确区分人类依据一致性与对模型预测的忠实性；两者不是同一个指标。

#### eraser_check_contradicted

题目为 ERASER defines faithfulness solely as agreement with human annotations, regardless of model predictions.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 ERASER considers both alignment with human rationales and whether rationales influence predictions.

论述 c1：ERASER defines faithfulness solely as agreement with human annotations, regardless of model predictions.。标签为 contradicted，执行状态为 read。理由为 第 1、2、4 页明确区分人类依据一致性与对模型预测的忠实性；两者不是同一个指标。 原论述与这些明确事实相反。

证据位置为 eraser PDF 第 1 页，Abstract，eraser_p1_1239

已核对原子论述、支持方向、量词和证据范围。 第 1、2、4 页明确区分人类依据一致性与对模型预测的忠实性；两者不是同一个指标。

### fever2

论文为 The FEVER2.0 Shared Task。保存版本为 D19-6601。本轮查阅 PDF 页码为 1, 2, 6。

摘要与第 2 页逐项说明 building、breaking、fixing，且使用原 FEVER 数据。

#### fever2_qa_001

题目为 What are the three phases of the FEVER2.0 shared task?

复核结果为 complete_within_declared_scope。与旧参考的关系为 agree_with_scope_notes。

参考回答为 FEVER2.0 has building, breaking, and fixing phases.

证据位置为 fever2 PDF 第 1 页，Abstract，fever2_p1_816

已核问题、答案和原文范围，保留或补全来源限定。

#### fever2_citation_match_001

题目为 FEVER2.0 has building, breaking, and fixing phases.

复核结果为 partial。与旧参考的关系为 revised。

参考回答为 FEVER2.0 has building, breaking, and fixing phases.

证据位置为 fever2 PDF 第 1 页，Abstract，fever2_p1_816

已检查全部允许候选的主题和相关命中段落，补充确有证据的正例。其余候选只完成筛查，保留未判断。

| 候选论文 | 判断     | 理由                                                         |
| -------- | -------- | ------------------------------------------------------------ |
| fever    | unjudged | 本篇主要讨论维基百科论述与证据核验。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| scifact  | unjudged | 本篇主要讨论科学论述与摘要证据核验。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| vitaminc | unjudged | 本篇主要讨论证据修订下的稳健事实核验。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| multifc  | unjudged | 本篇主要讨论真实网站事实核查数据。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| eraser   | unjudged | 本篇主要讨论解释依据的评价。已查内容不足以建立目标整句；保留未判断，不作为负例。 |
| fever2   | supports | 实际正文可以支持关于 fever2 的目标论述。                     |

仍需处理：尚有候选仅筛查而未作完整支持判断，不能用作负例。

#### fever2_check_supported

题目为 FEVER2.0 has building, breaking, and fixing phases.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 FEVER2.0 has building, breaking, and fixing phases.

论述 c1：FEVER2.0 has a building phase.。标签为 supported，执行状态为 read。理由为 摘要与第 2 页逐项说明 building、breaking、fixing，且使用原 FEVER 数据。 原论述准确复述这些事实。
论述 c2：FEVER2.0 has a breaking phase.。标签为 supported，执行状态为 read。理由为 摘要与第 2 页逐项说明 building、breaking、fixing，且使用原 FEVER 数据。 原论述准确复述这些事实。
论述 c3：FEVER2.0 has a fixing phase.。标签为 supported，执行状态为 read。理由为 摘要与第 2 页逐项说明 building、breaking、fixing，且使用原 FEVER 数据。 原论述准确复述这些事实。

证据位置为 fever2 PDF 第 1 页，Abstract，fever2_p1_816

已核对原子论述、支持方向、量词和证据范围。 摘要与第 2 页逐项说明 building、breaking、fixing，且使用原 FEVER 数据。

#### fever2_check_contradicted

题目为 FEVER2.0 consists only of a builder phase and has no adversarial breaking phase.

复核结果为 complete_within_declared_scope。与旧参考的关系为 revised。

参考回答为 FEVER2.0 has building, breaking, and fixing phases.

论述 c1：FEVER2.0 consists only of a builder phase.。标签为 contradicted，执行状态为 read。理由为 摘要与第 2 页逐项说明 building、breaking、fixing，且使用原 FEVER 数据。 原论述与这些明确事实相反。
论述 c2：FEVER2.0 has no adversarial breaking phase.。标签为 contradicted，执行状态为 read。理由为 摘要与第 2 页逐项说明 building、breaking、fixing，且使用原 FEVER 数据。 原论述与这些明确事实相反。

证据位置为 fever2 PDF 第 1 页，Abstract，fever2_p1_816

已核对原子论述、支持方向、量词和证据范围。 摘要与第 2 页逐项说明 building、breaking、fixing，且使用原 FEVER 数据。

## 文献发现与论文比较

### claim_verification_discovery_001

补充证据为 fever2 PDF 第 1 页，Abstract，fever2_p1_617，与其他原文共同覆盖训练依据或维基百科材料范围。

I am building a fact checker and need a benchmark with claims constructed from Wikipedia sentences and annotated evidence. Find a relevant paper.

复核回答为 直接相关论文为 fever, vitaminc, fever2；其余候选的背景相关性和筛查理由见 candidate_reviews。

证据位置为 fever PDF 第 1 页，1 Introduction，fever_p1_3444；vitaminc PDF 第 3 页，3.2 Writing Claims，vitaminc_p3_2623；fever2 PDF 第 2 页，2.1 Task Phases，fever2_p2_1070

已对 18 个候选逐项作按需求的相关性初判，记录直接相关、背景相关与不相关筛查结果。

| 候选论文 | 需求相关性                | 级别 | 理由                                                         |
| -------- | ------------------------- | ---- | ------------------------------------------------------------ |
| dpr      | not_relevant_in_screening | 0    | 主要讨论稠密检索与双编码器，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| fid      | not_relevant_in_screening | 0    | 主要讨论检索后生成答案，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| s2orc    | not_relevant_in_screening | 0    | 主要讨论结构化科研论文语料，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| qasper   | not_relevant_in_screening | 0    | 主要讨论论文全文问答及证据标注，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| fever    | relevant                  | 2    | 所查正文明确满足研究需求中的方法或数据要求。                 |
| scifact  | partially_relevant        | 1    | 主要讨论科学论述与摘要证据核验，可提供相关背景，但不是该需求的直接资源或方法说明。 |
| drqa     | not_relevant_in_screening | 0    | 主要讨论维基百科检索与抽取阅读，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| orqa     | not_relevant_in_screening | 0    | 主要讨论开放检索问答与 ICT 预训练，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| alce     | partially_relevant        | 1    | 主要讨论生成引用及其自动评价，可提供相关背景，但不是该需求的直接资源或方法说明。 |
| rarr     | partially_relevant        | 1    | 主要讨论为已有文本找依据并修订，可提供相关背景，但不是该需求的直接资源或方法说明。 |
| scicite  | not_relevant_in_screening | 0    | 主要讨论引用意图分类，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| scibert  | not_relevant_in_screening | 0    | 主要讨论科学文本预训练语言模型，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| specter  | not_relevant_in_screening | 0    | 主要讨论利用引用训练论文表示，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| scitldr  | not_relevant_in_screening | 0    | 主要讨论科学论文极短摘要，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| vitaminc | relevant                  | 2    | 所查正文明确满足研究需求中的方法或数据要求。                 |
| multifc  | partially_relevant        | 1    | 主要讨论真实网站事实核查数据，可提供相关背景，但不是该需求的直接资源或方法说明。 |
| eraser   | partially_relevant        | 1    | 主要讨论解释依据的评价，可提供相关背景，但不是该需求的直接资源或方法说明。 |
| fever2   | relevant                  | 2    | 所查正文明确满足研究需求中的方法或数据要求。                 |

本轮不计算排序或系统效果。

### retrieval_qa_discovery_001

I want to replace sparse keyword retrieval in an open domain QA system with a learned dense retriever. Find a paper that explains training a dual encoder for this purpose.

复核回答为 直接相关论文为 dpr, orqa；其余候选的背景相关性和筛查理由见 candidate_reviews。

证据位置为 dpr PDF 第 2 页，1 Introduction，dpr_p2_544；orqa PDF 第 3 页，3 Open-Retrieval Question Answering，orqa_p3_2981

已对 18 个候选逐项作按需求的相关性初判，记录直接相关、背景相关与不相关筛查结果。

| 候选论文 | 需求相关性                | 级别 | 理由                                                         |
| -------- | ------------------------- | ---- | ------------------------------------------------------------ |
| dpr      | relevant                  | 2    | 所查正文明确满足研究需求中的方法或数据要求。                 |
| fid      | partially_relevant        | 1    | 主要讨论检索后生成答案，可提供相关背景，但不是该需求的直接资源或方法说明。 |
| s2orc    | not_relevant_in_screening | 0    | 主要讨论结构化科研论文语料，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| qasper   | not_relevant_in_screening | 0    | 主要讨论论文全文问答及证据标注，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| fever    | not_relevant_in_screening | 0    | 主要讨论维基百科论述与证据核验，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| scifact  | not_relevant_in_screening | 0    | 主要讨论科学论述与摘要证据核验，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| drqa     | partially_relevant        | 1    | 主要讨论维基百科检索与抽取阅读，可提供相关背景，但不是该需求的直接资源或方法说明。 |
| orqa     | relevant                  | 2    | 所查正文明确满足研究需求中的方法或数据要求。                 |
| alce     | partially_relevant        | 1    | 主要讨论生成引用及其自动评价，可提供相关背景，但不是该需求的直接资源或方法说明。 |
| rarr     | partially_relevant        | 1    | 主要讨论为已有文本找依据并修订，可提供相关背景，但不是该需求的直接资源或方法说明。 |
| scicite  | not_relevant_in_screening | 0    | 主要讨论引用意图分类，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| scibert  | not_relevant_in_screening | 0    | 主要讨论科学文本预训练语言模型，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| specter  | partially_relevant        | 1    | 主要讨论利用引用训练论文表示，可提供相关背景，但不是该需求的直接资源或方法说明。 |
| scitldr  | not_relevant_in_screening | 0    | 主要讨论科学论文极短摘要，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| vitaminc | not_relevant_in_screening | 0    | 主要讨论证据修订下的稳健事实核验，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| multifc  | not_relevant_in_screening | 0    | 主要讨论真实网站事实核查数据，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| eraser   | not_relevant_in_screening | 0    | 主要讨论解释依据的评价，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| fever2   | not_relevant_in_screening | 0    | 主要讨论对抗式事实核验共享任务，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |

本轮不计算排序或系统效果。

### scientific_reading_discovery_001

I need a scientific paper corpus with structured full text and links between inline citations and bibliography entries. Which paper should I read?

复核回答为 直接相关论文为 s2orc；其余候选的背景相关性和筛查理由见 candidate_reviews。

证据位置为 s2orc PDF 第 3 页，2.1 Processing PDFs，s2orc_p3_1126

已对 18 个候选逐项作按需求的相关性初判，记录直接相关、背景相关与不相关筛查结果。

| 候选论文 | 需求相关性                | 级别 | 理由                                                         |
| -------- | ------------------------- | ---- | ------------------------------------------------------------ |
| dpr      | not_relevant_in_screening | 0    | 主要讨论稠密检索与双编码器，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| fid      | not_relevant_in_screening | 0    | 主要讨论检索后生成答案，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| s2orc    | relevant                  | 2    | 所查正文明确满足研究需求中的方法或数据要求。                 |
| qasper   | partially_relevant        | 1    | 主要讨论论文全文问答及证据标注，可提供相关背景，但不是该需求的直接资源或方法说明。 |
| fever    | not_relevant_in_screening | 0    | 主要讨论维基百科论述与证据核验，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| scifact  | partially_relevant        | 1    | 主要讨论科学论述与摘要证据核验，可提供相关背景，但不是该需求的直接资源或方法说明。 |
| drqa     | not_relevant_in_screening | 0    | 主要讨论维基百科检索与抽取阅读，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| orqa     | not_relevant_in_screening | 0    | 主要讨论开放检索问答与 ICT 预训练，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| alce     | not_relevant_in_screening | 0    | 主要讨论生成引用及其自动评价，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| rarr     | not_relevant_in_screening | 0    | 主要讨论为已有文本找依据并修订，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| scicite  | partially_relevant        | 1    | 主要讨论引用意图分类，可提供相关背景，但不是该需求的直接资源或方法说明。 |
| scibert  | partially_relevant        | 1    | 主要讨论科学文本预训练语言模型，可提供相关背景，但不是该需求的直接资源或方法说明。 |
| specter  | partially_relevant        | 1    | 主要讨论利用引用训练论文表示，可提供相关背景，但不是该需求的直接资源或方法说明。 |
| scitldr  | partially_relevant        | 1    | 主要讨论科学论文极短摘要，可提供相关背景，但不是该需求的直接资源或方法说明。 |
| vitaminc | not_relevant_in_screening | 0    | 主要讨论证据修订下的稳健事实核验，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| multifc  | not_relevant_in_screening | 0    | 主要讨论真实网站事实核查数据，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| eraser   | not_relevant_in_screening | 0    | 主要讨论解释依据的评价，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |
| fever2   | not_relevant_in_screening | 0    | 主要讨论对抗式事实核验共享任务，其论文主任务不满足当前研究需求。这个筛查判断不表示全文绝不提及相关术语。 |

本轮不计算排序或系统效果。

### compare_drqa_dpr

Compare drqa and dpr in terms of retrieval representation, retriever training, reader architecture. Can their reported scores be compared directly?

复核回答为 DrQA 使用 bigram hashing 与 TF-IDF 检索，阅读器为循环网络，主要用 SQuAD 训练并研究远程监督与多任务训练。DPR 用独立 BERT 编码问题和段落，通过正负段落训练稠密检索器，端到端阅读器也基于 BERT。原论文使用的维基百科版本、检索单位和数据设置不同，不能将任意原始成绩相减解释为检索器带来的因果收益。可以在任务、数据、划分、指标和设置对齐后比较特定实验。

证据位置为 drqa PDF 第 1 页，Abstract，drqa_p1_1155；dpr PDF 第 1 页，Abstract，dpr_p1_753；drqa PDF 第 5 页，4 Data，drqa_p5_308；drqa PDF 第 5 页，4.1 Wikipedia，drqa_p5_730；dpr PDF 第 3 页，3.2 Training，dpr_p3_2152；dpr PDF 第 4 页，4.1 Wikipedia Data Pre-processing，dpr_p4_507；dpr PDF 第 7 页，6.1 End-to-end QA System，dpr_p7_2767

已补查双方方法、数据与评价设置，按条件说明可比范围。

比较字段如下。

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

本轮不计算排序或系统效果。

### compare_scibert_specter

Compare scibert and specter in terms of pretraining source, training signal, inference citation requirement. Can their reported scores be compared directly?

复核回答为 SciBERT 使用科学论文全文预训练 BERT。SPECTER 从 SciBERT 初始化，再用论文标题、摘要和引用三元组训练论文表示；嵌入推理时不需要引用。两篇论文各自主结果的任务和指标不同，但 SPECTER 第 5 至 7 页在同一套 SciDocs 任务中直接评估了 SciBERT 基线，因此该共同实验内可以比较。例如 Table 1 的 MeSH F1 分别为 SciBERT 80.7 和 SPECTER 86.4。此结果不能推广为所有任务或语言均更优。

证据位置为 scibert PDF 第 1 页，2 Methods, Background，scibert_p1_3523；specter PDF 第 1 页，1 Introduction，specter_p1_3872；specter PDF 第 3 页，2.3 Citation-Based Pretraining Objective，specter_p3_735；scibert PDF 第 2 页，2 Methods, Corpus，scibert_p2_423；specter PDF 第 2 页，2.2 Document Representation，specter_p2_3614；specter PDF 第 5 页，4 Experiments，specter_p5_3376；specter PDF 第 6 页，4 Experiments, Baseline Methods，specter_p6_574；specter PDF 第 7 页，Table 1，specter_p7_747

修正笼统不可比结论；SPECTER Table 1 中共同 SciDocs 任务可比，原论文各自主任务成绩不可直接相减。

比较字段如下。

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
  "reason": "仅限 SPECTER 论文中共同 SciDocs 实验内的同任务同指标比较，不是跨原论文任务相减。",
  "scope": "SPECTER SciDocs Table 1"
}
```

本轮不计算排序或系统效果。

### compare_fever_scifact

Compare fever and scifact in terms of domain, claim construction, evidence unit. Can their reported scores be compared directly?

复核回答为 FEVER constructs claims by mutating Wikipedia sentences and requires evidence sentences for supported or refuted claims. SciFact uses expert written scientific claims derived from citation sentences and labels individual claim and abstract pairs with rationale sentences. Their original scores concern different corpora, tasks, and evaluation settings, so they are not a controlled comparison of system quality.

证据位置为 fever PDF 第 1 页，Abstract，fever_p1_586；scifact PDF 第 1 页，Abstract，scifact_p1_542；fever PDF 第 1 页，1 Introduction，fever_p1_3603；scifact PDF 第 3 页，2 Task Definition，scifact_p3_1640；scifact PDF 第 3 页，2 Task Definition，scifact_p3_454

已补查双方方法、数据与评价设置，按条件说明可比范围。

比较字段如下。

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

本轮不计算排序或系统效果。

## 14 条论文关系

### fid_cites_dpr

方向为 fid 引用 dpr。引用存在，当前用途为 method_use。

正文位置为 fid PDF 第 3 页，3 Method, Retrieval，fid_p3_951

书目位置为 fid PDF 第 6 页，References，fid_p6_280

已核对 FiD PDF 第 3 页检索段和第 6 页书目，可确认论文身份和方法使用。书目未标明 arXiv 修订号，当前材料不足以确认具体被引用修订；不得视为与会议版逐字一致。

版本判断为 {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "unresolved", "source_version": "2021.eacl-main.74", "target_library_version": "2020.emnlp-main.550", "note": "论文身份对应不等于被引 PDF 与库中 PDF 逐字一致。"}

与旧参考的关系为 revised。仍需处理：具体被引预印本修订号无法由现有书目确定。

### qasper_cites_s2orc

方向为 qasper 引用 s2orc。引用存在，当前用途为 data_use, method_use。

正文位置为 qasper PDF 第 2 页，2.1 Papers，qasper_p2_2094；qasper PDF 第 2 页，2.1 Papers，qasper_p2_2658

书目位置为 qasper PDF 第 11 页，References，qasper_p11_1857

既筛选 S2ORC 语料，也使用其 LaTeX 解析器。原文注明语料发布版本 20190928 与 20200705v1；这些是语料版本，不是 S2ORC 论文修订号。

版本判断为 {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "not_claimed_byte_identical", "source_version": "2021.naacl-main.365", "target_library_version": "2020.acl-main.447", "note": "论文身份对应不等于被引 PDF 与库中 PDF 逐字一致。"}

与旧参考的关系为 revised。

### specter_cites_scibert

方向为 specter 引用 scibert。引用存在，当前用途为 method_use, result_comparison。

正文位置为 specter PDF 第 3 页，2.2 Document Representation，specter_p3_22；specter PDF 第 7 页，Table 1，specter_p7_747

书目位置为 specter PDF 第 10 页，References，specter_p10_77

SciBERT 用作初始化与共同 SciDocs 实验中的基线。比较成立于该论文中的特定任务与指标，不是普遍优越性或单一模块因果归因。

版本判断为 {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "not_claimed_byte_identical", "source_version": "2020.acl-main.207", "target_library_version": "D19-1371", "note": "论文身份对应不等于被引 PDF 与库中 PDF 逐字一致。"}

与旧参考的关系为 revised。

### vitaminc_cites_fever

方向为 vitaminc 引用 fever。引用存在，当前用途为 data_use。

正文位置为 vitaminc PDF 第 1 页，1 Introduction，vitaminc_p1_3881；vitaminc PDF 第 4 页，3.3 Adding Synthetic Revisions，vitaminc_p4_2314

书目位置为 vitaminc PDF 第 13 页，References，vitaminc_p13_547

引用明确涉及 FEVER 训练数据和合成修订数据。第 1 页 56% 与 86% 是本研究训练设置的诊断比较，不能直接当作比较两篇论文原始系统成绩的引用用途。

版本判断为 {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "not_claimed_byte_identical", "source_version": "2021.naacl-main.52", "target_library_version": "N18-1074", "note": "论文身份对应不等于被引 PDF 与库中 PDF 逐字一致。"}

与旧参考的关系为 revised。

### multifc_cites_fever

方向为 multifc 引用 fever。引用存在，当前用途为 background。

正文位置为 multifc PDF 第 1 页，1 Introduction，multifc_p1_2225

书目位置为 multifc PDF 第 11 页，References，multifc_p11_1805

This is a dataset construction contrast, not a performance comparison.

版本判断为 {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "not_claimed_byte_identical", "source_version": "D19-1475", "target_library_version": "N18-1074", "note": "论文身份对应不等于被引 PDF 与库中 PDF 逐字一致。"}

与旧参考的关系为 revised。

### fever2_cites_fever

方向为 fever2 引用 fever。引用存在，当前用途为 data_use。

正文位置为 fever2 PDF 第 2 页，2 Task Description, Build-It，fever2_p2_378

书目位置为 fever2 PDF 第 6 页，References，fever2_p6_1026

The task uses the original FEVER dataset and adds adversarial evaluation.

版本判断为 {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "not_claimed_byte_identical", "source_version": "D19-6601", "target_library_version": "N18-1074", "note": "论文身份对应不等于被引 PDF 与库中 PDF 逐字一致。"}

与旧参考的关系为 revised。

### dpr_cites_drqa

方向为 dpr 引用 drqa。引用存在，当前用途为 background, method_use。

正文位置为 dpr PDF 第 1 页，1 Introduction，dpr_p1_1754；dpr PDF 第 4 页，4.1 Wikipedia Data Pre-processing，dpr_p4_609

书目位置为 dpr PDF 第 10 页，References，dpr_p10_502

引言把 DrQA 用作检索阅读框架背景，第 4 页还明确复用了预处理代码；不能据此说复用了整个 DrQA 模型。

版本判断为 {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "not_claimed_byte_identical", "source_version": "2020.emnlp-main.550", "target_library_version": "P17-1171", "note": "论文身份对应不等于被引 PDF 与库中 PDF 逐字一致。"}

与旧参考的关系为 revised。

### dpr_cites_orqa

方向为 dpr 引用 orqa。引用存在，当前用途为 background。

正文位置为 dpr PDF 第 1 页，1 Introduction，dpr_p1_3791

书目位置为 dpr PDF 第 10 页，References，dpr_p10_4068

The passage discusses prior dense retrieval and inverse cloze pretraining.

版本判断为 {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "not_claimed_byte_identical", "source_version": "2020.emnlp-main.550", "target_library_version": "P19-1612", "note": "论文身份对应不等于被引 PDF 与库中 PDF 逐字一致。"}

与旧参考的关系为 revised。

### scitldr_cites_s2orc

方向为 scitldr 引用 s2orc。引用存在，当前用途为 method_use。

正文位置为 scitldr PDF 第 3 页，2 Dataset Construction，scitldr_p3_1854

书目位置为 scitldr PDF 第 10 页，References，scitldr_p10_4891

The S2ORC parser is used to process PDFs. This does not mean all SciTLDR papers are drawn from a fixed S2ORC release.

版本判断为 {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "not_claimed_byte_identical", "source_version": "2020.findings-emnlp.428", "target_library_version": "2020.acl-main.447", "note": "论文身份对应不等于被引 PDF 与库中 PDF 逐字一致。"}

与旧参考的关系为 revised。

### scitldr_cites_scicite

方向为 scitldr 引用 scicite。引用存在，当前用途为 background。

正文位置为 scitldr PDF 第 2 页，1 Introduction，scitldr_p2_395

书目位置为 scitldr PDF 第 10 页，References，scitldr_p10_276

The passage cites the idea of scaffold tasks. It does not claim to reuse the SciCite dataset.

版本判断为 {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "not_claimed_byte_identical", "source_version": "2020.findings-emnlp.428", "target_library_version": "N19-1361", "note": "论文身份对应不等于被引 PDF 与库中 PDF 逐字一致。"}

与旧参考的关系为 revised。

### scibert_cites_scicite

方向为 scibert 引用 scicite。引用存在，当前用途为 data_use。

正文位置为 scibert PDF 第 2 页，3.2 Datasets，scibert_p2_1987

书目位置为 scibert PDF 第 5 页，References，scibert_p5_2636

已补核 SciBERT 第 5 页书目，作者、题名、会议及页码对应 SciCite。第 2 页将 SciCite 列为引用意图任务的数据集，用途保留 data_use。

版本判断为 {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "not_claimed_byte_identical", "source_version": "D19-1371", "target_library_version": "N19-1361", "note": "论文身份对应不等于被引 PDF 与库中 PDF 逐字一致。"}

与旧参考的关系为 revised。

### scifact_cites_fever

方向为 scifact 引用 fever。引用存在，当前用途为 background。

正文位置为 scifact PDF 第 2 页，1 Introduction，scifact_p2_2452

书目位置为 scifact PDF 第 11 页，References，scifact_p11_1484

This statement motivates a baseline. It is not a claim that SciFact copies FEVER evidence or labels.

版本判断为 {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "not_claimed_byte_identical", "source_version": "2020.emnlp-main.609", "target_library_version": "N18-1074", "note": "论文身份对应不等于被引 PDF 与库中 PDF 逐字一致。"}

与旧参考的关系为 revised。

### scifact_cites_eraser

方向为 scifact 引用 eraser。引用存在，当前用途为 background。

正文位置为 scifact PDF 第 5 页，4 Evaluation，scifact_p5_1959

书目位置为 scifact PDF 第 10 页，References，scifact_p10_2286

本条确认 ERASER 风格 oracle 评估设置的参照。不可据此直接认定采用 ERASER 全部数据；本地 ERASER 第 3 页 Table 1 不列 SciFact，来源间有关是否收录的表述需要保留版本疑问。

版本判断为 {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "not_claimed_byte_identical", "source_version": "2020.emnlp-main.609", "target_library_version": "2020.acl-main.408", "note": "论文身份对应不等于被引 PDF 与库中 PDF 逐字一致。"}

与旧参考的关系为 revised。

### alce_cites_rarr

方向为 alce 引用 rarr。引用存在，当前用途为 background。

正文位置为 alce PDF 第 4 页，3 Evaluation，alce_p4_1699

书目位置为 alce PDF 第 10 页，References，alce_p10_3948

The citation is in a discussion of factual correctness evaluation, not evidence that ALCE uses the RARR editing pipeline.

版本判断为 {"work_identity": "matched_by_title_authors_and_venue", "exact_revision": "not_claimed_byte_identical", "source_version": "2023.emnlp-main.398", "target_library_version": "2023.acl-long.910", "note": "论文身份对应不等于被引 PDF 与库中 PDF 逐字一致。"}

与旧参考的关系为 revised。

## 尚未解决与交付边界

84 个任务共享不少事实和变体，不能当作 84 个独立自然样本。论文主要来自较早的 NLP 工作，预训练污染和学科覆盖仍是限制。

引用匹配中未判断的候选不可用于完整召回率或 nDCG 的负例集合。文献发现相关性是按当前研究需求作出的筛查判断。

SPECTER 的共同 SciDocs 比较可以保留，不能据此推断训练预算相同或所有任务均更优。FiD 的 DPR 具体修订号仍待额外材料。SciFact 关于 ERASER 收录的表述与本地 ERASER 表格存在版本疑问，未扩展为数据使用结论。

文件校验、原文复核和系统效果测试分别记录。validate_data.py 只校验文件与证据一致性。本轮没有模型预测、准确率、成本或恢复率结果。
