# 当前进度

更新于 2026-11-20。Proposal 已提交，项目书、技术书和视觉原型已完成。

## 已完成

- [前端](frontend/README.md)可独立构建和打包。浏览器与 Windows 便携版已走通内置样例，前端回归测试通过。
- 正式客户端支持简体中文和英文，可通过侧栏底部的语言选择器即时切换并记住偏好。论文、稿件和研究结果继续使用原文。
- [接口契约](docs/contracts/README.md)和 Tauri 前端适配已就绪，可开始与宿主联调。
- [本地宿主联调](backend/README.md)已接通 Tauri 命令、Python JSON-RPC 与 SQLite。PubMedQA 样例支持入库、问答、证据定位、订阅补收和重启读回。
- [DSH 摘要问答](backend/README.md#启用真实-deepseek-harness-问答)已接入。真实 DeepSeek 测试走通授权、摘要工具调用、返回回答和出处定位。

- [主题文献综合](docs/contracts/literature-synthesis.md)接通 PDF 导入、原文定位、两篇比较、DSH 多论文提纲和 Wiki 审阅。六篇公开 PDF 导入及页级位置已核对。固定检索、Agent 补读和带 Wiki 的实验入口已具备。

- [离线引用与 PDF 稿件回查](docs/contracts/pdf-citations.md)接通主题内引用查询、书目映射、逐句检查及 Markdown / BibTeX 输出。六篇公开论文已验证入库与本地定位。

## 下一步

- 前端按[并行开发交接](docs/product-plan/Frontend_Handoff_ZH.md)推进页内证据高亮和阅读体验，联调基线已纳入上游中文界面。

- 配置 DeepSeek 运行三组质量对照并人工复核。继续接入外部论文发现、稿件读写、授权撤销和备份恢复。[技术交接包](docs/deliverables/PaperTrace_Handoff_20261109/)
