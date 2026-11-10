import { useStore } from '../data/store'
import { EVIDENCE, PAPERS } from '../data/fixtures'
import { Icon, Spinner } from '../components/Icon'
import { PageHead } from '../components/PageHead'
import { SourceChip } from '../components/SourceChip'
import { plural } from '../components/util'
import type { WikiPage, WikiRelation } from '../data/types'

const REL_STATUS: Record<WikiRelation['status'], string> = { verified: 'ok', unverified: 'warn', disputed: 'bad' }

function Relations({ relations, prefix, added = false }: { relations: WikiRelation[]; prefix: string; added?: boolean }) {
  return (
    <ul className="relations">
      {relations.map((r) => (
        <li key={r.id} className={added ? 'diff-add' : ''}>
          {added && <span className="gutter">+</span>}
          <span className="rel">
            <strong>{r.from}</strong>
            <span className="rel-type">{r.type} <Icon name="arrowRight" size={12} /></span>
            <strong>{r.to}</strong>
          </span>
          <span className="rel-src">{r.evidenceIds.map((id) => <SourceChip key={id} evidenceId={id} anchor={`${prefix}-${r.id}-${id}`} />)}</span>
          <span className={`tag ${REL_STATUS[r.status]}`}>{r.status === 'verified' ? 'Source-checked' : r.status === 'unverified' ? 'Not yet checked' : 'Disputed'}</span>
        </li>
      ))}
    </ul>
  )
}

function PageView({ page, prefix, diff = false }: { page: WikiPage; prefix: string; diff?: boolean }) {
  return (
    <article className="wiki-page">
      <p className="eyebrow">{page.kind} page</p>
      <h2 className={diff ? 'diff-add-title' : ''}>{page.title}</h2>
      <p className="wiki-summary">{page.summary}</p>

      <h3>Statements</h3>
      <ul className="statements">
        {page.statements.map((st) => (
          <li key={st.id} className={diff ? 'diff-add' : ''}>
            {diff && <span className="gutter">+</span>}
            <div className="grow">
              <p>{st.text}</p>
              <div className="stmt-meta">
                {st.evidenceIds.map((id) => <SourceChip key={id} evidenceId={id} anchor={`${prefix}-${st.id}-${id}`} />)}
                <span className={`author ${st.author === 'You' ? 'you' : ''}`}>{st.author}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <h3>Relations</h3>
      {page.relations.length ? <Relations relations={page.relations} prefix={prefix} added={diff} />
        : <p className="muted-text">No relations yet. They appear when a comparison or note links this page to another.</p>}

      {page.disputes.length > 0 && <>
        <h3>Open disagreements</h3>
        {page.disputes.map((d) => (
          <div key={d.claim} className={`dispute ${diff ? 'diff-add-box' : ''}`}>
            <strong>{d.claim}</strong>
            <div className="sides">
              {d.sides.map((side) => (
                <div key={side.evidenceId} className="side">
                  <p>{side.text}</p>
                  <SourceChip evidenceId={side.evidenceId} anchor={`${prefix}-dispute-${side.evidenceId}`} />
                </div>
              ))}
            </div>
            <p className="dispute-q"><Icon name="alert" size={13} /> To investigate: {d.question}</p>
          </div>
        ))}
      </>}

      {!diff && <>
        <h3>History</h3>
        <ul className="revisions">
          {page.revisions.map((r, i) => <li key={i}><span>{r.when}</span> <b>{r.who}</b> {r.what}</li>)}
        </ul>
      </>}
    </article>
  )
}

export function Wiki() {
  const { state, act } = useStore()
  const w = state.wiki
  const run = state.runOrder.map((id) => state.runs[id]).find((r) => r.task === 'Wiki draft')
  const lastStep = run?.steps[run.steps.length - 1]
  const showingDraft = !!w.proposal && w.active === 'draft'
  const page = w.pages.find((p) => p.id === w.active) ?? w.pages[0]
  const notes = state.noted.map((id) => EVIDENCE[id]).filter(Boolean)

  return (
    <div className="page">
      <PageHead icon="wiki" title="Evidence wiki" sub="Concept pages built from notes you chose. Every statement keeps its source." trace>
        {w.status === 'running'
          ? <span className="status-line"><Spinner /> {lastStep?.title ?? 'Planning…'}</span>
          : <button className="primary" disabled={!!w.proposal} onClick={() => { act.runWikiDraft(); act.openWikiPage('draft') }}>
              <Icon name="wiki" size={15} /> Draft a page from my notes
            </button>}
      </PageHead>

      <div className="page-body wiki-grid">
        <nav className="wiki-nav" aria-label="Wiki pages">
          <div className="side-label">Pages</div>
          {w.pages.map((p) => (
            <button key={p.id} className={`wiki-link ${!showingDraft && page.id === p.id ? 'on' : ''}`} onClick={() => act.openWikiPage(p.id)}>
              <Icon name={p.kind === 'Dataset' ? 'file' : 'wiki'} size={14} />
              <span className="grow">{p.title}</span>
              <small>{p.statements.length}</small>
            </button>
          ))}
          {(w.proposal || w.status === 'running') && (
            <button className={`wiki-link draft ${showingDraft || (w.status === 'running' && w.active === 'draft') ? 'on' : ''}`} onClick={() => act.openWikiPage('draft')}>
              {w.status === 'running' ? <Spinner /> : <Icon name="plus" size={14} />}
              <span className="grow">Agent draft</span>
              <span className="tag accent">Review</span>
            </button>
          )}

          <div className="side-label notes-label">Saved notes · {notes.length}</div>
          {notes.length === 0
            ? <p className="muted-text nav-note">Save a source as a note from Read &amp; ask; it becomes material for drafts.</p>
            : notes.map((e) => (
              <div key={e.id} className="note-item">
                <p>“{e.quote}”</p>
                <small>{PAPERS[e.paperId].short} · p. 1</small>
              </div>
            ))}
        </nav>

        <main className="wiki-main scroll">
          {w.active === 'draft' && w.status === 'running' && !w.proposal && (
            <div className="placeholder"><Spinner /><p>The agent is grouping your material. The draft opens here for review; nothing is written yet.</p></div>
          )}
          {showingDraft && w.proposal && (
            <>
              <div className="draft-banner">
                <Icon name="eye" size={16} />
                <div className="grow">
                  <strong>Agent draft: nothing is saved until you accept</strong>
                  <p>Built from {w.proposal.inputs.join(', ')}. Green lines would be added.</p>
                </div>
                <button className="ghost-btn" onClick={() => act.discardWiki()}>Discard</button>
                <button className="primary" onClick={() => act.acceptWiki()}><Icon name="check" size={15} /> Accept into wiki</button>
              </div>
              <PageView page={w.proposal.page} prefix="draft" diff />
              {w.proposal.edits.map((e) => (
                <div key={e.pageId} className="edit-block">
                  <h3>Also changes “{w.pages.find((p) => p.id === e.pageId)?.title}”</h3>
                  <Relations relations={e.relations} prefix={`edit-${e.pageId}`} added />
                </div>
              ))}
            </>
          )}
          {!(w.active === 'draft' && (w.proposal || w.status === 'running')) && (
            <>
              {w.discarded && <div className="review-done"><Icon name="x" size={14} /> Draft discarded. Your pages are unchanged.</div>}
              <PageView page={page} prefix={page.id} />
              <p className="fine">{plural(page.statements.length, 'statement')} · {plural(page.relations.length, 'relation')} · edits by you and the agent keep their author.</p>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
