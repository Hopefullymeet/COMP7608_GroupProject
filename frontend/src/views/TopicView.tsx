import { useLanguage } from '../i18n'
import type { ReactNode } from 'react'
import { useStore, anyRunning, papersOfTopic, type Tab } from '../data/store'
import { DEMO_TOPIC, PAPERS } from '../data/fixtures'
import { Icon, Spinner } from '../components/Icon'
import { Discover } from './Discover'
import { Read } from './Read'
import { Compare } from './Compare'
import { LiteratureWorkbench } from './LiteratureWorkbench'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'discover', label: 'Discover', icon: 'compass' },
  { id: 'read', label: 'Read & ask', icon: 'book' },
  { id: 'compare', label: 'Compare', icon: 'columns' },
  { id: 'synthesis', label: 'Synthesize', icon: 'note' },
]

export function TopicView({ topicId, tab, windowControls, comparison, liveResearch }: { topicId: string; tab: Tab; windowControls?: ReactNode; comparison?:ReactNode; liveResearch?:boolean }) {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const topic = state.topics.find((t) => t.id === topicId)
  if (!topic) return null
  const running = anyRunning(state)
  const session = state.sessions.find((s) => s.id === state.activeSessionId && s.topicId === topicId)
  const request = state.messages.find((m) => m.sessionId === session?.id && m.role === 'user')
  const papers = papersOfTopic(state, topicId)
  const tabs = TABS.filter((item) => item.id === 'synthesis' ? liveResearch : !state.mainline || (item.id !== 'compare' || !!comparison))

  return (
    <div className="topic">
      <header className={windowControls ? 'topic-head topic-head--desktop' : 'topic-head'}
        data-tauri-drag-region={windowControls ? '' : undefined}>
        <button className="icon-btn" onClick={() => act.navigate({ view: 'home' })} aria-label={tr('Back to home')}><Icon name="arrowLeft" /></button>
        <div className="topic-title" data-tauri-drag-region={windowControls ? 'deep' : undefined}>
          <h1 title={windowControls ? topic.title : undefined}>{topic.title}</h1>
          <small>{topic.goal}</small>
        </div>
        {topic.scripted && (liveResearch ? (
          <details className="pt-topic-actions" onKeyDown={(event) => {
            if (event.key !== 'Escape' || !event.currentTarget.open) return
            event.stopPropagation()
            event.currentTarget.open = false
            event.currentTarget.querySelector('summary')?.focus()
          }}>
            <summary className="ghost-btn">
              {tr(tab === 'read' ? 'Research tools' : tabs.find((item) => item.id === tab)?.label ?? 'Research tools')}
              <Icon name="chevronDown" size={14} />
            </summary>
            <nav aria-label={tr('Research tools')} className="pt-topic-menu">
              {tabs.map((item) => <button key={item.id} aria-current={tab === item.id ? 'page' : undefined}
                onClick={(event) => {
                  event.currentTarget.closest('details')!.open = false
                  act.openTopic(topicId, item.id)
                }}><Icon name={item.icon} size={15} /> {tr(item.label)}</button>)}
              <button onClick={(event) => {
                event.currentTarget.closest('details')!.open = false
                act.showTrace(!state.trace.open)
              }}><Icon name="trace" size={15} /> {tr('Agent trace')}</button>
            </nav>
          </details>
        ) : (
          <nav className="tabs" role="tablist">
            {tabs.map((item) => (
              <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'on' : ''}
                onClick={() => act.openTopic(topicId, item.id)}>
                <Icon name={item.icon} size={15} /> {tr(item.label)}
              </button>
            ))}
          </nav>
        ))}
        {(!liveResearch || running || state.trace.open) && <div className="head-meta">
          {!liveResearch && topic.scripted && (
            <>
              <span title={tr('Papers in this topic')}><Icon name="file" size={14} /> {papers.length}</span>
              {!state.mainline && <>
                <span title={tr('Saved notes')}><Icon name="note" size={14} /> {state.noted.length}</span>
                <span title={tr('Citations picked')}><Icon name="quote" size={14} /> {state.cited.length}</span>
              </>}
            </>
          )}
          <button className={`trace-btn ${state.trace.open ? 'on' : ''}`} onClick={() => act.showTrace(!state.trace.open)}>
            {running ? <Spinner /> : <Icon name="trace" size={15} />}{' '}{tr('Agent trace')}
          </button>
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
                {papers.map((id) => {
                  const wikiPage = state.wiki.pages.find((p) => p.paperId === id)
                  return <li key={id}>
                    <button className="link-btn" onClick={() => act.navigate({ view: 'library', paperId: id })}>{PAPERS[id].title}</button>
                    {wikiPage && <button className="link-btn quiet" aria-label={tr('Open Wiki page for {0}', PAPERS[id].title)} onClick={() => act.openWikiPage(wikiPage.id)}>{tr('Wiki')}</button>}
                  </li>
                })}
              </ul>
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
