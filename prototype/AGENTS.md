# prototype/AGENTS.md

PaperTrace 视觉原型：可点击的纯前端演示，同时作为后续实现的界面层地基。本文件规定本目录的范围、边界与约束；在本目录工作前先读，范围变更须先更新本文件。

依据：[项目书](../docs/source/PaperTrace_Project_Book_ZH.md)（产品规则）、[技术书](../docs/source/PaperTrace_Technical_Book_ZH.md)（技术栈与对象）、[设计交接包](../docs/deliverables/PaperTrace_Handoff_20261109/)（功能与信息架构参考）。

## 范围

一条连贯、可录屏走完的演示主线：

| # | 界面 | 必须体现 |
|---|---|---|
| 1 | Home | 简洁的问题输入入口与示例问题，可拖入论文；主题与会话从侧边栏进入 |
| 2 | Discovery | Agent 拆分检索角度；候选附推荐理由、阅读层级（摘要/全文）、会议与年份来源；Add / Hold / Not relevant；反馈后调整查询；覆盖说明与缺口 |
| 3 | Chat & Read | 左聊右读；回答流式出现，句子级来源 |
| 4 | Evidence card | 定位并高亮原文；原句、页码、阅读范围；Use as citation / Save as note（任务交付与用户采纳分开） |
| 5 | Agent trace | 可展开的计划 → 工具调用 → 观察 → 决策（补读/停止）步骤，含原因与用量 |
| 6 | Comparison | 两篇论文按方法、数据划分、指标、基线、成立条件对比；每格带出处；不可比项写明原因，不留空白 |

侧边栏四个工作区页面（2026-11-09 纳入范围）：

| # | 页面 | 必须体现 |
|---|---|---|
| 7 | Library | 个人库全部论文：身份（DOI/arXiv）、文件版本与预印本关联、所属主题、阅读层级；导入复核（疑似重复需用户确认，哈希不能证明同一论文）；移出主题与从库删除分开，删除前列出受影响主题、笔记、引用与比较，进入回收站可恢复；永久清空单独确认 |
| 8 | Evidence wiki | 概念页由用户选择的笔记与关系整理；每条陈述带来源；关系有方向、类型、证据与核验状态；分歧保留双方依据与待调查项；Agent 提议草稿先显示差异，用户接受或丢弃后才写入 |
| 9 | Citation check | 稿件逐句回查：拆分子论述，分别记录支持 / 冲突 / 证据未确立 / 材料阻塞；整句仅全部支持才算支持；引用建议显示“已找到原文，等待你选择”；接受检查意见与采纳改稿是两个动作，改稿生成新版本并需重查 |
| 10 | Models & services | 模型与服务选择、测试连接（原型不发请求）；密钥由宿主系统钥匙串保管，页面不接收；任务预算（调用、token、时长、费用上限）；检索源声明实际支持的筛选字段；解析服务状态；数据去向说明；外部 Agent 只读授权可撤销 |

仍不做：报告导出、真实导入解析、稿件格式往返（Markdown/LaTeX/Word 写回）、定期检索。

## 边界

- 纯前端：不接后端，不调用 LLM 或搜索 API，不解析 PDF，不引入 Tauri/Electron。
- 数据为写死的示例；流式输出与 Agent 步骤由脚本化事件序列驱动；状态仅在内存中，刷新即重置。
- 示例论文使用 QASPER 及 2–3 篇相关论文的真实标题、作者与摘录；用量、时间等数字为示例。
- 页面常驻 `Prototype · mock data` 标识，不得呈现为可用系统或伪造真实结果。
- 仅桌面端：1280–1600 宽度为目标，更窄不崩坏即可；不做手机布局。

## 约束

- 技术栈：React + TypeScript + Vite，pnpm 管理依赖；只添加当前界面确实用到的依赖。
- 界面语言：英文。
- 设计：Figma/SVG 仅作功能与信息架构参考，不要求 1:1；视觉与交互可重新设计，方向为以阅读为中心、证据可追溯。
- 数据层：示例数据按技术书领域对象组织（Topic、Session、Paper、Candidate、EvidenceAnchor、Comparison、AgentStep）；事件形态参照技术书 §3 的增量事件。界面只经数据层读取，便于日后替换为真实服务。
- 验证：1440×960 下逐屏截图自查，主线可从头走到尾且控制台无错误。

## 代码结构

- `src/data/`：`types.ts` 领域对象；`fixtures.ts` 论文、摘录与证据锚点；`scripts.ts` 各任务的脚本化 Agent 事件；`runtime.ts` 以 JSON-RPC 通知形态回放事件；`store.tsx` 唯一状态入口。接真实服务时替换 `runtime.ts` 与 `scripts.ts`，界面不改。
- `src/views/`：Home、TopicView（Discover / Read & ask / Compare 三个标签）。
- `src/components/`：Sidebar、TraceDrawer（Agent trace）、EvidencePopover（证据卡）、Icon。
- 侧边栏（参照 Codex / Claude Desktop）：New topic 启用：回到空白首页并清空问题与附件，提交有效问题或附件后才创建 Topic 与首个 Session；自定义主题保存请求和附件名，不执行真实研究。Coming later 入口在 Topics 之上；点击 Topic 只展开/折叠其 Session 列表，不跳转；悬停 Topic 右侧 `+` 新建 Session 并进入 Read & ask（已有空 Session 时复用）；Topics 超过 5 个、单个 Topic 的 Session 超过 4 个时折叠，保留 Show more。标签顺序固定为 Discover / Read & ask / Compare。
- Topic 与 Session 支持悬停或键盘聚焦显示删除图标；删除 Topic 同时移除其 Session，所有入口同步更新，刷新恢复示例数据。只有 Evidence in scientific QA 提供研究任务回放；其余 Topic 与 Session 支持列表与删除操作。
- 滚动只用 `components/util.ts` 的 `scrollWithin`，不要用 `scrollIntoView`（会带动 `overflow: hidden` 的外层整体移位）。
