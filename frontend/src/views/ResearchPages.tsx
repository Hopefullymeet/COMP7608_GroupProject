import { useState } from 'react'
import { PageHead, Dialog } from '../components/PageHead'
import { Disclosure } from '../components/Disclosure'
import { Icon } from '../components/Icon'
import { useStore } from '../data/store'
import { useRead, useWorkspace } from '../data/WorkspaceProvider'
import type { Cell, Comparison, Draft, Relation, Statement } from '../api/research'
import { EvidenceLink } from './Notes'

export function TopicSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { state } = useStore()
  return (
    <select
      className="lib-select workspace-picker"
      aria-label="Research topic"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Select topic</option>
      {state.topics.map((t) => (
        <option key={t.id} value={t.id}>
          {t.title}
        </option>
      ))}
    </select>
  )
}
function ComparisonTable({
  record,
  topic,
  names,
}: {
  record: Comparison
  topic: string
  names: Record<string, string>
}) {
  const { write, busy, report } = useWorkspace()
  const [edit, setEdit] = useState<Cell[]>(),
    [saved, setSaved] = useState(false)
  const cells = edit ?? record.cells
  const rows = [...new Set(cells.map((c) => c.dimension))]
  function change(index: number, delta: Partial<Cell>) {
    setEdit(cells.map((c, i) => (i === index ? { ...c, ...delta } : c)))
  }
  return (
    <section className="card result-card">
      <h2>{record.question}</h2>
      <div className="table-scroll">
        <table className="cmp-table">
          <thead>
            <tr>
              <th scope="col">Dimension</th>
              {record.source_versions.map((v) => (
                <th scope="col" key={v}>
                  {names[v] ?? v}
                  <small title={v}>Version {v.length > 12 ? v.slice(0, 8) : v}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row}>
                <th scope="row">{row}</th>
                {record.source_versions.map((v) => {
                  const i = cells.findIndex((c) => c.dimension === row && c.source_version_id === v),
                    c = cells[i]
                  return (
                    <td key={v} className={!edit && c?.status === 'missing' ? 'missing' : undefined}>
                      {!c ? (
                        'Missing cell'
                      ) : edit ? (
                        <>
                          <textarea
                            className="text-field"
                            aria-label={row + ' text for ' + v}
                            value={c.text}
                            onChange={(e) => change(i, { text: e.target.value })}
                          />
                          <select
                            aria-label={row + ' assessment for ' + v}
                            value={c.status}
                            onChange={(e) => change(i, { status: e.target.value as Cell['status'] })}
                          >
                            {['evidenced', 'not_comparable', 'missing', 'disputed'].map((s) => (
                              <option key={s} value={s}>
                                {s.replaceAll('_', ' ')}
                              </option>
                            ))}
                          </select>
                          <input
                            className="text-field"
                            aria-label="Source anchors"
                            value={c.anchor_ids.join(',')}
                            onChange={(e) =>
                              change(i, {
                                anchor_ids: e.target.value
                                  .split(',')
                                  .map((a) => a.trim())
                                  .filter(Boolean),
                              })
                            }
                          />
                        </>
                      ) : (
                        <>
                          <small
                            className={`tag ${c.status === 'evidenced' ? 'ok' : c.status === 'disputed' ? 'bad' : 'warn'}`}
                          >
                            {c.status.replaceAll('_', ' ')}
                          </small>
                          <p>{c.text}</p>
                          {c.anchor_ids.map((a) => (
                            <EvidenceLink id={a} key={a} />
                          ))}
                        </>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="lib-tools">
        {edit ? (
          <>
            <button
              className="primary"
              disabled={
                busy || edit.some((c) => !c.text.trim() || (c.status === 'evidenced' && !c.anchor_ids.length))
              }
              onClick={() =>
                void write('comparison.save', {
                  topic_id: topic,
                  comparison_id: record.comparison_id,
                  base_revision: record.revision,
                  cells: edit,
                })
                  .then(() => setEdit(undefined))
                  .catch(report)
              }
            >
              Save revision
            </button>
            <button className="ghost-btn" onClick={() => setEdit(undefined)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button className="ghost-btn" onClick={() => setEdit(structuredClone(cells))}>
              Revise cells
            </button>
            <button
              className="ghost-btn"
              disabled={busy || saved}
              onClick={() =>
                void write('note.save', {
                  topic_id: topic,
                  text: [
                    record.question,
                    ...cells.map(
                      (c) =>
                        c.dimension +
                        ' · ' +
                        (names[c.source_version_id] ?? c.source_version_id) +
                        ' · ' +
                        c.text,
                    ),
                  ].join('\n'),
                  anchor_ids: [...new Set(cells.flatMap((c) => c.anchor_ids))],
                  origin: 'comparison',
                })
                  .then(() => setSaved(true))
                  .catch(report)
              }
            >
              {saved ? 'Saved to notes' : 'Save as note'}
            </button>
          </>
        )}
      </div>
      {record.history.map((h) => (
        <Disclosure
          className="record-history"
          key={h.revision}
          icon="clock"
          title={<span title={h.revision}>Earlier revision · {h.revision.slice(0, 8)}</span>}
        >
          <div className="history-entries">
            {h.cells.map((c) => (
              <p key={c.dimension + c.source_version_id}>
                {c.dimension} · {c.text}
              </p>
            ))}
          </div>
        </Disclosure>
      ))}
    </section>
  )
}
export function ComparePage() {
  const { state, act } = useStore(),
    { prepare, busy } = useWorkspace()
  const topic = state.route.view === 'topic' ? state.route.topicId : ''
  const lib = useRead('library.list', { topic_id: topic }, !!topic)
  const records = useRead('comparison.list', { topic_id: topic }, !!topic)
  const [a, setA] = useState(''),
    [b, setB] = useState(''),
    [question, setQuestion] = useState('How do these papers compare?')
  const [dims, setDims] = useState('Method, Data split, Metrics, Baseline, Conditions')
  const options = (lib?.items ?? []).flatMap((p) =>
    p.source_versions.map((v) => ({
      id: v.source_version_id,
      paper: p.paper_id,
      label: p.title + ' · ' + v.source_version_id,
    })),
  )
  const left = options.find((x) => x.id === a) ?? options[0]
  const rights = options.filter((o) => o.paper !== left?.paper)
  const right = rights.find((x) => x.id === b) ?? rights[0]
  const dimensions = [
    ...new Set(
      dims
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean),
    ),
  ]
  return (
    <div className="page">
      <div className="page-body scroll">
        <section className="card result-card">
          <h2>Compare papers</h2>
          <div className="form-grid">
            <label className="set-field">
              First source
              <select value={left?.id ?? ''} onChange={(e) => setA(e.target.value)}>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="set-field">
              Second source
              <select value={right?.id ?? ''} onChange={(e) => setB(e.target.value)}>
                {rights.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="set-field">
              Question
              <input className="text-field" value={question} onChange={(e) => setQuestion(e.target.value)} />
            </label>
            <label className="set-field">
              Dimensions (comma-separated)
              <input className="text-field" value={dims} onChange={(e) => setDims(e.target.value)} />
            </label>
          </div>
          {(!left || !right) && (
            <p>
              Choose two papers from this topic.{' '}
              <button className="link-btn" onClick={() => act.navigate({ view: 'library' })}>
                Open Library
              </button>
            </p>
          )}
          <button
            className="primary"
            disabled={!left || !right || !question.trim() || !dimensions.length || busy}
            onClick={() =>
              void prepare({
                kind: 'paper_comparison',
                topic_id: topic,
                input: { source_versions: [left.id, right.id], question, dimensions },
              })
            }
          >
            <Icon name="columns" size={15} /> Compare papers
          </button>
        </section>
        {records?.items.map((c) => (
          <ComparisonTable
            key={c.revision}
            record={c}
            topic={topic}
            names={Object.fromEntries(options.map((o) => [o.id, o.label.slice(0, -(' · ' + o.id).length)]))}
          />
        ))}
      </div>
    </div>
  )
}
function Entry({ value }: { value: Statement | Relation }) {
  return (
    <div className="research-record">
      {'text' in value ? (
        <p>{value.text}</p>
      ) : (
        <>
          <p>
            <b>{value.from}</b> → {value.kind} → {value.to}
          </p>
          <small>{value.status}</small>
          {value.counter_anchor_ids.map((a) => (
            <span key={a}>
              Counterevidence <EvidenceLink id={a} />
            </span>
          ))}
          {value.open_question && <p>Open question · {value.open_question}</p>}
        </>
      )}
      {value.anchor_ids.map((a) => (
        <EvidenceLink key={a} id={a} />
      ))}
    </div>
  )
}
function ReviewWiki({ topic, draft, close }: { topic: string; draft: Draft; close: () => void }) {
  const { write, busy, report } = useWorkspace(),
    [ids, setIds] = useState(draft.changes.map((c) => c.id))
  const submit = (decision: 'accept' | 'discard') =>
    void write('wiki.review', {
      topic_id: topic,
      draft_id: draft.draft_id,
      decision,
      change_ids: decision === 'accept' ? ids : [],
    })
      .then(close)
      .catch(report)
  return (
    <Dialog title={'Review changes · ' + draft.title} onClose={close}>
      {draft.changes.map((c) => (
        <div className="card check-option" key={c.id}>
          <label className="check-row">
            <input
              type="checkbox"
              checked={ids.includes(c.id)}
              onChange={(e) => setIds(e.target.checked ? [...ids, c.id] : ids.filter((id) => id !== c.id))}
            />{' '}
            {c.before ? (c.after ? 'Revise' : 'Remove') : 'Add'}
          </label>
          {c.before && (
            <div>
              <small className="record-meta">Current</small>
              <Entry value={c.before} />
            </div>
          )}
          {c.after && (
            <div>
              <small className="record-meta">Proposed</small>
              <Entry value={c.after} />
            </div>
          )}
        </div>
      ))}
      <div className="dialog-actions">
        <button className="ghost-btn" disabled={busy} onClick={() => submit('discard')}>
          Discard draft
        </button>
        <button className="primary" disabled={busy || !ids.length} onClick={() => submit('accept')}>
          Accept selected changes
        </button>
      </div>
    </Dialog>
  )
}
function WikiTopic({ topic }: { topic: string }) {
  const { prepare, busy } = useWorkspace(),
    wiki = useRead('wiki.list', { topic_id: topic }),
    notes = useRead('note.list', { topic_id: topic })
  const [review, setReview] = useState<Draft>(),
    [pageId, pageTo] = useState(''),
    [title, setTitle] = useState('')
  const [selected, pick] = useState<string[]>([]),
    [relations, relate] = useState<string[]>([])
  const page = wiki?.pages.find((p) => p.page_id === pageId)
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
  return (
    <>
      {wiki?.drafts.map((d) => (
        <div className="review-banner" key={d.draft_id}>
          <b className="grow">{d.title} · Pending draft</b>
          <button className="ghost-btn" onClick={() => setReview(d)}>
            Preview differences
          </button>
        </div>
      ))}
      <div className="lib-grid">
        <section className="card lib-detail">
          <h2>Concept pages</h2>
          <select aria-label="Concept page" value={pageId} onChange={(e) => pageTo(e.target.value)}>
            <option value="">New concept page</option>
            {wiki?.pages.map((p) => (
              <option key={p.page_id} value={p.page_id}>
                {p.title}
              </option>
            ))}
          </select>
          {page && (
            <>
              <h2>{page.title}</h2>
              {page.statements.map((s) => (
                <Entry key={s.id} value={s} />
              ))}
              <h3>Relationships</h3>
              {page.relations.map((r) => (
                <Entry key={r.id} value={r} />
              ))}
            </>
          )}
        </section>
        <section className="card lib-detail">
          <h2>{page ? 'Regenerate draft' : 'Generate draft'}</h2>
          {!page && (
            <label className="set-field">
              Concept title
              <input className="text-field" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
          )}
          <h3>Source notes</h3>
          {notes?.items.map((n) => (
            <label className="check-row check-option" key={n.note_id}>
              <input
                type="checkbox"
                disabled={!n.anchor_ids.length}
                checked={selected.includes(n.note_id)}
                onChange={() => pick(toggle(selected, n.note_id))}
              />
              <span>
                {n.text}
                {!n.anchor_ids.length && <small>Add a source to use this note in the wiki.</small>}
              </span>
            </label>
          ))}
          {!notes?.items.length && <p>Save a reading or comparison note in this topic to start a draft.</p>}
          {wiki?.pages
            .flatMap((p) => p.relations)
            .map((r) => (
              <label className="check-row check-option" key={r.id}>
                <input
                  type="checkbox"
                  checked={relations.includes(r.id)}
                  onChange={() => relate(toggle(relations, r.id))}
                />
                {r.from} → {r.to}
              </label>
            ))}
          <button
            className="primary"
            disabled={busy || (!title.trim() && !page) || (!selected.length && !relations.length)}
            onClick={() =>
              void prepare({
                kind: 'wiki_draft',
                topic_id: topic,
                input: {
                  title: page?.title ?? title,
                  page_id: page?.page_id,
                  note_ids: selected,
                  relation_ids: relations,
                },
              })
            }
          >
            Generate draft
          </button>
        </section>
      </div>
      {review && <ReviewWiki topic={topic} draft={review} close={() => setReview(undefined)} />}
    </>
  )
}
export function WikiPage() {
  const { state } = useStore(),
    [topic, setTopic] = useState(
      (state.route.view === 'wiki' && state.route.topicId) || state.topics[0]?.id || '',
    )
  return (
    <div className="page">
      <PageHead trace icon="wiki" title="Evidence wiki" sub="Concepts, relationships and their sources">
        <TopicSelect value={topic} onChange={setTopic} />
      </PageHead>
      <div className="page-body scroll">
        {topic ? <WikiTopic key={topic} topic={topic} /> : <p>Choose a topic to view its evidence wiki.</p>}
      </div>
    </div>
  )
}
