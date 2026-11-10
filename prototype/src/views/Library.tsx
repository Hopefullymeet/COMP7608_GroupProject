import { useState } from 'react'
import { topicsOfPaper, useStore, type State } from '../data/store'
import { EVIDENCE, PAPERS } from '../data/fixtures'
import { CITE_KEYS, DUPLICATE_REVIEW, LIBRARY_META } from '../data/workspace'
import { Icon } from '../components/Icon'
import { Dialog, PageHead } from '../components/PageHead'
import { plural } from '../components/util'

type Filter = 'all' | 'in-topic' | 'unfiled' | 'text' | 'metadata'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'in-topic', label: 'In a topic' },
  { id: 'unfiled', label: 'Unfiled' },
  { id: 'text', label: 'Has text' },
  { id: 'metadata', label: 'Metadata only' },
]

/** Everything that depends on a paper: shown before it is deleted. */
function impactOf(s: State, paperId: string) {
  const ev = new Set(Object.values(EVIDENCE).filter((e) => e.paperId === paperId).map((e) => e.id))
  return {
    topics: topicsOfPaper(s, paperId).map((id) => s.topics.find((t) => t.id === id)?.title ?? id),
    notes: s.noted.filter((id) => ev.has(id)).length,
    citations: s.cited.filter((id) => ev.has(id)).length,
    comparison: s.comparison.rows.filter((r) => r.cells.some((c) => c.evidenceId && ev.has(c.evidenceId))).length,
    wiki: s.wiki.pages.flatMap((p) => p.statements).filter((x) => x.evidenceIds.some((id) => ev.has(id))).length,
    draft: s.check.sentences.filter((x) => x.cites.some((k) => CITE_KEYS[k] === paperId)).length,
  }
}

function DeleteDialog({ paperId, onClose }: { paperId: string; onClose: () => void }) {
  const { state, act } = useStore()
  const [clear, setClear] = useState(false)
  const p = PAPERS[paperId]
  const i = impactOf(state, paperId)
  const rows = [
    ['Topics', i.topics.length ? i.topics.join(', ') : 'None'],
    ['Saved notes using it', String(i.notes)],
    ['Picked citations', String(i.citations)],
    ['Comparison rows', String(i.comparison)],
    ['Wiki statements', String(i.wiki)],
    ['Draft sentences citing it', String(i.draft)],
  ]
  return (
    <Dialog title={`Delete “${p.short}” from the library?`} onClose={onClose}>
      <p className="dialog-text">It moves to the trash and can be restored with its topic memberships. These records depend on it:</p>
      <dl className="impact">
        {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className={v !== '0' && v !== 'None' ? 'hit' : ''}>{v}</dd></div>)}
      </dl>
      <p className="dialog-text muted-text">The bibliographic record and past judgements are kept. Links back to the source will show as unavailable.</p>
      <label className="check-row">
        <input type="checkbox" checked={clear} onChange={(e) => setClear(e.target.checked)} />
        <span>Also clear its excerpts from notes and picked citations</span>
      </label>
      <div className="dialog-actions">
        <button className="ghost-btn" onClick={onClose}>Cancel</button>
        <button className="danger" onClick={() => { act.deletePaper(paperId, clear); onClose() }}><Icon name="trash" size={14} /> Move to trash</button>
      </div>
    </Dialog>
  )
}

function EmptyTrashDialog({ onClose }: { onClose: () => void }) {
  const { state, act } = useStore()
  const n = state.trash.length
  return (
    <Dialog title="Empty the trash permanently?" onClose={onClose}>
      <p className="dialog-text">This cannot be undone. For {plural(n, 'paper')} it removes:</p>
      <ul className="dialog-list">
        <li>Original files and their versions</li>
        <li>Parsed text and the search index</li>
        <li>Excerpts in notes and reports, only where you chose to clear them</li>
      </ul>
      <p className="dialog-text muted-text">Copies you already exported are not affected. In this prototype nothing is stored, so only the list is cleared.</p>
      <div className="dialog-actions">
        <button className="ghost-btn" onClick={onClose}>Cancel</button>
        <button className="danger" onClick={() => { act.emptyTrash(); onClose() }}>Delete permanently</button>
      </div>
    </Dialog>
  )
}

function Detail({ paperId, onDelete }: { paperId: string; onDelete: () => void }) {
  const { state, act } = useStore()
  const p = PAPERS[paperId]
  const meta = LIBRARY_META[paperId]
  const topics = topicsOfPaper(state, paperId)
  const i = impactOf(state, paperId)
  return (
    <aside className="lib-detail card">
      <p className="eyebrow">{p.venue} {p.year} · venue from {p.venueSource}</p>
      <h2>{p.title}</h2>
      <p className="byline">{p.authors.join(', ')}</p>

      <h3>Identity</h3>
      <p className="detail-line"><Icon name="check" size={13} /> {meta.identity}</p>

      <h3>Files and versions</h3>
      <ul className="versions">
        {meta.files.map((f) => (
          <li key={f.name}>
            <span className={`ver-role ${f.role === 'Published version' ? 'main' : ''}`}>{f.role}</span>
            <div><strong>{f.name}</strong><small>{f.detail}</small></div>
          </li>
        ))}
      </ul>

      <h3>Topics</h3>
      {topics.length === 0 ? <p className="muted-text detail-line">Unfiled. It stays in the library without a topic.</p> : (
        <ul className="topic-links">
          {topics.map((id) => (
            <li key={id}>
              <span>{state.topics.find((t) => t.id === id)?.title}</span>
              <button className="link-btn quiet" onClick={() => act.unlinkPaper(paperId, id)}>Remove from topic</button>
            </li>
          ))}
        </ul>
      )}
      <p className="fine">Removing from a topic keeps the paper here and in other topics. Past discussions still show what was used.</p>

      <h3>Used in</h3>
      <div className="usage-grid">
        <span><b>{meta.annotations}</b> annotations</span>
        <span><b>{i.notes}</b> notes</span>
        <span><b>{i.citations}</b> citations</span>
        <span><b>{i.wiki}</b> wiki statements</span>
      </div>

      <div className="detail-foot">
        <button className="danger-link" onClick={onDelete}><Icon name="trash" size={14} /> Delete from library…</button>
      </div>
    </aside>
  )
}

export function Library() {
  const { state, act } = useStore()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<string | null>(state.library[0] ?? null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [emptying, setEmptying] = useState(false)
  const [trashOpen, setTrashOpen] = useState(true)

  const rows = state.library.filter((id) => {
    const p = PAPERS[id]
    const text = `${p.title} ${p.authors.join(' ')} ${LIBRARY_META[id]?.tags.join(' ')}`.toLowerCase()
    if (q && !text.includes(q.toLowerCase())) return false
    const inTopic = topicsOfPaper(state, id).length > 0
    if (filter === 'in-topic') return inTopic
    if (filter === 'unfiled') return !inTopic
    if (filter === 'text') return p.stored === 'abstract'
    if (filter === 'metadata') return p.stored === 'metadata'
    return true
  })
  const current = selected && state.library.includes(selected) ? selected : rows[0] ?? null

  return (
    <div className="page library-page">
      <PageHead icon="library" title="Library" sub={`${plural(state.library.length, 'paper')} on this computer, shared by all topics. No account needed.`}>
        <button className="ghost-btn" disabled title="Real import comes later"><Icon name="paperclip" size={15} /> Import PDFs</button>
      </PageHead>

      <div className="page-body scroll">
        {state.dupReview === 'pending' ? (
          <div className="review-banner">
            <Icon name="alert" size={16} />
            <div className="grow">
              <strong>1 import needs your decision: {DUPLICATE_REVIEW.file}</strong>
              <p>{DUPLICATE_REVIEW.reason}</p>
            </div>
            <div className="review-actions">
              <button className="ghost-btn sm accent" onClick={() => act.resolveDuplicate('merged')}>Same paper: keep one</button>
              <button className="ghost-btn sm" onClick={() => act.resolveDuplicate('separate')}>Different papers</button>
            </div>
          </div>
        ) : (
          <div className="review-done"><Icon name="check" size={14} />
            {state.dupReview === 'merged' ? 'Duplicate linked to QASPER; one copy kept.' : 'Kept as a separate paper.'}
            <button className="link-btn" onClick={() => act.resolveDuplicate(state.dupReview === 'merged' ? 'separate' : 'merged')}>Change</button>
          </div>
        )}

        <div className="lib-tools">
          <label className="field-search">
            <Icon name="search" size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles, authors, tags" aria-label="Search library" />
          </label>
          <div className="seg" role="tablist" aria-label="Filter">
            {FILTERS.map((f) => (
              <button key={f.id} role="tab" aria-selected={filter === f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>{f.label}</button>
            ))}
          </div>
        </div>

        <div className="lib-grid">
          <section aria-label="Papers">
            <div className="lib-list">
              {rows.map((id) => {
                const p = PAPERS[id]
                const meta = LIBRARY_META[id]
                const topics = topicsOfPaper(state, id)
                return (
                  <button key={id} className={`lib-row ${current === id ? 'on' : ''}`} onClick={() => setSelected(id)}>
                    <span className="lib-kind"><Icon name={p.stored === 'abstract' ? 'file' : 'book'} size={16} /></span>
                    <span className="grow">
                      <strong>{p.title}</strong>
                      <small>{p.authors.slice(0, 2).join(', ')}{p.authors.length > 2 ? ' et al.' : ''} · {p.venue} {p.year}</small>
                      <span className="lib-chips">
                        <span className="tag">{meta.files[0].role}</span>
                        {topics.length ? <span className="tag ok">{plural(topics.length, 'topic')}</span> : <span className="tag warn">Unfiled</span>}
                        {meta.tags.map((t) => <span key={t} className="tag quiet">#{t}</span>)}
                      </span>
                    </span>
                    <small className="lib-added">{meta.origin}<br />{meta.added}</small>
                  </button>
                )
              })}
              {rows.length === 0 && <p className="muted-text pad">No paper matches.</p>}
            </div>

            <div className="trash">
              <div className="trash-head">
                <button className="trash-toggle" onClick={() => setTrashOpen((v) => !v)} aria-expanded={trashOpen}>
                  <Icon name={trashOpen ? 'chevronDown' : 'chevronRight'} size={14} />
                  <Icon name="trash" size={14} /> Trash <span className="count">{state.trash.length}</span>
                </button>
                {state.trash.length > 0 && <button className="link-btn quiet" onClick={() => setEmptying(true)}>Empty trash…</button>}
              </div>
              {trashOpen && (state.trash.length === 0
                ? <p className="muted-text trash-empty">Deleted papers wait here and can be restored with their topics.</p>
                : state.trash.map((t) => (
                  <div key={t.paperId} className="trash-row">
                    <span className="grow">
                      <strong>{PAPERS[t.paperId].title}</strong>
                      <small>Deleted {t.when.toLowerCase()} · was in {t.topics.length ? plural(t.topics.length, 'topic') : 'no topic'}{t.clearExcerpts ? ' · excerpts cleared' : ''}</small>
                    </span>
                    <button className="ghost-btn sm" onClick={() => { act.restorePaper(t.paperId); setSelected(t.paperId) }}><Icon name="undo" size={13} /> Restore</button>
                  </div>
                )))}
            </div>
          </section>

          {current ? <Detail paperId={current} onDelete={() => setDeleting(current)} /> : <div className="card muted-text">Select a paper.</div>}
        </div>
      </div>

      {deleting && <DeleteDialog paperId={deleting} onClose={() => setDeleting(null)} />}
      {emptying && <EmptyTrashDialog onClose={() => setEmptying(false)} />}
    </div>
  )
}
