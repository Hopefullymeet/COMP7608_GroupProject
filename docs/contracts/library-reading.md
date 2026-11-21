# 资料库、主题与阅读

沿用[共用协议](protocol.md)和[发现与问答](discover-read-locate.md)的类型。W 表示必填的 operation_id；所有批量写入原子提交。宿主在本地管理文件；WebView 只传用户选择的文件句柄。

| 方法 | 参数（对象） | 结果与用途 |
|---|---|---|
| file.pick | purpose: 'papers' 或 'draft' 或 'backup' | {files: {file_id:Id,name:string}[]}，用户取消返回空数组，文件限制由 purpose 决定。桌面文件选择器多选论文，稿件和备份单选 |
| library.catalog | {} | {papers: Paper[], reviews: Review[], trash: Paper[]}，按标题排序，客户端搜索、分段显示 |
| task.prepare → task.start (paper_import) | kind, input:{files:Id[],topic_id?:Id,paper_id?:Id}；start 带确认单 | 依次报告 inspect、match、commit 和终态；结果 {paper_ids:Id[],review_ids:Id[]}。指定论文时补材料版本，指定主题时加入主题 |
| library.set_alias | W, topic_id, paper_id, alias:string | {paper_id:Id,alias:string}；论文须属于指定主题。去除首尾空白后最多 80 字符，空字符串清除别名 |
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
| reader.position | topic_id,source_version_id,session_id? | {passage_id?:Id,page?:number,zoom?:number,offset?:number} |
| reader.bookmark | W,topic_id,source_version_id,session_id?，以及 passage_id 或 {page,zoom,offset} | 保存段落或 PDF 阅读位置，回传保存结果 |
| evidence.open | anchor_id | Located；按版本解析，失效报 ANCHOR_UNAVAILABLE，禁止回退至新版 |
| note.list | topic_id | {items:Note[]}；含历史版本，可按问题、会话及来源筛选 |
| note.save | W,topic_id,note_id?:Id,base_revision?:Id,text:string,anchor_ids:Id[],session_id?:Id,origin:'user' 或 'answer' 或 'comparison' 或 'citation' | Note；新建或追加修订，支持插入引用、自动保存及以旧版内容生成恢复版本 |

论文别名随论文记录保存，各主题和版本共享。`library.list` 和 `library.catalog` 的论文条目可返回 `alias`。原标题、引用和版本 ID 保留原值。

~~~~ts
type Paper = LibraryItem & {authors:string[], identity:string, tags:string[], changes:string[], files:{source_version_id:Id,name:string,role:string}[]}
type Review = {review_id:Id,paper_id:Id,name:string,reason:string}
type Document = {paper_id:Id,source_version_id:Id,passages:{passage_id:Id,section:string,page:number,text:string,warning?:string}[]}
type Located = {anchor_id:Id,source:Document,passage_id:Id,quote:string,read_scope:RequestedScope,
  rect?:{page:number,x:number,y:number,width:number,height:number}}
type Revision = {revision:Id,text:string,anchor_ids:Id[],origin:string}
type Note = Revision & {note_id:Id,session_id?:Id,history:Revision[]}
~~~~

继续研究使用以下兼容字段。session.list 的每项可附 updated_at（ISO 8601）、has_turns。session.get 可附 reader，包含 source_version_id 和该版本的阅读位置。省略 session_id 时沿用主题书签。evidence.open 在传入旧版本锚点时始终返回原版本，用于稿件、笔记与比较时也能读回段落和页码。note.save 成功后用 note.list 读回来源、编辑身份和旧版内容，恢复到旧措辞生成一次新修订。

## 书目和 PDF 续读

| 方法 | 参数 | 响应 |
|---|---|---|
| `library.preview_identifier` | topic_id,identifier | {preview_id,topic_id,metadata,existing_paper_id?}。用 DOI 或 arXiv ID 查询公开书目。 |
| `library.commit_identifier` | W,topic_id,preview_id,paper_id? | {paper_id,source_version_id,available_scope,already_linked}。预览限当前主题。指定 paper_id 时补该论文的书目。 |
| `library.metadata` | topic_id,paper_id,edition_year? | {paper_id,revision,metadata,manual_fields,rankings} |
| `library.update_metadata` | W,topic_id,paper_id,base_revision,changes | 同上。版本冲突报 STALE_REVISION，标识符冲突报 IDENTIFIER_ALREADY_LINKED。 |

metadata 包含 title、authors，可附 year、venue、doi、arxiv_id、provider、metadata_url、source_id、issns、venue_type 和 publication_track。可编辑字段包括书目、ISSN、发表类型（journal、conference、preprint）和会议论文类别（regular、other）。手动字段优先于后续补全。无附件书目可用 `library.import_pdf` 加同一个 paper_id 上传。

### 发表场所的分区、收录和等级

`rankings.items` 每个体系一项，含 scheme、label、metric（quartile、index、rank）、status 和 entries。加载目录时附 edition、year 和 source_url。每条 entries 有 venue、venue_type、value、category、source_url、matched_by。分类适用于发表场所。日常显示各体系已加载的最新目录，传 edition_year 按目录年份查；年份不足时返回 catalog_missing。

| status | 页面含义 |
|---|---|
| matched | 找到匹配条目，同一体系可有多个学科 |
| catalog_missing | 对应年份或体系还未加载名录 |
| venue_unknown | 书目中缺少可匹配的刊名、会议名或 ISSN |
| not_found | 已加载名录里未匹配 |
| ambiguous | 名称歧义或目录结果有冲突 |
| not_applicable | 体系与发表类型不相符 |

期刊优先匹配 ISSN 或 eISSN。会议使用规范化全称和名录别名。CCF 会议附 `applicability`，`verify_track` 表示需要确认论文类别，已识别的 Findings、Workshop 等不显示主会等级。新导入 PDF 的首页若明确标出了刊名、会议名或 ISSN，可用于匹配。缺少字段时补正式书目或手动更正。数据准备见 [后端运行说明](../../backend/README.md#发表场所分区收录和等级)。

PDF 位置使用从 1 开始的 page、倍率 zoom（0.1 至 10）和归一化页内纵向 offset（0 至 1）。存储以主题、会话和论文版本为键，版本更新后仍可读取旧位置。传 passage_id 的旧写法继续可用。

批量选候选沿用 candidate.decide，一项一个操作键，部分失败时保留成功项并显示余项原因。检索结果中的候选可带 change:'new' 或 'updated'，无字段表示无比较基线或无变化；主线在 Refine 或监测后按此标注。重新打开 topic 时可按 task.history 找回跨客户端的步骤。workspace.activity 定位到旧版本时应保留其证据和修订历史。

全文坐标相对旋转后页面左上角归一化至 [0,1]，页序从 1 开始。摘要 page 为 0。reading_qa 支持 full_text 和可选 input.selection:{source_version_id,passage_id,quote}，服务端校验原句。全文回答沿用原句级 anchor_ids；evidence.locate 对全文返回 Located，摘要保持旧响应。笔记文本变化后支持关系待重查。

示例：选择 pubmedqa.pdf 得到 f1，paper_import 的 task_id=t1，序号 1、2、3 报 inspect、match、commit，4 为 completed，result={paper_ids:[],review_ids:["r1"]}。r1 指向 p1，确认 link 后读取 p1 的 v2，通过 evidence.open(a2) 回到 v2 第 2 页的 passage p2；note.save 将 a2 存入 n1。若 v2 已删除则返回 SOURCE_UNAVAILABLE，用户可在回收站恢复。缺解析时导入可 partial，并保留成功项。空选择、未知文件句柄或跨主题选择报 INVALID_PARAMS / NOT_FOUND；过期修订统一报 -32020 STALE_REVISION，next_action=refresh_data。
