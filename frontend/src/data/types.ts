import type { Reading } from '../api/contract'
import type { RunConfiguration, Usage } from './serviceSettings'

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
  paperId?: string
  alias?: string
  short: string
  title: string
  authors: string[]
  venue: string
  year: number
  venueSource: string
  externalId?: string
  doi?: string
  /** What the prototype library holds for this paper. */
  stored: 'full-text' | 'abstract' | 'excerpt' | 'metadata'
  pdfAvailable?: boolean
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
  hasTurns?:boolean
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
  gapReason?: string
}

export type Decision = 'pending' | 'added' | 'held' | 'excluded'

export interface Candidate {
  pdf?: 'available' | 'saved' | 'unavailable' | 'missing'
  change?:'new'|'updated'
  id: string
  paperId: string
  angleId: string
  reason: string
  readLevel: 'Abstract read' | 'Metadata only' | 'Full text read'
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

export type RunStatus = 'running' | 'done' | 'partial' | 'failed' | 'cancelled'

export interface AgentRun {
  id: string
  manuscriptId?: string
  task: 'Discovery' | 'Question' | 'Comparison' | 'Citation check' | 'Citation suggestions' | 'Import' | 'Resume' | 'Literature synthesis' | 'Ask about selection' | 'Index figure descriptions'
  label: string
  status: RunStatus
  steps: AgentStep[]
  summary?: string
  configuration?: RunConfiguration
  estimate?: Usage
  usage?: Usage
  limit?: string
}

export interface AnswerSegment {
  text: string
  evidenceId?: string
  evidenceIds?: string[]
  readSources?: Reading['read_sources']
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
  | { type: 'finding'; runId: string; finding: Finding }
  | {
      type: 'done'
      runId: string
      status: RunStatus
      summary: string
      coverage?: Coverage
      verdict?: string
      messageId?: string
      interrupted?: boolean
    }

// ---------- Library ----------

export interface FileVersion {
  name: string
  role: 'Published version' | 'Preprint' | 'Imported version' | 'Abstract only' | 'Metadata only'
  detail: string
  href?: string
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
  when: string
}

// ---------- Citation check ----------

/** Per-claim result; whole-sentence support needs every sub-claim supported. */
export type ClaimStatus = 'supported' | 'conflict' | 'not-established' | 'blocked' | 'pending'

export interface SubClaim {
  text: string
  status: ClaimStatus
  evidenceId?: string
  cite?: string
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
  suggestions?: CitationSuggestion[]
  sources?: { cite: string; evidenceId: string; note: string }[]
  rewrite?: { text: string; cites: string[] }
}

export interface CitationSuggestion {
  evidenceId: string
  cite: string
  scope: string
}

export type FindingDecision = 'accepted' | 'rejected' | 'deferred'

export interface DraftSnapshot {
  version: number
  sentences: DraftSentence[]
  findings: Record<string, Finding>
  recheck: string[]
  reviewed: Partial<Record<string, { decision: FindingDecision; finding: Finding }>>
}
