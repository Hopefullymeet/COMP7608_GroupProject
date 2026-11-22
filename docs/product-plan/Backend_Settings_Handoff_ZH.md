# PaperTrace 前端联调交接

更新于 2026-11-22。主线是「找论文 → 选入主题 → 补 PDF 和书目 → 回到上次阅读位置」。桌面端连接工作区服务。浏览器样例继续用于开发界面状态。

## 已可联调与页面待做项

| 功能 | 现有页面和接口 | 前端待补 |
| --- | --- | --- |
| 离线书目导入 | `library.preview_bibliography` 与 `library.commit_bibliography` 已支持 BibTeX、RIS 和 CSL JSON。 | 复用导入对话框。按文件格式传 `bibtex`、`ris` 或 `csl-json`。用户选文件后展示预览、勾选可用行、确认入库，再逐项显示成功、已有或冲突。缺 PDF 的条目继续沿用现有补件入口。BibTeX 解析器随发行环境准备，缺少时展示配置提示。若目标 PDF 已属于另一条论文，显示身份冲突并让用户核对条目。 |
| 批量整理论文 | `library.organize` 支持批量加减标签、加入及移出主题。移出后历史引句仍可读。 | 刷新列表和批量操作的实际修改数。历史证据卡调用 `source.page` 时一起传 `anchor_id`，便于定位已移出主题的原页。 |
| 归档与恢复 | 现有 `workspace.archive/archived/unarchive` 已接工作区。归档会隐藏主题或会话，保留保存过的材料。 | 从主题或会话菜单发起归档，刷新侧栏和归档列表。恢复主题后，仍单独归档的会话留在归档列表。 |
| 模型设置 | **可直接使用。** `services.get/save/test` 已支持模型 ID、保存与测试。测试读取已保存配置，运行中的任务沿用原模型。 | 端点设为只读，收起预算和钥匙串入口，在测试按钮旁显示结果。用 `credential_configured` 显示凭据状态。提交时仍原样带回预算、服务数组和开关。 |
| 文献发现 | **可直接使用。** 现有查询、年份与会议筛选、确认弹窗、候选卡和选入/排除复用原接口。卡片展示检索来源，结果为空走完成状态。 | 优化超时、限流、服务未配置和无结果的中英文提示。会议筛选说明当前覆盖范围。 |
| 统一导入与论文详情 | 首页、资料库和主题共用导入对话框，可拖 PDF 或粘贴多个编号。书目分预览和确认两步，失败逐项重试。 | 在安装包复测系统拖放和文件选择。给已有论文补附件时沿用该条目的 `paper_id`。 |
| 分区、收录与等级 | 资料库详情和阅读器速览共用发表信息面板，展示目录版本、学科和来源。 | 部署时装入要用的目录，按下方样例复测多个学科和缺失状态。 |
| 原 PDF 自带批注 | `reader.embedded_marks` 可按页读取 PDF 已嵌入的批注。含原始类型、矩形、选中文字及备注。 | 对 Zotero 等工具导出的带批注 PDF 显示只读状态，跳到原页。与 PaperTrace 自己保存的批注区分，避免叠画同一条。 |
| PDF 查找、目录与续读 | 阅读器菜单可查找文字和打开内嵌章节目录。会话阅读按版本保留页码、缩放和页内位置。 | 在安装包复测预印本、正文无目录的 PDF 和扫描件，入口见阅读器「更多」。 |
| 稿件引用建议 | 稿件页可选原句与论文查找引用。结果逐项展示支持程度和出处，可审阅、存 Wiki 或导出。 | 确认换版后只标记依赖旧证据的句子与提纲，旧报告仍能打开原文。 |

模型接口沿用 [模型与服务契约](../contracts/services-workspace.md#桌面端当前接入)。发现、导入和阅读分别见 [文献发现](../contracts/discover-read-locate.md#桌面端-openalex-检索) 和 [资料库与阅读](../contracts/library-reading.md#书目和-pdf-续读)。模型或检索服务不可用时，用户仍应能打开本地 PDF、批注和阅读。

## 分区、收录与等级怎么接

1. **入口。** 先接资料库右侧论文详情，再复用到阅读器「速览」。资料库用选中条目的 `paper_id`。阅读器先用当前 `source_version_id` 在资料库条目中查到 `paper_id`。现有入口见 [资料库详情](../../frontend/src/views/LibraryPage.tsx) 和 [论文速览](../../frontend/src/views/Read.tsx)。
2. **取数。** 只在详情开启、有论文 ID 和所属主题时调用。主题内用当前 `topic_id`。从全局资料库打开时，优先用界面选中的所属主题，否则用条目的首个所属主题。未归入主题时提示先加入主题。论文 ID、主题或指定目录年份改变后重新读取，等待时不展示上一条论文的结果。
3. **展示。** 按 `metric` 分为分区、收录、等级。命中时展示 `label`、`value`、`category`、`year`、`edition`，来源链接用每条 `entry.source_url`。同一体系的多个学科都保留。优先显示已匹配行，其他状态可以收在「查看详情」里。`verify_track` 显示「会议等级已查到，论文类别待确认」。
4. **刷新。** 后端默认选各体系已安装的最新目录。可通过 `edition_year` 查询指定目录年份，界面先沿用默认，目录年份和论文发表年分别显示。修改书目用 `library.update_metadata`，提交当前 `revision`，成功后直接采用响应里的新 `rankings`。发生 `STALE_REVISION` 时保留输入并重新读取。

```ts
const detail = await api.call('library.metadata', { topic_id, paper_id })
const matched = detail.rankings.items.filter((item) => item.status === 'matched')
```

| 状态 | 页面文案 |
| --- | --- |
| `catalog_missing` | 当前工作区未安装该体系的目录 |
| `venue_unknown` | 补充刊名、会议名或 ISSN 后再查 |
| `not_found` | 在已安装的目录中未找到 |
| `ambiguous` | 匹配有歧义，请核对刊名或 ISSN |
| `not_applicable` | 该体系不适用于当前发表类型 |

**分工。** 后端负责准备并安装团队使用的目录、验证匹配与来源。前端负责详情面板的展示、缺失状态和编辑后刷新。浏览器样例可用于展示状态，使用下方桌面联调步骤核对接口。[接口字段与类型](../../frontend/src/api/library.ts) · [接口行为](../contracts/library-reading.md#发表场所的分区收录和等级) · [目录安装说明](../../backend/README.md#发表场所分区收录和等级)

## 联调步骤

1. 在发现页用公开研究查询检索，检查确认弹窗里的查询词和目的地，再选一条候选加入主题。切换年份或会议也应保留对已排除条目的记录。按错误状态区分没有候选与上游失败。
2. 用 DOI 和 arXiv 各预览一条书目。首次确认入库后应显示「待补 PDF」。重复确认应返回相同论文。上传附件后新旧材料应在同一论文下。修改标题、作者或其他字段，再次匹配时保留手动填写的值。
3. 在会话中保存页码、缩放和页内位置，退出后重新打开。替换 PDF 版本后，旧版本仍可读回之前的位置。已有段落书签继续跳转。
4. 在设置页改模型、保存、重开并测试。按照 [桌面启动说明](../../backend/README.md) 配置文本模型与 OpenAlex。OpenAlex 可尝试无密钥基础调用，团队联调建议用自己的密钥。
5. **分区联调。** 用独立工作区，将下方样例 CSV 安装进去。桌面端启动时将 `PAPERTRACE_WORKSPACE` 指向同一目录。导入任意测试 PDF 后，在论文详情中填写刊名 `PaperTrace QA Journal`、ISSN `1234-5679`、发表类型 `journal`。应看到同一体系的两个学科，点击各行可打开来源。将 ISSN 改为 `0378-5955` 后应显示未匹配。切换一篇资料不足的论文时应显示待补信息。该 CSV 仅用于联调，部署时更换为有权使用的目录。

```csv
venue,venue_type,value,issns,category,source_url
PaperTrace QA Journal,journal,Q1,1234-5679,Artificial Intelligence,https://example.com/#ai
PaperTrace QA Journal,journal,Q2,1234-5679,Information Systems,https://example.com/#is
```

将上述内容保存为 UTF-8 的 `ranking-demo.csv`，从仓库根目录安装。把 `ranking-workspace` 换成桌面端使用的独立工作区路径。

```sh
python3 backend/venue_ranks.py ranking-workspace ranking-demo.csv --scheme jcr --edition QA-2025 --year 2025 --source-url https://example.com/
```

## 验证状态与后续

浏览器通过桌面请求适配器连接本机后端，已测首页 PDF 导入和去重、页内查找、章节目录、会话续读、窄屏阅读及建议证据在右侧打开。引用建议使用本机测试模型验证操作，另有测试覆盖多论文支持、证据缺口、编造引文被丢弃和换版待复核。DOAJ 与 ICORE 已用公开目录验证。系统文件拖放、资料库发表信息面板及 Windows 安装包留待走查。

后续推进 Zotero 迁移、引用内链和导出预览。运行时精简和竞品功能研究见[技术路线](Agentero_Parity_and_Settings_ZH.md)。

## 写作和找图验收

1. 在同一主题导入两篇可读 PDF 和一份稿件。进入「引用建议」，选原句及来源，确认发送范围。检查每个子论点的出处与限制，点击「查看来源」在右侧展开 PDF 页。接受有据建议后导出 Markdown 与 BibTeX，原稿保留。
2. 用「添加版本」替换给这句话提供证据的论文。历史报告和 Wiki 仍保留原文链接，受影响句子会出现在「重查受影响的句子」，相关提纲观点标为待复核。重查前选择当前论文，未受影响的结果可继续使用。
3. 在原论文测试阅读器「在 PDF 中查找」「章节目录」，滚到下一页、调整缩放后重开会话，核对恢复位置。从证据打开时应先回对应页。

图表基线用了 ALCE 和 RARR。按查询中明示的对象类型缩小范围后，贴近图注的四题均排首位，三条改写查询的目标分别排第 1、第 2 和第 11。对最初漏排的页试用 pdfplumber，三个薄弱页只有一个能从提取的文本直接找到预定标签，暂缓将它接入默认路径。前端已区分图注命中、已定位图块和仅定位到提及页。三款产品同题计时和人工证据评分留待统一环境运行。 [ALCE](https://aclanthology.org/2023.emnlp-main.398/) · [RARR](https://aclanthology.org/2023.acl-long.910/)

逐篇选中 PDF 后，用下列查询复跑。图号和表号用于核对结果，查询时原样输入表格中的描述。

| 论文 | 查询 | 预期 | PaperTrace 排名 |
| --- | --- | --- | --- |
| ALCE | table three datasets used in benchmark ASQA QAMPARI ELI5 | Table 1 | 1 |
| RARR | figure attribution and preservation scores | Figure 5 | 1 |
| ALCE | figure evaluation of citation quality | Figure 3 | 1 |
| RARR | table ablation automatic metrics harmonic mean | Table 2 | 1 |
| ALCE | diagram of the route from three questions into a generator with numbered snippets | Figure 1 | 1 |
| RARR | a graph with two metrics along its axes comparing how much an editor retains | Figure 5 | 2 |
| RARR | the score breakdown when the evidence filter and question stage are taken away | Table 2 | 11 |

## 问答中断与换版导出

- 摘要或全文问答如因模型中断或输出无效而没有形成正式回答，任务以 `failed` 结束。根据 `issue.reason` 展示原因，根据 `issue.retryable` 提供重试。可用 `issue.details.read_sources` 展示各篇已读到全文片段、摘要片段或尚未读取。有可用回答但预算终止时，显示部分完成及原因。会话正文不会新增一条失败答复。
- 提纲导出时，后端会核对选中观点的来源版本。遇到 `STALE_REVISION` 时，刷新提纲的 `stale_item_ids`，选中项保留在界面，允许用户复核或改选。历史观点与证据仍可以打开。
- 验收用例。让模型读完一段后中断或返回无效内容，核对任务状态和已读范围。再导出一个提纲，更换其中一个有依据的版本，确认选中的旧观点被拦截，且历史原文仍可定位。

找图的视觉索引每批最多处理 24 张。收到 `VISUAL_BATCH_REMAINING` 时显示剩余数量并提供「继续索引」。收到 `VISUAL_DESCRIPTIONS_INCOMPLETE` 时保留现有结果并提供重试。
