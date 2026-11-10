import { useStore } from './data/store'
import { Sidebar } from './components/Sidebar'
import { TraceDrawer } from './components/TraceDrawer'
import { EvidencePopover } from './components/EvidencePopover'
import { Home } from './views/Home'
import { TopicView } from './views/TopicView'
import { Library } from './views/Library'
import { Wiki } from './views/Wiki'
import { Check } from './views/Check'
import { Settings } from './views/Settings'

export function App() {
  const { state } = useStore()
  const r = state.route
  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        {r.view === 'home' ? <Home key={state.homeRevision} />
          : r.view === 'topic' ? <TopicView topicId={r.topicId} tab={r.tab} />
          : r.view === 'library' ? <Library />
          : r.view === 'wiki' ? <Wiki />
          : r.view === 'check' ? <Check />
          : <Settings />}
      </main>
      <TraceDrawer />
      <EvidencePopover />
    </div>
  )
}
