import type { ReaderMethods, ReaderTask } from './reader'
import type { SynthesisMethods, SynthesisTask } from './synthesis'
import type { Budget, ServiceMethods, ResumeTask } from './services'
import type { CitationTask, CitationMethods } from './citation'
import type { ResearchTask, ResearchMethods } from './research'
import type { WikiMethods } from './wiki'
import type { ImportTask, ImportResult, LibraryMethods, Located } from './library'
import type { ReadingPosition } from './library'
export type Id = string
export type NonEmpty<T> = [T, ...T[]]
export type Scope = 'abstract' | 'full_text'
export type Version = { source_version_id: Id; available_scope: 'metadata' | Scope; pdf_available?: boolean }
export type Topic = { topic_id: Id; title: string }
export type Session = { session_id: Id; title?: string;updated_at?:string;has_turns?:boolean }
export type LibraryItem = { paper_id: Id; title: string; alias?: string; topic_ids: Id[]; source_versions: NonEmpty<Version> }
export type Action = 'pending' | 'hold' | 'exclude' | 'add'
export type Decision = Exclude<Action, 'add'> | 'added'
export type Candidate = {
  pdf_urls?: string[]; pdf_status?: 'saved' | 'unavailable'
  candidate_id: Id; title: string; authors: string[]; doi?: string; year?: number
  provider?: string; source_id?: string
  venue?: { name: string; source: string }; metadata_url: string; abstract?: string
  change?:'new'|'updated';reason: string; available_scope: Version['available_scope']; read_scope: 'none' | Scope; decision: Decision
}
export type Discovery = {
  search_id: Id; candidates: Candidate[]; excluded: Candidate[]
  provider?: string
  coverage: { searched_angles: string[]; gaps: string[] }
}
export type Step =
  | { action: 'search'; query: string; source: string; observation: string }
  | { action: 'search_again' | 'stop'; reason: string }
export type Source = { paper_id: Id; source_version_id: Id; requested_scope: Scope }
export type Abstract = { paper_id: Id; source_version_id: Id; passages: NonEmpty<{ passage_id: Id; text: string }> }
export type Evidence = {
  source: Abstract
  anchor: { anchor_id: Id; paper_id: Id; source_version_id: Id; read_scope: 'abstract'; quote: string
    location: { view: 'abstract'; precision: 'paragraph'; passage_id: Id; text_excerpt: string } }
}
export type Reading = {
  scope_id: Id; message_id: Id; read_sources: { source_version_id: Id; read_scope: 'none' | Scope }[]
  sentences: NonEmpty<{ text: string } & (
    { assessment: 'supported'; anchor_ids: NonEmpty<Id> } |
    { assessment: 'evidence_not_established'; anchor_ids: [] }
  )>
}
export type Turn = { task_id: Id; question: string; answer: Reading }
export type MainTask = { topic_id: Id } & (
  { kind: 'discovery'; input: { query: string; filters?: { year_from?: number; year_to?: number; venue?:string } } | { previous_search_id: Id } } |
  { kind: 'reading_qa'; session_id: Id; input: { question: string; selection?: { source_version_id: Id; passage_id: Id; quote:string }; sources: NonEmpty<Source> } }
)
export type WorkspaceTask = ResumeTask | ImportTask | ResearchTask | CitationTask | SynthesisTask | ReaderTask
export type TaskInput = MainTask | WorkspaceTask
export type Transfer = { endpoint: string; purpose: string; data_categories: NonEmpty<string> }
export type Issue = { reason: string; retryable: boolean; next_action: string; details?: Record<string, unknown> }
export type Start = { task_id: Id; run_id: Id; status: 'queued'; scope_id?: Id }
type Result = Discovery | Reading | ImportResult | {record_id:string; kind?: 'literature_synthesis' | 'citation_audit' | 'reader_question' | 'visual_index'}
export type Finished =
  | { status: 'completed'; result: Result }
  | { status: 'partial'; result: Result; issue: Issue }
  | { status: 'failed'; issue: Issue }
  | { status: 'cancelled'; result?: Result }
export type HistoryRun={task_id:Id;run_id:Id;kind:TaskInput['kind'];label:string;status:'queued'|'running'|Finished['status'];started_at:string;topic_id?:Id;session_id?:Id;
  steps:{kind:'plan'|'tool'|'observe'|'decide'|'stop';title:string;detail:string}[];usage?:{calls:number;tokens:number;ms:number;cost:number};checkpoint_id?:Id}
export type Snapshot = { task_id: Id; run_id: Id; last_event_seq: number } & (
  { status: 'queued' | 'running' } | Finished
)
export type EventBody =
  | { type: 'task.progress'; payload: { stage: string; message: string } }
  | { type: 'task.finished'; payload: Finished }
  | { type: 'discovery.step'; payload: Step }
  | { type: 'answer.delta'; payload: { text: string } }
export type TaskEvent = { task_id: Id; run_id: Id; event_seq: number } & EventBody
type Write = { operation_id: Id }
type InTopic = { topic_id: Id }
type InSession = InTopic & { session_id: Id }
type ForTask = { task_id: Id }
type InSearch = InTopic & { search_id: Id }
export type Methods = WikiMethods & ReaderMethods & SynthesisMethods & LibraryMethods & ResearchMethods & CitationMethods & ServiceMethods & {
  'protocol.version': [Record<string, never>, { major: number; minor: number }]
  'topic.list': [Record<string, never>, { items: Topic[] }]
  'topic.create': [Write & { title: string }, InTopic]
  'topic.rename': [Write & InTopic & { title: string }, InTopic & { title: string }]
  'session.rename': [Write & InSession & { title: string }, InSession & { title: string }]
  'session.list': [InTopic, { items: Session[] }]
  'session.create': [Write & InTopic, InSession]
  'session.get': [InSession, { turns: Turn[]; active_task_id?: Id; reader?: { source_version_id: Id } & ReadingPosition }]
  'discovery.latest': [InTopic, { search_id?: Id; active_task_id?: Id;task_id?:Id }]
  'discovery.get': [InSearch, Discovery]
  'discovery.steps': [ForTask, { steps: Step[] }]
  'candidate.decide': [Write & InSearch & { candidate_id: Id; decision: Action }, { candidate_id: Id } & (
    { decision: Exclude<Decision, 'added'> } |
    (Version & { decision: 'added'; paper_id: Id; link_status: 'linked' | 'already_linked' })
  )]
  'library.list': [{ topic_id?: Id }, { items: LibraryItem[] }]
  'source.read_abstract': [InTopic & { source_version_id: Id }, Abstract]
  'evidence.locate': [InTopic & { message_id: Id; anchor_id: Id }, Evidence | Located]
  'task.prepare': [Write & TaskInput, { confirmation_id: Id; transfers: Transfer[];budget?:Budget;source_versions?:Id[] }]
  'task.start': [Write & TaskInput & { confirmation_id: Id }, Start]
  'task.history':[{topic_id?:Id},{items:HistoryRun[]}]
  'task.get': [ForTask, Snapshot]
  'task.cancel': [Write & ForTask, ForTask & { status: Finished['status'] }]
}
export type Method = keyof Methods
export type Rpc = <M extends Method>(method: M, params: Methods[M][0]) => Promise<Methods[M][1]>
export type Client = {
  call: Rpc
  subscribe: (task: Id, cursor: number, receive: (event: TaskEvent) => void) => Promise<() => void>
}

export class RpcError extends Error {
  constructor(message: string, readonly issue: Issue) { super(message) }
}

export function errorText(error: unknown) {
  if (error instanceof RpcError) {
    const actions: Record<string, string> = {
      attach_full_text: 'Attach the full text in Library before asking again.',
      restore_source: 'Restore the original material and try opening the citation again.',
      skip_candidate: 'Continue with another candidate.',
      configure_service: 'Check the service configuration.',
      check_quota: 'Check the service quota.',
      refresh_data: 'Refresh the current results.',
      retry: 'Try again.',
      confirm_task: 'Confirm the data transfer again.',
    }
    return [error.message, actions[error.issue.next_action]].filter(Boolean).join(' ')
  }
  return error instanceof Error ? error.message : 'The service request failed.'
}
