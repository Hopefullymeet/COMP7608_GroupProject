import { useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { isTauri } from '../api/desktop'
import type { Located } from '../api/library'
import type { Assessment, OutlinePoint, PaperRelation } from '../api/synthesis'
import { Dialog } from '../components/PageHead'
import { Icon } from '../components/Icon'
import { useRead, useWorkspace } from '../data/WorkspaceProvider'
import { useStore } from '../data/store'
import { PageHead } from '../components/PageHead'

const assessmentLabel: Record<Assessment, string> = {
  supported: 'Supported', partial: 'Partially supported', conflicting: 'Conflicting evidence', missing: 'Evidence missing',
}
const relationLabel: Record<string, string> = {
  background: 'Background citation', uses_method: 'Uses a method', uses_data: 'Uses data',
  uses_benchmark: 'Uses a benchmark', extends: 'Extends', compares: 'Comparison', complements: 'Complementary',
  agrees: 'Agreement', conflicts: 'Conflict',
}
const pdfLimit = 16 * 1024 * 1024

function fileContent(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = () => reject(new Error('Could not read ' + file.name))
    reader.readAsDataURL(file)
  })
}

function entryTitle(entry: OutlinePoint | PaperRelation) {
  return 'title' in entry ? entry.title : entry.subject
}

export function TopicWikiPage() {
  const { state, act } = useStore()
  const [selected, select] = useState('')
  const topic = selected || state.topics[0]?.id
  return <div className="page">
    <PageHead title="Evidence Wiki" sub="" icon="book">
      {topic && <button className="icon-btn synthesis-mobile-back" aria-label="Open topic"
        onClick={() => act.openTopic(topic, 'synthesis')}><Icon name="arrowLeft" size={16} /></button>}
      {topic && <select className="lib-select" aria-label="Research topic" value={topic}
        onChange={(event) => select(event.currentTarget.value)}>
        {state.topics.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select>}
    </PageHead>
    {topic ? <LiteratureWorkbench key={topic} topicId={topic} initialView="wiki" /> :
      <p className="page-body">Create a topic to start its Wiki.</p>}
  </div>
}

export function LiteratureWorkbench({ topicId, initialView = 'outline' }: {
  topicId: string; initialView?: 'outline' | 'wiki'
}) {
  const scope = { topic_id: topicId }
  const workspace = useWorkspace()
  const library = useRead('library.list', scope)
  const results = useRead('synthesis.list', scope)
  const wiki = useRead('synthesis.wiki', scope)
  const [question, setQuestion] = useState('')
  const [choices, setChoices] = useState<Record<string, string | undefined>>({})
  const [resultId, setResultId] = useState('')
  const [checked, setChecked] = useState<string[]>([])
  const [view, setView] = useState<'outline' | 'wiki'>(initialView)
  const [review, setReview] = useState(false)
  const [reader, setReader] = useState<Located>()
  const [readerPending, setReaderPending] = useState(false)
  const replace = useRef<string>()
  const [dragging, setDragging] = useState(false)
  const [imports, setImports] = useState(0)
  const [notice, setNotice] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const request = useRef(0)
  const shownEvidence = useRef<HTMLElement>(null)
  const papers = library?.items ?? []
  const versions = papers.flatMap((paper) => {
    const selected = Object.hasOwn(choices, paper.paper_id) ? choices[paper.paper_id] : paper.source_versions[0].source_version_id
    return selected ? [selected] : []
  })
  const names = Object.fromEntries(papers.flatMap((p) => p.source_versions.map((v) => [v.source_version_id, p.title])))
  const outline = results?.items.find((item) => item.record_id === resultId) ?? results?.items[0]
  const page = reader?.source.passages[0]?.page ?? 0
  const pdf = useRead('source.page', { ...scope, source_version_id: reader?.source.source_version_id ?? '', page }, page > 0)
  const current = useRef({ workspace, topicId })
  current.current = { workspace, topicId }

  async function importFiles(files: (File | string)[], paperId?: string) {
    if (!files.length) return
    setImports((count) => count + 1)
    setNotice('')
    const failures: string[] = []
    try {
      for (const file of files) {
        const data = current.current
        try {
          if (typeof file !== 'string' && file.size > pdfLimit) throw new Error(file.name + ' exceeds 16 MB.')
          const upload = typeof file === 'string' ? { path: file } : { name: file.name, content: await fileContent(file) }
          const imported = await data.workspace.write('library.import_pdf', {
            topic_id: data.topicId, paper_id: paperId, ...upload,
          })
          if (!imported.duplicate) {
            setChoices((prior) => ({ ...prior, [imported.paper_id]: imported.source_version_id }))
          }
        } catch (error) {
          failures.push(error instanceof Error ? error.message : 'Import failed.')
        }
      }
      if (failures.length) setNotice(failures.join(' '))
    } finally {
      setImports((count) => count - 1)
      replace.current = undefined
    }
  }

  useEffect(() => {
    if (!isTauri()) return
    let current = true
    const stop = getCurrentWebview().onDragDropEvent((event) => {
      if (!current) return
      setDragging(event.payload.type === 'enter' || event.payload.type === 'over')
      if (event.payload.type === 'drop') void importFiles(event.payload.paths)
    })
    void stop.catch(workspace.report)
    return () => { current = false; void stop.then((unlisten) => unlisten()).catch(() => {}) }
  }, [workspace.report, topicId])

  useEffect(() => {
    if (reader && window.matchMedia('(max-width: 780px)').matches) shownEvidence.current?.scrollIntoView({ block: 'nearest' })
  }, [reader])

  function chooseFiles(paperId?: string) {
    if (!picker.current) return
    replace.current = paperId
    picker.current.multiple = !paperId
    picker.current.click()
  }

  function drop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    void importFiles(Array.from(event.dataTransfer.files))
  }

  async function open(anchor: string) {
    const sequence = ++request.current
    setReaderPending(true)
    try {
      const evidence = await workspace.api.call('evidence.open', { ...scope, anchor_id: anchor })
      if (sequence === request.current) setReader(evidence)
    } catch (error) {
      if (sequence === request.current) workspace.report(error)
    } finally {
      if (sequence === request.current) setReaderPending(false)
    }
  }

  function anchors(ids: string[], label = 'Source') {
    return ids.map((id, index) => <button key={id} className="link-btn" onClick={() => void open(id)}>
      {label}{ids.length > 1 ? ' ' + (index + 1) : ''}
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
    <section className="synthesis-workbench" aria-label="Literature synthesis">
      <div className="synthesis-main">
        {initialView === 'outline' && <h2>Literature synthesis</h2>}
        {view === 'outline' && <form className="synthesis-question" onSubmit={(event) => {
          event.preventDefault()
          setResultId('')
          setChecked([])
          setView('outline')
          void workspace.prepare({ ...scope, kind: 'literature_synthesis', input: {
            question: question.trim(), source_versions: versions,
          } })
        }}>
          <label htmlFor="synthesis-question">Research question</label>
          <textarea id="synthesis-question" value={question} maxLength={2000}
            onChange={(event) => setQuestion(event.currentTarget.value)}
            placeholder="What would you like to explain in your related work?" required />
          <button className="primary" disabled={workspace.busy || imports > 0 || versions.length < 2 ||
            versions.length > 12 || !question.trim()}>Build outline</button>
        </form>}
        {results?.active_task_id && <p role="status">Researching the selected papers…</p>}
        <nav className="synthesis-views" aria-label="Research results">
          <button className="ghost-btn" aria-pressed={view === 'outline'} onClick={() => setView('outline')}>Outline</button>
          <button className="ghost-btn" aria-pressed={view === 'wiki'} onClick={() => setView('wiki')}>Topic Wiki</button>
        </nav>
        {view === 'outline' && outline && <>
          {results && results.items.length > 1 && <label className="synthesis-history">Previous outlines
            <select value={outline.record_id} onChange={(event) => { setResultId(event.currentTarget.value); setChecked([]) }}>
              {results.items.map((item) => <option key={item.record_id} value={item.record_id}>{item.question}</option>)}
            </select>
          </label>}
          <h3>{outline.question}</h3>
          {outline.points.map((point) => <article key={point.id} className="synthesis-item">
            <h4>{point.title}</h4>
            {point.claims.map((claim, i) => <div key={i} className="synthesis-claim">
              <p>{claim.text}</p>
              {claim.assessment !== 'supported' && <strong className="synthesis-open">{assessmentLabel[claim.assessment]}</strong>}
              {claim.conditions && <p className="fine">{claim.conditions}</p>}
              {claim.contributions.map((contribution, j) => <div key={j} className="synthesis-contribution">
                <p><strong>{names[contribution.source_version_id] ?? 'Paper'}</strong> · {contribution.role}</p>
                {contribution.reported_from && <p className="fine">Reports a result from {names[contribution.reported_from]}
                  {anchors(contribution.attribution_anchor_ids ?? [], 'Citation context')}</p>}
                {contribution.assessment !== 'supported' && <small>{assessmentLabel[contribution.assessment]} · </small>}
                {anchors(contribution.anchor_ids)}
              </div>)}
              {claim.gap && <p className="fine">{claim.gap}</p>}
            </div>)}
          </article>)}
          {!!outline.relations.length && <details className="synthesis-item">
            <summary>Relationships between papers</summary>
            {outline.relations.map((relation) => <div key={relation.id} className="synthesis-claim">
              <p><strong>{names[relation.from] ?? 'Paper'}</strong> → <strong>{names[relation.to] ?? 'Paper'}</strong></p>
              <p>{relationLabel[relation.kind]} · {relation.subject}</p>
              {relation.status === 'proposed' && <p className="synthesis-open">Evidence still needed</p>}
              {relation.comparability === 'not_comparable' && <p className="synthesis-open">Results are not directly comparable</p>}
              {relation.conditions && <p className="fine">{relation.conditions}</p>}
              {Object.values(relation.alignment).some(Boolean) && <dl className="synthesis-alignment">
                {Object.entries(relation.alignment).filter(([, value]) => value).map(([axis, value]) =>
                  <div key={axis}><dt>{axis}</dt><dd>{value}</dd></div>)}
              </dl>}
              {relation.open_question && <p className="fine">{relation.open_question}</p>}
              {anchors(relation.anchor_ids)}
              <button className="link-btn" onClick={() => compare(relation)}>Focus on these two papers</button>
            </div>)}
          </details>}
          <details className="synthesis-item">
            <summary>Papers consulted</summary>
            <ul>{outline.reads.map((paper) => <li key={paper.source_version_id}>
              {paper.title} · {paper.passages_read ? paper.passages_read + ' passages read' : 'Not consulted'}
            </li>)}</ul>
          </details>
          {!!outline.gaps.length && <details className="synthesis-item">
            <summary>Open questions and missing evidence</summary>
            <ul>{[...new Set(outline.gaps)].map((gap) => <li key={gap}>{gap}</li>)}</ul>
            {anchors(outline.read_anchor_ids, 'Read passage')}
          </details>}
          {wiki && !!(outline.points.length || outline.relations.length) && <button className="ghost-btn"
            onClick={() => { setChecked([]); setReview(true) }}>Review for Wiki</button>}
        </>}
        {view === 'wiki' && !!papers.length && <details className="synthesis-item">
          <summary>Paper cards</summary>
          {papers.map((paper) => <article key={paper.paper_id} className="synthesis-claim">
            <h4>{paper.title}</h4>
            <p className="fine">{paper.source_versions[0].available_scope.replace('_', ' ')} · {paper.source_versions.length} saved version{paper.source_versions.length > 1 ? 's' : ''}</p>
          </article>)}
        </details>}
        {view === 'wiki' && (wiki?.items.length ? wiki.items.map((item) => <article className="synthesis-item" key={item.id}>
          <h4>{entryTitle(item.entry)}</h4>
          {item.needs_review && <>
            <p className="synthesis-open">New paper version · review the evidence</p>
            <button className="link-btn" onClick={() => {
              setQuestion('Recheck this finding against the selected paper versions: ' + entryTitle(item.entry))
              setView('outline')
              window.requestAnimationFrame(() => document.getElementById('synthesis-question')?.focus())
            }}>Recheck finding</button>
          </>}
          {'claims' in item.entry && item.entry.claims.map((claim, i) => <p key={i}>{claim.text}</p>)}
          {anchors(item.anchor_ids)}
        </article>) : <p className="fine">Review and save findings from an outline to build this topic’s Wiki.</p>)}
      </div>

      <aside className="synthesis-reader" aria-label="Papers and source evidence">
        <div className={dragging ? 'synthesis-papers drag-over' : 'synthesis-papers'}
          onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)} onDrop={drop}>
          <div className="synthesis-paper-heading">
            <h3>Papers</h3>
            <button className="ghost-btn" disabled={imports > 0} onClick={() => chooseFiles()}>
              <Icon name="plus" size={14} /> Add PDFs
            </button>
            <input ref={picker} hidden type="file" accept=".pdf,application/pdf" multiple
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? [])
                event.currentTarget.value = ''
                void importFiles(files, replace.current)
              }} />
          </div>
          {!papers.length && <p className="fine">Drop two or more papers from the same topic here.</p>}
          {papers.map((paper) => {
            const checkedVersion = versions.find((version) => paper.source_versions.some((v) => v.source_version_id === version))
            return <div key={paper.paper_id} className="synthesis-paper">
              <label><input type="checkbox" checked={!!checkedVersion}
                onChange={(event) => {
                  const selected = event.currentTarget.checked
                  setChoices((old) => ({ ...old, [paper.paper_id]: selected ? paper.source_versions[0].source_version_id : undefined }))
                }} /> <span>{paper.title}</span></label>
              {checkedVersion && paper.source_versions.length > 1 && <select aria-label={'Version of ' + paper.title} value={checkedVersion}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  setChoices((old) => ({ ...old, [paper.paper_id]: value }))
                }}>
                {paper.source_versions.map((v, index) => <option key={v.source_version_id} value={v.source_version_id}>
                  {index === 0 ? 'Latest version' : 'Version ' + (paper.source_versions.length - index)}
                </option>)}
              </select>}
              <button className="link-btn" disabled={imports > 0} onClick={() => chooseFiles(paper.paper_id)}>Add version</button>
              {paper.source_versions[0].available_scope === 'metadata' && <small>Text unavailable</small>}
            </div>
          })}
          {imports > 0 && <p role="status">Importing and indexing PDFs…</p>}
          {notice && <p role="alert">{notice}</p>}
        </div>

        {readerPending && <p role="status">Opening source…</p>}
        {reader && <section ref={shownEvidence} className="synthesis-evidence">
          <h3>{names[reader.source.source_version_id] ?? 'Source'}</h3>
          {page > 0 && <p className="fine">PDF page {page}</p>}
          <blockquote className="evidence-excerpt">{reader.quote}</blockquote>
          {pdf && <img src={'data:image/png;base64,' + pdf.png} alt={'Original PDF page ' + page} />}
          {reader.source.passages[0] && <details>
            <summary>Passage text</summary>
            <p>{reader.source.passages[0].text}</p>
          </details>}
        </section>}
      </aside>

      {review && outline && <Dialog title="Save findings to Topic Wiki" onClose={() => setReview(false)}>
        {[...outline.points, ...outline.relations].map((item) => {
          const previous = wiki?.items.find((saved) => saved.id === item.prior_id)
          return <div className="synthesis-review-item" key={item.id}>
            <label><input type="checkbox" checked={checked.includes(item.id)} onChange={(event) => {
              const selected = event.currentTarget.checked
              setChecked((old) => selected ? [...old, item.id] : old.filter((id) => id !== item.id))
            }} /> {entryTitle(item)}</label>
            {previous && <details>
              <summary>Review changes</summary>
              <p>Previously · {entryTitle(previous.entry)}</p>
              {'claims' in previous.entry && previous.entry.claims.map((claim, i) => <p key={i}>{claim.text}</p>)}
              {'claims' in item && item.claims.map((claim, i) => <p key={i}><strong>Proposed</strong> · {claim.text}</p>)}
              {'conditions' in item && <p><strong>Proposed</strong> · {item.conditions || item.subject}</p>}
            </details>}
          </div>
        })}
        <div className="dialog-actions">
          <button className="ghost-btn" onClick={() => setReview(false)}>Cancel</button>
          <button className="primary" disabled={!checked.length || workspace.busy} onClick={() => void save()}>Save selected findings</button>
        </div>
      </Dialog>}
    </section>
  )
}
