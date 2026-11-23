import { useState } from 'react'
import { useLanguage } from '../i18n'
import { pickPdfs, pdfInput, downloadText } from '../api/pdf'
import type { Decision, Report } from '../api/citation'
import type { Located } from '../api/library'
import { useRead, useWorkspace } from '../data/WorkspaceProvider'
import { useStore } from '../data/store'
import { EvidenceLink } from './Notes'

const originLabel = { original: 'Original study evidence', secondary: 'Reported from another study', unclear: 'Evidence origin unclear' }

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
  const { state } = useStore()
  const [active, setActive] = useState(state.route.view === 'check' ? state.route.draftId ?? '' : '')
  const [question, setQuestion] = useState('')
  const [versionId, selectVersion] = useState('')
  const [reportId, selectReport] = useState('')
  const [selected, select] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [saved, setSaved] = useState<string[]>([])
  const [exported, setExported] = useState<{ name: string; text: string }[]>([])
  const [kind, setKind] = useState<Report['kind']>('citation_audit')
  const [selectedPapers, selectPapers] = useState<string[]>([])
  const [source, setSource] = useState<Located>()
  const [limit, setLimit] = useState(40)
  const suggesting = kind === 'citation_suggest'
  const doc = items.find((item) => item.draft_id === active) ?? items[0]
  const version = doc?.versions.find((item) => item.version_id === versionId) ?? doc?.versions[0]
  const reports = version?.reports.filter((item) => item.kind === kind) ?? []
  const report = reports.find((item) => item.report_id === reportId) ?? reports[0]
  const prose = useRead('draft.prose', { ...scope, draft_id: doc?.draft_id ?? '', version_id: version?.version_id ?? '' },
    Boolean(suggesting && version && !version.uncited_sentences))
  const sentences = [...(version?.sentences ?? []), ...(suggesting ? (version?.uncited_sentences ?? prose?.sentences ?? []) : [])]
  const staleIds = suggesting ? version?.stale_suggestion_sentence_ids : version?.stale_sentence_ids
  const approved = papers.flatMap((paper) => selectedPapers.includes(paper.paper_id)
    && paper.source_versions[0].available_scope === 'full_text' ? [paper.source_versions[0].source_version_id] : [])
  const target = { ...scope, draft_id: doc?.draft_id ?? '', version_id: version?.version_id ?? '' }
  const image = useRead('draft.page', { ...target, page }, Boolean(!source && page && version))
  const sourcePage = source?.source.passages.find((p) => p.passage_id === source.passage_id)?.page
  const original = useRead('source.page', { topic_id: topic, source_version_id: source?.source.source_version_id ?? '',
    page: sourcePage ?? 0 }, Boolean(sourcePage))
  const bibliography = version?.references ?? []
  const exportIds = report?.findings.filter((finding) => finding.decision === 'accept' && !finding.needs_review)
    .map((finding) => finding.finding_id) ?? []
  const affected = sentences.filter((sentence) => staleIds?.includes(sentence.id))
  const orderedSentences = [...affected, ...sentences.filter((sentence) => !staleIds?.includes(sentence.id))]
  const recheckIds: string[] = []
  let citationCount = 0
  for (const sentence of affected) {
    const count = suggesting ? 0 : sentence.cites.length + (sentence.unresolved?.length ?? 0)
    if (recheckIds.length >= 12 || citationCount + count > 24) continue
    const candidate = [...recheckIds, sentence.id]
    if (!suggesting && assignedSources(candidate).length > 12) continue
    recheckIds.push(sentence.id)
    citationCount += count
  }

  function reset() { setQuestion(''); selectVersion(''); selectReport(''); select([]); setPage(1); setExported([]); setSource(undefined); setLimit(40) }

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
      setKind('citation_audit')
      const first = result.versions[0]
      if (first?.sentences.length && !first.reports.some(r => r.whole_document))
        await wholeAudit(result.draft_id, first)
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

  async function wholeAudit(draftId: string, snapshot: NonNullable<typeof version>, ask?: string) {
    const library = await workspace.api.call('library.list', scope)
    await workspace.prepare({ ...scope, kind: 'citation_audit', input: {
      draft_id: draftId, version_id: snapshot.version_id, whole_document: true,
      sentence_ids: snapshot.sentences.map(s => s.id),
      source_versions: library.items.flatMap(p => p.source_versions.slice(0, 1).map(v => v.source_version_id)),
      ...(ask && report ? { question: ask, report_id: report.report_id } : {}),
    } })
  }

  function assignedSources(ids: string[]) {
    const keys = new Set(version?.sentences.filter((sentence) => ids.includes(sentence.id)).flatMap((sentence) => sentence.cites))
    return [...new Set(bibliography.flatMap((ref) => ref.target_version_id && keys.has(ref.key) ? [ref.target_version_id] : []))]
  }

  function run(ids: string[]) {
    if (!version || !ids.length || (suggesting && !approved.length)) return
    selectReport('')
    setExported([])
    void workspace.prepare({ ...scope, kind, input: {
      draft_id: target.draft_id, version_id: target.version_id, sentence_ids: ids,
      source_versions: suggesting ? approved : assignedSources(ids),
    } })
  }

  return <div className="synthesis-workbench">
    <section className="synthesis-main" onDragOver={e => e.preventDefault()} onDrop={e => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (!workspace.busy && file?.name.toLowerCase().endsWith('.pdf')) void importPdf(false, undefined, file)
    }}>
      <div className="lib-tools">
        <button className="primary" disabled={workspace.busy} onClick={() => void importPdf()}>{tr('Add PDF manuscript')}</button>
        {papers.length > 0 && <select aria-label={tr('Select a library PDF')} value="" disabled={workspace.busy}
          onChange={e => { if (e.target.value) void importPdf(false, e.target.value) }}>
          <option value="">{tr('Select a library PDF')}</option>
          {papers.filter(p => p.source_versions[0]?.available_scope === 'full_text').map(p =>
            <option key={p.paper_id} value={p.source_versions[0].source_version_id}>{p.title}</option>)}
        </select>}
        {doc && <button className="ghost-btn" disabled={workspace.busy} onClick={() => void importPdf(true)}>{tr('Add version')}</button>}
      </div>
      {doc && version && <>
        <div className="lib-tools">
          <nav className="audit-manuscripts" aria-label={tr('Manuscript topics')}>
            {items.map(item => <button key={item.draft_id} className="ghost-btn"
              aria-current={doc.draft_id === item.draft_id ? 'page' : undefined} title={item.name}
              onClick={() => { setActive(item.draft_id); reset() }}>{item.name}</button>)}
          </nav>
          {doc.versions.length > 1 && <select aria-label={tr('Version')} value={version.version_id} onChange={(event) => {
            reset(); selectVersion(event.currentTarget.value)
          }}>{doc.versions.map((item, i) => <option value={item.version_id} key={item.version_id}>
            {tr('Version {0}', doc.versions.length - i)}
          </option>)}</select>}
        </div>
        <div className="lib-tools">
          {(['citation_audit', 'citation_suggest'] as const).map((mode) => <button key={mode} type="button"
            className="ghost-btn" aria-pressed={kind === mode} disabled={workspace.busy}
            onClick={() => { setKind(mode); select([]); selectReport(''); setSource(undefined); setExported([]) }}>
            {tr(mode === 'citation_audit' ? 'Citation check' : 'Citation suggestions')}
          </button>)}
        </div>
        {!suggesting && version.sentences.length > 0 && <button className="primary" disabled={workspace.busy}
          onClick={() => void wholeAudit(doc.draft_id, version).catch(workspace.report)}>{affected.length ? tr('Recheck affected sentences ({0})', affected.length) : tr('Check whole manuscript')}</button>}
        {!suggesting && version.warnings.map((warning) => <p className="fine" key={warning}>{tr(warning)}</p>)}
        {suggesting ? <details open className="synthesis-item">
          <summary>{tr('Papers to search')}</summary>
          {papers.filter((paper) => paper.source_versions[0].available_scope === 'full_text').map((paper) => <label
            className="synthesis-claim" key={paper.paper_id}>
            <input type="checkbox" checked={selectedPapers.includes(paper.paper_id)}
              onChange={() => selectPapers((old) => old.includes(paper.paper_id)
                ? old.filter((id) => id !== paper.paper_id) : old.length < 12 ? [...old, paper.paper_id] : old)} /> {paper.title}
          </label>)}
        </details> : <details className="synthesis-item">
          <summary>{tr('Citation mapping')}</summary>
          {bibliography.map((ref) => <div className="synthesis-claim" key={ref.key}>
            <p>{ref.title || ref.text}{ref.link && <a href={ref.link} target="_blank" rel="noreferrer"> ↗</a>}</p>
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
        </details>}
        {!!sentences.length && <details className="synthesis-item">
          <summary>{tr('Select sentences to check')}</summary>
          {recheckIds.length > 0 && <div className="lib-tools">
            <button className="primary" disabled={workspace.busy || (suggesting && !approved.length)}
              onClick={() => suggesting ? run(recheckIds) : void wholeAudit(doc.draft_id, version).catch(workspace.report)}>{tr('Recheck affected sentences ({0})', recheckIds.length)}</button>
            {affected.length > recheckIds.length && <small>{tr('{0} more sentences need review', affected.length - recheckIds.length)}</small>}
          </div>}
          {orderedSentences.slice(0, limit).map((sentence) => <div className="synthesis-claim" key={sentence.id}>
            <label><input type="checkbox" checked={selected.includes(sentence.id)} onChange={() => select((old) =>
              old.includes(sentence.id) ? old.filter((id) => id !== sentence.id) : old.length < 12 ? [...old, sentence.id] : old)} /> {sentence.text}</label>
            {sentence.page && <button className="link-btn" onClick={() => { setSource(undefined); setPage(sentence.page ?? 0) }}>
              {tr('PDF page {0}', sentence.page)}
            </button>}
            {staleIds?.includes(sentence.id) && <p className="fine">{tr('Evidence needs review')}</p>}
          </div>)}
          {orderedSentences.length > limit && <button className="link-btn" onClick={() => setLimit((n) => n + 40)}>
            {tr('Show more sentences')}
          </button>}
          <button className="primary" disabled={workspace.busy || !selected.length || (suggesting && !approved.length)}
            onClick={() => run(selected)}>{tr(suggesting ? 'Find citation suggestions' : 'Check citations')}</button>
        </details>}
      </>}
      {report && version && <section className="synthesis-item">
        <h3>{tr(suggesting ? 'Citation suggestions' : 'Citation check')}</h3>
        {!report.complete && <p className="fine">{tr('Part of this audit could not be completed.')}</p>}
        {reports.length > 1 && <select aria-label={tr('Audit report')} value={report.report_id}
          onChange={(event) => { selectReport(event.currentTarget.value); setExported([]) }}>
          {reports.map((item, i) => <option value={item.report_id} key={item.report_id}>{tr('Audit {0}', reports.length - i)}</option>)}
        </select>}
        {report.findings.map((finding) => <article className="synthesis-item" key={finding.finding_id}>
          {report.findings.find(f => f.sentence_id === finding.sentence_id) === finding && <>
            <h4>{sentences.find((item) => item.id === finding.sentence_id)?.text}</h4>
            {report.summaries?.[finding.sentence_id] && <p>{report.summaries[finding.sentence_id]}</p>}
          </>}
          <p className="fine">{bibliography.find(r => r.key === finding.ref_key)?.title}
            {' '}{sentences.find(s => s.id === finding.sentence_id)?.page && <button className="link-btn"
              onClick={() => { setSource(undefined); setPage(sentences.find(s => s.id === finding.sentence_id)?.page ?? 1) }}>
              {tr('Open manuscript page')}</button>}</p>
          {finding.chain?.[0]?.origin && <small>{tr(originLabel[finding.chain[0].origin])}</small>}
          {finding.chain?.slice(1).map((node, i) => <div className="synthesis-claim" key={i}>
            <small>{finding.chain?.[node.parent ?? 0]?.title} → </small><strong>{node.title}</strong>
            <p>{node.same_as != null ? tr('Same source in this chain') : tr(assessment[node.status])}</p>
            {node.limit && <p>{tr(node.limit)}</p>}
            {node.link && <a href={node.link} target="_blank" rel="noreferrer">{tr(node.link.startsWith('https://search.crossref.org/') ? 'Search for this paper' : 'Source link')}</a>}
            {node.anchor_ids.map(id => <EvidenceLink key={id} id={id} onOpen={setSource} />)}
          </div>)}
          {finding.needs_review && <p className="fine">{tr('Evidence needs review')}</p>}
          {finding.claims.map((claim, i) => <div key={i}>
            <strong>{tr(assessment[claim.status])}</strong>
            {suggesting && <p>{claim.text}</p>}
            <p>{tr(claim.limit)}</p>
            {claim.anchor_ids.map((id) => <EvidenceLink id={id} key={id} onOpen={setSource} />)}
          </div>)}
          <div className="lib-tools">
            {!finding.needs_review && finding.decision === 'accept' && finding.claims.some((claim) => claim.anchor_ids.length) &&
              <button className="ghost-btn" disabled={workspace.busy || saved.includes(finding.finding_id)}
                onClick={() => void workspace.write('audit.save_to_wiki', { ...target, report_id: report.report_id,
                  finding_id: finding.finding_id }).then(() => setSaved((old) => [...old, finding.finding_id])).catch(workspace.report)}>
                {tr(saved.includes(finding.finding_id) ? 'Saved to the Wiki' : 'Save finding to the Wiki')}
              </button>}
            {(['accept', 'reject', 'defer'] as const).map((decision) => <button key={decision} className="ghost-btn"
              disabled={workspace.busy || (decision === 'accept' && (finding.needs_review
                || (suggesting && !finding.claims.some((claim) => claim.anchor_ids.length))))}
              aria-pressed={finding.decision === decision} onClick={() => void review(finding.finding_id, decision)}>
              {tr({ accept: 'Accept', reject: 'Reject', defer: 'Defer' }[decision])}
            </button>)}
          </div>
        </article>)}
        {report.whole_document && doc && <section>
          <h3>{tr('Manuscript audit notebook')}</h3>
          {report.discussion?.map((turn,i) => <article key={i}><strong>{turn.question}</strong><p>{turn.text}</p>
            {turn.anchor_ids.map(id => <EvidenceLink id={id} key={id} onOpen={setSource}/>)}</article>)}
          <form onSubmit={event => { event.preventDefault(); if (question.trim())
            void wholeAudit(doc.draft_id, version, question.trim()).catch(workspace.report) }}>
            <input aria-label={tr('Ask about this audit')} placeholder={tr('Ask about this audit')}
              value={question} maxLength={2000} onChange={e => setQuestion(e.target.value)}/>
            <button className="ghost-btn" disabled={workspace.busy || !question.trim()}>{tr('Ask')}</button>
          </form></section>}
        <button className="ghost-btn" disabled={workspace.busy || !exportIds.length}
          onClick={() => void exportEvidence()}>{tr('Export accepted findings')}</button>
        {exportIds.length > 0 && exported.map((file) => <button className="link-btn" key={file.name}
          disabled={workspace.busy} onClick={() => void exportEvidence(file.name)}>{file.name}</button>)}
      </section>}
    </section>
    <aside className="synthesis-reader" aria-label={tr('Manuscript')}>
      {source && <div className="synthesis-evidence">
        <h3>{tr('Source evidence')}{sourcePage ? tr(' · p. {0}', sourcePage) : ''}</h3>
        <blockquote className="evidence-excerpt">{source.quote}</blockquote>
        {original && <img src={'data:image/png;base64,' + original.png} alt={tr('Original PDF page {0}', original.page)} />}
      </div>}
      {image && <div className="synthesis-evidence">
        <h3>{tr('PDF page {0}', image.page)}</h3>
        <img src={'data:image/png;base64,' + image.png} alt={tr('Original PDF page {0}', image.page)} />
      </div>}
    </aside>
  </div>
}
