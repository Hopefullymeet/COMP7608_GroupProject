# PaperTrace 测试基线

本基线以[桌面客户端分支的接口索引][index]为范围，以[项目书第 10 节](source/PaperTrace_Project_Book_ZH.md#10-数据与评估)为质量评估依据。下表记录约定行为。客户端契约用例使用固定输入。论文质量评估使用已存档的真实模型运行与逐项评分。

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

以下用例使用[发现、阅读与定位契约第 2 节的固定样例][discover]。目标论文为 PubMedQA（DOI `10.18653/v1/D19-1259`）。样例摘要给出两个事实：它是生物医学问答数据集，问题的上下文是对应论文去掉结论后的摘要。摘要没有给出标注预算或完整标注流程。

每条用例从独立工作区或等价的初始数据开始。文中的“该论文”“该版本”“本次任务”均指本次运行取得的 ID。发起问答时，先调用 `task.prepare`，确认发送范围后用返回的确认单调用 `task.start`。结果通过 `task.get` 或终态事件查看；检查“已保存”时，还要用原主题和会话调用 `session.get`，按本次 `task_id` 核对历史。

| 用例 ID | 场景 | 前置条件 | 操作与输入 | 预期结果（通过条件） |
|---|---|---|---|---|
| DISC-01 | 检索并重新打开结果 | 新主题“科学问答数据集”及空会话；固定样例首轮未命中，补搜可找到 PubMedQA。 | ① 输入“哪些科学问答数据集使用论文摘要？”，年份选 2019–2022（含边界），查看确认单。<br>② 确认并启动，记录任务 ID 和结果的检索 ID。<br>③ 重新打开最近检索，依次读取 `discovery.latest`、`discovery.get` 和 `discovery.steps`。 | ① 确认单标明搜索和模型两个端点、各自用途及发送的数据类别。<br>② 任务为 `completed`；可见候选中有指定 DOI 的 PubMedQA，状态为 `pending`。<br>③ 最近检索 ID 与步骤②一致，重新打开后仍有该候选。固定样例步骤依次为搜索、决定补搜、再次搜索、停止。 |
| LIB-01 | 重复加入同一候选 | 空主题中已有状态为 `pending` 的 PubMedQA 候选；两次操作使用同一主题、同一轮检索和相同摘要。 | ① 对候选执行 Add，记下论文 ID 和版本 ID。<br>② 用新的 `operation_id` 再执行一次 Add，模拟用户第二次点击。<br>③ 用 `library.list(topic_id)` 读取主题库，用 `discovery.get` 读取候选当前状态。 | ① 首次返回 `decision=added`、`link_status=linked`。<br>② 第二次返回 `already_linked`，论文 ID 和版本 ID 均与首次相同。<br>③ 主题库中目标论文只有一条记录，该主题关联和该版本各出现一次；候选显示为 `added`。 |
| ASK-01 | 摘要有答案 | PubMedQA 已加入主题；会话只选该论文的摘要版本。 | ① 以 `requested_scope=abstract` 提问“PubMedQA 提供给模型的上下文是什么？”。<br>② 读回历史回答，用其 `message_id` 和支持该结论的锚点调用 `evidence.locate`。 | ① 终态为 `completed`，历史中能找到本次回答；`read_sources` 对应所选版本，阅读范围为 `abstract`。<br>② 答案同时表达“对应论文的摘要”和“去掉结论”，允许同义措辞。该句标为 `supported`，至少有一个锚点；定位返回的目标段落包含引句，人工核对原文支持上述两个要点。 |
| ASK-02 | 摘要缺少所问信息 | 空会话只选 PubMedQA 摘要；事先核对摘要未说明标注预算或金额。 | 以 `requested_scope=abstract` 提问“这项研究的标注预算是多少？”。任务结束后，读回正式回答，检查预算相关句子的判断和锚点。 | 成功读取摘要后，任务可按 `completed` 结束。回答说明无法从摘要确定预算；该句为 `evidence_not_established`，且 `anchor_ids=[]`。给出具体金额或引用无关段落作为预算证据，均判失败。 |
| ASK-03（A） | 要求全文，摘要可提供部分答案 | 库中只有 PubMedQA 摘要，无可读全文。摘要写明问答所用的上下文。 | 以 `requested_scope=full_text` 提问“PubMedQA 提供什么上下文？”。任务结束后检查终态、实际阅读范围，并按任务 ID 查询会话历史。 | `status=partial`，`issue.reason=FULL_TEXT_REQUIRED`。实际阅读范围是所选版本的 `abstract`；会话历史中能读回部分回答，内容包含“去掉结论后的摘要”。 |
| ASK-03（B） | 要求全文，摘要无法回答 | 库中只有同一 PubMedQA 摘要，无可读全文，摘要未说明标注预算。 | 独立启动问答，以 `requested_scope=full_text` 提问“标注预算是多少？”。按本次任务 ID 检查终态、错误详情及会话历史。 | `status=failed`，`issue.reason=FULL_TEXT_REQUIRED`。`issue.details.read_sources` 报告已读版本及范围 `abstract`；会话历史中没有本次任务的正式回答。 |
| LOC-01 | 移出主题后打开历史出处 | 已准备一条符合 ASK-01 的历史回答；记下其主题、回答、锚点及实际阅读版本 ID。原始材料和会话历史均保留。 | ① 点击历史出处，记录 `evidence.locate` 返回的论文、版本、段落 ID 和引句。<br>② 将论文移出当前主题，通过 `library.list(topic_id)` 确认该主题已无此论文。<br>③ 重开原会话，再次点击同一回答的同一出处。 | ① 版本等于回答实际读取的版本，目标段落存在且包含非空引句。<br>③ 两次打开的论文、版本、段落 ID 和引句一致。桌面联调时，阅读器应跳到该段落；只打开论文首页判失败。 |
| TASK-01 | 取消后收到迟到结果 | 选择摘要可回答的问题，记录会话已有问答；测试环境可暂缓正式提交并在取消后放行剩余事件。 | ① 启动问答并订阅事件；收到第一条非空 `answer.delta` 后，在提交前调用 `task.cancel`。<br>② 确认取消成功后放行剩余事件，待处理完毕，读取 `task.get` 和 `session.get`。 | ① 取消响应为 `cancelled`。若正式提交先发生，本次未满足测试前提，需重新执行。<br>② 最终任务仍为 `cancelled`。原有问答仍可读回；会话中没有以本次任务 ID 保存的预览或迟到回答。 |

## 论文评估

[最终报告评估说明](../evaluation/experiments/README.md)列出了桌面阅读与核查、论文比较、研究引擎引用标签和跨会话 Wiki 的采集及离线复算命令。

[index]: https://github.com/Hopefullymeet/COMP7608_GroupProject/blob/4f472c75dcf5c2f4155b11d48fdeab215f8f9f48/docs/contracts/README.md
[discover]: https://github.com/Hopefullymeet/COMP7608_GroupProject/blob/4f472c75dcf5c2f4155b11d48fdeab215f8f9f48/docs/contracts/discover-read-locate.md
[library]: https://github.com/Hopefullymeet/COMP7608_GroupProject/blob/4f472c75dcf5c2f4155b11d48fdeab215f8f9f48/docs/contracts/library-reading.md
[wiki]: https://github.com/Hopefullymeet/COMP7608_GroupProject/blob/4f472c75dcf5c2f4155b11d48fdeab215f8f9f48/docs/contracts/comparison-wiki.md
[citation]: https://github.com/Hopefullymeet/COMP7608_GroupProject/blob/4f472c75dcf5c2f4155b11d48fdeab215f8f9f48/docs/contracts/citation-export.md
[services]: https://github.com/Hopefullymeet/COMP7608_GroupProject/blob/4f472c75dcf5c2f4155b11d48fdeab215f8f9f48/docs/contracts/services-workspace.md
[protocol]: https://github.com/Hopefullymeet/COMP7608_GroupProject/blob/4f472c75dcf5c2f4155b11d48fdeab215f8f9f48/docs/contracts/protocol.md
