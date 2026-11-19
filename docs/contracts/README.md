# 接口契约索引

前端、后端与 Agent 之间的接口契约，编写规则见 [AGENTS.md](AGENTS.md)。各操作的产物、依赖和用户确认点以[项目书](../source/PaperTrace_Project_Book_ZH.md)为准，本表只记录接口归属与进度。

| 文件 | 内容 |
|---|---|
| [comparison-wiki.md](comparison-wiki.md) | 论文比较、概念与关系、草稿及逐项审阅 |
| [library-reading.md](library-reading.md) | 资料导入、复核与回收、主题归档、全文与笔记 |
| [protocol.md](protocol.md) | 共用协议：通信、标识、写入重试、任务与事件、通用错误、证据定位 |
| [discover-read-locate.md](discover-read-locate.md) | 主线「发现 → 加入主题 → 阅读问答 → 定位原文」的方法、类型和联调样例 |

状态：**已细化**＝字段、行为和样例已定义；**待补**＝在对应功能开工前补齐字段、状态和异常样例。未列方法名的操作尚未分配方法。

## 页面与接口

| 页面 | 操作 | 方法 | 状态 | 待确认 |
|---|---|---|---|---|
| Home 与侧栏 | 创建主题或会话 | `topic.create`、`session.create` | [已细化](discover-read-locate.md#11-方法与类型) | |
| | 查看主题和会话 | `topic.list`、`session.list` | [已细化](discover-read-locate.md#11-方法与类型) | 待处理事项 |
| | 导入材料 | `file.pick`、`paper_import` | [已细化](library-reading.md) | |
| | 归档与恢复主题、会话 | `workspace.archive/archived/unarchive` | [已细化](library-reading.md) | |
| Discover | 发起或细化检索 | `task.prepare`、`task.start`（`discovery`） | [已细化](discover-read-locate.md#21-发现论文) | 后续尝试会议来源筛选 |
| | 读回检索与候选 | `discovery.latest`、`discovery.get` | [已细化](discover-read-locate.md#12-检索与候选) | |
| | 加入、暂存、排除或恢复候选 | `candidate.decide` | [已细化](discover-read-locate.md#12-检索与候选) | 完整复核随 Library 导入交付 |
| | 查看 Agent 步骤 | `discovery.steps` | [已细化](discover-read-locate.md#13-任务结果与事件) | |
| | 定期检索与文献变化 | | 待补 | 交付批次 |
| Read & Ask | 提问和读回历史 | `task.prepare`、`task.start`（`reading_qa`）、`session.get` | [已细化](discover-read-locate.md#23-阅读问答) | 选中文本提问 |
| | 定位原文、查看证据卡 | `evidence.locate` | [摘要](discover-read-locate.md)、[全文](library-reading.md) | |
| | 打开论文和读取摘要 | `source.read_abstract` | [已细化](discover-read-locate.md#24-点击出处定位原文) | [全文与阅读位置](library-reading.md) |
| Discover 与 Read & Ask | 查询、订阅或取消任务 | `task.get`、`task.subscribe`、`task.cancel` | [已细化](protocol.md#4-任务与事件) | 断点继续待补 |
| | 保存回答、编辑笔记、用作引用 | `note.list/save` | [已细化](library-reading.md) | |
| Compare | 发起比较 | `task.start`（`paper_comparison`） | [已细化](comparison-wiki.md) | 终态读取完整表格 |
| | 修订、保存或存为笔记 | `comparison.save`、`comparison.list`、`note.save` | [已细化](comparison-wiki.md) | |
| Library | 浏览个人库 | `library.list` | [已细化](discover-read-locate.md#22-加入主题并读回-library) | 分页 |
| | 导入、补全文、复核重复与冲突 | `task.start`（`paper_import`）、`library.resolve_import` | [已细化](library-reading.md) | |
| | 移出主题、回收站、恢复与清理 | `library.organize/impact/trash/restore/purge` | [已细化](library-reading.md) | |
| | 标签与批量操作、来源更新 | `library.catalog/organize` | [已细化](library-reading.md) | |
| Evidence Wiki | 浏览概念页与关系 | `wiki.list` | [已细化](comparison-wiki.md) | |
| | 生成或重生成草稿 | `task.start`（`wiki_draft`） | [已细化](comparison-wiki.md) | |
| | 审阅、接受或丢弃草稿 | `wiki.review` | [已细化](comparison-wiki.md) | |
| Citation check | 添加稿件、识别论述和引用 | | 待补 | Markdown、LaTeX、Word 实现顺序 |
| | 引用建议 | `task.start`（`citation_suggest`） | 待补 | |
| | 独立回查 | `task.start`（`citation_audit`） | 待补 | |
| | 审阅检查意见 | `audit.review` | 待补 | |
| | 采纳引用或措辞 | `draft.apply_suggestions` | 待补 | 写回能力 |
| | 导出稿件、报告或成果 | | 待补 | 报告导出入口 |
| Models & services | 模型、检索源与解析服务配置及连接测试 | | 待补 | 首批接入的服务 |
| | 查看任务数据去向 | `task.prepare` | [已细化](discover-read-locate.md#11-方法与类型) | 预算首版由服务端配置 |
| | 外部 Agent 只读授权 | | 待补 | 授权有效期与凭据交互 |
| | 备份与恢复 | | 待补 | 入口归属 |

读操作可直接触发。任务范围、授权及产物的采纳由用户决定。
