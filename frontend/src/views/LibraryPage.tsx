import { count, useLanguage } from '../i18n'
import { lazy, Suspense, useState } from 'react'
import { PageHead, Dialog } from '../components/PageHead'
import { Icon } from '../components/Icon'
import { useStore } from '../data/store'
import type { Impact, Picked, Review } from '../api/library'
import { useRead, useWorkspace } from '../data/WorkspaceProvider'
import { Notes } from './Notes'
import { PaperImportDialog, usePdfDrop } from './PaperImportDialog'
import { PublicationDetails } from '../components/PublicationDetails'

const PdfReader = lazy(() => import('./PdfReader'))

function publicIdentity(identity: string) {
  return /^[a-f0-9]{64}$/i.test(identity) ? '' : identity
}

type LibraryReader = { topic: string; version: string; title: string }

function ArchivedReader({ reader, close }: { reader: LibraryReader; close: () => void }) {
  const { tr } = useLanguage()
  const library = useRead('library.list', { topic_id: reader.topic })
  const version = library?.items.flatMap((item) => item.source_versions)
    .find((item) => item.source_version_id === reader.version)
  const pdf = version?.pdf_available ?? version?.available_scope === 'full_text'
  const source = useRead('source.read', { topic_id: reader.topic, source_version_id: reader.version }, !!version && !pdf)
  return <div className="page library-reader">
    <PageHead icon="book" title={reader.title} sub={tr('Library')}>
      <button className="ghost-btn" onClick={close}>{tr('Close')}</button>
    </PageHead>
    {pdf ? <Suspense fallback={<p role="status">{tr('Opening PDF…')}</p>}>
      <PdfReader topic={reader.topic} version={reader.version} />
    </Suspense> : <div className="page-body scroll">{source?.passages.map((p) => <p key={p.passage_id}>{p.text}</p>)}
      {source && !source.passages.length && tr('Text unavailable')}</div>}
  </div>
}

export function LibraryPage() {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const { api, write, prepare, busy, report, demo } = useWorkspace()
  const catalog = useRead('library.catalog', {})
  const archived = useRead('workspace.archived', {})
  const [tab, setTab] = useState('Papers'),
    [query, search] = useState(''),
    [limit, more] = useState(30)
  const [membership, filterMembership] = useState('all'),
    [availability, filterScope] = useState('')
  const [chosen, choose] = useState<string[]>([]),
    [focus, setFocus] = useState(state.route.view === 'library' ? (state.route.paperId ?? '') : '')
  const [topic, setTopic] = useState(''),
    [tag, setTag] = useState('')
  const [review, setReview] = useState<Review>(),
    [files, setFiles] = useState<Picked[]>()
  const [target, setTarget] = useState<string>()
  const [importing, setImporting] = useState<(File | string)[]>()
  usePdfDrop(!demo && !importing ? (files) => { setTarget(undefined); setImporting(files) } : undefined)
  const [impact, setImpact] = useState<Impact & { ids: string[]; purge: boolean }>(),
    [clear, setClear] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [reader, setReader] = useState<LibraryReader>()
  const topics = state.topics
  const rows = (tab === 'Trash' ? catalog?.trash : catalog?.papers) ?? []
  const shown = rows.filter(
    (p) =>
      (membership === 'all' || (membership === 'linked') === p.topic_ids.length > 0) &&
      (!availability || p.source_versions.some((v) => v.available_scope === availability)) &&
      [p.title, p.identity, ...p.authors, ...p.tags].join(' ').toLowerCase().includes(query.toLowerCase()),
  )
  const paper = shown.find((p) => p.paper_id === focus) ?? shown[0]
  const checked = chosen.filter((id) => rows.some((p) => p.paper_id === id))
  const ids = checked.length ? checked : paper ? [paper.paper_id] : []
  async function pick(paper_id?: string) {
    if (!demo) { setTarget(paper_id); setImporting([]); return }
    const picked = await api.call('file.pick', { purpose: 'papers' })
    if (picked.files.length) {
      setTarget(paper_id)
      setFiles(picked.files)
    }
  }
  async function preview(purge: boolean) {
    const result = await api.call('library.impact', { paper_ids: ids })
    setImpact({ ...result, ids, purge })
    setClear(false)
  }
  function organize(action: 'link' | 'unlink' | 'tag' | 'untag', value: string) {
    void write('library.organize', { paper_ids: ids, action, value })
      .then(() => setFeedback('Library updated.'))
      .catch(report)
  }
  const activeTopic = paper?.topic_ids.includes(topic) && topics.some((t) => t.id === topic) ? topic :
    paper?.topic_ids.find((id) => topics.some((t) => t.id === id))
  const archivedTopics = archived?.items.filter((item) => item.kind === 'topic') ?? []
  const readerTopic = activeTopic ?? paper?.topic_ids.find((id) => archivedTopics.some((t) => t.id === id))
  if (reader) return <ArchivedReader reader={reader} close={() => setReader(undefined)} />
  return (
    <div className="page library-page">
      <PageHead trace icon="library" title={tr('Library')} sub={tr('Papers, versions and research notes')}>
        <button className="primary" disabled={busy} onClick={() => void pick().catch(report)}>
          <Icon name="plus" size={14} />{' '}{tr('Import papers')}
        </button>
      </PageHead>
      <div className="page-body scroll">
        <div className="lib-tools">
          <div className="seg">
            {['Papers', 'Trash', 'Notes', 'Archived'].map((t) => (
              <button
                key=                {tr(t)}
                className={t === tab ? 'on' : ''}
                aria-pressed={t === tab}
                onClick={() => {
                  setTab(t)
                  choose([])
                  setFeedback('')
                }}
              >
                                {tr(t)}
              </button>
            ))}
          </div>
          <select
            aria-label={tr('Working topic')}
            className="lib-select"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          >
            <option value="">{tr('Choose a topic')}</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
        {feedback && (
          <p className="review-done" role="status">
            <Icon name="check" size={15} /> {tr(feedback)}
          </p>
        )}
        {tab === 'Notes' ? (
          <Notes key={topic} topic={topic} />
        ) : tab === 'Archived' ? (
          <section className="card result-card">
            <h2>{tr('Archived topics and sessions')}</h2>
            {archived?.items.map((a) => (
              <div className="trash-row" key={a.id}>
                <b className="grow">{a.title}</b>
                <span className="tag">{tr(a.kind)}</span>
                <button
                  className="ghost-btn"
                  disabled={busy}
                  onClick={() => void write('workspace.unarchive', { id: a.id, kind: a.kind }).catch(report)}
                >
                  {tr('Restore')}
                </button>
              </div>
            ))}
            {!archived?.items.length && <p>{tr('No archived items.')}</p>}
          </section>
        ) : (
          <>
            {tab === 'Papers' &&
              catalog?.reviews.map((r) => (
                <div key={r.review_id} className="review-banner">
                  <Icon name="alert" />
                  <div className="grow">
                    <strong>{tr('Import needs your decision')}</strong>
                    <p>
                      {r.name} · {tr(r.reason)}
                    </p>
                  </div>
                  <button className="ghost-btn" onClick={() => setReview(r)}>
                    {tr('Review import')}
                  </button>
                </div>
              ))}
            <div className="lib-tools">
              <label className="field-search">
                <Icon name="search" />
                <input
                  aria-label={tr('Search library')}
                  placeholder={tr('Search title, author, identifier or tag')}
                  value={query}
                  onChange={(e) => {
                    search(e.target.value)
                    more(30)
                  }}
                />
              </label>
              <select
                aria-label={tr('Topic membership')}
                value={membership}
                onChange={(e) => filterMembership(e.target.value)}
              >
                <option value="all">{tr('Any membership')}</option>
                <option value="linked">{tr('In a topic')}</option>
                <option value="unfiled">{tr('Unfiled')}</option>
              </select>
              <select
                aria-label={tr('Reading scope')}
                value={availability}
                onChange={(e) => filterScope(e.target.value)}
              >
                <option value="">{tr('Any text availability')}</option>
                <option value="full_text">{tr('Full text')}</option>
                <option value="abstract">{tr('Abstract')}</option>
                <option value="metadata">{tr('Metadata only')}</option>
              </select>
              {ids.length > 0 &&
                (tab === 'Trash' ? (
                  <>
                    <button
                      className="ghost-btn"
                      disabled={busy}
                      onClick={() =>
                        void write('library.restore', { paper_ids: ids })
                          .then((r) => setFeedback(r.warnings.join(' ') || 'Restored to library.'))
                          .catch(report)
                      }
                    >
                      {tr('Restore')}
                    </button>
                    <button className="danger-link" onClick={() => void preview(true).catch(report)}>
                      {tr('Delete permanently…')}
                    </button>
                  </>
                ) : (
                  <button className="ghost-btn" onClick={() => void preview(false).catch(report)}>
                    {tr('Move to trash…')}
                  </button>
                ))}
            </div>
            <div className="lib-grid">
              <section className="lib-list">
                {shown.slice(0, limit).map((p) => (
                  <div className={'lib-row' + (p === paper ? ' on' : '')} key={p.paper_id}>
                    <input
                      type="checkbox"
                      aria-label={tr('Select {0}', p.title)}
                      checked={checked.includes(p.paper_id)}
                      onChange={(e) =>
                        choose(
                          e.target.checked
                            ? [...checked, p.paper_id]
                            : checked.filter((id) => id !== p.paper_id),
                        )
                      }
                    />
                    <button className="paper-choice" onClick={() => setFocus(p.paper_id)}>
                      <strong>{p.title}</strong>
                      {(p.authors.length > 0 || publicIdentity(p.identity)) && <small>{p.authors.join(', ') || publicIdentity(p.identity)}</small>}
                      <span className="lib-chips">
                        <span className="tag">{tr(p.source_versions[0].available_scope.replace('_', ' '))}</span>
                        <span className="tag">
                          {p.topic_ids.length
                            ? count(tr, p.topic_ids.length, 'topic')
                            : tr('Unfiled')}
                        </span>
                        {p.tags.map((t) => (
                          <span className="tag" key=                {tr(t)}>
                            #                {tr(t)}
                          </span>
                        ))}
                      </span>
                    </button>
                  </div>
                ))}
                {!shown.length && (
                  <p className="pad">{catalog ? tr('No matching papers.') : tr('Loading library…')}</p>
                )}
                {shown.length > limit && (
                  <button className="link-btn lib-more" onClick={() => more(limit + 30)}>
                    {tr('Show more papers')}
                  </button>
                )}
              </section>
              {paper && (
                <aside className="card lib-detail">
                  <h2>{paper.title}</h2>
                  {publicIdentity(paper.identity) && <p className="record-meta">{publicIdentity(paper.identity)}</p>}
                  {!demo && tab === 'Papers' && paper.topic_ids.length > 0 &&
                    <PublicationDetails key={paper.paper_id} paper={paper.paper_id}
                      topic={paper.topic_ids.includes(topic) ? topic : paper.topic_ids[0]} />}
                  <h3>{tr('Files and versions')}</h3>
                  {paper.files.map((f) => (
                    <p key={f.source_version_id}>
                      {f.name} · {tr(f.role.replaceAll('_', ' '))}{' '}

                    </p>
                  ))}
                  {paper.changes.map((c) => (
                    <p className="muted-text" key={c}>
                      {c}
                    </p>
                  ))}
                  {tab === 'Papers' && (
                    <>
                      {readerTopic && (
                        <button
                          className="link-btn"
                          onClick={() => activeTopic ?
                            act.navigate({
                              view: 'topic',
                              topicId: activeTopic,
                              tab: 'read',
                              sourceVersion: paper.source_versions[0].source_version_id,
                            }) : setReader({ topic: readerTopic, version: paper.source_versions[0].source_version_id, title: paper.title })
                          }
                        >
                          {tr('Open in reader')}
                        </button>
                      )}
                      <button className="link-btn" onClick={() => void pick(paper.paper_id).catch(report)}>
                        {tr('Add material version')}
                      </button>
                      <h3>{tr('Topics')}</h3>
                      {paper.topic_ids.map((id) => {
                        const active = topics.find((item) => item.id === id)
                        if (active) return <button key={id} className="link-btn" onClick={() => act.openTopic(id, 'read')}>{active.title}</button>
                        const item = archivedTopics.find((entry) => entry.id === id)
                        return item && <p key={id}>{item.title} · {tr('Archived')}</p>
                      })}
                      <div className="lib-tools">
                        <button
                          className="ghost-btn sm"
                          disabled={!topic || busy}
                          onClick={() => organize('link', topic)}
                        >
                          {tr('Add to topic')}
                        </button>
                        <button
                          className="ghost-btn sm"
                          disabled={!topic || busy}
                          onClick={() => organize('unlink', topic)}
                        >
                          {tr('Remove from topic')}
                        </button>
                      </div>
                      <h3>{tr('Tags')}</h3>
                      <input
                        className="text-field"
                        aria-label={tr('Tag')}
                        value={tag}
                        placeholder={tr('Tag name')}
                        onChange={(e) => setTag(e.target.value)}
                      />
                      <div className="lib-tools">
                        {(['tag', 'untag'] as const).map((a) => (
                          <button
                            key={a}
                            className="ghost-btn sm"
                            disabled={!tag.trim() || busy}
                            onClick={() => organize(a, tag.trim())}
                          >
                            {a === 'tag' ? tr('Add tag') : tr('Remove tag')}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </aside>
              )}
            </div>
          </>
        )}
      </div>
      {importing && <PaperImportDialog topics={topics.filter((item) => !target ||
        rows.find((row) => row.paper_id === target)?.topic_ids.includes(item.id))}
        initialTopic={topic && (!target || rows.find((row) => row.paper_id === target)?.topic_ids.includes(topic)) ? topic : undefined}
        initialFiles={importing} paperId={target} onClose={() => setImporting(undefined)}
        onImported={(paper) => setFocus(paper)} onOpenTopic={!target ? (id) => act.openTopic(id, 'synthesis') : undefined} />}
      {files && (
        <Dialog title={tr('Import papers')} onClose={() => setFiles(undefined)}>
          <p>{demo ? tr('Sample material selected for the contract demo.') : tr('Review the selected material.')}</p>
          {files.map((f) => (
            <p key={f.file_id}>{f.name}</p>
          ))}
          {demo ? <p>{topics.find((t) => t.id === topic)?.title ?? tr('Personal library')}</p> :
            <select aria-label={tr('Research topic')} value={topic} onChange={(event) => setTopic(event.currentTarget.value)}>
              {topics.filter((item) => !target || rows.find((row) => row.paper_id === target)?.topic_ids.includes(item.id))
                .map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>}
          <button
            className="primary"
            disabled={busy}
            onClick={() => {
              void prepare({
                kind: 'paper_import',
                input: {
                  files: files.map((f) => f.file_id),
                  ...(topic && { topic_id: topic }),
                  ...(target && { paper_id: target }),
                },
              })
              setFiles(undefined)
            }}
          >
            {tr(demo ? 'Review import scope' : 'Import papers')}
          </button>
        </Dialog>
      )}
      {review && (
        <Dialog title={tr('Review a possible duplicate')} onClose={() => setReview(undefined)}>
          <p>{tr('Incoming ·')}{' '}{review.name}</p>
          <p>{tr('Existing ·')}{' '}{catalog?.papers.find((p) => p.paper_id === review.paper_id)?.title ?? tr('In trash')}</p>
          <p>{tr(review.reason)}</p>
          <div className="dialog-actions">
            {(['separate', 'link'] as const).map((decision) => (
              <button
                key={decision}
                className={decision === 'link' ? 'primary' : 'ghost-btn'}
                disabled={
                  busy ||
                  (decision === 'link' && !catalog?.papers.some((p) => p.paper_id === review.paper_id))
                }
                onClick={() =>
                  void write('library.resolve_import', { review_id: review.review_id, decision })
                    .then(() => setReview(undefined))
                    .catch(report)
                }
              >
                {decision === 'link' ? tr('Link as another version') : tr('Keep separate')}
              </button>
            ))}
          </div>
        </Dialog>
      )}
      {impact && (
        <Dialog
          title={impact.purge ? tr('Permanently delete selected papers?') : tr('Move selected papers to trash?')}
          onClose={() => setImpact(undefined)}
        >
          {rows
            .filter((p) => impact.ids.includes(p.paper_id))
            .map((p) => (
              <p key={p.paper_id}>
                <b>{p.title}</b>
              </p>
            ))}
          <h3>{tr('Affected records')}</h3>
          {impact.references.map((r, i) => (
            <p key={i}>
              {tr(r.kind)} · {r.label}
            </p>
          ))}
          {!impact.references.length && <p>{tr('No linked records.')}</p>}
          {impact.purge && (
            <label className="check-row">
              <input type="checkbox" checked={clear} onChange={(e) => setClear(e.target.checked)} />{' '}{tr('Also clear saved excerpts')}
            </label>
          )}
          <div className="dialog-actions">
            <button className="ghost-btn" onClick={() => setImpact(undefined)}>
              {tr('Cancel')}
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={() => {
                const params = { paper_ids: impact.ids, revision: impact.revision }
                void (
                  impact.purge
                    ? write('library.purge', { ...params, clear_excerpts: clear })
                    : write('library.trash', params)
                )
                  .then(() => {
                    setImpact(undefined)
                    choose([])
                  })
                  .catch(report)
              }}
            >
              {impact.purge ? tr('Delete permanently') : tr('Move to trash')}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
