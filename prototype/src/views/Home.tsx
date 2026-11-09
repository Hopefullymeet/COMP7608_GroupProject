import { useRef, useState } from 'react'
import { hasMessages, sessionsOf, useStore } from '../data/store'
import { DEFAULT_QUESTION, DEMO_TOPIC } from '../data/fixtures'
import { Icon } from '../components/Icon'
import { plural } from '../components/util'

export function Home() {
  const { state, act } = useStore()
  const [text, setText] = useState('')
  const [over, setOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [allTopics, setAllTopics] = useState(false)
  const topics = allTopics ? state.topics : state.topics.slice(0, 4)
  const canResearch = state.topics.some((t) => t.id === DEMO_TOPIC)
  const recent = [...state.sessions].filter((s) => hasMessages(state, s.id) || s.topicId !== DEMO_TOPIC)
    .sort((a, b) => b.order - a.order).slice(0, 3)

  const submit = () => act.startFromHome(text)
  const addFiles = (files: FileList | null) => {
    const names = Array.from(files ?? []).map((f) => f.name)
    if (names.length) act.drop(names)
  }

  return (
    <div className="home">
      <div className="home-inner">
        <p className="eyebrow">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1 className="home-title">What are you researching today?</h1>
        <p className="home-sub">Start from a question or drop in papers. PaperTrace searches, reads and keeps every claim tied to its source.</p>

        <div
          className={`composer big ${over ? 'over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files) }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
            placeholder="Ask a research question, or drop PDFs here…"
            rows={3}
            aria-label="Research question"
          />
          {state.dropped.length > 0 && (
            <div className="dropped">
              {state.dropped.map((n, i) => <span key={i} className="chip"><Icon name="file" size={13} />{n}</span>)}
              <small>Files are listed but not read in this prototype.</small>
            </div>
          )}
          <div className="composer-bar">
            <button className="ghost-btn" onClick={() => fileRef.current?.click()}>
              <Icon name="paperclip" size={15} /> Add papers
            </button>
            <input ref={fileRef} type="file" accept=".pdf,.bib" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            <span className="grow" />
            <span className="hint">{canResearch ? 'Topic: Evidence in scientific QA' : 'Demo topic removed · refresh to restore'}</span>
            <button className="send" disabled={!canResearch} onClick={submit} aria-label="Start research"><Icon name="arrowUp" size={17} /></button>
          </div>
        </div>

        <button className="suggestion" disabled={!canResearch} title={canResearch ? undefined : "Refresh to restore the demo topic"} onClick={() => { setText(DEFAULT_QUESTION); act.startFromHome(DEFAULT_QUESTION) }}>
          <Icon name="compass" size={15} />
          <span>{DEFAULT_QUESTION}</span>
          <Icon name="arrowRight" size={14} />
        </button>

        <div className="home-grid">
          <section>
            <div className="list-head"><h2>Topics</h2><span>{state.topics.length} topics</span></div>
            {topics.map((t) => (
              <button key={t.id} className="topic-row" onClick={() => act.enterTopic(t.id)}>
                <span className="topic-mark" data-live={t.scripted || undefined}><Icon name="book" size={16} /></span>
                <span className="grow">
                  <strong>{t.title}</strong>
                  <small>{t.goal}</small>
                </span>
                <span className="meta">
                  {plural(t.id === DEMO_TOPIC ? state.topicPaperIds.length : t.paperCount, 'paper')} · {plural(sessionsOf(state, t.id).length, 'session')}
                  <small>{t.updated}</small>
                </span>
              </button>
            ))}
            {state.topics.length > 4 && (
              <button className="link-btn more-row" onClick={() => setAllTopics((v) => !v)}>
                {allTopics ? 'Show fewer topics' : `Show all ${state.topics.length} topics`}
              </button>
            )}
          </section>
          <section>
            <div className="list-head"><h2>Continue</h2></div>
            {recent.map((s) => (
              <button key={s.id} className="session-row" onClick={() => act.openSession(s.id)}>
                <Icon name="message" size={15} />
                <span className="grow">
                  <strong>{s.title}</strong>
                  <small>{state.topics.find((t) => t.id === s.topicId)?.title} · {s.updated}</small>
                </span>
                <Icon name="chevronRight" size={14} />
              </button>
            ))}
          </section>
        </div>
      </div>
    </div>
  )
}
