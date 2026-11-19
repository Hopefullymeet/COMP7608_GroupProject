import { useCallback, useId, useRef, useState } from 'react'
import type { Topic } from '../data/types'
import { Icon } from './Icon'
import { scrollWithin } from './util'

export function TopicPicker({ topics, onSelect }: {
  topics: Pick<Topic, 'id' | 'title'>[]
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const pickerId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const focusSearch = useCallback((input: HTMLInputElement | null) => {
    if (!input) return
    input.focus({ preventScroll: true })
    const selector = '.page-body'
    const bounds = input.closest(selector)?.getBoundingClientRect()
    if (bounds && input.getBoundingClientRect().bottom > bounds.bottom) scrollWithin(input, selector, 'center')
  }, [])
  const matches = topics.filter((topic) => topic.title.toLowerCase().includes(query.trim().toLowerCase()))

  function close() {
    setOpen(false)
    setQuery('')
    trigger.current?.focus({ preventScroll: true })
  }

  return (
    <div className="topic-search">
      <button ref={trigger} className="link-btn lib-start topic-search-trigger" aria-expanded={open}
        aria-controls={open ? pickerId : undefined}
        onClick={() => { if (open) close(); else setOpen(true) }}>
        <Icon name="plus" size={14} /> Add to topic
      </button>
      {open && (
        <div className="topic-picker" id={pickerId} onKeyDown={(e) => {
          if (e.key === 'Escape') { e.stopPropagation(); close() }
        }}>
          <label className="field-search">
            <Icon name="search" size={15} />
            <input ref={focusSearch} value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search topics…" aria-label="Search topics to add" />
          </label>
          {matches.length ? (
            <ul className="topic-picker-results" aria-label="Matching topics">
              {matches.map((topic) => (
                <li key={topic.id}>
                  <button aria-label={'Add to ' + topic.title} onClick={() => { onSelect(topic.id); close() }}>
                    <span>{topic.title}</span><Icon name="plus" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="topic-picker-empty" role="status">No matching topics.</p>}
        </div>
      )}
    </div>
  )
}
