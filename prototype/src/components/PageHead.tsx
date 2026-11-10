import type { ReactNode } from 'react'
import { anyRunning, useStore } from '../data/store'
import { Icon, Spinner } from './Icon'

/** Header for the workspace pages (Library, Evidence wiki, Citation check, Models & services). */
export function PageHead({ icon, title, sub, children, trace = false }: {
  icon: string; title: string; sub: string; children?: ReactNode; trace?: boolean
}) {
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
          {anyRunning(state) ? <Spinner /> : <Icon name="trace" size={15} />} Agent trace
        </button>
      )}
    </header>
  )
}

export function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-head">
          <h2>{title}</h2>
          <button className="icon-btn sm" onClick={onClose} aria-label="Close"><Icon name="x" size={14} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
