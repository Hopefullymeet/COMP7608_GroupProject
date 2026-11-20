# PaperTrace 本地宿主联调

桌面可用 PubMedQA 固定样例走通找论文和入库。设置 DSH 后，阅读问答会调用真实模型。任务、文献与证据由 Python 写入 SQLite。Python 需要 3.9 或更新版本，无第三方依赖。

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

## 启用真实 DeepSeek Harness 问答

使用已构建的 DSH `dsh-v0.2.2-rc.5` 源码（提交 `9c2670d`）。在上述启动流程前，将 `PAPERTRACE_DSH_CLI` 指向该副本中的 `apps/cli/lib/bin.js`，`PAPERTRACE_DSH_NODE` 指向 Node.js 24.9 或更新版本。通过启动进程的环境变量 `DEEPSEEK_API_KEY` 提供凭证，可用无回显的 shell 输入。把 Export 和启动放在同一个子 shell 内，退出后凭证不会留在父 shell：

```sh
(
  export PAPERTRACE_DSH_CLI="$PWD/../DSH-Source/apps/cli/lib/bin.js"
  export PAPERTRACE_DSH_NODE="$(command -v node)"
  printf 'DeepSeek API key: '
  read -rs DEEPSEEK_API_KEY
  printf '\n'
  export DEEPSEEK_API_KEY
  VITE_PAPERTRACE_TRANSPORT=rpc pnpm --dir frontend desktop
)
```

上例从当前前端工作树根目录启动，并假设项目目录内已有相邻的 DSH 源码副本、PATH 中已经使用 Node.js 24。调试应用也可以从带相同环境变量的终端启动。

DeepSeek 模型为 `deepseek-flash`。问答确认对话框显示官方端点及发送内容。DSH 每条阅读任务使用独立进程和临时目录，只注册 `paper_read`，仅能取回本轮授权的摘要片段。引用需要在本轮实际读过的段落中逐字找到，语义支撑仍由模型判断。取消只中断当前任务进程。凭证通过环境继承，不写入工作区。

在首页输入研究问题（例如 `Which scientific QA datasets use paper abstracts?`）。提交后点 **Find papers**，确认范围并启动，选择 PubMedQA 加入主题。进入 **Read & ask**，询问 `What context does PubMedQA use?`，再点回答中的来源。退出并用同一工作区重开，核对主题、文献和历史回答。

在根目录执行契约测试：

```sh
python3 -B -m unittest discover -s backend -v
pnpm --dir frontend test
```

后端测试运行独立的 Python 子进程，验证写入幂等与冲突、确认绑定、订阅与补收、证据定位、重启恢复、取消和无效引句过滤。默认测试使用本地模式，无需联网或凭证。下一批接真实文献搜索和 PDF 全文导入。
