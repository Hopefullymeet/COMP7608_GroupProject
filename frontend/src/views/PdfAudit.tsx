import { useState } from 'react'
import { useLanguage } from '../i18n'
import { pickPdfs, pdfInput } from '../api/pdf'
import type { AuditHistoryItem, CitationMark, Snapshot } from '../api/citation'
import { useRead, useWorkspace } from '../data/WorkspaceProvider'
import { useStore } from '../data/store'
import { ManuscriptReader } from './ManuscriptReader'
export function PdfAudit({ topic, initialReport }: { topic: string; initialReport?: AuditHistoryItem }) {
  const { tr, language } = useLanguage()
  const workspace = useWorkspace()
  const scope = { topic_id: topic }
  const items = useRead('draft.list', scope)?.items ?? []
  const papers = useRead('library.list', scope)?.items ?? []
  const { state } = useStore()
  const [active, setActive] = useState(initialReport?.draft_id ?? (state.route.view === 'check' && state.route.topicId === topic ? state.route.draftId ?? '' : ''))
  const [versionId, selectVersion] = useState(initialReport?.version_id ?? '')
  const [reportId, selectReport] = useState(initialReport?.report_id ?? '')
  const doc = items.find((item) => item.draft_id === active)
  const version = doc?.versions.find((item) => item.version_id === versionId) ?? doc?.versions[0]
  const reports = version?.reports.filter(r => r.kind === 'citation_audit') ?? []
  const report = reports.find(r => r.report_id === reportId) ?? reports.find(r => r.whole_document) ?? reports[0]
  function reset() { selectVersion(''); selectReport('') }

  async function importPdf(newVersion = false, sourceVersion?: string, dropped?: File) {
    try {
      const file = sourceVersion ? undefined : dropped ?? (await pickPdfs(false))[0]
      const input = sourceVersion ? { source_version_id: sourceVersion } : file ? await pdfInput(file) : undefined
      if (!input || !('content' in input || 'source_version_id' in input)) return
      const result = await workspace.write('draft.import', {
        ...scope, ...input, draft_id: newVersion ? doc?.draft_id : undefined,
      })
      setActive(result.draft_id)
      reset()
      const first = result.versions[0]
      if (first?.sentences.length && !first.reports.some(r => r.whole_document))
        await wholeAudit(result.draft_id, first, true)
    } catch (error) { workspace.report(error) }
  }

  async function wholeAudit(draftId: string, snapshot: Snapshot, automatic = false) {
    const library = await workspace.api.call('library.list', scope)
    await workspace.prepare({ ...scope, kind: 'citation_audit', input: {
      language, draft_id: draftId, version_id: snapshot.version_id, whole_document: true,
      sentence_ids: snapshot.sentences.map(s => s.id),
      source_versions: library.items.flatMap(p => p.source_versions.slice(0, 1).map(v => v.source_version_id)),
    } }, undefined, automatic)
  }

  if (!doc) return <section className="audit-chooser" onDragOver={e => e.preventDefault()} onDrop={e => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!workspace.busy && file?.name.toLowerCase().endsWith('.pdf')) void importPdf(false, undefined, file)
  }}>
    <h2>{tr('Choose your paper')}</h2>
    <p className="fine">{tr('Choosing a PDF starts a citation check using this topic’s papers and configured model.')}</p>
    <button className="primary" disabled={workspace.busy} onClick={() => void importPdf()}>{tr('Add PDF manuscript')}</button>
    <div className="audit-options">{papers.filter(p => p.source_versions[0]?.available_scope === 'full_text').map(p =>
      <button className="audit-option" key={p.paper_id} disabled={workspace.busy}
        onClick={() => void importPdf(false, p.source_versions[0].source_version_id)}>
        <span>{p.title}</span><span aria-hidden="true">›</span></button>)}</div>
    {items.length > 0 && <><h3>{tr('Previous manuscripts')}</h3>
      <div className="audit-options">{items.map(item => <button key={item.draft_id} className="audit-option"
        onClick={() => { reset(); setActive(item.draft_id) }}><span>{item.name}</span><span aria-hidden="true">›</span></button>)}</div></>}
  </section>
  if (!version) return null
  async function ask(question: string, mark?: CitationMark) {
    if (!doc || !version || !report) return
    await workspace.prepare({ ...scope, kind: 'citation_audit', input: {
      language, draft_id: doc.draft_id, version_id: version.version_id, whole_document: true,
      question, report_id: report.report_id,
      sentence_ids: mark ? [mark.sentence_id] : version.sentences.map(s => s.id),
      ...(mark && { reference_keys: mark.keys }),
      source_versions: papers.flatMap(p => p.source_versions.slice(0, 1).map(v => v.source_version_id)),
    } }, undefined, true)
  }
  return <ManuscriptReader key={version.version_id} topic={topic} draft={doc.draft_id}
    name={doc.name} version={version} report={report} busy={workspace.busy}
    onAsk={ask} onError={workspace.report}
    onLocalizedCheck={() => { selectReport(''); void wholeAudit(doc.draft_id, version).catch(workspace.report) }}
    onChoose={() => { reset(); setActive('') }}/>
}
