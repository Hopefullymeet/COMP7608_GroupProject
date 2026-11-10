import { useStore } from '../data/store'
import { EVIDENCE, PAPERS } from '../data/fixtures'
import { Icon } from './Icon'

/** A clickable source that opens the evidence card next to it. `anchor` must be unique on the page. */
export function SourceChip({ evidenceId, anchor }: { evidenceId: string; anchor: string }) {
  const { state, act } = useStore()
  const ev = EVIDENCE[evidenceId]
  if (!ev) return null
  const trashed = state.trash.some((t) => t.paperId === ev.paperId)
  return (
    <button className={`src-btn ${trashed ? 'gone' : ''}`} data-ev-anchor={anchor}
      onClick={() => act.openEvidence(evidenceId, anchor, false)}
      title={trashed ? 'Source paper is in the trash; the excerpt is kept as history' : 'Show the source sentence'}>
      <Icon name="quote" size={12} /> {PAPERS[ev.paperId].short} · p. 1{trashed ? ' · in trash' : ''}
    </button>
  )
}
