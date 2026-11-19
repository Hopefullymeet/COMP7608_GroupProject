# 当前进度

更新：2026-11-19。项目进入正式开发阶段。

## 已完成

- 已补充工作区任务历史、步骤和用量的共用读接口。
- 已定义[服务、只读授权、持续检索与备份契约](docs/contracts/services-workspace.md)。桌面接口索引已补齐。
- 已定义[稿件、独立回查与成果导出接口](docs/contracts/citation-export.md)。
- 已定义[比较与 Wiki 接口](docs/contracts/comparison-wiki.md)，覆盖修订和逐项采纳。
- 已定义[资料库、归档、全文与笔记接口](docs/contracts/library-reading.md)。

- 已提交 Group 52 Proposal，完成 [MVP 设计草案](docs/PaperTrace_MVP_Design.md)及[项目书、技术书与设计交接包](docs/deliverables/PaperTrace_Handoff_20261109/)。
- 视觉原型（`visual-prototype`）已通过评审，覆盖论文发现、阅读问答、证据定位、比较及工作区页面。演示使用示例数据，范围见[原型说明](prototype/AGENTS.md)。
- 已完成[共用协议](docs/contracts/protocol.md)和[发现 → 阅读 → 定位首版契约](docs/contracts/discover-read-locate.md)评审，包含授权、自动补搜、重连与摘要定位。

## 进行中

- `feat/discover-read-locate`：用科学问答数据集验证搜索源与模型，接通 Tauri 桌面端的真实摘要闭环。

## 下一步

- 按 PubMedQA 样例联调，再用真实服务走查自动补搜、摘要问答和重启读回。
- 后续必须实现全文查看与正文出处跳转，并验证会议来源后尝试加入会议筛选。
