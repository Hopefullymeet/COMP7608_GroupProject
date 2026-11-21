# 接口契约索引

前端、后端与 Agent 之间的接口契约，编写规则见 [AGENTS.md](AGENTS.md)。各操作的产物、依赖和用户确认点以[项目书](../source/PaperTrace_Project_Book_ZH.md)为准，本表只记录接口归属与进度。

| 文件 | 内容 |
|---|---|
| [services-workspace.md](services-workspace.md) | 服务配置、只读授权、持续检索、检查点与备份 |
| [citation-export.md](citation-export.md) | 稿件、建议、回查、审阅、写回与导出 |
| [pdf-reader.md](pdf-reader.md) | PDF 批注、选区问答及按描述找图表 |
| [pdf-citations.md](pdf-citations.md) | 本地引用索引、PDF 稿件回查和选定证据导出 |
| [literature-synthesis.md](literature-synthesis.md) | 主题 PDF 全文、跨论文证据提纲、Wiki 审阅与换版 |
| [comparison-wiki.md](comparison-wiki.md) | 论文比较、概念与关系、草稿及逐项审阅 |
| [library-reading.md](library-reading.md) | 资料导入、复核与回收、主题归档、全文与笔记 |
| [protocol.md](protocol.md) | 共用协议：通信、标识、写入重试、任务与事件、通用错误、证据定位 |
| [discover-read-locate.md](discover-read-locate.md) | 主线「发现 → 加入主题 → 阅读问答 → 定位原文」的方法、类型和联调样例 |

状态：**已细化**表示方法、字段、行为及联调样例已定义。

## 页面与接口

| 页面 | 操作 | 方法 | 状态 | 实现说明 |
|---|---|---|---|---|
| Home 与侧栏 | 创建主题或会话 | `topic.create`、`session.create` | [已细化](discover-read-locate.md#11-方法与类型) | |
| | 修改主题和会话名称 | `topic.rename`、`session.rename` | [方法与类型](discover-read-locate.md#11-方法与类型) | |
| | 查看主题和会话 | `topic.list`、`session.list` | [已细化](discover-read-locate.md#11-方法与类型) | [待办与变化](services-workspace.md) |
| | 导入材料 | `file.pick`、`file.stage_drop`、`paper_import` | [已细化](library-reading.md) | |
| | 归档与恢复主题、会话 | `workspace.archive/archived/unarchive` | [已细化](library-reading.md) | |
| Discover | 发起或细化检索 | `task.prepare`、`task.start`（`discovery`） | [已细化](discover-read-locate.md#21-发现论文) | [按来源能力开放会议筛选](services-workspace.md) |
| | 读回检索与候选 | `discovery.latest`、`discovery.get` | [已细化](discover-read-locate.md#12-检索与候选) | |
| | 加入、暂存、排除或恢复候选 | `candidate.decide` | [已细化](discover-read-locate.md#12-检索与候选) | [导入复核](library-reading.md) |
| | 查看 Agent 步骤 | `discovery.steps` | [已细化](discover-read-locate.md#13-任务结果与事件) | |
| | 定期检索与文献变化 | `discovery.watch`、`workspace.activity` | [已细化](services-workspace.md) | |
| Read & Ask | 提问和读回历史 | `task.prepare`、`task.start`（`reading_qa`）、`session.get` | [已细化](discover-read-locate.md#23-阅读问答) | [选中文本提问](library-reading.md) |
| | 定位原文、查看证据卡 | `evidence.locate`、`evidence.open` | [摘要](discover-read-locate.md)、[全文](library-reading.md) | |
| | 打开原件、读取摘要或全文，保存会话阅读位置 | `source.original`、`source.read_abstract`、`source.read`、`reader.position/bookmark` | [已细化](discover-read-locate.md#24-点击出处定位原文) | [全文与阅读位置](library-reading.md) |
| 所有任务 | 历史、步骤及用量 | `task.history` | [已细化](protocol.md#41-工作区的任务记录) | |
| 所有任务 | 查询、订阅或取消任务 | `task.get`、`task.subscribe`、`task.cancel` | [已细化](protocol.md#4-任务与事件) | [检查点恢复](services-workspace.md) |
| Read & Ask 和 Library | 保存回答、编辑笔记、用作引用 | `note.list/save` | [已细化](library-reading.md) | |
| Synthesize | PDF 导入、生成提纲、定位原文、采纳 Wiki | `library.import_pdf`、`literature_synthesis`、`synthesis.list/wiki/review`、`source.page` | [已实现](literature-synthesis.md) | 桌面 RPC 模式 |
| Compare | 发起比较 | `task.start`（`paper_comparison`） | [已细化](comparison-wiki.md) | 终态读取完整表格 |
| | 修订、保存或存为笔记 | `comparison.save`、`comparison.list`、`note.save` | [已细化](comparison-wiki.md) | |
| Library | 浏览个人库 | `library.list` | [已细化](discover-read-locate.md#22-加入主题并读回-library) | 客户端分段显示 |
| | 导入、补全文、复核重复与冲突 | `task.start`（`paper_import`）、`library.resolve_import` | [已细化](library-reading.md) | |
| | 移出主题、回收站、恢复与清理 | `library.organize/impact/trash/restore/purge` | [已细化](library-reading.md) | |
| | 标签与批量操作、来源更新 | `library.catalog/organize` | [已细化](library-reading.md) | |
| Evidence Wiki | 浏览概念页与关系 | `wiki.list` | [已细化](comparison-wiki.md) | |
| | 生成或重生成草稿 | `task.start`（`wiki_draft`） | [已细化](comparison-wiki.md) | |
| | 审阅、接受或丢弃草稿 | `wiki.review` | [已细化](comparison-wiki.md) | |
| Citation check | 添加稿件、识别论述和引用 | `draft.import/list` | [已细化](citation-export.md) | |
| | 引用建议 | `task.start`（`citation_suggest`） | [已细化](citation-export.md) | |
| | 独立回查 | `task.start`（`citation_audit`） | [已细化](citation-export.md) | |
| | 审阅检查意见 | `audit.review` | [已细化](citation-export.md) | |
| | 采纳引用或措辞 | `draft.apply_suggestions` | [已细化](citation-export.md) | |
| | 导出稿件、报告或成果 | `export.create` | [已细化](citation-export.md) | |
| Models & services | 模型、检索源与解析服务配置及连接测试 | `services.get/save/test/credentials` | [已细化](services-workspace.md) | |
| | 查看任务数据去向 | `task.prepare` | [已细化](discover-read-locate.md#11-方法与类型) | [任务预算](services-workspace.md) |
| | 外部 Agent 只读授权 | `access.list/grant/revoke` | [已细化](services-workspace.md) | |
| | 备份与恢复 | `backup.create/inspect/restore` | [已细化](services-workspace.md) | |

读操作可直接触发。任务范围、授权及产物的采纳由用户决定。
