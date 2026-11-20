import { count, useLanguage } from '../i18n'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NEW_SESSION, allEvidence, currentTopic, evidenceFor, paperFor, papersOfTopic, sourceStatus, useStore } from '../data/store'
import { QUESTIONS } from '../data/scripts'
import { Icon, Spinner } from '../components/Icon'
import { Disclosure } from '../components/Disclosure'
import { scrollWithin } from '../components/util'
import type { ChatMessage, Passage } from '../data/types'

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

function Chat() {
  const { tr } = useLanguage()
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
        {messages.length === 0 && (
          <div className="chat-empty">
            <h2>{tr('Start a fresh reading question')}</h2>
            <p>{tr('Explore dataset size and question collection, then compare evaluation results. Papers are shared across this topic; this conversation starts empty.')}</p>
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

function Reader() {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const papers = papersOfTopic(state, currentTopic(state)).map((id) => paperFor(state, id))
  const historical = state.mainline && state.activeEvidence && paperFor(state, state.readerPaperId)
  const paper = historical || (papers.find((p) => p.id === state.readerPaperId) ?? papers[0])

  const scrollTimer=useRef<ReturnType<typeof setTimeout>>()
  useEffect(()=>()=>clearTimeout(scrollTimer.current),[paper?.id,state.activeSessionId])
  if (!paper) return <div className="empty-state"><h2>{tr('No papers in this topic')}</h2><button className="primary" onClick={() => act.openTopic(currentTopic(state), 'discover')}>{tr('Find papers')}</button></div>

  const choices = (papers.some((p) => p.id === paper.id) ? papers : [paper, ...papers]).map((p) => {
    const version = p.short === `${p.title} · ${p.id}` ? p.id.slice(0, 8) : undefined
    return { paper: p, label: version ? p.title : p.short, version }
  })
  const used = new Set<string>()
  state.messages.filter((m) => m.sessionId === state.activeSessionId)
    .forEach((m) => m.segments.forEach((s) => s.evidenceId && used.add(s.evidenceId)))
  state.cited.forEach((id) => used.add(id))
  state.noted.forEach((id) => used.add(id))
  if (state.activeEvidence) used.add(state.activeEvidence.id)

  return (
    <section className="reader" aria-label={tr('Paper')}>
      <div className="reader-bar">
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
        <div className="view-toggle">
          <button className="on" aria-pressed="true">{tr('Reading')}</button>
          <button disabled={!state.mainline?.original} onClick={()=>state.mainline?.original?.(paper.id)}>{tr('Original PDF')}</button>
        </div>
      </div>

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
      </div>
    </section>
  )
}

export function Read() {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  if (!state.activeSessionId) {
    return <div className="empty-state"><Icon name="message" size={22} /><h2>{tr('No sessions yet')}</h2><p>{tr('Create a session to start asking about the papers in this topic.')}</p><button className="primary" onClick={() => act.newSession(currentTopic(state))}><Icon name="plus" size={15} />{' '}{tr('New session')}</button></div>
  }
  return (
    <div className="read">
      <Chat />
      <Reader />
    </div>
  )
}
