import { downloadText } from '../api/pdf'
import { useLanguage } from '../i18n'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import type { Located } from '../api/library'
import type { Rect, Selection } from '../api/reader'
import type { Assessment, OutlinePoint, PaperRelation } from '../api/synthesis'
import { FigureSearch } from '../components/FigureSearch'
import { Dialog } from '../components/PageHead'
import { Icon } from '../components/Icon'
import { PaperImportDialog, usePdfDrop } from './PaperImportDialog'
import { useRead, useWorkspace } from '../data/WorkspaceProvider'
import { useStore } from '../data/store'
import { PageHead } from '../components/PageHead'

const PdfReader = lazy(() => import('./PdfReader'))

const assessmentLabel: Record<Assessment, string> = {
  supported: 'Supported', partial: 'Partially supported', conflicting: 'Conflicting evidence', missing: 'Evidence missing',
}
const relationLabel: Record<string, string> = {
  background: 'Background citation', uses_method: 'Uses a method', uses_data: 'Uses data',
  uses_benchmark: 'Uses a benchmark', extends: 'Extends', compares: 'Comparison', complements: 'Complementary',
  agrees: 'Agreement', conflicts: 'Conflict',
}
function entryTitle(entry: OutlinePoint | PaperRelation) {
  return 'title' in entry ? entry.title : entry.subject
}

export function TopicWikiPage() {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const [selected, select] = useState('')
  const topic = selected || state.topics[0]?.id
  return <div className="page">
    <PageHead title={tr('Evidence Wiki')} sub="" icon="book">
      {topic && <button className="icon-btn synthesis-mobile-back" aria-label={tr('Open topic')}
        onClick={() => act.openTopic(topic, 'synthesis')}><Icon name="arrowLeft" size={16} /></button>}
      {topic && <select className="lib-select" aria-label={tr('Research topic')} value={topic}
        onChange={(event) => select(event.currentTarget.value)}>
        {state.topics.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select>}
    </PageHead>
    {topic ? <LiteratureWorkbench key={topic} topicId={topic} initialView="wiki" /> :
      <p className="page-body">{tr('Create a topic to start its Wiki.')}</p>}
  </div>
}

export function LiteratureWorkbench({ topicId, initialView = 'outline' }: {
  topicId: string; initialView?: 'outline' | 'wiki'
}) {
  const { tr } = useLanguage()
  const { state } = useStore()
  const scope = { topic_id: topicId }
  const workspace = useWorkspace()
  const library = useRead('library.list', scope)
  const results = useRead('synthesis.list', scope)
  const wiki = useRead('synthesis.wiki', scope)
  const [referenceVersion, referencesFor] = useState('')
  const [direction, setDirection] = useState<'outgoing' | 'incoming'>('outgoing')
  const [referencePage, setReferencePage] = useState<{ version: string; page: number; quote?: string; rect?: Rect }>()
  const [figureDialog, findFigure] = useState(false)
  const [selection, setSelection] = useState<Selection & { version: string }>()
  const [selectionQuestion, setSelectionQuestion] = useState('')
  const answers = useRead('reader.answers', scope, !workspace.demo)?.items ?? []
  const visual = useRead('visual.capabilities', {}, !workspace.demo)
  const [exported, setExported] = useState<{ name: string; text: string }[]>([])
  const refs = useRead('literature.refs', { ...scope, source_version_id: referenceVersion, direction }, !!referenceVersion)
  const [draftQuestion, setQuestion] = useState<string>()
  const question = draftQuestion ?? state.topics.find((topic) => topic.id === topicId)?.title ?? ''
  const [choices, setChoices] = useState<Record<string, string | undefined>>({})
  const [resultId, setResultId] = useState('')
  const [checked, setChecked] = useState<string[]>([])
  const [view, setView] = useState<'outline' | 'wiki'>(initialView)
  const [review, setReview] = useState(false)
  const [reader, setReader] = useState<Located>()
  const [readerPending, setReaderPending] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [imports, setImports] = useState<{ files: (File | string)[]; paper?: string }>()
  usePdfDrop(!workspace.demo && !imports ? (files) => { setDragging(false); setImports({ files }) } : undefined)
  const request = useRef(0)
  const shownEvidence = useRef<HTMLElement>(null)
  const papers = library?.items ?? []
  const versions = papers.flatMap((paper) => {
    const selected = Object.hasOwn(choices, paper.paper_id) ? choices[paper.paper_id] : paper.source_versions[0].source_version_id
    return selected ? [selected] : []
  })
  const names = Object.fromEntries(papers.flatMap((p) => p.source_versions.map((v) => [v.source_version_id, p.title])))
  const pdfVersions = new Set(papers.flatMap((p) => p.source_versions
    .filter((version) => version.pdf_available ?? version.available_scope === 'full_text').map((version) => version.source_version_id)))
  const outline = results?.items.find((item) => item.record_id === resultId) ?? results?.items[0]
  const page = referencePage?.page ?? reader?.source.passages[0]?.page ?? 0
  const readerVersion = referencePage?.version ?? reader?.source.source_version_id ?? ''
  useEffect(() => {
    if (reader && window.matchMedia('(max-width: 780px)').matches) shownEvidence.current?.scrollIntoView({ block: 'nearest' })
  }, [reader])

  function chooseFiles(paper?: string) { setImports({ files: [], paper }) }

  function drop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    const files = Array.from(event.dataTransfer.files)
    if (!workspace.demo && files.length) setImports({ files })
  }

  async function open(anchor: string) {
    setReferencePage(undefined)
    const sequence = ++request.current
    setReaderPending(true)
    try {
      const evidence = await workspace.api.call('evidence.open', { ...scope, anchor_id: anchor })
      if (sequence === request.current) {
        if (evidence.region) {
          setReader(undefined)
          setReferencePage({ version: evidence.source.source_version_id, ...evidence.region })
        } else setReader(evidence)
      }
    } catch (error) {
      if (sequence === request.current) workspace.report(error)
    } finally {
      if (sequence === request.current) setReaderPending(false)
    }
  }

  function openPage(version: string, next: number, rect?: Rect) {
    request.current++
    setReaderPending(false)
    setReader(undefined)
    setReferencePage({ version, page: next, rect })
  }

  function anchors(ids: string[], label = 'Source') {
    return ids.map((id, index) => <button key={id} className="link-btn" onClick={() => void open(id)}>
      {tr(label)}{ids.length > 1 ? ' ' + (index + 1) : ''}
    </button>)
  }

  function compare(relation: PaperRelation) {
    const ids = [relation.from, relation.to]
    setChoices(Object.fromEntries(papers.map((paper) => [paper.paper_id,
      paper.source_versions.find((version) => ids.includes(version.source_version_id))?.source_version_id,
    ])))
    setQuestion('Compare ' + (names[relation.from] ?? 'the first paper') + ' and ' +
      (names[relation.to] ?? 'the second paper') + ' on ' + relation.subject +
      '. Check their tasks, datasets, splits, metrics and settings before comparing results.')
    setView('outline')
    document.getElementById('synthesis-question')?.focus()
  }

  async function exportPoints() {
    if (!outline) return
    const item_ids = checked.filter((id) => outline.points.some((point) => point.id === id))
    if (!item_ids.length) return
    try {
      const response = await workspace.write('export.create', {
        ...scope, format: 'evidence', include_originals: false, record_id: outline.record_id, item_ids,
      })
      setExported(response.files ?? [])
      setReview(false)
    } catch (error) { workspace.report(error) }
  }

  async function save() {
    if (!outline || !wiki) return
    try {
      await workspace.write('synthesis.review', {
        ...scope, record_id: outline.record_id, base_revision: wiki.revision, item_ids: checked,
      })
      setReview(false)
      setChecked([])
      setView('wiki')
    } catch (error) { workspace.report(error) }
  }

  return (
    <section className="synthesis-workbench" aria-label={tr('Literature synthesis')}>
      <div className="synthesis-main">
        {initialView === 'outline' && <h2>{tr('Literature synthesis')}</h2>}
        {!workspace.demo && <div className="lib-tools">
          <button className="ghost-btn" disabled={!versions.length} onClick={() => findFigure(true)}>{tr('Find a figure')}</button>
        </div>}
        {selection && <form className="synthesis-question pt-selection-question" onSubmit={(event) => {
          event.preventDefault()
          void workspace.prepare({ ...scope, kind: 'reader_question', input: { question: selectionQuestion.trim(),
            page: selection.page, source_version_id: selection.version, rect: selection.rect,
            rects: selection.rects, medium: selection.medium } })
        }}>
          <button className="link-btn" type="button" onClick={() => openPage(selection.version, selection.page, selection.rect)}>
            {names[selection.version]} · {tr('PDF page {0}', selection.page)}
          </button>
          {selection.quote && <blockquote className="evidence-excerpt">{selection.quote}</blockquote>}
          <label htmlFor="pt-selection-question">{tr('Ask about this selection')}</label>
          <textarea id="pt-selection-question" value={selectionQuestion} maxLength={2000}
            onChange={(e) => setSelectionQuestion(e.target.value)} required />
          <div className="lib-tools">
            <button className="primary" disabled={workspace.busy || !selectionQuestion.trim() || (selection.medium === 'image' && !visual?.vision)}>{tr('Ask AI')}</button>
            <button type="button" className="link-btn" onClick={() => setSelection(undefined)}>{tr('Cancel')}</button>
          </div>
          {selection.medium === 'image' && !visual?.vision && <p className="fine">{tr('Configure a local vision model to ask about images.')}</p>}
        </form>}
        {answers.slice(0, 8).map((answer) => <article className="synthesis-item pt-reader-answer" key={answer.id}>
          <h4>{answer.question}</h4>
          <p>{answer.answer}</p>
          <button className="link-btn" onClick={() => openPage(answer.source_version_id, answer.page, answer.rect)}>
            {names[answer.source_version_id]} · {tr('PDF page {0}', answer.page)}
          </button>
          <button className="link-btn" disabled={workspace.busy}
            onClick={() => void workspace.write('reader.answer_save', { ...scope, answer_id: answer.id }).then(() => setView('wiki')).catch(workspace.report)}>
            {tr('Save answer to Topic Wiki')}
          </button>
        </article>)}
        {view === 'outline' && <form className="synthesis-question" onSubmit={(event) => {
          event.preventDefault()
          setResultId('')
          setChecked([])
          setView('outline')
          void workspace.prepare({ ...scope, kind: 'literature_synthesis', input: {
            question: question.trim(), source_versions: versions,
          } })
        }}>
          <label htmlFor="synthesis-question">{tr('Research question')}</label>
          <textarea id="synthesis-question" value={question} maxLength={2000}
            onChange={(event) => setQuestion(event.currentTarget.value)}
            placeholder={tr('What would you like to explain in your related work?')} required />
          <button className="primary" disabled={workspace.busy || Boolean(imports) || versions.length < 2 ||
            versions.length > 12 || !question.trim()}>{tr('Build outline')}</button>
        </form>}
        {results?.active_task_id && <p role="status">{tr('Researching the selected papers…')}</p>}
        <nav className="synthesis-views" aria-label={tr('Research results')}>
          <button className="ghost-btn" aria-pressed={view === 'outline'} onClick={() => setView('outline')}>{tr('Outline')}</button>
          <button className="ghost-btn" aria-pressed={view === 'wiki'} onClick={() => setView('wiki')}>{tr('Topic Wiki')}</button>
        </nav>
        {view === 'outline' && outline && <>
          {results && results.items.length > 1 && <label className="synthesis-history">{tr('Previous outlines')}
            <select value={outline.record_id} onChange={(event) => { setResultId(event.currentTarget.value); setChecked([]) }}>
              {results.items.map((item) => <option key={item.record_id} value={item.record_id}>{item.question}</option>)}
            </select>
          </label>}
          <h3>{outline.question}</h3>
          {outline.points.map((point) => <article key={point.id} className="synthesis-item">
            <h4>{point.title}</h4>
            {outline.stale_item_ids?.includes(point.id) && <p className="synthesis-open">{tr('Evidence needs review')}</p>}
            {point.claims.map((claim, i) => <div key={i} className="synthesis-claim">
              <p>{claim.text}</p>
              {claim.assessment !== 'supported' && <strong className="synthesis-open">{tr(assessmentLabel[claim.assessment])}</strong>}
              {claim.conditions && <p className="fine">{claim.conditions}</p>}
              {claim.contributions.map((contribution, j) => <div key={j} className="synthesis-contribution">
                <p><strong>{names[contribution.source_version_id] ?? tr('Paper')}</strong> · {contribution.role}</p>
                {contribution.reported_from && <p className="fine">{tr('Reports a result from {0}', names[contribution.reported_from])}
                  {anchors(contribution.attribution_anchor_ids ?? [], 'Citation context')}</p>}
                {contribution.assessment !== 'supported' && <small>{tr(assessmentLabel[contribution.assessment])} · </small>}
                {anchors(contribution.anchor_ids)}
              </div>)}
              {claim.gap && <p className="fine">{claim.gap}</p>}
            </div>)}
          </article>)}
          {!!outline.relations.length && <details className="synthesis-item">
            <summary>{tr('Relationships between papers')}</summary>
            {outline.relations.map((relation) => <div key={relation.id} className="synthesis-claim">
              <p><strong>{names[relation.from] ?? tr('Paper')}</strong> → <strong>{names[relation.to] ?? tr('Paper')}</strong></p>
              <p>{tr(relationLabel[relation.kind] ?? relation.kind)} · {relation.subject}</p>
              {outline.stale_item_ids?.includes(relation.id) && <p className="synthesis-open">{tr('Evidence needs review')}</p>}
              {relation.status === 'proposed' && <p className="synthesis-open">{tr('Evidence still needed')}</p>}
              {relation.comparability === 'not_comparable' && <p className="synthesis-open">{tr('Results are not directly comparable')}</p>}
              {relation.conditions && <p className="fine">{relation.conditions}</p>}
              {Object.values(relation.alignment).some(Boolean) && <dl className="synthesis-alignment">
                {Object.entries(relation.alignment).filter(([, value]) => value).map(([axis, value]) =>
                  <div key={axis}><dt>{axis}</dt><dd>{value}</dd></div>)}
              </dl>}
              {relation.open_question && <p className="fine">{relation.open_question}</p>}
              {anchors(relation.anchor_ids)}
              <button className="link-btn" onClick={() => compare(relation)}>{tr('Focus on these two papers')}</button>
            </div>)}
          </details>}
          <details className="synthesis-item">
            <summary>{tr('Papers consulted')}</summary>
            <ul>{outline.reads.map((paper) => <li key={paper.source_version_id}>
              {paper.title} · {paper.passages_read ? tr('{0} passages read', paper.passages_read) : tr('Not consulted')}
            </li>)}</ul>
          </details>
          {!!outline.gaps.length && <details className="synthesis-item">
            <summary>{tr('Open questions and missing evidence')}</summary>
            <ul>{[...new Set(outline.gaps)].map((gap) => <li key={gap}>{gap}</li>)}</ul>
            {anchors(outline.read_anchor_ids, 'Read passage')}
          </details>}
          {wiki && !!(outline.points.length || outline.relations.length) && <button className="ghost-btn"
            onClick={() => { setChecked([]); setReview(true) }}>{tr('Review for Wiki')}</button>}
        </>}
        {view === 'wiki' && !!papers.length && <details className="synthesis-item">
          <summary>{tr('Paper cards')}</summary>
          {papers.map((paper) => <article key={paper.paper_id} className="synthesis-claim">
            <h4>{paper.title}</h4>
            <p className="fine">{tr(paper.source_versions[0].available_scope.replace('_', ' '))} · {tr(paper.source_versions.length === 1 ? '{0} saved version' : '{0} saved versions', paper.source_versions.length)}</p>
          </article>)}
        </details>}
        {view === 'wiki' && (wiki?.items.length ? wiki.items.map((item) => <article className="synthesis-item" key={item.id}>
          <h4>{entryTitle(item.entry)}</h4>
          {item.needs_review && <>
            <p className="synthesis-open">{tr('Evidence needs review')}</p>
            {!!item.changed_versions?.length && <p className="fine">
              {item.changed_versions.map((version) => names[version] ?? version).join(' · ')}
            </p>}
            <button className="link-btn" onClick={() => {
              setQuestion('Recheck this finding against the selected paper versions: ' + entryTitle(item.entry))
              setView('outline')
              window.requestAnimationFrame(() => document.getElementById('synthesis-question')?.focus())
            }}>{tr('Recheck finding')}</button>
          </>}
          {'claims' in item.entry && item.entry.claims.map((claim, i) => <p key={i}>{claim.text}</p>)}
          {anchors(item.anchor_ids)}
        </article>) : <p className="fine">{tr('Review and save findings from an outline to build this topic’s Wiki.')}</p>)}
      </div>

      <aside className="synthesis-reader" aria-label={tr('Papers and source evidence')}>
        <div className={dragging ? 'synthesis-papers drag-over' : 'synthesis-papers'}
          onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)} onDrop={drop}>
          <div className="synthesis-paper-heading">
            <h3>{tr('Papers')}</h3>
            <button className="ghost-btn" disabled={Boolean(imports)} onClick={() => chooseFiles()}>
              <Icon name="plus" size={14} /> {tr('Add PDFs')}
            </button>

          </div>
          {!papers.length && <p className="fine">{tr('Drop two or more papers from the same topic here.')}</p>}
          {papers.map((paper) => {
            const checkedVersion = versions.find((version) => paper.source_versions.some((v) => v.source_version_id === version))
            return <div key={paper.paper_id} className="synthesis-paper">
              <label><input type="checkbox" checked={!!checkedVersion}
                onChange={(event) => {
                  const selected = event.currentTarget.checked
                  setChoices((old) => ({ ...old, [paper.paper_id]: selected ? paper.source_versions[0].source_version_id : undefined }))
                }} /> <span>{paper.title}</span></label>
              {checkedVersion && paper.source_versions.length > 1 && <select aria-label={tr('Version of {0}', paper.title)} value={checkedVersion}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  setChoices((old) => ({ ...old, [paper.paper_id]: value }))
                }}>
                {paper.source_versions.map((v, index) => <option key={v.source_version_id} value={v.source_version_id}>
                  {index === 0 ? tr('Latest version') : tr('Version {0}', paper.source_versions.length - index)}
                </option>)}
              </select>}
              <button className="link-btn" disabled={Boolean(imports)} onClick={() => chooseFiles(paper.paper_id)}>{tr('Add version')}</button>
              <button className="link-btn" onClick={() => referencesFor(checkedVersion ?? paper.source_versions[0].source_version_id)}>
                {tr('Paper references')}
              </button>
              {!workspace.demo && pdfVersions.has(checkedVersion ?? paper.source_versions[0].source_version_id) && <button className="link-btn"
                onClick={() => openPage(checkedVersion ?? paper.source_versions[0].source_version_id, 1)}>{tr('Open PDF')}</button>}
              {paper.source_versions[0].available_scope === 'metadata' && <small>{tr('Text unavailable')}</small>}
            </div>
          })}
        </div>

        {readerPending && <p role="status">{tr('Opening source…')}</p>}
        {referencePage && <section className="synthesis-evidence">
          <h3>{names[referencePage.version]}</h3><p>{tr('PDF page {0}', page)}</p>
          {referencePage.quote && <blockquote className="evidence-excerpt">{referencePage.quote}</blockquote>}
        </section>}
        {reader && <section ref={shownEvidence} className="synthesis-evidence">
          <h3>{names[reader.source.source_version_id] ?? tr('Source')}</h3>
          {page > 0 && <p className="fine">{tr('PDF page {0}', page)}</p>}
          <blockquote className="evidence-excerpt">{reader.quote}</blockquote>
          {reader.source.passages[0] && <details>
            <summary>{tr('Passage text')}</summary>
            <p>{reader.source.passages[0].text}</p>
          </details>}
        </section>}
        {page > 0 && readerVersion && !workspace.demo && <Suspense fallback={<p role="status">{tr('Opening PDF…')}</p>}>
          <PdfReader key={readerVersion} topic={topicId} version={readerVersion} page={page} target={referencePage?.rect}
            onAsk={(picked) => { setSelection({ ...picked, version: readerVersion }); setSelectionQuestion(''); setTimeout(() =>
              document.getElementById('pt-selection-question')?.focus(), 0) }}
            onFind={() => findFigure(true)} onWiki={() => setView('wiki')} />
          {visual?.vision && <button className="link-btn" disabled={workspace.busy} onClick={() => void workspace.prepare({
            ...scope, kind: 'visual_index', input: { source_version_id: readerVersion },
          })}>{tr('Index figure descriptions')}</button>}
        </Suspense>}
      </aside>

      {imports && <PaperImportDialog topics={[]} initialTopic={topicId} initialFiles={imports.files}
        paperId={imports.paper} onClose={() => setImports(undefined)}
        onImported={(paper, version) => setChoices((prior) => ({ ...prior, [paper]: version }))} />}
      {figureDialog && <FigureSearch topic={topicId} versions={versions} names={names}
        onOpen={(figure) => openPage(figure.source_version_id, figure.page, figure.rect)}
        onAsk={(figure) => {
          openPage(figure.source_version_id, figure.page, figure.rect)
          setSelection({ page: figure.page, rect: figure.rect, rects: [figure.rect], version: figure.source_version_id,
            quote: figure.caption, medium: 'image' })
          setSelectionQuestion('')
        }} onClose={() => findFigure(false)} />}
      {referenceVersion && <Dialog title={tr('Paper references')} onClose={() => referencesFor('')}>
        <div className="lib-tools">
          <button className="ghost-btn" aria-pressed={direction === 'outgoing'} onClick={() => setDirection('outgoing')}>{tr('References')}</button>
          <button className="ghost-btn" aria-pressed={direction === 'incoming'} onClick={() => setDirection('incoming')}>{tr('Cited by')}</button>
          <button className="ghost-btn" onClick={workspace.refresh}>{tr('Refresh')}</button>
        </div>
        {!!refs?.pending_versions.length && <p>{tr('Reference indexing is pending.')}</p>}
        {refs && !refs.items.length && <p>{tr('No indexed references found.')}</p>}
        {refs?.items.map((ref) => <article key={ref.citing_version_id + ':' + ref.key} className="synthesis-item">
          <strong>{direction === 'incoming' ? ref.citing_title : ref.target_title ?? ref.title}</strong>
          <p className="fine">{ref.text}</p>
          {ref.target_version_id && pdfVersions.has(ref.target_version_id) && <button className="link-btn"
            onClick={() => {
              if (!ref.target_version_id) return
              setReader(undefined)
              setReferencePage({ version: ref.target_version_id, page: 1 })
              referencesFor('')
            }}>{tr('Open cited PDF')}</button>}
          {ref.mentions.length ? ref.mentions.map((m, i) =>
            <button className="link-btn" key={i} onClick={() => {
              setReader(undefined)
              setReferencePage({ version: ref.citing_version_id, page: m.page, quote: m.quote })
              referencesFor('')
            }}>{tr('PDF page {0}', m.page)}</button>) : <p>{tr('Reference entry only')}</p>}
          {ref.mentions.length > 0 && <details>
            <summary>{tr('Citation context')}</summary>
            {ref.mentions.map((mention, i) => <blockquote className="evidence-excerpt" key={i}>
              <small>{tr('PDF page {0}', mention.page)}</small>
              <p>{mention.quote}</p>
            </blockquote>)}
          </details>}
        </article>)}
      </Dialog>}
      {exported.length > 0 && <Dialog title={tr('Export evidence')} onClose={() => setExported([])}>
        {exported.map((file) => <p key={file.name}><button className="link-btn" onClick={() => downloadText(file)}>{file.name}</button></p>)}
      </Dialog>}
      {review && outline && <Dialog title={tr('Save findings to Topic Wiki')} onClose={() => setReview(false)}>
        {[...outline.points, ...outline.relations].map((item) => {
          const previous = wiki?.items.find((saved) => saved.id === item.prior_id)
          return <div className="synthesis-review-item" key={item.id}>
            <label><input type="checkbox" checked={checked.includes(item.id)} disabled={outline.stale_item_ids?.includes(item.id)} onChange={(event) => {
              const selected = event.currentTarget.checked
              setChecked((old) => selected ? [...old, item.id] : old.filter((id) => id !== item.id))
            }} /> {entryTitle(item)}</label>
            {previous && <details>
              <summary>{tr('Review changes')}</summary>
              <p>{tr('Previously')} · {entryTitle(previous.entry)}</p>
              {'claims' in previous.entry && previous.entry.claims.map((claim, i) => <p key={i}>{claim.text}</p>)}
              {'claims' in item && item.claims.map((claim, i) => <p key={i}><strong>{tr('Proposed')}</strong> · {claim.text}</p>)}
              {'conditions' in item && <p><strong>{tr('Proposed')}</strong> · {item.conditions || item.subject}</p>}
            </details>}
          </div>
        })}
        <div className="dialog-actions">
          <button className="ghost-btn" onClick={() => setReview(false)}>{tr('Cancel')}</button>
          <button className="ghost-btn" disabled={workspace.busy || !outline.points.some((p) => checked.includes(p.id))}
            onClick={() => void exportPoints()}>{tr('Export selected points')}</button>
          <button className="primary" disabled={!checked.length || workspace.busy} onClick={() => void save()}>{tr('Save selected findings')}</button>
        </div>
      </Dialog>}
    </section>
  )
}
