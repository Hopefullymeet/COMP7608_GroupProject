// Domain objects, named after the Technical Book (Topic, Session, Paper, Candidate,
// EvidenceAnchor, Comparison, AgentStep). The UI only reads these through the store.

export interface Passage {
  id: string
  section: string
  page: number
  text: string
}

export interface Paper {
  id: string
  short: string
  title: string
  authors: string[]
  venue: string
  year: number
  venueSource: string
  externalId?: string
  /** What the prototype library holds for this paper. */
  stored: 'abstract' | 'metadata'
  passages: Passage[]
}

export interface EvidenceAnchor {
  id: string
  paperId: string
  passageId: string
  /** Exact substring of the passage text. */
  quote: string
  scope: string
}

export interface Topic {
  id: string
  title: string
  goal: string
  paperCount: number
  updated: string
  scripted: boolean
}

export interface Session {
  attachments?: string[]
  id: string
  topicId: string
  title: string
  updated: string
  /** Larger is more recent; drives ordering in lists. */
  order: number
}

export type AngleStatus = 'queued' | 'searching' | 'covered' | 'gap'

export interface SearchAngle {
  id: string
  label: string
  query: string
  status: AngleStatus
  found: number
}

export type Decision = 'pending' | 'added' | 'held' | 'excluded'

export interface Candidate {
  id: string
  paperId: string
  angleId: string
  reason: string
  readLevel: 'Abstract read' | 'Metadata only'
  source: string
  decision: Decision
  round: number
  note?: string
}

export type StepKind = 'plan' | 'tool' | 'observe' | 'decide' | 'stop'

export interface AgentStep {
  id: string
  kind: StepKind
  title: string
  detail?: string
  call?: string
  tokens?: number
  ms?: number
}

export type RunStatus = 'running' | 'done' | 'partial'

export interface AgentRun {
  id: string
  task: 'Discovery' | 'Question' | 'Comparison' | 'Citation check' | 'Wiki draft'
  label: string
  status: RunStatus
  steps: AgentStep[]
  summary?: string
}

export interface AnswerSegment {
  text: string
  evidenceId?: string
  tone?: 'scope'
}

export interface ChatMessage {
  id: string
  sessionId: string
  role: 'user' | 'agent'
  segments: AnswerSegment[]
  runId?: string
  done: boolean
}

export interface ComparisonCell {
  status: 'sourced' | 'missing'
  value: string
  evidenceId?: string
}

export interface ComparisonRow {
  id: string
  dimension: string
  cells: [ComparisonCell, ComparisonCell]
  comparable: boolean
  note?: string
}

export interface Coverage {
  covered: string[]
  gaps: string[]
}

/** Incremental events a task emits; mirrors the task.event notifications in Technical Book §3. */
export type TaskEvent =
  | { type: 'run'; run: AgentRun }
  | { type: 'step'; runId: string; step: AgentStep }
  | { type: 'angle'; angle: SearchAngle }
  | { type: 'candidate'; candidate: Candidate }
  | { type: 'message'; message: ChatMessage }
  | { type: 'text'; messageId: string; index: number; chunk: string; evidenceId?: string; tone?: 'scope' }
  | { type: 'row'; row: ComparisonRow }
  | { type: 'finding'; finding: Finding }
  | { type: 'wiki-proposal'; proposal: WikiProposal }
  | {
      type: 'done'
      runId: string
      status: RunStatus
      summary: string
      coverage?: Coverage
      verdict?: string
      messageId?: string
    }

// ---------- Library ----------

export interface FileVersion {
  name: string
  role: 'Published version' | 'Preprint' | 'Abstract only' | 'Metadata only'
  detail: string
}

export interface LibraryMeta {
  paperId: string
  added: string
  origin: 'Imported PDF' | 'Added from search'
  identity: string
  files: FileVersion[]
  tags: string[]
  annotations: number
}

export interface TrashItem {
  paperId: string
  topics: string[]
  clearExcerpts: boolean
  when: string
}

// ---------- Citation check ----------

/** Per-claim result; whole-sentence support needs every sub-claim supported. */
export type ClaimStatus = 'supported' | 'conflict' | 'not-established' | 'blocked' | 'pending'

export interface SubClaim {
  text: string
  status: ClaimStatus
  evidenceId?: string
  note: string
}

export interface DraftSentence {
  id: string
  text: string
  /** Citation keys as written in the draft. */
  cites: string[]
}

export interface Finding {
  sentenceId: string
  claims: SubClaim[]
  /** Citation suggestion for an uncited sentence: found in source, awaiting the user's choice. */
  suggestion?: { evidenceIds: string[]; cite: string; scope: string }
  rewrite?: { text: string; cites: string[] }
}

// ---------- Evidence wiki ----------

export interface WikiStatement {
  id: string
  text: string
  evidenceIds: string[]
  author: 'You' | 'Agent draft' | 'Saved answer'
}

export interface WikiRelation {
  id: string
  from: string
  type: 'extends' | 'contrasts with' | 'uses' | 'not comparable with'
  to: string
  evidenceIds: string[]
  status: 'verified' | 'unverified' | 'disputed'
}

export interface WikiPage {
  id: string
  title: string
  kind: 'Concept' | 'Dataset'
  summary: string
  statements: WikiStatement[]
  relations: WikiRelation[]
  disputes: { claim: string; sides: { text: string; evidenceId: string }[]; question: string }[]
  revisions: { when: string; who: string; what: string }[]
}

export interface WikiProposal {
  page: WikiPage
  /** Additions the draft also makes to existing pages. */
  edits: { pageId: string; relations: WikiRelation[] }[]
  inputs: string[]
}
