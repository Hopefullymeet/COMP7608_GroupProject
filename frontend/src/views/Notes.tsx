import { useEffect, useRef, useState } from 'react'
import { Dialog } from '../../../prototype/src/components/PageHead'
import type { Located, Note } from '../api/library'
import { useRead, useWorkspace } from '../data/Workspace'

export function EvidenceLink({id}:{id:string}) {
  const {api,report}=useWorkspace()
  const [item,setItem]=useState<Located>()
  const p=item?.source.passages.find(p=>p.passage_id===item.passage_id)
  return <><button className="link-btn" onClick={()=>void api.call('evidence.open',{anchor_id:id}).then(setItem).catch(report)}>View source</button>
    {item&&<Dialog title="Source evidence" onClose={()=>setItem(undefined)}><p>{item.source.source_version_id} · {item.read_scope.replace('_',' ')} · {p?.section}{p?.page?' · p. '+p.page:''}</p>
      <blockquote>{item.quote}</blockquote><p>{p?.text}</p>{p?.page? <button className="ghost-btn" onClick={()=>void api.call('source.original',{source_version_id:item.source.source_version_id,page:p.page}).catch(report)}>Open original page</button>:null}</Dialog>}</>
}
function Editor({topic,note,close}:{topic:string;note?:Note;close:()=>void}) {
  const {write,report}=useWorkspace()
  const [text,setText]=useState(note?.text??''),[anchors,setAnchors]=useState(note?.anchor_ids??[])
  const [add,setAdd]=useState(''),[status,setStatus]=useState('')
  const previous=useRef(note), ongoing=useRef<Promise<void>>()
  const current=useRef({text,anchors});current.current={text,anchors}
  async function save() {
    if(ongoing.current)await ongoing.current
    const entry=previous.current, draft=current.current
    if(!draft.text.trim()||(draft.text===entry?.text&&JSON.stringify(draft.anchors)===JSON.stringify(entry.anchor_ids)))return
    setStatus('Saving…')
    const request=write('note.save',{topic_id:topic,note_id:entry?.note_id,base_revision:entry?.revision,session_id:entry?.session_id,
      text:draft.text,anchor_ids:draft.anchors,origin:'user'}).then(n=>{previous.current=n;setStatus('Saved')})
    ongoing.current=request
    try{await request}finally{ongoing.current=undefined}
  }
  const saveRef=useRef(save);saveRef.current=save
  useEffect(()=>{const timer=setTimeout(()=>void saveRef.current().catch(report),850);return ()=>clearTimeout(timer)},[text,anchors,report])
  const done=()=>void save().then(close).catch(report)
  return <Dialog title="Research note" onClose={done}><textarea aria-label="Note text" rows={6} value={text} onChange={e=>{setText(e.target.value);setStatus('Edited')}}/>
    <div>{anchors.map(a=><EvidenceLink key={a} id={a}/>)}</div><label>Insert source anchor <input value={add} onChange={e=>setAdd(e.target.value)}/></label>
    <button className="link-btn" disabled={!add.trim()||anchors.includes(add.trim())} onClick={()=>{setAnchors([...anchors,add.trim()]);setAdd('')}}>Insert</button>
    {previous.current?.history.map(h=><details key={h.revision}><summary>Revision · {h.revision}</summary><p>{h.text}</p><button className="link-btn" onClick={()=>{setText(h.text);setAnchors(h.anchor_ids)}}>Restore this version</button></details>)}
    <div className="dialog-actions"><small role="status">{status}</small><button className="primary" onClick={done}>Done</button></div></Dialog>
}
export function Notes({topic}:{topic:string}) {
  const result=useRead('note.list',{topic_id:topic},!!topic)
  const [edit,setEdit]=useState<Note|'new'>(),[query,search]=useState('')
  return <section className="card lib-detail"><h2>Research notes</h2>{!topic?<p>Select a working topic to open its notes.</p>:<>
    <div className="lib-tools"><input aria-label="Search notes" placeholder="Search text, session or source" value={query} onChange={e=>search(e.target.value)}/><button className="primary" onClick={()=>setEdit('new')}>New note</button></div>
    {result?.items.filter(n=>[n.text,n.session_id,...n.anchor_ids].join(' ').toLowerCase().includes(query.toLowerCase())).map(n=><article className="card" key={n.note_id}><small>{n.origin} · {n.revision}</small><p>{n.text}</p>
      {n.anchor_ids.map(a=><EvidenceLink key={a} id={a}/>)} <button className="link-btn" onClick={()=>setEdit(n)}>Edit note</button></article>)}
    {edit&&<Editor topic={topic} note={edit==='new'?undefined:edit} close={()=>setEdit(undefined)}/>}</>}</section>
}
