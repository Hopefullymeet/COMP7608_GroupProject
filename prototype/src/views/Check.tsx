import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { currentFinding, sourceStatus, useStore } from '../data/store'
import { PAPERS } from '../data/fixtures'
import { MANUSCRIPTS } from '../data/workspace'
import { Icon, Spinner } from '../components/Icon'
import { PageHead } from '../components/PageHead'
import { SourceChip } from '../components/SourceChip'
import { scrollWithin } from '../components/util'
import type { ClaimStatus, Finding, FindingDecision } from '../data/types'

type SentenceStatus = ClaimStatus | 'unchecked' | 'recheck'
type Filter = 'all' | 'needs-attention' | ClaimStatus

const LABEL: Record<SentenceStatus, string> = {
  supported: 'Supported', conflict: 'Conflict', 'not-established': 'Not established',
  blocked: 'Blocked: material missing', pending: 'Awaiting citation choice',
  recheck: 'Re-check needed', unchecked: 'Unchecked',
}
const TONE: Record<SentenceStatus, string> = {
  supported: 'ok', conflict: 'bad', 'not-established': 'warn', blocked: 'warn',
  pending: 'accent', recheck: 'accent', unchecked: '',
}
const STATUSES: ClaimStatus[] = ['supported', 'conflict', 'not-established', 'blocked', 'pending']
const DECISIONS: Record<FindingDecision, string> = { accepted: 'Finding confirmed', rejected: 'Finding rejected', deferred: 'Decision deferred' }

function statusOf(f: Finding | undefined, recheck: boolean): SentenceStatus {
  if (recheck) return 'recheck'
  if (!f?.claims.length) return 'unchecked'
  return (['conflict', 'blocked', 'not-established', 'pending'] as const).find((status) =>
    f.claims.some((claim) => claim.status === status)) ?? 'supported'
}

function DraftPicker({ label, value, options, onSelect, searchable = false }: {
  label: string
  value: string
  options: { id: string; label: string; running?: boolean }[]
  onSelect: (id: string) => void
  searchable?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const selected = options.find((option) => option.id === value)
  const matches = options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()))

  useLayoutEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>('input, button')?.focus({ preventScroll: true })
  }, [open])

  useEffect(() => {
    if (!open) return
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])

  function close() {
    setOpen(false)
    setQuery('')
    trigger.current?.focus({ preventScroll: true })
  }

  return (
    <div className="draft-picker" ref={root} onBlur={(e) => {
      if (open && !e.currentTarget.contains(e.relatedTarget)) { setOpen(false); setQuery('') }
    }} onKeyDown={(e) => {
      if (open && e.key === 'Escape') { e.stopPropagation(); close() }
    }}>
      <button ref={trigger} className="ghost-btn draft-picker-trigger" aria-expanded={open}
        aria-label={label + ': ' + selected?.label} aria-controls={open ? menuId : undefined}
        onClick={() => { if (open) close(); else setOpen(true) }}>
        {searchable && <Icon name="file" size={14} />} {selected?.label}
        <Icon name="chevronDown" size={13} />
      </button>
      {open && <div className="topic-picker draft-picker-menu" ref={menu} id={menuId}>
        {searchable && <label className="field-search">
          <Icon name="search" size={15} />
          <input aria-label="Search manuscripts" placeholder="Search manuscripts…" value={query}
            onChange={(e) => setQuery(e.target.value)} />
        </label>}
        {matches.length ? <ul className="topic-picker-results" aria-label={label + ' options'}>
          {matches.map((option) => (
            <li key={option.id}><button aria-pressed={option.id === value} onClick={() => { onSelect(option.id); close() }}>
              <span>{option.label}</span>
              {option.running && <small>Checking…</small>}
              {option.id === value && <Icon name="check" size={14} />}
            </button></li>
          ))}
        </ul> : <p className="topic-picker-empty" role="status">No matching manuscripts.</p>}
      </div>}
    </div>
  )
}

export function Check() {
  const { state, act } = useStore()
  const manuscriptId = state.check.activeId
  const manuscript = MANUSCRIPTS.find(({ id }) => id === manuscriptId)!
  const c = state.check.manuscripts[manuscriptId]
  const citeKeys = manuscript.citeKeys
  const [version, setVersion] = useState(0)
  const [filter, setFilter] = useState<Filter>('all')
  const [focus, setFocus] = useState<string | null>(null)
  const [jump, setJump] = useState<{ id: string } | null>(null)
  const cards = useRef(new Map<string, HTMLElement>())
  const previous = c.history.find((snapshot) => snapshot.version === version)
  const shown = previous ?? c
  const running = c.status === 'running'
  const run = c.runId ? state.runs[c.runId] : undefined
  const rows = shown.sentences.map((sentence, index) => {
    const finding = previous ? shown.findings[sentence.id] : currentFinding(state, manuscript, sentence)
    const decision = shown.reviewed[sentence.id]
    const reviewed = decision && JSON.stringify(decision.finding) === JSON.stringify(finding) ? decision.decision : undefined
    return { sentence, index, finding, reviewed, status: statusOf(finding, shown.recheck.includes(sentence.id)) }
  })
  const counts = STATUSES.map((status) => {
    const count = rows.flatMap(({ finding }) => finding?.claims ?? []).filter((claim) => claim.status === status).length
    return { status, count }
  })
  const checked = rows.some(({ finding, status }) => finding || status === 'recheck')
  const needsAttention = (row: typeof rows[number]) => row.status !== 'supported' && row.status !== 'unchecked'
  const visible = rows.filter((row) => filter === 'all' || (filter === 'needs-attention' ? needsAttention(row)
    : row.finding?.claims.some((claim) => claim.status === filter)))
  const attention = rows.filter(needsAttention)

  useLayoutEffect(() => {
    if (!jump) return
    const card = cards.current.get(jump.id)
    if (!card) return
    card.focus({ preventScroll: true })
    scrollWithin(card, '.page-body', 'start')
  }, [jump])

  function jumpTo(id: string) {
    if (!visible.some(({ sentence }) => sentence.id === id)) setFilter('all')
    setFocus(id)
    setJump({ id })
  }

  function nextItem() {
    const next = attention[(attention.findIndex(({ sentence }) => sentence.id === focus) + 1) % attention.length]
    if (next) jumpTo(next.sentence.id)
  }

  function adopt(id: string, proposal: string) {
    setFilter('all')
    act.reviseSentence(manuscriptId, id, proposal)
    jumpTo(id)
  }

  return (
    <div className="page">
      <PageHead icon="shield" title="Citation check" sub="Checks each claim in your draft against its cited sources." trace>
        {running
          ? <span className="status-line" role="status"><Spinner /> {run?.steps.at(-1)?.title ?? 'Planning…'}</span>
          : <button className="primary" onClick={() => { setVersion(0); setFilter('all'); act.runCheck(manuscriptId) }}>
              <Icon name="shield" size={15} /> {c.status === 'idle' ? 'Check citations' : 'Check again'}
            </button>}
      </PageHead>

      <div className="page-body scroll">
        <div className="draft-meta">
          <DraftPicker label="Manuscript" value={manuscriptId} searchable
            options={MANUSCRIPTS.map(({ id, name }) => ({ id, label: name, running: state.check.manuscripts[id].status === 'running' }))}
            onSelect={(id) => {
              if (id === manuscriptId) return
              act.selectManuscript(id)
              setVersion(0); setFilter('all'); setFocus(null); setJump(null)
            }} />
          <DraftPicker label="Draft version" value={String(previous?.version ?? 0)}
            options={[{ id: '0', label: 'Draft v' + c.version + ' (current)' },
              ...[...c.history].reverse().map((snapshot) => ({ id: String(snapshot.version), label: 'Draft v' + snapshot.version }))]}
            onSelect={(id) => {
              act.closeEvidence()
              setVersion(Number(id)); setFilter('all'); setFocus(null); setJump(null)
            }} />
          <span>Markdown · {shown.sentences.length} sentences</span>
          {previous && <span className="tag quiet">Read-only snapshot</span>}
        </div>

        {checked && (
          <div className="check-summary">
            <div className="big">
              <strong>{rows.filter(({ status }) => status === 'supported').length} / {rows.length}</strong>
              <span>sentences fully supported</span>
            </div>
            {counts.filter(({ count }) => count > 0).map(({ status, count }) => (
              <button key={status} className={'count-pill ' + TONE[status]} aria-pressed={filter === status}
                onClick={() => setFilter(filter === status ? 'all' : status)}>
                <b>{count}</b> {LABEL[status].split(':')[0].toLowerCase()}
              </button>
            ))}
            <div className="check-tools">
              <select className="lib-select" aria-label="Filter findings" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
                <option value="all">All findings</option>
                <option value="needs-attention">Needs attention</option>
                {STATUSES.map((status) => <option key={status} value={status}>{LABEL[status]}</option>)}
              </select>
              <button className="ghost-btn sm" disabled={!attention.length} onClick={nextItem}>Next issue <Icon name="arrowRight" size={13} /></button>
            </div>
          </div>
        )}

        <div className="check-grid">
          <section className="draft card" aria-label="Draft">
            <h3>Draft</h3>
            <p className="draft-text">
              {rows.map(({ sentence, index, status }) => (
                <span key={sentence.id}>
                  <span role="button" tabIndex={0} aria-label={'Sentence ' + (index + 1) + ': ' + sentence.text}
                    className={'draft-s ' + status + (focus === sentence.id ? ' focus' : '')}
                    onClick={() => jumpTo(sentence.id)} onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jumpTo(sentence.id) }
                    }}>
                    {sentence.text}{sentence.cites.length > 0 && <span className="cite-key"> [{sentence.cites.map((key) => '@' + key).join('; ')}]</span>}
                  </span>{' '}
                </span>
              ))}
            </p>
          </section>

          <section className="findings" aria-label="Findings">
            {!checked && !running && <div className="placeholder"><Icon name="shield" size={22} /><p>Run a citation check to see the findings for this draft.</p></div>}
            {checked && !visible.length && <p className="placeholder">No findings match this filter.</p>}
            {visible.map(({ sentence, index, finding, status, reviewed }) => {
              const id = sentence.id
              if (!finding && status !== 'recheck') return running && !previous ? <div key={id} className="skeleton" /> : null
              const rechecking = running && (c.checking === id || c.checking === null)
              return (
                <article key={id} tabIndex={-1} aria-label={'Finding for sentence ' + (index + 1)}
                  ref={(el) => { if (el) cards.current.set(id, el); else cards.current.delete(id) }}
                  className={'finding' + (focus === id ? ' focus' : '')}>
                  <div className="finding-head">
                    <span className="num">{index + 1}</span>
                    <span className={'tag ' + TONE[status]}>{LABEL[status]}</span>
                    <span className="grow" />
                    {finding && (previous
                      ? reviewed && <span className="tag quiet">{DECISIONS[reviewed]}</span>
                      : <select className="lib-select check-review" aria-label={'Review finding for sentence ' + (index + 1)}
                          disabled={running} value={reviewed ?? ''} onChange={(e) => act.reviewFinding(manuscriptId, id, (e.target.value || undefined) as FindingDecision | undefined)}>
                          <option value="">Review finding…</option>
                          {Object.entries(DECISIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>)}
                  </div>
                  {finding && <>
                    <ul className="claims">
                      {finding.claims.map((claim, j) => (
                        <li key={j} className={claim.status}>
                          <span className="claim-dot" />
                          <div className="grow">
                            <strong>{claim.text}</strong>
                            <span className={'tag claim-status ' + TONE[claim.status]}>{LABEL[claim.status]}</span>
                            <p>{claim.note}</p>
                            {claim.evidenceId && claim.cite && (state.library.includes(citeKeys[claim.cite]) || sourceStatus(state, citeKeys[claim.cite]) !== 'available')
                              && <SourceChip evidenceId={claim.evidenceId} anchor={'chk-' + id + '-' + j} />}
                            {!previous && claim.cite && claim.status === 'blocked' && !state.library.includes(citeKeys[claim.cite]) && PAPERS[citeKeys[claim.cite]] &&
                              <p className="fine">Add {PAPERS[citeKeys[claim.cite]].short} to the library or restore it to check this source.</p>}
                          </div>
                        </li>
                      ))}
                    </ul>
                    {finding.sources?.map((source) => (
                      <div key={source.cite} className="check-source">
                        <SourceChip evidenceId={source.evidenceId} anchor={'chk-' + id + '-' + source.cite} />
                        <p>{source.note}</p>
                      </div>
                    ))}
                    {finding.suggestions?.map((suggestion) => (
                      <div className="proposal" key={suggestion.cite}>
                        <p><b>Found in source, waiting for your choice.</b> {suggestion.scope}</p>
                        <div className="stmt-meta"><SourceChip evidenceId={suggestion.evidenceId} anchor={'sug-' + id + '-' + suggestion.cite} /></div>
                        {!previous && <button className="ghost-btn sm accent" disabled={running} onClick={() => adopt(id, suggestion.cite)}>
                          <Icon name="quote" size={13} /> Add citation [@{suggestion.cite}]
                        </button>}
                      </div>
                    ))}
                    {finding.rewrite && <div className="proposal">
                      <p><b>Suggested wording</b></p>
                      <p className="rewrite"><del>{sentence.text}</del><ins>{finding.rewrite.text}</ins></p>
                      {!previous && <button className="ghost-btn sm accent" disabled={running} onClick={() => adopt(id, 'rewrite')}>
                        <Icon name="note" size={13} /> Apply wording as draft v{c.version + 1}
                      </button>}
                    </div>}
                  </>}
                  {status === 'recheck' && <>
                    <p>{sentence.text}</p>
                    {!previous && <button className="primary sm check-recheck" disabled={running} onClick={() => act.recheck(manuscriptId, id)}>
                      {rechecking ? <Spinner /> : <Icon name="shield" size={13} />} Re-check this sentence
                    </button>}
                  </>}
                </article>
              )
            })}
          </section>
        </div>
      </div>
    </div>
  )
}
