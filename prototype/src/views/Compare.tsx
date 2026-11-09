import { useStore } from '../data/store'
import { DEMO_TOPIC, PAPERS } from '../data/fixtures'
import { Icon, Spinner } from '../components/Icon'

const PAIR = ['qasper', 'pubmedqa'] as const

export function Compare() {
  const { state, act } = useStore()
  const cmp = state.comparison
  const ready = PAIR.every((id) => state.topicPaperIds.includes(id))
  const run = state.runOrder.map((id) => state.runs[id]).find((r) => r.task === 'Comparison')
  const lastStep = run?.steps[run.steps.length - 1]

  if (!ready) {
    return (
      <div className="empty-state">
        <Icon name="columns" size={22} />
        <h2>Add a second paper to compare</h2>
        <p>The scripted comparison is <strong>QASPER</strong> vs <strong>PubMedQA</strong>. Add PubMedQA from the Discover tab first.</p>
        <button className="primary" onClick={() => act.openTopic(DEMO_TOPIC, 'discover')}><Icon name="compass" size={15} /> Go to Discover</button>
      </div>
    )
  }

  return (
    <div className="compare scroll">
      <section className="cmp-head">
        <div>
          <span className="eyebrow">Comparison</span>
          <h2 className="cmp-title">{PAIR.map((id) => PAPERS[id].short).join('  vs  ')}</h2>
          <p className="muted-text">How do the two datasets set up evidence-grounded QA, and can their results be compared?</p>
        </div>
        <div className="disc-actions">
          {cmp.status === 'idle' && <button className="primary" onClick={() => act.runComparison()}><Icon name="columns" size={15} /> Compare papers</button>}
          {cmp.status === 'running' && <span className="status-line"><Spinner /> {lastStep?.title ?? 'Planning…'}</span>}
          {run && <button className="link-btn" onClick={() => act.showTrace(true, run.id)}>{run.steps.length} steps · view trace</button>}
        </div>
      </section>

      {cmp.verdict && (
        <div className="verdict">
          <Icon name="flag" size={16} />
          <div>
            <strong>{cmp.summary}</strong>
            <p>{cmp.verdict}</p>
          </div>
        </div>
      )}

      {cmp.status === 'idle' ? (
        <div className="placeholder">
          <Icon name="columns" size={22} />
          <p>The agent picks dimensions, reads both papers, and fills each cell with a source. A row it cannot compare, or a cell it has no material for, is marked as such and never left blank.</p>
        </div>
      ) : (
        <table className="cmp-table">
          <thead>
            <tr>
              <th>Dimension</th>
              {PAIR.map((id) => <th key={id}>{PAPERS[id].short} <small>{PAPERS[id].venue} {PAPERS[id].year}</small></th>)}
              <th>Comparable?</th>
            </tr>
          </thead>
          <tbody>
            {cmp.rows.map((r) => (
              <tr key={r.id} className={r.comparable ? '' : 'not-comparable'}>
                <th scope="row">{r.dimension}</th>
                {r.cells.map((c, i) => (
                  <td key={i} className={c.status}>
                    {c.status === 'missing'
                      ? <span className="missing-text"><Icon name="alert" size={13} /> {c.value}</span>
                      : <>
                          <span>{c.value}</span>
                          <button className="src-btn" data-ev-anchor={`cmp-${r.id}-${i}`}
                            onClick={() => act.openEvidence(c.evidenceId!, `cmp-${r.id}-${i}`, false)}>
                            <Icon name="quote" size={12} /> Abstract · p. 1
                          </button>
                        </>}
                  </td>
                ))}
                <td className="cmp-verdict">
                  {r.cells.some((c) => c.status === 'missing')
                    ? <span className="tag warn">Missing material</span>
                    : r.comparable
                      ? <span className="tag ok">Side by side</span>
                      : <><span className="tag bad">Not comparable</span><small>{r.note}</small></>}
                </td>
              </tr>
            ))}
            {cmp.status === 'running' && <tr><td colSpan={4} className="row-loading"><Spinner /> Reading…</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  )
}
