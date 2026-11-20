# PaperTrace 本地宿主联调

本阶段用协议中的 PubMedQA 固定样例验证前端、Tauri、Python 与 SQLite。检索和问答使用本地样例文本，任务与证据数据由 Python 实际保存。运行仅需 Python 3.9 或更新版本，无 Python 第三方依赖。

从仓库根目录启动桌面 RPC 模式。先按[前端说明](../frontend/README.md)准备 Node、pnpm 和 Tauri 工具链。

```sh
VITE_PAPERTRACE_TRANSPORT=rpc pnpm --dir frontend desktop
```

Windows PowerShell：

```powershell
$env:VITE_PAPERTRACE_TRANSPORT='rpc'
pnpm --dir frontend desktop
```

Tauri 从首次 RPC 开始启动 Python。默认将联调数据放在应用本地数据目录的 `local-contract` 子目录。可通过 `PAPERTRACE_WORKSPACE` 为联调指定独立目录，或通过 `PAPERTRACE_PYTHON` 指定解释器。浏览器契约样例继续使用原来的前端模拟实现。

在首页输入研究问题（例如 `Which scientific QA datasets use paper abstracts?`）。提交后点 **Find papers**，确认范围并启动，选择 PubMedQA 加入主题。进入 **Read & ask**，询问 `What context does PubMedQA use?`，再点回答中的来源。退出并用同一工作区重开，核对主题、文献和历史回答。

在根目录执行契约测试：

```sh
python3 -B -m unittest discover -s backend -v
pnpm --dir frontend test
```

后端测试运行独立的 Python 子进程，验证写入幂等与冲突、任务确认绑定、订阅与游标补收、主题边界内的证据定位、重启恢复和取消竞争。下一步用同一协议换接真实搜索和 PaperTrace 版 DSH。PDF 导入、全文定位和其余工作区接口随对应业务批次接入。
