import type { ReactNode } from 'react'
import { Icon } from './Icon'

export function Disclosure({ className = '', icon, title, children }: {
  className?: string
  icon?: string
  title: ReactNode
  children: ReactNode
}) {
  return (
    <details className={`disclosure ${className}`} onKeyDown={(event) => {
      if (event.key !== 'Escape' || !event.currentTarget.open) return
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
      {children}
    </details>
  )
}
