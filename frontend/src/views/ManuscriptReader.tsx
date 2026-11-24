import './wiki-directory.css'
import { usePreferences } from '../data/preferences'
import { Fragment } from 'react'
import { AuditText } from '../components/AuditText'
import { Icon } from '../components/Icon'
import { HeaderActions, HeaderContext } from '../components/PageHead'
import { createPortal } from 'react-dom'
import { lazy, Suspense, useContext } from 'react'
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
  const t = (zh: string, en: string) => language === 'zh-CN' ? zh : en
  const prefs = usePreferences()
  const composer = useRef<HTMLTextAreaElement>(null)
  const latest = useRef<HTMLDivElement>(null)
  const actions = useContext(HeaderActions)
  const [panel, setPanel] = useState(true)
  const [view, setView] = useState<'audit' | 'ask'>('audit')
  const [question, setQuestion] = useState('')
  const [page, setPage] = useState(1)
  const [mark, select] = useState<CitationMark>()
  const [wire, setWire] = useState('')
  const answered = report?.discussion?.length ?? 0
  useEffect(() => {
    if (panel && view === 'ask') latest.current?.scrollIntoView({ block: 'nearest' })
  }, [answered, panel, view])
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
    if (!panel || !root || !end || !start || !mark) { setWire(''); return }
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
  }, [mark, view, panel])
  return <section className="audit-reading">
    {actions && createPortal(<>
      <HeaderContext text={name} />
      <button className="icon-btn" title={tr('Citation details')} aria-label={tr('Citation details')} aria-expanded={panel} onClick={() => setPanel(v => !v)}><Icon name="panelRight" size={16}/></button>
      <details className="pt-topic-actions"><summary className="icon-btn" title={tr('More')} aria-label={tr('More')}><Icon name="more" size={16}/></summary>
        <div className="pt-topic-menu"><button onClick={onChoose}>{tr('Choose your paper')}</button>
        {report && report.language !== language && <button disabled={busy} onClick={e => { e.currentTarget.closest('details')!.open = false; onLocalizedCheck() }}>{tr('Generate an English report')}</button>}</div>
      </details>
    </>, actions)}
    <div className={'audit-spread' + (panel ? ' inspecting' : '')} ref={frame}>
      <Suspense fallback={<p>{tr('Opening PDF…')}</p>}><PdfReader topic={topic} version={version.version_id} draft={draft} onPage={setPage}
        pageOverlay={number => <CitationPins topic={topic} draft={draft} version={version} page={number} selected={mark}
          onSelect={(value, button) => { setPanel(true); pin.current = button; select(value); setView('audit') }}/>} /></Suspense>
      {panel && wire && mark && view === 'audit' && <svg className="audit-wire" aria-hidden="true"><path d={wire}/></svg>}
      <aside hidden={!panel} className={'audit-inspector' + (view === 'ask' ? ' assistant-chat audit-chat' : '')} aria-label={tr('Citation check')}>
        <nav className="audit-panel-nav" aria-label={tr('Citation check')}>
          <button aria-pressed={view === 'audit'} onClick={() => setView('audit')}>{tr('Citation check')}</button>
          <button aria-pressed={view === 'ask'} onClick={() => setView('ask')}>{tr('Ask AI')}</button>
        </nav>
        {view === 'ask' ? <>
          <div className="audit-inspector-body audit-chat-thread" aria-live="polite">
            {answered ? report?.discussion?.map((turn,i) => <Fragment key={i}>
              <div className="msg user"><p>{turn.question}</p></div>
              <div className="msg agent" ref={i === answered - 1 ? latest : undefined}>
                <AuditText text={turn.text}/>{turn.anchor_ids.map(id => <EvidenceLink key={id} id={id}/>)}
              </div>
            </Fragment>) : <div className="audit-chat-start">
              <Icon name="message" size={24}/>
              <strong>{mark ? t('询问这条引用', 'Ask about this citation') : t('询问核查报告', 'Ask about the report')}</strong>
              {report ? <div className="suggest-row">{(mark
                ? [t('哪些证据支持这条引用？', 'What evidence supports this citation?'), t('这句话该怎么改？', 'How could I revise this sentence?')]
                : [t('哪些引用需要优先复核？', 'Which citations should I review first?'), t('哪些结论缺少证据？', 'Which claims lack evidence?')]
              ).map(prompt => <button type="button" className="chip-btn" key={prompt} onClick={() => {
                setQuestion(prompt); composer.current?.focus()
              }}>{prompt}</button>)}</div> : <small>{tr('A report is needed to answer audit questions.')}</small>}
            </div>}
          </div>
          <footer className="audit-chat-footer">
            <div className="audit-chat-scope"><Icon name="quote" size={13}/>
              <small>{mark ? tr('Current citation {0}', mark.label || sentence?.text || '') : tr('Current audit report')}</small>
              {mark && <button type="button" className="link-btn" onClick={close}>{tr('Use whole report')}</button>}
            </div>
            <form className="composer" onSubmit={async e => {
              e.preventDefault()
              if (!question.trim() || busy || !report) return
              try { await onAsk(question.trim(), mark) } catch (error) { onError(error) }
            }}>
              <textarea ref={composer} rows={1} aria-label={tr('Ask about this audit')} placeholder={tr('Ask about this audit')}
                value={question} disabled={!report} maxLength={2000} onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && (prefs.send === 'enter' || e.ctrlKey || e.metaKey)) {
                    e.preventDefault(); e.currentTarget.form?.requestSubmit()
                  }
                }}/>
              <button className="send" aria-label={tr('Send')} disabled={busy || !question.trim() || !report}><Icon name="arrowUp" size={16}/></button>
            </form>
          </footer>
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
      {remaining.map(s => <button className="audit-option" key={s.id} onClick={() => { setPanel(true); pin.current = null; setView('audit'); select({
        sentence_id:s.id, label:'', keys:[...s.cites,...(s.unresolved ?? [])], boxes:[] }) }}>{s.text}</button>)}</details>}
  </section>
}
