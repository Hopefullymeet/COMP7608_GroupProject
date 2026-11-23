import { useLanguage } from './i18n'
import { usePreferences } from './data/preferences'
import { useEffect, useState, type ReactNode } from 'react'
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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const prefs = usePreferences()
  const [link,setLink] = useState<string>()
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme = prefs.appearance === 'system' ? (media.matches ? 'dark' : 'light') : prefs.appearance
      document.documentElement.style.setProperty('--chat-size', prefs.font + 'px')
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [prefs.appearance,prefs.font])
  useEffect(() => {
    function shortcut(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === prefs.settingsKey) {
        e.preventDefault()
        setSettingsOpen(true)
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [prefs.settingsKey])
  const r = state.route
  const waiting = state.runOrder.map((id) => state.runs[id]).find((run) => run.limit)
  return (
    <div onClickCapture={event => {
      const a = event.target instanceof Element && event.target.closest('a[href]')
      if (prefs.links !== 'open' && a instanceof HTMLAnchorElement && a.target === '_blank' && /^https?:$/.test(a.protocol) && !a.hasAttribute('data-confirmed')) {
        event.preventDefault(); setLink(a.href)
      }
    }} className={windowControls ? 'app app--desktop' : 'app'}>
      <Sidebar onSettings={() => setSettingsOpen(true)} />
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
      {settingsOpen && <Dialog title={tr('Settings')} onClose={() => setSettingsOpen(false)} panelClass="settings-window">
        {pages?.settings ?? <Settings />}
      </Dialog>}
      {link && prefs.links === 'sidebar' && <aside className="external-preview" aria-label={tr('External paper links')}>
        <div><a href={link} data-confirmed target="_blank" rel="noreferrer">{tr('Open in browser')}</a>
        <button className="ghost-btn" onClick={()=>setLink(undefined)}>{tr('Close')}</button></div>
        <iframe key={link} src={link} title={tr('External paper links')} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer"/>
      </aside>}
      {link && prefs.links === 'confirm' && <Dialog title={tr('Open external link?')} onClose={()=>setLink(undefined)}>
        <p>{link}</p><a className="primary" data-confirmed href={link} target="_blank" rel="noreferrer" onClick={()=>setLink(undefined)}>{tr('Open')}</a>
      </Dialog>}
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
          <button className="primary" onClick={() => { act.clearSettingsNotice(); setSettingsOpen(true) }}>{tr('Open Models & services')}</button>
        </div>
      </Dialog>}
    </div>
  )
}
