# 资料库、主题与阅读

沿用[共用协议](protocol.md)和[发现与问答](discover-read-locate.md)的类型。W 表示必填的 operation_id；所有批量写入原子提交。宿主在本地管理文件；WebView 只传用户选择的文件句柄。

| 方法 | 参数（对象） | 结果与用途 |
|---|---|---|
| file.pick | purpose: 'papers' 或 'draft' 或 'backup' | {files: {file_id:Id,name:string}[]}，用户取消返回空数组，文件限制由 purpose 决定。桌面文件选择器多选论文，稿件和备份单选 |
| library.catalog | {} | {papers: Paper[], reviews: Review[], trash: Paper[]}，按标题排序，客户端搜索、分段显示 |
| task.prepare → task.start (paper_import) | kind, input:{files:Id[],topic_id?:Id,paper_id?:Id}；start 带确认单 | 依次报告 inspect、match、commit 和终态；结果 {paper_ids:Id[],review_ids:Id[]}。指定论文时补材料版本，指定主题时加入主题 |
| library.resolve_import | W, review_id, decision:'link' 或 'separate' | {paper_id:Id}；链接新增版本，保留原版本和锚点。身份冲突或模糊匹配必须复核 |
| library.organize | W, paper_ids:Id[], action:'tag'、'untag'、'link' 或 'unlink', value:string | {changed:number}；value 是标签或主题 ID。移出仅删除所选关联 |
| library.impact | paper_ids:Id[] | {references:{kind:string,label:string}[], revision:Id}，按主题、笔记、引用、比较、稿件等列出影响 |
| library.trash | W, paper_ids, revision | {changed:number}；影响有变化报 STALE_REVISION，须重新预览 |
| library.restore | W, paper_ids | {changed:number,warnings:string[]}；恢复原版本与仍存在的主题，缺失关联逐条说明 |
| library.purge | W, paper_ids, clear_excerpts:boolean, revision | {changed:number}；只对已在回收站的材料有效，单独预览确认，保留书目和历史判断 |
| workspace.archive | W, kind:'topic' 或 'session', id | {id:Id}；隐藏主题及其中会话或单个会话，保留可恢复的历史、材料与成果 |
| workspace.archived | {} | {items:{id:Id,kind:'topic' 或 'session',title:string}[]}；主题已归档时隐藏子会话 |
| workspace.unarchive | W, kind,id | {id:Id}；恢复原归属与保存的成果 |
| source.read | topic_id,source_version_id | Document；按指定版本返回结构化正文、章节、页和抽取警告 |
| source.original | source_version_id,page?:number | {opened:boolean}；宿主打开当前版本本地 PDF；无原件报 SOURCE_UNAVAILABLE |
| reader.position | topic_id,source_version_id | {passage_id?:Id} |
| reader.bookmark | W,topic_id,source_version_id,passage_id | {passage_id:Id}；保存继续阅读位置 |
| evidence.open | anchor_id | Located；按版本解析，失效报 ANCHOR_UNAVAILABLE，禁止回退至新版 |
| note.list | topic_id | {items:Note[]}；含历史版本，可按问题、会话及来源筛选 |
| note.save | W,topic_id,note_id?:Id,base_revision?:Id,text:string,anchor_ids:Id[],session_id?:Id,origin:'user' 或 'answer' 或 'comparison' 或 'citation' | Note；新建或追加修订，支持插入引用、自动保存及以旧版内容生成恢复版本 |

~~~~ts
type Paper = LibraryItem & {authors:string[], identity:string, tags:string[], changes:string[], files:{source_version_id:Id,name:string,role:string}[]}
type Review = {review_id:Id,paper_id:Id,name:string,reason:string}
type Document = {paper_id:Id,source_version_id:Id,passages:{passage_id:Id,section:string,page:number,text:string,warning?:string}[]}
type Located = {anchor_id:Id,source:Document,passage_id:Id,quote:string,read_scope:RequestedScope,
  rect?:{page:number,x:number,y:number,width:number,height:number}}
type Revision = {revision:Id,text:string,anchor_ids:Id[],origin:string}
type Note = Revision & {note_id:Id,session_id?:Id,history:Revision[]}
~~~~

继续研究使用以下兼容字段。session.list 的每项可附 updated_at（ISO 8601）、has_turns；session.get 可附 reader:{source_version_id,passage_id?}。reader.position 与 reader.bookmark 可带 session_id，在主题内按会话保存；省略时沿用主题书签。evidence.open 在传入旧版本锚点时始终返回原版本；用于稿件、笔记与比较时也能读回段落和页码。note.save 成功后用 note.list 读回来源、编辑身份和旧版内容，恢复到旧措辞生成一次新修订。

批量选候选沿用 candidate.decide，一项一个操作键，部分失败时保留成功项并显示余项原因。检索结果中的候选可带 change:'new' 或 'updated'，无字段表示无比较基线或无变化；主线在 Refine 或监测后按此标注。重新打开 topic 时可按 task.history 找回跨客户端的步骤。workspace.activity 定位到旧版本时应保留其证据和修订历史。

全文坐标相对旋转后页面左上角归一化至 [0,1]，页序从 1 开始。摘要 page 为 0。reading_qa 支持 full_text 和可选 input.selection:{source_version_id,passage_id,quote}，服务端校验原句。全文回答沿用原句级 anchor_ids；evidence.locate 对全文返回 Located，摘要保持旧响应。笔记文本变化后支持关系待重查。

示例：选择 pubmedqa.pdf 得到 f1，paper_import 的 task_id=t1，序号 1、2、3 报 inspect、match、commit，4 为 completed，result={paper_ids:[],review_ids:["r1"]}。r1 指向 p1，确认 link 后读取 p1 的 v2，通过 evidence.open(a2) 回到 v2 第 2 页的 passage p2；note.save 将 a2 存入 n1。若 v2 已删除则返回 SOURCE_UNAVAILABLE，用户可在回收站恢复。缺解析时导入可 partial，并保留成功项。空选择、未知文件句柄或跨主题选择报 INVALID_PARAMS / NOT_FOUND；过期修订统一报 -32020 STALE_REVISION，next_action=refresh_data。
