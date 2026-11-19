import { useState } from 'react'
import { useStore } from '../../../prototype/src/data/store'
import { Dialog, PageHead } from '../../../prototype/src/components/PageHead'
import { useRead, useWorkspace } from '../data/Workspace'
import type { Decision, ExportFormat, Finding, Report } from '../api/citation'
import { EvidenceLink } from './Notes'
import { TopicSelect } from './ResearchPages'

function Manuscripts({topic}:{topic:string}) {
  const {api,write,prepare,busy,report:err,demo}=useWorkspace()
  const items=useRead('draft.list',{topic_id:topic})?.items??[]
  const papers=useRead('library.catalog',{})?.papers??[]
  const {state}=useStore()
  const target=state.route.view==='check'?state.route:undefined
  const [docId,pickDoc]=useState(target?.draftId??''),[version,pickVersion]=useState(''),[reportId,pickReport]=useState('')
  const [selected,setSelected]=useState<string[]|null>(target?.sentenceId?[target.sentenceId]:null),[sources,setSources]=useState<string[]|null>(null),[extend,setExtend]=useState(false)
  const [creating,create]=useState(false),[name,setName]=useState('related-work.md'),[body,setBody]=useState('')
  const [preview,setPreview]=useState<Finding>(),[apply,setApply]=useState<'citation'|'wording'|'both'>('both')
  const [format,setFormat]=useState<ExportFormat>('audit_report'),[pdfs,include]=useState(false),[status,setStatus]=useState('')
  const doc=items.find(d=>d.draft_id===docId)??items[0]
  const v=doc?.versions.find(v=>v.version_id===version)??doc?.versions[0]
  const report=v?.reports.find(r=>r.report_id===reportId)??v?.reports[0]
  const available=papers.filter(p=>extend||p.topic_ids.includes(topic)).flatMap(p=>p.source_versions.map(v=>({id:v.source_version_id,title:p.title,scope:v.available_scope})))
  const versions=(sources??available.map(x=>x.id)).filter(id=>available.some(x=>x.id===id))
  const sentences=v?.sentences.filter(s=>!selected||selected.includes(s.id)).map(s=>s.id)??[]
  function selectDoc(id:string) {pickDoc(id);pickVersion('');pickReport('');setSelected(null);setStatus('')}
  const toggle=(ids:string[],id:string)=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]
  async function pick() {
    const {files}=await api.call('file.pick',{purpose:'draft'})
    if(!files[0])return
    const d=await write('draft.import',{topic_id:topic,file_id:files[0].file_id});selectDoc(d.draft_id);create(false)
  }
  function task(kind:Report['kind']) {
    if(!doc||!v)return
    pickReport('');void prepare({kind,topic_id:topic,input:{draft_id:doc.draft_id,version_id:v.version_id,sentence_ids:sentences,source_versions:versions}})
  }
  async function download() {
    const result=await write('export.create',{topic_id:topic,draft_id:doc?.draft_id,version_id:v?.version_id,report_id:report?.report_id,format,include_originals:pdfs})
    if(result.text!==undefined&&result.saved) {
      const url=URL.createObjectURL(new Blob([result.text],{type:'text/plain;charset=utf-8'}))
      const link=document.createElement('a');link.href=url;link.download=result.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
    }
    setStatus(result.saved?'Exported '+result.name:'Export cancelled.')
  }
  function review(f:Finding,decision:Decision) {
    if(!doc||!v||!report)return
    void write('audit.review',{topic_id:topic,draft_id:doc.draft_id,version_id:v.version_id,report_id:report.report_id,finding_id:f.finding_id,decision}).catch(err)
  }
  return <><div className="lib-tools"><button className="primary" onClick={()=>create(true)}>Add manuscript</button>
    {doc&&<><select aria-label="Manuscript" value={doc.draft_id} onChange={e=>selectDoc(e.target.value)}>{items.map(d=><option key={d.draft_id} value={d.draft_id}>{d.name}</option>)}</select>
    <select aria-label="Manuscript version" value={v?.version_id} onChange={e=>{pickVersion(e.target.value);pickReport('');setSelected(null)}}>{doc.versions.map((v,i)=><option key={v.version_id} value={v.version_id}>Version {doc.versions.length-i}{i?'':' · current'}</option>)}</select></>}</div>
    {v&&doc&&<><section className="card result-card"><h2>{doc.name}</h2><p>{doc.format} · {doc.write_mode} · {v.version_id}</p>{v.warnings.map(w=><p key={w}>{w}</p>)}
      {v.sentences.map(s=><label key={s.id} className="check-row"><input type="checkbox" checked={sentences.includes(s.id)} onChange={()=>setSelected(toggle(sentences,s.id))}/>{s.text} <small>{s.cites.map(c=>'[@'+c+']').join(' ')}</small></label>)}
      <h3>Source scope</h3><label className="check-row"><input type="checkbox" checked={extend} onChange={e=>{setExtend(e.target.checked);setSources(versions)}}/>Include other papers from Library</label>
      {available.map(a=><label className="check-row" key={a.id}><input type="checkbox" checked={versions.includes(a.id)} onChange={()=>setSources(toggle(versions,a.id))}/>{a.title} · {a.scope} · {a.id}</label>)}
      <div className="lib-tools"><button className="primary" disabled={busy||!sentences.length} onClick={()=>task('citation_audit')}>Run citation check</button><button className="ghost-btn" disabled={busy||!sentences.length||!versions.length} onClick={()=>task('citation_suggest')}>Find citation suggestions</button></div></section>
      {!v.reports.some(r=>r.kind==='citation_audit')&&<p className="review-banner">This version needs an independent citation check.</p>}
      {report&&<><select aria-label="Report" value={report.report_id} onChange={e=>pickReport(e.target.value)}>{v.reports.map((r,i)=><option key={r.report_id} value={r.report_id}>{r.kind} · {v.reports.length-i}</option>)}</select>
      <p>{report.complete?'Check complete':'Partial coverage'} · {report.model} · {report.findings.filter(f=>f.decision).length}/{report.findings.length} findings reviewed</p>
      {report.findings.map(f=><section className="card result-card" key={f.finding_id}><h3>{v.sentences.find(s=>s.id===f.sentence_id)?.text}</h3>
        <span className="tag">{report.kind==='citation_suggest'?(f.proposal?'Source found · awaiting your choice':'No suggestion'):f.claims.length&&f.claims.every(c=>c.status==='supported')?'Supported':'Coverage incomplete'}</span>
        {f.claims.map((c,i)=><p key={i}><strong>{c.status.replaceAll('_',' ')}</strong> · {c.text}<br/><small>{c.source_version_id} · {c.limit}</small> {c.anchor_ids.map(a=><EvidenceLink key={a} id={a}/>)}</p>)}
        <div className="lib-tools">{report.kind==='citation_audit'&&(['accept','reject','defer'] as const).map(d=><button className="ghost-btn sm" disabled={busy||f.decision===d} key={d} onClick={()=>review(f,d)}>{f.decision===d?'✓ ':''}{d} finding</button>)}
          {f.proposal&&v===doc.versions[0]&&<button className="ghost-btn" onClick={()=>{setPreview(f);setApply('both')}}>Preview revision</button>}</div></section>)}</>}</>}
    <section className="card result-card"><h3>Export</h3><div className="lib-tools"><select aria-label="Export format" value={format} onChange={e=>setFormat(e.target.value as ExportFormat)}>{['manuscript','audit_report','notes','comparison_csv','bibliography','evidence'].map(f=><option key={f} value={f}>{f.replaceAll('_',' ')}</option>)}</select>
      <label><input type="checkbox" disabled={demo} checked={pdfs} onChange={e=>include(e.target.checked)}/> Include original PDFs</label><button className="ghost-btn" disabled={busy||(format==='audit_report'&&!report)||(format==='manuscript'&&!doc)} onClick={()=>void download().catch(err)}>Export file</button></div><small role="status">{status}</small></section>
    {creating&&<Dialog title="Add manuscript" onClose={()=>create(false)}><button className="ghost-btn" onClick={()=>void pick().catch(err)}>{demo?'Open sample manuscript':'Choose Markdown, LaTeX or Word file'}</button>
      <p>Or paste Markdown</p><input aria-label="Manuscript name" value={name} onChange={e=>setName(e.target.value)}/><textarea aria-label="Manuscript text" value={body} onChange={e=>setBody(e.target.value)} rows={5}/>
      <button className="primary" disabled={busy||!body.trim()||!name.trim()} onClick={()=>void write('draft.import',{topic_id:topic,name,text:body}).then(d=>{selectDoc(d.draft_id);create(false);setBody('')}).catch(err)}>Add draft</button></Dialog>}
    {preview?.proposal&&v&&doc&&report&&<Dialog title="Preview manuscript revision" onClose={()=>setPreview(undefined)}><p>Current · {v.sentences.find(s=>s.id===preview.sentence_id)?.text}</p>
      <p>Proposed · {preview.proposal.text}</p><p>Citation · {preview.proposal.cites.join(', ')}</p><p>Bibliography · {preview.proposal.bibliography.join('; ')}</p><p>{preview.proposal.scope} {preview.proposal.anchor_ids.map(a=><EvidenceLink key={a} id={a}/>)}</p>
      <select aria-label="Apply changes" value={apply} onChange={e=>setApply(e.target.value as typeof apply)}><option value="wording">Wording only</option><option value="citation">Citation only</option><option value="both">Wording and citation</option></select>
      <button className="primary" disabled={busy} onClick={()=>void write('draft.apply_suggestions',{topic_id:topic,draft_id:doc.draft_id,version_id:v.version_id,report_id:report.report_id,finding_id:preview.finding_id,apply}).then(d=>{pickVersion(d.versions[0].version_id);pickReport('');setSelected(null);setPreview(undefined)}).catch(err)}>Apply to new version</button></Dialog>}</>
}
export function CitationPage(){
  const {state}=useStore(),[topic,setTopic]=useState((state.route.view==='check'&&state.route.topicId)||state.topics[0]?.id||'')
  return <div className="page"><PageHead title="Citation check" icon="shield" sub="Check a manuscript against its selected sources"><TopicSelect value={topic} onChange={setTopic}/></PageHead><div className="page-body scroll">{topic?<Manuscripts topic={topic} key={topic}/>:<p>Select a topic to add a manuscript.</p>}</div></div>
}
