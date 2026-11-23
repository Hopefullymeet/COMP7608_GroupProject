import { AuditText } from '../components/AuditText'
import { lazy, Suspense } from 'react'
const PdfReader = lazy(() => import('./PdfReader'))
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

function CitationPins({ topic, draft, version, page, selected, onSelect }: {
  topic: string; draft: string; version: Snapshot; page: number; selected?: CitationMark
  onSelect: (mark: CitationMark, button: HTMLButtonElement) => void
}) {
  const { tr } = useLanguage()
  const data = useRead('draft.page', { topic_id: topic, draft_id: draft, version_id: version.version_id, page, marks_only: true })
  return <>{data?.marks?.flatMap((mark,i) => mark.boxes.map(([l,t,r,b],j) =>
    <button key={i+'-'+j} className={'audit-pin' + (selected?.sentence_id === mark.sentence_id && selected.label === mark.label && selected.boxes[0]?.[0] === mark.boxes[0]?.[0] ? ' current' : '')}
      aria-label={tr('Citation check')+' '+mark.label+' · '+(version.sentences.find(s => s.id === mark.sentence_id)?.text ?? '')}
      aria-pressed={selected?.sentence_id === mark.sentence_id && selected.label === mark.label && selected.boxes[0]?.[0] === mark.boxes[0]?.[0]} style={{left:l*100+'%',top:t*100+'%',width:(r-l)*100+'%',height:(b-t)*100+'%'}}
      onClick={e => onSelect(mark, e.currentTarget)}/>))}</>
}

export function ManuscriptReader({ topic, draft, version, report, name, onAsk, onError, onChoose, busy, onLocalizedCheck }: {
  busy: boolean; onLocalizedCheck: () => void
  topic: string; draft: string; version: Snapshot; report?: Report; name: string; onAsk: (question: string, mark?: CitationMark) => Promise<void>; onError: (err: unknown) => void; onChoose: () => void
}) {
  const { tr, language } = useLanguage()
  const [view, setView] = useState<'audit' | 'ask'>('audit')
  const [question, setQuestion] = useState('')
  const [page, setPage] = useState(1)
  const [mark, select] = useState<CitationMark>()
  const [wire, setWire] = useState('')
  const answered = report?.discussion?.length ?? 0
  const previousCount = useRef(answered)
  useEffect(() => {
    if (answered > previousCount.current) setQuestion(q => report?.discussion?.at(-1)?.question === q.trim() ? '' : q)
    previousCount.current = answered
  }, [answered, report])
  const frame = useRef<HTMLDivElement>(null)
  const pin = useRef<HTMLButtonElement | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const data = useRead('draft.page', { topic_id: topic, draft_id: draft, version_id: version.version_id, page, marks_only: true })
  const sentence = version.sentences.find(s => s.id === mark?.sentence_id)
  const remaining = version.sentences.filter(s => s.page === page && !data?.marks?.some(m => m.sentence_id === s.id))
  const close = () => { select(undefined); pin.current = null }
  useEffect(() => {
    if (!mark) return
    function escape(e: KeyboardEvent) { if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) close() }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [mark])
  useLayoutEffect(() => {
    const root = frame.current, end = heading.current, start = pin.current
    if (!root || !end || !start || !mark) { setWire(''); return }
    function measure() {
      if (!root || !end || !start) return
      const base = root.getBoundingClientRect(), a = start.getBoundingClientRect(), b = end.getBoundingClientRect()
      const x = a.right-base.left, y = a.bottom-base.top, dest = b.left-base.left-12, top = b.top-base.top+b.height/2
      const reader = root.querySelector('.pt-reader-frame')!.getBoundingClientRect()
      if (!start.isConnected || a.bottom < reader.top || a.top > reader.bottom || a.right > reader.right || a.left < reader.left) { setWire(''); return }
      const edge = reader.right-base.left+6
      setWire(dest > edge ? `M ${x} ${y} H ${edge} V ${top} H ${dest}` : '')
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root); observer.observe(start); observer.observe(end)
    root.addEventListener('scroll', measure, true)
    return () => { observer.disconnect(); root.removeEventListener('scroll', measure, true) }
  }, [mark, view])
  return <section className="audit-reading">
    <div className="audit-reader-tools"><button className="ghost-btn" onClick={onChoose}>‹ {tr('Choose your paper')}</button>
      <strong title={name}>{name}</strong>{report && report.language !== language &&
        <button className="ghost-btn" disabled={busy} onClick={onLocalizedCheck}>{tr('Generate an English report')}</button>}</div>
    <div className="audit-spread inspecting" ref={frame}>
      <Suspense fallback={<p>{tr('Opening PDF…')}</p>}><PdfReader topic={topic} version={version.version_id} draft={draft} onPage={setPage}
        pageOverlay={number => <CitationPins topic={topic} draft={draft} version={version} page={number} selected={mark}
          onSelect={(value, button) => { pin.current = button; select(value); setView('audit') }}/>} /></Suspense>
      {wire && mark && view === 'audit' && <svg className="audit-wire" aria-hidden="true"><path d={wire}/></svg>}
      <aside className="audit-inspector" aria-label={tr('Citation check')}>
        <nav className="audit-panel-nav" aria-label={tr('Citation check')}>
          <button aria-pressed={view === 'audit'} onClick={() => setView('audit')}>{tr('Citation check')}</button>
          <button aria-pressed={view === 'ask'} onClick={() => setView('ask')}>{tr('Ask AI')}</button>
        </nav>
        {view === 'ask' ? <>
          <div className="audit-inspector-body" aria-live="polite">
            {report?.discussion?.map((turn,i) => <article key={i}><strong>{turn.question}</strong>
              <AuditText text={turn.text}/>{turn.anchor_ids.map(id => <EvidenceLink key={id} id={id}/>)}</article>)}
          </div>
          <form className="audit-question" onSubmit={async e => { e.preventDefault()
            if (!question.trim() || busy || !report) return
            try { await onAsk(question.trim(), mark) } catch (error) { onError(error) }
          }}>
            <small>{mark ? tr('Current citation {0}', mark.label || sentence?.text || '') : tr('Current audit report')}</small>
            {mark && <button type="button" className="link-btn" onClick={close}>{tr('Use whole report')}</button>}
            <textarea className="text-field" aria-label={tr('Ask about this audit')} placeholder={tr('Ask about this audit')}
              value={question} maxLength={2000} onChange={e => setQuestion(e.target.value)}/>
            <button className="primary" disabled={busy || !question.trim() || !report}>{tr('Ask')}</button>
            {!report && <p>{tr('A report is needed to answer audit questions.')}</p>}
          </form>
        </> : mark ? <>
        <header><h3 ref={heading}>{tr('Citation check')} {mark.label}</h3>
          <button className="icon-btn" aria-label={tr('Close')} onClick={close}>×</button></header>
        <div className="audit-inspector-body" key={mark.sentence_id + mark.label}>
        {sentence && <p className="audit-sentence">{sentence.text}</p>}
        {report?.summaries?.[mark.sentence_id] && <AuditText text={report.summaries[mark.sentence_id]}/>}
        {mark.keys.map(key => {
          const f = report?.findings.find(f => f.sentence_id === mark.sentence_id && f.ref_key === key)
          const ref = version.references?.find(r => r.key === key)
          return <section key={key}><h4>{ref?.title || ref?.text || key}</h4>
            {f?.needs_review && <p>{tr('Evidence needs review')}</p>}
            {f ? f.claims.map((c,i) => <div key={i}><b>{tr(states[c.status])}</b><AuditText text={tr(c.limit)}/>
              {c.anchor_ids[0] && <SourceQuote id={c.anchor_ids[0]}/>}
              {c.anchor_ids.length > 1 && <details><summary>{tr('More evidence')}</summary>
                {c.anchor_ids.slice(1).map(id => <SourceQuote key={id} id={id}/>)}</details>}</div>)
              : <p>{tr('No check recorded for this citation yet.')}</p>}
            {f?.chain?.slice(1).map((n,i) => <details key={i}><summary>{n.title}</summary><b>{tr(states[n.status])}</b>{n.limit && <AuditText text={tr(n.limit)}/>}
              {n.anchor_ids.map(id => <SourceQuote key={id} id={id}/>)}
              {n.link && <a href={n.link} target="_blank" rel="noreferrer">{tr('Source link')}</a>}</details>)}
          </section>
        })}
        </div>
        </> : <p className="audit-panel-hint">{version.sentences.length
          ? tr('Click a citation number in the manuscript to see its check and evidence.')
          : tr('No citations were identified in this manuscript.')}</p>}
      </aside>
    </div>
    {data && remaining.length > 0 && <details><summary>{tr('Citations without a page marker')}</summary>
      {remaining.map(s => <button className="audit-option" key={s.id} onClick={() => { pin.current = null; setView('audit'); select({
        sentence_id:s.id, label:'', keys:[...s.cites,...(s.unresolved ?? [])], boxes:[] }) }}>{s.text}</button>)}</details>}
  </section>
}
