# 离线引用索引与 PDF 稿件回查

在桌面 RPC 工作区使用，沿用[共用协议](protocol.md)及[全文证据定位](literature-synthesis.md)。引用索引负责确认书目和正文位置。稿件回查针对一个具体句子判断被引来源的支持范围。

| 操作 | 接口与行为 |
| --- | --- |
| 查论文引用 | `literature.refs` 接收 `topic_id`、`source_version_id` 和方向 `outgoing` 或 `incoming`。返回候选条目的匹配状态、引用双方版本，以及已定位的正文摘录和 PDF 页码。未找到正文位置时保留书目。旧资料若正在补索引，响应列出 `pending_versions`。 |
| 导入与定位稿件 | `draft.import` 接收 `operation_id`、`topic_id`、`{name,content}`（Base64 PDF）或本机 PDF 路径，可带 `draft_id` 表示新增版本。返回稿件的只读版本及识别出的引用句。重复导入复用原版本。用 `draft.list` 读取稿件和报告，用 `draft.page` 按稿件版本及页码渲染原页。 |
| 打开历史核查 | 工作区只读接口 `audit.history` 接收空对象，返回 `items`。每项含主题、稿件与版本、报告 ID 和核查时间。无记录时返回空列表。按 ID 打开对应报告，无须重新发起任务。 |
| 确认书目映射 | `draft.resolve_reference` 接收稿件版本、`ref_key`、所选主题内 `paper_id`。空值恢复自动匹配。歧义、当前主题缺论文和缺全文分别保留待查状态。 |
| 回查与取消 | `task.prepare → task.start` 的 `citation_audit` 接收 `draft_id`、`version_id`、选定句子和来源版本。检查逐句逐引用进行。远程确认单列明所选稿件句和原文摘录。任务终态含 `record_id`，报告从稿件读回。无法查证和预算耗尽可以保留部分结果。 |
| 查找引用建议 | `citation_suggest` 沿用 `draft_id`、`version_id`、`sentence_ids` 和 `source_versions`。可选已有引用的句子或稿件的 `uncited_sentences`。每次至多选择 12 句和 12 篇论文，每篇一个版本。模型只查确认范围内的全文，响应含逐项支持程度、短引文、限制和待补点。 |
| 审阅与积累 | `audit.review` 接受、拒绝或留待处理。已接受且附原文的判断按句子、引用范围和来源版本复用。使用 `audit.save_to_wiki` 显式加入主题 Wiki。更换来源版本或手工修改书目映射后，相关判断及已保存的 Wiki 条目标记为待复核。过期判断的再次接受、保存和证据导出返回 `STALE_REVISION`。 |
| 导出 | `export.create` 支持 `format: evidence`、`audit_report` 和 `bibliography`。输入稿件版本与报告 ID，或提纲 `record_id`，再传选定 `item_ids`。返回供用户下载的 Markdown 和 BibTeX 内容，引用键一致。生成内容和实际下载是两个操作。选中的提纲观点依赖已换版的原文时，返回 `STALE_REVISION`。用户可重新选择只包含当前证据的观点。 |

## 跑通示例

将 ALCE 和 ASQA 加入同一主题。查 ALCE 的参考文献，点击 ASQA 的正文引用打开 ALCE 第 2 页。再把测试稿导入 Citation check，先核对书目指向，然后选择一句话进行检查。对有据的结果选择接受，打开导出，检查正文页码及 BibTeX 键。添加同一来源的新 PDF 版本后，历史引句依旧可以打开，相关判断进入待复核状态。

引用列表可以展开引用原文并打开已入库的被引 PDF。打开被引 PDF 时从首页开始，方便用户查看原文。稿件页的「重查受影响的句子」按当前引用对应关系生成一批核查任务，历史报告保留各自的待复核状态。某一句重新核查并产生当前判断后，就可以从待复核队列移除它。失败的重查保留待复核状态。

建议报告的 `kind` 为 `citation_suggest`，每条 finding 对应一个原句。旧稿件可通过 `draft.prose` 按稿件版本补读未引用句子，已有引用句 ID 保留。引用锚点属于本轮查阅过的精确版本。建议的 `source_versions` 记录有证据的依赖，`stale_suggestion_sentence_ids` 独立于回查列表。建议保留在稿件报告，接受后可导出或存入 Wiki。原 PDF 保留。

默认解析带文字层的编号或作者–年份引用。可通过 `PAPERTRACE_GROBID_PORT` 启用已运行在本机的 GROBID 作为可选解析器。仅连接回环地址，关闭其远端书目补全。失败时回退到 Poppler 文本解析。扫描版和无法可靠识别的版式需要补材料或人工确认。

## 稿件主题与整篇核查

同一项目里的每篇核查稿件拥有独立的 `draft_id`。新增版本沿用稿件 ID，同一 PDF 重复导入会打开已有稿件。可上传 PDF，也可给 `draft.import` 传入本项目的 `source_version_id`。项目研究工具菜单和引用核查页打开同一份记录。

`citation_audit` 的 `whole_document: true` 接收当前稿件版本的引用句 ID 和允许查阅的来源版本。上传后先在本机识别书目，用户确认查阅范围后逐条核查。每处理一项即保存一次，中断后可以重新发起。新报告复用来源和匹配仍有效的判断。来源换版或缺失的文献入库后，受影响句会显示待重查。

报告按句子和书目保存判断。每条 `chain` 记录父节点、查阅版本和可打开的证据。原文摘录包含转述引用时继续查找项目中的来源。同一个来源的重复路径使用 `same_as` 指回已读节点。缺少全文的条目保留书目信息，可用 DOI、arXiv 或题名查找。每条链最多查阅 32 个不同版本，未读来源保留在报告里。

追问使用相同的任务类型，传入报告 ID 和 `question`。回答写入该稿件版本的报告，引文必须能在本次允许的范围内定位。历史报告和作者上传的 PDF 可随时回看。

核查任务可通过 `input.language` 指定 `zh-CN` 或 `en`。报告解释与句子小结跟随该语言，证据保留原文。以另一种语言重查会保存新报告。
