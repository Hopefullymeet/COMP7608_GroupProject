import { useEffect, useState } from 'react'
import type { Wiki, WikiEdit } from '../api/wiki'
import { Dialog } from '../components/PageHead'
import { Icon } from '../components/Icon'
import { useLanguage } from '../i18n'
import type { WikiSource } from './WikiPage'
import './wiki-directory.css'

export function WikiDirectory({wiki, title, edit, Source, refresh, busy}: {wiki: Wiki; title: string; edit: (p: WikiEdit) => Promise<boolean>; Source: WikiSource['Source']; refresh:()=>void; busy:boolean}) {
  const {language} = useLanguage()
  const t = (zh: string, en: string) => language === 'zh-CN' ? zh : en
  const storageKey = 'papertrace.wiki.directory.' + wiki.topic_id
  const [location, navigate] = useState<{folder:string; page:string}>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}')
      return {folder:saved?.folder || '', page:saved?.page || ''}
    } catch { return {folder:'',page:''} }
  })
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(location)) } catch { /* private storage */ }
  }, [location,storageKey])
  const [editing, setEditing] = useState('')
  const [form, setForm] = useState<'map_add'|'map_rename'|'map_remove'>()
  const [text, setText] = useState('')
  const [subtree, setSubtree] = useState(false)
  const [saving, setSaving] = useState(false)
  const nodes = wiki.map_nodes ?? {}
  const folder = nodes[location.folder] ? location.folder : ''
  const target = form ? editing : folder
  const node = nodes[target]
  const root = wiki.map_title || wiki.headline || title
  const children = (id: string) => Object.values(nodes).filter(n => n.parent === id)
  const count = (id: string): number => children(id).reduce((total,n) => total + 1 + count(n.id), 0)
  const pages = wiki.documents?.[folder] ?? []
  const page = pages.find(p => p.id === location.page)
  const filed = new Set(pages.flatMap(p => p.entries))
  const trail: string[] = []
  for (let id=folder; nodes[id] && !trail.includes(id); id=nodes[id].parent) trail.unshift(id)
  const pageName = (p: typeof pages[number]) => p.title || (p.id === 'synthesis' ? t('跨论文综合','Across papers') : t('待核对来源','Sources to review'))
  function openForm(action: NonNullable<typeof form>, id:string) {
    setEditing(id)
    setText(action==='map_rename' ? nodes[id]?.title ?? root : '')
    setSubtree(false)
    setForm(action)
  }
  const actions = [
    ['map_add','plus',t('添加条目','Add entry')],
    ['map_rename','edit',t('编辑条目','Edit entry')],
    ['map_remove','trash',t('删除条目','Delete entry')],
  ] as const
  function controls(id:string) {
    return actions.filter(a=>id || a[0]!=='map_remove').map(([action,icon,label])=>
      <button key={action} className="icon-btn" title={label} aria-label={label} onClick={()=>openForm(action,id)}><Icon name={icon} size={14}/></button>)
  }
  function evidence(id:string) {
    const a=wiki.map_sources?.[id]
    return a && <div className="wiki-excerpt" key={id}><Source id={id} anchor={'wiki-doc-'+id} label={a.title+(a.page?' · p. '+a.page:'')}/><blockquote>{a.quote}</blockquote></div>
  }
  return <section className="wiki-directory">
    {(folder || page) && <nav className="wiki-path" aria-label={t('文档路径','Document path')}>
      <button onClick={()=>navigate({folder:'',page:''})}>{title}</button>
      {trail.map(id=><span key={id}><Icon name="chevronRight" size={12}/><button title={nodes[id].title} onClick={()=>navigate({folder:id,page:''})}>{nodes[id].title}</button></span>)}
      {page && <span><Icon name="chevronRight" size={12}/>{t('文档','Document')}</span>}
    </nav>}
    <header><h2>{page?pageName(page):nodes[folder]?.title || title}</h2>
      {!page && <div>{controls(folder)}</div>}</header>
    {!folder && !page && <>
      {root!==title && <p className="wiki-intro">{root}</p>}
      <small className="fine">{wiki.sources.papers} {t('篇论文','papers')}{wiki.generated_at && <> · {new Date(wiki.generated_at).toLocaleDateString()} · {wiki.generator.kind==='model'?wiki.generator.model:t('本地整理','Local summary')}</>}</small>
    </>}
    {!folder && !page && <section className="wiki-home-points">
      <header><h3>{t('研究要点','Research findings')}</h3>
        <button className="link-btn" disabled={busy} onClick={refresh}>{busy?t('整理中…','Updating…'):t('重新整理','Refresh findings')}</button></header>
      {(wiki.home_points ?? []).map(id=>{
        const entry=wiki.entries.find(e=>e.entry_id===id)
        if (!entry) return null
        const receipt=entry.home_receipt
        return <article className="wiki-finding" key={id}><p>{entry.text}</p>
          <details><summary>{t('依据与生成记录','Evidence and provenance')}</summary>
          <p>{receipt ? receipt.model+' · '+new Date(receipt.created).toLocaleString() :
            t('本地规则从已有研究记录中选取。','Selected locally from existing findings.')}</p>
          {receipt && <><p>{receipt.reason}</p><small>{t('整理批次','Run')} · {receipt.run_id}</small></>}
          {entry.anchor_ids.map(evidence)}</details></article>
      })}
      {!wiki.home_points?.length && <p className="fine">{t('有正文依据的研究要点会出现在这里。','Findings with full-text evidence appear here.')}</p>}
    </section>}
    {page ? page.entries.filter(id=>nodes[id]).map(id=><article className="wiki-finding" key={id}>
      <p>{nodes[id].title}</p><div className="wiki-finding-tools"><details><summary>{t('原文依据','Evidence')} · {nodes[id].anchors.length}</summary>{nodes[id].anchors.map(evidence)}</details>
      <div>{controls(id)}</div></div>
      {children(id).length>0 && <button className="link-btn" onClick={()=>navigate({folder:id,page:''})}>{t('打开下级条目','Open child entries')}</button>}
    </article>) : <>
      {pages.map(p=><button className="wiki-file" key={p.id} onClick={()=>navigate({folder,page:p.id})}><Icon name="file"/><span>{pageName(p)}</span><small>{p.entries.length} {t('条观点','findings')}</small><Icon name="chevronRight" size={14}/></button>)}
      {children(folder).filter(n=>!filed.has(n.id)).map(n=><button className="wiki-file" key={n.id} onClick={()=>navigate({folder:n.id,page:''})}>
        <Icon name={children(n.id).length?'book':'note'}/><span>{n.title}</span><Icon name="chevronRight" size={14}/></button>)}
      {nodes[folder]?.anchors.map(evidence)}
    </>}
    {Object.entries(wiki.map_proposals ?? {}).map(([id,proposal]) => <div key={id}>
      <p>{proposal.action==='map_remove'?t('建议删除','Suggested deletion'):t('建议修改主题','Suggested topic title')} · {proposal.text || nodes[proposal.entry_id]?.title}</p>
      <button className="ghost-btn" onClick={()=>void edit({action:'map_dismiss',entry_id:id})}>{t('忽略','Dismiss')}</button>
      <button className="primary" onClick={()=>void edit({action:'map_accept',entry_id:id,confirmed:true})}>{proposal.action==='map_remove'?t('确认删除','Confirm deletion'):t('采纳','Accept')}</button>
    </div>)}
    {wiki.map_questions?.map(q => <p key={q}>{t('待讨论','For discussion')} · {q}</p>)}
    {form && <Dialog title={actions.find(a=>a[0]===form)![2]} onClose={()=>setForm(undefined)}>
      <form onSubmit={async e => {e.preventDefault(); if(saving) return; setSaving(true)
        try { if(await edit({action:form, entry_id:target,text:text.trim(),confirmed:form==='map_remove',subtree})) {
          if(form==='map_remove' && target===folder) navigate({folder:node?.parent ?? '',page:''})
          setForm(undefined)
        }} finally {setSaving(false)}
      }}>
        {form==='map_remove' ? <><p>{node?.title}</p>{count(target)>0 && <label><input type="checkbox" checked={subtree} onChange={e=>setSubtree(e.target.checked)}/>{t('同时删除下级节点','Also delete descendants')} ({count(target)})</label>}</> :
          <textarea autoFocus value={text} rows={3} maxLength={400} aria-label={t('节点内容','Node text')} onChange={e=>setText(e.target.value)}/>}
        <div className="wiki-entry-actions shown"><button type="button" className="ghost-btn" onClick={()=>setForm(undefined)}>{t('取消','Cancel')}</button>
        <button className="primary" disabled={saving || (form!=='map_remove' && !text.trim())}>{form==='map_remove'?t('确认删除','Confirm deletion'):t('保存','Save')}</button></div>
      </form></Dialog>}
  </section>
}
