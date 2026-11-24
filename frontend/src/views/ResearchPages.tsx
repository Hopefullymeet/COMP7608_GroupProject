import { useLanguage } from '../i18n'
import { useState } from 'react'
import { Disclosure } from '../components/Disclosure'
import { Icon } from '../components/Icon'
import { useStore } from '../data/store'
import { useRead, useWorkspace } from '../data/WorkspaceProvider'
import type { Cell, Comparison } from '../api/research'
import { EvidenceLink } from './Notes'

export function TopicSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { tr } = useLanguage()
  const { state } = useStore()
  return (
    <select
      className="lib-select workspace-picker"
      aria-label={tr('Research topic')}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{tr('Select topic')}</option>
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
  const { tr } = useLanguage()
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
              <th scope="col">{tr('Dimension')}</th>
              {record.source_versions.map((v) => (
                <th scope="col" key={v}>
                  {names[v] ?? v}
                  <small title={v}>{tr('Version')}{' '}{v.length > 12 ? v.slice(0, 8) : v}</small>
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
                        tr('Missing cell')
                      ) : edit ? (
                        <>
                          <textarea
                            className="text-field"
                            aria-label={tr('{0} text for {1}', row, v)}
                            value={c.text}
                            onChange={(e) => change(i, { text: e.target.value })}
                          />
                          <select
                            aria-label={tr('{0} assessment for {1}', row, v)}
                            value={c.status}
                            onChange={(e) => change(i, { status: e.target.value as Cell['status'] })}
                          >
                            {['evidenced', 'not_comparable', 'missing', 'disputed'].map((s) => (
                              <option key={s} value={s}>
                                {tr(s.replaceAll('_', ' '))}
                              </option>
                            ))}
                          </select>
                          <input
                            className="text-field"
                            aria-label={tr('Source anchors')}
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
                            {tr(c.status.replaceAll('_', ' '))}
                          </small>
                          <p>{c.status === 'missing' && c.text === 'No source passage was established.' ? tr(c.text) : c.text}</p>
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
              {tr('Save revision')}
            </button>
            <button className="ghost-btn" onClick={() => setEdit(undefined)}>
              {tr('Cancel')}
            </button>
          </>
        ) : (
          <>
            <button className="ghost-btn" onClick={() => setEdit(structuredClone(cells))}>
              {tr('Revise cells')}
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
              {saved ? tr('Saved to notes') : tr('Save as note')}
            </button>
          </>
        )}
      </div>
      {record.history.map((h) => (
        <Disclosure
          className="record-history"
          key={h.revision}
          icon="clock"
          title={<span title={h.revision}>{tr('Earlier revision ·')}{' '}{h.revision.slice(0, 8)}</span>}
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
  const { tr } = useLanguage()
  const { state, act } = useStore(),
    { prepare, busy, setComparisonSlot } = useWorkspace()
  const topic = state.route.view === 'topic' ? state.route.topicId : ''
  const lib = useRead('library.list', { topic_id: topic }, !!topic)
  const records = useRead('comparison.list', { topic_id: topic }, !!topic)
  const [a, setA] = useState(''),
    [b, setB] = useState(''),
    [questionDraft, setQuestion] = useState<string>(),
    [dimensionDraft, setDims] = useState<string>()
  const question = questionDraft ?? tr('How do these papers compare?')
  const dims = dimensionDraft ?? tr('Method, Data split, Metrics, Baseline, Conditions')
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
        .split(/[,，、]/)
        .map((d) => d.trim())
        .filter(Boolean),
    ),
  ]
  return (
    <div className="page">
      <div className="page-body scroll">
        <section className="card result-card">
          <h2>{tr('Compare papers')}</h2>
          <div className="form-grid">
            <label className="set-field">
              {tr('First source')}
              <select value={left?.id ?? ''} onChange={(e) => setA(e.target.value)}>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="set-field">
              {tr('Second source')}
              <select value={right?.id ?? ''} onChange={(e) => setB(e.target.value)}>
                {rights.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="set-field">
              {tr('Question')}
              <input className="text-field" value={question} onChange={(e) => setQuestion(e.target.value)} />
            </label>
            <label className="set-field">
              {tr('Dimensions (comma-separated)')}
              <input className="text-field" value={dims} onChange={(e) => setDims(e.target.value)} />
            </label>
          </div>
          {(!left || !right) && (
            <p>
              {tr('Choose two papers from this topic.')}{' '}
              <button className="link-btn" onClick={() => act.navigate({ view: 'library' })}>
                {tr('Open Library')}
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
            <Icon name="columns" size={15} />{' '}{tr('Compare papers')}
          </button>
        </section>
        <div key={topic} data-topic={topic} ref={setComparisonSlot} />
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
