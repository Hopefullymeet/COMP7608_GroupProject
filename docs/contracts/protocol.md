# PaperTrace 共用协议 v0.4

各主线共用的通信、任务、错误与定位规则。业务依据见[项目书](../source/PaperTrace_Project_Book_ZH.md)，通信依据见[技术书](../source/PaperTrace_Technical_Book_ZH.md)。

## 1. 通信与类型写法

- 沿用技术书的 JSON-RPC 2.0 桌面方案。每条消息一行 UTF-8 JSON。请求带字符串 `id`，响应回传同一 `id`，包含 `result` 或 `error`。事件是无 `id` 的 `task.event` 通知。业务字段用 `snake_case`。
- Tauri 宿主通过标准输入输出与 Python 通信，Python 日志写到 stderr。连接时调用 `protocol.version`，传 `{}`，返回 `{ major: number; minor: number }`。首版为 `0.4`。主版本不同则拒绝接入，开发期宿主与 Python 仍按同一版本联调。
- 契约用 TypeScript 写法描述 JSON 数据。`?` 表示可省略，其余字段必填。字段均不接受 `null`，缺失的可选值省略。列表可为空，标为 `NonEmpty<T>` 的列表至少有一项。状态及字符串枚举区分大小写。

```ts
type Id = string                // 服务端生成、不透明的非空字符串
type NonEmptyText = string      // 去掉首尾空白后非空
type NonEmpty<T> = [T, ...T[]]
type RequestedScope = 'abstract' | 'full_text'
type AvailableScope = 'metadata' | RequestedScope   // 材料可用范围
type ReadScope = 'none' | RequestedScope            // 任务实际阅读范围
type SourceVersion = { source_version_id: Id; available_scope: AvailableScope }
```

## 2. 标识与版本

服务端生成稳定字符串 ID。`session_id` 属于一个 `topic_id`，`candidate_id` 属于一次 `search_id`。`paper_id` 标识论文，`source_version_id` 标识具体材料版本。同一论文可关联多个主题。材料可用范围与任务实际阅读范围分别记录。证据判断与用户采纳分别记录，用户决定关联哪个产物版本。

## 3. 写入与重试

- 写操作带客户端生成的 `operation_id`。同一方法、同一 `operation_id` 和参数重试时返回原结果，同一键用于不同参数时返回 `OPERATION_CONFLICT`。
- 请求超时或断线时，以新的 RPC `id` 重发相同方法、参数与 `operation_id`。并发重发只执行一次，已提交的操作重放原响应。暂时性故障且未提交时可用相同键重试。参数变更用新键。
- 任务已接受但运行失败时，用新 `operation_id` 重开，重发旧键只返回原任务。读操作可直接重查。
- 入库与主题关联一次提交，同一主题和论文的关联唯一。只有可靠标识匹配才自动复用论文记录，身份冲突由用户确认。

## 4. 任务与事件

| 方法 | `params` | `result` |
|---|---|---|
| `task.start` | `{ operation_id: Id, kind, ... }`，各 `kind` 的输入由主线定义 | `StartResult`，主线可追加必填字段 |
| `task.subscribe` | `{ task_id: Id, after_seq: number }` | `{ task_id: Id }` |
| `task.get` | `{ task_id: Id }` | `TaskSnapshot<R>` |
| `task.cancel` | `{ operation_id: Id; task_id: Id }` | `{ task_id: Id; status: Finished<R>['status'] }` |

```ts
type StartResult = { task_id: Id; run_id: Id; status: 'queued' }
type Issue = { reason: string; retryable: boolean; next_action: string; details?: Record<string, unknown> }
type Finished<R> =
  | { status: 'completed'; result: R }
  | { status: 'partial'; result: R; issue: Issue }
  | { status: 'failed'; issue: Issue }
  | { status: 'cancelled'; result?: R }
type TaskSnapshot<R> = { task_id: Id; run_id: Id; last_event_seq: number } & (
  { status: 'queued' | 'running' } | Finished<R>
)
// Extra 为主线追加的事件类型；stage 取值由主线限定
type TaskEvent<R, Extra = never> = { task_id: Id; run_id: Id; event_seq: number } & (
  | { type: 'task.progress'; payload: { stage: string; message: NonEmptyText } }
  | { type: 'task.finished'; payload: Finished<R> }
  | Extra
)
```

- 状态为 `queued → running →` 一个终态。启动后直接失败或取消时可从 `queued` 进入终态。
- `task.finished` 每次运行只发一次，且是该次运行最后一个事件。持久结果须先于结束通知可读，`task.get` 与通知返回同样的结果。流式增量只用于预览，结束后以持久化的 `result` 为准。
- `task.subscribe` 传最后已连续处理的 `after_seq`（首次为 `0`），先确认订阅，再按序补发较新的事件并继续推送。`event_seq` 在同一任务内从 1 连续递增，前端用 `task_id` 和 `event_seq` 去重。`after_seq`、`last_event_seq` 为非负整数。
- 游标大于已记录序号时返回 `INVALID_CURSOR`。所需历史已过期时返回 `EVENT_HISTORY_UNAVAILABLE`，前端先调用 `task.get`：已结束则渲染终态；仍在执行则清除不完整的流式预览，从快照的 `last_event_seq` 继续订阅。
- 前端为每次订阅传入 Tauri Channel。宿主确认订阅后向该 Channel 转发事件；重连换用新 Channel，从最后连续处理的序号补收。运行中保留全部事件，终态后默认保留 24 小时。事件过期后仍可读取已提交的结果。
- 取消先停止派发新工作，并尝试中止在途调用。取消与产物提交由服务端决定先后：先提交则返回原终态，先取消则返回 `cancelled`，晚到的响应不得再提交产物。进程重启时，把未提交且无法继续的任务结为 `failed`，原因为 `PROCESS_INTERRUPTED`。首版重试开启新任务。
- 每条消息的大小上限、调用超时和任务预算可配置，部署默认值通过联调验证。大文件通过文件标识交接。

### 4.1 工作区的任务记录

task.history({topic_id?:Id}) 返回 {items:Run[]}，按开始时间倒序排列。每个 Run 包含 task_id、run_id、kind、label、status、started_at（ISO 8601）、steps 和可选 topic_id、session_id、usage、checkpoint_id。steps 为 {kind:'plan'|'tool'|'observe'|'decide'|'stop',title:string,detail:string}[]；usage 为 {calls,tokens,ms,cost}（均为非负数，cost 单位 USD）。queued/running 展示进行中；终态保留实际状态与从 task.get 读回的 Issue。客户端可查询同一工作区内的历史任务，随步骤更新或结束后刷新。找不到请求主题返回 NOT_FOUND；空工作区返回空数组。中断的任务可通过[检查点](services-workspace.md)另行确认恢复。

例：task.history({topic_id:"t1"}) 返回 task_id=t2 的 reading_qa，步骤先记录 plan 的选取 PubMedQA v1，再记录 tool 的摘要读取、observe 的已定位片段、stop 的理由；界面从 usage 读取实际调用与耗时。未记录用量时显示未知。订阅断线后仍可读这条运行记录。

## 5. 错误

RPC 拒绝返回 `error: { code: number; message: NonEmptyText; data: Issue }`。无有效请求可关联的 JSON-RPC 协议错误使用标准错误格式。接单后的异常写入 `task.finished.issue`。前端按 `reason` 处理。`retryable` 表示输入与前置条件维持现状时是否可直接重试。

- 格式或字段错误在接单前通过 RPC 返回。接单后的外部服务或模型故障通过终态返回：有可用产物时为 `partial`，否则为 `failed`。
- 在预算内做完计划或主动结束，可以用 `completed` 并报告缺口。已读完约定范围但证据不足时标 `evidence_not_established`。材料不足、超时或预算用完时，按是否有可用产物决定 `partial` 或 `failed`。

| 场景 | RPC `code` | `reason` | `retryable` | `next_action` |
|---|---:|---|---|---|
| 请求字段或值有误 | -32602 | `INVALID_PARAMS` | false | `correct_request` |
| 对象不存在或归属不符 | -32001 | `NOT_FOUND` | false | `refresh_data` |
| 同一写操作键对应不同参数 | -32002 | `OPERATION_CONFLICT` | false | `use_new_operation_id` |
| 订阅游标超过当前序号 | -32003 | `INVALID_CURSOR` | false | `refresh_task` |
| 所需事件已过期 | -32004 | `EVENT_HISTORY_UNAVAILABLE` | false | `refresh_task` |
| 暂时故障且操作未提交 | -32005 | `TEMPORARILY_UNAVAILABLE` | true | `retry` |
| 进程重启，原任务未提交 | — | `PROCESS_INTERRUPTED` | true | `retry` |
| 执行超时 | — | `TASK_TIMEOUT` | true | `retry` |
| 任务预算用完 | — | `TASK_BUDGET_EXHAUSTED` | false | `adjust_budget` |

主线专属的 `reason` 在各主线文档中列出。

## 6. 证据定位

`anchor_id` 绑定 `source_version_id` 和生成锚点的文本或解析记录。定位返回原句及可达位置。摘要可定位到段落，全文可定位到章节、页或矩形。页序从 1 开始，文本偏移按 Unicode 码点，范围左闭右开。原版本无法定位时报告原因。

