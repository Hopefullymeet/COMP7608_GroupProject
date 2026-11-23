# 主题 Wiki

每个**主题**有一份 Wiki，作为该主题的长期记忆，类似 Claude 与 ChatGPT 的 Memory。它覆盖主题里的全部论文、会话和保存的材料，不属于某一篇 PDF。用户在主题中提问、导入 PDF、写笔记或保存发现时，Wiki 随之逐条累积。累积到一定程度后，系统把这些条目整理成概述。用户可以在 Wiki 页面阅读和编辑这份记忆，也可以和它对话。原 Evidence Wiki 的概念页与草稿审阅（`wiki.list`、`wiki.review`、`wiki_draft`）已移除。ID、写入幂等与错误沿用[共用协议](protocol.md)，`anchor_ids` 经 [evidence.open](library-reading.md) 定位。

## 1. 累积：捕获触发器

捕获在本地完成，不调用模型，每次活动后立即写入条目（`origin` 标明来源）。每项活动以键记录在 Wiki 的已观察集合中，重开应用或重复触发不会重复捕获。

| 触发 | 时机 | 生成的条目 |
|---|---|---|
| 问答完成 | `reading_qa`、`reader_question` 等任务以 completed 或 partial 结束 | `finding`：本轮第一条有出处的回答句及其锚点；没有出处时记为 `open_question`，内容为问题本身。`origin=qa` |
| PDF 解析 | `library.import_pdf`、书目或标识导入写入全文分片后 | 每篇论文当前版本最多 3 段关键分片：摘要首句、含「we propose / in this paper / results show」等的论断句、结论句。系统为每段生成指向 PDF 页的锚点，条目为 `paper`，`origin=pdf` |
| 论文加入主题 | `candidate.decide` 加入，只有摘要或元数据 | 摘要首句或标题，`paper`，`origin=paper`。之后补到全文时再按 PDF 解析捕获 |
| 笔记 | `note.save`（含修订） | `finding`，`origin=note`，每个修订捕获一次 |
| 已存发现 | `synthesis.review`、`reader.answer_save`、`reader.mark_to_wiki`、`audit.save_to_wiki` | `finding`，`origin=finding` |
| Wiki 对话 | 用户说「记住……」「忘掉……」或要求更正 | 新增或修改条目；删除先生成建议，`origin=chat` 并置顶 |
| 兜底 | `wiki.get` | 补捕获后台解析等未经过写入路径的活动 |

捕获的条目最多保留 80 条。超出时先丢弃最早的未置顶捕获条目，用户条目、对话条目和置顶条目不受影响。

## 2. 整理：概述何时生成

整理读取主题材料和全部捕获条目，生成一句话 `headline`、2–4 段 `summary`，并把捕获条目合并为不超过 24 条的整理条目（`origin=summary`，保留锚点）。置顶条目和用户条目原样保留。整理期间新捕获的条目不会丢失。

| 触发 | 条件 |
|---|---|
| 首次整理 | 首次捕获条目后自动在本地整理。用户可查看端点与数据类别并点击「整理 Wiki」启用该端点。 |
| 自动整理 | 已整理过，且上次整理后新增捕获 `new_since_summary` 达到 5 条。后台自动开始，无需打开页面 |
| 打开页面 | 已整理过且材料变化，本地或已启用相同模型端点时自动更新。 |
| 手动 | 用户随时调用 `wiki.refresh` |

主题名是文件名（如 `paper.pdf`）时，本地整理改用最近的问题或第一篇论文描述研究内容，不把主题当作单篇 PDF 来描述。

## 3. 方法

| 方法 | `params` | `result` 与失败行为 |
|---|---|---|
| `wiki.get` | `{topic_id}` | `Wiki`。先做兜底捕获。整理或回复进行中时 `status=generating` 或 `pending_reply=true`，客户端约每 1.2 秒重读。进程中断后留下的进行中状态读回时带 `issue.reason=PROCESS_INTERRUPTED` |
| `wiki.refresh` | `{operation_id,topic_id}` | `Wiki`，`status=generating`。完成后变为 `ready`，失败为 `failed` 或保留原内容并带 `issue`。正在整理时重复调用返回当前状态 |
| `wiki.chat` | `{operation_id,topic_id,text:NonEmptyText}` | `Wiki`，`thread` 末尾追加用户消息且 `pending_reply=true`。完成后追加助手消息，记忆修改写在该消息的 `changes` 中。上一条未回复或正在整理时返回 `TEMPORARILY_UNAVAILABLE`（可重试）。`text` 最长 2000 字 |
| `wiki.edit` | `{operation_id,topic_id,action,entry_id?,text?,kind?}` | `Wiki`。`action` 为 `add`（需 `text`，`kind` 默认 `finding`）、`update`（需 `entry_id`、`text`）、`remove`、`pin`、`unpin`。添加或修改的条目 `origin=user` 并置顶。条目不存在返回 `NOT_FOUND` |
| `wiki.clear_chat` | `{operation_id,topic_id}` | `Wiki`，清空对话，条目不变。回复进行中返回 `TEMPORARILY_UNAVAILABLE` |

```ts
type WikiKind = 'focus' | 'paper' | 'finding' | 'preference' | 'open_question'
type WikiOrigin = 'qa' | 'pdf' | 'paper' | 'note' | 'finding'   // 捕获
  | 'summary' | 'chat' | 'user'                                   // 整理、对话、用户
type WikiEntry = { entry_id: Id; kind: WikiKind; text: NonEmptyText; anchor_ids: Id[]; origin: WikiOrigin; pinned: boolean; updated_at: string }
type WikiChange = { op: 'add' | 'update' | 'remove'; entry_id: Id; text: string; before?: string }
type WikiMessage = { message_id: Id; role: 'user' | 'assistant'; text: string; created_at: string; changes?: WikiChange[] }
type Wiki = {
  topic_id: Id
  revision: Id                         // 从未整理为 ''
  status: 'empty' | 'generating' | 'ready' | 'failed'
  headline: string
  summary: string[]
  entries: WikiEntry[]                 // 未整理前也会有捕获条目
  sources: { papers: number; notes: number; answers: number; findings: number }
  new_since_summary: number            // 上次整理后新捕获的条目数
  stale: boolean
  generated_at?: string
  generator: { kind: 'model'; model: string; endpoint: string } | { kind: 'local' }
  transfer?: { endpoint: string; data_categories: NonEmpty<string> }
  thread: WikiMessage[]
  pending_reply: boolean
  issue?: Issue
}
```

## 4. 模型输出

- 已配置模型密钥时，整理和回复使用「模型与服务」的端点；未配置或处于本地联调模式时在本地完成，`generator.kind=local`。
- 整理返回 `{headline,summary,entries:[{kind,text,anchor_ids}]}`，对话返回 `{reply,changes:[{op,entry_id?,kind?,text?}]}`。系统丢弃输入中不存在的锚点和 `entry_id`，单条条目最长 400 字。
- 对话只读取 Wiki、主题材料摘要和最近 8 条消息。用户只是提问时，`changes` 为空。

## 5. 样例

主题 t1 名为「Research evidence」。用户先从 Discover 加入 PubMedQA，Wiki 立即捕获 `paper` 条目，锚点指向摘要首句。随后用户在会话中问 `What context does PubMedQA use?`，任务完成时 Wiki 捕获一条引用 a1 的 `finding`（`origin=qa`），此时页面还没有打开过。用户打开 Wiki 并点「整理 Wiki」，系统返回 `generating`，页面显示翻书动画，完成后 `headline` 概括整个主题。用户发送「记住我只关注生物医学数据集」，Wiki 新增一条 `preference`（`origin=chat`）。之后用户连续保存 5 条笔记，Wiki 捕获这 5 条并在后台自动重新整理，`new_since_summary` 归零，偏好条目保留。用户再导入一篇 PDF，解析后 Wiki 捕获该论文最多 3 段带页码的分片。

## 普通论文问答

`reading_qa` 在准备任务时读取当前主题的 Wiki 标题句、一段相关概述（各最多 200 字）和最多五条记忆（每条最多 180 字）。优先置顶，其次按与问题的词项重合度排序。任务确认显示发送类别，确认指纹覆盖这份记忆。摘要、全文和自定义端点路径都使用它理解问题和偏好，事实结论仍需所选论文原文支持。

## 主题研究地图

桌面端从 `wiki.get` 读取 `map_nodes`。每个节点有稳定 ID、父节点、标题和证据 ID；父节点为空表示直接连接主题。证据详情在 `map_sources` 中按 ID 查找，包含论文标题、引文、来源范围及可用页码。正文入口复用 `evidence.open`。

`wiki.edit` 接受 `map_add`（在指定节点下添加）、`map_rename` 和 `map_remove`。删除需传 `confirmed: true`，默认将子节点上移，传 `subtree: true` 同时删除下级。原论文与证据独立保存。模型建议删除或更改中心标题时，由 Wiki 内的 `map_accept` 或 `map_dismiss` 处理。

`topic.list` 可以返回 `wiki_unread` 和产生更新的会话任务 ID `wiki_turns`。进入对应主题地图后用 `map_seen` 标为已读。会话只展示更新提示，后续讨论留在 Wiki。
