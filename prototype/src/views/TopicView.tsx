import { useStore, anyRunning, type Tab } from '../data/store'
import { DEMO_TOPIC } from '../data/fixtures'
import { Icon, Spinner } from '../components/Icon'
import { Discover } from './Discover'
import { Read } from './Read'
import { Compare } from './Compare'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'discover', label: 'Discover', icon: 'compass' },
  { id: 'read', label: 'Read & ask', icon: 'book' },
  { id: 'compare', label: 'Compare', icon: 'columns' },
]

export function TopicView({ topicId, tab }: { topicId: string; tab: Tab }) {
  const { state, act } = useStore()
  const topic = state.topics.find((t) => t.id === topicId)
  if (!topic) return null
  const running = anyRunning(state)

  return (
    <div className="topic">
      <header className="topic-head">
        <button className="icon-btn" onClick={() => act.navigate({ view: 'home' })} aria-label="Back to home"><Icon name="arrowLeft" /></button>
        <div className="topic-title">
          <h1>{topic.title}</h1>
          <small>{topic.goal}</small>
        </div>
        {topic.scripted && (
          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''}
                onClick={() => act.openTopic(topicId, t.id)}>
                <Icon name={t.icon} size={15} /> {t.label}
              </button>
            ))}
          </nav>
        )}
        <div className="head-meta">
          {topic.scripted && (
            <>
              <span title="Papers in this topic"><Icon name="file" size={14} /> {state.topicPaperIds.length}</span>
              <span title="Saved notes"><Icon name="note" size={14} /> {state.noted.length}</span>
              <span title="Citations picked"><Icon name="quote" size={14} /> {state.cited.length}</span>
            </>
          )}
          <button className={`trace-btn ${state.trace.open ? 'on' : ''}`} onClick={() => act.showTrace(!state.trace.open)}>
            {running ? <Spinner /> : <Icon name="trace" size={15} />} Agent trace
          </button>
        </div>
      </header>

      <div className="topic-body">
        {!topic.scripted ? (
          <div className="empty-state">
            <Icon name="lock" size={22} />
            <h2>This topic is sample data</h2>
            <p>The prototype only scripts <strong>Evidence in scientific QA</strong>. Other topics and their sessions only show how lists behave.</p>
            {state.topics.some((t) => t.id === DEMO_TOPIC) && <button className="primary" onClick={() => act.enterTopic(DEMO_TOPIC)}>Open the scripted topic</button>}
          </div>
        ) : tab === 'discover' ? <Discover /> : tab === 'read' ? <Read /> : <Compare />}
      </div>
    </div>
  )
}
