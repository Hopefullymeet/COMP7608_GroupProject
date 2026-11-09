# PaperTrace 技术路线与关键难点研究

2026-11-09｜依据项目书 v1.5 与工作区设计 v1.5｜只写技术调研，不改产品稿、技术书或环境。

## 0. 结论先行

推荐主线：**React + TypeScript + Tauri 2；Rust 只做薄宿主；Python 工作进程承载领域逻辑并成为 SQLite 唯一写入者；Rust 与 Python 用 stdin/stdout 上的逐行 JSON-RPC 通信；PDF.js 作为阅读与坐标基准，GROBID 作为学术结构与参考文献解析器，Docling 作为复杂版式、表格和 OCR 的补充；SQLite 负责元数据、FTS5 和向量；Agent 控制先用自己的持久状态机，不先引入 LangGraph。**

这条主线不是“官方推荐”，而是本项目在 v1.5 产品约束下的选择。下面把已查到的事实、项目选择和未验证项分开。

## 1. 完整技术架构

### 1.1 分层

```text
React/TypeScript + PDF.js + 笔记/比较/回查界面
        ⇅ Tauri commands / events
Rust 薄宿主：窗口、文件对话框、权限、更新、进程监督、协议桥
        ⇅ stdin/stdout NDJSON JSON-RPC 2.0
Python 工作进程：发现、导入、解析、检索、Agent、证据、导出
        ⇅
SQLite（唯一写入者）+ 内容寻址文件 + 解析缓存
        ⇅
OpenAlex / Crossref / arXiv / 可选 Semantic Scholar
LLM / 嵌入服务 / 可选外部 Agent
可选本地解析包：GROBID（学术结构）+ Docling（复杂版式/OCR）
```

产品对象按 v1.5 第 6.2 节落地：`Library`、`Topic`、`SearchRun`、`TopicPaper`、`PublicationRecord`、`Session`、`Paper`、`SourceVersion`、`ParseRun`、`Anchor`、`Claim`、`Assessment`、`CoverageResult`、`Dependency`、`Artifact`。技术实现不应把这些压成一张“论文表”。

### 1.2 进程与协议

Rust 宿主只负责 Tauri 生命周期、文件选择、权限弹窗、更新、崩溃重启和消息转发；不解析 PDF、不调用模型、不直接写 SQLite。Python 工作进程是唯一领域进程，负责所有工具调用、解析、检索、判断和保存。

主推 **stdin/stdout 上的 NDJSON JSON-RPC 2.0**：一行一个 JSON 对象，带 `id`、`method`、`params`；Python 用通知发进度、日志和事件；取消用独立通知；stdout 只放协议，日志走 stderr。大文件传路径或内容哈希，不传 base64。Rust 收到事件后用 Tauri `emit` 转给 WebView。

**FastAPI 只在确实采用 HTTP 服务时使用。** 如果 Python 变成 localhost HTTP 服务，才用 FastAPI + SSE/WebSocket，并绑定随机回环端口、加会话 token、校验 Origin；这时 SSE 是 HTTP 流，不是 stdio。不要把 stdio JSON-RPC 叫 SSE，也不要在同一条链上混两种协议。

### 1.3 数据与证据

- 文件按内容哈希存 `sources/`；数据库只存路径、哈希、大小和版本关系。`SourceVersion` 是不可变版本；换文件建新版本，不覆盖旧文件。
- `ParseRun` 保存解析器、版本、配置、输出哈希和耗时；同一文件重解析产生新记录，旧记录保留。
- `Anchor` 同时保存引句、前后文、页码、页框、旋转和归一化坐标；引文用于重定位，坐标只用于显示。
- `Claim` 保留父句、跨度、量词、条件和拆分状态；`Assessment` 按“论述 × 来源版本 × 条件”保存；`CoverageResult` 按子论述计数；`Dependency` 记录判断使用了哪些来源版本。
- 引用回查先做引文存在性校验，再单独做语义判断。逐字命中只能证明“这段话在原文里”，不能证明“原文支持这个论述”。
- 重解析时，引文唯一匹配才更新锚点；多匹配或无匹配进入待选择/待补看，旧锚点和旧判断保留，相关下游标 `stale`。不能静默复用旧判断。

### 1.4 文档链

原 PDF 是核对依据；PDF.js 渲染页面并提供文本层。GROBID 解析标题、作者、摘要、章节、参考文献和引用上下文，返回 TEI 与结构坐标。Docling 在 GROBID 失败、表格/公式复杂或扫描页时补充版式、表格、图片和 OCR；Docling 的 `DoclingDocument` 带版面框和 provenance，适合做补充证据，不替代 GROBID 的书目/参考文献角色。

处理阶梯：

1. PDF.js 读取页面、旋转、CropBox/MediaBox 和文本层；先判断是否可提取文本。
2. GROBID `processFulltextDocument` 请求 `teiCoordinates`（`p`、`s`、`ref`、`biblStruct`、`head` 等），需要句级切分时开 `segmentSentences`，需要引用上下文时保留 `ref` 的 `coords`。
3. 结构化结果质量不足、表格/公式复杂或文本层损坏时，用 Docling 补充；扫描页才启用 OCR。
4. 所有结果写回统一 `ParseRun` + `Anchor`，不把 GROBID TEI 或 Docling JSON 直接当产品数据模型。

### 1.5 外部服务

文献发现主用 OpenAlex：无需 key 可做基本查询，免费 key 提高每日预算 10 倍（免费账户约 1 美元/天），响应带 `meta.cost_usd`，重度使用按量计费；数据 CC0。Crossref 用于 DOI/出版元数据核对，走 polite pool（`mailto`），免费但有限流。arXiv 用于预印本全文与版本，官方要求连续调用间隔约 3 秒，同一查询每天缓存即可。Semantic Scholar 作为可选引用图/推荐补充，不把它的摘要当全文证据。Google Scholar 没有公开 API，不做抓取。

## 2. 已查到的事实与来源

| 主题 | 官方来源 | 本轮确认的事实 |
|---|---|---|
| Tauri 进程 | [Tauri process model](https://v2.tauri.app/concept/process-model/) | 使用系统 WebView（Windows WebView2、macOS WKWebView、Linux WebKitGTK），不把 WebView 打进安装包；平台差异要自己处理 |
| Tauri sidecar | [Embedding external binaries](https://v2.tauri.app/develop/sidecar/) | 可嵌 Python CLI/PyInstaller 产物；每个目标架构要 `-$TARGET_TRIPLE` 后缀；stdin/stdout 可通信 |
| Tauri 资源 | [Embedding additional files](https://v2.tauri.app/develop/resources/) | 可把大目录作为 `resources` 随包；路径在运行时解析 |
| Electron | [Process model](https://www.electronjs.org/docs/latest/tutorial/process-model) | main/renderer 多进程；自带 Chromium/Node，运行时一致但体积与权限面更大 |
| PyInstaller | [Operating mode](https://pyinstaller.org/en/stable/operating-mode.html)、[License](https://pyinstaller.org/en/stable/license.html) | 输出与构建 OS/Python 版本绑定，不能交叉编译；onefile 会解包到临时目录；商业打包有 GPL 例外 |
| Python 分发 | [python-build-standalone](https://github.com/astral-sh/python-build-standalone) | 可移植 CPython 3.11–3.16，覆盖 Linux/macOS/Windows，可放任意路径 |
| SQLite WAL | [WAL](https://www.sqlite.org/wal.html) | 读写可并发，但只有一个写事务；WAL 不能放网络文件系统；3.51.3 修复 WAL-reset 问题 |
| SQLite 事务 | [Transactions](https://www.sqlite.org/lang_transaction.html) | 多读单写；读升级写可能 `SQLITE_BUSY`，要 `BEGIN IMMEDIATE`/重试 |
| FTS5 | [FTS5](https://www.sqlite.org/fts5.html) | 有 bm25/snippet；trigram 支持子串，但少于 3 个 Unicode 字符不匹配 |
| sqlite-vec | [README](https://github.com/asg017/sqlite-vec) | 纯 C、`vec0` 虚拟表、可跨平台；文档首页为 0.1.x alpha/pre-v1，明示可能 breaking change，不视为免验证稳定库 |
| PDF.js | [Examples](https://mozilla.github.io/pdf.js/examples/)、[API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html) | viewport 以 72 DPI 为基准，初始变换把 PDF 左下原点转成 canvas 左上原点；`getTextContent` 提供文本项；Apache-2.0 |
| GROBID 坐标 | [PDF coordinates](https://grobid.readthedocs.io/en/latest/Coordinates-in-PDF/) | 坐标从左上起算、PDF 单位、页码从 1 开始；使用 CropBox，CropBox≠MediaBox 会偏移；`teiCoordinates` 可取结构坐标 |
| GROBID 体积 | [Docker](https://grobid.readthedocs.io/en/latest/Grobid-docker/) | full 镜像约 8GB，CRF-only 约 500MB；full 默认带 DL 模型；构建需 JDK 21 |
| Docling | [Technical report](https://arxiv.org/abs/2408.09869)、[Document](https://docling-project.github.io/docling/concepts/docling_document/) | MIT；layout/TableFormer；`DoclingDocument` 带版面框与 provenance；OCR/VLM 可选 |
| LangGraph | [Checkpointers](https://docs.langchain.com/oss/python/langgraph/checkpointers.md)、[Durable execution](https://docs.langchain.com/oss/python/langgraph/durable-execution) | 每个 super-step 存检查点；中断可恢复；恢复从节点起点重放，副作用要幂等/放 task |
| OpenAlex | [API](https://help.openalex.org/api/)、[Authentication](https://help.openalex.org/api/authentication/) | 基本查询免 key；免费 key 每日预算 ×10（约 $1/天）；`meta.cost_usd`；重度按量 |
| Crossref | [REST API etiquette](https://github.com/CrossRef/rest-api-doc#etiquette) | 免费；带 `mailto` 进 polite pool；限流通过响应头公布 |
| arXiv | [API manual](https://info.arxiv.org/help/api/user-manual.html) | 连续调用建议间隔 3 秒；同一查询每天缓存；单次最多 30000 条，建议缩小查询 |
| 引用格式 | [CSL 1.0.2](https://docs.citationstyles.org/en/stable/specification.html)、[citeproc-js](https://github.com/Juris-M/citeproc-js) | CSL 负责引文/书目呈现；citeproc-js 通过 1300+ 测试、被 Zotero/Mendeley 使用，但许可为 CPAL/AGPL 双许可 |
| 桌面测试 | [Tauri WebDriver](https://v2.tauri.app/develop/tests/webdriver/) | 2026-06 文档推荐 `@wdio/tauri-service` embedded provider，覆盖 Windows/Linux/macOS；直接 `tauri-driver` 才只支持 Windows/Linux |
| 标注锚点 | [W3C Annotation](https://www.w3.org/TR/annotation-model/#text-quote-selector) | TextQuoteSelector 用 exact/prefix/suffix 重定位，适合重解析后的引文锚定 |

## 3. 关键决策

| 决策 | 推荐 | 理由 | 切换条件 |
|---|---|---|---|
| 桌面壳 | Tauri 2 | 系统 WebView 不进包，Rust 宿主可做权限与进程监督；团队已有 React/TS | PDF.js 在 WKWebView/WebView2/WebKitGTK 的文本选择、字体、滚动或坐标误差不可接受，或必须用 Node 原生模块 → Electron |
| Python 分发 | python-build-standalone + 锁定 venv，作为 Tauri `resources`；Rust `Command` 启动 `python -m worker` | 避免 onefile 解包和 PyInstaller 交叉编译；更新解释器/依赖更直接 | 必须单文件/隐藏源码 → PyInstaller onedir；再不行才 onefile |
| IPC | stdio NDJSON JSON-RPC 2.0 | 无端口、无 CORS、无防火墙；Rust 可监督/重启；适合本地单用户 | 需要多客户端/远程调试 → FastAPI + SSE/WebSocket（仅 HTTP 方案） |
| Agent 控制 | 自有持久状态机 + 操作账本 | 状态、预算、幂等、恢复可审计；不把 SQLite 写入权交给框架 | 分支/并行/人工中断复杂到自研成本明显高于收益 → LangGraph，且必须解决 writer 与副作用幂等 |
| 数据库 | SQLite 单写者 + WAL | 本地单用户足够；FTS5/向量同库；备份简单 | 多进程写或远程共享 → 不在当前产品范围 |
| 检索 | FTS5（英文 unicode61；中文预分词后入索引，trigram 作子串补充）+ sqlite-vec | 同库、少运维；先满足本地规模 | 向量 top-k 在目标语料上不达标 → 嵌入式 HNSW（FAISS/usearch），接口不变 |
| 学术解析 | PDF.js 视图 + GROBID 结构/参考文献 + Docling 复杂版式 | GROBID 的学术结构/坐标强；Docling 的版面/表格/OCR 强；PDF.js 是显示基准 | GROBID CRF 质量不足 → 可选 full DL/远程服务；Docling 失败 → 人工检查 |
| 文献源 | OpenAlex 主，Crossref + arXiv 辅，S2 可选 | 覆盖、成本、许可可核；arXiv 有全文/版本 | 某源限流/许可变化 → 适配器降级并显示来源 |
| 引用格式 | 内部 CSL-JSON；BibTeX/LaTeX/Word 往返 | CSL 是通用交换格式；判断与排版分离 | citeproc 许可不接受 → 换 permissive 处理器或只做 CSL-JSON 交换 |

## 4. 实际限制与独立质疑

### 4.1 跨平台 Python 分发是最大工程风险

PyInstaller 的输出绑定构建 OS 和 Python 版本，不能在一台机器上交叉编译三平台；Tauri sidecar 的 `externalBin` 也要求每个目标架构有对应 `-$TARGET_TRIPLE` 二进制。Tauri 只减小宿主体积，Python 解释器、Docling/GROBID 模型和依赖仍会主导安装包。**不要把“Tauri 安装包小”当成整体结论。** 主推 `python-build-standalone` + venv 作为资源，按 macOS arm64/x64、Windows x64、Linux x64 分别构建；Tauri sidecar 仍是可行替代，适合单文件/小启动器，不适合承载大模型目录。每个平台的 Python 二进制、原生 wheel、GROBID/Docling 资源都要单独签名/验收。macOS 需要 Apple Developer 账号并公证；Windows 需要代码签名，否则 SmartScreen 会拦。嵌套 Python 二进制是否被 Tauri 自动签名，必须在打包试验中验证；不通过就加显式 `codesign`/签名步骤。

### 4.2 OCR 与模型体积不能默认全带

GROBID full 镜像约 8GB，CRF-only 约 500MB，且构建需要 JDK 21；Docling 的 layout/TableFormer 和 OCR/VLM 另加模型。**主推：默认不启用 OCR/VLM；GROBID 作为可选“学术解析包”，优先 CRF-only；Docling 作为按需补充。** 扫描 PDF 首次导入时标记“需 OCR”，由用户选择下载 OCR 包或使用已配置的远端服务；不要静默把整本 PDF 上传。安装包大小、冷启动、内存峰值必须实测后再定，不在技术书里承诺数字。

### 4.3 学术坐标与 PDF 视图坐标必须统一合同

GROBID 坐标是 PDF 单位、左上原点、基于 CropBox，页码从 1 开始；PDF.js viewport 把 PDF 用户空间（左下原点）变换到 canvas 左上原点。两者不能直接相加。建议存“未旋转 CropBox 内的归一化 bbox + 页码 + 旋转 + 页面尺寸”，渲染时用 PDF.js `page.view`/`viewport` 转换；若使用绝对坐标，先把 GROBID 的 top-left 转成 PDF 用户空间：`y_user = crop_y + crop_h - (y_top + h)`，再 `viewport.convertToViewportPoint`。必须测试 CropBox≠MediaBox、旋转页、双栏、扫描页和缩放；否则高亮会整体偏移。

### 4.4 预算与幂等恢复不能只靠 LangGraph

LangGraph 的检查点在 super-step 边界，恢复会从节点起点重放；官方明确要求副作用幂等或放进 task。它不能替代本项目的操作账本。建议自建 `run`/`step`/`operation`：每个外部副作用先写 `pending`（唯一 `idempotency_key`），成功后写 `committed`；进程崩溃后把 `running` 标为 `interrupted`，按账本对账，不重复调用、不重复入库。预算按调用/token/金额/时长预扣，结算后写实际用量；等待用户不计运行时长。状态机转移用 `BEGIN IMMEDIATE` 单事务提交。

### 4.5 SQLite 单写者要写成硬约束

WAL 允许读写并发，但只有一个写事务；读升级写可能 `SQLITE_BUSY`。主推 Python 内一个专用 writer 线程/连接，Rust 不打开数据库，不启用 Tauri SQL 插件；FTS5 和 sqlite-vec 的写入也走同一 writer。设置 `busy_timeout`、短事务、`BEGIN IMMEDIATE`；读连接用 WAL 快照。SQLite 版本要至少 3.51.3（WAL-reset 修复），Python 标准库可能带旧版，启动时检查 `sqlite3.sqlite_version`，不满足就随包带固定版本。sqlite-vec 仍处 0.1.x alpha/pre-v1，必须锁定版本并做升级回归，不能当作稳定基础设施。FTS5 中文主推预分词后写入索引；trigram 只作子串补充，且少于 3 个字符的查询不匹配，2 字中文词要走预分词或 LIKE 回退，必须用真实中文查询测。

### 4.6 文献服务授权与费用要按用户配置

OpenAlex 免 key 只适合基本查询；免费 key 每日预算约 $1，重度使用要付费，响应有 `meta.cost_usd`。Crossref 免费但要求 polite pool 和 `mailto`；arXiv 要求约 3 秒间隔并缓存每日结果；Semantic Scholar 要 API key。主推用户自带 key、存 OS keychain；应用不内置共享 key；任务前显示目的地、预计/实际用量；429/401/配额错误分别处理。不要抓 Google Scholar，也不要把“搜到摘要”当全文证据。

### 4.7 引用处理依赖有许可和格式边界

CSL-JSON 适合做内部交换；BibTeX 导入/导出、LaTeX 补丁、Word 修订副本分别处理。**citeproc-js 是 CPAL/AGPL 双许可**，虽然通过 1300+ 测试并被 Zotero/Mendeley 使用，闭源分发前必须做许可判断；不能默认“开源库就能随便随包”。Word 的域、插件字段和交叉引用不能承诺完全无损；不能安全写回时只给位置报告或修订副本。BibTeX 没有单一权威规范，LaTeX 转义、宏、`crossref` 和编码要用固定 fixtures 验证。

### 4.8 测试不能只测 Web 前端

Tauri 官方现在推荐 `@wdio/tauri-service` embedded provider，覆盖 Windows/Linux/macOS；直接 `tauri-driver` 才限 Windows/Linux。仍要把 React 组件测试、Python 单测、桌面 E2E 和真实 PDF 回归分开。PDF.js 在三种系统 WebView 上的表现必须单独测；这是选择 Tauri 的主要风险，也是 Electron 的切换条件。

## 5. 按技术依赖划分开发方向

1. **合同与存储（先做）**：SQLite schema、`SourceVersion/ParseRun/Anchor/Claim/Assessment/CoverageResult/Dependency`、`run/step/operation`、IPC 消息、错误码、备份格式。没有这些，后面所有模块都会改接口。
2. **桌面宿主与分发**：Tauri 窗口/权限/更新、Python 资源布局、Rust 进程监督、JSON-RPC 桥、三平台构建与签名。依赖 1 的协议。
3. **文档与坐标**：PDF.js 阅读器、GROBID/Docling 适配、页面框/旋转/CropBox 转换、锚点重定位、失败分级。依赖 1、2。
4. **发现与检索**：OpenAlex/Crossref/arXiv 适配、候选合并、PublicationRecord、FTS5/向量索引、限流与缓存。依赖 1、3。
5. **Agent 与回查**：状态机、工具契约、预算、幂等、证据判断、父句覆盖、人工审阅、来源失效传播。依赖 1、3、4。
6. **稿件与交付**：Markdown/LaTeX/Word 解析与补丁、CSL-JSON/BibTeX、报告/备份/恢复、评估集。依赖 1、5。

## 6. 验证试验

1. **PDF 视图矩阵**：macOS WKWebView、Windows WebView2、Linux WebKitGTK，各 20 篇含旋转/CropBox/双栏/扫描页的 PDF；检查文本选择、跳转、高亮与 GROBID bbox 对齐。目标：100% 缩放时高亮偏差不超过 2 CSS px；失败则评估 Electron。
2. **解析质量对照**：30 篇论文分别跑 GROBID CRF、GROBID full、Docling；核对标题/作者/参考文献/章节/表格/公式与坐标。记录字段准确率、锚点唯一率、失败类型；决定 GROBID 包是否可选、Docling 何时触发。
3. **打包与签名**：三平台干净虚拟机安装、启动、导入、解析、导出；记录安装包体积、冷启动、内存；验证 macOS 公证、Windows 签名、嵌套 Python 二进制签名。若 GROBID/OCR 使包体或启动不可接受，改为首次下载的可选包。
4. **SQLite 与恢复**：5 万 chunk、8 个读线程 + 1 个 writer；在 5 个事务点 `SIGKILL`；验证无重复 operation、能从最后 committed step 恢复、`busy_timeout` 行为、备份可恢复。
5. **Agent 预算与幂等**：注入 429/超时/取消/重复回调；验证预扣/结算、部分结果、晚到结果不写入、重跑不重复入库。
6. **检索与引用往返**：英文/中文查询（含 2 字词）、FTS5/向量 top-k、引用 Markdown/LaTeX/Word + BibTeX/CSL 往返；记录召回、延迟、字段丢失和必须人工处理的项。

## 7. 建议分工

- **技术负责人/合同 owner**：对象 schema、IPC 协议、坐标合同、错误码；只有一个人能改这些合同。
- **桌面与分发**：Tauri/Rust、Python 资源、三平台构建、签名/公证、更新与崩溃监督。
- **Python 平台**：SQLite 单写者、状态机、预算/幂等、模型与文献适配器、备份恢复。
- **文档与证据**：PDF.js 阅读器、GROBID/Docling、锚点重定位、证据对象与失效传播。
- **引用与评估**：CSL/BibTeX/LaTeX/Word、引用回查、人工标注与回归集。
- **QA/跨平台**：PDF 视图矩阵、安装包、崩溃恢复、权限与费用场景。

## 8. 未验证与保留意见

本轮没有安装 Tauri/Electron、没有打包 Python、没有运行 GROBID/Docling/PDF.js，也没有实测安装包大小、冷启动、解析准确率、SQLite 并发或模型费用。上面给出的是官方事实、项目选择和验证方法，不是已实现结果。

保留三点：第一，Tauri 的系统 WebView 差异是真实风险，PDF.js 三平台测试不过就应换 Electron；第二，GROBID full 约 8GB、CRF-only 约 500MB，加上 Docling/OCR 后“本地全离线”的包体和内存必须实测，不能先承诺；第三，LangGraph 适合复杂分支和人工中断，但它的检查点不替你做副作用幂等，当前产品的主线仍是自有状态机 + 操作账本。把这三项验证完，再决定是否引入 Electron、LangGraph 或 HTTP/FastAPI。
