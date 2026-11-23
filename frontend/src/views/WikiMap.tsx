import { useLayoutEffect, useRef, useState } from 'react'
import type { Wiki, WikiEdit } from '../api/wiki'
import { Dialog } from '../components/PageHead'
import { Icon } from '../components/Icon'
import { useLanguage } from '../i18n'
import type { WikiSource } from './WikiPage'
import './wiki-map.css'

export function WikiMap({wiki, title, edit, Source}: {wiki: Wiki; title: string; edit: (p: WikiEdit) => Promise<boolean>; Source: WikiSource['Source']}) {
  const {language} = useLanguage()
  const t = (zh: string, en: string) => language === 'zh-CN' ? zh : en
  const storageKey = 'papertrace.map.view.' + wiki.topic_id
  const [initial] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '{}') || {} } catch { return {} }
  })
  const [expanded, setExpanded] = useState<string[]>(Array.isArray(initial.expanded) ? initial.expanded : [''])
  const [focus, setFocus] = useState<string>(typeof initial.focus === 'string' ? initial.focus : '')
  const stage = useRef<HTMLDivElement>(null)
  const [width,setWidth] = useState(800)
  useLayoutEffect(() => {
    const el = stage.current!
    const resize = new ResizeObserver(() => setWidth(el.clientWidth))
    resize.observe(el)
    return () => resize.disconnect()
  }, [])
  const [form, setForm] = useState<'map_add'|'map_rename'|'map_remove'>()
  const [text, setText] = useState('')
  const [subtree, setSubtree] = useState(false)
  const [saving, setSaving] = useState(false)
  const nodes = wiki.map_nodes ?? {}
  const target = nodes[focus] ? focus : ''
  const node = nodes[target]
  const root = wiki.map_title || wiki.headline || title
  const children = (id: string) => Object.values(nodes).filter(n => n.parent === id)
  const count = (id: string): number => children(id).reduce((total,n) => total + 1 + count(n.id), 0)
  function toggle(id: string) {
    setFocus(id)
    if (children(id).length) setExpanded(prev => prev.includes(id) ? prev.filter(key => key !== id) : [...prev,id])
  }
  // Lay out both sides separately: opening a branch keeps the opposite side in place.
  const box = Math.min(206, Math.max(128, Math.floor(width / 5)))
  const stride = box + 40
  const points: {id:string; x:number; y:number; parent:string; side:number}[] = []
  function place(id:string, parent:string, side:number, depth:number, top:number): number {
    let next = top
    if (expanded.includes(id)) for (const child of children(id)) next += place(child.id,id,side,depth+1,next)
    const height = Math.max(74,next-top)
    points.push({id,parent,side,x:side*depth*stride,y:top+height/2})
    return height
  }
  for (const side of [-1,1]) {
    const first = points.length
    let top = 0
    if (expanded.includes('')) children('').filter((_,i)=> (i%2===0?1:-1)===side)
      .forEach(n=>{top += place(n.id,'',side,1,top)})
    for (const p of points.slice(first)) p.y -= top/2
  }
  points.push({id:'',x:0,y:0,parent:'',side:0})
  const byId = new Map(points.map(p=>[p.id,p]))
  const xs = points.map(p=>p.x), ys = points.map(p=>p.y)
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys)
  const w = Math.max(width,right-left+box+36), h=Math.max(360,bottom-top+96)
  const dx=(w-right-left)/2, dy=(h-top-bottom)/2
  function remember() {
    const el=stage.current
    if (!el) return
    try { localStorage.setItem(storageKey,JSON.stringify({expanded,focus,left:el.scrollLeft,top:el.scrollTop})) } catch { /* storage unavailable */ }
  }
  useLayoutEffect(() => {
    const el=stage.current!
    el.scrollLeft=Number(initial.left)||0
    el.scrollTop=Number(initial.top)||0
  }, [initial])
  useLayoutEffect(remember,[expanded,focus,storageKey])
  const actions = [
    ['map_add', 'plus', t('添加子节点','Add child')],
    ['map_rename', 'edit', t('编辑节点','Edit node')],
    ...(node ? [['map_remove', 'trash', t('删除节点','Delete node')]] : []),
  ] as const
  return <section className="research-map">
    <div className="map-heading"><h2>{t('研究地图','Research map')}</h2><div>{actions.map(([action,icon,label]) =>
      <button className="icon-btn" key={action} title={label} aria-label={label} onClick={() => {
        setText(action === 'map_rename' ? node?.title ?? root : ''); setSubtree(false); setForm(action as typeof form)
      }}><Icon name={icon} size={15}/></button>)}</div></div>
    <div className="map-stage" ref={stage} onScroll={remember}><div className="map-track" style={{width:w,height:h}}>
      <svg width={w} height={h} aria-hidden="true">{points.filter(p=>p.id).map(p=>{
        const parent=byId.get(p.parent)!
        const start=parent.x+dx+p.side*box/2, end=p.x+dx-p.side*box/2, mid=(start+end)/2
        return <path key={p.id} className={p.id===target?'active':''} d={`M${start},${parent.y+dy} C${mid},${parent.y+dy} ${mid},${p.y+dy} ${end},${p.y+dy}`}/>
      })}</svg>
      {points.map(p=>{
        const label=p.id?nodes[p.id].title:root
        const canExpand=children(p.id).length>0
        return <button key={p.id} type="button" className={'map-point'+(!p.id?' root':'')+(p.id===target?' chosen':'')}
          style={{width:box,left:p.x+dx,top:p.y+dy}} title={label} aria-label={label}
          aria-expanded={canExpand?expanded.includes(p.id):undefined} onClick={()=>toggle(p.id)}>
          <i aria-hidden="true"/><span>{label}</span>{canExpand && <b aria-hidden="true">{expanded.includes(p.id)?'−':'+'}</b>}
        </button>
      })}
    </div></div>
    {node && <div className="map-detail"><h3>{node.title}</h3>{node.anchors.map(id => {
      const a = wiki.map_sources?.[id]
      return a && <div key={id} className="map-evidence"><Source id={id} anchor={'map-'+id} label={a.title + (a.page ? ' · p. '+a.page : ' · '+t('摘要','Abstract'))}/><blockquote>{a.quote}</blockquote></div>
    })}</div>}
    {Object.entries(wiki.map_proposals ?? {}).map(([id,proposal]) => <div key={id}>
      <p>{proposal.action==='map_remove'?t('建议删除','Suggested deletion'):t('建议修改主题','Suggested topic title')} · {proposal.text || nodes[proposal.entry_id]?.title}</p>
      <button className="ghost-btn" onClick={()=>void edit({action:'map_dismiss',entry_id:id})}>{t('忽略','Dismiss')}</button>
      <button className="primary" onClick={()=>void edit({action:'map_accept',entry_id:id,confirmed:true})}>{proposal.action==='map_remove'?t('确认删除','Confirm deletion'):t('采纳','Accept')}</button>
    </div>)}
    {wiki.map_questions?.map(q => <p key={q}>{t('待讨论','For discussion')} · {q}</p>)}
    {form && <Dialog title={actions.find(a=>a[0]===form)![2]} onClose={()=>setForm(undefined)}>
      <form onSubmit={async e => {e.preventDefault(); if(saving) return; setSaving(true)
        try { if(await edit({action:form, entry_id:target,text:text.trim(),confirmed:form==='map_remove',subtree})) {
          if(form==='map_remove') setFocus(node?.parent ?? '');
          if(form==='map_add') setExpanded(prev=>prev.includes(target)?prev:[...prev,target]); setForm(undefined)
        }} finally {setSaving(false)}
      }}>
        {form==='map_remove' ? <><p>{node?.title}</p>{count(target)>0 && <label><input type="checkbox" checked={subtree} onChange={e=>setSubtree(e.target.checked)}/>{t('同时删除下级节点','Also delete descendants')} ({count(target)})</label>}</> :
          <textarea autoFocus value={text} rows={3} maxLength={400} aria-label={t('节点内容','Node text')} onChange={e=>setText(e.target.value)}/>}
        <div className="wiki-entry-actions shown"><button type="button" className="ghost-btn" onClick={()=>setForm(undefined)}>{t('取消','Cancel')}</button>
        <button className="primary" disabled={saving || (form!=='map_remove' && !text.trim())}>{form==='map_remove'?t('确认删除','Confirm deletion'):t('保存','Save')}</button></div>
      </form></Dialog>}
  </section>
}
