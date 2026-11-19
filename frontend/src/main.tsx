import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../../prototype/src/App'
import { StoreProvider } from '../../prototype/src/data/store'
import { createDesktop, isTauri } from './api/desktop'
import { createMock } from './api/mock'
import { MainlineProvider } from './data/MainlineProvider'
import { WindowControls } from './components/WindowControls'
import '../../prototype/src/styles.css'
import '../../prototype/src/pages.css'
import './mainline.css'

const desktop = isTauri()
const useRpc = desktop && import.meta.env.VITE_PAPERTRACE_TRANSPORT === 'rpc'
const demo = desktop ? !useRpc : new URLSearchParams(window.location.search).get('mode') === 'contract'
const api = useRpc ? createDesktop() : demo ? createMock() : null
const app = <App windowControls={desktop ? <WindowControls /> : undefined} />
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      {api ? <MainlineProvider api={api} demo={demo}>{app}</MainlineProvider> : app}
    </StoreProvider>
  </StrictMode>,
)
