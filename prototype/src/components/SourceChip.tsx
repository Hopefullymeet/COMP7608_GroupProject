import { sourceStatus, useStore } from '../data/store'
import { EVIDENCE, PAPERS } from '../data/fixtures'
import { Icon } from './Icon'

/** A clickable source that opens the evidence card next to it. `anchor` must be unique on the page. */
export function SourceChip({ evidenceId, anchor, fullTitle = false }: { evidenceId: string; anchor: string; fullTitle?: boolean }) {
  const { state, act } = useStore()
  const ev = EVIDENCE[evidenceId]
  if (!ev) return null
  const status = sourceStatus(state, ev.paperId)
  const paper = PAPERS[ev.paperId]
  const page = paper.passages.find((p) => p.id === ev.passageId)?.page
  return (
    <button className={`src-btn ${status !== 'available' ? 'gone' : ''}`} data-ev-anchor={anchor}
      onClick={() => act.openEvidence(evidenceId, anchor, false)}
      title={status === 'available' ? 'Show the source sentence' : 'Show historical source status'}>
      <Icon name="quote" size={12} />
      <span>{fullTitle ? paper.title : paper.short}{page && <> · p. {page}</>}{status !== 'available' && <> · {status}</>}</span>
    </button>
  )
}
