import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CitationMark, Report, Snapshot } from '../api/citation'
import { useLanguage } from '../i18n'
import { useRead } from '../data/WorkspaceProvider'
import { EvidenceLink } from './Notes'

const states = { supported: 'Supported', partial: 'Partially supported', conflict: 'Conflicting evidence',
  blocked: 'Could not check', evidence_not_established: 'Evidence not established' }

function SourceQuote({ id }: { id: string }) {
  const { tr } = useLanguage()
  const item = useRead('evidence.open', { anchor_id: id })
  const page = item?.source.passages.find(p => p.passage_id === item.passage_id)?.page
  return <div className="audit-quote">{item && <blockquote>{item.quote}</blockquote>}
    <EvidenceLink id={id} label={page ? tr('PDF page {0}', page) : tr('View source')}/></div>
}

export function ManuscriptReader({ topic, draft, version, report, name, onTools, onChoose }: {
  topic: string; draft: string; version: Snapshot; report?: Report; name: string; onTools: () => void; onChoose: () => void
}) {
  const { tr } = useLanguage()
  const [page, setPage] = useState(1)
  const [index, select] = useState<number>()
  const [loose, selectLoose] = useState<CitationMark>()
  const [wire, setWire] = useState('')
  const frame = useRef<HTMLDivElement>(null)
  const pin = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const data = useRead('draft.page', { topic_id: topic, draft_id: draft, version_id: version.version_id, page })
  const marks = data?.marks ?? []
  const mark = loose ?? (index === undefined ? undefined : marks[index])
  const sentence = version.sentences.find(s => s.id === mark?.sentence_id)
  const remaining = version.sentences.filter(s => s.page === page && !marks.some(m => m.sentence_id === s.id))
  const close = () => { select(undefined); selectLoose(undefined) }
  function changePage(value: number) { close(); setPage(value); frame.current?.scrollIntoView({ block: 'nearest' }) }
  useEffect(() => {
    if (!mark) return
    function escape(e: KeyboardEvent) { if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) close() }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [mark])
  useLayoutEffect(() => {
    const root = frame.current, end = heading.current, start = pin.current
    if (!root || !end || !start || !mark || loose) { setWire(''); return }
    function measure() {
      if (!root || !end || !start) return
      const base = root.getBoundingClientRect(), a = start.getBoundingClientRect(), b = end.getBoundingClientRect()
      const x = a.right-base.left, y = a.bottom-base.top, dest = b.left-base.left-12, top = b.top-base.top+b.height/2
      const edge = root.querySelector('.audit-sheet')!.getBoundingClientRect().right-base.left+6
      setWire(dest > edge ? `M ${x} ${y} H ${edge} V ${top} H ${dest}` : '')
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root); observer.observe(start); observer.observe(end)
    return () => observer.disconnect()
  }, [index, data, mark, loose])
  const total = version.page_count ?? page
  return <section className="audit-reading">
    <div className="audit-reader-tools"><button className="ghost-btn" onClick={onChoose}>‹ {tr('Choose your paper')}</button>
      <strong title={name}>{name}</strong><button className="ghost-btn" onClick={onTools}>{tr('Audit tools')}</button></div>
    <div className={'audit-spread' + (mark ? ' inspecting' : '')} ref={frame}>
      <div className="audit-sheet">{data && <>
        <img src={'data:image/png;base64,' + data.png} alt={tr('Original PDF page {0}', page)}/>
        {marks.flatMap((m,i) => m.boxes.map(([l,t,r,b],j) =>
          <button className={'audit-pin' + (i === index ? ' current' : '')} key={i+'-'+j}
            ref={i === index && j === m.boxes.length-1 ? pin : undefined}
            aria-label={tr('Citation check')+' '+m.label+' · '+version.sentences.find(s => s.id === m.sentence_id)?.text}
            aria-pressed={i === index} style={{left:(100*l)+'%',top:(100*t)+'%',width:(100*(r-l))+'%',height:(100*(b-t))+'%'}}
            onClick={() => { selectLoose(undefined); select(i) }}/>))}
      </>}</div>
      {wire && mark && <svg className="audit-wire" aria-hidden="true"><path d={wire}/></svg>}
      {mark && <aside className="audit-inspector" aria-label={tr('Citation check')+' '+mark.label}>
        <header><h3 ref={heading}>{tr('Citation check')} {mark.label}</h3>
          <button className="icon-btn" aria-label={tr('Close')} onClick={close}>×</button></header>
        {sentence && <p className="audit-sentence">{sentence.text}</p>}
        {report?.summaries?.[mark.sentence_id] && <p>{report.summaries[mark.sentence_id]}</p>}
        {mark.keys.map(key => {
          const f = report?.findings.find(f => f.sentence_id === mark.sentence_id && f.ref_key === key)
          const ref = version.references?.find(r => r.key === key)
          return <section key={key}><h4>{ref?.title || ref?.text || key}</h4>
            {f?.needs_review && <p>{tr('Evidence needs review')}</p>}
            {f ? f.claims.map((c,i) => <div key={i}><b>{tr(states[c.status])}</b><p>{tr(c.limit)}</p>
              {c.anchor_ids[0] && <SourceQuote id={c.anchor_ids[0]}/>}
              {c.anchor_ids.length > 1 && <details><summary>{tr('More evidence')}</summary>
                {c.anchor_ids.slice(1).map(id => <SourceQuote key={id} id={id}/>)}</details>}</div>)
              : <p>{tr('No check recorded for this citation yet.')}</p>}
            {f?.chain?.slice(1).map((n,i) => <details key={i}><summary>{n.title}</summary><p>{tr(states[n.status])} {n.limit}</p>
              {n.anchor_ids.map(id => <SourceQuote key={id} id={id}/>)}
              {n.link && <a href={n.link} target="_blank" rel="noreferrer">{tr('Source link')}</a>}</details>)}
          </section>
        })}
      </aside>}
    </div>
    <nav className="audit-turn"><button disabled={page<=1} className="ghost-btn" aria-label={tr('Previous page')} onClick={() => changePage(page-1)}>‹</button>
      {page} / {total}<button disabled={page>=total} className="ghost-btn" aria-label={tr('Next page')} onClick={() => changePage(page+1)}>›</button></nav>
    {data && remaining.length > 0 && <details><summary>{tr('Citations without a page marker')}</summary>
      {remaining.map(s => <button className="audit-option" key={s.id} onClick={() => { select(undefined); selectLoose({
        sentence_id:s.id, label:'', keys:[...s.cites,...(s.unresolved ?? [])], boxes:[] }) }}>{s.text}</button>)}</details>}
  </section>
}
