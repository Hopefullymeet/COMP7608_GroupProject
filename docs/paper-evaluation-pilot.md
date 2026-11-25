# PaperTrace 试评估报告

本轮评估于 2026-11-25 运行，应用提交为 `7320a1a4867e513b5292ba266bf9f01f2fad0260`，数据提交为 `ce230d6b6a7216d594fcf99460dc570772253515`。模型为 `deepseek-flash`，服务地址为 `https://api.deepseek.com`。服务商可能随时间调整该别名对应的实际模型。

本轮尝试了 84 条不同案例，其中 78 条通过应用原生流程运行，6 条单列为研究模块测试。另有 3 次固定检索模式的论文比较对照，以及 1 次文献发现重试。此前使用模拟服务的后端测试不计入模型质量评分。

## 流程是否跑完

“跑完”表示流程返回 completed 结果，回答是否正确另行评估。下表按每条案例的首次尝试统计，重试和对照没有替换首轮结果。

| 任务组 | 案例数 | 完成 | 部分完成 | 报错 | 外部超时 | 如何理解 |
| --- | --- | --- | --- | --- | --- | --- |
| 应用阅读问答 | 18 | 18 | 0 | 0 | 0 | 均返回回答，事实质量仍需复核 |
| 应用全文引用核验 | 36 | 33 | 3 | 0 | 0 | 3 条输出处理失败，未形成有效判断 |
| 应用缺失全文场景 | 3 | 0 | 3 | 0 | 0 | 按预期返回 blocked，访问失败处理检查通过 |
| 应用引用匹配 | 18 | 5 | 13 | 0 | 0 | 12 条输出无效，1 条预算耗尽 |
| 应用论文比较，智能体模式 | 3 | 0 | 3 | 0 | 0 | 均耗尽任务预算 |
| 片段受限研究模块 | 3 | 3 | 0 | 0 | 0 | 已禁用全文访问 |
| 固定候选库文献发现模块 | 3 | 1 | 0 | 1 | 1 | 1 条返回排序，2 条没有可用结果 |
| 不同案例合计 | 84 | 60 | 22 | 1 | 1 | 应用流程与模块测试仍属于两个实验层级 |

应用原生流程小计为 78 条中的 56 条完成、22 条部分完成。额外的 3 条固定检索比较也均为部分完成。检索主题文献发现案例改为单个执行单元重试后，仍然报错。

## 哪些答案与参考一致

| 评估组 | 与现有参考一致 | 答案有争议 | 没有有效答案 | 说明 |
| --- | --- | --- | --- | --- |
| 36 条全文引用核验 | 31 | 2 | 3 | 两条争议案例均已跑完；三条技术失败没有被算作答错 |
| 3 条片段受限模块判断 | 3 | 未发现 | 0 | 均返回 not_established，与给定片段的参考标签一致 |
| 3 条缺失全文场景 | 3 条按预期返回 blocked | 不适用 | 本来就不应给出语义答案 | 没有返回来源锚点或支持结论 |

在跑完的 33 条全文核验中，31 条标签与参考一致，即 31/33，约 93.9%。若看全部 36 次尝试，成功跑完且标签一致的有 31 条，即 31/36，约 86.1%。前者是在已完成案例中计算的一致率，后者还反映流程失败的影响。两者都不能直接称为最终回答准确率或三分类宏平均 F1。比较时，将应用的 conflict 映射为 contradicted。这一组案例中，每条参考答案的原子论述标签都相同，因此这里只做案例级比较。

18 条阅读问答的事实覆盖率、有证据支持的论述精确率和最终引用支持情况均尚未评分。5 条引用匹配虽然跑完，候选质量仍需复核。85 个已筛查但未判断的候选不能作为负例，因此不报告完整的匹配召回率或 nDCG。部分完成的论文比较也没有最终评分。

科研阅读主题的发现模块返回了全部 18 个候选，没有重复。这一条已完成模块案例的 nDCG@5 和直接相关论文 Recall@5，按暂定相关性等级计算均为 1.0。这些数值没有涵盖另外两条失败或超时的发现案例，也不能说明应用在线发现的表现，或生成理由是否正确。

## 哪些已完成答案存在争议

| 案例 | 参考标签 | 系统判断 | 具体分歧 | 需要复核什么 |
| --- | --- | --- | --- | --- |
| fever_check_supported | supported | partial | 原论述将 FEVER 的论述构造概括为修改维基百科句子。保存的核验结果区分了先提取形成论述与后续修改论述两个环节，认为原句概括过宽，并提供了来源锚点和更窄的改写建议。 | 对照 FEVER 数据构造章节，确认原句范围。判断是参考答案过于宽泛，还是模型判断过严。 |
| scitldr_check_supported | supported | evidence_not_established | 原论述涉及 CATTS 使用论文标题作为辅助训练信号。保存的结果称未建立有效的支持或冲突证据，且没有锚点。 | 对照 SciTLDR 参考证据，检查检索到的片段和证据校验。现有报告无法区分是没检索到，还是检索后证据被拒绝。 |

这两条目前是未解决的判断分歧，尚不能确认为语义错误。drqa_check_contradicted、alce_check_supported 和 multifc_check_supported 属于下文的流程失败，不归入答案争议组。

## 问题发生在哪一步

本报告区分七个步骤。S1 选择允许使用的材料并设置访问限制；S2 导入 PDF 和元数据；S3 准备应用请求或模块输入；S4 执行模型调用和研究工具；S5 解析输出并检查字段、证据；S6 汇总并保存最终报告；S7 将保存的结果与参考比较。引用连接测试则在 S2 后进入参考文献解析和论文身份匹配。

| 问题与案例 | 已确认的步骤 | 保存的证据 | 影响与下一项检查 |
| --- | --- | --- | --- |
| drqa_check_contradicted、alce_check_supported、multifc_check_supported | S4/S5，研究工具运行后的输出处理或校验 | 错误码为 MODEL_OUTPUT_INVALID；保存步骤包含 paper_search、paper_read；报告中的判断为 blocked | 三条均部分完成，没有有效语义答案。应检查原始响应、checks 数组和证据接受情况，再判断问题。日志不足以确定是 JSON 解析、字段校验，还是其他模型输出检查失败。 |
| 下方列出的 12 条引用匹配案例 | S4/S5，研究工具运行后的建议输出处理或校验 | MODEL_OUTPUT_INVALID，建议报告不完整 | 没有完整候选结果。应检查模型响应及句子到建议的结构，现有记录不能确定具体哪条校验规则失败。 |
| fever_citation_match_001 | S4，研究循环预算 | TASK_BUDGET_EXHAUSTED；报告用量记录为 12 个模型步骤、18 次工具调用 | 结果部分完成。完整候选列表尚不能评分，应先检查预算与检索过程。 |
| compare_drqa_dpr、compare_scibert_specter、compare_fever_scifact | S4，完整比较形成前的研究或证据预算 | 3 次智能体运行和 3 次固定检索对照均返回 TASK_BUDGET_EXHAUSTED；DrQA/DPR 的智能体记录最后为 paper_read，并提示 Evidence budget reached | 共 6 次部分完成，没有最终比较质量分数。应检查证据预算、生成预算，并单独查看已保存的比较单元格。 |
| retrieval_qa_discovery_001，首轮和重试 | S2 之后、准备或运行研究模块期间，具体调用尚未定位 | 两个保存的工作区均已有 18 篇论文和 PDF；OperationalError 的信息为 disk I/O error | 论文已持久化，但没有返回排序。run_components.py 将来源汇总、工具准备和 runtime.run 放在同一异常捕获范围内，又未保存调用栈或阶段标记，因此不能断言错误来自 paper_search。下次运行前需要补充阶段日志和调用栈。 |
| claim_verification_discovery_001 | 模块执行或关闭阶段在外部终止前未返回，具体内部步骤尚未定位 | 没有返回模块结果；评估监控记录运行超过五分钟并终止进程 | 没有排序或语义判断。应在 runtime.run 和 worker.close 前后增加进度记录，并设置可强制执行的外部时限。现有证据无法区分仍在执行模型或工具，还是关闭过程延迟。 |
| 论文显示标题均为 paper，元数据将会议页眉当作标题 | S2，导入与元数据提取 | 原始文件名均为 paper.pdf；保存的论文记录和引用索引元数据包含这些标题 | 78 条应用案例都对应这一原始导入条件。后续实验应先补齐已有书目信息，不能直接将本轮结果解释成补齐元数据后的表现。 |
| 补充元数据后仍缺少两条引用连接 | S2 后的参考文献解析或论文身份匹配，具体规则尚未定位 | scitldr_cites_s2orc、scitldr_cites_scicite 未出现在匹配结果中，索引没有待完成任务 | 应检查 SciTLDR 的解析条目和身份匹配。没有匹配到，不等于原文没有引用。 |

返回 MODEL_OUTPUT_INVALID 的 12 条匹配案例为：

- alce_citation_match_001
- drqa_citation_match_001
- eraser_citation_match_001
- fever2_citation_match_001
- fid_citation_match_001
- multifc_citation_match_001
- orqa_citation_match_001
- qasper_citation_match_001
- s2orc_citation_match_001
- scibert_citation_match_001
- scitldr_citation_match_001
- vitaminc_citation_match_001

预设缺失全文的案例是 fid_missing_file、qasper_missing_file 和 scifact_missing_file。S1 未导入它们的 PDF，核验返回 blocked 和 CITATIONS_UNRESOLVED。这里的部分完成反映材料不可用，不属于对可读来源理解失败。

以上定位来自现有日志，本次修改没有新增付费模型运行。部分记录只能确认失败阶段，缺少定位到具体调用所需的细节。这种日志缺口本身也是评估限制。

## 证据检查和运行耗时

问答生成耗时中位数为 13.226 秒，按最近秩方法计算的 p95 为 21.404 秒。每题运行一次，使用 3 个并发评估执行单元。耗时包含模型流程，不含 PDF 导入。

144 个问答句子中，130 个带有引用锚点。各回答内分别去重后，最终锚点合计 204 个。这些锚点都能定位到保存的来源证据，但语义支持情况仍需复核。部分无引用句子可能是在说明限制，而非陈述事实。

应用运行和对照中保存的 917 个锚点均能定位，引句与原文一致，PDF 哈希也在允许范围内。其中包含中间证据，不能当作最终回答的引用精确率。

引用连接测试在原始导入时找回 0/14 条已知连接，通过应用元数据接口补入标题、作者和 DOI 后找回 12/14 条，约 85.7%。这是已知正例连接的找回情况，不能直接说明整个图谱的精确率、引用用途准确率或版本等价性。FiD 所引 DPR 的具体预印本修订号仍未确定。

## 输入条件和待完成复核

每条应用案例均使用独立的工作区和主题，只导入允许使用的 PDF。答案、标签、复核文件和证据参考索引放在应用之外，先前回答和 Wiki 内容无法进入后续案例。PDF 哈希保持不变。

78 条应用案例使用原始路径和文件名。只有引用连接对照使用清单元数据重跑，没有测量补充元数据对其他任务成绩的影响。

引用核验和建议的适配程序将每条原始论述放入小型合成稿件，并将被引来源明确对应到允许使用的论文。解析文本已保存，部分句子包含稿件页眉。这些结果适用于本次说明的适配方式。

片段受限模块只接收给定文本，禁用全文访问。文献发现模块通过研究工具使用固定的 18 篇候选库，与应用的外部发现流程分开。

正式评估前，应复核尚未评分的输出和两条争议标签、补齐候选判断、利用更完整的阶段日志排查故障，并固定完整元数据。完成率统计中继续保留部分完成和失败的运行。受控变体和较早发表的 NLP 论文，也需要独立复核及额外留出材料，才能用于泛化结论。

## 逐案例的执行与答案状态

下表将技术失败与答错分开。参考一致仅针对已测量的标签或排序，不代表已完成全部语义复核。

| 案例 | 执行层级 | 是否跑完 | 答案或参考对照状态 | 失败步骤或待办 |
| --- | --- | --- | --- | --- |
| dpr_qa_001 | 应用 | 是 | 未评分 | S7：待复核事实 |
| dpr_citation_match_001 | 应用 | 是 | 候选质量未评分 | S7：候选判断未齐 |
| dpr_check_supported | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| dpr_check_contradicted | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| fid_qa_001 | 应用 | 是 | 未评分 | S7：待复核事实 |
| fid_citation_match_001 | 应用 | 部分完成 | 候选结果不完整 | S4/S5: MODEL_OUTPUT_INVALID |
| fid_check_supported | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| fid_check_contradicted | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| s2orc_qa_001 | 应用 | 是 | 未评分 | S7：待复核事实 |
| s2orc_citation_match_001 | 应用 | 部分完成 | 候选结果不完整 | S4/S5: MODEL_OUTPUT_INVALID |
| s2orc_check_supported | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| s2orc_check_contradicted | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| qasper_qa_001 | 应用 | 是 | 未评分 | S7：待复核事实 |
| qasper_citation_match_001 | 应用 | 部分完成 | 候选结果不完整 | S4/S5: MODEL_OUTPUT_INVALID |
| qasper_check_supported | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| qasper_check_contradicted | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| fever_qa_001 | 应用 | 是 | 未评分 | S7：待复核事实 |
| fever_citation_match_001 | 应用 | 部分完成 | 候选结果不完整 | S4: TASK_BUDGET_EXHAUSTED |
| fever_check_supported | 应用 | 是 | 答案有争议 | S7：复核证据和参考 |
| fever_check_contradicted | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| scifact_qa_001 | 应用 | 是 | 未评分 | S7：待复核事实 |
| scifact_citation_match_001 | 应用 | 是 | 候选质量未评分 | S7：候选判断未齐 |
| scifact_check_supported | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| scifact_check_contradicted | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| drqa_qa_001 | 应用 | 是 | 未评分 | S7：待复核事实 |
| drqa_citation_match_001 | 应用 | 部分完成 | 候选结果不完整 | S4/S5: MODEL_OUTPUT_INVALID |
| drqa_check_supported | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| drqa_check_contradicted | 应用 | 部分完成 | 没有有效判断 | S4/S5：MODEL_OUTPUT_INVALID |
| orqa_qa_001 | 应用 | 是 | 未评分 | S7：待复核事实 |
| orqa_citation_match_001 | 应用 | 部分完成 | 候选结果不完整 | S4/S5: MODEL_OUTPUT_INVALID |
| orqa_check_supported | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| orqa_check_contradicted | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| alce_qa_001 | 应用 | 是 | 未评分 | S7：待复核事实 |
| alce_citation_match_001 | 应用 | 部分完成 | 候选结果不完整 | S4/S5: MODEL_OUTPUT_INVALID |
| alce_check_supported | 应用 | 部分完成 | 没有有效判断 | S4/S5：MODEL_OUTPUT_INVALID |
| alce_check_contradicted | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| rarr_qa_001 | 应用 | 是 | 未评分 | S7：待复核事实 |
| rarr_citation_match_001 | 应用 | 是 | 候选质量未评分 | S7：候选判断未齐 |
| rarr_check_supported | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| rarr_check_contradicted | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| scicite_qa_001 | 应用 | 是 | 未评分 | S7：待复核事实 |
| scicite_citation_match_001 | 应用 | 是 | 候选质量未评分 | S7：候选判断未齐 |
| scicite_check_supported | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| scicite_check_contradicted | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| scibert_qa_001 | 应用 | 是 | 未评分 | S7：待复核事实 |
| scibert_citation_match_001 | 应用 | 部分完成 | 候选结果不完整 | S4/S5: MODEL_OUTPUT_INVALID |
| scibert_check_supported | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| scibert_check_contradicted | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| specter_qa_001 | 应用 | 是 | 未评分 | S7：待复核事实 |
| specter_citation_match_001 | 应用 | 是 | 候选质量未评分 | S7：候选判断未齐 |
| specter_check_supported | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| specter_check_contradicted | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| scitldr_qa_001 | 应用 | 是 | 未评分 | S7：待复核事实 |
| scitldr_citation_match_001 | 应用 | 部分完成 | 候选结果不完整 | S4/S5: MODEL_OUTPUT_INVALID |
| scitldr_check_supported | 应用 | 是 | 答案有争议 | S7：复核证据和参考 |
| scitldr_check_contradicted | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| vitaminc_qa_001 | 应用 | 是 | 未评分 | S7：待复核事实 |
| vitaminc_citation_match_001 | 应用 | 部分完成 | 候选结果不完整 | S4/S5: MODEL_OUTPUT_INVALID |
| vitaminc_check_supported | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| vitaminc_check_contradicted | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| multifc_qa_001 | 应用 | 是 | 未评分 | S7：待复核事实 |
| multifc_citation_match_001 | 应用 | 部分完成 | 候选结果不完整 | S4/S5: MODEL_OUTPUT_INVALID |
| multifc_check_supported | 应用 | 部分完成 | 没有有效判断 | S4/S5：MODEL_OUTPUT_INVALID |
| multifc_check_contradicted | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| eraser_qa_001 | 应用 | 是 | 未评分 | S7：待复核事实 |
| eraser_citation_match_001 | 应用 | 部分完成 | 候选结果不完整 | S4/S5: MODEL_OUTPUT_INVALID |
| eraser_check_supported | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| eraser_check_contradicted | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| fever2_qa_001 | 应用 | 是 | 未评分 | S7：待复核事实 |
| fever2_citation_match_001 | 应用 | 部分完成 | 候选结果不完整 | S4/S5: MODEL_OUTPUT_INVALID |
| fever2_check_supported | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| fever2_check_contradicted | 应用 | 是 | 参考标签一致 | S7：标签对照通过 |
| dpr_scope_001 | 模块 | 是 | 参考标签一致 | S7：仅模块标签对照 |
| fid_scope_001 | 模块 | 是 | 参考标签一致 | S7：仅模块标签对照 |
| specter_scope_001 | 模块 | 是 | 参考标签一致 | S7：仅模块标签对照 |
| claim_verification_discovery_001 | 模块 | 超时 | 没有排序结果 | 模块运行或关闭：超时 |
| retrieval_qa_discovery_001 | 模块 | 报错 | 没有排序结果 | S2 后：I/O 具体调用未定位 |
| scientific_reading_discovery_001 | 模块 | 是 | 暂定排序指标达标 | S7：nDCG@5=1.0，理由未复核 |
| fid_missing_file | 应用 | 部分完成 | 按预期返回 blocked | S1：访问限制验证通过 |
| qasper_missing_file | 应用 | 部分完成 | 按预期返回 blocked | S1：访问限制验证通过 |
| scifact_missing_file | 应用 | 部分完成 | 按预期返回 blocked | S1：访问限制验证通过 |
| compare_drqa_dpr | 应用 | 部分完成 | 无最终比较评分 | S4：TASK_BUDGET_EXHAUSTED |
| compare_scibert_specter | 应用 | 部分完成 | 无最终比较评分 | S4：TASK_BUDGET_EXHAUSTED |
| compare_fever_scifact | 应用 | 部分完成 | 无最终比较评分 | S4：TASK_BUDGET_EXHAUSTED |

## 证据文件

以下为评测者记录的实验工作区相对路径。本次入库材料为报告正文，未附这次试评估的原始输出。主报告附带的逐题文件属于另一批运行。

- `results/report-diagnostics.json` 按 case ID 保存应用失败码、最后保存的步骤和原始记录路径。
- `results/measured-metrics.json` 保存耗时与 36 条全文核验的参考比较。
- `results/native-*/outputs.jsonl` 保存应用原始响应；`results/native-*/collected.json` 包含核验报告和证据。
- `results/components-*/outputs.jsonl` 保存模块结果和监控进程记录的超时。发现模块的失败重试另行保留。
- `results/final-summary.json` 分开记录应用与模块的覆盖情况。
- `results/relation-results.json` 和 `results/relation-metadata-results.json` 保存两种引用连接测试条件。
- `NATIVE_RESULTS.md` 列出应用运行和详细标签比较。
