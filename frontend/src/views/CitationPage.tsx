import { useLanguage, type Message } from '../i18n'
import { useState } from 'react'
import { useStore } from '../data/store'
import { Dialog, HeaderActions, PageHead } from '../components/PageHead'
import { Icon } from '../components/Icon'
import { useRead, useWorkspace } from '../data/WorkspaceProvider'
import type { AuditHistoryItem, Decision, ExportFormat, Finding, Report } from '../api/citation'
import { EvidenceLink } from './Notes'
import { TopicChooser } from '../components/TopicChooser'
import { PdfAudit } from './PdfAudit'

function Manuscripts({ topic }: { topic: string }) {
  const { tr } = useLanguage()
  const { api, write, prepare, busy, report: err, demo } = useWorkspace()
  const items = useRead('draft.list', { topic_id: topic })?.items ?? []
  const papers = useRead('library.catalog', {})?.papers ?? []
  const { state } = useStore()
  const target = state.route.view === 'check' ? state.route : undefined
  const [docId, pickDoc] = useState(target?.draftId ?? ''),
    [version, pickVersion] = useState(''),
    [reportId, pickReport] = useState('')
  const [selected, setSelected] = useState<string[] | null>(target?.sentenceId ? [target.sentenceId] : null),
    [sources, setSources] = useState<string[] | null>(null),
    [extend, setExtend] = useState(false)
  const [creating, create] = useState(false),
    [name, setName] = useState('related-work.md'),
    [body, setBody] = useState('')
  const [preview, setPreview] = useState<Finding>(),
    [apply, setApply] = useState<'citation' | 'wording' | 'both'>('both')
  const [format, setFormat] = useState<ExportFormat>('audit_report'),
    [pdfs, include] = useState(false),
    [status, setStatus] = useState<Message>()
  const doc = items.find((d) => d.draft_id === docId) ?? items[0]
  const v = doc?.versions.find((v) => v.version_id === version) ?? doc?.versions[0]
  const report = v?.reports.find((r) => r.report_id === reportId) ?? v?.reports[0]
  const available = papers
    .filter((p) => extend || p.topic_ids.includes(topic))
    .flatMap((p) =>
      p.source_versions.map((v) => ({ id: v.source_version_id, title: p.title, scope: v.available_scope })),
    )
  const versions = (sources ?? available.map((x) => x.id)).filter((id) => available.some((x) => x.id === id))
  const sentences = v?.sentences.filter((s) => !selected || selected.includes(s.id)).map((s) => s.id) ?? []
  const original = v?.sentences.find((s) => s.id === preview?.sentence_id)
  function selectDoc(id: string) {
    pickDoc(id)
    pickVersion('')
    pickReport('')
    setSelected(null)
    setStatus(undefined)
  }
  const toggle = (ids: string[], id: string) =>
    ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
  async function pick() {
    const { files } = await api.call('file.pick', { purpose: 'draft' })
    if (!files[0]) return
    const d = await write('draft.import', { topic_id: topic, file_id: files[0].file_id })
    selectDoc(d.draft_id)
    create(false)
  }
  function task(kind: Report['kind']) {
    if (!doc || !v) return
    pickReport('')
    void prepare({
      kind,
      topic_id: topic,
      input: {
        draft_id: doc.draft_id,
        version_id: v.version_id,
        sentence_ids: sentences,
        source_versions: versions,
      },
    })
  }
  async function download() {
    const result = await write('export.create', {
      topic_id: topic,
      draft_id: doc?.draft_id,
      version_id: v?.version_id,
      report_id: report?.report_id,
      format,
      include_originals: pdfs,
    })
    if (result.text !== undefined && result.saved) {
      const url = URL.createObjectURL(new Blob([result.text], { type: 'text/plain;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = result.name
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    setStatus(result.saved ? ['Exported {0}', result.name] : ['Export cancelled.'])
  }
  function review(f: Finding, decision: Decision) {
    if (!doc || !v || !report) return
    void write('audit.review', {
      topic_id: topic,
      draft_id: doc.draft_id,
      version_id: v.version_id,
      report_id: report.report_id,
      finding_id: f.finding_id,
      decision,
    }).catch(err)
  }
  return (
    <>
      <div className="lib-tools">
        <button className="primary" onClick={() => create(true)}>
          <Icon name="plus" size={14} />{' '}{tr('Add manuscript')}
        </button>
        {doc && (
          <>
            <select aria-label={tr('Manuscript')} value={doc.draft_id} onChange={(e) => selectDoc(e.target.value)}>
              {items.map((d) => (
                <option key={d.draft_id} value={d.draft_id}>
                  {d.name}
                </option>
              ))}
            </select>
            <select
              aria-label={tr('Manuscript version')}
              value={v?.version_id}
              onChange={(e) => {
                pickVersion(e.target.value)
                pickReport('')
                setSelected(null)
              }}
            >
              {doc.versions.map((v, i) => (
                <option key={v.version_id} value={v.version_id}>
                  {tr('Version')}{' '}{doc.versions.length - i}
                  {i ? '' : tr(' · current')}
                </option>
              ))}
            </select>
          </>
        )}
      </div>
      {v && doc && (
        <>
          <section className="card result-card">
            <h2>{doc.name}</h2>
            <p className="record-meta" title={v.version_id}>
              {tr(doc.format)} · {tr(doc.write_mode)}{' '}{tr('· Version')}{' '}{doc.versions.length - doc.versions.indexOf(v)}
            </p>
            {v.warnings.map((w) => (
              <p className="gap-note" key={w}>
                <Icon name="alert" size={15} /> {w}
              </p>
            ))}
            <div className="check-list">
              {v.sentences.map((s) => (
                <label key={s.id} className="check-row check-option">
                  <input
                    type="checkbox"
                    checked={sentences.includes(s.id)}
                    onChange={() => setSelected(toggle(sentences, s.id))}
                  />
                  <span>
                    {s.text}
                    {s.cites.length > 0 && <small>{s.cites.map((c) => '[@' + c + ']').join(' ')}</small>}
                  </span>
                </label>
              ))}
            </div>
            <h3>{tr('Source scope')}</h3>
            <label className="check-row">
              <input
                type="checkbox"
                checked={extend}
                onChange={(e) => {
                  setExtend(e.target.checked)
                  setSources(versions)
                }}
              />
              {tr('Include other papers from Library')}
            </label>
            {available.length > 0 && (
              <div className="check-list">
                {available.map((a) => (
                  <label className="check-row check-option" key={a.id}>
                    <input
                      type="checkbox"
                      checked={versions.includes(a.id)}
                      onChange={() => setSources(toggle(versions, a.id))}
                    />
                    <span>
                      <strong>{a.title}</strong>
                      <small title={a.id}>
                        {tr(a.scope.replaceAll('_', ' '))} · {a.id.slice(0, 8)}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            )}
            <div className="lib-tools">
              <button
                className="primary"
                disabled={busy || !sentences.length}
                onClick={() => task('citation_audit')}
              >
                {tr('Run citation check')}
              </button>
              <button
                className="ghost-btn"
                disabled={busy || !sentences.length || !versions.length}
                onClick={() => task('citation_suggest')}
              >
                {tr('Find citation suggestions')}
              </button>
            </div>
          </section>
          {!v.reports.some((r) => r.kind === 'citation_audit') && (
            <p className="review-banner">{tr('This version needs an independent citation check.')}</p>
          )}
          {report && (
            <>
              <div className="lib-tools">
                <select
                  aria-label={tr('Report')}
                  value={report.report_id}
                  onChange={(e) => pickReport(e.target.value)}
                >
                  {v.reports.map((r, i) => (
                    <option key={r.report_id} value={r.report_id}>
                      {r.kind === 'citation_audit' ? tr('Citation check') : tr('Citation suggestions')} ·{' '}
                      {v.reports.length - i}
                    </option>
                  ))}
                </select>
                <p className="record-meta">
                  {report.complete ? tr('Check complete') : tr('Partial coverage')} · {report.model} ·{' '}
                  {report.findings.filter((f) => f.decision).length}/{report.findings.length}{' '}{tr('findings reviewed')}
                </p>
              </div>
              {report.findings.map((f) => (
                <section className="card result-card" key={f.finding_id}>
                  <h3>{v.sentences.find((s) => s.id === f.sentence_id)?.text}</h3>
                  <span className="tag">
                    {v.stale_sentence_ids?.includes(f.sentence_id)
                      ? tr('Source changed · recheck required')
                      : report.kind === 'citation_suggest'
                        ? f.proposal
                          ? tr('Source found · awaiting your choice')
                          : tr('No suggestion')
                        : f.claims.length && f.claims.every((c) => c.status === 'supported')
                          ? tr('Supported')
                          : tr('Coverage incomplete')}
                  </span>
                  {f.claims.map((c, i) => (
                    <div className="research-record" key={i}>
                      <p>
                        <span
                          className={`tag ${c.status === 'supported' ? 'ok' : c.status === 'conflict' ? 'bad' : 'warn'}`}
                        >
                          {tr(c.status.replaceAll('_', ' '))}
                        </span>{' '}
                        {c.text}
                      </p>
                      <small className="record-meta" title={c.source_version_id}>
                        {[c.source_version_id?.slice(0, 8), c.limit].filter(Boolean).join(' · ')}
                      </small>
                      <div>
                        {c.anchor_ids.map((a) => (
                          <EvidenceLink key={a} id={a} />
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="lib-tools">
                    {report.kind === 'citation_audit' &&
                      (['accept', 'reject', 'defer'] as const).map((d) => (
                        <button
                          className="ghost-btn sm"
                          disabled={busy || f.decision === d}
                          key={d}
                          onClick={() => review(f, d)}
                        >
                          {f.decision === d ? '✓ ' : ''}
                          {tr(`${d} finding`)}
                        </button>
                      ))}
                    {f.proposal && v === doc.versions[0] && (
                      <button
                        className="ghost-btn"
                        onClick={() => {
                          setPreview(f)
                          setApply('both')
                        }}
                      >
                        {tr('Preview revision')}
                      </button>
                    )}
                  </div>
                </section>
              ))}
            </>
          )}
        </>
      )}
      <section className="card result-card">
        <h3>{tr('Export')}</h3>
        <div className="lib-tools">
          <select
            aria-label={tr('Export format')}
            value={format}
            onChange={(e) => setFormat(e.target.value as ExportFormat)}
          >
            {['manuscript', 'audit_report', 'notes', 'comparison_csv', 'bibliography', 'evidence'].map(
              (f) => (
                <option key={f} value={f}>
                  {tr(f.replaceAll('_', ' '))}
                </option>
              ),
            )}
          </select>
          <label className="check-row">
            <input
              type="checkbox"
              disabled={demo}
              checked={pdfs}
              onChange={(e) => include(e.target.checked)}
            />{' '}
            {tr('Include original PDFs')}
          </label>
          <button
            className="ghost-btn"
            disabled={busy || (format === 'audit_report' && !report) || (format === 'manuscript' && !doc)}
            onClick={() => void download().catch(err)}
          >
            {tr('Export file')}
          </button>
        </div>
        <small role="status">{status && tr(...status)}</small>
      </section>
      {creating && (
        <Dialog title={tr('Add manuscript')} onClose={() => create(false)}>
          <button className="ghost-btn" onClick={() => void pick().catch(err)}>
            {demo ? tr('Open sample manuscript') : tr('Choose Markdown, LaTeX or Word file')}
          </button>
          <label className="set-field">
            {tr('Manuscript name')}
            <input className="text-field" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="set-field">
            {tr('Or paste Markdown')}
            <textarea
              aria-label={tr('Manuscript text')}
              className="text-field"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
            />
          </label>
          <button
            className="primary"
            disabled={busy || !body.trim() || !name.trim()}
            onClick={() =>
              void write('draft.import', { topic_id: topic, name, text: body })
                .then((d) => {
                  selectDoc(d.draft_id)
                  create(false)
                  setBody('')
                })
                .catch(err)
            }
          >
            {tr('Add draft')}
          </button>
        </Dialog>
      )}
      {preview?.proposal && v && doc && report && (
        <Dialog title={tr('Preview manuscript revision')} onClose={() => setPreview(undefined)}>
          <div className="rewrite">
            <p className="record-meta">{tr('Current sentence')}</p>
            <del>{original?.text}</del>
            <p className="record-meta">{tr('Revised sentence')}</p>
            <ins>{apply === 'citation' ? original?.text : preview.proposal.text}</ins>
          </div>
          <p>
            {tr('Citation ·')}{' '}
            {(apply === 'wording' ? (original?.cites ?? []) : preview.proposal.cites).join(', ') || tr('None')}
          </p>
          {apply !== 'wording' && <p>{tr('Bibliography ·')}{' '}{preview.proposal.bibliography.join('; ')}</p>}
          <p>
            {preview.proposal.scope}{' '}
            {preview.proposal.anchor_ids.map((a) => (
              <EvidenceLink key={a} id={a} />
            ))}
          </p>
          <select
            aria-label={tr('Apply changes')}
            value={apply}
            onChange={(e) => setApply(e.target.value as typeof apply)}
          >
            <option value="wording">{tr('Wording only')}</option>
            <option value="citation">{tr('Citation only')}</option>
            <option value="both">{tr('Wording and citation')}</option>
          </select>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void write('draft.apply_suggestions', {
                topic_id: topic,
                draft_id: doc.draft_id,
                version_id: v.version_id,
                report_id: report.report_id,
                finding_id: preview.finding_id,
                apply,
              })
                .then((d) => {
                  pickVersion(d.versions[0].version_id)
                  pickReport('')
                  setSelected(null)
                  setPreview(undefined)
                })
                .catch(err)
            }
          >
            {tr('Apply to new version')}
          </button>
        </Dialog>
      )}
    </>
  )
}
export function CitationPage() {
  const { demo, busy } = useWorkspace()
  const { tr, language } = useLanguage()
  const { state } = useStore()
  const route = state.route.view === 'check' ? state.route : undefined
  const [topic, setTopic] = useState(route?.draftId ? route.topicId ?? '' : '')
  const [opened, openReport] = useState<AuditHistoryItem>()
  const history = useRead('audit.history', {}, !demo && !topic)?.items
  const selected = state.topics.find(t => t.id === topic)
  const [actions, setActions] = useState<HTMLDivElement | null>(null)
  return <HeaderActions.Provider value={actions}><div className="page">
    <PageHead onBack={selected ? () => { openReport(undefined); setTopic('') } : undefined} backDisabled={busy} sub={tr('Check a manuscript against its selected sources')} trace title={tr('Citation check')} icon="shield">
      <div className="header-actions audit-header-actions" ref={setActions} />
    </PageHead>
    <div className={selected ? 'page-body scroll' : 'page-body topic-chooser-body'}>
      {!selected ? <section className="audit-chooser">
        <TopicChooser onSelect={setTopic} />
        {history && history.length > 0 && <section className="audit-history" aria-label={tr('Audit history')}>
          <h3>{tr('Audit history')}</h3>
          <div className="audit-options">{history.map(item => <button key={item.report_id} className="audit-option"
            onClick={() => { openReport(item); setTopic(item.topic_id) }}>
            <span><strong>{item.name}</strong><small className="audit-history-meta">{item.topic_title} · {tr('Check {0}', item.number)}
              {item.started_at && ' · ' + new Date(item.started_at).toLocaleString(language)}</small></span>
            <span aria-hidden="true">›</span></button>)}</div>
        </section>}
      </section> : demo ? <Manuscripts topic={topic} key={topic}/> : <PdfAudit topic={topic} initialReport={opened} key={topic}/>}
    </div>
  </div></HeaderActions.Provider>
}
