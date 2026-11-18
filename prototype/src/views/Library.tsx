import { useCallback, useId, useRef, useState } from 'react'
import { libraryFiles, topicsOfPaper, useStore, type State } from '../data/store'
import { DEMO_TOPIC, EVIDENCE, PAPERS } from '../data/fixtures'
import { CITE_KEYS, DUPLICATE_REVIEW, LIBRARY_META } from '../data/workspace'
import type { Paper } from '../data/types'
import { Icon } from '../components/Icon'
import { Dialog, PageHead } from '../components/PageHead'
import { plural, scrollWithin } from '../components/util'

const MEMBERSHIP_FILTERS = [['all', 'All'], ['in-topic', 'In a topic'], ['unfiled', 'Unfiled']] as const
const TEXT_LABEL: Record<Paper['stored'], string> = {
  'full-text': 'Full text', abstract: 'Abstract only', metadata: 'Metadata only',
}

function impactOf(s: State, paperId: string) {
  const uses = (id: string) => EVIDENCE[id]?.paperId === paperId
  return {
    topics: s.topics.filter((t) => topicsOfPaper(s, paperId).includes(t.id)),
    notes: s.noted.filter(uses),
    citations: s.cited.filter(uses),
    comparison: s.comparison.rows.filter((r) => r.cells.some((c) => c.evidenceId && uses(c.evidenceId))),
    wiki: s.wiki.pages.flatMap((page) => page.statements.filter((st) => st.evidenceIds.some(uses)).map((statement) => ({ page, statement }))),
    draft: s.check.sentences.flatMap((sentence, index) => sentence.cites.some((key) => CITE_KEYS[key] === paperId) ? [{ sentence, index }] : []),
  }
}

function Impact({ paperId }: { paperId: string }) {
  const { state } = useStore()
  const records = impactOf(state, paperId)
  const groups = [
    { label: 'Topics', entries: records.topics.map((t) => t.title) },
    { label: 'Saved notes', entries: records.notes.map((id) => EVIDENCE[id].quote) },
    { label: 'Picked citations', entries: records.citations.map((id) => EVIDENCE[id].quote) },
    { label: 'Comparison rows', entries: records.comparison.map((r) => r.dimension) },
    { label: 'Wiki statements', entries: records.wiki.map(({ page, statement }) => page.title + ' · ' + statement.text) },
    { label: 'Draft sentences', entries: records.draft.map(({ sentence, index }) => (index + 1) + '. ' + sentence.text) },
  ]
  return (
    <div className="impact">
      {groups.map(({ label, entries }) => (
        <details key={label} open={label === 'Topics' ? true : undefined}>
          <summary>{label}<span className={entries.length ? 'hit' : ''}>{entries.length}</span></summary>
          {entries.length ? <ul>{entries.map((entry, index) => <li key={index}>{entry}</li>)}</ul> : <p>None</p>}
        </details>
      ))}
    </div>
  )
}

function EmptyTrashDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: (clearExcerpts: boolean) => void }) {
  const { state } = useStore()
  const [clear, setClear] = useState(false)
  return (
    <Dialog title="Empty the trash permanently?" onClose={onClose}>
      <p className="dialog-text">This cannot be undone. Permanent deletion applies to {plural(state.trash.length, 'paper')}:</p>
      <ul className="dialog-list">{state.trash.map((item) => <li key={item.paperId}>{PAPERS[item.paperId].title}</li>)}</ul>
      <p className="dialog-text">Original files, parsed text and search index entries are removed. Bibliographic records and past judgments remain as history.</p>
      <label className="check-row">
        <input type="checkbox" checked={clear} onChange={(e) => setClear(e.target.checked)} />
        <span>Also clear saved evidence excerpts from notes and citations</span>
      </label>
      <div className="dialog-actions">
        <button className="ghost-btn" onClick={onClose}>Cancel</button>
        <button className="danger" onClick={() => onConfirm(clear)}>Delete permanently</button>
      </div>
    </Dialog>
  )
}

function ImportReview({ onClose, onResolve }: { onClose: () => void; onResolve: (choice: 'merged' | 'separate') => void }) {
  const { state } = useStore()
  const review = DUPLICATE_REVIEW
  const existing = PAPERS[review.paperId]
  const canLink = state.library.includes(review.paperId)
  return (
    <Dialog title="Review a possible duplicate" onClose={onClose}>
      <div className="import-review">
        <div className="card">
          <h3>Incoming file</h3><strong>{review.file}</strong>
          <p>{existing.title}</p><small>{existing.authors.slice(0, 2).join(', ')} et al. · {existing.year}</small>
        </div>
        <div className="card">
          <h3>Existing match</h3><strong>{LIBRARY_META[review.paperId].files[0].name}</strong>
          <p>{existing.title}</p><small>{existing.authors.slice(0, 2).join(', ')} et al. · {existing.year}</small>
        </div>
      </div>
      <p className="dialog-text">{review.match}. {review.reason}</p>
      {!canLink && <p className="dialog-text muted-text">The existing record is unavailable. Restore it before linking a version, or keep this file as a separate paper.</p>}
      <div className="dialog-actions">
        <button className="ghost-btn" onClick={() => onResolve('separate')}>Keep as separate paper</button>
        <button className="primary" disabled={!canLink} onClick={() => onResolve('merged')}>Link as another version</button>
      </div>
    </Dialog>
  )
}

function Detail({ paperId, onRead, onDelete, onUnlink }: {
  paperId: string; onRead: () => void; onDelete: () => void; onUnlink: (topicId: string) => void
}) {
  const { state, act } = useStore()
  const [topicQuery, setTopicQuery] = useState('')
  const [topicsOpen, setTopicsOpen] = useState(false)
  const pickerId = useId()
  const pickerButton = useRef<HTMLButtonElement>(null)
  const focusTopicSearch = useCallback((input: HTMLInputElement | null) => {
    if (!input) return
    input.focus({ preventScroll: true })
    const body = input.closest('.page-body')
    if (body && input.getBoundingClientRect().bottom > body.getBoundingClientRect().bottom) {
      scrollWithin(input, '.page-body', 'center')
    }
  }, [])
  const p = PAPERS[paperId]
  const meta = LIBRARY_META[paperId]
  const files = libraryFiles(state, paperId)
  const topics = state.topics.filter((t) => topicsOfPaper(state, paperId).includes(t.id))
  const choices = state.topics.filter((t) => !topicsOfPaper(state, paperId).includes(t.id))
  const matchingTopics = choices.filter((t) => t.title.toLowerCase().includes(topicQuery.trim().toLowerCase()))
  const i = impactOf(state, paperId)

  function closePicker() {
    setTopicsOpen(false)
    setTopicQuery('')
    pickerButton.current?.focus({ preventScroll: true })
  }

  return (
    <aside className="lib-detail card">
      <p className="eyebrow">{p.venue} {p.year} · venue from {p.venueSource}</p>
      <h2>{p.title}</h2>
      <p className="byline">{p.authors.join(', ')}</p>
      <div className="lib-reading-actions">
        <span className="tag">{TEXT_LABEL[p.stored]}</span>
        {p.stored !== 'metadata' && <button className="link-btn" onClick={onRead}><Icon name="book" size={14} /> Read {p.stored === 'abstract' ? 'abstract' : 'full text'}</button>}
      </div>

      <h3>Identity</h3>
      <p className="detail-line">{meta.identity}</p>
      {p.doi && <a className="link-btn" href={'https://doi.org/' + p.doi} target="_blank" rel="noreferrer">DOI {p.doi}</a>}

      <h3>Files and versions</h3>
      <ul className="versions">
        {files.map((f) => (
          <li key={f.name}>
            <span className={'ver-role' + (f.role === 'Published version' ? ' main' : '')}>{f.role}</span>
            <div>
              {f.href ? <a className="link-btn" href={f.href} target="_blank" rel="noreferrer">{f.name}</a> : <strong>{f.name}</strong>}
              <small>{f.detail}</small>
            </div>
          </li>
        ))}
      </ul>

      <h3>Topics</h3>
      {topics.length === 0 ? <p className="muted-text detail-line">Unfiled</p> : (
        <ul className="topic-links">
          {topics.map((t) => (
            <li key={t.id}>
              <button className="link-btn" onClick={() => { act.setReader(paperId); act.enterTopic(t.id) }}>{t.title}</button>
              <button className="link-btn quiet" onClick={() => onUnlink(t.id)}>Remove from topic</button>
            </li>
          ))}
        </ul>
      )}
      {choices.length > 0 && <button ref={pickerButton} className="link-btn lib-start"
        aria-expanded={topicsOpen} aria-controls={topicsOpen ? pickerId : undefined}
        onClick={() => { if (topicsOpen) closePicker(); else setTopicsOpen(true) }}>
        <Icon name="plus" size={14} /> Add to topic
      </button>}
      {choices.length > 0 && topicsOpen && (
        <div className="topic-picker" id={pickerId} onKeyDown={(e) => {
          if (e.key === 'Escape') { e.stopPropagation(); closePicker() }
        }}>
          <label className="field-search">
            <Icon name="search" size={15} />
            <input ref={focusTopicSearch} value={topicQuery} onChange={(e) => setTopicQuery(e.target.value)}
              placeholder="Search topics…" aria-label="Search topics to add" />
          </label>
          {matchingTopics.length ? (
            <ul className="topic-picker-results" aria-label="Matching topics">
              {matchingTopics.map((t) => (
                <li key={t.id}>
                  <button aria-label={'Add to ' + t.title} onClick={() => { act.linkPaper(paperId, t.id); closePicker() }}>
                    <span>{t.title}</span><Icon name="plus" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="topic-picker-empty" role="status">No matching topics.</p>}
        </div>
      )}

      <h3>Used in</h3>
      <div className="usage-grid">
        <span>{plural(i.notes.length, 'note')}</span>
        <span>{plural(i.citations.length, 'picked citation')}</span>
        <span>{plural(i.wiki.length, 'wiki statement')}</span>
        <span>{plural(i.comparison.length, 'comparison row')}</span>
        <span>{plural(i.draft.length, 'draft sentence')}</span>
      </div>
      <div className="detail-foot">
        <button className="danger-link" onClick={onDelete}><Icon name="trash" size={14} /> Delete from library…</button>
      </div>
    </aside>
  )
}

type LibraryDialog = 'delete' | 'empty' | 'review' | 'reading'

export function Library() {
  const { state, act } = useStore()
  const target = state.route.view === 'library' ? state.route.paperId : undefined
  const [q, setQ] = useState('')
  const [membership, setMembership] = useState<'all' | 'in-topic' | 'unfiled'>('all')
  const [availability, setAvailability] = useState('')
  const [selected, setSelected] = useState(target ?? state.library[0] ?? null)
  const [dialog, setDialog] = useState<LibraryDialog | null>(null)
  const [trashOpen, setTrashOpen] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [removed, setRemoved] = useState<{ paperId: string; topicId: string } | null>(null)
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const rows = state.library.filter((id) => {
    const p = PAPERS[id]
    const meta = LIBRARY_META[id]
    const text = [p.title, p.short, ...p.authors, p.externalId, p.doi, meta.identity, ...meta.tags,
      ...libraryFiles(state, id).map((f) => f.name)].join(' ').toLowerCase()
    if (terms.some((term) => !text.includes(term))) return false
    const inTopic = topicsOfPaper(state, id).length > 0
    if ((membership === 'in-topic' && !inTopic) || (membership === 'unfiled' && inTopic)) return false
    return !availability || p.stored === availability
  })
  const current = selected && rows.includes(selected) ? selected : rows[0]
  const paper = current ? PAPERS[current] : null

  function showPaper(paperId: string) {
    setSelected(paperId)
    setQ('')
    setMembership('all')
    setAvailability('')
    setTrashOpen(false)
  }

  return (
    <div className="page library-page">
      <PageHead icon="library" title="Library" sub={plural(state.library.length, 'paper') + ' in your library, available across topics.'}>
        <button className="ghost-btn trash-toggle" onClick={() => { setTrashOpen(!trashOpen); setFeedback(''); setRemoved(null) }} aria-pressed={trashOpen}>
          <Icon name={trashOpen ? 'arrowLeft' : 'trash'} size={15} /> {trashOpen ? 'Back to library' : 'Trash (' + state.trash.length + ')'}
        </button>
        <button className="ghost-btn" disabled title="PDF import is unavailable in the prototype"><Icon name="paperclip" size={15} /> Import PDFs</button>
      </PageHead>

      <div className="page-body scroll">
        {feedback && <p className="review-done" role="status">{feedback}</p>}
        {removed && <p className="review-done" role="status">
          Removed {PAPERS[removed.paperId].short} from {state.topics.find((t) => t.id === removed.topicId)?.title}.
          <button className="link-btn" onClick={() => { act.linkPaper(removed.paperId, removed.topicId); setRemoved(null) }}>Undo</button>
        </p>}
        {trashOpen ? (
          <section className="trash" aria-label="Trash">
            <div className="trash-head">
              <h2>Trash</h2>
              {state.trash.length > 0 && <button className="link-btn quiet" onClick={() => setDialog('empty')}>Empty trash…</button>}
            </div>
            {state.trash.length === 0 ? <p className="muted-text trash-empty">No papers in the trash.</p> : state.trash.map((t) => (
              <div key={t.paperId} className="trash-row">
                <span className="grow">
                  <strong>{PAPERS[t.paperId].title}</strong>
                  <small>Deleted {t.when.toLowerCase()} · {t.topics.length ? 'Restore to ' + t.topics.map((id) => state.topics.find((topic) => topic.id === id)?.title).join(', ') : 'Was unfiled'}</small>
                </span>
                <button className="ghost-btn sm" onClick={() => {
                  act.restorePaper(t.paperId)
                  showPaper(t.paperId)
                  setFeedback(PAPERS[t.paperId].short + ' restored to the library.')
                }}><Icon name="undo" size={13} /> Restore</button>
              </div>
            ))}
          </section>
        ) : <>
          {state.dupReview === 'pending' && (
            <div className="review-banner">
              <Icon name="alert" size={16} />
              <div className="grow">
                <strong>1 import needs your decision</strong>
                <p>{DUPLICATE_REVIEW.file} may match an existing paper.</p>
              </div>
              <button className="ghost-btn sm accent" onClick={() => setDialog('review')}>Review import</button>
            </div>
          )}

          <div className="lib-tools">
            <label className="field-search">
              <Icon name="search" size={15} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, author, DOI or arXiv ID" aria-label="Search library" />
            </label>
            <div className="seg" role="group" aria-label="Topic membership">
              {MEMBERSHIP_FILTERS.map(([id, label]) => (
                <button key={id} aria-pressed={membership === id} className={membership === id ? 'on' : ''} onClick={() => setMembership(id)}>{label}</button>
              ))}
            </div>
            <select className="lib-select" aria-label="Text availability" value={availability} onChange={(e) => setAvailability(e.target.value)}>
              <option value="">Any text availability</option>
              {Object.entries(TEXT_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div>

          <div className="lib-grid">
            <section aria-label="Papers" className="lib-list">
              {rows.map((id) => {
                const p = PAPERS[id]
                const meta = LIBRARY_META[id]
                const topics = topicsOfPaper(state, id)
                return (
                  <button key={id} aria-pressed={current === id} className={'lib-row' + (current === id ? ' on' : '')} onClick={() => setSelected(id)}>
                    <span className="lib-kind"><Icon name={p.stored === 'metadata' ? 'book' : 'file'} size={16} /></span>
                    <span className="grow">
                      <strong>{p.title}</strong>
                      <small>{p.authors.slice(0, 2).join(', ')}{p.authors.length > 2 ? ' et al.' : ''} · {p.venue} {p.year}</small>
                      <span className="lib-chips">
                        <span className="tag">{TEXT_LABEL[p.stored]}</span>
                        {topics.length ? <span className="tag ok">{plural(topics.length, 'topic')}</span> : <span className="tag warn">Unfiled</span>}
                        {id === DUPLICATE_REVIEW.separateId && <span className="tag quiet">Separate import</span>}
                        {meta.tags.map((t) => <span key={t} className="tag quiet">#{t}</span>)}
                      </span>
                    </span>
                    <small className="lib-added">{meta.origin}<br />{meta.added}</small>
                  </button>
                )
              })}
              {!rows.length && <p className="muted-text pad">{state.library.length ? 'No paper matches.' : 'Your library is empty.'}</p>}
            </section>
            {current && <Detail key={current} paperId={current}
              onRead={() => setDialog('reading')} onDelete={() => setDialog('delete')}
              onUnlink={(topicId) => {
                act.unlinkPaper(current, topicId)
                setFeedback('')
                setRemoved({ paperId: current, topicId })
              }} />}
          </div>
        </>}
      </div>

      {dialog === 'review' && <ImportReview onClose={() => setDialog(null)} onResolve={(choice) => {
        act.resolveDuplicate(choice)
        showPaper(choice === 'merged' ? DUPLICATE_REVIEW.paperId : DUPLICATE_REVIEW.separateId)
        setFeedback(choice === 'merged' ? 'Imported file linked to QASPER as another version.' : 'Imported file kept as a separate paper.')
        setRemoved(null)
        setDialog(null)
      }} />}
      {dialog === 'empty' && <EmptyTrashDialog onClose={() => setDialog(null)} onConfirm={(clear) => {
        act.emptyTrash(clear)
        setFeedback(clear ? 'Trash emptied and saved evidence excerpts cleared.' : 'Trash emptied. Saved evidence excerpts remain available as history.')
        setDialog(null)
      }} />}
      {dialog === 'reading' && paper && <Dialog title={paper.title} onClose={() => setDialog(null)}>
        <p className="byline">{paper.authors.join(', ')}</p>
        <h3>{paper.stored === 'abstract' ? 'Abstract' : 'Full text'}</h3>
        <div className="lib-abstract">{paper.passages.map((passage) => <p key={passage.id}>{passage.text}</p>)}</div>
        {topicsOfPaper(state, paper.id).includes(DEMO_TOPIC) && <div className="dialog-actions">
          <button className="ghost-btn" onClick={() => { act.setReader(paper.id); act.enterTopic(DEMO_TOPIC) }}>Open in Read &amp; ask</button>
        </div>}
      </Dialog>}
      {current && paper && dialog === 'delete' && <Dialog title={'Delete “' + paper.short + '” from the library?'} onClose={() => setDialog(null)}>
        <p className="dialog-text">The paper moves to the trash. Expand a section to review the affected records.</p>
        <Impact paperId={current} />
        <p className="dialog-text muted-text">Restoring the paper brings back its topic memberships. Until then, past evidence can be viewed as history.</p>
        <div className="dialog-actions">
          <button className="ghost-btn" onClick={() => setDialog(null)}>Cancel</button>
          <button className="danger" onClick={() => {
            act.deletePaper(current)
            setFeedback(paper.short + ' moved to trash.')
            setRemoved(null)
            setDialog(null)
          }}><Icon name="trash" size={14} /> Move to trash</button>
        </div>
      </Dialog>}
    </div>
  )
}
