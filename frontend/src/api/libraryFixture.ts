import { PAPERS } from '../../../prototype/src/data/fixtures'
import type { Evidence, LibraryItem, Session, Topic } from './contract'
import { asEntry, asLocated, type ImportTask, type LibraryFixture, type LibraryMethods, type Located, type Note } from './library'

export type Handlers<T> = { [K in keyof T]: T[K] extends [infer P,infer R] ? (params:P)=>R : never }
export type FixtureState = { library:LibraryItem[]; shelf:LibraryFixture; topics:Topic[]; sessions:Record<string,Session[]> }
const id = () => crypto.randomUUID()
export function libraryFixture(state:FixtureState, evidence:Evidence) {
  const data = state.shelf
  const original = asLocated(evidence)
  const unavailable = ():never => { throw new Error('Source unavailable. Restore the original version in Library.') }
  function lookup(anchor:string): Located {
    const item = anchor === original.anchor_id ? original : data.anchors[anchor]
    if (!item || !state.library.some(p=>p.source_versions.some(v=>v.source_version_id===item.source.source_version_id))) unavailable()
    return item
  }
  function attach(file:string,paperId:string,topic?:string) {
    const sample = PAPERS[file]
    const version = id()
    const scope = sample?.stored==='excerpt' ? 'full_text' : sample ? 'abstract' : 'metadata'
    const ref = {source_version_id:version,available_scope:scope} as const
    let paper = state.library.find(p=>p.paper_id===paperId)
    if (!paper) {
      paper = {paper_id:paperId,title:sample?.title ?? file,topic_ids:[],source_versions:[ref]}
      state.library.push(paper)
    } else paper.source_versions.unshift(ref)
    if (topic && !paper.topic_ids.includes(topic)) paper.topic_ids.push(topic)
    const entry = data.entries[paperId] ??= {}
    entry.identity = sample?.doi ?? sample?.externalId ?? 'Identity pending'
    entry.authors = sample?.authors ?? []
    entry.changes = ['New source version · '+version]
    entry.files = paper.source_versions.map(v=>({source_version_id:v.source_version_id,name:v.source_version_id===version?file+'.pdf':paper!.title,role:v.available_scope}))
    if (!sample) return
    const doc = {paper_id:paperId,source_version_id:version,passages:sample.passages.map(p=>({
      passage_id:p.id,section:p.section,page:scope==='abstract'?0:p.page,text:p.text
    }))}
    data.documents[version]=doc
    for (const p of doc.passages) {
      const anchor_id=version+'/'+p.passage_id
      data.anchors[anchor_id]={anchor_id,source:doc,passage_id:p.passage_id,quote:p.text,read_scope:scope==='abstract'?'abstract':'full_text'}
    }
  }
  function importPapers(task:ImportTask) {
    const paper_ids:string[]=[], review_ids:string[]=[]
    for(const file of task.input.files) {
      const existing=state.library.find(p=>p.paper_id===task.input.paper_id || p.title===PAPERS[file]?.title || p.title===file)
      if(existing) {
        const review_id=id()
        data.reviews.push({review_id,paper_id:existing.paper_id,name:file,reason:'Possible new version. Confirm paper identity before linking.',topic_id:task.input.topic_id})
        review_ids.push(review_id)
      } else {
        const paper=id()
        attach(file,paper,task.input.topic_id)
        paper_ids.push(paper)
      }
    }
    return {paper_ids,review_ids}
  }
  function batch(ids:string[],source:LibraryItem[]) {
    const selected=source.filter(p=>ids.includes(p.paper_id))
    if(!selected.length || selected.length!==new Set(ids).size) throw new Error('Selection changed. Refresh the library.')
    return selected
  }
  function impact(ids:string[]) {
    const selected=batch(ids,[...state.library,...data.trash])
    const versions=selected.flatMap(p=>p.source_versions.map(v=>v.source_version_id))
    const references=selected.flatMap(p=>p.topic_ids.map(t=>({kind:'Topic',label:state.topics.find(x=>x.topic_id===t)?.title??t})))
    for(const n of Object.values(data.notes).flat()) {
      if(n.anchor_ids.some(a=>versions.includes((data.anchors[a]??original).source.source_version_id))) references.push({kind:n.origin,label:n.text})
    }
    return {references,revision:JSON.stringify([selected,references])}
  }
  const handlers:Handlers<LibraryMethods>={
    'file.pick':({purpose})=>({files:purpose==='papers'?['qasper','multivers'].map(file_id=>({file_id,name:file_id+'.pdf'})):purpose==='draft'?[{file_id:'related-work.md',name:'related-work.md'}]:[]}),
    'library.catalog':()=>({papers:state.library.map(p=>asEntry(p,data)),trash:data.trash.map(p=>asEntry(p,data)),reviews:data.reviews}),
    'library.resolve_import':({review_id,decision})=>{
      const r=data.reviews.find(x=>x.review_id===review_id)
      if(!r) throw new Error('Review already resolved.')
      if(decision==='link') batch([r.paper_id],state.library)
      const paper_id=decision==='link'?r.paper_id:id()
      attach(r.name,paper_id,r.topic_id)
      data.reviews=data.reviews.filter(x=>x!==r)
      return {paper_id}
    },
    'library.organize':({paper_ids,action,value})=>{
      if(!value.trim()) throw new Error('Choose a topic or enter a tag.')
      const selected=batch(paper_ids,state.library)
      for(const p of selected) {
        const entry=data.entries[p.paper_id]??={}
        const list=action==='link'||action==='unlink'?p.topic_ids:(entry.tags??=[])
        if(action==='link'||action==='tag') { if(!list.includes(value)) list.push(value) }
        else if(list.includes(value)) list.splice(list.indexOf(value),1)
      }
      return {changed:selected.length}
    },
    'library.impact':({paper_ids})=>impact(paper_ids),
    'library.trash':({paper_ids,revision})=>{
      if(impact(paper_ids).revision!==revision) throw new Error('References changed. Preview the impact again.')
      data.trash.push(...batch(paper_ids,state.library))
      state.library=state.library.filter(p=>!paper_ids.includes(p.paper_id))
      return {changed:paper_ids.length}
    },
    'library.restore':({paper_ids})=>{
      state.library.push(...batch(paper_ids,data.trash))
      data.trash=data.trash.filter(p=>!paper_ids.includes(p.paper_id))
      return {changed:paper_ids.length,warnings:[]}
    },
    'library.purge':({paper_ids,revision,clear_excerpts})=>{
      if(impact(paper_ids).revision!==revision) throw new Error('References changed. Review the selection again.')
      const selected=batch(paper_ids,data.trash)
      const anchors=Object.values({...data.anchors,[original.anchor_id]:original}).filter(a=>paper_ids.includes(a.source.paper_id)).map(a=>a.anchor_id)
      if(clear_excerpts) for(const n of Object.values(data.notes).flat()) for(const v of [n,...n.history]) {
        if(v.anchor_ids.some(a=>anchors.includes(a))) v.text='Excerpt removed by user.'
      }
      for(const p of selected) for(const v of p.source_versions) delete data.documents[v.source_version_id]
      for(const a of anchors) delete data.anchors[a]
      data.trash=data.trash.filter(p=>!paper_ids.includes(p.paper_id))
      return {changed:selected.length}
    },
    'workspace.archived':()=>({items:data.archive.filter(a=>!data.archive.some(t=>t.kind==='topic'&&t.id===a.topic_id))}),
    'workspace.archive':({kind,id})=>{
      const topic=state.topics.find(t=>t.topic_id===id)
      const parent=Object.entries(state.sessions).find(([,ss])=>ss.some(s=>s.session_id===id))
      const title=kind==='topic'?topic?.title:parent?.[1].find(s=>s.session_id===id)?.title
      if(!title) throw new Error('Item unavailable.')
      if(!data.archive.some(a=>a.id===id)) data.archive.push({kind,id,title,topic_id:parent?.[0]})
      return {id}
    },
    'workspace.unarchive':({id})=>{data.archive=data.archive.filter(a=>a.id!==id);return {id}},
    'source.read':({source_version_id,topic_id})=>{
      if(!state.library.some(p=>p.topic_ids.includes(topic_id)&&p.source_versions.some(v=>v.source_version_id===source_version_id))) unavailable()
      return data.documents[source_version_id]??(source_version_id==='v1'?original.source:unavailable())
    },
    'source.original':()=>{throw new Error('The fixture includes passages only. Connect a desktop host to open the original PDF.')},
    'evidence.open':({anchor_id})=>lookup(anchor_id),
    'reader.position':({topic_id,source_version_id})=>({passage_id:data.positions[topic_id+'/'+source_version_id]}),
    'reader.bookmark':({topic_id,source_version_id,passage_id})=>{data.positions[topic_id+'/'+source_version_id]=passage_id;return {passage_id}},
    'note.list':({topic_id})=>({items:data.notes[topic_id]??[]}),
    'note.save':({topic_id,note_id,base_revision,text,origin,anchor_ids,session_id})=>{
      const items=data.notes[topic_id]??=[]
      const prev=items.find(n=>n.note_id===note_id)
      if(note_id&&(!prev||prev.revision!==base_revision)) throw new Error('Note changed. Reopen its current revision.')
      const history=prev?[...prev.history,{revision:prev.revision,text:prev.text,anchor_ids:prev.anchor_ids,origin:prev.origin}]:[]
      const note:Note={note_id:note_id??id(),revision:id(),text,origin,anchor_ids,session_id,history}
      data.notes[topic_id]=[note,...items.filter(n=>n!==prev)]
      return note
    }
  }
  return {handlers,importPapers,lookup}
}
