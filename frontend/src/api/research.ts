import type { Write } from './library'
type Topic = { topic_id: string }
export type Cell = {
  dimension: string
  source_version_id: string
  text: string
  status: 'evidenced' | 'missing' | 'not_comparable' | 'disputed'
  anchor_ids: string[]
}
export type Comparison = {
  comparison_id: string
  revision: string
  question: string
  source_versions: [string, string]
  cells: Cell[]
  history: { revision: string; cells: Cell[] }[]
}
export type Statement = { id: string; text: string; anchor_ids: string[] }
export type Relation = {
  id: string
  from: string
  to: string
  kind: string
  status: 'verified' | 'proposed' | 'disputed'
  anchor_ids: string[]
  counter_anchor_ids: string[]
  open_question: string
}
export type Page = {
  page_id: string
  revision: string
  title: string
  statements: Statement[]
  relations: Relation[]
}
export type Change = { id: string; before?: Statement | Relation; after?: Statement | Relation }
export type Draft = {
  draft_id: string
  title: string
  page_id?: string
  base_revision?: string
  changes: Change[]
}
export type Wiki = { pages: Page[]; drafts: Draft[] }
export type ResearchTask = Topic &
  (
    | {
        kind: 'paper_comparison'
        input: { source_versions: [string, string]; question: string; dimensions: string[] }
      }
    | {
        kind: 'wiki_draft'
        input: { page_id?: string; title: string; note_ids: string[]; relation_ids: string[] }
      }
  )
export type ResearchMethods = {
  'comparison.list': [Topic, { items: Comparison[] }]
  'comparison.save': [
    Write & Topic & { comparison_id: string; base_revision: string; cells: Cell[] },
    Comparison,
  ]
  'wiki.list': [Topic, Wiki]
  'wiki.review': [
    Write & Topic & { draft_id: string; decision: 'accept' | 'discard'; change_ids: string[] },
    { page_id?: string },
  ]
}
