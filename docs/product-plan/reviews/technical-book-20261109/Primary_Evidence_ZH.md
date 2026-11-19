# 技术选型的官方依据

2026-11-09查阅。以下只记录文档事实；具体架构由本项目选择。

| 编号 | 官方材料 | 本轮确认的要点 |
|---|---|---|
| T01 | [Tauri sidecar](https://v2.tauri.app/develop/sidecar/) | 可嵌入外部二进制，包括Python打包程序；每个目标架构需要对应二进制 |
| T02 | [Electron进程模型](https://www.electronjs.org/docs/latest/tutorial/process-model) | 主进程、渲染进程及preload有不同职责，跨边界调用通过受控接口 |
| T03 | [Tauri前端通信](https://v2.tauri.app/develop/calling-frontend/) | Rust可向前端发送事件和Channel数据；应用仍需定义自己的任务协议 |
| T04 | [LangGraph持久化](https://docs.langchain.com/oss/python/langgraph/persistence) | 检查点与跨线程存储不同；内存检查点不能跨进程重启保留 |
| T05 | [LangGraph故障处理](https://docs.langchain.com/oss/python/langgraph/fault-tolerance) | 官方提供恢复与故障处理机制；应用副作用仍需单独处理 |
| T06 | [SQLite FTS5](https://sqlite.org/fts5.html) | 提供全文查询、相关性辅助函数和分词配置 |
| T07 | [SQLite WAL](https://sqlite.org/wal.html) | 读写可并行，但同时只有一个写入者；WAL不适合网络文件系统 |
| T08 | [SQLite备份](https://www.sqlite.org/backup.html) | 提供在线备份API及VACUUM INTO等快照方式 |
| T09 | [sqlite-vec](https://alexgarcia.xyz/sqlite-vec/) | 向量检索扩展有Python等绑定；当前文档首页含alpha版本，分发前需要锁定版本并验证 |
| T10 | [PDF.js API](https://mozilla.github.io/pdf.js/api/draft/) | 提供文档、页面、渲染和worker接口；匹配解析坐标由应用完成 |
| T11 | [GROBID坐标](https://grobid.readthedocs.io/en/latest/Coordinates-in-PDF/) | 可请求结构坐标；坐标从左上起算，页码从1开始，使用PDF单位 |
| T12 | [Docling](https://docling-project.github.io/docling/) | 提供结构化文档、OCR及表格等处理，支持本地执行；具体模型另行核验 |
| T13 | [PyInstaller分发](https://pyinstaller.org/en/stable/operating-mode.html) | 先验证one-folder更便于诊断；单文件模式会解包到临时目录 |
| T14 | [Tauri WebDriver](https://v2.tauri.app/develop/tests/webdriver/) | 原生桌面自动化支持需按平台查验，不能以Web前端测试替代所有桌面验收 |
| T15 | [Pandoc](https://pandoc.org/MANUAL.html#citations) | 提供文档转换与引用排版；通用转换不保证复杂格式无损 |
| T16 | [Zotero API v3](https://www.zotero.org/support/dev/web_api/v3/basics) | 私有库访问需授权；本地API与云端API的授权行为有区别 |
| T17 | [Docling许可证](https://github.com/docling-project/docling/blob/main/LICENSE) | 代码为MIT；模型与下游组件单独检查 |
| T18 | [PyInstaller许可证](https://github.com/pyinstaller/pyinstaller/blob/develop/COPYING.txt) | GPL及bootloader例外；不能把该例外套到全部依赖 |
| T19 | [Pandoc许可证](https://github.com/jgm/pandoc/blob/main/COPYING.md) | 随分发包记录对应GPL许可；具体发行版本单独锁定 |

本轮根助手尚未运行桌面打包或解析实验，技术书应为这些决策明确验证方法，并在实验后选择实际版本与配置。
