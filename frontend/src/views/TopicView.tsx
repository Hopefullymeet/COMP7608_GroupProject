import { useLanguage } from '../i18n'
import type { ReactNode } from 'react'
import { useStore, papersOfTopic, type Tab } from '../data/store'
import { DEMO_TOPIC, PAPERS } from '../data/fixtures'
import { Icon } from '../components/Icon'
import { Discover } from './Discover'
import { Read } from './Read'
import { Compare } from './Compare'
import { LiteratureWorkbench } from './LiteratureWorkbench'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'discover', label: 'Discover', icon: 'compass' },
  { id: 'read', label: 'Read & ask', icon: 'book' },
]
const COMPARE_TAB = { id: 'compare', label: 'Compare', icon: 'columns' } as const

export function TopicView({ topicId, tab, windowControls, comparison, liveResearch }: { topicId: string; tab: Tab; windowControls?: ReactNode; comparison?:ReactNode; liveResearch?:boolean }) {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const topic = state.topics.find((t) => t.id === topicId)
  if (!topic) return null
  const session = state.sessions.find((s) => s.id === state.activeSessionId && s.topicId === topicId)
  const request = state.messages.find((m) => m.sessionId === session?.id && m.role === 'user')
  const papers = papersOfTopic(state, topicId)
  const dragRegion = windowControls ? '' : undefined
  const tabs = !liveResearch && (!state.mainline || comparison) ? [...TABS, COMPARE_TAB] : TABS

  return (
    <div className="topic">
      <header className={windowControls ? 'topic-head topic-head--desktop' : 'topic-head'}
        data-tauri-drag-region={dragRegion}>
        <button className="icon-btn" onClick={() => act.navigate({ view: 'home' })} aria-label={tr('Back to home')}><Icon name="arrowLeft" /></button>
        <div className="topic-title" data-tauri-drag-region={dragRegion}>
          <h1 data-tauri-drag-region={dragRegion} title={windowControls ? topic.title : undefined}>{topic.title}</h1>
          <small data-tauri-drag-region={dragRegion}>{topic.goal}</small>
        </div>
        {topic.scripted && (
          <nav className={liveResearch ? 'tabs pt-topic-actions' : 'tabs'}
            role={liveResearch ? undefined : 'tablist'} aria-label={tr('Research tools')}>
            {tabs.map((item) => (
              <button key={item.id} role={liveResearch ? undefined : 'tab'}
                aria-current={liveResearch && tab === item.id ? 'page' : undefined}
                aria-selected={!liveResearch ? tab === item.id : undefined}
                className={tab === item.id ? 'on' : ''}
                onClick={() => act.openTopic(topicId, item.id)}>
                <Icon name={item.icon} size={15} /> {tr(item.label)}
              </button>
            ))}
          </nav>
        )}
        {!liveResearch && topic.scripted && <div className="head-meta">
          <span title={tr('Papers in this topic')}><Icon name="file" size={14} /> {papers.length}</span>
          {!state.mainline && <>
            <span title={tr('Saved notes')}><Icon name="note" size={14} /> {state.noted.length}</span>
            <span title={tr('Citations picked')}><Icon name="quote" size={14} /> {state.cited.length}</span>
          </>}
        </div>}
        {windowControls}
      </header>

      <div className="topic-body">
        {!topic.scripted ? (
          request || papers.length > 0 ? <section className="topic-request" aria-label={request ? tr('Research request') : tr('Topic materials')}>
            {request && <>
            <p className="eyebrow">{session?.title}</p>
            <h2>{tr('Research request')}</h2>
            <p className="request-text">{request.segments[0]?.text}</p>
            {!!session?.attachments?.length && <div className="dropped">
              {session.attachments.map((name, i) => <span className="chip" key={i}><Icon name="file" size={13} />{name}</span>)}
            </div>}
            <p className="fine">{tr('Your research request and attachments are available until refresh.')}</p>
            </>}
            {papers.length > 0 && <>
              <h2>{tr('Papers in this topic')}</h2>
              <ul className="topic-links">
                {papers.map((id) => <li key={id}>
                  <button className="link-btn" onClick={() => act.navigate({ view: 'library', paperId: id })}>{PAPERS[id].title}</button>
                </li>)}
              </ul>
              <button className="link-btn" onClick={() => act.navigate({ view: 'wiki', topicId })}>
                <Icon name="book" size={13} />{' '}{tr('Open this topic’s Wiki')}
              </button>
            </>}
            {state.topics.some((t) => t.id === DEMO_TOPIC) && <button className="primary" onClick={() => act.enterTopic(DEMO_TOPIC)}>{tr('Explore the scripted demo')}</button>}
          </section> : <div className="empty-state">
            <Icon name="lock" size={22} />
            <h2>{tr('This topic is sample data')}</h2>
            <p>{tr('The prototype only scripts')}{' '}<strong>{tr('Evidence in scientific QA')}</strong>{tr('. Other topics and their sessions only show how lists behave.')}</p>
            {state.topics.some((t) => t.id === DEMO_TOPIC) && <button className="primary" onClick={() => act.enterTopic(DEMO_TOPIC)}>{tr('Open the scripted topic')}</button>}
          </div>
        ) : tab === 'synthesis' && liveResearch ? <LiteratureWorkbench key={topicId} topicId={topicId} /> : tab === 'discover' ? <Discover /> : tab === 'read' ? <Read /> : (comparison ?? <Compare />)}
      </div>
    </div>
  )
}
