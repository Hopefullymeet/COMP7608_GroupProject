# 论文比较

原 Evidence Wiki 的概念页、草稿与审阅（`wiki.list`、`wiki.review`、`wiki_draft`）已由[主题 Wiki](topic-wiki.md)取代。

所有 ID、写入幂等、确认单、订阅与错误沿用[共用协议](protocol.md)。anchor_ids 可经 [evidence.open](library-reading.md) 定位。字符串列表须去重，版本号为不透明 ID。

| 操作 | 请求 params | result 与失败行为 |
|---|---|---|
| task.prepare → task.start，paper_comparison | {kind,topic_id,input:{source_versions:[Id,Id],question:string,dimensions:string[]}} | 两篇不同论文各一个已确认版本。阶段 read、align、compare；终态 {record_id:Id}，用 comparison.list 读回。维度缺材料时保留说明 |
| comparison.list | {topic_id} | {items:Comparison[]}，最近修订在前。每次修订保留原证据、前版与编辑人 |
| comparison.save | {operation_id,topic_id,comparison_id,base_revision,cells:Cell[]} | Comparison；只允许当前版本的既有格子，同一修订一次提交。失配 STALE_REVISION |
| note.save | 见[笔记](library-reading.md)，origin=comparison | 记录双方版本、维度、文本及所用锚点 |

~~~~ts
type Cell = {dimension:string,source_version_id:Id,text:string,status:'evidenced'|'not_comparable'|'missing'|'disputed',anchor_ids:Id[]}
type Comparison = {comparison_id:Id,revision:Id,question:string,source_versions:[Id,Id],cells:Cell[],history:{revision:Id,cells:Cell[]}[]}
~~~~

维度预设为方法、数据划分、指标、基线、成立条件，用户可增删。按维度和版本各返回一格；不可比须给出具体原因。evidenced 须有出处。

样例：主题 t1 选择 PubMedQA v1 与 QASPER v2，task_id=t2，event_seq 1..3 依次 read、align、compare，4 为 completed，record_id=c1。c1 的 Method/v1 引用 a1，Metrics/v2 为 missing 并说明摘要未报告对照结果。用户按 c1 的修订 r1 保存，再存为笔记 n1；n1 随后由主题 Wiki 捕获。并行修改同一比较返回 -32020 STALE_REVISION，刷新后重新保存。任务取消与部分结果遵循共用终态。
