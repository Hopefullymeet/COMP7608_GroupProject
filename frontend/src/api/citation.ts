import type { Write } from './library'
export type Decision = 'accept' | 'reject' | 'defer'
export type Finding = {
  finding_id: string
  sentence_id: string
  chain?: { parent: number | null; origin?: 'original' | 'secondary' | 'unclear'; ref_key: string; title: string; version?: string; status: Finding['claims'][number]['status']; limit?: string; anchor_ids: string[]; link?: string; same_as?: number }[]
  ref_key?: string
  source_versions?: string[]
  claims: {
    text: string
    source_version_id?: string
    status: 'supported' | 'partial' | 'conflict' | 'evidence_not_established' | 'blocked'
    anchor_ids: string[]
    limit: string
  }[]
  decision?: Decision
  needs_review?: boolean
  proposal?: { text: string; cites: string[]; bibliography: string[]; anchor_ids: string[]; scope: string }
}
export type AuditHistoryItem = {
  draft_id: string; version_id: string; report_id: string; topic_id: string
  name: string; topic_title: string; started_at: string | null
  count: number; language: string | null; number: number
}
export type Report = {
  language?: string | null
  report_id: string
  kind: 'citation_audit' | 'citation_suggest'
  summaries?: Record<string, string>
  discussion?: { question: string; text: string; anchor_ids: string[] }[]
  whole_document?: boolean
  complete: boolean
  model: string
  findings: Finding[]
}
export type Manuscript = {
  draft_id: string
  name: string
  format: 'markdown' | 'latex' | 'word' | 'pdf'
  write_mode: 'copy' | 'patch' | 'positions'
  versions: Snapshot[]
}
export type CitationMark = { sentence_id: string; label: string; keys: string[]; boxes: [number, number, number, number][] }
export type Snapshot = {
  page_count?: number
  stale_sentence_ids?: string[]
  stale_suggestion_sentence_ids?: string[]
  version_id: string
  sentences: { id: string; text: string; cites: string[]; page?: number; unresolved?: string[] }[]
  uncited_sentences?: Snapshot['sentences']
  references?: { link?: string; key: string; title: string; text: string; status: string; target_version_id?: string; target_title?: string }[]
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
  input: V & { language?: 'en' | 'zh-CN'; whole_document?: boolean; question?: string; reference_keys?: string[]; report_id?: string; sentence_ids: string[]; source_versions: string[] }
}
export type CitationMethods = {
  'draft.import': [Write & T & ({ file_id: string } | { source_version_id: string } | { name: string; text: string } | { name: string; content: string; draft_id?: string }), Manuscript]
  'draft.page': [T & V & { page: number; marks_only?: boolean }, { page: number; png?: string; marks?: CitationMark[] }]
  'draft.prose': [T & V, { sentences: Snapshot['sentences'] }]
  'draft.resolve_reference': [Write & T & V & { ref_key: string; paper_id: string | null }, Manuscript]
  'audit.history': [Record<string, never>, { items: AuditHistoryItem[] }]
  'draft.list': [T, { items: Manuscript[] }]
  'audit.save_to_wiki': [Write & T & F, { item_id: string }]
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
        record_id?: string
        item_ids?: string[]
      },
    { name: string; saved: boolean; text?: string; files?: { name: string; text: string }[] },
  ]
}
