# 当前进度

更新于 2026-11-20。Proposal 已提交，项目书、技术书和视觉原型已完成。

## 已完成

- [前端](frontend/README.md)可独立构建和打包。浏览器与 Windows 便携版已走通内置样例，前端回归测试通过。
- [接口契约](docs/contracts/README.md)和 Tauri 前端适配已就绪，可开始与宿主联调。
- [本地宿主联调](backend/README.md)已接通 Tauri 命令、Python JSON-RPC 与 SQLite。PubMedQA 样例支持入库、问答、证据定位、订阅补收和重启读回。

## 下一步

- 接入真实检索、PaperTrace 版 DSH 和 PDF 导入，再用真实材料验证证据定位、稿件读写、授权撤销和备份恢复。[技术交接包](docs/deliverables/PaperTrace_Handoff_20261109/)
