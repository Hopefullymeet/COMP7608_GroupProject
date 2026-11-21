# PaperTrace 前端联调交接

更新于 2026-11-21。主线是「找论文 → 选入主题 → 补 PDF 和书目 → 回到上次阅读位置」。桌面端连接工作区服务。浏览器样例继续用于开发界面状态。

## 已可联调与页面待做项

| 功能 | 现有页面和接口 | 前端待补 |
| --- | --- | --- |
| 模型设置 | **可直接使用。** `services.get/save/test` 已支持模型 ID、保存与测试。测试读取已保存配置，运行中的任务沿用原模型。 | 端点设为只读，收起预算和钥匙串入口，在测试按钮旁显示结果。用 `credential_configured` 显示凭据状态。提交时仍原样带回预算、服务数组和开关。 |
| 文献发现 | **可直接使用。** 现有查询、年份与会议筛选、确认弹窗、候选卡和选入/排除复用原接口。卡片展示检索来源，结果为空走完成状态。 | 优化超时、限流、服务未配置和无结果的中英文提示。会议筛选说明当前覆盖范围。 |
| 统一导入与论文详情 | **后端接口已就绪。** 可预览 DOI／arXiv 书目、确认入库、补现有 PDF 的书目和编辑元数据。 | 首页、资料库和主题复用导入入口。显示匹配预览、逐项结果和「待补 PDF」。后续添加附件时传返回的 `paper_id`。详情页用当前 `revision` 编辑，冲突时重新读取后再提交。 |
| 分区、收录与等级 | **后端接口已就绪。** `library.metadata` 返回 `rankings`，包括体系、年份、学科和来源。 | 在资料库详情和论文速览共用展示。按下方说明处理数据来源和空状态。 |
| PDF 查找、目录与续读 | **后端可保存。** 现有阅读器有原版 PDF、连续滚动、翻页、缩放、批注和论文列表。旧段落书签依然可读。 | 用 PDF.js 补 PDF 内查找和章节目录。阅读器停止滚动或调整缩放后合并写入，打开会话时恢复对应版本、页码、缩放和页内位置。从证据进入时优先定位到证据。 |
| 稿件引用建议 | **等待后端。** 现有页面已有建议入口，独立引用回查已接通。 | 接通建议后，展示支持了哪部分、原文位置和适用条件，由用户采纳。 |

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

后端测试覆盖候选去重、会议约束、取消后的迟到结果、限流、书目确认、版本冲突、续读和目录匹配。已验证 Crossref 和 arXiv 书目查询，以及 ALCE 的 DOI 入库、补附件、重复导入和页码恢复。OpenAlex 无密钥请求收到限流，成功响应和选入链路用固定响应验证。分区已用 DOAJ 和 ICORE 的公开目录验证，前端桌面请求适配器可读回带来源的分区结果。资料库面板、阅读器速览及 Windows 客户端留待走查。

后续优先接稿件句子引用建议，再做 Zotero 迁移、引用内链和导出预览。运行时精简和竞品功能研究见[技术路线](Agentero_Parity_and_Settings_ZH.md)。
