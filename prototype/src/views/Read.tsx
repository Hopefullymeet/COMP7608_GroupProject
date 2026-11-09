import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NEW_SESSION, useStore } from '../data/store'
import { DEMO_TOPIC, EVIDENCE, PAPERS } from '../data/fixtures'
import { QUESTIONS } from '../data/scripts'
import { Icon, Spinner } from '../components/Icon'
import { plural, scrollWithin } from '../components/util'
import type { ChatMessage, Passage } from '../data/types'

function AgentMessage({ m }: { m: ChatMessage }) {
  const { state, act } = useStore()
  const run = m.runId ? state.runs[m.runId] : undefined
  const lastStep = run?.steps[run.steps.length - 1]
  const tools = run?.steps.filter((s) => s.kind === 'tool').length ?? 0
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
          {m.segments.map((s, i) =>
            s.tone === 'scope' ? (
              <span key={i} className="scope-note"><Icon name="eye" size={13} /> {s.text}</span>
            ) : s.evidenceId ? (
              <span key={i} className={`claim ${state.activeEvidence?.id === s.evidenceId ? 'on' : ''}`}>
                {s.text}
                <button className="cite" onClick={() => act.openEvidence(s.evidenceId!, `read-${s.evidenceId}`, true)}
                  aria-label={`Show source ${numbered[i]}`}>{numbered[i]}</button>
              </span>
            ) : <span key={i}>{s.text}</span>,
          )}
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

  useEffect(() => { scrollWithin(endRef.current, '.chat-scroll', 'end') }, [messages.length, state.messages])

  const send = (t: string) => {
    if (!t.trim() || state.qaRunning) return
    act.ask(t.trim())
    setText('')
  }

  const suggestions = QUESTIONS.filter((q) => !asked.has(q.text))

  return (
    <section className="chat" aria-label="Conversation">
      <div className="chat-scroll">
        <div className="session-title">
          <Icon name="message" size={14} /> <span className="grow">{session?.title ?? NEW_SESSION}</span>
          {messages.length > 0 && <button className="link-btn" onClick={() => act.newSession(DEMO_TOPIC)}><Icon name="plus" size={13} /> New session</button>}
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

      <div className="chat-bottom">
        {suggestions.length > 0 && (
          <div className="suggest-row">
            {suggestions.map((q) => {
              const blocked = q.requires && !state.topicPaperIds.includes(q.requires)
              return (
                <button key={q.id} className="chip-btn" disabled={!!blocked || state.qaRunning} onClick={() => send(q.text)}
                  title={blocked ? `Add ${PAPERS[q.requires!].short} to the topic in Discover first` : undefined}>
                  {q.text}{blocked && <small> · needs {PAPERS[q.requires!].short}</small>}
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
            <span className="scope-pill"><Icon name="file" size={13} /> Reading scope: {state.topicPaperIds.filter((id) => PAPERS[id].stored === 'abstract').map((id) => PAPERS[id].short).join(', ')}</span>
            <span className="grow" />
            <button className="send" disabled={state.qaRunning || !text.trim()} onClick={() => send(text)} aria-label="Send"><Icon name="arrowUp" size={16} /></button>
          </div>
        </div>
      </div>
    </section>
  )
}

function PassageText({ p, highlight }: { p: Passage; highlight: Set<string> }) {
  const { state, act } = useStore()
  const anchors = Object.values(EVIDENCE)
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
  const papers = state.topicPaperIds.map((id) => PAPERS[id])
  const paper = PAPERS[state.readerPaperId] ?? papers[0]

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
          <p className="paper-venue">{paper.venue} {paper.year}{paper.externalId && <> · {paper.externalId}</>}</p>
          <h1>{paper.title}</h1>
          <p className="paper-authors">{paper.authors.join(' · ')}</p>
          <div className="paper-meta">
            <span><Icon name="file" size={13} /> {paper.stored === 'abstract' ? 'Abstract stored · PDF p. 1' : 'Metadata only'}</span>
            <span>Venue from {paper.venueSource}</span>
          </div>

          {paper.stored === 'abstract' ? (
            <>
              <h2>Abstract</h2>
              <p className="abstract">{paper.passages.map((p) => <PassageText key={p.id} p={p} highlight={used} />)}</p>
              <div className="fulltext-note">
                <Icon name="lock" size={15} />
                <div>
                  <strong>Full text not loaded</strong>
                  <p>The prototype library stores abstracts only. In the full app, the parsed paper appears here with page mapping, and the agent can read sections such as Experiments.</p>
                </div>
              </div>
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
    return <div className="empty-state"><Icon name="message" size={22} /><h2>No sessions yet</h2><p>Create a session to start asking about the papers in this topic.</p><button className="primary" onClick={() => act.newSession(DEMO_TOPIC)}><Icon name="plus" size={15} /> New session</button></div>
  }
  if (!state.topicPaperIds.length) {
    return <div className="empty-state"><h2>No papers yet</h2><button className="primary" onClick={() => act.openTopic(DEMO_TOPIC, 'discover')}>Find papers</button></div>
  }
  return (
    <div className="read">
      <Chat />
      <Reader />
    </div>
  )
}
