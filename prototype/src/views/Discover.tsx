import { useStore } from '../data/store'
import { DEMO_TOPIC, PAPERS } from '../data/fixtures'
import { Icon, Spinner } from '../components/Icon'
import type { AngleStatus, Candidate, Decision } from '../data/types'

const ANGLE_LABEL: Record<AngleStatus, string> = { queued: 'Queued', searching: 'Searching', covered: 'Covered', gap: 'Gap' }
const DECISION_LABEL: Record<Exclude<Decision, 'pending'>, string> = { added: 'Added to topic', held: 'On hold', excluded: 'Not relevant' }

function CandidateCard({ c }: { c: Candidate }) {
  const { act } = useStore()
  const p = PAPERS[c.paperId]
  return (
    <article className={`cand ${c.decision}`} data-testid={`cand-${c.paperId}`}>
      <div className="cand-main">
        <div className="cand-top">
          {c.round > 1 && <span className="tag accent">New in round {c.round}</span>}
          <span className="tag">{c.readLevel}</span>
          <span className="tag quiet">via {c.source}</span>
        </div>
        <h3>{p.title}</h3>
        <p className="byline">
          {p.authors.slice(0, 3).join(', ')}{p.authors.length > 3 ? ' et al.' : ''} · <span title={`Venue and year from ${p.venueSource}`}>{p.venue} {p.year}</span>
        </p>
        <p className="reason"><Icon name="compass" size={13} /> {c.reason}</p>
      </div>
      <div className="cand-actions">
        {c.note ? (
          <span className="decided added"><Icon name="check" size={14} /> {c.note}</span>
        ) : c.decision === 'pending' ? (
          <>
            <button className="ghost-btn sm accent" onClick={() => act.decide(c.id, 'added')}><Icon name="plus" size={14} /> Add to topic</button>
            <button className="ghost-btn sm" onClick={() => act.decide(c.id, 'held')}><Icon name="clock" size={14} /> Hold</button>
            <button className="ghost-btn sm" onClick={() => act.decide(c.id, 'excluded')}><Icon name="x" size={14} /> Not relevant</button>
          </>
        ) : (
          <>
            <span className={`decided ${c.decision}`}>
              <Icon name={c.decision === 'added' ? 'check' : c.decision === 'held' ? 'clock' : 'x'} size={14} /> {DECISION_LABEL[c.decision]}
            </span>
            <button className="link-btn" onClick={() => act.decide(c.id, 'pending')}><Icon name="undo" size={13} /> Undo</button>
          </>
        )}
      </div>
    </article>
  )
}

export function Discover() {
  const { state, act } = useStore()
  const d = state.discovery
  const discoveryRuns = state.runOrder.map((id) => state.runs[id]).filter((r) => r.task === 'Discovery')
  const latest = discoveryRuns[0]
  const lastStep = latest?.steps[latest.steps.length - 1]
  const feedback = state.candidates.filter((c) => c.decision === 'excluded').length
  const canRefine = d.status === 'done' && d.round < 2

  return (
    <div className="discover scroll">
      <section className="disc-head">
        <div className="question-card">
          <span className="eyebrow">Research question</span>
          <p className="question">{d.question}</p>
          <div className="status-line">
            {d.status === 'idle' && <span>The agent has not searched yet.</span>}
            {d.status === 'running' && <><Spinner /> <span>{lastStep ? lastStep.title : 'Planning…'}</span></>}
            {d.status === 'done' && <><Icon name={latest?.status === 'partial' ? 'alert' : 'check'} size={15} /> <span>{d.summary}</span></>}
            {latest && <button className="link-btn" onClick={() => act.showTrace(true, latest.id)}>{latest.steps.length} steps · view trace</button>}
          </div>
        </div>
        <div className="disc-actions">
          {d.status === 'idle' && <button className="primary" onClick={() => act.runDiscovery(d.question)}><Icon name="compass" size={15} /> Find papers</button>}
          {canRefine && (
            <button className="primary" disabled={feedback === 0} onClick={() => act.refineDiscovery()}
              title={feedback === 0 ? 'Mark at least one candidate as Not relevant first' : undefined}>
              <Icon name="undo" size={15} /> Refine with my feedback
            </button>
          )}
          {canRefine && feedback === 0 && <small className="hint">Mark a candidate “Not relevant” to steer the next search.</small>}
        </div>
      </section>

      <div className="disc-grid">
        <section className="cand-list" aria-label="Candidates">
          {state.angles.length === 0 && d.status !== 'running' && (
            <div className="placeholder">
              <Icon name="compass" size={22} />
              <p>Candidates will appear here, grouped by search angle, each with why it was suggested and how much of it was read.</p>
            </div>
          )}
          {state.angles.map((a) => {
            const items = state.candidates.filter((c) => c.angleId === a.id)
            return (
              <div key={a.id} className="angle-group">
                <div className="angle-head">
                  <h2>{a.label}</h2>
                  <span className={`status ${a.status}`}>{a.status === 'searching' && <Spinner />}{ANGLE_LABEL[a.status]}</span>
                </div>
                {items.map((c) => <CandidateCard key={c.id} c={c} />)}
                {a.status === 'gap' && (
                  <div className="gap-note"><Icon name="alert" size={15} /> No candidate passed screening for this angle. It is reported as a gap rather than filled with weak matches.</div>
                )}
                {a.status === 'queued' && <div className="skeleton" />}
              </div>
            )
          })}
        </section>

        <aside className="disc-side">
          <div className="card">
            <h3>Search plan</h3>
            {state.angles.length === 0 ? <p className="muted-text">Waiting for the agent to split the question.</p> : (
              <ol className="plan">
                {state.angles.map((a) => (
                  <li key={a.id} className={a.status}>
                    <span className="plan-dot" />
                    <div>
                      <strong>{a.label}</strong>
                      <code>{a.query}</code>
                      <small>{a.status === 'covered' || a.status === 'gap' ? `${a.found} kept` : ANGLE_LABEL[a.status]}</small>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {d.coverage && (
            <div className="card">
              <h3>Coverage</h3>
              <ul className="coverage">
                {d.coverage.covered.map((c) => <li key={c} className="ok"><Icon name="check" size={14} /> {c}</li>)}
                {d.coverage.gaps.map((g) => <li key={g} className="gap"><Icon name="alert" size={14} /> {g}</li>)}
              </ul>
              <p className="fine">Covers this search only, not every paper that exists.</p>
            </div>
          )}

          <div className="card">
            <h3>In this topic</h3>
            <ul className="in-topic">
              {state.topicPaperIds.map((id) => (
                <li key={id}>
                  <span>{PAPERS[id].short}</span>
                  {PAPERS[id].stored === 'abstract'
                    ? <button className="link-btn" onClick={() => { act.setReader(id); act.openTopic(DEMO_TOPIC, 'read') }}>Read <Icon name="arrowRight" size={12} /></button>
                    : <small>metadata only</small>}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}
