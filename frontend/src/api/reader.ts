import type { Write } from './library'

export type Rect = [number, number, number, number]
export type Point = [number, number]
type Topic = { topic_id: string }
type Source = Topic & { source_version_id: string }
type Page = Source & { page: number }
export type Selection = { page: number; rect: Rect; rects: Rect[]; quote: string; fullText?: string; medium: 'text' | 'image' }
export type Mark = {
  mark_id: string; revision: string; source_version_id: string; page: number
  kind: 'highlight' | 'underline' | 'note' | 'region' | 'ink' | 'bookmark'
  rects: Rect[]; points: Point[]; quote: string; note: string; color: 'amber' | 'blue' | 'green' | 'rose'
}
export type PdfObject = {
  object_id: string; source_version_id: string; page: number; rect: Rect
  label: string; kind: 'figure' | 'table' | 'equation'; caption: string; features: string
  rows?: (string | null)[][]
  match_kind?: 'caption' | 'region' | 'page'
}
export type ReaderAnswer = Omit<Selection, 'rects' | 'quote'> & {
  id: string; source_version_id: string; question: string; answer: string
}
export type Translation = { translation_id: string; page: number; target_language: string; scope: 'selection' | 'page';
  glossary: Record<string, string>; segments: { source: string; translation: string; rects: Rect[] }[] }
export type ReaderTask = Topic & (
  { kind: 'reader_question'; session_id?: string; input: Omit<Selection, 'quote'> & { source_version_id: string; question: string } } |
  { kind: 'reader_translation'; input: { source_version_id: string; page: number; rects: Rect[]; selected_text: string; target_language: string } } |
  { kind: 'visual_index'; input: { source_version_id: string } }
)
export type ReaderMethods = {
  'reader.pdf': [Source, { content: string }]
  'reader.translations': [Source & { page?: number }, { items: Translation[] }]
  'reader.marks': [Source, { items: Mark[] }]
  'reader.mark_save': [Page & Write & Omit<Mark, 'mark_id' | 'revision'> & { mark_id?: string; base_revision?: string }, Mark]
  'reader.mark_delete': [Source & Write & { mark_id: string; base_revision: string }, { deleted: true }]
  'reader.answers': [Topic & { session_id?: string }, { items: ReaderAnswer[] }]
  'reader.answer_save': [Topic & Write & { answer_id: string }, { item_id: string }]
  'reader.mark_to_wiki': [Source & Write & { mark_id: string }, { item_id: string }]
  'reader.export': [Source, { content: string; name: string }]
  'visual.capabilities': [Record<string, never>, { vision: boolean }]
  'visual.objects': [Source, { items: PdfObject[] }]
  'visual.search': [Topic & { source_versions: string[]; query: string }, { items: PdfObject[]; skipped: number }]
  'visual.crop': [Page & { rect: Rect }, { image: string; text: string }]
}
