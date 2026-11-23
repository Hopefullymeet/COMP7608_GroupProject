import { useLanguage } from '../i18n'
import { createContext, useLayoutEffect, useRef, type ReactNode } from 'react'
import { anyRunning, useStore } from '../data/store'
import { Icon, Spinner } from './Icon'

export const HeaderActions = createContext<HTMLDivElement | null>(null)

export function HeaderContext({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const label = ref.current!
    const measure = () => label.toggleAttribute('data-truncated', label.scrollWidth > label.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(label)
    return () => observer.disconnect()
  }, [text])
  return <span ref={ref} className="header-context" title={text}>{text}</span>
}

export function TraceButton() {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const label = tr('Agent trace')
  return <button className="icon-btn header-trace" title={label} aria-label={label} aria-expanded={state.trace.open}
    onClick={() => act.showTrace(!state.trace.open)}>
    {anyRunning(state) ? <Spinner /> : <Icon name="trace" size={16} />}
  </button>
}

/** Header for the workspace pages (Library, Citation check, Models & services). */
export function PageHead({ icon, title, sub, children, trace = false }: {
  icon: string; title: string; sub: string; children?: ReactNode; trace?: boolean
}) {
  return (
    <header className="page-head" data-tauri-drag-region>
      <Icon name={icon} size={17} />
      <h1 title={title} aria-description={sub}>{title}</h1>
      {children}
      {trace && <TraceButton />}
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
      <div className="dialog">
        <div className="dialog-head">
          <h2>{title}</h2>
          <button className="icon-btn sm" onClick={onClose} aria-label={tr('Close')}><Icon name="x" size={14} /></button>
        </div>
        {children}
      </div>
    </dialog>
  )
}
