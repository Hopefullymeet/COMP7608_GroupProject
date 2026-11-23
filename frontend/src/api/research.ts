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
export type ResearchTask = Topic & {
  kind: 'paper_comparison'
  input: { source_versions: [string, string]; question: string; dimensions: string[] }
}
export type ResearchMethods = {
  'comparison.list': [Topic, { items: Comparison[] }]
  'comparison.save': [
    Write & Topic & { comparison_id: string; base_revision: string; cells: Cell[] },
    Comparison,
  ]
}
