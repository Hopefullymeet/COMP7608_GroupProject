import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Icon } from '../../../prototype/src/components/Icon'

export function WindowControls() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const window = getCurrentWindow()
    let active = true
    async function syncMaximized() {
      const value = await window.isMaximized()
      if (active) setMaximized(value)
    }
    const unlisten = window.onResized(() => { void syncMaximized().catch(console.error) })
    void unlisten.then(async () => { if (active) await syncMaximized() }).catch(console.error)
    return () => {
      active = false
      void unlisten.then((dispose) => dispose()).catch(console.error)
    }
  }, [])

  const window = getCurrentWindow()
  const resizeLabel = maximized ? 'Restore window' : 'Maximize window'
  return (
    <div className="window-controls" role="group" aria-label="Window controls" data-tauri-drag-region="false">
      <button type="button" className="icon-btn" aria-label="Minimize window" title="Minimize window"
        onClick={() => { void window.minimize().catch(console.error) }}><Icon name="minimize" size={16} /></button>
      <button type="button" className="icon-btn" aria-label={resizeLabel} title={resizeLabel}
        onClick={() => { void window.toggleMaximize().catch(console.error) }}><Icon name={maximized ? 'restore' : 'maximize'} size={14} /></button>
      <button type="button" className="icon-btn window-close" aria-label="Close window" title="Close window"
        onClick={() => { void window.close().catch(console.error) }}><Icon name="x" size={16} /></button>
    </div>
  )
}
