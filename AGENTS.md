# AGENTS.md

## 项目与协作

PaperTrace 是 COMP7608B Group 52 的端到端 Agentic AI 项目。开发前先查[课程要求](docs/COMP7608B_LLM_Project_Guideline.pdf)，设计说明见 [docs/](docs/)，Proposal 等交付物见 [docs/deliverables/](docs/deliverables/)。

- 优先完成当前任务，避免空目录、重复文档和未使用的依赖。
- 前端、后端与 Agent 联调以[接口契约](docs/contracts/README.md)为准。修改契约时遵循[编写规则](docs/contracts/AGENTS.md)。
- 修改后在 [PROGRESS.md](PROGRESS.md) 记录影响团队的状态变化和下一步。

## 客户端开发

正式前端和视觉原型各自维护源码和依赖，均使用 Node.js 24、pnpm 12、React、TypeScript 和 Vite。从仓库根目录执行对应的安装命令。默认镜像无法访问时，追加 `--registry=https://registry.npmjs.org/`。

| 目录 | 安装 | 浏览器启动 |
| --- | --- | --- |
| `frontend/` 正式客户端 | `pnpm --dir frontend install --frozen-lockfile` | `pnpm --dir frontend dev`，打开 [契约样例](http://localhost:5174/?mode=contract) |
| `prototype/` 视觉原型 | `pnpm --dir prototype install --frozen-lockfile` | `pnpm --dir prototype dev`，打开 [脚本回放](http://localhost:5173/?speed=4) |

Windows 桌面开发用 `pnpm --dir frontend desktop`，环境与 EXE 打包见[前端 README](frontend/README.md)。视觉原型用本地脚本演示，`?speed=4` 可加快回放。

## 验证

- 改正式前端时，运行 `pnpm --dir frontend build` 和 `pnpm --dir frontend test`，并按[前端走查样例](frontend/README.md#走查样例)复查受影响的流程。桌面相关改动用 Windows 客户端验证。
- 改视觉原型时，运行 `pnpm --dir prototype build`，按[原型范围](prototype/AGENTS.md#范围)走查。主线覆盖侧边栏新建会话、检索加入 PubMedQA、排除后细化、两轮问答、点击引用查看证据和论文比较。
- 界面走查检查浏览器控制台。涉及工作区时，覆盖 Library 回收与重复导入复核、Wiki 草稿采纳、Citation check 改稿后重查，以及 Models & services 的模型切换、连接测试与开关。
