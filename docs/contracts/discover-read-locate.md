# 发现 → 阅读 → 定位 主线接口契约 v0.4

验收流程为「检索 → 加入主题 → 摘要问答 → 跳到原摘要」。桌面界面连接检索和模型服务。PubMedQA 用于浏览器和离线样例。

全文阅读沿用本线的版本标识，扩展契约定义[按页与段落定位、返回原 PDF 及会话书签](library-reading.md)。检索可按[启用来源声明的会议筛选能力](services-workspace.md)查询，并报告元数据缺口。通信和重试见[共用协议](protocol.md)。

## 1. 接口字段与行为

### 1.1 方法与类型

| 方法 | `params` | `result` |
|---|---|---|
| `topic.create` | `{ operation_id: Id, title: NonEmptyText }` | `{ topic_id: Id }` |
| `topic.list` | `{}` | `{ items: { topic_id: Id; title: NonEmptyText }[] }` |
| `session.create` | `{ operation_id: Id, topic_id: Id }` | `{ topic_id: Id, session_id: Id }` |
| `session.list` | `{ topic_id: Id }` | `{ items: { session_id: Id; title?: NonEmptyText }[] }` |
| `topic.rename` | `{ operation_id: Id, topic_id: Id, title: NonEmptyText }` | `{ topic_id: Id, title: NonEmptyText }` |
| `session.rename` | `{ operation_id: Id, topic_id: Id, session_id: Id, title: NonEmptyText }` | `{ topic_id: Id, session_id: Id, title: NonEmptyText }` |
| `session.get` | `{ topic_id: Id; session_id: Id }` | `{ turns: ReadingTurn[]; active_task_id?: Id }` |
| `task.prepare` | `{ operation_id: Id } & TaskInput` | `{ confirmation_id: Id; transfers: Transfer[] }` |
| `task.start` | `{ operation_id: Id; confirmation_id: Id } & TaskInput` | `StartResult`，阅读问答另返回 `scope_id: Id` |
| `discovery.latest` | `{ topic_id: Id }` | `{ search_id?: Id; active_task_id?: Id }` |
| `discovery.get` | `{ topic_id: Id; search_id: Id }` | `DiscoveryResult`，含当前候选状态 |
| `candidate.decide` | `{ operation_id: Id, topic_id: Id, search_id: Id, candidate_id: Id, decision: CandidateAction }` | `CandidateResult` |
| `library.list` | `{ topic_id?: Id }` | `{ items: LibraryItem[] }` |
| `source.read_abstract` | `{ topic_id: Id; source_version_id: Id }` | `AbstractView` |
| `evidence.locate` | `{ topic_id: Id; message_id: Id; anchor_id: Id }` | `{ anchor: AbstractAnchor; source: AbstractView }` |
| `discovery.steps` | `{ task_id: Id }` | `{ steps: DiscoveryStep[] }` |

改名保留原有标识与内容。名称去除首尾空白后须为 1–160 字符。对象不存在或会话不属于指定主题时，返回未找到错误。手动保存的会话标题优先于首条问题。

`task.subscribe`、`task.get`、`task.cancel` 见[共用协议 §4](protocol.md#4-任务与事件)，其中 `R` 取 `TaskResult`。

```ts
type CandidateAction = 'pending' | 'hold' | 'exclude' | 'add'
type CandidateDecision = Exclude<CandidateAction, 'add'> | 'added'

type TaskInput = DiscoveryInput | ReadingInput
type DiscoveryInput = {
  topic_id: Id
  kind: 'discovery'
  input: { query: NonEmptyText; filters?: { year_from?: number; year_to?: number } }
       | { previous_search_id: Id }
}
type ReadingInput = {
  topic_id: Id
  session_id: Id
  kind: 'reading_qa'
  input: {
    question: NonEmptyText
    sources: NonEmpty<{ paper_id: Id; source_version_id: Id; requested_scope: RequestedScope }>
  }
}
type Transfer = { endpoint: NonEmptyText; purpose: NonEmptyText; data_categories: NonEmpty<NonEmptyText> }
type ReadingTurn = { task_id: Id; question: NonEmptyText; answer: ReadingResult }
type CandidateResult = { candidate_id: Id } & (
  | { decision: 'pending' | 'hold' | 'exclude' }
  | ({ decision: 'added'; link_status: 'linked' | 'already_linked'; paper_id: Id } & SourceVersion)
)
type LibraryItem = { paper_id: Id; title: NonEmptyText; topic_ids: Id[]; source_versions: NonEmpty<SourceVersion> }
type AbstractView = {
  paper_id: Id
  source_version_id: Id
  passages: NonEmpty<{ passage_id: Id; text: NonEmptyText }>
}
type AbstractAnchor = {
  anchor_id: Id
  paper_id: Id
  source_version_id: Id
  read_scope: 'abstract'
  quote: NonEmptyText
  location: { view: 'abstract'; precision: 'paragraph'; passage_id: Id; text_excerpt: NonEmptyText }
}
```

- 主题、会话创建后立即可读。列表先显示最近创建的项。发现任务归属主题，每个主题只允许一个在途 Discover。问答归属会话，每个会话只允许一个在途问答。`discovery.latest` 返回最近提交结果的检索 ID 和在途任务 ID，缺哪项就省略哪项。`session.get` 按提交顺序返回已保存的问答及在途任务 ID。
- `task.prepare` 返回要发送的数据类别、端点和用途，同时绑定输入、材料版本、会话上下文与服务配置。发现任务在用户确认数据去向后调用 `task.start`，主题会话问答由发送操作直接触发准备和启动。确认单只用于一次成功启动；绑定内容变更须重新准备。相同 `operation_id` 的已接受启动优先重放。任务内补搜和读取沿用确认单范围。
- `library.list` 省略主题时返回个人库，指定主题时只返回该主题的论文。每篇论文一条，版本按新到旧排列。首版整表返回，分页随 Library 规模评估。

### 1.2 检索与候选

- 新检索只支持发表年份筛选。上下限为 `1` 至 `9999` 的整数，含边界，起始年不得晚于结束年。启用筛选时跳过年份未知的条目。会议有来源才展示。遇到不支持的筛选字段返回 `INVALID_PARAMS`。
- Refine 只传同主题的 `previous_search_id`，沿用父轮的问题和筛选。启动时复制父轮的有效排除集合。后续恢复只影响当前轮和此后从它启动的子轮。独立新检索不继承排除。只有规范化 DOI、arXiv 标识或同源稳定 ID 一致时才自动匹配；题名相似的候选照常显示。
- `task.get` 的搜索结果保留提交时的候选状态。`discovery.get` 返回当前状态。`candidates` 为可见候选，`excluded` 为可恢复的排除清单。继承且未再次命中的排除项也有本轮候选 ID，便于恢复。

| 当前 `decision` | 请求 `decision` | 结果 |
|---|---|---|
| `pending`、`hold`、`exclude` | `pending`、`hold`、`exclude` | 更新候选去向，返回 `candidate_id` 和更新后的 `decision`。相同状态可重复提交。 |
| `pending`、`hold`、`exclude` | `add` | 写入或复用论文，并关联主题。新关联为 `linked`，已有关系为 `already_linked`。成功后返回 `added` 和论文版本。 |
| `added` | `add` | 返回 `already_linked` 和该候选对应的材料版本。 |
| `added` | `pending`、`hold`、`exclude` | 返回 `INVALID_TRANSITION`。移出主题走独立操作，该操作随 Library 管理功能细化。 |

- Add 保存候选当时的材料。内容相同就复用版本，摘要变化则创建新版本。只有元数据也可加入，界面须标明此版本没有可读摘要。已在主题中的论文显示为 `added`，关联始终只有一条。移出主题后候选恢复为可加入状态。
- 可靠标识互相冲突时留下复核记录，论文和主题关联保持原状。同键重试返回原记录。首版提示该篇未加入，用户可处理其他候选。完整复核界面随 Library 导入交付。

### 1.3 任务结果与事件

```ts
type Candidate = {
  candidate_id: Id; title: NonEmptyText; authors: NonEmptyText[]; doi?: NonEmptyText; year?: number
  venue?: { name: NonEmptyText; source: NonEmptyText }; metadata_url: string; abstract?: NonEmptyText
  reason: NonEmptyText; available_scope: AvailableScope; read_scope: ReadScope; decision: CandidateDecision
}
type DiscoveryResult = {
  search_id: Id; candidates: Candidate[]; excluded: Candidate[]
  coverage: { searched_angles: NonEmptyText[]; gaps: NonEmptyText[] }
}
type DiscoveryStep =
  | { action: 'search'; query: NonEmptyText; source: NonEmptyText; observation: NonEmptyText }
  | { action: 'search_again' | 'stop'; reason: NonEmptyText }
type ReadingResult = {
  scope_id: Id
  message_id: Id
  read_sources: ReadSource[]
  sentences: NonEmpty<{ text: NonEmptyText } & (
    | { assessment: 'supported'; anchor_ids: NonEmpty<Id> }
    | { assessment: 'evidence_not_established'; anchor_ids: [] }
  )>
}
type ReadSource = { source_version_id: Id; read_scope: ReadScope }
type TaskResult = DiscoveryResult | ReadingResult
type MainlineTaskEvent = TaskEvent<TaskResult,
  | { type: 'discovery.step'; payload: DiscoveryStep }
  | { type: 'answer.delta'; payload: { text: string } }
>
```

- Discover 进度为 `searching`。Agent 根据实际候选和缺口决定补搜或结束。步骤先保存，再推送 `discovery.step`，`discovery.steps` 按发生顺序读回。空结果可以完成，缺口记入 `coverage.gaps`。候选的 `metadata_url` 为来源的 HTTP(S) 地址。
- Read & Ask 进度为 `reading`。输入版本不得重复，须属于指定论文及当前主题，拒绝对仅有书目的版本请求摘要。服务在启动时固定阅读范围。近期已保存问答可帮助理解追问，引用只能来自本轮实际读过的版本。
- `answer.delta` 发送非空增量，前端按序原样拼接，仅用于预览。正式回答逐句标注证据，引句须在对应段落中核实。定位失败的出处不得生成锚点。没有有效支持的句子标为 `evidence_not_established`。
- 问答的 `completed` 和 `partial` 都保存正式回答，并逐一报告实际阅读范围。请求摘要而证据不足时可完成。请求全文但材料不足时，有可用摘要回答才返回 `partial`，否则 `failed`，两者都报 `FULL_TEXT_REQUIRED`。失败时用 `issue.details.read_sources` 报告已读范围。取消不保存预览为正式产物。
- 模型中断或返回无效输出且尚无正式回答时，以 `failed` 结束。首次读取前失败时，所选来源的范围均为 `none`。已有有效回答但预算终止时，保存回答并以 `partial` 结束。`issue` 保留失败原因和重试建议，`issue.details.read_sources` 列出本轮实际阅读范围，失败任务仍可按任务 ID 查阅。`full_text` 表示读取过来自全文的片段。
- `source.read_abstract` 校验当前主题关联，返回该版本全部摘要段落。`evidence.locate` 校验锚点属于指定主题中的该条回答，返回当时的完整摘要和目标段落。论文移出主题后，仍可通过历史回答打开原版本。

### 1.4 本主线错误

通用错误见[共用协议 §5](protocol.md#5-错误)。

| 场景 | RPC `code` | `reason` | `retryable` | `next_action` |
|---|---:|---|---|---|
| 候选动作不允许 | -32009 | `INVALID_TRANSITION` | false | `refresh_data` |
| 身份冲突，`details.review_id` 为复核记录 ID | -32010 | `IDENTITY_CONFLICT` | false | `skip_candidate` |
| 原材料已不可读 | -32011 | `SOURCE_UNAVAILABLE` | false | `restore_source` |
| 确认单缺失、已用或不匹配 | -32012 | `CONFIRMATION_REQUIRED` | false | `confirm_task` |
| 已有在途任务，`details.task_id` 为在途任务 ID | -32013 | `TASK_IN_PROGRESS` | false | `open_task` |
| 搜索或模型暂时不可用 | — | `SEARCH_UNAVAILABLE` / `MODEL_UNAVAILABLE` | true | `retry` |
| 服务认证失败 | — | `SERVICE_AUTH_FAILED` | false | `configure_service` |
| 服务配额用完 | — | `SERVICE_QUOTA_EXHAUSTED` | false | `check_quota` |
| 问答所需全文不可用 | — | `FULL_TEXT_REQUIRED` | false | `attach_full_text` |

## 2. 主线联调样例

用 PubMedQA 的题名、书目和一条公开摘要引句构造固定样例。摘要其余文字、端点和运行记录均为联调用数据。桌面联调使用已验证的搜索源与模型各一个，服务名留在配置中。搜索源需返回稳定论文标识、发表年和可用摘要，模型需能产生可核查的步骤与出处。 [PubMedQA 发表记录](https://aclanthology.org/D19-1259/)

### 桌面端 OpenAlex 检索

沿用发现任务、订阅和候选操作。确认单展示 OpenAlex 目的地与实际查询条件。DiscoveryResult 可附 provider，候选可附 provider 和 source_id。会议筛选只检查关键词结果第一页内明确标为会议的来源，覆盖与缺口写入 coverage。无结果以 completed 返回空列表。SERVICE_TIMEOUT、SERVICE_RATE_LIMITED、SERVICE_NOT_CONFIGURED、SERVICE_UNAVAILABLE 和 SERVICE_INVALID_RESPONSE 以任务失败返回，已取消的任务丢弃迟到结果。桌面样例可通过启动环境显式启用。

### 2.1 发现论文

创建主题与会话，确认数据去向，再启动检索。首次未命中，Agent 补搜后找到 PubMedQA。

```jsonl
{"jsonrpc":"2.0","id":"r1","method":"topic.create","params":{"operation_id":"op1","title":"科学问答数据集"}}
{"jsonrpc":"2.0","id":"r1","result":{"topic_id":"t1"}}
{"jsonrpc":"2.0","id":"r2","method":"session.create","params":{"operation_id":"op2","topic_id":"t1"}}
{"jsonrpc":"2.0","id":"r2","result":{"topic_id":"t1","session_id":"s1"}}
{"jsonrpc":"2.0","id":"r3","method":"task.prepare","params":{"operation_id":"op-r3","topic_id":"t1","kind":"discovery","input":{"query":"哪些科学问答数据集使用论文摘要？","filters":{"year_from":2019,"year_to":2022}}}}
{"jsonrpc":"2.0","id":"r3","result":{"confirmation_id":"cf1","transfers":[{"endpoint":"https://search.example.org","purpose":"查找相关论文","data_categories":["研究问题与检索词"]},{"endpoint":"https://model.example.org","purpose":"判断覆盖与候选相关性","data_categories":["研究问题","候选书目和摘要"]}]}}
{"jsonrpc":"2.0","id":"r4","method":"task.start","params":{"operation_id":"op-r4","confirmation_id":"cf1","topic_id":"t1","kind":"discovery","input":{"query":"哪些科学问答数据集使用论文摘要？","filters":{"year_from":2019,"year_to":2022}}}}
{"jsonrpc":"2.0","id":"r4","result":{"task_id":"k1","run_id":"run1","status":"queued"}}
{"jsonrpc":"2.0","id":"r5","method":"task.subscribe","params":{"task_id":"k1","after_seq":0}}
{"jsonrpc":"2.0","id":"r5","result":{"task_id":"k1"}}
{"jsonrpc":"2.0","method":"task.event","params":{"task_id":"k1","run_id":"run1","event_seq":1,"type":"discovery.step","payload":{"action":"search","query":"scientific question answering datasets","source":"联调搜索源","observation":"未找到明确使用摘要的候选"}}}
{"jsonrpc":"2.0","method":"task.event","params":{"task_id":"k1","run_id":"run1","event_seq":2,"type":"discovery.step","payload":{"action":"search_again","reason":"补查明确用摘要作上下文的数据集"}}}
{"jsonrpc":"2.0","method":"task.event","params":{"task_id":"k1","run_id":"run1","event_seq":3,"type":"discovery.step","payload":{"action":"search","query":"biomedical question answering datasets using abstracts","source":"联调搜索源","observation":"找到 PubMedQA"}}}
{"jsonrpc":"2.0","method":"task.event","params":{"task_id":"k1","run_id":"run1","event_seq":4,"type":"discovery.step","payload":{"action":"stop","reason":"找到带摘要依据的相关数据集"}}}
{"jsonrpc":"2.0","method":"task.event","params":{"task_id":"k1","run_id":"run1","event_seq":5,"type":"task.finished","payload":{"status":"completed","result":{"search_id":"sr1","candidates":[{"candidate_id":"c1","title":"PubMedQA: A Dataset for Biomedical Research Question Answering","authors":["Qiao Jin","Bhuwan Dhingra","Zhengping Liu","William Cohen","Xinghua Lu"],"doi":"10.18653/v1/D19-1259","year":2019,"venue":{"name":"EMNLP-IJCNLP","source":"ACL Anthology"},"metadata_url":"https://aclanthology.org/D19-1259/","abstract":"PubMedQA is a biomedical QA dataset.\n\nIt uses the corresponding abstract without its conclusion.","reason":"数据集以论文摘要为问答材料","available_scope":"abstract","read_scope":"abstract","decision":"pending"}],"excluded":[],"coverage":{"searched_angles":["生物医学摘要问答"],"gaps":[]}}}}}
```

排除后点 Refine，用同样的确认与启动流程，输入换成 `{"previous_search_id":"sr1"}`。若首批结果已满足目标，步骤可以直接记录停止。

### 2.2 加入主题并读回 Library

Add 后用 `discovery.get` 读回最新状态。旧任务结果仍保留 `pending`。

```jsonl
{"jsonrpc":"2.0","id":"r6","method":"candidate.decide","params":{"operation_id":"op-add","topic_id":"t1","search_id":"sr1","candidate_id":"c1","decision":"add"}}
{"jsonrpc":"2.0","id":"r6","result":{"candidate_id":"c1","decision":"added","link_status":"linked","paper_id":"p1","source_version_id":"v1","available_scope":"abstract"}}
{"jsonrpc":"2.0","id":"r7","method":"discovery.get","params":{"topic_id":"t1","search_id":"sr1"}}
{"jsonrpc":"2.0","id":"r7","result":{"search_id":"sr1","candidates":[{"candidate_id":"c1","title":"PubMedQA: A Dataset for Biomedical Research Question Answering","authors":["Qiao Jin","Bhuwan Dhingra","Zhengping Liu","William Cohen","Xinghua Lu"],"doi":"10.18653/v1/D19-1259","year":2019,"venue":{"name":"EMNLP-IJCNLP","source":"ACL Anthology"},"metadata_url":"https://aclanthology.org/D19-1259/","abstract":"PubMedQA is a biomedical QA dataset.\n\nIt uses the corresponding abstract without its conclusion.","reason":"数据集以论文摘要为问答材料","available_scope":"abstract","read_scope":"abstract","decision":"added"}],"excluded":[],"coverage":{"searched_angles":["生物医学摘要问答"],"gaps":[]}}}
{"jsonrpc":"2.0","id":"r8","method":"library.list","params":{"topic_id":"t1"}}
{"jsonrpc":"2.0","id":"r8","result":{"items":[{"paper_id":"p1","title":"PubMedQA: A Dataset for Biomedical Research Question Answering","topic_ids":["t1"],"source_versions":[{"source_version_id":"v1","available_scope":"abstract"}]}]}}
```

### 2.3 阅读问答

提交主题会话问题时，客户端通过 `library.list` 读取该主题的当前文献库，把有摘要或正文的版本作为 `sources`。发送即启动本次问答，客户端在 `task.prepare` 成功后使用返回的 `confirmation_id` 调用 `task.start`。

```jsonl
{"jsonrpc":"2.0","id":"r9","method":"task.prepare","params":{"operation_id":"op-r9","topic_id":"t1","session_id":"s1","kind":"reading_qa","input":{"question":"PubMedQA 提供给模型的上下文是什么？","sources":[{"paper_id":"p1","source_version_id":"v1","requested_scope":"abstract"}]}}}
{"jsonrpc":"2.0","id":"r9","result":{"confirmation_id":"cf2","transfers":[{"endpoint":"https://model.example.org","purpose":"回答论文问题","data_categories":["本轮问题和近期会话","已选论文摘要"]}]}}
{"jsonrpc":"2.0","id":"r10","method":"task.start","params":{"operation_id":"op-r10","confirmation_id":"cf2","topic_id":"t1","session_id":"s1","kind":"reading_qa","input":{"question":"PubMedQA 提供给模型的上下文是什么？","sources":[{"paper_id":"p1","source_version_id":"v1","requested_scope":"abstract"}]}}}
{"jsonrpc":"2.0","id":"r10","result":{"task_id":"k2","run_id":"run2","status":"queued","scope_id":"sc1"}}
{"jsonrpc":"2.0","id":"r11","method":"task.subscribe","params":{"task_id":"k2","after_seq":0}}
{"jsonrpc":"2.0","id":"r11","result":{"task_id":"k2"}}
{"jsonrpc":"2.0","method":"task.event","params":{"task_id":"k2","run_id":"run2","event_seq":1,"type":"task.progress","payload":{"stage":"reading","message":"查阅 PubMedQA 摘要"}}}
{"jsonrpc":"2.0","method":"task.event","params":{"task_id":"k2","run_id":"run2","event_seq":2,"type":"answer.delta","payload":{"text":"上下文是对应论文去掉结论后的摘要。"}}}
{"jsonrpc":"2.0","method":"task.event","params":{"task_id":"k2","run_id":"run2","event_seq":3,"type":"task.finished","payload":{"status":"completed","result":{"scope_id":"sc1","message_id":"m1","read_sources":[{"source_version_id":"v1","read_scope":"abstract"}],"sentences":[{"text":"上下文是对应论文去掉结论后的摘要。","assessment":"supported","anchor_ids":["a1"]}]}}}}
```

### 2.4 点击出处定位原文

读取原摘要版本，跳到 `anchor.location.passage_id`。直接打开论文时用 `source.read_abstract`，结果形状与下例的 `source` 相同。

```jsonl
{"jsonrpc":"2.0","id":"r12","method":"evidence.locate","params":{"topic_id":"t1","message_id":"m1","anchor_id":"a1"}}
{"jsonrpc":"2.0","id":"r12","result":{"anchor":{"anchor_id":"a1","paper_id":"p1","source_version_id":"v1","read_scope":"abstract","quote":"the corresponding abstract without its conclusion","location":{"view":"abstract","precision":"paragraph","passage_id":"v1-p2","text_excerpt":"It uses the corresponding abstract without its conclusion."}},"source":{"paper_id":"p1","source_version_id":"v1","passages":[{"passage_id":"v1-p1","text":"PubMedQA is a biomedical QA dataset."},{"passage_id":"v1-p2","text":"It uses the corresponding abstract without its conclusion."}]}}}
```

## 3. 重试与异常样例

### 3.1 幂等、重连和重启读回

Add 超时后用原 `operation_id` 重发。问答只收到序号 2 时，可从该序号补收终态。重启后从主题和会话列表进入，读回这条回答。

```jsonl
{"jsonrpc":"2.0","id":"r13","method":"candidate.decide","params":{"operation_id":"op-add","topic_id":"t1","search_id":"sr1","candidate_id":"c1","decision":"add"}}
{"jsonrpc":"2.0","id":"r13","result":{"candidate_id":"c1","decision":"added","link_status":"linked","paper_id":"p1","source_version_id":"v1","available_scope":"abstract"}}
{"jsonrpc":"2.0","id":"r14","method":"task.subscribe","params":{"task_id":"k2","after_seq":2}}
{"jsonrpc":"2.0","id":"r14","result":{"task_id":"k2"}}
{"jsonrpc":"2.0","method":"task.event","params":{"task_id":"k2","run_id":"run2","event_seq":3,"type":"task.finished","payload":{"status":"completed","result":{"scope_id":"sc1","message_id":"m1","read_sources":[{"source_version_id":"v1","read_scope":"abstract"}],"sentences":[{"text":"上下文是对应论文去掉结论后的摘要。","assessment":"supported","anchor_ids":["a1"]}]}}}}
{"jsonrpc":"2.0","id":"r15","method":"session.get","params":{"topic_id":"t1","session_id":"s1"}}
{"jsonrpc":"2.0","id":"r15","result":{"turns":[{"task_id":"k2","question":"PubMedQA 提供给模型的上下文是什么？","answer":{"scope_id":"sc1","message_id":"m1","read_sources":[{"source_version_id":"v1","read_scope":"abstract"}],"sentences":[{"text":"上下文是对应论文去掉结论后的摘要。","assessment":"supported","anchor_ids":["a1"]}]}}]}}
```

### 3.2 冲突、缺全文和来源丢失

冲突和来源丢失各自替换正常响应。缺全文另开任务，本例未得到有用的部分回答，所以以失败结束。

```jsonl
{"jsonrpc":"2.0","id":"r6","error":{"code":-32010,"message":"论文身份有冲突","data":{"reason":"IDENTITY_CONFLICT","retryable":false,"next_action":"skip_candidate","details":{"review_id":"ir1"}}}}
{"jsonrpc":"2.0","id":"r16","method":"task.prepare","params":{"operation_id":"op-r16","topic_id":"t1","session_id":"s1","kind":"reading_qa","input":{"question":"请查阅正文，说明详细标注流程。","sources":[{"paper_id":"p1","source_version_id":"v1","requested_scope":"full_text"}]}}}
{"jsonrpc":"2.0","id":"r16","result":{"confirmation_id":"cf3","transfers":[{"endpoint":"https://model.example.org","purpose":"回答论文问题","data_categories":["本轮问题和近期会话","已选论文摘要"]}]}}
{"jsonrpc":"2.0","id":"r17","method":"task.start","params":{"operation_id":"op-r17","confirmation_id":"cf3","topic_id":"t1","session_id":"s1","kind":"reading_qa","input":{"question":"请查阅正文，说明详细标注流程。","sources":[{"paper_id":"p1","source_version_id":"v1","requested_scope":"full_text"}]}}}
{"jsonrpc":"2.0","id":"r17","result":{"task_id":"k3","run_id":"run3","status":"queued","scope_id":"sc2"}}
{"jsonrpc":"2.0","id":"r18","method":"task.subscribe","params":{"task_id":"k3","after_seq":0}}
{"jsonrpc":"2.0","id":"r18","result":{"task_id":"k3"}}
{"jsonrpc":"2.0","method":"task.event","params":{"task_id":"k3","run_id":"run3","event_seq":1,"type":"task.finished","payload":{"status":"failed","issue":{"reason":"FULL_TEXT_REQUIRED","retryable":false,"next_action":"attach_full_text","details":{"read_sources":[{"source_version_id":"v1","read_scope":"abstract"}]}}}}}
{"jsonrpc":"2.0","id":"r12","error":{"code":-32011,"message":"原摘要不可读","data":{"reason":"SOURCE_UNAVAILABLE","retryable":false,"next_action":"restore_source"}}}
```

联调还须走查：直接停止与主动补搜、Refine 排除与恢复、授权端点变化、重启读回与晚到响应、移出主题后旧出处仍可打开。读完摘要却缺证据时，界面显示证据未确立；仅有书目的版本不可用于摘要问答。
