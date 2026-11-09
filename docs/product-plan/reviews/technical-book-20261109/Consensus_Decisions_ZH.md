# 技术书三方输入与主线取舍

2026-11-09｜记录 Codex、Claude 桌面端与 DSH 的输入、对齐结果和未决事项；只记录取舍，不改技术书正文。

## 三方输入

| 来源 | 材料 | 用途 |
|---|---|---|
| Codex（主审） | `docs/source/PaperTrace_Technical_Book_ZH.md` 初稿、`Primary_Evidence_ZH.md` | 架构、模块职责、开发方向与官方依据表 |
| Claude 桌面端 | `Claude_Technical_Packet.md`（评审请求与产品 v1.5 全文包） | 整体架构取舍与开发可执行性意见 |
| DSH | `DSH_Technical_Research_ZH.md`（调研）、`Technical_Final_Check_ZH.md`（终检） | 技术路线与关键难点、分发/坐标/恢复/许可的实际限制 |

Claude 的对齐结论由主审转述在 `DSH_Final_Check_Task.txt` 中，本目录未保留 Claude 独立评审文件；引用时应以该转述为限，不据此声称已收到完整第二份报告。

## 已对齐的主线

| 决策 | 结论 | 依据 |
|---|---|---|
| 桌面壳 | React + TypeScript + Tauri 2，Rust 薄宿主，Electron 为替代 | Codex 初稿；DSH 调研的系统 WebView 风险与切换条件 |
| 进程与协议 | Python 领域服务唯一写入者；stdio NDJSON JSON-RPC 2.0；FastAPI 仅用于 HTTP 路线 | 主审与 Claude 对齐；DSH 强调不得把 stdio 与 SSE 混用 |
| Agent 控制 | 自有显式 Python 任务循环 + 操作账本为主，LangGraph 为替代试验 | 主审与 Claude 对齐；DSH 指出现有框架检查点不替代副作用幂等 |
| 向量检索 | NumPy 精确余弦为基线，sqlite-vec 试验通过后切换 | 主审与 Claude 对齐；sqlite-vec 文档仍标 0.1.x alpha |
| 解析 | PDF.js 为阅读与坐标基准，GROBID 提供学术结构与引用，Docling 补复杂版面与 OCR | Codex 初稿；DSH 调研与终检（镜像能力须实测） |
| 桌面测试 | WDIO embedded provider 覆盖 macOS；直接 tauri-driver 仅 Windows/Linux | Tauri 官方文档，DSH 核查 |

## 未决事项

- GROBID 采用本机容器、随包服务还是远端解析，取决于分发与解析试验。
- PyInstaller one-folder 与随包解释器方案的最终选择，取决于三平台打包与签名结果。
- Claude 是否有与上述结论不同的独立意见，需要拿到其完整回复后再核对。

## 边界

技术书与本书的取舍均为拟议方案；没有运行原型、安装包、解析或模型调用，收益与体积数字未实测。

## 追记：现成 harness 路线（2026-11-09）

用户提出把 Agent 控制交给 DSH、Codex CLI、OpenHands SDK 这类成熟 harness。技术书已新增 8.4 作为与既有主线并列的替代路线，主线（自有循环为主、LangGraph 替代）本轮不变，待讨论后决定是否调整。

- DSH：`deepseek-ai/deepseek-harness` 为公开 MIT 仓库，TypeScript，2026-08-13 创建，默认分支 master（GitHub API 2026-11-09 核查）；本机桌面为 0.13.2。
- Codex CLI：Apache-2.0（仓库 LICENSE 核查）。
- OpenHands Agent SDK：MIT（仓库 LICENSE 核查）。
- 以上许可与版本为公开材料核查结果，未在 PaperTrace 中接入验证。

