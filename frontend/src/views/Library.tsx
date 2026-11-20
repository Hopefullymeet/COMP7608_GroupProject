import { count, useLanguage, type Message } from '../i18n'
import { useState } from 'react'
import { libraryFiles, topicsOfPaper, useStore, type State } from '../data/store'
import { DEMO_TOPIC, EVIDENCE, PAPERS } from '../data/fixtures'
import { MANUSCRIPTS, DUPLICATE_REVIEW, LIBRARY_META } from '../data/workspace'
import type { Paper } from '../data/types'
import { Icon } from '../components/Icon'
import { Dialog, PageHead } from '../components/PageHead'
import { TopicPicker } from '../components/TopicPicker'

const MEMBERSHIP_FILTERS = [['all', 'All'], ['in-topic', 'In a topic'], ['unfiled', 'Unfiled']] as const
const TEXT_LABEL: Record<Paper['stored'], string> = {
  'full-text': 'Full text', abstract: 'Abstract only', excerpt: 'Selected excerpts', metadata: 'Metadata only',
}
const READING_LABEL: Record<Exclude<Paper['stored'], 'metadata'>, string> = {
  'full-text': 'full text', abstract: 'abstract', excerpt: 'excerpts',
}

function impactOf(s: State, paperId: string) {
  const uses = (id: string) => EVIDENCE[id]?.paperId === paperId
  return {
    topics: s.topics.filter((t) => topicsOfPaper(s, paperId).includes(t.id)),
    notes: s.noted.filter(uses),
    citations: s.cited.filter(uses),
    comparison: s.comparison.rows.filter((r) => r.cells.some((c) => c.evidenceId && uses(c.evidenceId))),
    wiki: s.wiki.pages.flatMap((page) => page.statements.filter((st) => st.evidenceIds.some(uses)).map((statement) => ({ page, statement }))),
    draft: MANUSCRIPTS.flatMap(({ id, name, citeKeys }) => s.check.manuscripts[id].sentences.flatMap((sentence, index) =>
      sentence.cites.some((key) => citeKeys[key] === paperId) ? [{ sentence, index, name }] : [])),
  }
}

function Impact({ paperId }: { paperId: string }) {
  const { tr } = useLanguage()
  const { state } = useStore()
  const records = impactOf(state, paperId)
  const groups = [
    { label: 'Topics', entries: records.topics.map((t) => t.title) },
    { label: 'Saved notes', entries: records.notes.map((id) => EVIDENCE[id].quote) },
    { label: 'Picked citations', entries: records.citations.map((id) => EVIDENCE[id].quote) },
    { label: 'Comparison rows', entries: records.comparison.map((r) => r.dimension) },
    { label: 'Wiki statements', entries: records.wiki.map(({ page, statement }) => page.title + ' · ' + statement.text) },
    { label: 'Draft sentences', entries: records.draft.map(({ sentence, index, name }) => name + ' · ' + (index + 1) + '. ' + sentence.text) },
  ]
  return (
    <div className="impact">
      {groups.map(({ label, entries }) => (
        <details key={label} open={label === 'Topics' ? true : undefined}>
          <summary>{tr(label)}<span className={entries.length ? 'hit' : ''}>{entries.length}</span></summary>
          {entries.length ? <ul>{entries.map((entry, index) => <li key={index}>{entry}</li>)}</ul> : <p>{tr('None')}</p>}
        </details>
      ))}
    </div>
  )
}

function EmptyTrashDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: (clearExcerpts: boolean) => void }) {
  const { tr } = useLanguage()
  const { state } = useStore()
  const [clear, setClear] = useState(false)
  return (
    <Dialog title={tr('Empty the trash permanently?')} onClose={onClose}>
      <p className="dialog-text">{tr('This cannot be undone. Permanent deletion applies to')}{' '}{count(tr, state.trash.length, 'paper')}:</p>
      <ul className="dialog-list">{state.trash.map((item) => <li key={item.paperId}>{PAPERS[item.paperId].title}</li>)}</ul>
      <p className="dialog-text">{tr('Original files, parsed text and search index entries are removed. Bibliographic records and past judgments remain as history.')}</p>
      <label className="check-row">
        <input type="checkbox" checked={clear} onChange={(e) => setClear(e.target.checked)} />
        <span>{tr('Also clear saved evidence excerpts from notes and citations')}</span>
      </label>
      <div className="dialog-actions">
        <button className="ghost-btn" onClick={onClose}>{tr('Cancel')}</button>
        <button className="danger" onClick={() => onConfirm(clear)}>{tr('Delete permanently')}</button>
      </div>
    </Dialog>
  )
}

function ImportReview({ onClose, onResolve }: { onClose: () => void; onResolve: (choice: 'merged' | 'separate') => void }) {
  const { tr } = useLanguage()
  const { state } = useStore()
  const review = DUPLICATE_REVIEW
  const existing = PAPERS[review.paperId]
  const canLink = state.library.includes(review.paperId)
  return (
    <Dialog title={tr('Review a possible duplicate')} onClose={onClose}>
      <div className="import-review">
        <div className="card">
          <h3>{tr('Incoming file')}</h3><strong>{review.file}</strong>
          <p>{existing.title}</p><small>{existing.authors.slice(0, 2).join(', ')}{' '}{tr('et al. ·')}{' '}{existing.year}</small>
        </div>
        <div className="card">
          <h3>{tr('Existing match')}</h3><strong>{LIBRARY_META[review.paperId].files[0].name}</strong>
          <p>{existing.title}</p><small>{existing.authors.slice(0, 2).join(', ')}{' '}{tr('et al. ·')}{' '}{existing.year}</small>
        </div>
      </div>
      <p className="dialog-text">{tr(review.match)}. {tr(review.reason)}</p>
      {!canLink && <p className="dialog-text muted-text">{tr('The existing record is unavailable. Restore it before linking a version, or keep this file as a separate paper.')}</p>}
      <div className="dialog-actions">
        <button className="ghost-btn" onClick={() => onResolve('separate')}>{tr('Keep as separate paper')}</button>
        <button className="primary" disabled={!canLink} onClick={() => onResolve('merged')}>{tr('Link as another version')}</button>
      </div>
    </Dialog>
  )
}

function Detail({ paperId, onRead, onDelete, onUnlink }: {
  paperId: string; onRead: () => void; onDelete: () => void; onUnlink: (topicId: string) => void
}) {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const p = PAPERS[paperId]
  const meta = LIBRARY_META[paperId]
  const files = libraryFiles(state, paperId)
  const topics = state.topics.filter((t) => topicsOfPaper(state, paperId).includes(t.id))
  const choices = state.topics.filter((t) => !topicsOfPaper(state, paperId).includes(t.id))
  const i = impactOf(state, paperId)

  return (
    <aside className="lib-detail card">
      <p className="eyebrow">{p.venue} {p.year}{' '}{tr('· venue from')}{' '}{p.venueSource}</p>
      <h2>{p.title}</h2>
      <p className="byline">{p.authors.join(', ')}</p>
      <div className="lib-reading-actions">
        <span className="tag">{TEXT_LABEL[p.stored]}</span>
        {p.stored !== 'metadata' && <button className="link-btn" onClick={onRead}><Icon name="book" size={14} />{' '}{tr('Read')}{' '}{READING_LABEL[p.stored]}</button>}
      </div>

      <h3>{tr('Identity')}</h3>
      <p className="detail-line">{tr(meta.identity)}</p>
      {p.doi && <a className="link-btn" href={'https://doi.org/' + p.doi} target="_blank" rel="noreferrer">{tr('DOI')}{' '}{p.doi}</a>}

      <h3>{tr('Files and versions')}</h3>
      <ul className="versions">
        {files.map((f) => (
          <li key={f.name}>
            <span className={'ver-role' + (f.role === 'Published version' ? ' main' : '')}>{tr(f.role)}</span>
            <div>
              {f.href ? <a className="link-btn" href={f.href} target="_blank" rel="noreferrer">{f.name}</a> : <strong>{f.name}</strong>}
              <small>{tr(f.detail)}</small>
            </div>
          </li>
        ))}
      </ul>

      <h3>{tr('Topics')}</h3>
      {topics.length === 0 ? <p className="muted-text detail-line">{tr('Unfiled')}</p> : (
        <ul className="topic-links">
          {topics.map((t) => (
            <li key={t.id}>
              <button className="link-btn" onClick={() => { act.setReader(paperId); act.enterTopic(t.id) }}>{t.title}</button>
              <button className="link-btn quiet" onClick={() => onUnlink(t.id)}>{tr('Remove from topic')}</button>
            </li>
          ))}
        </ul>
      )}
      {choices.length > 0 && <TopicPicker topics={choices} onSelect={(topicId) => act.linkPaper(paperId, topicId)} />}

      <h3>{tr('Used in')}</h3>
      <div className="usage-grid">
        <span>{count(tr, i.notes.length, 'note')}</span>
        <span>{count(tr, i.citations.length, 'picked citation')}</span>
        <span>{count(tr, i.wiki.length, 'wiki statement')}</span>
        <span>{count(tr, i.comparison.length, 'comparison row')}</span>
        <span>{count(tr, i.draft.length, 'draft sentence')}</span>
      </div>
      <div className="detail-foot">
        <button className="danger-link" onClick={onDelete}><Icon name="trash" size={14} />{' '}{tr('Delete from library…')}</button>
      </div>
    </aside>
  )
}

type LibraryDialog = 'delete' | 'empty' | 'review' | 'reading'

export function Library() {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const target = state.route.view === 'library' ? state.route.paperId : undefined
  const [q, setQ] = useState('')
  const [membership, setMembership] = useState<'all' | 'in-topic' | 'unfiled'>('all')
  const [availability, setAvailability] = useState('')
  const [selected, setSelected] = useState(target ?? state.library[0] ?? null)
  const [dialog, setDialog] = useState<LibraryDialog | null>(null)
  const [trashOpen, setTrashOpen] = useState(false)
  const [feedback, setFeedback] = useState<Message>()
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
      <PageHead icon="library" title={tr('Library')} sub={tr('{0} in your library, available across topics.', count(tr, state.library.length, 'paper'))}>
        <button className="ghost-btn trash-toggle" onClick={() => { setTrashOpen(!trashOpen); setFeedback(undefined); setRemoved(null) }} aria-pressed={trashOpen}>
          <Icon name={trashOpen ? 'arrowLeft' : 'trash'} size={15} /> {trashOpen ? tr('Back to library') : tr('Trash ({0})', state.trash.length)}
        </button>
        <button className="ghost-btn" disabled title={tr('PDF import is unavailable in the prototype')}><Icon name="paperclip" size={15} />{' '}{tr('Import PDFs')}</button>
      </PageHead>

      <div className="page-body scroll">
        {feedback && <p className="review-done" role="status">{tr(...feedback)}</p>}
        {removed && <p className="review-done" role="status">
          {tr('Removed')}{' '}{PAPERS[removed.paperId].short}{' '}{tr('from')}{' '}{state.topics.find((t) => t.id === removed.topicId)?.title}.
          <button className="link-btn" onClick={() => { act.linkPaper(removed.paperId, removed.topicId); setRemoved(null) }}>{tr('Undo')}</button>
        </p>}
        {trashOpen ? (
          <section className="trash" aria-label={tr('Trash')}>
            <div className="trash-head">
              <h2>{tr('Trash')}</h2>
              {state.trash.length > 0 && <button className="link-btn quiet" onClick={() => setDialog('empty')}>{tr('Empty trash…')}</button>}
            </div>
            {state.trash.length === 0 ? <p className="muted-text trash-empty">{tr('No papers in the trash.')}</p> : state.trash.map((t) => (
              <div key={t.paperId} className="trash-row">
                <span className="grow">
                  <strong>{PAPERS[t.paperId].title}</strong>
                  <small>{tr('Deleted')}{' '}{t.when.toLowerCase()} · {t.topics.length ? tr('Restore to {0}', t.topics.map((id) => state.topics.find((topic) => topic.id === id)?.title).join(', ')) : tr('Was unfiled')}</small>
                </span>
                <button className="ghost-btn sm" onClick={() => {
                  act.restorePaper(t.paperId)
                  showPaper(t.paperId)
                  setFeedback(['{0} restored to the library.', PAPERS[t.paperId].short])
                }}><Icon name="undo" size={13} />{' '}{tr('Restore')}</button>
              </div>
            ))}
          </section>
        ) : <>
          {state.dupReview === 'pending' && (
            <div className="review-banner">
              <Icon name="alert" size={16} />
              <div className="grow">
                <strong>{tr('1 import needs your decision')}</strong>
                <p>{DUPLICATE_REVIEW.file}{' '}{tr('may match an existing paper.')}</p>
              </div>
              <button className="ghost-btn sm accent" onClick={() => setDialog('review')}>{tr('Review import')}</button>
            </div>
          )}

          <div className="lib-tools">
            <label className="field-search">
              <Icon name="search" size={15} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Search title, author, DOI or arXiv ID')} aria-label={tr('Search library')} />
            </label>
            <div className="seg" role="group" aria-label={tr('Topic membership')}>
              {MEMBERSHIP_FILTERS.map(([id, label]) => (
                <button key={id} aria-pressed={membership === id} className={membership === id ? 'on' : ''} onClick={() => setMembership(id)}>{tr(label)}</button>
              ))}
            </div>
            <select className="lib-select" aria-label={tr('Text availability')} value={availability} onChange={(e) => setAvailability(e.target.value)}>
              <option value="">{tr('Any text availability')}</option>
              {Object.entries(TEXT_LABEL).map(([id, label]) => <option key={id} value={id}>{tr(label)}</option>)}
            </select>
          </div>

          <div className="lib-grid">
            <section aria-label={tr('Papers')} className="lib-list">
              {rows.map((id) => {
                const p = PAPERS[id]
                const meta = LIBRARY_META[id]
                const topics = topicsOfPaper(state, id)
                return (
                  <button key={id} aria-pressed={current === id} className={'lib-row' + (current === id ? ' on' : '')} onClick={() => setSelected(id)}>
                    <span className="lib-kind"><Icon name={p.stored === 'metadata' ? 'book' : 'file'} size={16} /></span>
                    <span className="grow">
                      <strong>{p.title}</strong>
                      <small>{p.authors.slice(0, 2).join(', ')}{p.authors.length > 2 ? tr(' et al.') : ''} · {p.venue} {p.year}</small>
                      <span className="lib-chips">
                        <span className="tag">{TEXT_LABEL[p.stored]}</span>
                        {topics.length ? <span className="tag ok">{count(tr, topics.length, 'topic')}</span> : <span className="tag warn">{tr('Unfiled')}</span>}
                        {id === DUPLICATE_REVIEW.separateId && <span className="tag quiet">{tr('Separate import')}</span>}
                        {meta.tags.map((t) => <span key={t} className="tag quiet">#{t}</span>)}
                      </span>
                    </span>
                    <small className="lib-added">{tr(meta.origin)}<br />{meta.added}</small>
                  </button>
                )
              })}
              {!rows.length && <p className="muted-text pad">{state.library.length ? tr('No paper matches.') : tr('Your library is empty.')}</p>}
            </section>
            {current && <Detail key={current} paperId={current}
              onRead={() => setDialog('reading')} onDelete={() => setDialog('delete')}
              onUnlink={(topicId) => {
                act.unlinkPaper(current, topicId)
                setFeedback(undefined)
                setRemoved({ paperId: current, topicId })
              }} />}
          </div>
        </>}
      </div>

      {dialog === 'review' && <ImportReview onClose={() => setDialog(null)} onResolve={(choice) => {
        act.resolveDuplicate(choice)
        showPaper(choice === 'merged' ? DUPLICATE_REVIEW.paperId : DUPLICATE_REVIEW.separateId)
        setFeedback([choice === 'merged' ? 'Imported file linked to QASPER as another version.' : 'Imported file kept as a separate paper.'])
        setRemoved(null)
        setDialog(null)
      }} />}
      {dialog === 'empty' && <EmptyTrashDialog onClose={() => setDialog(null)} onConfirm={(clear) => {
        act.emptyTrash(clear)
        setFeedback([clear ? 'Trash emptied and saved evidence excerpts cleared.' : 'Trash emptied. Saved evidence excerpts remain available as history.'])
        setDialog(null)
      }} />}
      {dialog === 'reading' && paper && <Dialog title={paper.title} onClose={() => setDialog(null)}>
        <p className="byline">{paper.authors.join(', ')}</p>
        <h3>{paper.stored === 'abstract' ? tr('Abstract') : TEXT_LABEL[paper.stored]}</h3>
        <div className="lib-abstract">{paper.passages.map((passage) => (
          <div key={passage.id}>
            {paper.stored === 'excerpt' && <b>{passage.section}{' '}{tr('· PDF p.')}{' '}{passage.page}</b>}
            <p>{passage.text}</p>
          </div>
        ))}</div>
        {topicsOfPaper(state, paper.id).includes(DEMO_TOPIC) && <div className="dialog-actions">
          <button className="ghost-btn" onClick={() => { act.setReader(paper.id); act.enterTopic(DEMO_TOPIC) }}>{tr('Open in Read & ask')}</button>
        </div>}
      </Dialog>}
      {current && paper && dialog === 'delete' && <Dialog title={tr('Delete “{0}” from the library?', paper.short)} onClose={() => setDialog(null)}>
        <p className="dialog-text">{tr('The paper moves to the trash. Expand a section to review the affected records.')}</p>
        <Impact paperId={current} />
        <p className="dialog-text muted-text">{tr('Restoring the paper brings back its topic memberships. Until then, past evidence can be viewed as history.')}</p>
        <div className="dialog-actions">
          <button className="ghost-btn" onClick={() => setDialog(null)}>{tr('Cancel')}</button>
          <button className="danger" onClick={() => {
            act.deletePaper(current)
            setFeedback(['{0} moved to trash.', paper.short])
            setRemoved(null)
            setDialog(null)
          }}><Icon name="trash" size={14} />{' '}{tr('Move to trash')}</button>
        </div>
      </Dialog>}
    </div>
  )
}
