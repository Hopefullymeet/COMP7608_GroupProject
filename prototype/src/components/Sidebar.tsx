import { useState } from 'react'
import { hasMessages, sessionsOf, useStore, type Page } from '../data/store'
import { Icon } from './Icon'
import { Logo } from './Logo'

const PAGES: { page: Page; icon: string; label: string }[] = [
  { page: 'library', icon: 'library', label: 'Library' },
  { page: 'wiki', icon: 'wiki', label: 'Evidence wiki' },
  { page: 'check', icon: 'shield', label: 'Citation check' },
  { page: 'settings', icon: 'settings', label: 'Models & services' },
]

/** Lists longer than this collapse behind a "Show more" row. */
const TOPIC_LIMIT = 5
const SESSION_LIMIT = 4
const RECENT_LIMIT = 5

function ShowMore({ hidden, open, onToggle }: { hidden: number; open: boolean; onToggle: () => void }) {
  return (
    <button className="side-more" onClick={onToggle} aria-expanded={open}>
      <Icon name={open ? 'chevronDown' : 'chevronRight'} size={13} />
      {open ? 'Show less' : `Show ${hidden} more`}
    </button>
  )
}

export function Sidebar() {
  const { state, act } = useStore()
  const [filter, setFilter] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [allTopics, setAllTopics] = useState(false)
  const [allSessions, setAllSessions] = useState<Record<string, boolean>>({})
  const route = state.route
  const activeTopic = route.view === 'topic' ? route.topicId : null
  const activeSession = route.view === 'topic' && route.tab === 'read' ? state.activeSessionId : null

  const q = filter.trim().toLowerCase()
  const match = (text: string) => !q || text.toLowerCase().includes(q)
  const topics = state.topics.filter((t) => match(t.title) || sessionsOf(state, t.id).some((s) => match(s.title)))
  const shownTopics = q || allTopics ? topics : topics.slice(0, TOPIC_LIMIT)
  const recents = [...state.sessions]
    .filter((s) => hasMessages(state, s.id) || !state.topics.find((t) => t.id === s.topicId)?.scripted)
    .sort((a, b) => b.order - a.order)
    .slice(0, RECENT_LIMIT)

  const isOpen = (topicId: string) => !!q || (expanded[topicId] ?? topicId === activeTopic)
  const toggle = (topicId: string) => setExpanded((e) => ({ ...e, [topicId]: !isOpen(topicId) }))

  return (
    <aside className="sidebar">
      <button className="brand" onClick={() => act.navigate({ view: 'home' })}>
        <Logo />
        <span>
          <strong>PaperTrace</strong>
          <small>Research workspace</small>
        </span>
      </button>

      <label className="side-search">
        <Icon name="search" size={15} />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search" aria-label="Search topics and sessions" />
      </label>

      <nav className="side-nav" aria-label="Workspace">
        <button className="side-item" onClick={() => { setFilter(''); act.newTopic() }}>
          <Icon name="plus" size={15} /> <span className="grow">New topic</span>
        </button>
        {PAGES.map((l) => (
          <button key={l.page} className={`side-item ${route.view === l.page ? 'active' : ''}`} aria-current={route.view === l.page ? 'page' : undefined}
            onClick={() => act.navigate({ view: l.page })}>
            <Icon name={l.icon} size={15} /> <span className="grow">{l.label}</span>
            {l.page === 'library' && state.dupReview === 'pending' && <span className="side-badge" title="1 import needs review">1</span>}
          </button>
        ))}
      </nav>

      <nav className="side-section" aria-label="Topics">
        <div className="side-label">Topics</div>
        {shownTopics.map((t) => {
          const open = isOpen(t.id)
          const all = sessionsOf(state, t.id).filter((s) => !q || match(t.title) || match(s.title))
          const sessions = allSessions[t.id] || q ? all : all.slice(0, SESSION_LIMIT)
          return (
            <div key={t.id} className="topic-node">
              <div className={`side-item topic-item ${activeTopic === t.id && !activeSession ? 'active' : ''} ${activeTopic === t.id ? 'current' : ''}`}>
                <button className="topic-toggle" onClick={() => toggle(t.id)} aria-expanded={open}>
                  <Icon name="chevronRight" size={13} className={open ? 'caret turned' : 'caret'} />
                  <span className="topic-name">{t.title}</span>
                </button>
                <button className="topic-new" onClick={() => { if (t.scripted) act.newSession(t.id); else act.enterTopic(t.id); setExpanded((e) => ({ ...e, [t.id]: true })) }}
                  title={`New session in ${t.title}`} aria-label={`New session in ${t.title}`}>
                  <Icon name="plus" size={14} />
                </button>
                <button className="side-delete" onClick={() => act.deleteTopic(t.id)}
                  title={`Delete topic: ${t.title}`} aria-label={`Delete topic: ${t.title}`}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
              {open && (
                <div className="session-list">
                  {sessions.map((s) => (
                    <div key={s.id} className={`session-item ${activeSession === s.id ? 'active' : ''}`}>
                      <button className="session-open" onClick={() => act.openSession(s.id)} title={s.title}>
                        <span className="grow">{s.title}</span>
                        <small>{s.updated}</small>
                      </button>
                      <button className="side-delete" onClick={() => act.deleteSession(s.id)}
                        title={`Delete session: ${s.title}`} aria-label={`Delete session: ${s.title}`}>
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  ))}
                  {all.length === 0 && <div className="side-empty">No sessions yet</div>}
                  {!q && all.length > SESSION_LIMIT && (
                    <ShowMore hidden={all.length - SESSION_LIMIT} open={!!allSessions[t.id]}
                      onToggle={() => setAllSessions((m) => ({ ...m, [t.id]: !m[t.id] }))} />
                  )}
                </div>
              )}
            </div>
          )
        })}
        {!q && topics.length > TOPIC_LIMIT && (
          <ShowMore hidden={topics.length - TOPIC_LIMIT} open={allTopics} onToggle={() => setAllTopics((v) => !v)} />
        )}
        {topics.length === 0 && <div className="side-empty">Nothing matches “{filter}”.</div>}
      </nav>

      {!q && (
        <div className="side-section">
          <div className="side-label">Recent sessions</div>
          {recents.map((s) => (
            <div key={s.id} className={`side-session ${activeSession === s.id ? 'active' : ''}`}>
              <button className="recent-open" onClick={() => act.openSession(s.id)} title={s.title}>
                <span>{s.title}</span>
                <small>{state.topics.find((t) => t.id === s.topicId)?.title} · {s.updated}</small>
              </button>
              <button className="side-delete" onClick={() => act.deleteSession(s.id)}
                title={`Delete session: ${s.title}`} aria-label={`Delete session: ${s.title}`}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="side-foot">
        <span className="proto-badge">Prototype · mock data</span>
        <small>Local workspace · nothing leaves this page</small>
      </div>
    </aside>
  )
}
