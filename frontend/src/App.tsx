import { useLanguage } from './i18n'
import type { ReactNode } from 'react'
import { useStore } from './data/store'
import { Sidebar } from './components/Sidebar'
import { TraceDrawer } from './components/TraceDrawer'
import { EvidencePopover } from './components/EvidencePopover'
import { Dialog } from './components/PageHead'
import { Home } from './views/Home'
import { TopicView } from './views/TopicView'
import { Library } from './views/Library'
import { WikiPage } from './views/WikiPage'
import { StoreWikiSource } from './data/storeWiki'
import { Check } from './views/Check'
import { Settings } from './views/Settings'

export function App({ windowControls, pages, comparison, liveResearch }: { windowControls?: ReactNode; pages?: Partial<Record<'library'|'wiki'|'check'|'settings',ReactNode>>; comparison?:ReactNode; liveResearch?: boolean }) {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const r = state.route
  const waiting = state.runOrder.map((id) => state.runs[id]).find((run) => run.limit)
  return (
    <div className={windowControls ? 'app app--desktop' : 'app'}>
      <Sidebar />
      <main className="main">
        {windowControls && r.view !== 'topic' && (
          <div className="desktop-drag-area" data-tauri-drag-region>{windowControls}</div>
        )}
        {r.view === 'home' ? <Home key={state.homeRevision} />
          : r.view === 'topic' ? <TopicView topicId={r.topicId} tab={r.tab} comparison={comparison} liveResearch={liveResearch} windowControls={windowControls} />
          : pages?.[r.view] ?? (r.view === 'library' ? <Library />
          : r.view === 'wiki' ? <StoreWikiSource><WikiPage /></StoreWikiSource>
          : r.view === 'check' ? <Check />
          : <Settings />)}
      </main>
      <TraceDrawer />
      {!(r.view === 'topic' && r.tab === 'read') && <EvidencePopover />}
      {waiting ? <Dialog key={waiting.id} title={tr('Task budget reached')} onClose={() => act.resolveBudget(waiting.id, false)}>
        <p className="dialog-text">{tr('{0} is paused. The next step would exceed the limit for {1}.', tr(waiting.task), waiting.limit?.split(', ').map((limit) => tr(limit)).join(', '))}</p>
        <p className="dialog-text">{tr('You can stop and keep the results so far, or allow this run to exceed its budget.')}</p>
        <div className="dialog-actions">
          <button className="ghost-btn" onClick={() => act.resolveBudget(waiting.id, false)}>{tr('Stop task')}</button>
          <button className="primary" onClick={() => act.resolveBudget(waiting.id, true)}>{tr('Continue this run')}</button>
        </div>
      </Dialog> : state.settingsNotice && <Dialog title={tr('Task setup needed')} onClose={act.clearSettingsNotice}>
        <p className="dialog-text">{tr(state.settingsNotice)}</p>
        <div className="dialog-actions">
          <button className="ghost-btn" onClick={act.clearSettingsNotice}>{tr('Close')}</button>
          <button className="primary" onClick={() => { act.clearSettingsNotice(); act.navigate({ view: 'settings' }) }}>{tr('Open Models & services')}</button>
        </div>
      </Dialog>}
    </div>
  )
}
