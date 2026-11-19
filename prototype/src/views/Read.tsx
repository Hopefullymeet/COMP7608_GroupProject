import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NEW_SESSION, allEvidence, currentTopic, evidenceFor, paperFor, papersOfTopic, sourceStatus, useStore } from '../data/store'
import { QUESTIONS } from '../data/scripts'
import { Icon, Spinner } from '../components/Icon'
import { plural, scrollWithin } from '../components/util'
import type { ChatMessage, Passage } from '../data/types'

function AgentMessage({ m }: { m: ChatMessage }) {
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
        {!m.done && <span className="working"><Spinner /> {lastStep?.title ?? 'Planning…'}</span>}
      </div>
      {m.segments.length > 0 && (
        <p className="answer">
          {m.segments.map((s, i) => {
            if (s.tone === 'scope') return <span key={i} className="scope-note"><Icon name="eye" size={13} /> {s.text}</span>
            if (state.mainline && s.evidenceIds?.length) return <span key={i} className="claim">
              {s.text}{s.evidenceIds.map((id, index) => <button key={id} className="cite"
                aria-label={`Show source ${index + 1} for sentence ${i + 1}`}
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
                  aria-label={`Show source ${numbered[i]}${status === 'available' ? '' : ` · ${status}`}`}>{numbered[i]}</button>
              </span>
            )
          })}
        </p>
      )}
      {m.done && run && (
        <div className="msg-foot">
          <span className={`run-chip ${run.status}`}>{run.status === 'partial' ? 'Partial' : 'Done'}</span>
          <span>{plural(run.steps.length, 'step')} · {plural(tools, 'tool call')}</span>
          <button className="link-btn" onClick={() => act.showTrace(true, run.id)}>View trace</button>
        </div>
      )}
    </div>
  )
}

function Chat() {
  const { state, act } = useStore()
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const session = state.sessions.find((s) => s.id === state.activeSessionId)
  const messages = state.messages.filter((m) => m.sessionId === session?.id)
  const asked = new Set(messages.filter((m) => m.role === 'user').map((m) => m.segments[0]?.text))
  const papers = papersOfTopic(state, currentTopic(state))

  useEffect(() => { scrollWithin(endRef.current, '.chat-scroll', 'end') }, [messages.length, state.messages])

  const send = (t: string) => {
    if (!t.trim() || state.qaRunning) return
    if (act.ask(t.trim()) === false) return
    setText('')
  }

  const readable = papers.filter((id) => paperFor(state, id).stored !== 'metadata')
  const selected = readable.includes(state.readerPaperId) ? state.readerPaperId : readable[0]
  const suggestions = (state.mainline
    ? state.mainline.demo ? [{ id: 'pubmedqa', text: 'What context does PubMedQA provide to the model?', requires: undefined }] : []
    : QUESTIONS).filter((q) => !asked.has(q.text))

  return (
    <section className="chat" aria-label="Conversation">
      <div className="chat-scroll">
        <div className="session-title">
          <Icon name="message" size={14} /> <span className="grow">{session?.title ?? NEW_SESSION}</span>
          {messages.length > 0 && <button className="link-btn" onClick={() => act.newSession(currentTopic(state))}><Icon name="plus" size={13} /> New session</button>}
        </div>
        {messages.length === 0 && (
          <div className="chat-empty">
            <h2>Start a fresh reading question</h2>
            <p>Explore dataset size and question collection, then compare evaluation results. Papers are shared across this topic; this conversation starts empty.</p>
          </div>
        )}
        {messages.map((m) =>
          m.role === 'user'
            ? <div key={m.id} className="msg user"><p>{m.segments[0]?.text}</p></div>
            : <AgentMessage key={m.id} m={m} />,
        )}
        <div ref={endRef} />
      </div>

      {(state.mainline ? readable.length > 0 : papers.length > 0) && <div className="chat-bottom">
        {suggestions.length > 0 && (
          <div className="suggest-row">
            {suggestions.map((q) => {
              const blocked = state.mainline ? null : !papers.includes('qasper') ? 'qasper' : q.requires && !papers.includes(q.requires) ? q.requires : null
              return (
                <button key={q.id} className="chip-btn" disabled={!!blocked || state.qaRunning} onClick={() => send(q.text)}
                  title={blocked ? `Add ${paperFor(state, blocked).short} to the topic first` : undefined}>
                  {q.text}{blocked && <small> · needs {paperFor(state, blocked).short}</small>}
                </button>
              )
            })}
          </div>
        )}
        <div className="composer">
          <textarea value={text} rows={2} placeholder={messages.length ? 'Ask a follow-up…' : 'Ask about these papers…'} aria-label="Ask a follow-up"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text) } }} />
          <div className="composer-bar">
            <span className="scope-pill"><Icon name="file" size={13} /> Reading scope: {(state.mainline && selected ? [selected] : readable).map((id) => paperFor(state, id).short).join(', ')}</span>
            <span className="grow" />
            <button className="send" disabled={state.qaRunning || !text.trim()} onClick={() => send(text)} aria-label="Send"><Icon name="arrowUp" size={16} /></button>
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

function Reader() {
  const { state, act } = useStore()
  const papers = papersOfTopic(state, currentTopic(state)).map((id) => paperFor(state, id))
  const historical = state.mainline && state.activeEvidence && paperFor(state, state.readerPaperId)
  const paper = historical || (papers.find((p) => p.id === state.readerPaperId) ?? papers[0])

  if (!paper) return <div className="empty-state"><h2>No papers in this topic</h2><button className="primary" onClick={() => act.openTopic(currentTopic(state), 'discover')}>Find papers</button></div>

  const used = new Set<string>()
  state.messages.filter((m) => m.sessionId === state.activeSessionId)
    .forEach((m) => m.segments.forEach((s) => s.evidenceId && used.add(s.evidenceId)))
  state.cited.forEach((id) => used.add(id))
  state.noted.forEach((id) => used.add(id))
  if (state.activeEvidence) used.add(state.activeEvidence.id)

  return (
    <section className="reader" aria-label="Paper">
      <div className="reader-bar">
        <div className="paper-tabs">
          {papers.map((p) => (
            <button key={p.id} className={p.id === paper.id ? 'on' : ''} onClick={() => act.setReader(p.id)}>{p.short}</button>
          ))}
        </div>
        <div className="view-toggle">
          <button className="on">Reading view</button>
          <button disabled title="PDF.js view comes later">Original PDF <Icon name="lock" size={11} /></button>
        </div>
      </div>

      <div className="reader-scroll scroll">
        <article className="paper">
          <p className="paper-venue">{paper.venue} {paper.year || ''}{paper.externalId && <> · {paper.externalId}</>}</p>
          <h1>{paper.title}</h1>
          <p className="paper-authors">{paper.authors.join(' · ')}</p>
          <div className="paper-meta">
            <span><Icon name="file" size={13} /> {paper.stored === 'full-text' ? 'Full text'
              : paper.stored === 'excerpt' ? 'Selected excerpts' : paper.stored === 'abstract' ? (state.mainline ? 'Abstract stored' : 'Abstract stored · PDF p. 1') : 'Metadata only'}</span>
            {paper.venueSource && <span>Venue from {paper.venueSource}</span>}
            {state.mainline && <span>Source version · {paper.id}</span>}
          </div>

          {paper.stored !== 'metadata' ? (
            <>
              {paper.stored === 'excerpt' ? paper.passages.map((p) => (
                <section key={p.id}>
                  <h2>{p.section} · PDF p. {p.page}</h2>
                  <p className="abstract"><PassageText p={p} highlight={used} /></p>
                </section>
              )) : <>
                <h2>{paper.stored === 'abstract' ? 'Abstract' : 'Full text'}</h2>
                {state.mainline ? paper.passages.map((p) => {
                  const active = state.activeEvidence && evidenceFor(state, state.activeEvidence.id)?.passageId === p.id
                  return <p className={`abstract${active ? ' located-passage' : ''}`} key={p.id}
                    data-ev-anchor={active ? state.activeEvidence?.anchor : undefined}>{p.text}</p>
                }) : <p className="abstract">{paper.passages.map((p) => <PassageText key={p.id} p={p} highlight={used} />)}</p>}
              </>}
              {!state.mainline && paper.stored !== 'full-text' && <div className="fulltext-note">
                <Icon name="lock" size={15} />
                <div>
                  <strong>Full text not loaded</strong>
                  <p>This prototype shows the available passages. The full app will show the parsed paper with page mapping.</p>
                </div>
              </div>}
            </>
          ) : (
            <div className="fulltext-note">
              <Icon name="alert" size={15} />
              <div><strong>No text stored</strong><p>This paper was added from search metadata. Import its PDF to read it here.</p></div>
            </div>
          )}
        </article>
      </div>
    </section>
  )
}

export function Read() {
  const { state, act } = useStore()
  if (!state.activeSessionId) {
    return <div className="empty-state"><Icon name="message" size={22} /><h2>No sessions yet</h2><p>Create a session to start asking about the papers in this topic.</p><button className="primary" onClick={() => act.newSession(currentTopic(state))}><Icon name="plus" size={15} /> New session</button></div>
  }
  return (
    <div className="read">
      <Chat />
      <Reader />
    </div>
  )
}
