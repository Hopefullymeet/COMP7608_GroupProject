# 当前进度

更新于 2026-11-20。Proposal 已提交，项目书、技术书和视觉原型已完成。

## 已完成

- [前端](frontend/README.md)可独立构建和打包。浏览器与 Windows 便携版已走通内置样例，前端回归测试通过。
- [接口契约](docs/contracts/README.md)和 Tauri 前端适配已就绪，可开始与宿主联调。
- [本地宿主联调](backend/README.md)已接通 Tauri 命令、Python JSON-RPC 与 SQLite。PubMedQA 样例支持入库、问答、证据定位、订阅补收和重启读回。
- [DSH 摘要问答](backend/README.md#启用真实-deepseek-harness-问答)已接入。真实 DeepSeek 测试走通授权、摘要工具调用、返回回答和出处定位。

## 下一步

- 接入真实检索和 PDF 导入，再用真实材料验证证据定位、稿件读写、授权撤销和备份恢复。[技术交接包](docs/deliverables/PaperTrace_Handoff_20261109/)
