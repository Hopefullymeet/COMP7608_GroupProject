import { useId, useRef, useState } from 'react'
import { useLanguage } from '../i18n'
import { Icon } from './Icon'

const OPTIONS = [
  { id: 'zh-CN', label: '中文' },
  { id: 'en', label: 'English' },
] as const

export function LanguagePicker() {
  const { language, setLanguage, tr } = useLanguage()
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()

  function close() {
    trigger.current?.focus({ preventScroll: true })
    setOpen(false)
  }

  return (
    <div className="side-language" onBlur={(e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false)
    }} onKeyDown={(e) => {
      if (open && e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }}>
      <button ref={trigger} id={`${id}-trigger`} type="button" className="side-more side-language-trigger"
        aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}>
        <Icon name="globe" size={15} />
        <span>{tr('Language')}</span>
        <Icon name="chevronDown" size={13} />
      </button>
      {open && (
        <div className="side-language-options" id={id} role="group" aria-labelledby={`${id}-trigger`}>
          {OPTIONS.map(({ id: option, label }, index) => (
            <button key={option} type="button" className="side-more" lang={option}
              autoFocus={index === 0} aria-pressed={language === option} onClick={() => {
                setLanguage(option)
                close()
              }}>
              {label}
              {language === option && <Icon name="check" size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
