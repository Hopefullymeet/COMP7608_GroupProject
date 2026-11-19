# AGENTS.md

## 项目概述

本目录是COMP7608B Large Language Model课程Group 52项目仓库，此项目是一个可运行的端到端 Agentic AI。

- 最小可用优先：只解决当前任务，不创建空目录、重复文档或未使用的框架与依赖。
- 项目要求先查 `docs/COMP7608B_LLM_Project_Guideline.pdf`。
- 项目要求与设计说明在 `docs/`，Proposal PDF等交付物在 `docs/deliverables/`。
- 视觉原型在 `prototype/`，范围、边界与约束见 `prototype/AGENTS.md`。
- 发生修改后更新维护 `PROGRESS.md` 的当前状态、已完成与下一步，不冗余、保证最小可用行。

## 工作环境与执行

- 视觉原型 `prototype/`：Node 24 + pnpm 12（React + TypeScript + Vite）。
- `pnpm --dir prototype install`；若默认镜像不可达，加 `--registry=https://registry.npmjs.org/`。
- `pnpm --dir prototype dev` 启动于 http://localhost:5173 ；URL 加 `?speed=4` 加快脚本回放。

## 验证方式

- `pnpm --dir prototype build`（含 `tsc --noEmit` 类型检查）必须通过。
- 浏览器内走完主线：侧边栏展开 Topic、悬停 `+` 新建 Session；Home → Discover（加入 PubMedQA、排除后 Refine）→ Read & ask（两个建议问题、点引用看证据卡）→ Compare；控制台无错误。
- 工作区页面：Library（删除 → 回收站 → 恢复、重复导入复核）；Evidence wiki（生成草稿 → 差异预览 → 接受）；Citation check（运行回查 → 采纳改写或补引用 → 重查变为 Supported）；Models & services（切换模型、测试连接、开关）。
