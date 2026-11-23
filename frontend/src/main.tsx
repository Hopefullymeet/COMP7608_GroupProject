import { WorkspaceProvider } from './data/WorkspaceProvider'
import { FirstRunSettings, ServicesPage } from './views/ServicesPage'
import { CitationPage } from './views/CitationPage'
import { ComparePage } from './views/ResearchPages'
import { WikiPage, WorkspaceWikiSource } from './views/WikiPage'
import { LibraryPage } from './views/LibraryPage'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { StoreProvider } from './data/store'
import { createDesktop, isTauri } from './api/desktop'
import { createMock } from './api/mock'
import { MainlineProvider } from './data/MainlineProvider'
import { WindowControls } from './components/WindowControls'
import { LanguageProvider } from './i18n'
import './styles.css'
import './pages.css'
import './mainline.css'

const desktop = isTauri()
const useRpc = desktop
const demo = !desktop && new URLSearchParams(window.location.search).get('mode') === 'contract'
const api = useRpc ? createDesktop() : demo ? createMock() : null
const app = <App liveResearch={useRpc} comparison={api?<ComparePage/>:undefined} pages={api ? { library:<LibraryPage/>, wiki:<WorkspaceWikiSource><WikiPage/></WorkspaceWikiSource>, check:<CitationPage/>,settings:<ServicesPage/> } : undefined} windowControls={desktop ? <WindowControls /> : undefined} />
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <StoreProvider>
        {api ? <WorkspaceProvider api={api} demo={demo}><MainlineProvider api={api} demo={demo}>{app}{desktop && <FirstRunSettings/>}</MainlineProvider></WorkspaceProvider> : app}
      </StoreProvider>
    </LanguageProvider>
  </StrictMode>,
)
