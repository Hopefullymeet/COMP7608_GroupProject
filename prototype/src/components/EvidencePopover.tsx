import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../data/store'
import { EVIDENCE, PAPERS } from '../data/fixtures'
import { Icon } from './Icon'
import { scrollWithin } from './util'

const W = 360

export function EvidencePopover() {
  const { state, act } = useStore()
  const active = state.activeEvidence
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!active) { setPos(null); return }
    const anchor = () => document.querySelector<HTMLElement>(`[data-ev-anchor="${active.anchor}"]`)
    const place = () => {
      const el = anchor()
      if (!el) { setPos(null); return }
      const r = el.getBoundingClientRect()
      const h = ref.current?.offsetHeight ?? 240
      const left = Math.max(16, Math.min(r.left, window.innerWidth - W - 16))
      let top = r.bottom + 10
      if (top + h > window.innerHeight - 16) top = Math.max(16, r.top - h - 10)
      setPos({ top, left })
    }
    if (active.scroll) scrollWithin(anchor(), '.reader-scroll', 'center')
    place()
    const raf = requestAnimationFrame(place)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [active, state.readerPaperId])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && act.closeEvidence()
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (ref.current?.contains(t) || t.closest('[data-ev-anchor], .cite')) return
      act.closeEvidence()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown) }
  }, [active, act])

  if (!active) return null
  const ev = EVIDENCE[active.id]
  const paper = PAPERS[ev.paperId]
  const passage = paper.passages.find((p) => p.id === ev.passageId)
  const cited = state.cited.includes(ev.id)
  const noted = state.noted.includes(ev.id)

  return (
    <div ref={ref} className="evidence" role="dialog" aria-label="Evidence"
      style={{ width: W, top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? 'visible' : 'hidden' }}>
      <div className="ev-head">
        <span>{paper.short} · {passage?.section} · PDF p. {passage?.page}</span>
        <button className="icon-btn sm" onClick={() => act.closeEvidence()} aria-label="Close"><Icon name="x" size={14} /></button>
      </div>
      <blockquote>“{ev.quote}”</blockquote>
      <p className="ev-scope"><Icon name="eye" size={13} /> {ev.scope}</p>
      <div className="ev-actions">
        <button className={cited ? 'toggle on' : 'toggle'} onClick={() => act.toggleCite(ev.id)}>
          <Icon name={cited ? 'check' : 'quote'} size={14} /> {cited ? 'Citation picked' : 'Use as citation'}
        </button>
        <button className={noted ? 'toggle on' : 'toggle'} onClick={() => act.toggleNote(ev.id)}>
          <Icon name={noted ? 'check' : 'note'} size={14} /> {noted ? 'Saved to notes' : 'Save as note'}
        </button>
      </div>
      <p className="ev-fine">Your choice is stored apart from the agent’s result. A picked citation is checked again against your draft before use.</p>
    </div>
  )
}
