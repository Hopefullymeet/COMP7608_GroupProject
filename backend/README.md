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

DeepSeek 模型为 `deepseek-flash`。问答确认对话框显示官方端点及发送内容。DSH 每条任务使用独立进程和临时目录。摘要问答读取本轮确认的摘要。全文任务可以检索和补读本轮选定的论文。引用需要在本轮实际读过的段落中逐字找到，语义支撑仍由模型判断。取消只中断当前任务进程。凭证通过环境继承，不写入工作区。

在首页输入研究问题（例如 `Which scientific QA datasets use paper abstracts?`）。提交后点 **Find papers**，确认范围并启动，选择 PubMedQA 加入主题。进入 **Read & ask**，询问 `What context does PubMedQA use?`，再点回答中的来源。退出并用同一工作区重开，核对主题、文献和历史回答。

在根目录执行契约测试：

```sh
python3 -B -m unittest discover -s backend -v
pnpm --dir frontend test
```

后端测试运行独立的 Python 子进程，验证写入幂等与冲突、确认绑定、订阅与补收、证据定位、重启恢复、取消和无效引句过滤。默认测试使用本地模式，无需联网或凭证。

## 用一组论文搭提纲

安装 Poppler，确保 `pdftotext` 与 `pdftoppm` 可调用。启动桌面 RPC 模式并配置 DSH 后，创建主题，进入 **Synthesize**，拖入 PDF 或点 **Add PDFs**。可选择 2–12 篇论文；单个 PDF 上限 16 MB、150 页。当前从 PDF 提取已有文字，扫描版需要先做 OCR。

提出想写的研究问题并确认发送范围。生成后点击观点下的 **Source** 在右侧打开保存的 PDF 页。**Review for Wiki** 可逐项勾选采纳，证据仍可从 **Topic Wiki** 回到原文。某篇论文换版时，在该论文旁选择 **Add version**，Wiki 会提示复核依赖旧版的项目。

### 六篇公开论文的对照实验

从 `backend/evaluate_synthesis.py` 的 `PAPERS` 链接下载公开全文，保留相应的六个文件名。先用下列命令检查入库与人工标注的页级证据，再去掉 `--corpus-only` 启动三组模型对照。对照先要求审阅一组用于积累 Wiki 的种子结果。报告中的人工质量评分字段留空，供评估者根据列明的预期证据和误支持样例填写。

```sh
python3 -B backend/evaluate_synthesis.py /path/to/corpus --corpus-only
python3 -B backend/evaluate_synthesis.py /path/to/corpus --output synthesis-evaluation.json
```

可用 `PAPERTRACE_TEST_DSH_CLI` 指向已构建的 DSH，运行 `test_dsh_research.py` 中的本机回环测试。这个测试检查真实工具注册、模型接口传输、证据回读及 Wiki 复用，模型回复来自可复现的测试服务。

## 离线查引用与检查 PDF 稿件

在主题 **Synthesize** 的论文旁打开 **Paper references**，可在没有模型连接时查看双向引用和原页。已有论文在工作区开启后后台补建引用索引。

在 **Citation check** 导入 PDF 稿件，核对系统找到的参考文献对应关系，选择句子后启动回查。接受有原文依据的结果后可以保存进主题 Wiki 或导出为 Markdown 与 BibTeX。原 PDF 和历史判断按版本保留。可选 GROBID 及具体接口见[PDF 引用契约](../docs/contracts/pdf-citations.md)。

PaperTrace 配置为模型提供四个只读工具，分别查询引用、搜索全文、读取上下文和查阅主题 Wiki。用同一个 DSH 构建和本机模拟模型服务，各冷启动三次。启动到首次模型请求的中位数由 285 毫秒变为 291 毫秒，采样峰值内存的中位数由约 133 MiB 变为 153 MiB。由于这组实测没有显示资源收益，本轮保留 SDK 和构建依赖。这组对照测的是运行配置，模型核查质量需要用标注样例另行评估。
