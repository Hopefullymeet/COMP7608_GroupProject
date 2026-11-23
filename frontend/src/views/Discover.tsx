import { invoke, isTauri } from '@tauri-apps/api/core'
import { useLanguage } from '../i18n'
import { useEffect, useId, useRef, useState } from 'react'
import { currentTopic, paperFor, papersOfTopic, sourceStatus, useStore } from '../data/store'
import { enabledSources, SOURCE_NAMES } from '../data/serviceSettings'
import { Icon, Spinner } from '../components/Icon'
import type { Candidate, Decision } from '../data/types'

const DECISION_LABEL: Record<Exclude<Decision, 'pending'>, string> = { added: 'Added to topic', held: 'On hold', excluded: 'Not relevant' }

function CandidateCard({ c, disabled }: { c: Candidate; disabled?: boolean }) {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const p = paperFor(state, c.paperId)
  const [openingBrowser, setOpeningBrowser] = useState(false)
  const accessUrl = c.accessUrl ?? (p.doi ? `https://doi.org/${p.doi}` : p.externalId?.startsWith('arXiv:') ? `https://arxiv.org/abs/${p.externalId.slice(6)}` : undefined)
  const availability = sourceStatus(state, c.paperId)
  const latest = state.runOrder.map((id) => state.runs[id]).find((run) => run.task === 'Discovery')
  const previousSource = latest?.configuration && !latest.configuration.sources.some((id) => SOURCE_NAMES[id] === c.source)

  async function openInBrowser(url: string) {
    setOpeningBrowser(true)
    try {
      await invoke('open_paper_url', { url })
    } catch (error) {
      console.error('Could not open the browser.', error)
    } finally {
      setOpeningBrowser(false)
    }
  }

  return (
    <article className={`cand ${c.decision}`} data-testid={`cand-${c.paperId}`}>
      <div className="cand-main">
        <div className="cand-top">
          {c.change&&<span className="tag accent">{c.change==='new'?tr('New candidate'):tr('Updated candidate')}</span>}
          {!state.mainline && c.round > 1 && <span className="tag accent">{tr('New in round')}{' '}{c.round}</span>}
          <span className="tag">{tr(c.readLevel)}</span>
          <span className="tag quiet">{tr('via')}{' '}{c.source}</span>
          {previousSource && <span className="tag quiet">{tr('Earlier search')}</span>}
        </div>
        <h3>{p.title}</h3>
        <p className="byline">
          {p.authors.slice(0, 3).join(', ')}{p.authors.length > 3 ? tr(' et al.') : ''} · <span title={tr('Venue and year from {0}', p.venueSource)}>{p.venue} {p.year}</span>
        </p>
        <p className="reason"><Icon name="compass" size={13} /> {c.reason}</p>
      </div>
      <div className="cand-actions">
        {availability === 'deleted' ? (
          <span className="decided">{tr('Deleted from library')}</span>
        ) : c.note && c.decision === 'added' ? (
          <span className="decided added"><Icon name="check" size={14} /> {tr(c.note)}</span>
        ) : c.decision === 'pending' ? (
          <>
            <button className="ghost-btn sm accent" disabled={disabled} onClick={() => act.decide(c.id, 'added')}>
              <Icon name={availability === 'in trash' ? 'undo' : 'plus'} size={14} /> {availability === 'in trash' ? tr('Restore and add to topic') : tr('Add to topic')}
            </button>
            <button className="ghost-btn sm" disabled={disabled} onClick={() => act.decide(c.id, 'held')}><Icon name="clock" size={14} />{' '}{tr('Hold')}</button>
            <button className="ghost-btn sm" disabled={disabled} onClick={() => act.decide(c.id, 'excluded')}><Icon name="x" size={14} />{' '}{tr('Not relevant')}</button>
          </>
        ) : (
          <>
            <span className={`decided ${c.decision}`}>
              <Icon name={c.decision === 'added' ? 'check' : c.decision === 'held' ? 'clock' : 'x'} size={14} /> {tr(DECISION_LABEL[c.decision])}
            </span>
            <button className="link-btn" disabled={disabled} onClick={() => act.decide(c.id, 'pending')}><Icon name="undo" size={13} />{' '}{tr('Undo')}</button>
          </>
        )}
        {accessUrl && (isTauri()
          ? <button type="button" className="ghost-btn sm" disabled={openingBrowser}
              onClick={() => void openInBrowser(accessUrl)}>{tr('Access to Download PDF')}</button>
          : <a className="ghost-btn sm" href={accessUrl} target="_blank" rel="noopener noreferrer">
              {tr('Access to Download PDF')}
            </a>)}
      </div>
    </article>
  )
}

function MainlineSearch({ question, submit, busy, running }: {
  question: string; submit: NonNullable<ReturnType<typeof useStore>['state']['mainline']>['search']
  busy: boolean; running: boolean
}) {
  const { tr } = useLanguage()
  const [open, setOpen] = useState(false)
  const {state}=useStore()
  const [venue,setVenue]=useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const filter = useRef<HTMLDivElement>(null)
  const filterButton = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const valid = [from, to].every((value) => !value || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 9999))
    && !(from && to && Number(from) > Number(to))
  const selected = Boolean(from || to || (venue && state.mainline?.venueFilter))
  const range = from && to ? `${from}–${to}` : from ? tr('From {0}', from) : tr('Through {0}', to)
  function close() {
    setOpen(false)
    filterButton.current?.focus()
  }
  useEffect(() => {
    if (!open || running) return
    function dismiss(e: PointerEvent) {
      if (e.target instanceof Node && !filter.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open, running])
  if (running) return null

  return <div className="search-actions">
    <div className="year-filter" ref={filter}
      onBlur={(e) => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false) }}
      onKeyDown={(e) => {
        if (open && e.key === 'Escape') { e.stopPropagation(); close() }
      }}>
      <button ref={filterButton} type="button" className={`ghost-btn year-trigger${selected || open ? ' accent' : ''}`}
        aria-expanded={open} aria-controls={open ? panelId : undefined}
        aria-label={selected ? tr('Publication years, {0}', valid ? range : tr('Check years')) : tr('Publication years')}
        disabled={busy} onClick={() => setOpen(!open)}>
        <Icon name="calendar" size={15} />
        {selected ? valid ? range : tr('Check years') : tr('Publication years')}
        <Icon name="chevronDown" size={13} className="year-chevron" />
      </button>
      {open && <form id={panelId} className="card year-panel" aria-label={tr('Publication years')}
        onSubmit={(e) => { e.preventDefault(); if (valid) close() }}>
        <div className="year-fields">
          <label className="set-field">{tr('From year')}<input className="text-field" type="text" inputMode="numeric" maxLength={4} placeholder={tr('Any year')}
            value={from} aria-invalid={!valid} aria-describedby={!valid ? `${panelId}-error` : undefined}
            onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="set-field">{tr('To year')}<input className="text-field" type="text" inputMode="numeric" maxLength={4} placeholder={tr('Any year')}
            value={to} aria-invalid={!valid} aria-describedby={!valid ? `${panelId}-error` : undefined}
            onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        {state.mainline?.venueFilter && <label className="set-field year-venue">
          {tr('Venue')}
          <input className="text-field" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder={tr('Conference name')} />
        </label>}
        {!valid && <p className="year-error" id={`${panelId}-error`} role="status">{tr('Use years from 1 to 9999, with the start year first.')}</p>}
        <div className="year-panel-actions">
          <button type="button" className="link-btn" disabled={!selected} onClick={() => { setFrom(''); setTo('');setVenue('') }}>{tr('Clear')}</button>
          <button type="submit" className="primary sm" disabled={!valid}>{tr('Done')}</button>
        </div>
      </form>}
    </div>
    <button className="primary" disabled={!valid || busy} onClick={() => {
      setOpen(false)
      submit(question, selected ? {
        ...(venue.trim() && state.mainline?.venueFilter && {venue:venue.trim()}), ...(from && { year_from: Number(from) }), ...(to && { year_to: Number(to) }),
      } : undefined)
    }}><Icon name="compass" size={15} />{' '}{tr('Find papers')}</button>
  </div>
}

export function Discover() {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const topicPapers = new Map<string, ReturnType<typeof paperFor>>()
  for (const id of papersOfTopic(state, currentTopic(state))) {
    const paper = paperFor(state, id)
    const key = paper.paperId ?? id
    const current = topicPapers.get(key)
    if (!current || (!current.pdfAvailable && paper.pdfAvailable)) topicPapers.set(key, paper)
  }
  const d = state.discovery
  const latest = state.runOrder.map((id) => state.runs[id]).find((run) => run.task === 'Discovery')
  const feedback = state.candidates.filter((c) => c.decision === 'excluded').length
  const sourceChanged = !state.mainline && latest?.configuration?.sources.join(',') !== enabledSources(state.settings).join(',')
  const canRefine = d.status === 'done' && (state.mainline || d.round < 2) && !d.interrupted && !sourceChanged

  return (
    <div className="discover scroll">
      <section className="disc-head">
        <div className="question-card">
          <span className="eyebrow">{tr('Research question')}</span>
          <p className="question">{d.question}</p>
          <div className="status-line">
            {d.status === 'idle' && <span>{tr('The agent has not searched yet.')}</span>}
            {d.status === 'running' && <><Spinner /> <span>{tr('Searching for papers…')}</span></>}
            {d.status === 'done' && <><Icon name="check" size={15} /> <span>{state.mainline
              ? tr('{0} visible candidates', state.candidates.length)
              : d.summary}</span></>}
          </div>
        </div>
        <div className="disc-actions">
          {state.mainline && <MainlineSearch key={currentTopic(state)} question={d.question}
            submit={state.mainline.search} busy={state.mainline.searchBusy} running={d.status === 'running'} />}
          {!state.mainline && d.status === 'idle' && <button className="primary" onClick={() => act.runDiscovery(d.question)}><Icon name="compass" size={15} />{' '}{tr('Find papers')}</button>}
          {!state.mainline && d.status === 'done' && (d.interrupted || sourceChanged) && (
            <button className="primary" onClick={() => act.runDiscovery(d.question)}><Icon name="compass" size={15} />{' '}{tr('Search again')}</button>
          )}
          {canRefine && (
            <button className="primary" disabled={feedback === 0 || state.mainline?.searchBusy} onClick={() => act.refineDiscovery()}
              title={feedback === 0 ? tr('Mark at least one candidate as Not relevant first') : undefined}>
              <Icon name="undo" size={15} />{' '}{tr('Refine with my feedback')}
            </button>
          )}
          {canRefine && feedback === 0 && <small className="hint">{tr('Mark a candidate “Not relevant” to steer the next search.')}</small>}
        </div>
      </section>

      <div className="disc-grid">
        <section className="cand-list" aria-label={tr('Candidates')}>
          {state.candidates.length === 0 && d.status !== 'running' && (
            <div className="placeholder">
              <Icon name="compass" size={22} />
              <p>{tr(d.status === 'idle' ? 'Candidate papers will appear here.' : 'No candidate papers found.')}</p>
            </div>
          )}
          {state.candidates.map((c) => (
            <CandidateCard key={c.id} c={c} disabled={state.mainline && (state.mainline.searchBusy || d.status === 'running')} />
          ))}
        </section>

        <aside className="disc-side">
          {d.coverage && (
            <div className="card">
              <h3>{tr('Coverage')}</h3>
              <ul className="coverage">
                {d.coverage.covered.map((c) => <li key={c} className="ok"><Icon name="check" size={14} /> {c}</li>)}
                {d.coverage.gaps.map((g) => <li key={g} className="gap"><Icon name="alert" size={14} /> {g}</li>)}
              </ul>
              <p className="fine">{tr('Covers this search only, not every paper that exists.')}</p>
            </div>
          )}

          <div className="card">
            <h3>{tr('In this topic')}</h3>
            <ul className="in-topic">
              {Array.from(topicPapers.values()).map((paper) => {
                const id = paper.id
                return <li key={id}>
                  <span>{paper.title}</span>
                  <div className="in-topic-actions">
                    {paper.pdfAvailable || paper.stored !== 'metadata'
                      ? <button className="link-btn" aria-label={tr('Read {0}', paper.title)} onClick={() => { act.openTopic(currentTopic(state), 'read'); act.setReader(id) }}>{tr('Read')}{' '}<Icon name="arrowRight" size={12} /></button>
                      : <small>{tr('Metadata only')}</small>}
                  </div>
                </li>
              })}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}
