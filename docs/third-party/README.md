# Agent 源码与课程交付范围

PaperTrace 桌面端由 Tauri 启动 Python 工作进程。任务调度在 `backend/papertrace.py`，模型调用在 `backend/model_agent.py`，论文检索和段落读取在 `backend/research_tools.py`。发布包所带的后端文件由 `frontend/src-tauri/src/worker.rs` 列出，模型服务及凭据由 PaperTrace 的设置管理。

早期开发导入过 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的完整源码，用于集成和研究。导入版本为 `dsh-v0.2.2-rc.5`，上游提交为 `9c2670d3bce5275e0d1610272958121af87787bb`，版权与许可见[原始 MIT 许可证](deepseek-harness-LICENSE)。本仓库提交 `965020dd15` 记录原始导入，提交 `07ac8e84c4181a99dc48f2aa962cc424d47598dd` 的 `backend/engine` 保留最后一次归档前的源码、改动及第三方声明。该快照已退出当前构建。

课程报告可分别说明早期框架参考、团队实现的论文取证与引用定位、Wiki 整理及桌面阅读工作流。引用或展示历史快照中的具体实现时，应标明原作者、版本和团队的改动。
