import { useState } from 'react'
import { PageHead, Dialog } from '../../../prototype/src/components/PageHead'
import { Icon } from '../../../prototype/src/components/Icon'
import { useStore } from '../../../prototype/src/data/store'
import type { Impact, Picked, Review } from '../api/library'
import { useRead, useWorkspace } from '../data/Workspace'
import { Notes } from './Notes'

export function LibraryPage() {
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
  const [impact, setImpact] = useState<Impact & { ids: string[]; purge: boolean }>(),
    [clear, setClear] = useState(false)
  const [feedback, setFeedback] = useState('')
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
  return (
    <div className="page library-page">
      <PageHead trace icon="library" title="Library" sub="Papers, versions and research notes">
        <button className="primary" disabled={busy} onClick={() => void pick().catch(report)}>
          <Icon name="plus" size={14} /> Import papers
        </button>
      </PageHead>
      <div className="page-body scroll">
        <div className="lib-tools">
          <div className="seg">
            {['Papers', 'Trash', 'Notes', 'Archived'].map((t) => (
              <button
                key={t}
                className={t === tab ? 'on' : ''}
                aria-pressed={t === tab}
                onClick={() => {
                  setTab(t)
                  choose([])
                  setFeedback('')
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <select
            aria-label="Working topic"
            className="lib-select"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          >
            <option value="">Choose a topic</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
        {feedback && (
          <p className="review-done" role="status">
            <Icon name="check" size={15} /> {feedback}
          </p>
        )}
        {tab === 'Notes' ? (
          <Notes key={topic} topic={topic} />
        ) : tab === 'Archived' ? (
          <section className="card result-card">
            <h2>Archived topics and sessions</h2>
            {archived?.items.map((a) => (
              <div className="trash-row" key={a.id}>
                <b className="grow">{a.title}</b>
                <span className="tag">{a.kind}</span>
                <button
                  className="ghost-btn"
                  disabled={busy}
                  onClick={() => void write('workspace.unarchive', { id: a.id, kind: a.kind }).catch(report)}
                >
                  Restore
                </button>
              </div>
            ))}
            {!archived?.items.length && <p>No archived items.</p>}
          </section>
        ) : (
          <>
            {tab === 'Papers' &&
              catalog?.reviews.map((r) => (
                <div key={r.review_id} className="review-banner">
                  <Icon name="alert" />
                  <div className="grow">
                    <strong>Import needs your decision</strong>
                    <p>
                      {r.name} · {r.reason}
                    </p>
                  </div>
                  <button className="ghost-btn" onClick={() => setReview(r)}>
                    Review import
                  </button>
                </div>
              ))}
            <div className="lib-tools">
              <label className="field-search">
                <Icon name="search" />
                <input
                  aria-label="Search library"
                  placeholder="Search title, author, identifier or tag"
                  value={query}
                  onChange={(e) => {
                    search(e.target.value)
                    more(30)
                  }}
                />
              </label>
              <select
                aria-label="Topic membership"
                value={membership}
                onChange={(e) => filterMembership(e.target.value)}
              >
                <option value="all">Any membership</option>
                <option value="linked">In a topic</option>
                <option value="unfiled">Unfiled</option>
              </select>
              <select
                aria-label="Reading scope"
                value={availability}
                onChange={(e) => filterScope(e.target.value)}
              >
                <option value="">Any text availability</option>
                <option value="full_text">Full text</option>
                <option value="abstract">Abstract</option>
                <option value="metadata">Metadata only</option>
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
                      Restore
                    </button>
                    <button className="danger-link" onClick={() => void preview(true).catch(report)}>
                      Delete permanently…
                    </button>
                  </>
                ) : (
                  <button className="ghost-btn" onClick={() => void preview(false).catch(report)}>
                    Move to trash…
                  </button>
                ))}
            </div>
            <div className="lib-grid">
              <section className="lib-list">
                {shown.slice(0, limit).map((p) => (
                  <div className={'lib-row' + (p === paper ? ' on' : '')} key={p.paper_id}>
                    <input
                      type="checkbox"
                      aria-label={'Select ' + p.title}
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
                      <small>{p.authors.join(', ') || p.identity}</small>
                      <span className="lib-chips">
                        <span className="tag">{p.source_versions[0].available_scope.replace('_', ' ')}</span>
                        <span className="tag">
                          {p.topic_ids.length
                            ? p.topic_ids.length + (p.topic_ids.length === 1 ? ' topic' : ' topics')
                            : 'Unfiled'}
                        </span>
                        {p.tags.map((t) => (
                          <span className="tag" key={t}>
                            #{t}
                          </span>
                        ))}
                      </span>
                    </button>
                  </div>
                ))}
                {!shown.length && (
                  <p className="pad">{catalog ? 'No matching papers.' : 'Loading library…'}</p>
                )}
                {shown.length > limit && (
                  <button className="link-btn lib-more" onClick={() => more(limit + 30)}>
                    Show more papers
                  </button>
                )}
              </section>
              {paper && (
                <aside className="card lib-detail">
                  <h2>{paper.title}</h2>
                  <p className="record-meta">{paper.identity}</p>
                  <h3>Files and versions</h3>
                  {paper.files.map((f) => (
                    <p key={f.source_version_id}>
                      {f.name} · {f.role}{' '}
                      <small title={f.source_version_id}>
                        {f.source_version_id.length > 12
                          ? f.source_version_id.slice(0, 8)
                          : f.source_version_id}
                      </small>
                    </p>
                  ))}
                  {paper.changes.map((c) => (
                    <p className="muted-text" key={c}>
                      {c}
                    </p>
                  ))}
                  {tab === 'Papers' && (
                    <>
                      {paper.topic_ids.length > 0 && (
                        <button
                          className="link-btn"
                          onClick={() =>
                            act.navigate({
                              view: 'topic',
                              topicId: paper.topic_ids.includes(topic) ? topic : paper.topic_ids[0],
                              tab: 'read',
                              sourceVersion: paper.source_versions[0].source_version_id,
                            })
                          }
                        >
                          Open in reader
                        </button>
                      )}
                      <button className="link-btn" onClick={() => void pick(paper.paper_id).catch(report)}>
                        Add material version
                      </button>
                      <h3>Topics</h3>
                      {paper.topic_ids.map((id) => (
                        <button key={id} className="link-btn" onClick={() => act.openTopic(id, 'read')}>
                          {topics.find((t) => t.id === id)?.title ?? id}
                        </button>
                      ))}
                      <div className="lib-tools">
                        <button
                          className="ghost-btn sm"
                          disabled={!topic || busy}
                          onClick={() => organize('link', topic)}
                        >
                          Add to topic
                        </button>
                        <button
                          className="ghost-btn sm"
                          disabled={!topic || busy}
                          onClick={() => organize('unlink', topic)}
                        >
                          Remove from topic
                        </button>
                      </div>
                      <h3>Tags</h3>
                      <input
                        className="text-field"
                        aria-label="Tag"
                        value={tag}
                        placeholder="Tag name"
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
                            {a === 'tag' ? 'Add tag' : 'Remove tag'}
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
      {files && (
        <Dialog title="Import papers" onClose={() => setFiles(undefined)}>
          <p>{demo ? 'Sample material selected for the contract demo.' : 'Review the selected material.'}</p>
          {files.map((f) => (
            <p key={f.file_id}>{f.name}</p>
          ))}
          <p>{topics.find((t) => t.id === topic)?.title ?? 'Personal library'}</p>
          <button
            className="primary"
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
            Review import scope
          </button>
        </Dialog>
      )}
      {review && (
        <Dialog title="Review a possible duplicate" onClose={() => setReview(undefined)}>
          <p>Incoming · {review.name}</p>
          <p>Existing · {catalog?.papers.find((p) => p.paper_id === review.paper_id)?.title ?? 'In trash'}</p>
          <p>{review.reason}</p>
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
                {decision === 'link' ? 'Link as another version' : 'Keep separate'}
              </button>
            ))}
          </div>
        </Dialog>
      )}
      {impact && (
        <Dialog
          title={impact.purge ? 'Permanently delete selected papers?' : 'Move selected papers to trash?'}
          onClose={() => setImpact(undefined)}
        >
          {rows
            .filter((p) => impact.ids.includes(p.paper_id))
            .map((p) => (
              <p key={p.paper_id}>
                <b>{p.title}</b>
              </p>
            ))}
          <h3>Affected records</h3>
          {impact.references.map((r, i) => (
            <p key={i}>
              {r.kind} · {r.label}
            </p>
          ))}
          {!impact.references.length && <p>No linked records.</p>}
          {impact.purge && (
            <label className="check-row">
              <input type="checkbox" checked={clear} onChange={(e) => setClear(e.target.checked)} /> Also
              clear saved excerpts
            </label>
          )}
          <div className="dialog-actions">
            <button className="ghost-btn" onClick={() => setImpact(undefined)}>
              Cancel
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
              {impact.purge ? 'Delete permanently' : 'Move to trash'}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
