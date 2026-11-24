import type { ReactNode } from 'react'
import { Icon } from './Icon'

export function Disclosure({ className = '', icon, title, children, onOpenChange, open, panel }: {
  className?: string
  icon?: string
  title: ReactNode
  children: ReactNode
  onOpenChange?: (open: boolean) => void
  open?: boolean
  panel?: boolean
}) {
  return (
    <details className={`disclosure${panel ? ' disclosure-panel' : ''} ${className}`}
      open={open}
      onToggle={onOpenChange && ((event) => onOpenChange(event.currentTarget.open))}
      onKeyDown={(event) => {
        if (event.defaultPrevented || event.key !== 'Escape' || !event.currentTarget.open) return
        event.stopPropagation()
        event.preventDefault()
        event.currentTarget.open = false
        event.currentTarget.querySelector('summary')?.focus()
      }}>
      <summary>
        {icon && <Icon name={icon} size={15} />}
        <span className="grow">{title}</span>
        <Icon name="chevronDown" className="disclosure-chevron" size={14} />
      </summary>
      {panel ? <div className="disclosure-body">{children}</div> : children}
    </details>
  )
}
