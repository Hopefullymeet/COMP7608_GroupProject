import { count, useLanguage } from '../i18n'
import { lazy, Suspense, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { NEW_SESSION, allEvidence, currentTopic, evidenceFor, paperFor, papersOfTopic, sourceStatus, useStore } from '../data/store'
import { QUESTIONS } from '../data/scripts'
import { Icon, Spinner } from '../components/Icon'
import { Disclosure } from '../components/Disclosure'
import { scrollWithin } from '../components/util'
import { useRead, useWorkspace } from '../data/WorkspaceProvider'
import { Dialog } from '../components/PageHead'
import { FigureSearch } from '../components/FigureSearch'
import { PublicationDetails } from '../components/PublicationDetails'
import { errorText } from '../api/contract'
import type { ReaderAnswer, Rect, Selection } from '../api/reader'
import type { ChatMessage, Paper, Passage } from '../data/types'

const PdfReader = lazy(() => import('./PdfReader'))

type Location = { page: number; rect?: Rect }

function AgentMessage({ m }: { m: ChatMessage }) {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const run = m.runId ? state.runs[m.runId] : undefined
  const lastStep = run?.steps[run.steps.length - 1]
  const tools = run?.steps.filter((s) => s.kind === 'tool').length ?? 0
  const papers = papersOfTopic(state, currentTopic(state))
  let n = 0
  const numbered = m.segments.map((s) => (s.evidenceId ? ++n : 0))

  return (
    <div className="msg agent">
      <div className="msg-who">
        <span className="avatar">P</span> PaperTrace
        {!m.done && <span className="working"><Spinner /> {tr(lastStep?.title ?? 'Planning…')}</span>}
      </div>
      {m.segments.length > 0 && (
        <p className="answer">
          {m.segments.map((s, i) => {
            if (s.tone === 'scope') return <span key={i} className="scope-note"><Icon name="eye" size={13} /> {s.text}</span>
            if (state.mainline && s.evidenceIds?.length) return <span key={i} className="claim">
              {s.text}{s.evidenceIds.map((id, index) => <button key={id} className="cite"
                aria-label={tr('Show source {0} for sentence {1}', index + 1, i + 1)}
                onClick={() => act.openEvidence(id, '', true)}>{index + 1}</button>)}
            </span>
            if (!s.evidenceId) return <span key={i}>{s.text}</span>
            const source = evidenceFor(state, s.evidenceId)
            const status = sourceStatus(state, source.paperId)
            const jump = status === 'available' && papers.includes(source.paperId)
            const anchor = `chat-${m.id}-${i}`
            return (
              <span key={i} className={`claim ${state.activeEvidence?.id === source.id ? 'on' : ''}`}>
                {s.text}
                <button className={`cite ${status !== 'available' ? 'gone' : ''}`} data-ev-anchor={anchor}
                  onClick={() => act.openEvidence(source.id, jump ? `read-${source.id}` : anchor, jump)}
                  aria-label={tr('Show source {0}{1}', numbered[i], status === 'available' ? '' : ` · ${tr(status)}`)}>{numbered[i]}</button>
              </span>
            )
          })}
        </p>
      )}
      {m.done && state.mainline?.saveAnswer && <button className="link-btn" onClick={()=>state.mainline?.saveAnswer?.(m)}>{tr('Save answer as note')}</button>}
      {m.done && run && (
        <div className="msg-foot">
          <span className={`run-chip ${run.status}`}>{run.status === 'partial' ? tr('Partial') : tr('Done')}</span>
          <span>{count(tr, run.steps.length, 'step')} · {count(tr, tools, 'tool call')}</span>
          <button className="link-btn" onClick={() => act.showTrace(true, run.id)}>{tr('View trace')}</button>
        </div>
      )}
    </div>
  )
}

function Chat({ selections = [], onSource }: { selections?: ReaderAnswer[]; onSource?: (answer: ReaderAnswer) => void }) {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const session = state.sessions.find((s) => s.id === state.activeSessionId)
  const messages = state.messages.filter((m) => m.sessionId === session?.id)
  const asked = new Set(messages.filter((m) => m.role === 'user').map((m) => m.segments[0]?.text))
  const papers = papersOfTopic(state, currentTopic(state))

  useEffect(() => { scrollWithin(endRef.current, '.chat-scroll', 'end') }, [messages.length, state.messages, selections.length])

  const send = (t: string) => {
    if (!t.trim() || state.qaRunning) return
    if (act.ask(t.trim()) === false) return
    setText('')
  }

  const readable = papers.filter((id) => paperFor(state, id).stored !== 'metadata')
  const selected = readable.includes(state.readerPaperId) ? state.readerPaperId : readable[0]
  const readingScope = state.mainline?.readVersions?.length ? state.mainline.readVersions : [selected]
  const suggestions = (state.mainline
    ? state.mainline.demo ? [{ id: 'pubmedqa', text: 'What context does PubMedQA provide to the model?', requires: undefined },{id:'limits',text:'What does the abstract establish about the conclusions?',requires:undefined}] : []
    : QUESTIONS).filter((q) => !asked.has(q.text))

  return (
    <section className="chat" aria-label={tr('Conversation')}>
      <div className="chat-scroll">
        <div className="session-title">
          <Icon name="message" size={14} /> <span className="grow">{tr(session?.title ?? NEW_SESSION)}</span>
          {messages.length > 0 && <button className="link-btn" onClick={() => act.newSession(currentTopic(state))}><Icon name="plus" size={13} />{' '}{tr('New session')}</button>}
        </div>
        {messages.length === 0 && selections.length === 0 && (
          <div className="chat-empty">
            <h2>{tr('Start a fresh reading question')}</h2>
            <p>{tr(state.mainline?.demo || !state.mainline ? 'Explore dataset size and question collection, then compare evaluation results. Papers are shared across this topic; this conversation starts empty.' : 'Ask about a paper or select a passage to use it in your question.')}</p>
          </div>
        )}
        {messages.map((m) =>
          m.role === 'user'
            ? <div key={m.id} className="msg user"><p>{m.segments[0]?.text}</p></div>
            : <AgentMessage key={m.id} m={m} />,
        )}
        {selections.map((answer) => <div key={answer.id}>
          <div className="msg user"><p>{answer.question}</p></div>
          <div className="msg agent">
            <div className="msg-who"><span className="avatar">P</span> PaperTrace</div>
            <p className="answer pt-reader-response">{answer.answer}</p>
            <button className="link-btn" onClick={() => onSource?.(answer)}>
              {paperFor(state, answer.source_version_id)?.short} · {tr('PDF page {0}', answer.page)}
            </button>
          </div>
        </div>)}
        <div ref={endRef} />
      </div>

      {(state.mainline ? readable.length > 0 : papers.length > 0) && <div className="chat-bottom">
        {suggestions.length > 0 && (
          <div className="suggest-row">
            {suggestions.map((q) => {
              const blocked = state.mainline ? null : !papers.includes('qasper') ? 'qasper' : q.requires && !papers.includes(q.requires) ? q.requires : null
              return (
                <button key={q.id} className="chip-btn" disabled={!!blocked || state.qaRunning} onClick={() => send(q.text)}
                  title={blocked ? tr('Add {0} to the topic first', paperFor(state, blocked).short) : undefined}>
                  {tr(q.text)}{blocked && <small>{' '}{tr('· needs')}{' '}{paperFor(state, blocked).short}</small>}
                </button>
              )
            })}
          </div>
        )}
        <div className="composer">
          <textarea value={text} rows={2} placeholder={messages.length ? tr('Ask a follow-up…') : tr('Ask about these papers…')} aria-label={tr('Ask a follow-up')}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text) } }} />
          <div className="composer-bar">
            {state.mainline && readable.length > 1 ? (
              <Disclosure className="scope-select" icon="book" title={tr('Reading scope ({0})', readingScope.length)}>
                <div className="card scope-options">
                  {readable.map((id) => (
                    <label key={id} className="check-row">
                      <input type="checkbox" checked={readingScope.includes(id)}
                        onChange={(e) => state.mainline?.selectVersions?.(e.target.checked
                          ? [...readingScope, id] : readingScope.filter((version) => version !== id))} />
                      <span>{paperFor(state, id).short}</span>
                    </label>
                  ))}
                </div>
              </Disclosure>
            ) : (
              <span className="scope-pill"><Icon name="file" size={13} />{' '}{tr('Reading scope:')}{' '}{(state.mainline && selected ? readingScope : readable).map((id) => paperFor(state, id).short).join(', ')}</span>
            )}
            <span className="grow" />
            <button className="send" disabled={state.qaRunning || !text.trim()} onClick={() => send(text)} aria-label={tr('Send')}><Icon name="arrowUp" size={16} /></button>
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
  if (!paper) return <div className="empty-state"><h2>{tr('No papers in this topic')}</h2><button className="primary" onClick={() => act.openTopic(currentTopic(state), 'discover')}>{tr('Find papers')}</button></div>

  const choices = (papers.some((p) => p.id === paper.id) ? papers : [paper, ...papers]).map((p) => {
    const version = p.short === `${p.title} · ${p.id}` ? p.id.slice(0, 8) : undefined
    return { paper: p, label: version ? p.title : p.short, version }
  })
  const withPdf = Boolean(pdf && paper.pdfAvailable)
  const location = pdf?.location?.version === paper.id ? pdf.location : undefined
  const evidencePage = state.activeEvidence?.pdfPage
  const currentLocation = location ?? { page: evidencePage && evidencePage > 0 ? evidencePage : 1, rect: state.activeEvidence?.region }
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
        <PdfReader key={paper.id} topic={currentTopic(state)} version={paper.id} page={currentLocation.page}
          session={state.activeSessionId ?? undefined} resume={!location && !state.activeEvidence}
          target={currentLocation.rect}
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
                  const at=quote?p.text.indexOf(quote):-1
                  return <section key={p.id} data-passage-id={p.id}>{p.page>0&&<h3>{p.section}{' '}{tr('· p.')}{' '}{p.page}</h3>}<p onMouseUp={()=>{const text=window.getSelection()?.toString().trim();if(text&&p.text.includes(text))state.mainline?.selectQuote?.(paper.id,p.id,text)}} className={`abstract${active ? ' located-passage' : ''}`} key={p.id}
                    data-ev-anchor={active ? state.activeEvidence?.anchor : undefined}>{quote&&at>=0?<>{p.text.slice(0,at)}<mark>{quote}</mark>{p.text.slice(at+quote.length)}</>:p.text}</p><button className="link-btn quiet" onClick={()=>state.mainline?.bookmark?.(paper.id,p.id)}>{tr('Bookmark passage')}</button></section>
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

function LiveReading({ topic, session }: { topic: string; session: string }) {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const workspace = useWorkspace()
  const [location, setLocation] = useState<PdfActions['location']>()
  const [finding, setFinding] = useState(false)
  const [picked, setPicked] = useState<{ version: string; selection: Selection }>()
  const [question, setQuestion] = useState('')
  const answers = useRead('reader.answers', { topic_id: topic, session_id: session })?.items.slice().reverse()
  const vision = useRead('visual.capabilities', {}, picked?.selection.medium === 'image')
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
    setQuestion('')
    setPicked({ version, selection })
  }

  return <div className="read">
    <Chat selections={answers} onSource={(answer) => open(answer.source_version_id, answer.page, answer.rect)} />
    <Reader pdf={{ location, open, ask, find: () => setFinding(true) }} />
    {finding && <FigureSearch topic={topic} versions={papers.map((paper) => paper.id)} names={names}
      onOpen={(figure) => open(figure.source_version_id, figure.page, figure.rect)}
      onAsk={(figure) => {
        open(figure.source_version_id, figure.page, figure.rect)
        ask(figure.source_version_id, { page: figure.page, rect: figure.rect, rects: [figure.rect], quote: figure.caption, medium: 'image' })
      }} onClose={() => setFinding(false)} />}
    {picked && <Dialog title={tr('Ask about this selection')} onClose={() => setPicked(undefined)}>
      <form className="pt-reader-note" onSubmit={(event) => {
        event.preventDefault()
        if (!question.trim()) return
        const { page, rect, rects, medium } = picked.selection
        void workspace.prepare({ topic_id: topic, session_id: session, kind: 'reader_question',
          input: { source_version_id: picked.version, question: question.trim(), page, rect, rects, medium } })
        setPicked(undefined)
      }}>
        {picked.selection.quote && <blockquote className="evidence-excerpt">{picked.selection.quote}</blockquote>}
        <textarea autoFocus required maxLength={2000} aria-label={tr('Question')}
          placeholder={tr('Ask a follow-up…')} value={question} onChange={(event) => setQuestion(event.currentTarget.value)} />
        {picked.selection.medium === 'image' && vision && !vision.vision &&
          <p className="fine">{tr('Configure a local vision model to ask about images.')}</p>}
        <div className="dialog-actions">
          <button type="button" className="ghost-btn" onClick={() => setPicked(undefined)}>{tr('Cancel')}</button>
          <button className="primary" disabled={workspace.busy || !question.trim() || (picked.selection.medium === 'image' && !vision?.vision)}>{tr('Ask AI')}</button>
        </div>
      </form>
    </Dialog>}
  </div>
}

export function Read() {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  if (!state.activeSessionId) {
    return <div className="empty-state"><Icon name="message" size={22} /><h2>{tr('No sessions yet')}</h2><p>{tr('Create a session to start asking about the papers in this topic.')}</p><button className="primary" onClick={() => act.newSession(currentTopic(state))}><Icon name="plus" size={15} />{' '}{tr('New session')}</button></div>
  }
  if (state.mainline && !state.mainline.demo) {
    return <LiveReading key={state.activeSessionId} topic={currentTopic(state)} session={state.activeSessionId} />
  }
  return (
    <div className="read">
      <Chat />
      <Reader />
    </div>
  )
}
