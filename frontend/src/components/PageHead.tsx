import { useLanguage } from '../i18n'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { anyRunning, useStore } from '../data/store'
import { Icon, Spinner } from './Icon'

/** Header for the workspace pages (Library, Citation check, Models & services). */
export function PageHead({ icon, title, sub, children, trace = false }: {
  icon: string; title: string; sub: string; children?: ReactNode; trace?: boolean
}) {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  return (
    <header className="page-head">
      <span className="page-icon"><Icon name={icon} size={18} /></span>
      <div className="grow">
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      {children}
      {trace && (
        <button className={`trace-btn ${state.trace.open ? 'on' : ''}`} onClick={() => act.showTrace(!state.trace.open)}>
          {anyRunning(state) ? <Spinner /> : <Icon name="trace" size={15} />}{' '}{tr('Agent trace')}
        </button>
      )}
    </header>
  )
}

export function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const { tr } = useLanguage()
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const previous = document.activeElement
    dialog.showModal()
    return () => {
      dialog.close()
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
      else document.querySelector<HTMLElement>('.library-page .trash-toggle')?.focus()
    }
  }, [])

  return (
    <dialog ref={ref} className="dialog-backdrop" aria-label={title}
      onCancel={(e) => { e.preventDefault(); onClose() }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="pt-dialog">
        <div className="dialog-head">
          <h2>{title}</h2>
          <button className="icon-btn sm" onClick={onClose} aria-label={tr('Close')}><Icon name="x" size={14} /></button>
        </div>
        {children}
      </div>
    </dialog>
  )
}
