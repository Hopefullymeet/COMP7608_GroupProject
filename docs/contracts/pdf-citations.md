# 离线引用索引与 PDF 稿件回查

在桌面 RPC 工作区使用，沿用[共用协议](protocol.md)及[全文证据定位](literature-synthesis.md)。引用索引负责确认书目和正文位置。稿件回查针对一个具体句子判断被引来源的支持范围。

| 操作 | 接口与行为 |
| --- | --- |
| 查论文引用 | `literature.refs` 接收 `topic_id`、`source_version_id` 和方向 `outgoing` 或 `incoming`。返回候选条目的匹配状态、引用双方版本，以及已定位的正文摘录和 PDF 页码。未找到正文位置时保留书目。旧资料若正在补索引，响应列出 `pending_versions`。 |
| 导入与定位稿件 | `draft.import` 接收 `operation_id`、`topic_id`、`{name,content}`（Base64 PDF）或本机 PDF 路径，可带 `draft_id` 表示新增版本。返回稿件的只读版本及识别出的引用句。重复导入复用原版本。用 `draft.list` 读取稿件和报告，用 `draft.page` 按稿件版本及页码渲染原页。 |
| 确认书目映射 | `draft.resolve_reference` 接收稿件版本、`ref_key`、所选主题内 `paper_id`。空值恢复自动匹配。歧义、当前主题缺论文和缺全文分别保留待查状态。 |
| 回查与取消 | `task.prepare → task.start` 的 `citation_audit` 接收 `draft_id`、`version_id`、选定句子和来源版本。检查逐句逐引用进行。远程确认单列明所选稿件句和原文摘录。任务终态含 `record_id`，报告从稿件读回。无法查证和预算耗尽可以保留部分结果。 |
| 审阅与积累 | `audit.review` 接受、拒绝或留待处理。已接受且附原文的判断按句子、引用范围和来源版本复用。使用 `audit.save_to_wiki` 显式加入主题 Wiki。更换来源版本或手工修改书目映射后，相关判断及已保存的 Wiki 条目标记为待复核。过期判断的再次接受、保存和证据导出返回 `STALE_REVISION`。 |
| 导出 | `export.create` 支持 `format: evidence`、`audit_report` 和 `bibliography`。输入稿件版本与报告 ID，或提纲 `record_id`，再传选定 `item_ids`。返回供用户下载的 Markdown 和 BibTeX 内容，引用键一致。生成内容和实际下载是两个操作。 |

## 跑通示例

将 ALCE 和 ASQA 加入同一主题。查 ALCE 的参考文献，点击 ASQA 的正文引用打开 ALCE 第 2 页。再把测试稿导入 Citation check，先核对书目指向，然后选择一句话进行检查。对有据的结果选择接受，打开导出，检查正文页码及 BibTeX 键。添加同一来源的新 PDF 版本后，历史引句依旧可以打开，相关判断进入待复核状态。

默认解析带文字层的编号或作者–年份引用。可通过 `PAPERTRACE_GROBID_PORT` 启用已运行在本机的 GROBID 作为可选解析器。仅连接回环地址，关闭其远端书目补全。失败时回退到 Poppler 文本解析。扫描版和无法可靠识别的版式需要补材料或人工确认。
