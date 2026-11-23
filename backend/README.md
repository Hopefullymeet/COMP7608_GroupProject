# PaperTrace 本地宿主联调

桌面端可检索文献、管理论文并连接模型阅读。任务、文献与证据由 Python 写入 SQLite。Python 需要 3.9 或更新版本。

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

## 启用 BibTeX 导入

使用桌面 worker 的 Python 安装解析器。如果使用自定义解释器，用同一个解释器执行安装并设置 `PAPERTRACE_PYTHON`。

```sh
python3 -m pip install -r backend/requirements-bibliography.txt
```

RIS 和 CSL JSON 由标准库读取。书目预览和提交均可离线进行。


## 配置文本模型

当前文本模型提供方为 DeepSeek。Windows 会自动发现 npm 全局安装的 `@deepseek-ai/dsh`，显式设置 `PAPERTRACE_AGENT_CLI` 时优先使用指定入口。先构建仓库首页链接的运行时版本，将 `PAPERTRACE_AGENT_CLI` 指向构建生成的 `apps/cli/lib/bin.js`，`PAPERTRACE_AGENT_NODE` 指向 Node.js 24.9 或更新版本。Windows 和 macOS 用户可在「模型和服务 → 管理系统凭据」保存或移除 API 密钥。密钥保存在 Windows 凭据库或 macOS 钥匙串的 `PaperTrace/DeepSeek` 项中。若 Windows 凭据管理器拒绝访问，应用会使用当前用户的 Windows DPAPI 将密钥加密保存到 `%LOCALAPPDATA%/PaperTrace/deepseek.dpapi`。没有系统凭据时，应用读取启动环境中的 `DEEPSEEK_API_KEY`。

```sh
(
  export PAPERTRACE_AGENT_CLI="/path/to/runtime/apps/cli/lib/bin.js"
  export PAPERTRACE_AGENT_NODE="$(command -v node)"
  printf 'DeepSeek API key: '
  read -rs DEEPSEEK_API_KEY
  printf '\n'
  export DEEPSEEK_API_KEY
  VITE_PAPERTRACE_TRANSPORT=rpc pnpm --dir frontend desktop
)
```

从仓库根目录运行。请将示例中的运行时路径换成你的构建路径。

默认模型为 `deepseek-flash`，默认端点为 `https://api.deepseek.com`。在「模型与服务」中可修改 OpenAI 兼容基础地址，例如 `https://provider.example/v1`，应用会在基础地址后追加 `/chat/completions`。「测试连接」直接请求已保存的端点并显示结果。问答等 Agent 任务使用 Harness，确认对话框显示实际端点及发送内容。每条模型任务使用独立进程和临时目录。摘要问答读取本轮确认的摘要。全文任务可以检索和补读本轮选定的论文。引用需要在本轮实际读过的段落中逐字找到，语义支撑仍由模型判断。取消只中断当前任务进程。密钥通过环境传给模型进程，不写入工作区。

在首页输入研究问题（例如 `Which scientific QA datasets use paper abstracts?`）。提交后点 **Find papers**，确认范围并启动，选择 PubMedQA 加入主题。进入 **Read & ask**，询问 `What context does PubMedQA use?`，再点回答中的来源。退出并用同一工作区重开，核对主题、文献和历史回答。

在根目录执行契约测试：

```sh
python3 -B -m unittest discover -s backend -v
pnpm --dir frontend test
```

后端测试运行独立的 Python 子进程，验证写入幂等与冲突、确认绑定、订阅与补收、证据定位、重启恢复、取消和无效引句过滤。默认测试使用本地模式，无需联网或凭证。

## 用一组论文搭提纲

安装 Poppler，确保 `pdftotext` 与 `pdftoppm` 可调用。启动桌面 RPC 模式并配置文本模型后，创建主题，进入 **Synthesize**，拖入 PDF 或点 **Add PDFs**。可选择 2–12 篇论文；单个 PDF 上限 16 MB、150 页。当前从 PDF 提取已有文字，扫描版需要先做 OCR。

如果 `pdftotext` 缺失或运行失败，文字提取会回退到 pypdf。可在运行 worker 的 Python 环境中执行 `python -m pip install pypdf`。PDF 页面的后端图片渲染继续使用 `pdftoppm`。

提出想写的研究问题并确认发送范围。生成后点击观点下的 **Source** 在右侧打开保存的 PDF 页。**Review for Wiki** 可逐项勾选采纳，证据仍可从 **Topic Wiki** 回到原文。某篇论文换版时，在该论文旁选择 **Add version**，Wiki 会提示复核依赖旧版的项目。

### 六篇公开论文的对照实验

从 `backend/evaluate_synthesis.py` 的 `PAPERS` 链接下载公开全文，保留相应的六个文件名。先用下列命令检查入库与人工标注的页级证据，再去掉 `--corpus-only` 启动三组模型对照。对照先要求审阅一组用于积累 Wiki 的种子结果。报告中的人工质量评分字段留空，供评估者根据列明的预期证据和误支持样例填写。

```sh
python3 -B backend/evaluate_synthesis.py /path/to/corpus --corpus-only
python3 -B backend/evaluate_synthesis.py /path/to/corpus --output synthesis-evaluation.json
```

桌面发现默认使用 OpenAlex。可在启动时通过 `PAPERTRACE_OPENALEX_API_KEY` 提高额度。仅在离线样例和自动化测试使用 `PAPERTRACE_DISCOVERY_FIXTURE=1`。DOI 与 arXiv 查询通过各自的公开服务执行，PDF 和笔记保存在本地。

## 离线查引用与检查 PDF 稿件

在主题 **Synthesize** 的论文旁打开 **Paper references**，可在没有模型连接时查看双向引用和原页。已有论文在工作区开启后后台补建引用索引。

在 **Citation check** 导入 PDF 稿件，核对系统找到的参考文献对应关系，选择句子后启动回查。接受有原文依据的结果后可以保存进主题 Wiki 或导出为 Markdown 与 BibTeX。原 PDF 和历史判断按版本保留。可选 GROBID 及具体接口见[PDF 引用契约](../docs/contracts/pdf-citations.md)。

## PDF 批注与按描述找图

阅读器用 PDF.js 显示文字层。图表索引、区域裁剪和批注副本使用 PyMuPDF 1.26 或更高版本。将 PyMuPDF 安装到桌面 worker 使用的 Python 环境，或设置 `PAPERTRACE_PYTHON` 指向已有安装的解释器。当前按页从 PDF 提取图注、图内标签、矢量形状和颜色，并尝试对齐表格行列。复杂表格和公式需要对照原文。

划词问答由当前配置的文本模型处理，确认界面仅列选区文字与问题。框选提问及图像描述索引可以使用 Ollama 的视觉模型。本地 Ollama 运行后，在启动桌面 worker 前设置：

```sh
export PAPERTRACE_VISION_MODEL=qwen3-vl:2b
export PAPERTRACE_VISION_PORT=11434
```

图像请求连接 `127.0.0.1`。使用本地模型并在启动 Ollama 前设置 `OLLAMA_NO_CLOUD=1` 可以关闭 Ollama 云端服务。在阅读器选择「用视觉模型补充图像描述」可为当前 PDF 每批处理至多 24 张图，已生成的描述按模型与图块缓存。描述参与图块检索，图注、关键词和可识别的图形特征也能离线搜索。批注单独写入 SQLite，导出时生成包含 PDF 注解的副本。

## 发表场所分区、收录和等级

用目录提供方发布且有权使用的文件初始化工作区。安装后，论文详情自动查本地目录，无需逐篇查站。使用与桌面端相同的工作区路径。目录可以按体系和版本分别安装，替换同一版时会整体更新，其他年份仍可查。

```sh
python3 backend/venue_ranks.py /path/to/workspace doaj.csv \
  --scheme doaj --format doaj --edition '2026-10-21 public export' --year 2026 \
  --source-url https://doaj.org/docs/journal-csv
```

日期用下载页列出的目录更新日期。原生格式包括 DOAJ CSV、SCImago SJR CSV、Master Journal List 单个索引 CSV 和 ICORE 查询表格 HTML。SJR CSV 中的 Best Quartile 会按最佳分区标注。ICORE 分页可先保存需要的页，再把所有文件交给同一次导入，使用表格 Source 列的版本名，例如 ICORE2026。只导入部分页面时，未匹配仅表示该快照中没有对应条目。 [DOAJ 导出](https://doaj.org/docs/journal-csv) · [SCImago 下载说明](https://www.scimagojr.com/help.php) · [Master Journal List](https://mjl.clarivate.com/scope/scope_ahci/) · [ICORE 目录](https://portal.core.edu.au/conf-ranks/)

标准 UTF-8 CSV 的必填列是 `venue,venue_type,value`，可选列是 `issns,aliases,category,source_url`。venue_type 使用 journal 或 conference。aliases 用竖线分隔，按学科保留多行。自定义体系使用新的 `--scheme` 并提供 `--label`、`--metric` 和一个或多个 `--venue-type`。完整内置体系见[目录导入器](venue_ranks.py)。

JCR、CiteScore、CCF、CSSCI、CSCD、北大核心、ABDC、AJG 等可将有权使用的目录转成标准 CSV 后导入。JCR 分区每个学科单独一行。中科院分区表支持已获授权的历史目录，使用 1区–4区和实际版本。 [Clarivate 访问说明](https://developer.clarivate.com/apis/wos-journal) · [Scopus 来源说明](https://www.elsevier.support/scopus/answer/how-do-i-use-the-scopus-sources-feature) · [CCF 目录说明](https://www.ccf.org.cn/service/pj/2024-03-14/814278.shtml) · [中科院公告](https://www.las.cas.cn/news/tzgg/202603/t20260327_8178738.html)
