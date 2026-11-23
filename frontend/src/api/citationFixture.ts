import type { CitationMethods, CitationTask, Finding, Manuscript, Report } from './citation'
import type { FixtureState, Handlers } from './libraryFixture'
import type { ResearchFixture } from './researchFixture'
import type { Located } from './library'
const uid = () => crypto.randomUUID()
export function citationFixture(
  state: FixtureState & { research: ResearchFixture; manuscripts: Record<string, Manuscript[]> },
  original: Located,
) {
  const items = (topic: string) => (state.manuscripts[topic] ??= [])
  function snapshot(topic: string, draft: string, version: string) {
    const doc = items(topic).find((d) => d.draft_id === draft)
    const v = doc?.versions.find((v) => v.version_id === version)
    if (!doc || !v) throw new Error('Manuscript version unavailable.')
    return { doc, v }
  }
  function finding(p: {
    topic_id: string
    draft_id: string
    version_id: string
    report_id: string
    finding_id: string
  }) {
    const { doc, v } = snapshot(p.topic_id, p.draft_id, p.version_id)
    const f = v.reports
      .find((r) => r.report_id === p.report_id)
      ?.findings.find((f) => f.finding_id === p.finding_id)
    if (!f) throw new Error('Finding unavailable.')
    return { doc, v, f }
  }
  function generate(task: CitationTask, record: string) {
    const { v } = snapshot(task.topic_id, task.input.draft_id, task.input.version_id)
    const findings: Finding[] = []
    const sources = [original, ...Object.values(state.shelf.anchors)].filter((a) =>
      task.input.source_versions.includes(a.source.source_version_id),
    )
    for (const s of v.sentences.filter((s) => task.input.sentence_ids.includes(s.id))) {
      const targets =
        task.kind === 'citation_suggest' || !s.cites.length ? task.input.source_versions : s.cites
      const claims: Finding['claims'] = []
      const fragments = s.text.split(/\s+and\s+|;\s*/i).filter(Boolean)
      for (const text of fragments)
        for (const version of targets.length ? targets : ['']) {
          const records = sources.filter((a) => a.source.source_version_id === version)
          const exact = records.find(
            (a) =>
              text
                .trim()
                .toLowerCase()
                .replace(/[.!?]$/, '') ===
              a.quote
                .trim()
                .toLowerCase()
                .replace(/[.!?]$/, ''),
          )
          const status = exact ? 'supported' : !records.length ? 'blocked' : 'evidence_not_established'
          claims.push({
            text,
            source_version_id: version || undefined,
            status,
            anchor_ids: exact ? [exact.anchor_id] : [],
            limit: exact
              ? 'Matched the selected source passage.'
              : records.length
                ? 'The sample passage does not establish this wording.'
                : 'Target material is missing from the authorized scope.',
          })
        }
      const candidate = sources.find((a) => targets.includes(a.source.source_version_id))
      findings.push({
        finding_id: uid(),
        sentence_id: s.id,
        claims,
        proposal: candidate
          ? {
              text: candidate.quote,
              cites: [candidate.source.source_version_id],
              anchor_ids: [candidate.anchor_id],
              bibliography: [
                state.library.find((p) => p.paper_id === candidate.source.paper_id)?.title ??
                  candidate.source.paper_id,
              ],
              scope: candidate.read_scope,
            }
          : undefined,
      })
    }
    const report: Report = {
      report_id: record,
      kind: task.kind,
      complete: findings.every((f) => f.claims.every((c) => c.status !== 'blocked')),
      model: 'Contract fixture',
      findings,
    }
    if (task.kind === 'citation_audit' && report.complete)
      v.stale_sentence_ids = v.stale_sentence_ids?.filter((id) => !task.input.sentence_ids.includes(id))
    v.reports.unshift(report)
    return report.complete
  }
  const handlers: Handlers<CitationMethods> = {
    'audit.save_to_wiki': () => { throw new Error('PDF review requires the desktop workspace.') },
    'draft.page': () => { throw new Error('PDF rendering requires the desktop workspace.') },
    'draft.prose': () => ({ sentences: [] }),
    'draft.resolve_reference': () => { throw new Error('PDF review requires the desktop workspace.') },
    'draft.list': ({ topic_id }) => ({ items: items(topic_id) }),
    'draft.import': (p) => {
      if ('source_version_id' in p) throw new Error('PDF review requires the desktop workspace.')
      const name = 'name' in p ? p.name : p.file_id
      const body = 'text' in p ? p.text : 'The dataset uses entire papers and abstracts. [@v1]'
      const sentences = body
        .split(/\n+|(?<=[.!?])\s+(?=[A-Z])/)
        .map((x) => x.trim())
        .filter(Boolean)
        .map((line) => ({
          id: uid(),
          text: line.replace(/\[@[^\]]+\]/g, '').trim(),
          cites: Array.from(line.matchAll(/\[@([^\]]+)\]/g), (m) => m[1]),
        }))
      if (!sentences.length) throw new Error('Add manuscript text first.')
      const doc: Manuscript = {
        draft_id: uid(),
        name,
        format: name.endsWith('.docx') ? 'word' : name.endsWith('.tex') ? 'latex' : 'markdown',
        write_mode: name.endsWith('.docx') ? 'positions' : name.endsWith('.tex') ? 'patch' : 'copy',
        versions: [{ version_id: uid(), sentences, warnings: [], reports: [] }],
      }
      items(p.topic_id).unshift(doc)
      return doc
    },
    'audit.review': (p) => {
      const { f } = finding(p)
      f.decision = p.decision
      return { finding_id: f.finding_id }
    },
    'draft.apply_suggestions': (p) => {
      const { doc, v, f } = finding(p)
      if (doc.versions[0] !== v || !f.proposal)
        throw new Error('The draft has changed. Review the latest version.')
      const change = f.proposal
      doc.versions.unshift({
        ...v,
        version_id: uid(),
        reports: [],
        sentences: v.sentences.map((s) =>
          s.id !== f.sentence_id
            ? s
            : {
                ...s,
                text: p.apply === 'citation' ? s.text : change.text,
                cites: p.apply === 'wording' ? s.cites : change.cites,
              },
        ),
      })
      return doc
    },
    'export.create': (p) => {
      const doc = items(p.topic_id).find((d) => d.draft_id === p.draft_id),
        v = doc?.versions.find((v) => v.version_id === p.version_id)
      const report = v?.reports.find((r) => r.report_id === p.report_id)
      const papers = state.library.filter((paper) => paper.topic_ids.includes(p.topic_id))
      const anchors = [original, ...Object.values(state.shelf.anchors)].filter((a) =>
        papers.some((p) => p.paper_id === a.source.paper_id),
      )
      const csv = (s: string) => '"' + s.replaceAll('"', '""') + '"'
      switch (p.format) {
        case 'manuscript':
          if (!v || !doc) throw new Error('Choose a manuscript first.')
          return {
            saved: true,
            name: doc.name + '.review.md',
            text: v.sentences
              .map((s) => s.text + ' ' + s.cites.map((c) => '[@' + c + ']').join(' '))
              .join('\n\n'),
          }
        case 'audit_report':
          if (!report) throw new Error('Choose a report to export.')
          return {
            saved: true,
            name: 'citation-report.json',
            text: JSON.stringify(
              { manuscript: doc?.name, version: p.version_id, report, sentences: v?.sentences, anchors },
              null,
              2,
            ),
          }
        case 'notes':
          return {
            saved: true,
            name: 'notes.md',
            text: (state.shelf.notes[p.topic_id] ?? [])
              .map((n) => n.text + '\n' + n.anchor_ids.join(', '))
              .join('\n\n'),
          }
        case 'comparison_csv':
          return {
            saved: true,
            name: 'comparisons.csv',
            text: [
              'Question,Dimension,Version,Text,Assessment,Evidence',
              ...(state.research.comparisons[p.topic_id] ?? []).flatMap((c) =>
                c.cells.map((x) =>
                  [c.question, x.dimension, x.source_version_id, x.text, x.status, x.anchor_ids.join(' ')]
                    .map(csv)
                    .join(','),
                ),
              ),
            ].join('\r\n'),
          }
        case 'bibliography':
          return {
            saved: true,
            name: 'references.bib',
            text: papers.map((p) => '@misc{' + p.paper_id + ', title={' + p.title + '}}').join('\n'),
          }
        case 'evidence':
          return { saved: true, name: 'evidence.json', text: JSON.stringify(anchors, null, 2) }
      }
    },
  }
  return { handlers, generate }
}
