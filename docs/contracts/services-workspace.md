# 服务、授权、恢复和持续研究

沿用[共用协议](protocol.md)及 task.prepare 的 Transfer。W 表示 operation_id。服务端决定可用提供者、能力与测试结果，WebView 读取脱敏的配置。密钥仅经宿主系统钥匙串设置。所有端点、用途、选定版本在确认前显示。

| 方法 | params | result 与行为 |
|---|---|---|
| services.get | {} | Config；返回配置、提供者列表、筛选能力及解析器状态 |
| services.save | W,base_revision,model_id,models:Model[],services:Service[],budget:Budget,ask_before_overage:boolean | Config；只更新可编辑字段。过期版本报 STALE_REVISION，影响后续任务 |
| services.test | W,id:Id | {ok:boolean,message:string}；测试已保存模型、来源或解析器。认证、网络或配额问题分别显示 |
| services.credentials | {id:Id,action:'save',api_key:string} 或 {id:Id,action:'delete'} | {configured:boolean,stored:boolean}；更新系统凭据库，响应只含状态 |
| access.list | {} | {offers:Offer[],grants:Grant[]}；offer 绑定在途 task、目的地、用途与已授权版本 |
| access.grant | W,offer_id | Grant；确认展示材料清单后派发只读材料包，过期报 GRANT_EXPIRED |
| access.revoke | W,grant_id | {revoked:boolean}；撤销后停止派发与提交迟到结果，期限至任务终止 |
| backup.create | W | {name:string,saved:boolean}；选择本地目标并生成包含版本、文件和校验清单的快照 |
| backup.inspect | file_id | {preview_id:Id,valid:boolean,summary:string,issues:string[]}；不改工作区 |
| backup.restore | W,preview_id | {restored:boolean}；确认后核验原清单与文件，成功后原子切换并重新读回。校验失败或在途任务时保留原工作区 |
| discovery.watch | W,topic_id,search_id,interval_days:number | {interval_days:number}；绑定已确认检索范围。0 停用，正整数为间隔天数；授权失效时产生待确认事项 |
| workspace.activity | {topic_id?:Id} | {items:Activity[],watches:{topic_id:Id,search_id:Id,interval_days:number}[]}；包含新增/变化、受影响句子、待办与可恢复检查点 |
| task.prepare → task.start，resume | {kind:'resume',topic_id,input:{checkpoint_id:Id}} | 新 task_id，沿用已提交操作的唯一标识。阶段 validate、resume；终态 {record_id:Id}。输入版本、预算和授权须重新核对；检查点过期提示重开 |
| file.stage_drop | W,paths:string[] | {files:{file_id:Id,name:string}[]}；仅接受桌面宿主近期原生拖放事件的路径，核对来源与文件类型。浏览器 fixture 只保存名称 |

### 桌面端当前接入

- `services.get` 返回一个 DeepSeek 选项。用 `credential_configured` 表示宿主是否提供凭据。连接是否可用以测试结果为准。
- `services.save` 保存模型 ID、OpenAI 兼容的 HTTP(S) 基础地址、预算与超限询问偏好，响应返回已保存配置。基础地址不含凭据、查询参数和片段。无效地址或预算返回 `INVALID_PARAMS`，修改服务列表返回 `SETTINGS_READ_ONLY`，旧版本返回 `STALE_REVISION`。新任务确认显示实际端点，端点或模型变化后尚未启动的任务需要重新确认。已启动的任务沿用确认时的端点与模型。桌面任务目前按运行时限制执行。
- `services.test` 使用已保存的端点、模型 ID 和当前凭据直接发送固定的 Chat Completions 请求。测试无需 Harness，也不读取工作区资料。相同 `operation_id` 复用第一次结果。
- Windows 与 macOS 宿主返回 `credential_store=true`。系统凭据优先，其次使用启动环境中的密钥。凭据操作可安全重复且不写操作日志。平台不支持时返回 `CREDENTIALS_HOST_REQUIRED`，系统存储操作失败时返回 `CREDENTIAL_STORE_FAILED`。Windows 凭据管理器拒绝访问时使用当前用户的 DPAPI 加密存储。保存和移除均在回读确认后返回状态。

~~~~ts
type Model={id:Id,label:string,model:string,endpoint:string,local:boolean,credential_configured:boolean,credential_store?:boolean,credential_stored?:boolean}
type Service={id:Id,label:string,kind:'search'|'parser',enabled:boolean,status:string,fields:string[]}
type Budget={calls:number|null,tokens:number|null,minutes:number|null,cost:number|null} // null 表示不限，四项默认均为 null。金额单位为 USD，数值上限非负，调用和 token 用整数。
type Config={revision:Id,model_id:Id,models:Model[],services:Service[],budget:Budget,ask_before_overage:boolean}
type Offer={offer_id:Id,task_id:Id,endpoint:string,purpose:string,source_versions:Id[],estimated_usage:string}
type Grant=Offer & {grant_id:Id,status:'active'|'revoked'|'expired'}
type Activity={id:Id,topic_id:Id,title:string,detail:string,target:'library'|'read'|'discover'|'compare'|'wiki'|'check',paper_id?:Id,session_id?:Id,draft_id?:Id,sentence_id?:Id,checkpoint_id?:Id}
~~~~

扩展 discovery.filters.venue 为可选非空字符串，仅在启用来源声明 venue 能力时开放。只纳入具有可核验会议元数据的命中；缺失会议字段计入覆盖缺口。task.prepare 可附 budget:Budget、source_versions:Id[]，用于展示预算与确切材料；单次超限时保存检查点和部分成果，用户在恢复前确认预算。discovery.latest 可带 task_id 对应已完成检索，供其他客户端读步骤。文件恢复和来源更新按实际依赖产生 Activity。

样例：PubMedQA 主题 t1 的搜索 s1 设置每 7 天检查。v1 更新为 v2 后 activity 指向受影响的稿件 d1 / 句 s1。外部只读提议 o1 指定 v1 和任务 t2，用户确认获得 g1，access.revoke(g1) 返回 revoked=true，先前传出的片段不会被撤回。中断后的 checkpoint c1 重新确认，序号 1 validate、2 resume、3 completed；预算不足返回 partial 及已提交记录。备份 b1 检查缺少 v1 时 valid=false 并列出问题，restore 拒绝且原库保留。
