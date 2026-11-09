import { useStore } from './data/store'
import { Sidebar } from './components/Sidebar'
import { TraceDrawer } from './components/TraceDrawer'
import { EvidencePopover } from './components/EvidencePopover'
import { Home } from './views/Home'
import { TopicView } from './views/TopicView'

export function App() {
  const { state } = useStore()
  const r = state.route
  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        {r.view === 'home' ? <Home /> : <TopicView topicId={r.topicId} tab={r.tab} />}
      </main>
      <TraceDrawer />
      <EvidencePopover />
    </div>
  )
}
