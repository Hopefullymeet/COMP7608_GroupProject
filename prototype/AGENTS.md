# prototype/AGENTS.md

PaperTrace 视觉原型：可点击的纯前端演示，同时作为后续实现的界面层地基。本文件规定本目录的范围、边界与约束；在本目录工作前先读，范围变更须先更新本文件。

依据：[项目书](../docs/source/PaperTrace_Project_Book_ZH.md)（产品规则）、[技术书](../docs/source/PaperTrace_Technical_Book_ZH.md)（技术栈与对象）、[设计交接包](../docs/deliverables/PaperTrace_Handoff_20261109/)（功能与信息架构参考）。

## 范围

一条连贯、可录屏走完的演示主线：

| # | 界面 | 必须体现 |
|---|---|---|
| 1 | Home | 研究主题、最近会话；可从问题或拖入论文开始 |
| 2 | Discovery | Agent 拆分检索角度；候选附推荐理由、阅读层级（摘要/全文）、会议与年份来源；Add / Hold / Not relevant；反馈后调整查询；覆盖说明与缺口 |
| 3 | Chat & Read | 左聊右读；回答流式出现，句子级来源 |
| 4 | Evidence card | 定位并高亮原文；原句、页码、阅读范围；Use as citation / Save as note（任务交付与用户采纳分开） |
| 5 | Agent trace | 可展开的计划 → 工具调用 → 观察 → 决策（补读/停止）步骤，含原因与用量 |
| 6 | Comparison | 两篇论文按方法、数据划分、指标、基线、成立条件对比；每格带出处；不可比项写明原因，不留空白 |

仅留入口并标注 `Coming later`：Wiki、引用建议、独立回查、个人库管理（删除/回收站/版本）、模型与服务设置。

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
- 侧边栏（参照 Codex / Claude Desktop）：New topic 与 Coming later 入口在 Topics 之上；点击 Topic 只展开/折叠其 Session 列表，不跳转；悬停 Topic 右侧 `+` 新建 Session 并进入 Read & ask（已有空 Session 时复用）；Topics 超过 5 个、单个 Topic 的 Session 超过 4 个时折叠，保留 Show more。标签顺序固定为 Discover / Read & ask / Compare。
- Topic 与 Session 支持悬停或键盘聚焦显示删除图标；删除 Topic 同时移除其 Session，所有入口同步更新，刷新恢复示例数据。只有 Evidence in scientific QA 提供研究任务回放；其余 Topic 与 Session 支持列表与删除操作。
- 滚动只用 `components/util.ts` 的 `scrollWithin`，不要用 `scrollIntoView`（会带动 `overflow: hidden` 的外层整体移位）。
