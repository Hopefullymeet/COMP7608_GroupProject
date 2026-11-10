import { useState } from 'react'
import { useStore } from '../data/store'
import { PAPERS } from '../data/fixtures'
import { CITE_KEYS, DRAFT_NAME } from '../data/workspace'
import { Icon, Spinner } from '../components/Icon'
import { PageHead } from '../components/PageHead'
import { SourceChip } from '../components/SourceChip'
import type { ClaimStatus, Finding } from '../data/types'

type SentenceStatus = ClaimStatus | 'unchecked' | 'recheck'

const LABEL: Record<SentenceStatus, string> = {
  supported: 'Supported',
  conflict: 'Conflict',
  'not-established': 'Not established',
  blocked: 'Blocked: material missing',
  pending: 'Awaiting your choice',
  recheck: 'Re-check needed',
  unchecked: 'Not checked in this round',
}
const TONE: Record<SentenceStatus, string> = {
  supported: 'ok', conflict: 'bad', 'not-established': 'warn', blocked: 'warn', pending: 'accent', recheck: 'accent', unchecked: '',
}
const COUNT_ORDER: ClaimStatus[] = ['supported', 'conflict', 'not-established', 'blocked', 'pending']

/** A sentence counts as supported only when every sub-claim is. */
function statusOf(f: Finding | undefined, recheck: boolean): SentenceStatus {
  if (!f) return 'unchecked'
  if (recheck) return 'recheck'
  const st = f.claims.map((c) => c.status)
  for (const s of ['conflict', 'pending', 'blocked', 'not-established'] as const) if (st.includes(s)) return s
  return 'supported'
}

const citeLabel = (keys: string[]) => keys.map((k) => `@${k}`).join('; ')

export function Check() {
  const { state, act } = useStore()
  const c = state.check
  const [focus, setFocus] = useState<string | null>(null)
  const run = state.runOrder.map((id) => state.runs[id]).find((r) => r.task === 'Citation check')
  const lastStep = run?.steps[run.steps.length - 1]
  const findings = Object.values(c.findings)
  const counts = COUNT_ORDER.map((s) => [s, findings.flatMap((f) => f.claims).filter((x) => x.status === s).length] as const)
  const fullySupported = c.sentences.filter((s) => statusOf(c.findings[s.id], !!c.recheck[s.id]) === 'supported').length
  const rechecking = (id: string) => !!run && run.status === 'running' && run.label.endsWith(id.slice(1))

  return (
    <div className="page">
      <PageHead icon="shield" title="Citation check" sub="Checks each claim in your draft against the passage it cites. You decide what changes." trace>
        {c.status === 'running'
          ? <span className="status-line"><Spinner /> {lastStep?.title ?? 'Planning…'}</span>
          : <button className="primary" onClick={() => act.runCheck()}><Icon name="shield" size={15} /> {c.status === 'idle' ? 'Check citations' : 'Check again'}</button>}
      </PageHead>

      <div className="page-body scroll">
        <div className="draft-meta">
          <span className="chip"><Icon name="file" size={13} /> {DRAFT_NAME}</span>
          <span>Markdown · draft v{c.version} · {c.sentences.length} sentences</span>
          <span>Sources: {Object.entries(CITE_KEYS).map(([k, id]) => `@${k} → ${PAPERS[id].short}`).join(' · ')}</span>
          <span className="grow" />
          <button className="ghost-btn sm" disabled title="Report export comes later">Export report</button>
        </div>

        {findings.length > 0 && (
          <div className="check-summary">
            <div className="big">
              <strong>{fullySupported} / {c.sentences.length}</strong>
              <span>sentences fully supported</span>
            </div>
            {counts.map(([s, n]) => (
              <div key={s} className={`count-pill ${TONE[s]}`}><b>{n}</b> {LABEL[s].split(':')[0].toLowerCase()}</div>
            ))}
            <p className="fine">Counted per claim. A sentence with two claims needs both supported. Confirming a finding does not change its label.</p>
          </div>
        )}

        <div className="check-grid">
          <section className="draft card" aria-label="Draft">
            <h3>Draft</h3>
            <p className="draft-text">
              {c.sentences.map((s) => {
                const st = statusOf(c.findings[s.id], !!c.recheck[s.id])
                return (
                  <span key={s.id} className={`draft-s ${st} ${focus === s.id ? 'focus' : ''}`} onClick={() => setFocus(s.id)}
                    onMouseEnter={() => setFocus(s.id)}>
                    {s.text}{s.cites.length > 0 && <span className="cite-key"> [{citeLabel(s.cites)}]</span>}{' '}
                  </span>
                )
              })}
            </p>
            {c.version > 1 && <p className="fine">Changes create a new draft version. Draft v1 is kept.</p>}
          </section>

          <section className="findings" aria-label="Findings">
            {findings.length === 0 && c.status !== 'running' && (
              <div className="placeholder">
                <Icon name="shield" size={22} />
                <p>The agent splits each sentence into claims, reads the cited passage, and reports support, conflict, missing material or a claim that would need new reasoning. It never edits the draft by itself.</p>
              </div>
            )}
            {c.sentences.map((s, i) => {
              const f = c.findings[s.id]
              if (!f) return c.status === 'running' ? <div key={s.id} className="skeleton" /> : null
              const st = statusOf(f, !!c.recheck[s.id])
              const reviewed = c.reviewed.includes(s.id)
              return (
                <article key={s.id} className={`finding ${focus === s.id ? 'focus' : ''}`} onMouseEnter={() => setFocus(s.id)}>
                  <div className="finding-head">
                    <span className="num">{i + 1}</span>
                    <span className={`tag ${TONE[st]}`}>{LABEL[st]}</span>
                    <span className="grow" />
                    <button className={`toggle sm ${reviewed ? 'on' : ''}`} onClick={() => act.toggleReviewed(s.id)}>
                      <Icon name="check" size={13} /> {reviewed ? 'Finding confirmed' : 'Confirm finding'}
                    </button>
                  </div>
                  <ul className="claims">
                    {f.claims.map((cl, j) => (
                      <li key={j} className={c.recheck[s.id] ? 'recheck' : cl.status}>
                        <span className="claim-dot" />
                        <div>
                          <strong>{cl.text}</strong>
                          <p>{cl.note}</p>
                          {cl.evidenceId && <SourceChip evidenceId={cl.evidenceId} anchor={`chk-${s.id}-${j}`} />}
                        </div>
                      </li>
                    ))}
                  </ul>

                  {f.suggestion && (
                    <div className="proposal">
                      <p><b>Found in source, waiting for your choice.</b> {f.suggestion.scope}.</p>
                      <div className="stmt-meta">{f.suggestion.evidenceIds.map((id) => <SourceChip key={id} evidenceId={id} anchor={`sug-${s.id}-${id}`} />)}</div>
                      <button className="ghost-btn sm accent" onClick={() => act.reviseSentence(s.id, s.text, [f.suggestion!.cite], f.suggestion!.evidenceIds[0])}>
                        <Icon name="quote" size={13} /> Add citation [@{f.suggestion.cite}]
                      </button>
                    </div>
                  )}
                  {f.rewrite && (
                    <div className="proposal">
                      <p><b>Suggested wording</b></p>
                      <p className="rewrite"><del>{s.text}</del><ins>{f.rewrite.text}</ins></p>
                      <button className="ghost-btn sm accent" onClick={() => act.reviseSentence(s.id, f.rewrite!.text, f.rewrite!.cites, f.claims[0].evidenceId!)}>
                        <Icon name="note" size={13} /> Apply wording as draft v{c.version + 1}
                      </button>
                    </div>
                  )}
                  {f.claims.some((x) => x.status === 'not-established') && (
                    <p className="hint">Options: qualify the sentence, or look for a paper that tests this directly. More citations alone would not make it supported.</p>
                  )}
                  {c.recheck[s.id] && (
                    <button className="primary sm" disabled={rechecking(s.id)} onClick={() => act.recheck(s.id)}>
                      {rechecking(s.id) ? <Spinner /> : <Icon name="shield" size={13} />} Re-check this sentence
                    </button>
                  )}
                </article>
              )
            })}
          </section>
        </div>
      </div>
    </div>
  )
}
