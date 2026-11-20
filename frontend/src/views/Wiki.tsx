import { count, useLanguage } from '../i18n'
import { useId, useRef, useState } from 'react'
import { useStore, wikiComparisonRows, wikiEvidenceAvailable } from '../data/store'
import { DEMO_TOPIC, EVIDENCE, PAPERS } from '../data/fixtures'
import { reviewWikiProposal } from '../data/wiki'
import { Icon, Spinner } from '../components/Icon'
import { PageHead } from '../components/PageHead'
import { SourceChip } from '../components/SourceChip'
import type { EvidenceAnchor, WikiPage, WikiProposal, WikiRelation } from '../data/types'

const REL_STATUS = {
  verified: { tone: 'ok', label: 'Source-checked' },
  unverified: { tone: 'warn', label: 'Not yet checked' },
  disputed: { tone: 'bad', label: 'Disputed' },
}

const UNFILED_NOTES = 'unfiled-notes'
const COMPARISON_TITLE = PAPERS.qasper.title + ' vs ' + PAPERS.pubmedqa.title

function noteBelongsToPage(note: EvidenceAnchor, page: WikiPage) {
  return page.paperId === note.paperId || page.statements.some((statement) => statement.evidenceIds.includes(note.id))
}

function PaperLink({ paperId }: { paperId: string }) {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const page = state.wiki.pages.find((p) => p.paperId === paperId)
  const title = PAPERS[paperId].title
  if (page && page.id !== state.wiki.active) {
    return <button className="link-btn" onClick={() => act.openWikiPage(page.id)} aria-label={tr('Open {0} Wiki page', title)}>{title}</button>
  }
  if (state.library.includes(paperId)) {
    return <button className="link-btn" onClick={() => act.navigate({ view: 'library', paperId })} aria-label={tr('Open {0} in Library', title)}>{title}</button>
  }
  return <strong>{title}</strong>
}

function Relations({ relations, prefix, added }: { relations: WikiRelation[]; prefix: string; added: boolean }) {
  const { tr } = useLanguage()
  const { state } = useStore()
  return (
    <ul className="relations">
      {relations.map((r) => {
        const unavailable = r.evidenceIds.some((id) => !wikiEvidenceAvailable(state, id))
        const verification = REL_STATUS[r.status]
        return (
          <li key={r.id} className={added ? 'diff-add' : ''}>
            {added && <span className="gutter" aria-hidden="true">+</span>}
            <span className="rel">
              <PaperLink paperId={r.fromPaperId} />
              <span className="rel-type">{tr(r.type)} <Icon name="arrowRight" size={12} /></span>
              <PaperLink paperId={r.toPaperId} />
            </span>
            <span className="rel-src">{r.evidenceIds.map((id) => <SourceChip fullTitle key={id} evidenceId={id} anchor={prefix + '-' + r.id + '-' + id} />)}</span>
            <span className={'tag ' + (unavailable ? 'warn' : verification.tone)}>
              {tr(verification.label)}{unavailable && tr(' · source unavailable')}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function PageItems({ page, prefix, added = false, showEmpty = false }: {
  page: WikiPage; prefix: string; added?: boolean; showEmpty?: boolean
}) {
  const { tr } = useLanguage()
  const { state } = useStore()
  return (
    <>
      {!!page.statements.length && <>
        <h3>{tr('Statements')}</h3>
        <ul className="statements">
          {page.statements.map((st) => (
            <li key={st.id} className={added ? 'diff-add' : ''}>
              {added && <span className="gutter" aria-hidden="true">+</span>}
              <div className="grow">
                <p>{st.excerpt && st.evidenceIds.some((id) => state.purgedPapers[EVIDENCE[id]?.paperId]?.clearExcerpts)
                  ? tr('Saved excerpt cleared') : st.text}</p>
                <div className="stmt-meta">
                  {st.evidenceIds.map((id) => <SourceChip fullTitle key={id} evidenceId={id} anchor={prefix + '-' + st.id + '-' + id} />)}
                  {st.evidenceIds.some((id) => !wikiEvidenceAvailable(state, id)) && <span className="tag warn">{tr('Historical · source unavailable')}</span>}
                  <span className={'author' + (st.author === 'You' ? ' you' : '')}>{tr(st.author)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </>}

      {(page.relations.length > 0 || showEmpty) && <>
        <h3>{tr('Relations')}</h3>
        {page.relations.length ? <Relations relations={page.relations} prefix={prefix} added={added} />
          : <p className="muted-text">{tr('No relations yet.')}</p>}
      </>}

      {page.questions.map((question) => (
        <section key={question.id}>
          <h3>{question.kind === 'comparison-gap' ? tr('Comparison limitation') : tr('Open disagreement')}</h3>
          <div className={'dispute' + (added ? ' diff-add-box' : '')}>
            <strong>{question.claim}</strong>
            <div className="sides">
              {question.sides.map((side, index) => (
                <div key={side.evidenceId} className="side">
                  <p>{side.text}</p>
                  <SourceChip fullTitle evidenceId={side.evidenceId} anchor={prefix + '-question-' + question.id + '-' + index} />
                </div>
              ))}
            </div>
            <p className="dispute-q"><Icon name="alert" size={13} /> {question.question}</p>
          </div>
        </section>
      ))}
    </>
  )
}

function DraftPreview({ proposal }: { proposal: WikiProposal }) {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const review = reviewWikiProposal(proposal, state.wiki.pages, (id) => wikiEvidenceAvailable(state, id))
  const additions = review.changes.reduce((n, change) => n + change.count, 0)
  const missingSources = [...new Map(review.unavailableIds.filter((id) => EVIDENCE[id]).map((id) => [EVIDENCE[id].paperId, id])).values()]
  return (
    <>
      <div className="draft-banner wiki-draft-banner">
        <Icon name="eye" size={16} />
        <div className="grow">
          <strong>{tr('Review Wiki draft')}</strong>
          <p>{count(tr, additions, 'addition')}{review.unchanged > 0 && tr(' · {0} already in the Wiki', review.unchanged)}</p>
        </div>
        <button className="ghost-btn" onClick={act.discardWiki}>{additions ? tr('Discard') : tr('Close draft')}</button>
        <button className="primary" disabled={!additions} onClick={act.acceptWiki}><Icon name="check" size={15} />{' '}{tr('Accept into wiki')}</button>
      </div>

      <details className="wiki-review-details">
        <summary>{tr('Selected materials ·')}{' '}{count(tr, proposal.inputs.noteIds.length, 'note')}{proposal.inputs.comparisonEvidenceIds.length > 0 && tr(' · 1 comparison')}</summary>
        <div className="stmt-meta">
          {proposal.inputs.noteIds.map((id) => <SourceChip fullTitle key={id} evidenceId={id} anchor={'draft-input-' + id} />)}
          {proposal.inputs.comparisonEvidenceIds.length > 0 && <span className="tag wiki-comparison-label">{COMPARISON_TITLE}</span>}
        </div>
      </details>

      {(review.blocked > 0 || missingSources.length > 0) && <div className="wiki-source-warning" role="status">
        <Icon name="alert" size={16} />
        <div>
          <strong>{tr('Selected sources are unavailable')}</strong>
          <p>{count(tr, review.blocked, 'proposed addition')}{' '}{tr('blocked.')}
            {missingSources.some((id) => state.trash.some((paper) => paper.paperId === EVIDENCE[id].paperId)) && tr(' You can restore papers still in Trash from Library.')}</p>
          <div className="stmt-meta">{missingSources.map((id) => <SourceChip fullTitle key={id} evidenceId={id} anchor={'draft-missing-' + id} />)}</div>
        </div>
      </div>}

      {!review.changes.length && <div className="placeholder" role="status">
        <Icon name={review.blocked ? 'alert' : 'check'} size={22} />
        <p>{review.blocked ? tr('No additions can be accepted with the available sources.') : tr('No new changes. These additions are already in the Wiki.')}</p>
      </div>}

      {review.changes.map(({ current, proposed }) => (
        <article key={proposed.id} className="wiki-page wiki-diff">
          <p className="eyebrow">{current ? tr('Update existing page') : tr('New concept page')}</p>
          <h2 className={current ? '' : 'diff-add-title'}>{proposed.title}</h2>
          {current ? (
            <details className="wiki-review-details">
              <summary>{tr('Existing content ·')}{' '}{count(tr, current.statements.length, 'statement')} · {count(tr, current.relations.length, 'relation')}</summary>
              <PageItems page={current} prefix={'before-' + current.id} />
            </details>
          ) : <p className="wiki-summary">{proposed.summary}</p>}
          <p className="wiki-add-label">{tr('Proposed additions')}</p>
          <PageItems page={proposed} prefix={'after-' + proposed.id} added />
        </article>
      ))}
    </>
  )
}

export function Wiki() {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const w = state.wiki
  const [selectedNotes, setSelectedNotes] = useState<string[]>([])
  const [includeComparison, setIncludeComparison] = useState(false)
  const [pageQuery, setPageQuery] = useState('')
  const [pagesOpen, setPagesOpen] = useState(false)
  const resultsId = useId()
  const pagesToggle = useRef<HTMLButtonElement>(null)
  const run = w.runId ? state.runs[w.runId] : undefined
  const lastStep = run?.steps[run.steps.length - 1]
  const draftActive = w.active === 'draft'
  const reviewReady = draftActive && w.status === 'done' && w.proposal
  const page = w.pages.find((p) => p.id === w.active) ?? w.pages[0]
  const linkedPaper = page.paperId ? PAPERS[page.paperId] : undefined
  const pageTerms = pageQuery.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const matchingPages = w.pages.filter((p) => {
    const paper = p.paperId ? PAPERS[p.paperId] : undefined
    const text = [p.title, paper?.short, paper?.title, paper?.externalId, paper?.doi].join(' ').toLowerCase()
    return pageTerms.every((term) => text.includes(term))
  })
  const notes = state.noted.map((id) => EVIDENCE[id]).filter(Boolean)
  const unfiledNotes = notes.filter((note) => !w.pages.some((p) => noteBelongsToPage(note, p)))
  const browsingUnfiled = w.active === UNFILED_NOTES && unfiledNotes.length > 0
  const availableNotes = selectedNotes.filter((id) => state.noted.includes(id) && wikiEvidenceAvailable(state, id))
  const canIncludeComparison = wikiComparisonRows(state).length > 0
  const canDraft = availableNotes.length > 0 || (includeComparison && canIncludeComparison)
  const locked = w.status === 'running' || !!w.proposal
  const selected = w.proposal?.inputs.noteIds ?? availableNotes
  const selectionIncludesComparison = w.proposal ? w.proposal.inputs.comparisonEvidenceIds.length > 0 : includeComparison && canIncludeComparison
  const visibleNotes = draftActive ? notes.filter((note) => selected.includes(note.id))
    : browsingUnfiled ? unfiledNotes : notes.filter((note) => noteBelongsToPage(note, page))
  const hiddenSelections = selected.filter((id) => !visibleNotes.some((note) => note.id === id)).length
  const currentTitle = draftActive ? 'Agent draft' : browsingUnfiled ? 'Notes without a page' : page.title
  const currentIcon = browsingUnfiled ? 'note' : !draftActive && page.paperId ? 'file' : 'wiki'
  const otherPages = matchingPages.filter((p) => p.id !== w.active)

  function closePages() {
    setPagesOpen(false)
    setPageQuery('')
  }

  function selectPage(id: string, focusToggle = true) {
    act.openWikiPage(id)
    closePages()
    if (focusToggle) pagesToggle.current?.focus({ preventScroll: true })
  }

  return (
    <div className="page">
      <PageHead icon="wiki" title={tr('Evidence wiki')} sub={tr('Choose source material and review the changes before adding them to the Wiki.')} trace>
        {w.status === 'running'
          ? <span className="status-line"><Spinner /> {lastStep?.title ?? tr('Planning…')}</span>
          : <button className="primary" disabled={locked || !canDraft} onClick={() => act.runWikiDraft(availableNotes, includeComparison)}>
              <Icon name="wiki" size={15} />{' '}{tr('Draft from selected materials')}
            </button>}
      </PageHead>

      <div className="page-body wiki-grid">
        <aside className="wiki-nav">
          <nav aria-label={tr('Wiki pages')}>
            <h2 className="side-label">{tr('Wiki pages')}</h2>
            <div onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) closePages() }}
              onKeyDown={(e) => {
                if (e.key !== 'Escape' || !pagesOpen) return
                e.preventDefault()
                e.stopPropagation()
                closePages()
                pagesToggle.current?.focus({ preventScroll: true })
              }}>
              <label className="field-search wiki-page-search">
                <Icon name="search" size={15} />
                <input type="search" aria-label={tr('Search Wiki pages')} aria-controls={resultsId} placeholder={tr('Search Wiki pages…')} value={pageQuery}
                  onFocus={() => setPagesOpen(true)} onClick={() => setPagesOpen(true)}
                  onChange={(e) => { setPageQuery(e.target.value); setPagesOpen(true) }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && matchingPages.length === 1) {
                      e.preventDefault()
                      selectPage(matchingPages[0].id, false)
                    }
                  }} />
              </label>
              <div className="wiki-link on" aria-current="page" title={currentTitle}>
                <Icon name={currentIcon} size={14} />
                <span className="grow wiki-page-title">{currentTitle}</span>
              </div>
              <button ref={pagesToggle} className="side-more" aria-expanded={pagesOpen} aria-controls={resultsId}
                onClick={() => { if (pagesOpen) closePages(); else setPagesOpen(true) }}>
                <Icon name={pagesOpen ? 'chevronDown' : 'chevronRight'} size={13} />
                {pagesOpen ? tr('Show less') : tr('Show more')}
              </button>
              <div id={resultsId} className={'wiki-page-results' + (pagesOpen ? ' open' : '')} aria-hidden={!pagesOpen}>
                <div className="wiki-page-results-inner">
                  {pageTerms.length > 0 && <p className="nav-note muted-text wiki-search-result" role="status">
                    {matchingPages.length ? count(tr, matchingPages.length, 'matching page') : tr('No Wiki pages match.')}
                  </p>}
                  <ul className="wiki-page-list">
                    {otherPages.map((p) => (
                      <li key={p.id}>
                        <button className="wiki-link" title={p.title} tabIndex={pagesOpen ? undefined : -1} onClick={() => selectPage(p.id)}>
                          <Icon name={p.paperId ? 'file' : 'wiki'} size={14} />
                          <span className="grow wiki-page-title">{p.title}</span>
                          <small title={count(tr, p.statements.length, 'statement')}>{p.statements.length}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            {unfiledNotes.length > 0 && !browsingUnfiled && (
              <button className={'wiki-link' + (browsingUnfiled ? ' on' : '')} aria-current={browsingUnfiled ? 'page' : undefined}
                onClick={() => act.openWikiPage(UNFILED_NOTES)}>
                <Icon name="note" size={14} />
                <span className="grow">{tr('Notes without a page')}</span>
                <small>{unfiledNotes.length}</small>
              </button>
            )}
            {locked && !draftActive && (
              <button className={'wiki-link draft' + (draftActive ? ' on' : '')}
                aria-current={draftActive ? 'page' : undefined} onClick={() => act.openWikiPage('draft')}>
                {w.status === 'running' ? <Spinner /> : <Icon name="plus" size={14} />}
                <span className="grow">{tr('Agent draft')}</span>
                <span className="tag accent">{w.status === 'running' ? tr('Preparing') : tr('Review')}</span>
              </button>
            )}
          </nav>

          <section className="wiki-materials" aria-label={tr('Draft materials')}>
            <h2 className="side-label">{tr('Draft materials')}</h2>
            <p className="wiki-selection-note">{count(tr, selected.length, 'note')}{' '}{tr('selected')}{selectionIncludesComparison && tr(' · 1 comparison')}{hiddenSelections > 0 && tr(' · {0} elsewhere', hiddenSelections)}</p>
            <h3 className="side-label">{tr('Saved notes')}</h3>
            {notes.length === 0 ? <p className="nav-note muted-text">{tr('Save a source as a note in')}{' '}
              {state.topics.some((topic) => topic.id === DEMO_TOPIC) ? <button className="link-btn" onClick={() => act.enterTopic(DEMO_TOPIC)}>{tr('Read & ask')}</button> : tr('Read & ask')}{' '}
              {tr('to use it here.')}</p> : visibleNotes.length === 0 ? <p className="nav-note muted-text">{draftActive ? tr('No saved notes in this draft.') : tr('No saved notes for this page.')}</p> : visibleNotes.map((e) => {
              const available = wikiEvidenceAvailable(state, e.id)
              return (
                <div key={e.id} className={'note-item' + (selected.includes(e.id) ? ' selected' : '')}>
                  <label>
                    <input type="checkbox" checked={selected.includes(e.id)} disabled={locked || !available}
                      onChange={({ target }) => setSelectedNotes((ids) => target.checked ? [...ids, e.id] : ids.filter((id) => id !== e.id))} />
                    <span>“{e.quote}”</span>
                  </label>
                  <div className="stmt-meta">
                    <SourceChip fullTitle evidenceId={e.id} anchor={'saved-note-' + e.id} />
                    {!available && <small>{tr('Historical note')}</small>}
                  </div>
                </div>
              )
            })}
            {state.comparison.status === 'done' && <>
              <h3 className="side-label">{tr('Comparison')}</h3>
              <div className={'note-item' + (selectionIncludesComparison ? ' selected' : '')}>
                <label>
                  <input type="checkbox" checked={selectionIncludesComparison} disabled={locked || !canIncludeComparison}
                    onChange={(e) => setIncludeComparison(e.target.checked)} />
                  <span>{COMPARISON_TITLE}</span>
                </label>
                <small>{canIncludeComparison ? tr('Use the sourced comparison rows') : tr('Comparison sources unavailable')}</small>
              </div>
            </>}
          </section>
        </aside>

        <div className="wiki-main scroll" aria-label={tr('Wiki content')}>
          {draftActive && w.status === 'running' && <div className="placeholder" role="status"><Spinner /><p>{tr('Preparing a draft from your selection.')}</p></div>}
          {reviewReady && <DraftPreview proposal={reviewReady} />}
          {browsingUnfiled && <article className="wiki-page">
            <h2>{tr('Notes without a page')}</h2>
            <p className="wiki-summary">{tr('Select notes in the sidebar to use them in a Wiki draft.')}</p>
          </article>}
          {!draftActive && !browsingUnfiled && <>
            {w.discarded && <div className="review-done" role="status"><Icon name="x" size={14} />{' '}{tr('Draft closed.')}</div>}
            <article className="wiki-page">
              <p className="eyebrow">{tr('{0} page', tr(page.kind))}</p>
              <h2>{page.title}</h2>
              {linkedPaper && <div className="wiki-paper-link">
                {state.library.includes(linkedPaper.id) ? (
                  <button className="link-btn" onClick={() => act.navigate({ view: 'library', paperId: linkedPaper.id })}>
                    {tr('Open in Library')}{' '}<Icon name="arrowRight" size={13} />
                  </button>
                ) : <span>{tr('Source unavailable')}</span>}
              </div>}
              <p className="wiki-summary">{page.summary}</p>
              <PageItems page={page} prefix={page.id} showEmpty />
              <h3>{tr('History')}</h3>
              <ul className="revisions">
                {page.revisions.map((r, i) => <li key={i}><span>{r.when}</span> <b>{r.who}</b> {r.what}</li>)}
              </ul>
            </article>
          </>}
        </div>
      </div>
    </div>
  )
}
