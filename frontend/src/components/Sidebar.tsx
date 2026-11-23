import { useLanguage } from '../i18n'
import { useRef, useState } from 'react'
import { hasMessages, sessionsOf, useStore, type Page } from '../data/store'
import { Icon } from './Icon'
import { LanguagePicker } from './LanguagePicker'
import { Logo } from './Logo'
import { Dialog } from './PageHead'
import { errorText } from '../api/contract'

const PAGES: { page: Page; icon: string; label: string }[] = [
  { page: 'library', icon: 'library', label: 'Library' },
  { page: 'wiki', icon: 'book', label: 'Wiki' },
  { page: 'check', icon: 'shield', label: 'Citation check' },
  { page: 'settings', icon: 'settings', label: 'Models & services' },
]

/** Lists longer than this collapse behind a "Show more" row. */
const TOPIC_LIMIT = 5
const SESSION_LIMIT = 4
const RECENT_LIMIT = 5

function ShowMore({ hidden, open, onToggle }: { hidden: number; open: boolean; onToggle: () => void }) {
  const { tr } = useLanguage()
  return (
    <button className="side-more" onClick={onToggle} aria-expanded={open}>
      <Icon name={open ? 'chevronDown' : 'chevronRight'} size={13} />
      {open ? tr('Show less') : tr('Show {0} more', hidden)}
    </button>
  )
}

export function Sidebar() {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const rename = state.mainline?.rename
  const [editing, setEditing] = useState<{ kind: 'topic' | 'session'; topicId: string; id: string; title: string }>()
  const [renameError, setRenameError] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchButton = useRef<HTMLButtonElement>(null)
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
    .filter((s) => s.hasTurns || hasMessages(state, s.id) || !state.topics.find((t) => t.id === s.topicId)?.scripted)
    .sort((a, b) => b.order - a.order)
    .slice(0, RECENT_LIMIT)

  const isOpen = (topicId: string) => !!q || (expanded[topicId] ?? topicId === activeTopic)
  const toggle = (topicId: string) => setExpanded((e) => ({ ...e, [topicId]: !isOpen(topicId) }))

  function renameButton(kind: 'topic' | 'session', topicId: string, id: string, title: string) {
    if (!rename) return null
    const label = tr(kind === 'topic' ? 'Rename topic' : 'Rename session')
    return <button className="side-delete side-rename" title={label} aria-label={label} onClick={() => {
      setRenameError('')
      setEditing({ kind, topicId, id, title })
    }}><Icon name="edit" size={14} /></button>
  }

  return (
    <aside className="workspace-sidebar">
      <button className="brand" onClick={() => act.navigate({ view: 'home' })}>
        <Logo />
        <span>
          <strong>PaperTrace</strong>
          <small>{tr('Research workspace')}</small>
        </span>
      </button>

      <nav className="side-nav" aria-label={tr('Workspace')}>
        <button className="side-item" onClick={() => { setFilter(''); setSearchOpen(false); act.newTopic() }}>
          <Icon name="plus" size={15} /> <span className="grow">{tr('New topic')}</span>
        </button>
        {PAGES.filter(p=>!state.mainline || state.mainline.pages?.includes(p.page)).map((l) => (
          <button key={l.page} className={`side-item ${route.view === l.page ? 'active' : ''}`} aria-current={route.view === l.page ? 'page' : undefined}
            onClick={() => act.navigate({ view: l.page })}>
            <Icon name={l.icon} size={15} /> <span className="grow">{tr(l.label)}</span>
            {!state.mainline && l.page === 'library' && state.dupReview === 'pending' && <span className="side-badge" title={tr('1 import needs review')}>1</span>}
          </button>
        ))}
      </nav>

      <nav className="side-section" aria-label={tr('Topics')}>
        <div className="side-label side-topic-heading">
          {tr('Topics')}
          <button type="button" ref={searchButton} className="icon-btn sm" aria-label={tr('Search topics and sessions')}
            title={tr('Search topics and sessions')} aria-expanded={searchOpen}
            onClick={() => { setFilter(''); setSearchOpen(!searchOpen) }}>
            <Icon name={searchOpen ? 'x' : 'search'} size={14} />
          </button>
        </div>
        {searchOpen && <label className="side-search">
          <input autoFocus value={filter} onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setSearchOpen(false); setFilter(''); searchButton.current?.focus() } }}
            placeholder={tr('Search topics and sessions')} aria-label={tr('Search topics and sessions')} />
        </label>}
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
                  title={tr('New session in {0}', t.title)} aria-label={tr('New session in {0}', t.title)}>
                  <Icon name="plus" size={14} />
                </button>
                {renameButton('topic', t.id, t.id, t.title)}
                {<button className="side-delete" onClick={() => act.deleteTopic(t.id)}
                  title={tr('Delete topic: {0}', t.title)} aria-label={tr('Delete topic: {0}', t.title)}>
                  <Icon name="trash" size={14} />
                </button>}
              </div>
              {open && (
                <div className="session-list">
                  {sessions.map((s) => (
                    <div key={s.id} className={`session-item ${activeSession === s.id ? 'active' : ''}`}>
                      <button className="session-open" onClick={() => act.openSession(s.id)} title={tr(s.title)}>
                        <span className="grow">{tr(s.title)}</span>
                        <small>{tr(s.updated)}</small>
                      </button>
                      {renameButton('session', s.topicId, s.id, s.title)}
                      {<button className="side-delete" onClick={() => act.deleteSession(s.id)}
                        title={tr('Delete session: {0}', s.title)} aria-label={tr('Delete session: {0}', s.title)}>
                        <Icon name="trash" size={14} />
                      </button>}
                    </div>
                  ))}
                  {all.length === 0 && <div className="side-empty">{tr('No sessions yet')}</div>}
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
        {topics.length === 0 && <div className="side-empty">{filter ? tr('Nothing matches “{0}”.', filter) : tr('No topics yet.')}</div>}
      </nav>

      {!q && (
        <div className="side-section">
          <div className="side-label">{tr('Recent sessions')}</div>
          {recents.map((s) => (
            <div key={s.id} className={`side-session ${activeSession === s.id ? 'active' : ''}`}>
              <button className="recent-open" onClick={() => act.openSession(s.id)} title={tr(s.title)}>
                <span>{tr(s.title)}</span>
                <small>{state.topics.find((t) => t.id === s.topicId)?.title} · {tr(s.updated)}</small>
              </button>
              {<button className="side-delete" onClick={() => act.deleteSession(s.id)}
                title={tr('Delete session: {0}', s.title)} aria-label={tr('Delete session: {0}', s.title)}>
                <Icon name="trash" size={14} />
              </button>}
            </div>
          ))}
        </div>
      )}

      <div className="side-foot">
        {(!state.mainline || state.mainline.demo) && <span className="proto-badge">{state.mainline ? tr('Contract demo · mock data') : tr('Prototype · mock data')}</span>}
        {(!state.mainline || state.mainline.demo) && <small>{tr('Local workspace · nothing leaves this page')}</small>}
      </div>
      <LanguagePicker />
      {editing && rename && <Dialog title={tr(editing.kind === 'topic' ? 'Rename topic' : 'Rename session')}
        onClose={() => { if (!savingName) setEditing(undefined) }}>
        <form onSubmit={async (event) => {
          event.preventDefault()
          const title = editing.title.trim()
          if (!title || savingName) return
          setSavingName(true)
          setRenameError('')
          try {
            await rename(editing.kind, editing.topicId, editing.id, title)
            setEditing(undefined)
          } catch (cause) {
            setRenameError(errorText(cause))
          } finally {
            setSavingName(false)
          }
        }}>
          <label className="rename-field">{tr('Name')}
            <input autoFocus value={editing.title} maxLength={160} required
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setEditing({ ...editing, title: event.currentTarget.value })} />
          </label>
          {renameError && <p role="alert">{tr(renameError)}</p>}
          <div className="dialog-actions">
            <button type="button" className="ghost-btn" disabled={savingName} onClick={() => setEditing(undefined)}>{tr('Cancel')}</button>
            <button className="primary" disabled={savingName || !editing.title.trim()}>{tr('Save')}</button>
          </div>
        </form>
      </Dialog>}
    </aside>
  )
}
