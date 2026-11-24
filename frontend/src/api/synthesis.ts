import type { Write } from './library'
import type { Version } from './contract'

type Topic = { topic_id: string }
export type Assessment = 'supported' | 'partial' | 'conflicting' | 'missing'
export type Contribution = {
  source_version_id: string
  role: string
  assessment: Assessment
  anchor_ids: string[]
  reported_from?: string
  attribution_anchor_ids?: string[]
}
export type OutlinePoint = {
  id: string
  prior_id?: string
  title: string
  claims: { text: string; conditions: string; assessment: Assessment; contributions: Contribution[]; gap: string }[]
}
export type PaperRelation = {
  id: string
  prior_id?: string
  from: string
  to: string
  kind: string
  subject: string
  conditions: string
  comparability: 'comparable' | 'not_comparable' | 'unclear' | 'not_applicable'
  alignment: Record<string, string>
  status: 'verified' | 'proposed' | 'disputed'
  anchor_ids: string[]
  open_question: string
}
export type Outline = {
  record_id: string
  question: string
  points: OutlinePoint[]
  relations: PaperRelation[]
  gaps: string[]
  reads: { source_version_id: string; title: string; available_scope: string; passages_read: number }[]
  read_anchor_ids: string[]
  stale_item_ids?: string[]
}
export type WikiItem = {
  id: string
  record_id: string
  kind: 'point' | 'relation'
  entry: OutlinePoint | PaperRelation
  anchor_ids: string[]
  needs_review: boolean
  changed_versions?: string[]
}
export type ResearchWiki = { revision: string; items: WikiItem[] }
export type SynthesisTask = Topic & {
  kind: 'literature_synthesis'
  input: { question: string; source_versions: string[] }
}
export type ReferenceList = {
  pending_versions: string[]
  items: { key: string; title: string; text: string; citing_version_id: string; citing_title: string;
    target_version_id?: string; target_title?: string; status: 'matched' | 'ambiguous' | 'unmatched';
    mentions: { page: number; quote: string }[] }[]
}
type PdfInput = { path: string } | { name: string; content: string }
export type SynthesisMethods = {
  'literature.refs': [Topic & { source_version_id: string; direction?: 'outgoing' | 'incoming' }, ReferenceList]
  'library.preview_pdf': [PdfInput, { parsed: true }]
  'library.import_pdf': [
    Topic & Write & { paper_id?: string } & PdfInput,
    Version & { paper_id: string; duplicate: boolean },
  ]
  'source.page': [Topic & { source_version_id: string; page: number }, { page: number; png: string }]
  'synthesis.list': [Topic, { items: Outline[]; active_task_id?: string }]
  'synthesis.wiki': [Topic, ResearchWiki]
  'synthesis.review': [Topic & Write & { record_id: string; base_revision: string; item_ids: string[] }, ResearchWiki]
}
