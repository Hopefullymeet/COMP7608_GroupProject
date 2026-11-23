import { useState } from 'react'
import type { Wiki, WikiEdit } from '../api/wiki'
import { Dialog } from '../components/PageHead'
import { Icon } from '../components/Icon'
import { useLanguage } from '../i18n'
import type { WikiSource } from './WikiPage'
import './wiki-map.css'

export function WikiMap({wiki, title, edit, Source}: {wiki: Wiki; title: string; edit: (p: WikiEdit) => Promise<boolean>; Source: WikiSource['Source']}) {
  const {language} = useLanguage()
  const t = (zh: string, en: string) => language === 'zh-CN' ? zh : en
  const [path, setPath] = useState<string[]>([])
  const [form, setForm] = useState<'map_add'|'map_rename'|'map_remove'>()
  const [text, setText] = useState('')
  const [subtree, setSubtree] = useState(false)
  const [saving, setSaving] = useState(false)
  const nodes = wiki.map_nodes ?? {}
  const selected = path.filter(id => nodes[id])
  const target = selected.at(-1) ?? ''
  const node = nodes[target]
  const root = wiki.map_title || wiki.headline || title
  const children = (id: string) => Object.values(nodes).filter(n => n.parent === id)
  const count = (id: string): number => children(id).reduce((total,n) => total + 1 + count(n.id), 0)
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
    <div className="map-stage"><div className="map-track">
      <button className={'map-root'+(!target?' chosen':'')} onClick={() => setPath([])}><Icon name="wiki" size={18}/>{root}</button>
      {['', ...selected].map((parent, level) => children(parent).length > 0 && <div className="map-fork" key={parent}>
        {children(parent).map(n => <button key={n.id} className={'map-node'+(selected[level] === n.id?' chosen':'')}
          onClick={() => setPath([...selected.slice(0,level),n.id])}>{n.title}<span>›</span></button>)}
      </div>)}
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
          if(form==='map_remove') setPath(selected.slice(0,-1)); setForm(undefined)
        }} finally {setSaving(false)}
      }}>
        {form==='map_remove' ? <><p>{node?.title}</p>{count(target)>0 && <label><input type="checkbox" checked={subtree} onChange={e=>setSubtree(e.target.checked)}/>{t('同时删除下级节点','Also delete descendants')} ({count(target)})</label>}</> :
          <textarea autoFocus value={text} rows={3} maxLength={400} aria-label={t('节点内容','Node text')} onChange={e=>setText(e.target.value)}/>}
        <div className="wiki-entry-actions shown"><button type="button" className="ghost-btn" onClick={()=>setForm(undefined)}>{t('取消','Cancel')}</button>
        <button className="primary" disabled={saving || (form!=='map_remove' && !text.trim())}>{form==='map_remove'?t('确认删除','Confirm deletion'):t('保存','Save')}</button></div>
      </form></Dialog>}
  </section>
}
