import { useLanguage } from '../i18n'
import { papersOfTopic, useStore } from '../data/store'
import { DEMO_TOPIC, PAPERS } from '../data/fixtures'
import { Icon, Spinner } from '../components/Icon'
import { SourceChip } from '../components/SourceChip'

const PAIR = ['qasper', 'pubmedqa'] as const

export function Compare() {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const cmp = state.comparison
  const ready = PAIR.every((id) => papersOfTopic(state, DEMO_TOPIC).includes(id))

  if (!ready && cmp.status === 'idle') {
    return (
      <div className="empty-state">
        <Icon name="columns" size={22} />
        <h2>{tr('Add a second paper to compare')}</h2>
        <p>{tr('The scripted comparison is')}{' '}<strong>QASPER</strong>{' '}{tr('vs')}{' '}<strong>PubMedQA</strong>{tr('. Add PubMedQA from the Discover tab first.')}</p>
        <button className="primary" onClick={() => act.openTopic(DEMO_TOPIC, 'discover')}><Icon name="compass" size={15} />{' '}{tr('Go to Discover')}</button>
      </div>
    )
  }

  return (
    <div className="compare scroll">
      <section className="cmp-head">
        <div>
          <span className="eyebrow">{tr('Comparison')}</span>
          <h2 className="cmp-title">{PAIR.map((id) => PAPERS[id].short).join(tr('  vs  '))}</h2>
          <p className="muted-text">{tr('How do the two datasets set up evidence-grounded QA, and can their results be compared?')}</p>
        </div>
        <div className="disc-actions">
          {ready && (cmp.status === 'idle' || (cmp.status === 'done' && !cmp.verdict)) &&
            <button className="primary" onClick={() => act.runComparison()}><Icon name="columns" size={15} /> {cmp.status === 'idle' ? tr('Compare papers') : tr('Run comparison again')}</button>}
          {cmp.status === 'running' && <span className="status-line"><Spinner /> {tr('Comparing papers…')}</span>}
        </div>
      </section>

      {!ready && <p className="hint">{tr('Past comparison · one or more sources are no longer in this topic.')}</p>}
      {!cmp.verdict && cmp.summary && <p className="hint">{cmp.summary}</p>}
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
          <p>{tr('The agent picks dimensions, reads both papers, and fills each cell with a source. A row it cannot compare, or a cell it has no material for, is marked as such and never left blank.')}</p>
        </div>
      ) : (
        <table className="cmp-table">
          <thead>
            <tr>
              <th>{tr('Dimension')}</th>
              {PAIR.map((id) => <th key={id}>{PAPERS[id].short} <small>{PAPERS[id].venue} {PAPERS[id].year}</small></th>)}
              <th>{tr('Comparable?')}</th>
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
                          {c.evidenceId && <SourceChip evidenceId={c.evidenceId} anchor={`cmp-${r.id}-${i}`} />}
                        </>}
                  </td>
                ))}
                <td className="cmp-verdict">
                  {r.cells.some((c) => c.status === 'missing')
                    ? <span className="tag warn">{tr('Missing material')}</span>
                    : r.comparable
                      ? <span className="tag ok">{tr('Side by side')}</span>
                      : <><span className="tag bad">{tr('Not comparable')}</span><small>{r.note}</small></>}
                </td>
              </tr>
            ))}
            {cmp.status === 'running' && <tr><td colSpan={4} className="row-loading"><Spinner />{' '}{tr('Reading…')}</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  )
}
