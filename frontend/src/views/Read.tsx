import { usePreferences } from '../data/preferences'
import { count, useLanguage } from '../i18n'
import { lazy, Suspense, useContext, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { allEvidence, currentTopic, evidenceFor, hasMessages, paperFor, papersOfTopic, sourceStatus, useStore } from '../data/store'
import { QUESTIONS } from '../data/scripts'
import { quoteOffsets } from '../components/quoteRange'
import { EvidencePopover } from '../components/EvidencePopover'
import { Icon, Spinner } from '../components/Icon'
import { useAnswerScroll } from '../components/useAnswerScroll'
import { useRead, useWorkspace } from '../data/WorkspaceProvider'
import { createPortal } from 'react-dom'
import { Dialog, HeaderActions } from '../components/PageHead'
import { FigureSearch } from '../components/FigureSearch'
import { PublicationDetails } from '../components/PublicationDetails'
import { AnswerText } from '../components/AnswerText'
import { errorText } from '../api/contract'
import type { ReaderAnswer, Rect, Selection } from '../api/reader'
import type { ChatMessage, Paper, Passage } from '../data/types'

const PdfReader = lazy(() => import('./PdfReader'))

type Location = { page: number; rect?: Rect }

function ClaimSources({ ids, sentence, numbers }: { ids: string[]; sentence: number; numbers: Map<string, number> }) {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const [index, setIndex] = useState(0)
  const active = ids.indexOf(state.activeEvidence?.id ?? '')
  const current = active >= 0 ? active : Math.min(index, ids.length - 1)
  function open(at: number) {
    setIndex(at)
    act.openEvidence(ids[at], '', true)
  }
  return <span className="claim-sources">
    <button className="cite" aria-label={tr('Show source {0} for sentence {1}', numbers.get(ids[current])!, sentence)}
      onClick={() => open(current)}>{numbers.get(ids[current])}</button>
    {ids.length > 1 && <>
      <button className="cite" disabled={!current} title={tr('Previous supporting passage')} aria-label={tr('Previous supporting passage')}
        onClick={() => open(current - 1)}>‹</button>
      <small aria-live="polite">{current + 1}/{ids.length}</small>
      <button className="cite" disabled={current === ids.length - 1} title={tr('Next supporting passage')} aria-label={tr('Next supporting passage')}
        onClick={() => open(current + 1)}>›</button>
    </>}
  </span>
}

function AgentMessage({ m }: { m: ChatMessage }) {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const runId = m.runId ?? m.wikiTask
  const run = runId ? state.runs[runId] : undefined
  const prefs = usePreferences()
  const lastStep = run?.steps[run.steps.length - 1]
  const tools = run?.steps.filter((s) => s.kind === 'tool').length ?? 0
  const papers = papersOfTopic(state, currentTopic(state))
  const citationNumbers = new Map<string, number>()
  for (const segment of m.segments) {
    if (segment.tone === 'scope') continue
    for (const id of segment.evidenceIds ?? (segment.evidenceId ? [segment.evidenceId] : [])) {
      if (!citationNumbers.has(id)) citationNumbers.set(id, citationNumbers.size + 1)
    }
  }
  const AnswerPoint = state.mainline ? 'p' : 'span'

  return (
    <div className="msg agent" data-answer-id={m.id}>
      <div className="msg-who">
        <span className="avatar">P</span> PaperTrace
        {!m.done && <span className="working"><Spinner /> {tr(lastStep?.title ?? 'Planning…')}</span>}
      </div>
      {run && run.steps.length > 0 && <details key={String(m.done) + prefs.collapse} open={!m.done || prefs.collapse === 'never'} className="chat-work-steps">
        <summary>{count(tr,run.steps.length,'step')}</summary>
        <ol>{run.steps.map(step=><li key={step.id}>{tr(step.title)}
          {prefs.steps === 'detailed' && <>{step.call && <code>{step.call}</code>}{step.detail && <p>{tr(step.detail)}</p>}</>}
        </li>)}</ol>
      </details>}
      {m.segments.length > 0 && (
        <div className="answer">
          {m.segments.map((s, i) => {
            if (s.tone === 'scope') return <div key={i} className="scope-note">
              <Icon name="eye" size={13} />
              {s.readSources?.length ? <div>
                <strong>{tr('Reading coverage')}</strong>
                <ul className="scope-sources">{s.readSources.map((source, index) => {
                  const paper = paperFor(state, source.source_version_id)
                  const label = paper?.alias || paper?.title || tr('Source {0}', index + 1)
                  const scope = source.read_scope === 'none' ? 'Not read' : source.read_scope === 'abstract' ? 'Abstract' : 'Full text'
                  return <li key={source.source_version_id}>{label} · {tr(scope)}</li>
                })}</ul>
              </div> : s.readSources ? tr('No sources read.') : s.text}
            </div>
            if (s.evidenceIds?.length) return <AnswerPoint key={i} className="claim">
              {s.text}<ClaimSources ids={[...new Set(s.evidenceIds)]} sentence={i + 1} numbers={citationNumbers} />
            </AnswerPoint>
            if (s.evidenceIds?.length === 0) return <AnswerPoint key={i} className="claim">
              {s.text}<span className="cite" title="No Evidence Found">？</span>
            </AnswerPoint>
            if (!s.evidenceId) return <AnswerPoint key={i}>{s.text}</AnswerPoint>
            const source = evidenceFor(state, s.evidenceId)
            const status = sourceStatus(state, source.paperId)
            const jump = status === 'available' && papers.includes(source.paperId)
            const anchor = `chat-${m.id}-${i}`
            return (
              <span key={i} className={`claim ${state.activeEvidence?.id === source.id ? 'on' : ''}`}>
                {s.text}
                <button className={`cite ${status !== 'available' ? 'gone' : ''}`} data-ev-anchor={anchor}
                  onClick={() => act.openEvidence(source.id, jump ? `read-${source.id}` : anchor, jump)}
                  aria-label={tr('Show source {0}{1}', citationNumbers.get(source.id)!, status === 'available' ? '' : ` · ${tr(status)}`)}>{citationNumbers.get(source.id)!}</button>
              </span>
            )
          })}
        </div>
      )}
      {m.wikiTask && state.topics.find(t=>t.id===currentTopic(state))?.wikiTurns?.includes(m.wikiTask) && <small className="wiki-update"><Icon name="wiki" size={13}/>{tr('Wiki updated')}</small>}
      {m.done && state.mainline?.saveAnswer && <button className="link-btn" onClick={()=>state.mainline?.saveAnswer?.(m)}>{tr('Save answer as note')}</button>}
      {m.done && run && (
        <div className="msg-foot">
          <span className="run-chip done">{tr('Done')}</span>
          <span>{count(tr, run.steps.length, 'step')} · {count(tr, tools, 'tool call')}</span>
          <button className="link-btn" onClick={() => act.showTrace(true, run.id)}>{tr('View trace')}</button>
        </div>
      )}
    </div>
  )
}

type Annotation = { id: string; version: string; quote: string; passage?: string; selection?: Selection }

function useAnnotations() {
  const [items, setItems] = useState<Annotation[]>([])
  const input = useRef<HTMLTextAreaElement>(null)
  const [added, setAdded] = useState(0)
  function add(item: Annotation) {
    setItems(old => old.some(a => a.id === item.id) ? old : [...old, item])
    setAdded(n => n + 1)
  }
  function remove(items: Annotation[]) {
    setItems(old => old.filter(a => !items.includes(a)))
  }
  return { items, add, remove, added, input }
}
type Annotations = ReturnType<typeof useAnnotations>
type AskRegion = (annotation: Annotation, question: string) => Promise<boolean>

function Chat({ controls, selections = [], onSource, annotations, askRegion, blocked }: {
  annotations: Annotations; askRegion?: AskRegion; blocked?: string
  controls: ReactNode; selections?: ReaderAnswer[]; onSource?: (answer: ReaderAnswer) => void
}) {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const actions = useContext(HeaderActions)
  const prefs = usePreferences()
  const [queued,setQueued] = useState<{session:string;question:string}>()
  const [text, setText] = useState('')
  const session = state.sessions.find((s) => s.id === state.activeSessionId)
  const messages = state.messages.filter((m) => m.sessionId === session?.id)
  const asked = new Set(messages.filter((m) => m.role === 'user').map((m) => m.segments[0]?.text))
  const papers = papersOfTopic(state, currentTopic(state))
  const readable = papers.filter((id) => paperFor(state, id).stored !== 'metadata')
  const canAsk = !state.mainline || readable.length > 0

  const last = messages[messages.length - 1]
  const agent = last?.role === 'agent' ? last : undefined
  const turn = agent?.wikiTask ?? agent?.runId ?? agent?.id
  const scroll = useAnswerScroll(session?.id, agent && !agent.done ? turn : last?.role === 'user' && last.id.startsWith('user:') ? last.id.slice(5) : undefined,
    agent?.done ? turn : undefined, agent?.id, agent?.done ? '' : agent?.segments.map(s => s.text).join('') ?? '')

  const send = async (t: string, fromComposer = false) => {
    if (!t.trim() || state.qaRunning || !canAsk) return
    const attached = fromComposer ? annotations.items : []
    if (fromComposer && blocked) return
    const region = attached.find(a => a.selection?.medium === 'image') ??
      (attached.length === 1 && attached[0].selection ? attached[0] : undefined)
    const quotes = attached.filter(a => a !== region).map(a => paperFor(state, a.version).short + ' · “' + a.quote + '”')
    const question = [t.trim(), ...quotes].join('\n\n')
    if (region && askRegion) {
      if (!await askRegion(region, question)) return
    } else {
      const first = attached.find(a => a.passage)
      if (!await act.ask(question, first && { source_version_id: first.version, passage_id: first.passage!, quote: first.quote })) return
    }
    annotations.remove(attached)
    if (fromComposer) setText((current) => current === t ? '' : current)
  }

  const queuedRef = useRef(queued)
  queuedRef.current = queued
  useEffect(() => {
    if (!queued || queuedRef.current !== queued) return
    if (queued.session !== session?.id) { setQueued(undefined); return }
    if (state.qaRunning || blocked || !canAsk) return
    queuedRef.current = undefined
    setQueued(undefined)
    void act.ask(queued.question).then(ok => { if (!ok) setText(current => current || queued.question) })
  }, [queued, session?.id, state.qaRunning, blocked, canAsk, act])
  const canQueue = prefs.busy === 'queue' && !annotations.items.length && !queued && !!session
  function submit() {
    if (state.qaRunning && canQueue && session && text.trim()) {
      setQueued({session:session.id, question:text.trim()}); setText(''); return
    }
    void send(text,true)
  }

  const suggestions = (state.mainline
    ? state.mainline.demo ? [{ id: 'pubmedqa', text: 'What context does PubMedQA provide to the model?', requires: undefined },{id:'limits',text:'What does the abstract establish about the conclusions?',requires:undefined}] : []
    : QUESTIONS).filter((q) => !asked.has(q.text))

  return (
    <section className="chat" aria-label={tr('Conversation')}>
      {actions && createPortal(<>
        {messages.length > 0 && <button className="icon-btn sm" title={tr('New session')} aria-label={tr('New session')} onClick={() => act.newSession(currentTopic(state))}><Icon name="plus" size={15} /></button>}
        {controls}
      </>, actions)}
      <div className="chat-scroll" ref={scroll.panel} onScroll={scroll.onScroll}>
        {messages.length === 0 && selections.length === 0 && (
          <div className="chat-empty">
            <h2>{tr('Start a fresh reading question')}</h2>
            <p>{tr(state.mainline?.demo || !state.mainline ? 'Explore dataset size and question collection, then compare evaluation results. Papers are shared across this topic; this conversation starts empty.' : 'Ask about a paper or select a passage to use it in your question.')}</p>
          </div>
        )}
        {messages.map((m) =>
          m.role === 'user'
            ? <div key={m.id} className="msg user"><p>{m.segments[0]?.text}</p></div>
            : prefs.collapse === 'finished' && prefs.replies === 'latest' && m.done && messages.slice(messages.indexOf(m)+1).some(next=>next.role==='agent' && next.done)
              ? <details key={m.id}><summary>{tr('Earlier answer')}</summary><AgentMessage m={m}/></details>
              : <AgentMessage key={m.id} m={m} />,
        )}
        {selections.map((answer) => <div key={answer.id}>
          <div className="msg user"><p>{answer.question}</p></div>
          <div className="msg agent">
            <div className="msg-who"><span className="avatar">P</span> PaperTrace</div>
            <AnswerText text={answer.answer} />
            <button className="link-btn" onClick={() => onSource?.(answer)}>
              {paperFor(state, answer.source_version_id)?.short} · {tr('PDF page {0}', answer.page)}
            </button>
          </div>
        </div>)}
        <div ref={scroll.space} aria-hidden="true" style={{ flexShrink: 0 }} />
      </div>

      {(state.mainline ? readable.length > 0 : papers.length > 0) && <div className="chat-bottom">
        {suggestions.length > 0 && (
          <div className="suggest-row">
            {suggestions.map((q) => {
              const blocked = state.mainline ? null : !papers.includes('qasper') ? 'qasper' : q.requires && !papers.includes(q.requires) ? q.requires : null
              return (
                <button key={q.id} className="chip-btn" disabled={!!blocked || state.qaRunning || !canAsk} onClick={() => void send(q.text)}
                  title={blocked ? tr('Add {0} to the topic first', paperFor(state, blocked).short) : undefined}>
                  {tr(q.text)}{blocked && <small>{' '}{tr('· needs')}{' '}{paperFor(state, blocked).short}</small>}
                </button>
              )
            })}
          </div>
        )}
        <div className="composer">
          {annotations.items.length > 0 && <div className="chat-annotations">
            <button type="button" className="annotation-count"><Icon name="message" size={14} />
              {tr(annotations.items.length === 1 ? '{0} annotation' : '{0} annotations', annotations.items.length)}</button>
            <div className="annotation-details">
              {annotations.items.map(a => <div className="annotation-row" key={a.id}>
                <div><strong>{paperFor(state, a.version).short}{a.selection && ' · ' + tr('PDF page {0}', a.selection.page)}</strong>
                  <p>{a.quote || tr('Selected region')}</p></div>
                <button type="button" className="icon-btn sm" aria-label={tr('Remove annotation')} onClick={() => annotations.remove([a])}><Icon name="x" size={14} /></button>
              </div>)}
            </div>
          </div>}
          {queued && <p role="status">{tr('Queued question')} · {queued.question} <button onClick={()=>setQueued(undefined)}>{tr('Cancel')}</button></p>}
          {blocked && <p className="fine">{blocked}</p>}
          <textarea ref={annotations.input} value={text} rows={2} placeholder={messages.length ? tr('Ask a follow-up…') : tr('Ask about these papers…')} aria-label={tr('Ask a follow-up')}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && (prefs.send === 'enter' || e.metaKey || e.ctrlKey)) { e.preventDefault(); submit() } }} />
          <div className="composer-bar">
            <span className="grow" />
            <button className="send" disabled={(state.qaRunning && !canQueue) || !canAsk || !!blocked || !text.trim()} onClick={submit} aria-label={tr('Send')}><Icon name="arrowUp" size={16} /></button>
          </div>
        </div>
      </div>}
    </section>
  )
}

function PassageText({ p, highlight }: { p: Passage; highlight: Set<string> }) {
  const { state, act } = useStore()
  const anchors = allEvidence(state)
    .filter((e) => e.passageId === p.id && highlight.has(e.id))
    .map((e) => ({ e, at: p.text.indexOf(e.quote) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)

  const out: ReactNode[] = []
  let cursor = 0
  anchors.forEach(({ e, at }) => {
    if (at < cursor) return
    out.push(p.text.slice(cursor, at))
    const active = state.activeEvidence?.id === e.id
    out.push(
      <mark key={e.id} data-ev-anchor={`read-${e.id}`} className={active ? 'on' : ''}
        onClick={() => act.openEvidence(e.id, `read-${e.id}`, false)}>{e.quote}</mark>,
    )
    cursor = at + e.quote.length
  })
  out.push(p.text.slice(cursor))
  return <>{out} </>
}

type PdfActions = {
  location?: { version: string } & Location
  open: (version: string, page: number, rect?: Rect) => void
  ask: (version: string, picked: Selection) => void
  find: () => void
}

function PaperInsights({ paper, mode, onOpen }: { paper: Paper; mode: 'scan' | 'analysis'; onOpen: (version: string, page: number) => void }) {
  const { tr } = useLanguage()
  const { state } = useStore()
  const { demo } = useWorkspace()
  const topic_id = currentTopic(state)
  const [direction, setDirection] = useState<'outgoing' | 'incoming'>('outgoing')
  const refs = useRead('literature.refs', { topic_id, source_version_id: paper.id, direction }, mode === 'analysis')
  const catalog = useRead('library.catalog', {}, mode === 'scan')
  const entry = catalog?.papers.find((item) => item.source_versions.some((version) => version.source_version_id === paper.id))
  return <div className="reader-scroll scroll pt-paper-insights">
    <article className="paper">
      <h1>{paper.title}</h1>
      {mode === 'scan' ? <>
        {!!(entry?.authors.length || paper.authors.length) && <p className="paper-authors">{(entry?.authors.length ? entry.authors : paper.authors).join(' · ')}</p>}
        {paper.venue && <p>{paper.venue} {paper.year || ''}</p>}
        {entry?.identity && <p className="fine">{entry.identity}</p>}
        {entry && !demo && <PublicationDetails paper={entry.paper_id} topic={topic_id} />}
        <button className="link-btn" onClick={() => onOpen(paper.id, 1)}>{tr('Read paper')}</button>
      </> : <>
        <div className="lib-tools">
          <button className="ghost-btn" aria-pressed={direction === 'outgoing'} onClick={() => setDirection('outgoing')}>{tr('References')}</button>
          <button className="ghost-btn" aria-pressed={direction === 'incoming'} onClick={() => setDirection('incoming')}>{tr('Cited by')}</button>
        </div>
        {!refs && <p role="status">{tr('Loading references…')}</p>}
        {!!refs?.pending_versions.length && <p>{tr('Reference indexing is pending.')}</p>}
        {refs && !refs.items.length && <p>{tr('No indexed references found.')}</p>}
        {!!refs?.items.length && <ul>{refs.items.map((ref) => {
          const linked = direction === 'outgoing' ? ref.target_version_id : ref.citing_version_id
          return <li key={ref.citing_version_id + ':' + ref.key}>
            {linked ? <button className="link-btn" onClick={() => onOpen(linked, 1)}>
              {direction === 'outgoing' ? ref.target_title || ref.title : ref.citing_title}
            </button> : ref.title || ref.text}
            {ref.mentions.filter((item) => item.page > 0).slice(0, 3).map((item, index) =>
              <button className="link-btn" key={index} onClick={() => onOpen(ref.citing_version_id, item.page)}>
                {tr('PDF page {0}', item.page)}
              </button>)}
          </li>
        })}</ul>}
      </>}
    </article>
  </div>
}

type PaperChoice = { paper: Paper; label: string; version?: string }

function PaperDirectory({ choices, selected, topicId, onSelect }: {
  choices: PaperChoice[]; selected: string; topicId: string; onSelect: (id: string) => void
}) {
  const { tr } = useLanguage()
  const workspace = useWorkspace()
  const root = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const id = useId()
  const [open, setOpen] = useState(false)
  const [editing, edit] = useState<Paper>()
  const [alias, setAlias] = useState('')
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState('')

  useEffect(() => {
    if (!open || editing) return
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    window.addEventListener('pointerdown', outside)
    return () => window.removeEventListener('pointerdown', outside)
  }, [open, editing])

  function close() {
    setOpen(false)
    toggle.current?.focus({ preventScroll: true })
  }

  return <>
    <div className="pt-paper-directory" ref={root} onKeyDown={(event) => {
      if (!open || event.key !== 'Escape') return
      event.stopPropagation()
      close()
    }}>
      <button ref={toggle} className="pt-round" type="button" aria-expanded={open} aria-controls={open ? id : undefined}
        title={tr('Paper list')} aria-label={tr('Paper list')} onClick={() => setOpen((value) => !value)}>
        <Icon name="paperList" size={17} />
      </button>
      {open && <nav id={id} className="pt-paper-list" aria-label={tr('Papers in this reader')}>
        {choices.map(({ paper, label, version }) => <div className="pt-paper-row" key={paper.id}>
          <button className="pt-paper-open" type="button" title={paper.alias ? `${paper.alias} · ${paper.title}` : paper.title}
            aria-pressed={selected === paper.id} onClick={() => { onSelect(paper.id); close() }}>
            <Icon name="file" size={14} />
            <span>{paper.alias || label}</span>
            {version && <small>{version}</small>}
          </button>
          {paper.paperId && paper.pdfAvailable && <button type="button" className="icon-btn pt-paper-alias"
            title={tr('Edit paper alias')} aria-label={tr('Edit alias for {0}', paper.alias || label)}
            onClick={() => { setAlias(paper.alias ?? ''); setProblem(''); edit(paper) }}>
            <Icon name="edit" size={14} />
          </button>}
        </div>)}
      </nav>}
    </div>
    {editing && <Dialog title={tr('Edit paper alias')} onClose={() => { if (!saving) edit(undefined) }}>
      <p className="dialog-text">{editing.title}</p>
      <form onSubmit={async (event) => {
        event.preventDefault()
        if (!editing.paperId || saving) return
        setSaving(true)
        setProblem('')
        try {
          await workspace.write('library.set_alias', { topic_id: topicId, paper_id: editing.paperId, alias: alias.trim() })
          edit(undefined)
        } catch (error) {
          setProblem(errorText(error))
        } finally {
          setSaving(false)
        }
      }}>
        <label className="rename-field">{tr('Alias')}
          <input autoFocus placeholder={tr('Use original title')} value={alias} maxLength={80}
            onChange={(event) => setAlias(event.currentTarget.value)} />
        </label>
        {problem && <p role="alert">{tr(problem)}</p>}
        <div className="dialog-actions">
          <button className="ghost-btn" type="button" disabled={saving} onClick={() => edit(undefined)}>{tr('Cancel')}</button>
          <button className="primary" disabled={saving}>{tr('Save')}</button>
        </div>
      </form>
    </Dialog>}
  </>
}

function Reader({ pdf }: { pdf?: PdfActions }) {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const papers = papersOfTopic(state, currentTopic(state)).map((id) => paperFor(state, id))
  const historical = state.mainline && state.activeEvidence && paperFor(state, state.readerPaperId)
  const paper = historical || (papers.find((p) => p.id === state.readerPaperId) ?? papers[0])

  const [mode, setMode] = useState<'scan' | 'reading' | 'analysis'>('reading')
  useEffect(() => { setMode('reading') }, [paper?.id, state.activeEvidence?.id, pdf?.location])
  const scrollTimer=useRef<ReturnType<typeof setTimeout>>()
  useEffect(()=>()=>clearTimeout(scrollTimer.current),[paper?.id,state.activeSessionId])
  const active = state.activeEvidence
  const evidence = active && evidenceFor(state, active.id)
  const [missing, setMissing] = useState<typeof active>()
  const citation = useMemo(() => active && evidence ? {
    anchor: active.anchor, quote: evidence.quote, passage: paper?.passages.find(p => p.id === evidence.passageId)?.text, onMissing: () => setMissing(active),
  } : undefined, [active, evidence, paper?.passages])
  if (!paper) return <div className="empty-state"><h2>{tr('No papers in this topic')}</h2><button className="primary" onClick={() => act.openTopic(currentTopic(state), 'discover')}>{tr('Find papers')}</button></div>

  const choices = (papers.some((p) => p.id === paper.id) ? papers : [paper, ...papers]).map((p) => {
    const version = p.short === `${p.title} · ${p.id}` ? p.id.slice(0, 8) : undefined
    return { paper: p, label: version ? p.title : p.short, version }
  })
  const withPdf = Boolean(pdf && paper.pdfAvailable && (!active || (active.pdfPage && active !== missing)))
  const location = pdf?.location?.version === paper.id ? pdf.location : undefined
  const evidencePage = state.activeEvidence?.pdfPage
  const currentLocation = state.activeEvidence
    ? { page: evidencePage && evidencePage > 0 ? evidencePage : 1, rect: state.activeEvidence.region }
    : location
  const used = new Set<string>()
  state.messages.filter((m) => m.sessionId === state.activeSessionId)
    .forEach((m) => m.segments.forEach((s) => s.evidenceId && used.add(s.evidenceId)))
  state.cited.forEach((id) => used.add(id))
  state.noted.forEach((id) => used.add(id))
  if (state.activeEvidence) used.add(state.activeEvidence.id)

  return (
    <section className={pdf ? 'reader reader--library' : 'reader'} aria-label={tr('Paper')}>
      {pdf ? <PaperDirectory key={currentTopic(state)} topicId={currentTopic(state)} choices={choices} selected={paper.id}
        onSelect={(id) => {
          if (id === paper.id) return
          act.setReader(id)
          setMode('reading')
        }} /> : <div className="reader-bar">
        <div className="paper-tabs" role="group" aria-label={tr('Papers in this reader')}>
          {choices.map(({ paper: p, label, version }) => (
            <button key={p.id} className={p.id === paper.id ? 'on' : ''} aria-pressed={p.id === paper.id}
              title={p.short} onClick={() => act.setReader(p.id)}>
              <span className="paper-tab-label">{label}</span>
              {version && <small className="paper-tab-version">{version}</small>}
            </button>
          ))}
        </div>
        <select className="paper-picker" aria-label={tr('Paper in reader')} title={paper.short}
          value={paper.id} onChange={(event) => act.setReader(event.target.value)}>
          {choices.map(({ paper: p, label, version }) => (
            <option key={p.id} value={p.id}>{version ? `${version} · ${label}` : label}</option>
          ))}
        </select>
      </div>}
      <div className="pt-reading-content">
      {pdf && withPdf ? <><Suspense fallback={<p className="pt-pdf-loading" role="status">{tr('Opening PDF…')}</p>}>
        <PdfReader key={paper.id} topic={currentTopic(state)} version={paper.id} page={currentLocation?.page}
          session={state.activeSessionId ?? undefined} resume={!location}
          target={currentLocation?.rect} citation={citation}
          onAsk={(selection) => pdf.ask(paper.id, selection)} onFind={pdf.find} onPaperInfo={setMode}
          onWiki={() => act.navigate({ view: 'wiki', topicId: currentTopic(state) })} />
      </Suspense>
        {mode !== 'reading' && <Dialog title={tr(mode === 'scan' ? 'Paper details' : 'Paper references')} onClose={() => setMode('reading')}>
          <PaperInsights key={paper.id} paper={paper} mode={mode} onOpen={(version, page) => {
            pdf.open(version, page)
            setMode('reading')
          }} />
        </Dialog>}
      </> :
      <div className="reader-scroll scroll" onScroll={e=>{
        if(!state.mainline?.bookmark || state.activeEvidence)return
        const scroller=e.currentTarget
        clearTimeout(scrollTimer.current)
        scrollTimer.current=setTimeout(()=>{
          const top=scroller.getBoundingClientRect().top
          const p=Array.from(scroller.querySelectorAll<HTMLElement>('[data-passage-id]')).find(p=>p.getBoundingClientRect().bottom>top)
          if(p?.dataset.passageId)state.mainline?.bookmark?.(paper.id,p.dataset.passageId)
        },400)
      }}>
        <article className="paper">
          <p className="paper-venue">{paper.venue} {paper.year || ''}{paper.externalId && <> · {paper.externalId}</>}</p>
          <h1>{paper.title}</h1>
          <p className="paper-authors">{paper.authors.join(' · ')}</p>
          <div className="paper-meta">
            <span><Icon name="file" size={13} /> {paper.stored === 'full-text' ? tr('Full text')
              : paper.stored === 'excerpt' ? tr('Selected excerpts') : paper.stored === 'abstract' ? (state.mainline ? tr('Abstract stored') : tr('Abstract stored · PDF p. 1')) : tr('Metadata only')}</span>
            {paper.venueSource && <span>{tr('Venue from')}{' '}{paper.venueSource}</span>}
            {state.mainline && <span>{tr('Source version ·')}{' '}{paper.id}</span>}
          </div>

          {paper.stored !== 'metadata' ? (
            <>
              {paper.stored === 'excerpt' ? paper.passages.map((p) => (
                <section key={p.id}>
                  <h2>{p.section}{' '}{tr('· PDF p.')}{' '}{p.page}</h2>
                  <p className="abstract"><PassageText p={p} highlight={used} /></p>
                </section>
              )) : <>
                <h2>{paper.stored === 'abstract' ? tr('Abstract') : tr('Full text')}</h2>
                {state.mainline ? paper.passages.map((p) => {
                  const active = state.activeEvidence && evidenceFor(state, state.activeEvidence.id)?.passageId === p.id
                  const quote=active&&state.activeEvidence?evidenceFor(state,state.activeEvidence.id)?.quote:''
                  const match = quote ? quoteOffsets(p.text, quote) : undefined
                  return <section key={p.id} data-passage-id={p.id}>{p.page>0&&<h3>{p.section}{' '}{tr('· p.')}{' '}{p.page}</h3>}<p onMouseUp={()=>{const text=window.getSelection()?.toString().trim();if(text&&p.text.includes(text))state.mainline?.selectQuote?.(paper.id,p.id,text)}} className="abstract">
                    {match ? <>{p.text.slice(0, match[0])}<mark className="on" data-ev-anchor={state.activeEvidence?.anchor}>{p.text.slice(...match)}</mark>{p.text.slice(match[1])}</> : p.text}
                  </p><button className="link-btn quiet" onClick={()=>state.mainline?.bookmark?.(paper.id,p.id)}>{tr('Bookmark passage')}</button></section>
                }) : <p className="abstract">{paper.passages.map((p) => <PassageText key={p.id} p={p} highlight={used} />)}</p>}
              </>}
              {!state.mainline && paper.stored !== 'full-text' && <div className="fulltext-note">
                <Icon name="lock" size={15} />
                <div>
                  <strong>{tr('Full text not loaded')}</strong>
                  <p>{tr('This prototype shows the available passages. The full app will show the parsed paper with page mapping.')}</p>
                </div>
              </div>}
            </>
          ) : (
            <div className="fulltext-note">
              <Icon name="alert" size={15} />
              <div><strong>{tr('No text stored')}</strong><p>{tr('This paper was added from search metadata. Import its PDF to read it here.')}</p></div>
            </div>
          )}
        </article>
      </div>}
      </div>
    </section>
  )
}

function ReadingSplit({ selections, onSource, reader, annotations, askRegion, blocked }: {
  annotations: Annotations; askRegion?: AskRegion; blocked?: string
  selections?: ReaderAnswer[]
  onSource?: (answer: ReaderAnswer) => void
  reader: ReactNode
}) {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const layout = useRef<HTMLDivElement>(null)
  const toggleChat = useRef<HTMLButtonElement>(null)
  const restoreChat = useRef<HTMLButtonElement>(null)
  const drag = useRef<{ id: number; offset: number }>()
  const chatId = useId()
  const paperId = useId()
  const [collapsed, setCollapsed] = useState<'chat' | 'paper' | undefined>(() => {
    const session = state.sessions.find(s => s.id === state.activeSessionId)
    return session && (session.hasTurns || hasMessages(state, session.id)) || state.activeEvidence ? undefined : 'paper'
  })
  const [readerOpened, setReaderOpened] = useState(collapsed !== 'paper')
  useEffect(() => {
    if (collapsed !== 'paper') setReaderOpened(true)
  }, [collapsed])
  const [dragging, setDragging] = useState(false)
  const [width, setWidth] = useState(0)
  const [preferredShare, setPreferredShare] = useState<number>()
  const minShare = width ? Math.min(240 / width, .4) : .4
  const maxShare = .6
  const share = Math.max(minShare, Math.min(maxShare, preferredShare ?? .5))

  useEffect(() => {
    if (!layout.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(layout.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (state.activeEvidence?.scroll) setCollapsed((current) => current === 'paper' ? undefined : current)
  }, [state.activeEvidence])

  useEffect(() => {
    if (!annotations.added) return
    setCollapsed(undefined)
    const frame = requestAnimationFrame(() => annotations.input.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [annotations.added, annotations.input])

  const paperLabel = tr(collapsed === 'paper' ? 'Show paper pane' : 'Hide paper pane')
  const chatLabel = tr(collapsed === 'chat' ? 'Show conversation pane' : 'Hide conversation pane')

  return <div ref={layout} className={`read${dragging ? ' read--resizing' : ''}`}
    data-collapsed={collapsed} style={{ '--read-chat-width': `${share * 100}%` } as CSSProperties}>
    <EvidencePopover onAsk={(id) => {
      const evidence = evidenceFor(state, id)
      annotations.add({ id, version: evidence.paperId, quote: evidence.quote, passage: evidence.passageId })
      act.closeEvidence()
    }} />
    <div className="read-chat-pane" id={chatId} hidden={collapsed === 'chat'}>
      <Chat annotations={annotations} askRegion={askRegion} blocked={blocked} selections={selections} onSource={onSource && ((answer) => {
        if (collapsed === 'paper') setCollapsed(undefined)
        onSource(answer)
      })} controls={<>
        {collapsed !== 'paper' && <button ref={toggleChat} className="icon-btn sm" type="button"
          title={chatLabel} aria-label={chatLabel} aria-controls={chatId} aria-expanded
          onClick={() => {
            setCollapsed('chat')
            requestAnimationFrame(() => restoreChat.current?.focus({ preventScroll: true }))
          }}>
          <Icon name="sidebar" size={16} />
        </button>}
        <button className="icon-btn sm" type="button" title={paperLabel} aria-label={paperLabel}
          aria-controls={paperId} aria-expanded={collapsed !== 'paper'}
          onClick={() => setCollapsed(collapsed === 'paper' ? undefined : 'paper')}>
          <Icon name="panelRight" size={16} />
        </button>
      </>} />
    </div>
    {collapsed === 'chat' && <div className="read-collapsed-chat">
      <button ref={restoreChat} className="icon-btn" type="button" title={chatLabel} aria-label={chatLabel}
        aria-controls={chatId} aria-expanded={false} onClick={() => {
          setCollapsed(undefined)
          requestAnimationFrame(() => toggleChat.current?.focus({ preventScroll: true }))
        }}>
        <Icon name="sidebar" size={16} />
      </button>
    </div>}
    {!collapsed && <div className="read-divider" role="separator" tabIndex={0} aria-orientation="vertical"
      aria-label={tr('Resize paper pane')} title={tr('Drag to resize the paper pane')}
      aria-controls={paperId} aria-valuemin={Math.round((1 - maxShare) * 100)}
      aria-valuemax={Math.round((1 - minShare) * 100)} aria-valuenow={Math.round((1 - share) * 100)}
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0) return
        const { left, width: handleWidth } = event.currentTarget.getBoundingClientRect()
        drag.current = { id: event.pointerId, offset: event.clientX - left - handleWidth / 2 }
        event.currentTarget.setPointerCapture(event.pointerId)
        setDragging(true)
      }}
      onPointerMove={(event) => {
        if (drag.current?.id !== event.pointerId || !layout.current) return
        const bounds = layout.current.getBoundingClientRect()
        const next = (event.clientX - bounds.left - drag.current.offset) / bounds.width
        setPreferredShare(Math.max(minShare, Math.min(maxShare, next)))
      }}
      onLostPointerCapture={() => { drag.current = undefined; setDragging(false) }}
      onDoubleClick={() => setPreferredShare(undefined)}
      onKeyDown={(event) => {
        let next: number
        switch (event.key) {
          case 'ArrowLeft': next = share - .03; break
          case 'ArrowRight': next = share + .03; break
          case 'Home': next = maxShare; break
          case 'End': next = minShare; break
          default: return
        }
        event.preventDefault()
        setPreferredShare(Math.max(minShare, Math.min(maxShare, next)))
      }} />}
    <div className="read-paper-pane" id={paperId} hidden={collapsed === 'paper'}>{(readerOpened || collapsed !== 'paper') && reader}</div>
  </div>
}

function LiveReading({ topic, session, annotations }: { topic: string; session: string; annotations: Annotations }) {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const workspace = useWorkspace()
  const [location, setLocation] = useState<PdfActions['location']>()
  const [finding, setFinding] = useState(false)
  const answers = useRead('reader.answers', { topic_id: topic, session_id: session })?.items.slice().reverse()
  const vision = useRead('visual.capabilities', {}, annotations.items.some(a => a.selection?.medium === 'image'))
  const papers = papersOfTopic(state, topic).map((id) => paperFor(state, id)).filter((paper) => paper.pdfAvailable)
  const names = Object.fromEntries(papers.map((paper) => [paper.id, paper.short]))

  useEffect(() => {
    if (state.activeEvidence?.id) setLocation(undefined)
  }, [state.activeEvidence?.id])

  function open(version: string, page: number, rect?: Rect) {
    if (state.readerPaperId !== version || state.activeEvidence) act.setReader(version)
    setLocation({ version, page, rect })
  }

  function ask(version: string, selection: Selection) {
    annotations.add({ id: JSON.stringify([version, selection.page, selection.rect]), version, quote: selection.quote, selection })
  }

  return <>
    <ReadingSplit annotations={annotations}
      blocked={annotations.items.filter(a => a.selection?.medium === 'image').length > 1 ? tr('Send one image region at a time.') :
        annotations.items.some(a => a.selection?.medium === 'image') && !vision?.vision ? tr('Configure a local vision model to ask about images.') : undefined}
      askRegion={async (a, question) => {
        const { page, rect, rects, medium } = a.selection!
        let accepted = false
        await workspace.prepare({ topic_id: topic, session_id: session, kind: 'reader_question',
          input: { source_version_id: a.version, question, page, rect, rects, medium } }, () => { accepted = true })
        return accepted
      }} selections={answers} onSource={(answer) => open(answer.source_version_id, answer.page, answer.rect)}
      reader={<Reader pdf={{ location, open, ask, find: () => setFinding(true) }} />} />
    {finding && <FigureSearch topic={topic} versions={papers.map((paper) => paper.id)} names={names}
      onOpen={(figure) => open(figure.source_version_id, figure.page, figure.rect)}
      onAsk={(figure) => {
        open(figure.source_version_id, figure.page, figure.rect)
        ask(figure.source_version_id, { page: figure.page, rect: figure.rect, rects: [figure.rect], quote: figure.caption, medium: 'image' })
      }} onClose={() => setFinding(false)} />}
  </>
}

export function Read() {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  if (!state.activeSessionId) {
    return <div className="empty-state"><Icon name="message" size={22} /><h2>{tr('No sessions yet')}</h2><p>{tr('Create a session to start asking about the papers in this topic.')}</p><button className="primary" onClick={() => act.newSession(currentTopic(state))}><Icon name="plus" size={15} />{' '}{tr('New session')}</button></div>
  }
  return <ReadingSession key={state.activeSessionId} session={state.activeSessionId} />
}

function ReadingSession({ session }: { session: string }) {
  const { state } = useStore()
  const annotations = useAnnotations()
  if (state.mainline && !state.mainline.demo) {
    return <LiveReading annotations={annotations} topic={currentTopic(state)} session={session} />
  }
  return <ReadingSplit annotations={annotations} reader={<Reader />} />
}
