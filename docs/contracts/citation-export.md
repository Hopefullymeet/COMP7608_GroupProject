# 稿件、引用建议、回查与成果交接

通信与授权见[协议](protocol.md)。下表 T={topic_id:Id}，V=T & {draft_id:Id,version_id:Id}，W={operation_id:Id}。材料使用 [file.pick](library-reading.md) 的本地句柄。历史版本只读。

| 方法 | params | result / 行为 |
|---|---|---|
| draft.import | W,T，加 {file_id:Id} 或 {name:string,text:string} | Manuscript；接收 .md/.tex/.docx，粘贴输入使用 Markdown。返回拆分论述与已识别引用键；无法解析的字段列在 warnings |
| draft.list | T | {items:Manuscript[]}；包括各历史稿本与该版本的建议、检查及审阅 |
| task.prepare → task.start | kind=citation_suggest 或 citation_audit，T，input:{draft_id,version_id,sentence_ids:Id[],source_versions:Id[]} | 建议从所选主题材料检索，可显式扩展个人库；回查限定当前引文目标或用户指定来源。阶段 identify、read、assess；终态 {record_id:Id}，读回对应稿本。范围和端点更改须重新确认 |
| audit.review | W,V,{report_id,finding_id,decision:'accept' 或 'reject' 或 'defer'} | {finding_id:Id}；审阅历史稿本只影响其检查意见，保留模型判断 |
| draft.apply_suggestions | W,V,{report_id,finding_id,apply:'wording' 或 'citation' 或 'both'} | Manuscript；验证当前稿本与原位置，生成新快照。只修改所采纳部分，源文件保留。重新检查新版本才生成新意见 |
| export.create | W,T,{format:'manuscript' 或 'audit_report' 或 'notes' 或 'comparison_csv' 或 'bibliography' 或 'evidence',draft_id?:Id,version_id?:Id,report_id?:Id,include_originals:boolean} | {name:string,saved:boolean,text?:string}；宿主本地选址生成独立文件或材料包，取消 saved=false。浏览器示例返回文本供下载。报告包含已查、待查、阻塞、局部支持范围、原文摘录与版本 |

~~~~ts
type Manuscript={draft_id:Id,name:string,format:'markdown'|'latex'|'word',write_mode:'copy'|'patch'|'positions',versions:Snapshot[]}
type Snapshot={version_id:Id,sentences:{id:Id,text:string,cites:string[]}[],warnings:string[],reports:Report[]}
type Report={report_id:Id,kind:'citation_audit'|'citation_suggest',complete:boolean,model:string,findings:Finding[]}
type Finding={finding_id:Id,sentence_id:Id,claims:{text:string,source_version_id?:Id,status:'supported'|'conflict'|'evidence_not_established'|'blocked',anchor_ids:Id[],limit:string}[],decision?:'accept'|'reject'|'defer',proposal?:{text:string,cites:string[],bibliography:string[],anchor_ids:Id[],scope:string}}
~~~~

versions 新到旧；reports 新到旧。每句的所有子论述在其全部目标范围得到支持才展示 Supported。任务交付、模型评估、人工审阅和稿件修改各自保存。缺材料时使用 partial 加可读报告。回查不能为缺少的目标自动换来源。变动跨度或证据版本不能验证复用时须重查；仅改变书目显示不改变模型判断。

示例：t1 的 related.md 稿本 v1 句 s1 引用 PubMedQA p1，但句中还含全文推论。审计任务 a1 的序号 1..3 为 identify/read/assess，4 为 completed；s1 的摘要论述 supported(a1-anchor)，全文推论 evidence_not_established。用户 accept 意见后原句保持 v1；预览限缩措辞、引文、书目和锚点后选择 wording 得到 v2，需独立重查。若旧版本已变化，apply 返回 -32020 STALE_REVISION；引用缺失时提示另开 citation_suggest。Word 插件字段无法安全写回时返回 positions 报告，LaTeX 导出位置补丁并保留键，Markdown 导出副本及书目，原文件保持可恢复。
