import { useState } from 'react'
import { useLanguage } from '../i18n'
import { pickPdfs, pdfInput, downloadText } from '../api/pdf'
import type { Decision } from '../api/citation'
import { useRead, useWorkspace } from '../data/WorkspaceProvider'
import { EvidenceLink } from './Notes'

const assessment = {
  supported: 'Supported', partial: 'Partially supported', conflict: 'Conflicting evidence',
  blocked: 'Could not check', evidence_not_established: 'Evidence not established',
}

export function PdfAudit({ topic }: { topic: string }) {
  const { tr } = useLanguage()
  const workspace = useWorkspace()
  const scope = { topic_id: topic }
  const items = useRead('draft.list', scope)?.items ?? []
  const papers = useRead('library.list', scope)?.items ?? []
  const [active, setActive] = useState('')
  const [versionId, selectVersion] = useState('')
  const [reportId, selectReport] = useState('')
  const [selected, select] = useState<string[]>([])
  const [page, setPage] = useState(0)
  const [saved, setSaved] = useState<string[]>([])
  const [exported, setExported] = useState<{ name: string; text: string }[]>([])
  const doc = items.find((item) => item.draft_id === active) ?? items[0]
  const version = doc?.versions.find((item) => item.version_id === versionId) ?? doc?.versions[0]
  const report = version?.reports.find((item) => item.report_id === reportId) ?? version?.reports[0]
  const target = { ...scope, draft_id: doc?.draft_id ?? '', version_id: version?.version_id ?? '' }
  const image = useRead('draft.page', { ...target, page }, Boolean(page && version))
  const bibliography = version?.references ?? []
  const exportIds = report?.findings.filter((finding) => finding.decision === 'accept' && !finding.needs_review)
    .map((finding) => finding.finding_id) ?? []

  function reset() { selectVersion(''); selectReport(''); select([]); setPage(0); setExported([]) }

  async function importPdf(newVersion = false) {
    try {
      const [file] = await pickPdfs(false)
      if (!file) return
      const input = await pdfInput(file)
      if (!('content' in input)) return
      const result = await workspace.write('draft.import', {
        ...scope, ...input, draft_id: newVersion ? doc?.draft_id : undefined,
      })
      setActive(result.draft_id)
      reset()
    } catch (error) { workspace.report(error) }
  }

  async function review(finding_id: string, decision: Decision) {
    if (!report) return
    try { await workspace.write('audit.review', { ...target, report_id: report.report_id, finding_id, decision }); setExported([]) }
    catch (error) { workspace.report(error) }
  }

  async function exportEvidence(download?: string) {
    if (!report || !exportIds.length) return
    try {
      const result = await workspace.write('export.create', {
        ...target, format: 'evidence', include_originals: false, report_id: report.report_id,
        item_ids: exportIds,
      })
      if (download) {
        const file = result.files?.find((item) => item.name === download)
        if (file) downloadText(file)
      } else setExported(result.files ?? [])
    } catch (error) { workspace.report(error) }
  }

  function run() {
    if (!version || !selected.length) return
    const keys = new Set(version.sentences.filter((sentence) => selected.includes(sentence.id)).flatMap((sentence) => sentence.cites))
    const source_versions = [...new Set(bibliography.flatMap((ref) => ref.target_version_id && keys.has(ref.key) ? [ref.target_version_id] : []))]
    selectReport('')
    void workspace.prepare({ ...scope, kind: 'citation_audit', input: {
      draft_id: target.draft_id, version_id: target.version_id, sentence_ids: selected, source_versions,
    } })
  }

  return <div className="synthesis-workbench">
    <section className="synthesis-main">
      <div className="lib-tools">
        <button className="primary" disabled={workspace.busy} onClick={() => void importPdf()}>{tr('Add PDF manuscript')}</button>
        {doc && <button className="ghost-btn" disabled={workspace.busy} onClick={() => void importPdf(true)}>{tr('Add version')}</button>}
      </div>
      {doc && version && <>
        <div className="lib-tools">
          <select aria-label={tr('Manuscript')} value={doc.draft_id} onChange={(event) => { setActive(event.currentTarget.value); reset() }}>
            {items.map((item) => <option key={item.draft_id} value={item.draft_id}>{item.name}</option>)}
          </select>
          {doc.versions.length > 1 && <select aria-label={tr('Version')} value={version.version_id} onChange={(event) => {
            reset(); selectVersion(event.currentTarget.value)
          }}>{doc.versions.map((item, i) => <option value={item.version_id} key={item.version_id}>
            {tr('Version {0}', doc.versions.length - i)}
          </option>)}</select>}
        </div>
        {version.warnings.map((warning) => <p className="fine" key={warning}>{tr(warning)}</p>)}
        <details open className="synthesis-item">
          <summary>{tr('Citation mapping')}</summary>
          {bibliography.map((ref) => <div className="synthesis-claim" key={ref.key}>
            <p>{ref.title || ref.text}</p>
            {ref.status === 'ambiguous' && <p className="fine">{tr('More than one source matches.')}</p>}
            <label>{tr('Source paper')}{' '}
              <select value={papers.find((paper) => paper.source_versions.some((v) => v.source_version_id === ref.target_version_id))?.paper_id ?? ''}
                disabled={workspace.busy} onChange={(event) => {
                  setExported([])
                  void workspace.write('draft.resolve_reference', { ...target, ref_key: ref.key,
                    paper_id: event.currentTarget.value || null }).catch(workspace.report)
                }}>
                <option value="">{tr('Unresolved')}</option>
                {papers.map((paper) => <option key={paper.paper_id} value={paper.paper_id}>{paper.title}</option>)}
              </select>
            </label>
          </div>)}
        </details>
        {!!version.sentences.length && <div className="synthesis-item">
          <h3>{tr('Select sentences to check')}</h3>
          {version.sentences.map((sentence) => <div className="synthesis-claim" key={sentence.id}>
            <label><input type="checkbox" checked={selected.includes(sentence.id)} onChange={() => select((old) =>
              old.includes(sentence.id) ? old.filter((id) => id !== sentence.id) : old.length < 12 ? [...old, sentence.id] : old)} /> {sentence.text}</label>
            {sentence.page && <button className="link-btn" onClick={() => setPage(sentence.page ?? 0)}>
              {tr('PDF page {0}', sentence.page)}
            </button>}
            {version.stale_sentence_ids?.includes(sentence.id) && <p className="fine">{tr('Evidence needs review')}</p>}
          </div>)}
          <button className="primary" disabled={workspace.busy || !selected.length} onClick={run}>{tr('Check citations')}</button>
        </div>}
      </>}
      {report && version && <section className="synthesis-item">
        <h3>{tr('Citation check')}</h3>
        {!report.complete && <p className="fine">{tr('Part of this audit could not be completed.')}</p>}
        {version.reports.length > 1 && <select aria-label={tr('Audit report')} value={report.report_id}
          onChange={(event) => { selectReport(event.currentTarget.value); setExported([]) }}>
          {version.reports.map((item, i) => <option value={item.report_id} key={item.report_id}>{tr('Audit {0}', version.reports.length - i)}</option>)}
        </select>}
        {report.findings.map((finding) => <article className="synthesis-item" key={finding.finding_id}>
          <p>{version.sentences.find((item) => item.id === finding.sentence_id)?.text}</p>
          {finding.needs_review && <p className="fine">{tr('Evidence needs review')}</p>}
          {finding.claims.map((claim, i) => <div key={i}>
            <strong>{tr(assessment[claim.status])}</strong>
            <p>{claim.limit}</p>
            {claim.anchor_ids.map((id) => <EvidenceLink id={id} key={id} />)}
          </div>)}
          <div className="lib-tools">
            {!finding.needs_review && finding.decision === 'accept' && finding.claims.some((claim) => claim.anchor_ids.length) &&
              <button className="ghost-btn" disabled={workspace.busy || saved.includes(finding.finding_id)}
                onClick={() => void workspace.write('audit.save_to_wiki', { ...target, report_id: report.report_id,
                  finding_id: finding.finding_id }).then(() => setSaved((old) => [...old, finding.finding_id])).catch(workspace.report)}>
                {tr(saved.includes(finding.finding_id) ? 'Saved to Topic Wiki' : 'Save finding to Topic Wiki')}
              </button>}
            {(['accept', 'reject', 'defer'] as const).map((decision) => <button key={decision} className="ghost-btn"
              disabled={workspace.busy || (finding.needs_review && decision === 'accept')}
              aria-pressed={finding.decision === decision} onClick={() => void review(finding.finding_id, decision)}>
              {tr({ accept: 'Accept', reject: 'Reject', defer: 'Defer' }[decision])}
            </button>)}
          </div>
        </article>)}
        <button className="ghost-btn" disabled={workspace.busy || !exportIds.length}
          onClick={() => void exportEvidence()}>{tr('Export accepted findings')}</button>
        {exportIds.length > 0 && exported.map((file) => <button className="link-btn" key={file.name}
          disabled={workspace.busy} onClick={() => void exportEvidence(file.name)}>{file.name}</button>)}
      </section>}
    </section>
    <aside className="synthesis-reader" aria-label={tr('Manuscript')}>
      {image && <div className="synthesis-evidence">
        <h3>{tr('PDF page {0}', image.page)}</h3>
        <img src={'data:image/png;base64,' + image.png} alt={tr('Original PDF page {0}', image.page)} />
      </div>}
    </aside>
  </div>
}
