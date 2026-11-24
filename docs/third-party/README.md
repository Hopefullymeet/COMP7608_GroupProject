# Agent 源码与课程交付范围

PaperTrace 桌面端由 Tauri 启动 Python 工作进程。任务调度在 `backend/papertrace.py`，模型调用在 `backend/model_agent.py`，论文检索和段落读取在 `backend/research_tools.py`。发布包所带的后端文件由 `frontend/src-tauri/src/worker.rs` 列出，模型服务及凭据由 PaperTrace 的设置管理。

早期开发导入过 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的完整源码，用于集成和研究。导入版本为 `dsh-v0.2.2-rc.5`，上游提交为 `9c2670d3bce5275e0d1610272958121af87787bb`，版权与许可见[原始 MIT 许可证](deepseek-harness-LICENSE)。本仓库提交 `965020dd15` 记录原始导入，提交 `07ac8e84c4181a99dc48f2aa962cc424d47598dd` 的 `backend/engine` 保留最后一次归档前的源码、改动及第三方声明。当前应用从该版本构建精简的内置核心。

课程报告可分别说明早期框架参考、团队实现的论文取证与引用定位、Wiki 整理及桌面阅读工作流。引用或展示历史快照中的具体实现时，应标明原作者、版本和团队的改动。

核心入口为 `backend/engine/host.mjs`，通过标准输入输出与 Python 通信。随安装包交付的 `core.mjs` 包含原版 AgentLoop、会话、工具执行和待办插件。计划与当前研究任务绑定。论文工具和模型凭据仍由 Python 管理。发布包内置 Node，源码开发使用 Node 22.22 或 24。

重建核心时，从上述归档提交取出 `backend/engine`，依照同一提交的桌面工作流编译并部署到暂存目录。将 `NODE_PATH` 指向该目录的 node_modules，`ESBUILD` 指向 esbuild 0.21.5，再执行 `sh backend/engine/build.sh`。各依赖许可随核心存放在 `backend/engine/NOTICES.txt`。

以下行为由 PaperTrace 保留在 `backend/model_agent.py`：

- `packages/core/agent-loop/src/agent.ts` 的步骤完成边界。达到输出上限的工具调用不会执行，阅读任务可用已读原文完成回答。
- `packages/guard/repeat-tool-reminder/src/index.ts` 的连续调用计数。工具名及规范化参数相同，达到第 3、5、8 次时，下一步收到针对论文检索的提示。
- `packages/llm/llm-retry/src/index.ts` 的可取消退避与按步骤重试。PaperTrace 将暂时性失败限制为最多两次重试，已展示正文时停止自动重试。

工具授权、段落读取、逐字引文校验和 Wiki 归档继续由 PaperTrace 负责。桌面端随内嵌工作进程写出 `Agent-LICENSE.txt`，完整第三方声明也保存在上述历史快照中。
