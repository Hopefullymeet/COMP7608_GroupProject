# 主题文献综合

本线沿用[任务、确认单及证据协议](protocol.md)。桌面客户端从主题的 **Synthesize** 页进入，旧版会话和两篇论文的[比较契约](comparison-wiki.md)继续可用。

| 方法 | 请求 | 响应与失败行为 |
|---|---|---|
| `library.import_pdf` | `operation_id`、`topic_id`，桌面拖入用绝对 `path`，文件选择用 `name` 和 Base64 `content`。选填 `paper_id` 表示为主题内现有论文加版本。 | 返回 `paper_id`、`source_version_id`、`available_scope`、`duplicate`。PDF 原件、页级片段和索引事务写入。内容重复时重用版本。无法提取正文的可读 PDF 标为 `metadata`。格式错误或超限时回传导入错误。 |
| `task.prepare` → `task.start` | `kind: literature_synthesis`、`topic_id`，`input: {question, source_versions}`。每篇选择一个版本，共 2–12 篇。 | 确认单显示所选版本和发送给模型的内容类别。任务发出搜索、阅读和 Wiki 进度，终态返回 `{record_id}`。证据不足或预算耗尽时，保留可用的部分结果与缺口。 |
| `synthesis.list` | `{topic_id}` | 返回主题内的提纲和活跃任务 ID。提纲含原问题、论点、论文关系、缺口和已读范围。单条论述可列多篇贡献、适用条件和锚点。关系记录双方版本、引用上下文、实验条件和判断。 |
| `synthesis.wiki` | `{topic_id}` | 返回 Wiki 修订号、已采纳的观点和关系。来源换版后，相关条目标为 `needs_review`，保留旧引文与内容历史。 |
| `synthesis.review` | `{operation_id, topic_id, record_id, base_revision, item_ids}` | 原子采纳选中的草稿项，返回 Wiki 最新状态。修订号过期或拟替换项与提纲生成时的版本不同时，回传 `STALE_REVISION`。 |
| `evidence.open` → `source.page` | 从锚点读回论文本段与页码，再向 `source.page` 传 `{topic_id, source_version_id, page}`。 | 从保存的原件渲染该页，返回 `{page, png}`。后台校验主题、论文版本和页码。锚点承诺逐字出处，语义判断仍显示为模型给出的结论。 |

**走查样例**　同一主题选择 ALCE 与 ASQA。Agent 在 ALCE 正文找到使用 ASQA 的上下文，再读 ASQA 对任务的定义。提纲中可展开两篇的不同作用并打开相应 PDF 页。用户审阅后采纳一项，下轮综合能用 `wiki_search` 找到它，通过 `paper_read` 核对原文。为 ASQA 加新版后，受影响的条目显示待复核。Agent 在新版中重新检索并可生成对原条目的复核建议。

评估调用允许在任务输入中加入 `mode`。默认 `wiki`，`agent` 使用全文工具，`fixed` 只使用一次固定检索所得材料。三种方式使用同一模型、同一论文范围及最多 36 个全文片段的阅读预算。

## 论文练习

`practice_generate` 通过 `task.prepare → task.start` 发起。输入为学习目标 `question`、1–8 个当前 `source_versions` 和出题数 `count`（1–10）。确认单列出可能发送的学习目标、论文标题及原文片段。题目必须带本轮读过、且能从原版本定位的逐字引句。输出部分题目时以 `partial` 返回，`result.question_ids` 列出可用题。没有可用题时以 `failed` 返回。

| 接口 | 请求与行为 |
| --- | --- |
| `practice.questions` | `topic_id`，可选 `missed_only`、`due_only`；返回题目 ID、题干、原文版本、待复核状态及下次复习时间。 |
| `practice.start` | `operation_id`、`topic_id`、1–20 个 `question_ids`；生成 `attempt_id`，打乱选项并固定题目版本。待复核题返回 `STALE_REVISION`。 |
| `practice.attempt` | `topic_id`、`attempt_id`；按之前的选项顺序恢复练习。交卷前仅返回题目及选项。 |
| `practice.submit` | `operation_id`、`topic_id`、`attempt_id` 和 `answers`（题目 ID → 从零开始的选项序号）。省略的题为未答。离线评分，返回总分、逐题正确选项、解释、证据锚点与下次复习时间。 |
| `practice.history` | `topic_id`；返回练习 ID、状态、开始时间与交卷分数。 |

答错或未答的题立即进入复习队列。连续答对按 1、3、7、14、30 天安排下一次复习。已有练习在论文更新后仍按发题时的内容评分；新练习需重新出题。交卷后可用 `evidence.open` 打开题目依据。
