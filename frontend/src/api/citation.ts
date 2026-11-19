import type { Write } from './library'
export type Decision = 'accept' | 'reject' | 'defer'
export type Finding = {
  finding_id: string
  sentence_id: string
  claims: {
    text: string
    source_version_id?: string
    status: 'supported' | 'conflict' | 'evidence_not_established' | 'blocked'
    anchor_ids: string[]
    limit: string
  }[]
  decision?: Decision
  proposal?: { text: string; cites: string[]; bibliography: string[]; anchor_ids: string[]; scope: string }
}
export type Report = {
  report_id: string
  kind: 'citation_audit' | 'citation_suggest'
  complete: boolean
  model: string
  findings: Finding[]
}
export type Manuscript = {
  draft_id: string
  name: string
  format: 'markdown' | 'latex' | 'word'
  write_mode: 'copy' | 'patch' | 'positions'
  versions: Snapshot[]
}
export type Snapshot = {
  stale_sentence_ids?: string[]
  version_id: string
  sentences: { id: string; text: string; cites: string[] }[]
  warnings: string[]
  reports: Report[]
}
export type ExportFormat =
  | 'manuscript'
  | 'audit_report'
  | 'notes'
  | 'comparison_csv'
  | 'bibliography'
  | 'evidence'
type T = { topic_id: string }
type V = { draft_id: string; version_id: string }
type F = V & { report_id: string; finding_id: string }
export type CitationTask = T & {
  kind: Report['kind']
  input: V & { sentence_ids: string[]; source_versions: string[] }
}
export type CitationMethods = {
  'draft.import': [Write & T & ({ file_id: string } | { name: string; text: string }), Manuscript]
  'draft.list': [T, { items: Manuscript[] }]
  'audit.review': [Write & T & F & { decision: Decision }, { finding_id: string }]
  'draft.apply_suggestions': [Write & T & F & { apply: 'wording' | 'citation' | 'both' }, Manuscript]
  'export.create': [
    Write &
      T & {
        format: ExportFormat
        include_originals: boolean
        draft_id?: string
        version_id?: string
        report_id?: string
      },
    { name: string; saved: boolean; text?: string },
  ]
}
