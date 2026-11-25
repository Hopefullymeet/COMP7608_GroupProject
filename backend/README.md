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

Windows 和 macOS 用户可在「设置 → 模型 → 新增模型供应商」填写名称、端点基础地址、模型 ID 和 API 密钥，然后点击「保存连接」。每条连接有独立的密钥引用，密钥保存在 Windows 凭据库或 macOS 钥匙串。Windows 凭据管理器拒绝访问时，应用使用当前用户的 DPAPI 加密存储。未选用已保存的连接时，工作进程也可从启动环境读取 `DEEPSEEK_API_KEY`。

默认模型为 `deepseek-flash`，默认端点为 `https://api.deepseek.com`。新增供应商时，按服务要求在 OpenAI 兼容基础地址中保留版本路径，例如 `https://provider.example/v1`，应用会追加 `/chat/completions`。在「模型提供方」下拉框切换连接，点击「测试所选供应商」验证该连接，或在「管理供应商」中编辑和删除。可选的证据复核模型在任务预算下方的「复核服务连接」中单独配置。内置的 DeepSeek Harness 核心负责安排多轮工具调用，Python 后端执行论文工具、流式呈现回答并核验证据，可检索本轮选定的论文、补读同页上下文并核对引句。确认对话框显示端点及发送范围。

在首页输入研究问题（例如 `Which scientific QA datasets use paper abstracts?`）。提交后点 **Find papers**，确认范围并启动，选择 PubMedQA 加入主题。进入 **Read & ask**，询问 `What context does PubMedQA use?`，再点回答中的来源。退出并用同一工作区重开，核对主题、文献和历史回答。

在根目录执行契约测试：

```sh
python3 -B -m unittest discover -s backend -v
pnpm --dir frontend test
```

后端测试运行独立的 Python 子进程，验证写入幂等与冲突、确认绑定、订阅与补收、证据定位、重启恢复、取消和无效引句过滤。默认测试使用本地模式，无需联网或凭证。

## 用一组论文搭提纲

安装 Poppler，确保 `pdftotext` 与 `pdftoppm` 可调用。启动桌面 RPC 模式并配置文本模型后，创建主题，进入 **Synthesize**，拖入 PDF 或点 **Add PDFs**。可选择 2–12 篇论文；单个 PDF 上限 50 MB、150 页。当前从 PDF 提取已有文字，扫描版需要先做 OCR。

如果 `pdftotext` 缺失或运行失败，文字提取会回退到 pypdf；pypdf 不可用时，桌面端使用随应用打包的 PyMuPDF 读取稿件。PDF 页面的后端图片渲染继续使用 `pdftoppm`。

提出想写的研究问题并确认发送范围。生成后点击观点下的 **Source** 在右侧打开保存的 PDF 页。**Review for Wiki** 可逐项勾选采纳，证据仍可从 **Topic Wiki** 回到原文。某篇论文换版时，在该论文旁选择 **Add version**，Wiki 会提示复核依赖旧版的项目。

桌面发现默认使用 OpenAlex。可在启动时通过 `PAPERTRACE_OPENALEX_API_KEY` 提高额度。仅在离线样例和自动化测试使用 `PAPERTRACE_DISCOVERY_FIXTURE=1`。DOI 与 arXiv 查询通过各自的公开服务执行，PDF 和笔记保存在本地。

## 离线查引用与检查 PDF 稿件

在主题 **Synthesize** 的论文旁打开 **Paper references**，可在没有模型连接时查看双向引用和原页。已有论文在工作区开启后后台补建引用索引。

在 **Citation check** 导入 PDF 稿件，核对系统找到的参考文献对应关系，选择句子后启动回查。接受有原文依据的结果后可以保存进主题 Wiki 或导出为 Markdown 与 BibTeX。原 PDF 和历史判断按版本保留。可选 GROBID 及具体接口见[PDF 引用契约](../docs/contracts/pdf-citations.md)。

## PDF 批注与按描述找图

阅读器用 PDF.js 显示文字层。图表索引、区域裁剪和批注副本使用 PyMuPDF 1.26 或更高版本。桌面构建会校验并内置与目标平台匹配的 PyMuPDF wheel。单独从源码运行 Python worker 时需安装 PyMuPDF。当前按页从 PDF 提取图注、图内标签、矢量形状和颜色，并尝试对齐表格行列。复杂表格和公式需要对照原文。

导入 PDF 后，桌面端用随包的量化 Chinese-CLIP 对原图区域建立向量索引。第一次检索旧论文时会补建索引。在会话中描述想找的图，或在「查找插图」输入描述，可查看最多三张原图候选及其出处。索引按论文版本、图块和位置保存在本地。构建阶段校验并缓存固定版本的模型，应用运行时使用包内的模型、词表及 WASM 引擎。

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
