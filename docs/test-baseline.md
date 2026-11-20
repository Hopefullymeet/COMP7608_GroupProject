# PaperTrace 测试基线

本基线以[桌面客户端分支的接口索引][index]为范围，以[项目书第 10 节](source/PaperTrace_Project_Book_ZH.md#10-数据与评估)为质量评估依据。下表记录约定行为。真实服务联调和质量测量均待执行；浏览器示例回放只用于检查界面和固定输入下的行为。

## 功能范围

| 用户任务 | 接口依据 | 验收重点 |
|---|---|---|
| 建立主题、会话；检索、细化检索、处置候选 | [发现主线][discover] | 能读回主题、会话、检索步骤及候选当前状态。加入同一论文后主题内只有一条关联。 |
| 导入与整理资料、复核重复项、归档与恢复 | [资料库][library] | 身份冲突进入人工复核；移出主题只删除所选关联；回收前影响发生变化时报 `STALE_REVISION`。 |
| 阅读、问答、点击出处、继续阅读与保存笔记 | [摘要问答][discover]、[全文阅读][library] | 摘要与全文的阅读范围可辨；读回书签时对应所选版本；笔记修订保留旧内容与出处。 |
| 比较论文、维护 Evidence Wiki | [比较与 Wiki][wiki] | 有证据的比较单元格带出处，不可比时说明原因。Wiki 草稿经审阅后才进入正式页，接受部分改动时只应用所选项。 |
| 导入稿件、建议引用、独立回查、审阅与导出 | [稿件与导出][citation] | 回查限定被引或指定来源；一句中所有子论述均获支持才显示 Supported。接受审阅意见与写回稿件分别验证；采纳措辞生成新版本，保留原件。取消导出返回 `saved=false`。 |
| 配置服务、授权材料、持续检索、备份恢复 | [工作区][services] | 凭据接口只返回配置状态；撤销授权后停止后续派发和迟到结果提交；监测间隔为 0 时停用；恢复校验失败时保留原工作区。 |
| 跨页面的任务授权、重试、取消与读回 | [共用协议][protocol]、[工作区][services] | 写入重试不重复产生记录；重连可按事件序号续订；任务历史可读回。恢复检查点前重新核对版本、预算和授权。 |

## 首条主线验收用例

使用[契约第 2 节][discover]的 PubMedQA 固定样例联调。下列“接口”用例可先用固定请求和响应检查判定逻辑，后端就绪后再对真实服务执行。同一条成功路径在桌面端从检索走到打开出处，验证这些接口能连在一起工作。

| ID | 前置条件与操作 | 可观察的预期结果 | 验证方式 |
|---|---|---|---|
| DISC-01 | 创建主题与会话，准备并确认契约示例中的科学问答检索；结束后重新打开检索结果 | 确认前可查看数据去向及用途；固定样例能读回 PubMedQA 候选及搜索、补搜、停止步骤。真实检索单独按相关性评分。 | 接口回放；桌面联调 |
| LIB-01 | 对同一候选执行两次 Add，分别读取主题库和候选状态 | 首次建立关联；再次加入返回 `already_linked`。候选为 `added`，主题中仍只有一篇，材料未变时复用原版本。 | 接口集成 |
| ASK-01 | 选中已入库的 PubMedQA 摘要，问模型使用什么上下文 | 样例答案包含“去掉结论后的摘要”；正式回答列出实际阅读版本；支持该句的锚点可读回。允许语义相同的措辞。 | 接口检查字段；人工核对语义 |
| ASK-02 | 仅选摘要，询问人工确认摘要未交代的细节 | 任务允许正常完成；无证据的句子标为 `evidence_not_established`，对应锚点列表为空。 | 标注样例＋接口检查 |
| ASK-03 | 要求全文但仅有摘要，分别准备能给出部分回答和无法回答两种材料 | 前者返回 `partial` 并保存可用回答；后者为 `failed` 并报告已读范围。两种情况均报告 `FULL_TEXT_REQUIRED`。 | 接口集成 |
| LOC-01 | 在历史回答中点击出处；将论文移出主题后从同一回答再次打开 | 两次均返回回答当时的摘要版本和目标段落，引句可在该段找到。跳到同名论文的其他版本也判失败。 | 接口校验版本、段落、引句；桌面点击 |
| TASK-01 | 已出现回答预览，在终态提交前使取消先成功，再让在途响应到达 | 返回 `cancelled`；通过 `session.get` 读回时，预览未被保存为正式回答，迟到响应也不新增回答。 | 可控事件顺序的接口测试 |

## 质量评估与结果记录

| 评估问题 | 参考数据与判定 |
|---|---|
| 检索找到了多少相关论文？ | 对每个有已标注相关论文的问题，计算前 k 篇中命中的不同相关论文数 ÷ 标注相关论文总数，再按问题平均。记录 k、题数、搜索来源及论文标识。 |
| 摘要回答是否正确？ | 人工按参考要点核对答案是否完整、是否与原文冲突。分开报告可回答和证据不足的题目，后者记录被错误判为有支持的例数及总数。 |
| 出处是否准确且足以支持论述？ | 对照标注的可接受证据段落，按论文版本与段落核对所引证据，分别统计命中数占所引证据数、占参考证据数的比例。另由人工核对段落是否支持对应论述。漏引单列；无引用时精确率分母为零，记为不适用。 |

正式评估按论文族划分开发集和测试集，参考答案及证据标注只供评分。契约中的 PubMedQA 示例用于联调，正式质量评估使用核实过的论文原文与标注。首轮记录实测数值和样本数；质量阈值待预实验后确定。

每次执行按用例 ID 记录代码提交、数据版本、运行方式（回放或真实服务）、实际结果与失败依据；真实模型运行另记模型、耗时及调用量。接口变更时，在同一项评审中核对受影响用例的输入和预期，并更新下方契约引用。

[index]: https://github.com/Hopefullymeet/COMP7608_GroupProject/blob/4f472c75dcf5c2f4155b11d48fdeab215f8f9f48/docs/contracts/README.md
[discover]: https://github.com/Hopefullymeet/COMP7608_GroupProject/blob/4f472c75dcf5c2f4155b11d48fdeab215f8f9f48/docs/contracts/discover-read-locate.md
[library]: https://github.com/Hopefullymeet/COMP7608_GroupProject/blob/4f472c75dcf5c2f4155b11d48fdeab215f8f9f48/docs/contracts/library-reading.md
[wiki]: https://github.com/Hopefullymeet/COMP7608_GroupProject/blob/4f472c75dcf5c2f4155b11d48fdeab215f8f9f48/docs/contracts/comparison-wiki.md
[citation]: https://github.com/Hopefullymeet/COMP7608_GroupProject/blob/4f472c75dcf5c2f4155b11d48fdeab215f8f9f48/docs/contracts/citation-export.md
[services]: https://github.com/Hopefullymeet/COMP7608_GroupProject/blob/4f472c75dcf5c2f4155b11d48fdeab215f8f9f48/docs/contracts/services-workspace.md
[protocol]: https://github.com/Hopefullymeet/COMP7608_GroupProject/blob/4f472c75dcf5c2f4155b11d48fdeab215f8f9f48/docs/contracts/protocol.md
