import type { Evidence, LibraryItem } from './contract'

export type Write = { operation_id: string }
export type PaperEntry = LibraryItem & {
  authors: string[]
  identity: string
  tags: string[]
  changes: string[]
  files: { source_version_id: string; name: string; role: string }[]
}
export type Review = { review_id: string; paper_id: string; name: string; topic_id?: string; reason: string }
export type Catalog = { papers: PaperEntry[]; reviews: Review[]; trash: PaperEntry[] }
export type DocumentView = {
  paper_id: string
  source_version_id: string
  passages: {
    passage_id: string
    section: string
    page: number
    text: string
    warning?: string
  }[]
}
export type Located = {
  anchor_id: string
  source: DocumentView
  passage_id: string
  quote: string
  read_scope: 'abstract' | 'full_text'
  rect?: { page: number; x: number; y: number; width: number; height: number }
}
export type Origin = 'user' | 'answer' | 'comparison' | 'citation'
export type Revision = { revision: string; text: string; anchor_ids: string[]; origin: Origin }
export type Note = Revision & { note_id: string; session_id?: string; history: Revision[] }
export type ArchiveKey = { kind: 'topic' | 'session'; id: string }
export type Picked = { file_id: string; name: string }
export type Impact = { references: { kind: string; label: string }[]; revision: string }
export type ImportTask = {
  kind: 'paper_import'
  input: { files: string[]; topic_id?: string; paper_id?: string }
}
export type ImportResult = { paper_ids: string[]; review_ids: string[] }
type Batch = { paper_ids: string[] }
type Changed = { changed: number }
type Position = { topic_id: string; source_version_id: string; session_id?: string }
export type LibraryMethods = {
  'file.pick': [{ purpose: 'papers' | 'draft' | 'backup' }, { files: Picked[] }]
  'library.catalog': [Record<string, never>, Catalog]
  'library.resolve_import': [
    Write & { review_id: string; decision: 'link' | 'separate' },
    { paper_id: string },
  ]
  'library.organize': [
    Write & Batch & { action: 'tag' | 'untag' | 'link' | 'unlink'; value: string },
    Changed,
  ]
  'library.impact': [Batch, Impact]
  'library.trash': [Write & Batch & { revision: string }, Changed]
  'library.restore': [Write & Batch, Changed & { warnings: string[] }]
  'library.purge': [Write & Batch & { revision: string; clear_excerpts: boolean }, Changed]
  'workspace.archive': [Write & ArchiveKey, { id: string }]
  'workspace.archived': [Record<string, never>, { items: (ArchiveKey & { title: string })[] }]
  'workspace.unarchive': [Write & ArchiveKey, { id: string }]
  'source.read': [Position, DocumentView]
  'source.original': [{ source_version_id: string; page?: number }, { opened: boolean }]
  'reader.position': [Position, { passage_id?: string }]
  'reader.bookmark': [Write & Position & { passage_id: string }, { passage_id: string }]
  'evidence.open': [{ anchor_id: string }, Located]
  'note.list': [{ topic_id: string }, { items: Note[] }]
  'note.save': [
    Write & {
      topic_id: string
      note_id?: string
      base_revision?: string
      text: string
      anchor_ids: string[]
      session_id?: string
      origin: Origin
    },
    Note,
  ]
}
export type LibraryFixture = {
  entries: Record<string, Partial<PaperEntry>>
  trash: LibraryItem[]
  reviews: Review[]
  documents: Record<string, DocumentView>
  anchors: Record<string, Located>
  positions: Record<string, string>
  notes: Record<string, Note[]>
  archive: (ArchiveKey & { title: string; topic_id?: string })[]
}
export function asEntry(item: LibraryItem, data: LibraryFixture): PaperEntry {
  return {
    authors: [],
    identity: item.paper_id,
    tags: [],
    changes: [],
    files: item.source_versions.map((v) => ({
      source_version_id: v.source_version_id,
      name: item.title,
      role: v.available_scope.replace('_', ' '),
    })),
    ...data.entries[item.paper_id],
    ...item,
  }
}
export function asLocated(e: Evidence): Located {
  return {
    anchor_id: e.anchor.anchor_id,
    source: {
      ...e.source,
      passages: e.source.passages.map((p, i) => ({
        ...p,
        section: 'Abstract · Paragraph ' + (i + 1),
        page: 0,
      })),
    },
    passage_id: e.anchor.location.passage_id,
    quote: e.anchor.quote,
    read_scope: 'abstract',
  }
}
export const emptyLibrary = (): LibraryFixture => ({
  entries: {},
  trash: [],
  reviews: [],
  documents: {},
  anchors: {},
  positions: {},
  notes: {},
  archive: [],
})
