import type { Issue } from './contract'

// Topic Wiki: docs/contracts/topic-wiki.md
type Topic = { topic_id: string }
type Write = { operation_id: string }
export type WikiKind = 'focus' | 'paper' | 'finding' | 'preference' | 'open_question'
export type WikiOrigin = 'qa' | 'pdf' | 'paper' | 'note' | 'finding' | 'summary' | 'chat' | 'user'
export type WikiEntry = {
  entry_id: string
  kind: WikiKind
  text: string
  anchor_ids: string[]
  origin: WikiOrigin
  pinned: boolean
  updated_at: string
}
export type WikiChange = { op: 'add' | 'update' | 'remove'; entry_id: string; text: string; before?: string }
export type WikiMessage = {
  message_id: string
  role: 'user' | 'assistant'
  text: string
  created_at: string
  changes?: WikiChange[]
}
export type Wiki = {
  topic_id: string
  revision: string
  status: 'empty' | 'generating' | 'ready' | 'failed'
  map_nodes?: Record<string, {id:string;parent:string;title:string;anchors:string[]}>
  map_sources?: Record<string, {title:string;quote:string;page?:number;scope?:string}>
  map_proposals?: Record<string,{action:string;entry_id:string;text:string}>
  history?: {created:string; changes:{id:string;op:string;title:string}[]}[]
  integrity_issues?: string[]
  documents?: Record<string,{id:string;title:string;entries:string[]}[]>
  map_title?: string
  map_questions?: string[]
  pending_removals?: Record<string,string>
  headline: string
  summary: string[]
  entries: WikiEntry[]
  sources: { papers: number; notes: number; answers: number; findings: number }
  new_since_summary: number
  stale: boolean
  generated_at?: string
  generator: { kind: 'model'; model: string; endpoint: string } | { kind: 'local' }
  transfer?: { endpoint: string; data_categories: string[] }
  thread: WikiMessage[]
  pending_reply: boolean
  issue?: Issue
}
export type WikiEdit =
  | { action: 'map_add'|'map_remove'|'map_rename'|'map_seen'|'map_accept'|'map_dismiss'; entry_id:string; text?:string; confirmed?:boolean; subtree?:boolean }
  | { action: 'add'; text: string; kind?: WikiKind }
  | { action: 'update'; entry_id: string; text: string }
  | { action: 'remove' | 'pin' | 'unpin'; entry_id: string }
export type WikiMethods = {
  'wiki.get': [Topic, Wiki]
  'wiki.refresh': [Write & Topic, Wiki]
  'wiki.chat': [Write & Topic & { text: string }, Wiki]
  'wiki.edit': [Write & Topic & WikiEdit, Wiki]
  'wiki.clear_chat': [Write & Topic, Wiki]
}
