import { createContext, useContext, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { estimateRun, runTask, type ScriptItem } from './runtime'
import { compareScript, discoveryScript, questionScript, QUESTIONS, SEED_QUESTION } from './scripts'
import { DEFAULT_QUESTION, DEMO_TOPIC, EVIDENCE, PAPERS, SEED_SESSION, SESSIONS, TOPICS } from './fixtures'
import { checkScript, wikiScript } from './workspaceScripts'
import { buildWikiProposal, reviewWikiProposal } from './wiki'
import { enabledSources, modelErrors, type ModelConfig, type ModelProvider, type RunConfiguration, type Settings, type Usage } from './serviceSettings'
import { unlimitedBudget } from '../api/services'
import { MANUSCRIPTS, DUPLICATE_REVIEW, LIBRARY_META, LIBRARY_SEED, SAMPLE_MEMBERSHIP, WIKI_NOTE_SEED, WIKI_SEED } from './workspace'
import type {
  AgentRun, Candidate, ChatMessage, ComparisonRow, Coverage, Decision, DraftSentence, DraftSnapshot, FileVersion, Finding, FindingDecision, SearchAngle, Session,
  TaskEvent, Topic, TrashItem, WikiPage, WikiProposal, Paper, EvidenceAnchor,
} from './types'

export type Tab = 'discover' | 'read' | 'compare' | 'synthesis'
export type Page = 'library' | 'wiki' | 'check' | 'settings'
export type Route = { view: 'home' } | { view: 'topic'; topicId: string; tab: Tab;sourceVersion?:string }
  | { view: 'library'; paperId?: string } | { view: Exclude<Page, 'library'>;topicId?:string;draftId?:string;sentenceId?:string }

type TaskState = 'idle' | 'running' | 'done'
type ExternalGrant = { runId: string; requestId: string; paperIds: string[]; status: 'pending' | 'received' }
type ManuscriptCheck = DraftSnapshot & { status: TaskState; runId: string | null; checking: string | null; history: DraftSnapshot[] }

export interface State {
  mainline?: {
    demo: boolean; papers: Record<string, Paper>; evidence: Record<string, EvidenceAnchor>
    search: (query: string, filters?: { year_from?: number; year_to?: number; venue?:string }) => void
    pages?:Page[]
    addCandidates?:(ids:string[])=>void
    venueFilter?:boolean
    interval?:number
    watch?:(days:number)=>void
    activity?:{id:string;title:string;detail:string;topic:string;open:()=>void}[]
    rename?: (kind: 'topic' | 'session', topic: string, id: string, title: string) => Promise<void>
    bookmark?:(version:string,passage:string)=>void
    selectQuote?:(version:string,passage:string,quote:string)=>void
    saveAnswer?:(message:ChatMessage)=>void
    attachFiles?:(files?:File[])=>void
    searchBusy: boolean
  }
  topics: Topic[]
  route: Route
  paperTopics: Record<string, string[]>
  discovery: { status: TaskState; question: string; round: number; coverage?: Coverage; summary?: string; interrupted?: boolean }
  angles: SearchAngle[]
  candidates: Candidate[]
  runs: Record<string, AgentRun>
  runOrder: string[]
  sessions: Session[]
  activeSessionId: string | null
  messages: ChatMessage[]
  qaRunning: boolean
  comparison: { status: TaskState; rows: ComparisonRow[]; verdict?: string; summary?: string }
  cited: string[]
  noted: string[]
  activeEvidence: { id: string; anchor: string; scroll: boolean; region?: import('../api/reader').Selection['rect']; pdfPage?: number } | null
  trace: { open: boolean; focus: string | null }
  readerPaperId: string
  dropped: string[]
  homeRevision: number
  library: string[]
  trash: TrashItem[]
  purgedPapers: Record<string, { clearExcerpts: boolean }>
  dupReview: 'pending' | 'merged' | 'separate'
  check: { activeId: string; manuscripts: Record<string, ManuscriptCheck> }
  wiki: { status: TaskState; runId: string | null; pages: WikiPage[]; proposal: WikiProposal | null; active: string; discarded: boolean }
  settings: Settings
  settingsNotice: string | null
  externalGrant: ExternalGrant | null
}

export const baseState: State = {
  topics: TOPICS,
  route: { view: 'home' },
  paperTopics: SAMPLE_MEMBERSHIP,
  discovery: { status: 'idle', question: DEFAULT_QUESTION, round: 0 },
  angles: [],
  candidates: [],
  runs: {},
  runOrder: [],
  sessions: SESSIONS,
  activeSessionId: SEED_SESSION,
  messages: [],
  qaRunning: false,
  comparison: { status: 'idle', rows: [] },
  cited: [],
  noted: WIKI_NOTE_SEED,
  activeEvidence: null,
  trace: { open: false, focus: null },
  readerPaperId: 'qasper',
  dropped: [],
  homeRevision: 0,
  library: LIBRARY_SEED,
  trash: [],
  purgedPapers: {},
  dupReview: 'pending',
  check: { activeId: MANUSCRIPTS[0].id, manuscripts: Object.fromEntries(MANUSCRIPTS.map(({ id, sentences }) => [id, {
    status: 'idle', runId: null, checking: null, version: 1, sentences, findings: {}, reviewed: {}, recheck: [], history: [],
  }])) },
  wiki: { status: 'idle', runId: null, pages: WIKI_SEED, proposal: null, active: WIKI_SEED[0].id, discarded: false },
  settings: {
    model: 'anthropic', tested: {}, budget: { ...unlimitedBudget }, askBeyond: true,
    models: {
      anthropic: { modelId: 'claude-sonnet-5-5', endpoint: '' },
      compatible: { modelId: '', endpoint: '' },
      local: { modelId: '', endpoint: '' },
    },
    sources: { openalex: true, s2: true, arxiv: false },
  },
  settingsNotice: null,
  externalGrant: null,
}

type Action =
  | { type: 'navigate'; route: Route }
  | { type: 'home-new' }
  | { type: 'topic-create'; topic: Topic; session: Session; message: ChatMessage }
  | { type: 'event'; event: TaskEvent; runId?: string; usage?: Usage }
  | { type: 'discovery-start'; question: string; round: number }
  | { type: 'run-limit'; runId: string; limit?: string }
  | { type: 'decide'; candidateId: string; decision: Decision }
  | { type: 'user-message'; message: ChatMessage }
  | { type: 'compare-start' }
  | { type: 'evidence-open'; id: string; anchor: string; scroll: boolean }
  | { type: 'evidence-close' }
  | { type: 'toggle'; list: 'cited' | 'noted'; id: string }
  | { type: 'trace'; open: boolean; focus?: string | null }
  | { type: 'reader'; paperId: string }
  | { type: 'drop'; names: string[] }
  | { type: 'session-new'; session: Session }
  | { type: 'session-open'; id: string }
  | { type: 'session-delete'; id: string }
  | { type: 'topic-delete'; id: string }
  | { type: 'lib-delete'; paperId: string }
  | { type: 'lib-restore'; paperId: string }
  | { type: 'lib-empty'; clearExcerpts: boolean }
  | { type: 'lib-link'; paperId: string; topicId: string }
  | { type: 'lib-unlink'; paperId: string; topicId: string }
  | { type: 'lib-dup'; choice: 'merged' | 'separate' }
  | { type: 'check-select'; manuscriptId: string }
  | { type: 'check-start'; manuscriptId: string; runId: string; sentenceId: string | null }
  | { type: 'check-edit'; manuscriptId: string; sentenceId: string; proposal: string }
  | { type: 'check-review'; manuscriptId: string; sentenceId: string; decision: FindingDecision | undefined }
  | { type: 'wiki-start'; runId: string }
  | { type: 'wiki-accept' }
  | { type: 'wiki-discard' }
  | { type: 'wiki-open'; id: string }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'model-config'; provider: ModelProvider; patch: Partial<ModelConfig> }
  | { type: 'model-tested'; provider: ModelProvider }
  | { type: 'settings-notice'; message: string | null }
  | { type: 'external-grant'; grant: ExternalGrant | null }
  | { type: 'external-reply'; requestId: string }

const upsert = <T extends { id: string }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]

export function sourceStatus(s: State, paperId: string) {
  if (s.purgedPapers[paperId]) return 'deleted'
  if (s.trash.some((item) => item.paperId === paperId)) return 'in trash'
  return 'available'
}

export const evidenceAvailable = (s: State, id: string) =>
  !!EVIDENCE[id] && sourceStatus(s, EVIDENCE[id].paperId) === 'available'

export const wikiEvidenceAvailable = (s: State, id: string) =>
  evidenceAvailable(s, id) && s.library.includes(EVIDENCE[id].paperId)

export function wikiComparisonRows(s: State) {
  if (s.comparison.status !== 'done') return []
  const rows = s.comparison.rows.filter((row) => row.cells.every((cell) => cell.status === 'sourced' && cell.evidenceId))
  return rows.every((row) => row.cells.every((cell) => wikiEvidenceAvailable(s, cell.evidenceId!))) ? rows : []
}

function checkSourceAvailable(s: State, citeKeys: Record<string, string>, cite: string) {
  const paperId = citeKeys[cite]
  return !!paperId && s.library.includes(paperId) && sourceStatus(s, paperId) === 'available'
}

function checkFindingSources(s: State, citeKeys: Record<string, string>, f: Finding): Finding {
  const available = (cite: string) => checkSourceAvailable(s, citeKeys, cite)
  const claims = f.claims.map((claim) => {
    const missing = claim.cite && !available(claim.cite)
    if (!missing) return claim
    return { ...claim, status: 'blocked' as const, note: 'Source @' + claim.cite + ' is unavailable in the library.' }
  })
  const sources = f.sources?.map((source) => available(source.cite) ? source : {
    ...source, note: 'Source @' + source.cite + ' is unavailable in the library.',
  })
  if (sources?.length && sources.every((source) => !available(source.cite))) {
    claims[0] = { ...claims[0], status: 'blocked', note: 'The cited sources are unavailable in the library.' }
  }
  return {
    ...f, claims, sources,
    suggestions: f.suggestions?.filter(({ cite }) => available(cite)),
    rewrite: claims.some((c) => c.status === 'blocked') ? undefined : f.rewrite,
  }
}

export function currentFinding(s: State, manuscript: typeof MANUSCRIPTS[number], sentence: DraftSentence): Finding | undefined {
  const f = s.check.manuscripts[manuscript.id].findings[sentence.id]
  return f && checkFindingSources(s, manuscript.citeKeys, f)
}

function updateManuscript(s: State, id: string, check: ManuscriptCheck): State {
  return { ...s, check: { ...s.check, manuscripts: { ...s.check.manuscripts, [id]: check } } }
}

const manuscriptForRun = (s: State, runId: string) =>
  Object.entries(s.check.manuscripts).find(([, check]) => check.runId === runId)

export function libraryFiles(s: State, paperId: string): FileVersion[] {
  const files = LIBRARY_META[paperId].files
  return paperId === DUPLICATE_REVIEW.paperId && s.dupReview === 'merged' ? [...files, DUPLICATE_REVIEW.version] : files
}

const addUnique = (ids: string[], id: string) => ids.includes(id) ? ids : [...ids, id]

function setPaperTopics(s: State, paperId: string, topics: string[]): State {
  const inDemo = topics.includes(DEMO_TOPIC)
  return {
    ...s,
    paperTopics: { ...s.paperTopics, [paperId]: topics },
    candidates: s.candidates.map((c) => c.paperId !== paperId ? c : {
      ...c, decision: inDemo ? 'added' : c.decision === 'added' ? 'pending' : c.decision,
    }),
  }
}

function restorePaper(s: State, paperId: string, extraTopic?: string): State {
  const item = s.trash.find((t) => t.paperId === paperId)
  if (!item) return s
  const existing = item.topics.filter((id) => s.topics.some((t) => t.id === id))
  return setPaperTopics({
    ...s, library: addUnique(s.library, paperId), trash: s.trash.filter((t) => t.paperId !== paperId),
  }, paperId, extraTopic ? addUnique(existing, extraTopic) : existing)
}

function applyEvent(s: State, e: TaskEvent): State {
  switch (e.type) {
    case 'run':
      return { ...s, runs: { ...s.runs, [e.run.id]: e.run }, runOrder: [e.run.id, ...s.runOrder] }
    case 'step': {
      const run = s.runs[e.runId]
      return run ? { ...s, runs: { ...s.runs, [run.id]: { ...run, steps: [...run.steps, e.step] } } } : s
    }
    case 'angle':
      return { ...s, angles: upsert(s.angles, e.angle) }
    case 'candidate': {
      const c = e.candidate
      const previous = s.candidates.find((item) => item.id === c.id)
      const decision: Decision = topicsOfPaper(s, c.paperId).includes(DEMO_TOPIC) ? 'added'
        : previous?.decision === 'held' || previous?.decision === 'excluded' ? previous.decision : 'pending'
      const candidates = upsert(s.candidates, { ...c, decision })
      return { ...s, candidates }
    }
    case 'message':
      return { ...s, messages: [...s.messages, e.message] }
    case 'text':
      return {
        ...s,
        messages: s.messages.map((m) => {
          if (m.id !== e.messageId) return m
          const segments = [...m.segments]
          const seg = segments[e.index]
          segments[e.index] = seg
            ? { ...seg, text: seg.text + e.chunk }
            : { text: e.chunk, evidenceId: e.evidenceId, tone: e.tone }
          return { ...m, segments }
        }),
      }
    case 'row':
      return { ...s, comparison: { ...s.comparison, rows: upsert(s.comparison.rows, e.row) } }
    case 'finding': {
      const entry = manuscriptForRun(s, e.runId)
      if (!entry) return s
      const [manuscriptId, check] = entry
      const id = e.finding.sentenceId
      return updateManuscript(s, manuscriptId, { ...check, recheck: check.recheck.filter((item) => item !== id),
        findings: { ...check.findings, [id]: e.finding } })
    }
    case 'wiki-proposal':
      return s.wiki.runId === e.runId ? { ...s, wiki: { ...s.wiki, proposal: e.proposal } } : s
    case 'done': {
      const run = s.runs[e.runId]
      if (!run) return s
      const next: State = { ...s, runs: { ...s.runs, [run.id]: { ...run, status: e.status, summary: e.summary, limit: undefined } },
        externalGrant: s.externalGrant?.runId === run.id ? null : s.externalGrant }
      if (run.task === 'Discovery') {
        next.discovery = { ...s.discovery, status: 'done', coverage: e.coverage, summary: e.summary, interrupted: e.interrupted }
        if (e.interrupted) {
          next.angles = s.angles.map((a) => a.status === 'covered' || a.status === 'gap' ? a : { ...a, status: 'gap', gapReason: 'Stopped at the task budget.' })
          next.discovery.coverage = {
            covered: next.angles.filter((a) => a.status === 'covered').map((a) => a.label),
            gaps: next.angles.filter((a) => a.status === 'gap').map((a) => a.label + ' · ' + (a.gapReason ?? 'No candidate passed screening.')),
          }
        }
      }
      if (run.task === 'Citation check') {
        const entry = manuscriptForRun(s, e.runId)
        return entry ? updateManuscript(next, entry[0], { ...entry[1], status: 'done', runId: null, checking: null }) : next
      }
      if (run.task === 'Wiki draft' && s.wiki.runId === e.runId) next.wiki = { ...s.wiki, status: 'done' }
      if (run.task === 'Comparison') next.comparison = { ...s.comparison, status: 'done', verdict: e.verdict, summary: e.summary }
      if (run.task === 'Question') {
        next.qaRunning = false
        next.messages = s.messages.map((m) => (m.id === e.messageId ? { ...m, done: true } : m))
      }
      return next
    }
  }
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'session-delete': {
      const runIds = new Set(s.messages.filter((m) => m.sessionId === a.id).map((m) => m.runId).filter(Boolean))
      const sessions = s.sessions.filter((x) => x.id !== a.id)
      const active = s.activeSessionId === a.id
      const topicId = s.sessions.find((x) => x.id === a.id)?.topicId
      const nextId = active ? sessions.filter((x) => x.topicId === topicId).sort((x, y) => y.order - x.order)[0]?.id ?? null : s.activeSessionId
      const runs = Object.fromEntries(Object.entries(s.runs).filter(([id]) => !runIds.has(id)))
      return { ...s, sessions, activeSessionId: nextId,
        messages: s.messages.filter((m) => m.sessionId !== a.id), runs,
        runOrder: s.runOrder.filter((id) => !runIds.has(id)),
        qaRunning: Object.values(runs).some((r) => r.task === 'Question' && r.status === 'running'),
        externalGrant: s.externalGrant && runs[s.externalGrant.runId] ? s.externalGrant : null,
        route: active && !nextId && s.route.view === 'topic' && s.route.tab === 'read' ? { view: 'home' } : s.route,
        activeEvidence: null, trace: { open: false, focus: null } }
    }
    case 'topic-delete': {
      const topics = s.topics.filter((t) => t.id !== a.id)
      const sessions = s.sessions.filter((x) => x.topicId !== a.id)
      const paperTopics = Object.fromEntries(Object.entries(s.paperTopics).map(([id, ids]) => [id, ids.filter((topicId) => topicId !== a.id)]))
      const trash = s.trash.map((t) => ({ ...t, topics: t.topics.filter((id) => id !== a.id) }))
      if (a.id === DEMO_TOPIC) return { ...baseState, topics, sessions, homeRevision: s.homeRevision,
        runs: Object.fromEntries(Object.entries(s.runs).filter(([, run]) => run.task === 'Citation check')),
        runOrder: s.runOrder.filter((id) => s.runs[id]?.task === 'Citation check'),
        library: s.library, trash, paperTopics, purgedPapers: s.purgedPapers, cited: s.cited, noted: s.noted,
        dupReview: s.dupReview, check: s.check, settings: s.settings,
        externalGrant: s.externalGrant && s.runs[s.externalGrant.runId]?.task === 'Citation check' ? s.externalGrant : null,
        wiki: s.wiki.status === 'running' ? {
          ...s.wiki, status: 'idle', runId: null, proposal: null, active: s.wiki.pages[0].id,
        } : s.wiki,
        messages: s.messages.filter((m) => sessions.some((x) => x.id === m.sessionId)),
        activeSessionId: sessions.some((x) => x.id === s.activeSessionId) ? s.activeSessionId : null,
        route: s.route.view === 'topic' && s.route.topicId !== a.id ? s.route : { view: 'home' } }
      return { ...s, topics, sessions, paperTopics, trash,
        activeSessionId: sessions.some((x) => x.id === s.activeSessionId) ? s.activeSessionId : null,
        messages: s.messages.filter((m) => sessions.some((x) => x.id === m.sessionId)),
        route: s.route.view === 'topic' && s.route.topicId === a.id ? { view: 'home' } : s.route,
        activeEvidence: null }
    }
    case 'home-new':
      return { ...s, route: { view: 'home' }, dropped: [], homeRevision: s.homeRevision + 1,
        activeSessionId: null, activeEvidence: null, trace: { open: false, focus: null } }
    case 'topic-create':
      return { ...s, topics: [a.topic, ...s.topics], sessions: [...s.sessions, a.session],
        messages: [...s.messages, a.message], activeSessionId: a.session.id, dropped: [],
        route: { view: 'topic', topicId: a.topic.id, tab: 'read' },
        activeEvidence: null, trace: { open: false, focus: null } }
    case 'navigate': {
      const next = { ...s, route: a.route, activeEvidence: null }
      if (a.route.view === 'topic' && a.route.tab === 'read') {
        const topicId = a.route.topicId
        const current = s.sessions.find((x) => x.id === s.activeSessionId)
        if (current?.topicId !== topicId) next.activeSessionId = sessionsOf(s, topicId)[0]?.id ?? null
      }
      return next
    }
    case 'session-new':
      return { ...s, sessions: [...s.sessions, a.session], activeSessionId: a.session.id,
        route: { view: 'topic', topicId: a.session.topicId, tab: 'read' }, activeEvidence: null }
    case 'session-open': {
      const ses = s.sessions.find((x) => x.id === a.id)
      return ses ? { ...s, activeSessionId: ses.id, route: { view: 'topic', topicId: ses.topicId, tab: 'read' }, activeEvidence: null } : s
    }
    case 'event': {
      const next = applyEvent(s, a.event)
      const run = a.runId ? next.runs[a.runId] : undefined
      if (!run || !a.usage) return next
      return { ...next, runs: { ...next.runs, [run.id]: { ...run, usage: a.usage } } }
    }
    case 'discovery-start':
      return { ...s, discovery: { status: 'running', question: a.question, round: a.round } }
    case 'run-limit': {
      const run = s.runs[a.runId]
      if (run?.status !== 'running') return s
      return { ...s, runs: { ...s.runs, [a.runId]: { ...run, limit: a.limit } } }
    }
    case 'decide': {
      const c = s.candidates.find((x) => x.id === a.candidateId)
      if (!c) return s
      if (a.decision === 'added') {
        if (sourceStatus(s, c.paperId) === 'deleted') return s
        if (sourceStatus(s, c.paperId) === 'in trash') return restorePaper(s, c.paperId, DEMO_TOPIC)
        return setPaperTopics({ ...s, library: addUnique(s.library, c.paperId) }, c.paperId, addUnique(topicsOfPaper(s, c.paperId), DEMO_TOPIC))
      }
      const next = setPaperTopics(s, c.paperId, topicsOfPaper(s, c.paperId).filter((id) => id !== DEMO_TOPIC))
      return {
        ...next, candidates: next.candidates.map((x) => x.id === c.id ? { ...x, decision: a.decision } : x),
      }
    }
    case 'user-message': {
      const text = a.message.segments[0]?.text ?? ''
      const sessions = s.sessions.map((x) => x.id !== a.message.sessionId ? x : {
        ...x, updated: 'Just now', order: maxOrder(s) + 1,
        title: x.title === NEW_SESSION ? (text.length > 48 ? `${text.slice(0, 46)}…` : text) : x.title,
      })
      return { ...s, sessions, messages: [...s.messages, a.message], qaRunning: true }
    }
    case 'compare-start':
      return { ...s, comparison: { status: 'running', rows: [] } }
    case 'evidence-open': {
      const ev = EVIDENCE[a.id]
      if (!ev) return s
      const scroll = a.scroll && evidenceAvailable(s, a.id)
      return { ...s, activeEvidence: { id: a.id, anchor: a.anchor, scroll }, readerPaperId: scroll ? ev.paperId : s.readerPaperId }
    }
    case 'evidence-close':
      return { ...s, activeEvidence: null }
    case 'toggle': {
      const list = s[a.list]
      if (!list.includes(a.id) && !evidenceAvailable(s, a.id)) return s
      return { ...s, [a.list]: list.includes(a.id) ? list.filter((x) => x !== a.id) : [...list, a.id] }
    }
    case 'trace':
      return { ...s, trace: { open: a.open, focus: a.focus === undefined ? s.trace.focus : a.focus } }
    case 'reader':
      return { ...s, readerPaperId: a.paperId, activeEvidence: null }
    case 'drop':
      return { ...s, dropped: [...s.dropped, ...a.names] }
    case 'lib-delete': {
      if (!s.library.includes(a.paperId)) return s
      const item: TrashItem = { paperId: a.paperId, topics: topicsOfPaper(s, a.paperId), when: 'Just now' }
      return setPaperTopics({
        ...s, library: s.library.filter((id) => id !== a.paperId), trash: [item, ...s.trash], activeEvidence: null,
        externalGrant: s.externalGrant?.paperIds.includes(a.paperId) ? null : s.externalGrant,
      }, a.paperId, [])
    }
    case 'lib-restore':
      return restorePaper(s, a.paperId)
    case 'lib-empty': {
      const purgedPapers = { ...s.purgedPapers }
      for (const item of s.trash) purgedPapers[item.paperId] = { clearExcerpts: a.clearExcerpts }
      const keep = (id: string) => !purgedPapers[EVIDENCE[id]?.paperId]?.clearExcerpts
      return { ...s, trash: [], purgedPapers, cited: s.cited.filter(keep), noted: s.noted.filter(keep), activeEvidence: null }
    }
    case 'lib-link':
      return s.library.includes(a.paperId) && s.topics.some((t) => t.id === a.topicId)
        ? setPaperTopics(s, a.paperId, addUnique(topicsOfPaper(s, a.paperId), a.topicId))
        : s
    case 'lib-unlink':
      return setPaperTopics(s, a.paperId, topicsOfPaper(s, a.paperId).filter((id) => id !== a.topicId))
    case 'lib-dup':
      if (s.dupReview !== 'pending' || (a.choice === 'merged' && !s.library.includes(DUPLICATE_REVIEW.paperId))) return s
      return { ...s, dupReview: a.choice, library: a.choice === 'separate' ? addUnique(s.library, DUPLICATE_REVIEW.separateId) : s.library }
    case 'check-select':
      return s.check.manuscripts[a.manuscriptId] ? { ...s, activeEvidence: null, check: { ...s.check, activeId: a.manuscriptId } } : s
    case 'check-start': {
      const c = s.check.manuscripts[a.manuscriptId]
      if (!c || c.status === 'running') return s
      return updateManuscript(s, a.manuscriptId, { ...c, status: 'running', runId: a.runId, checking: a.sentenceId })
    }
    case 'check-edit': {
      const manuscript = MANUSCRIPTS.find(({ id }) => id === a.manuscriptId)
      const c = s.check.manuscripts[a.manuscriptId]
      if (!manuscript || c.status === 'running') return s
      const sentence = c.sentences.find((item) => item.id === a.sentenceId)
      if (!sentence) return s
      const f = currentFinding(s, manuscript, sentence)
      const suggestion = f?.suggestions?.find(({ cite }) => cite === a.proposal)
      const edit = a.proposal === 'rewrite' ? f?.rewrite
        : suggestion && { text: sentence.text, cites: addUnique(sentence.cites, suggestion.cite) }
      if (!edit) return s

      const snapshot: DraftSnapshot = { version: c.version, sentences: c.sentences, reviewed: c.reviewed, recheck: c.recheck,
        findings: Object.fromEntries(c.sentences.flatMap((item) => {
          const finding = currentFinding(s, manuscript, item)
          return finding ? [[item.id, finding]] : []
        })) }
      const findings = { ...c.findings }
      const reviewed = { ...c.reviewed }
      delete findings[sentence.id]
      delete reviewed[sentence.id]
      return updateManuscript({ ...s, activeEvidence: null }, manuscript.id, { ...c, version: c.version + 1, history: [...c.history, snapshot],
        sentences: c.sentences.map((item) => item.id === sentence.id ? { ...item, ...edit } : item),
        findings, reviewed, recheck: addUnique(c.recheck, sentence.id) })
    }
    case 'check-review': {
      const manuscript = MANUSCRIPTS.find(({ id }) => id === a.manuscriptId)
      const c = s.check.manuscripts[a.manuscriptId]
      const sentence = c?.sentences.find((item) => item.id === a.sentenceId)
      const finding = manuscript && sentence && currentFinding(s, manuscript, sentence)
      if (!finding || c.status === 'running') return s
      const reviewed = { ...c.reviewed }
      if (a.decision) reviewed[a.sentenceId] = { decision: a.decision, finding }
      else delete reviewed[a.sentenceId]
      return updateManuscript(s, a.manuscriptId, { ...c, reviewed })
    }
    case 'wiki-start':
      if (s.wiki.status === 'running' || s.wiki.proposal) return s
      return { ...s, activeEvidence: null, wiki: {
        ...s.wiki, runId: a.runId, active: 'draft', status: 'running', proposal: null, discarded: false,
      } }
    case 'wiki-accept': {
      const p = s.wiki.proposal
      if (!p || s.wiki.status !== 'done') return s
      const { changes } = reviewWikiProposal(p, s.wiki.pages, (id) => wikiEvidenceAvailable(s, id))
      if (!changes.length) return s
      let pages = s.wiki.pages
      for (const { current, proposed, count } of changes) {
        pages = upsert(pages, {
          ...proposed,
          statements: [...(current?.statements ?? []), ...proposed.statements],
          relations: [...(current?.relations ?? []), ...proposed.relations],
          questions: [...(current?.questions ?? []), ...proposed.questions],
          revisions: [{ when: 'Just now', who: 'You', what: `Accepted ${count} ${count === 1 ? 'addition' : 'additions'} from the agent draft` }, ...proposed.revisions],
        })
      }
      return { ...s, activeEvidence: null, wiki: { ...s.wiki, status: 'idle', runId: null, proposal: null, active: changes[0].proposed.id, pages } }
    }
    case 'wiki-discard':
      if (!s.wiki.proposal) return s
      return { ...s, activeEvidence: null, wiki: {
        ...s.wiki, status: 'idle', runId: null, proposal: null, active: s.wiki.pages[0].id, discarded: true,
      } }
    case 'wiki-open':
      return { ...s, route: { view: 'wiki' }, activeEvidence: null, wiki: { ...s.wiki, active: a.id } }
    case 'settings':
      return { ...s, settings: { ...s.settings, ...a.patch } }
    case 'model-config': {
      const settings = s.settings
      return { ...s, settings: { ...settings,
        models: { ...settings.models, [a.provider]: { ...settings.models[a.provider], ...a.patch } },
        tested: { ...settings.tested, [a.provider]: undefined },
      } }
    }
    case 'model-tested': {
      const errors = modelErrors(a.provider, s.settings.models[a.provider])
      if (errors.endpoint || errors.modelId) return s
      return { ...s, settings: { ...s.settings, tested: { ...s.settings.tested, [a.provider]: true } } }
    }
    case 'settings-notice':
      return { ...s, settingsNotice: a.message }
    case 'external-grant':
      return { ...s, externalGrant: a.grant }
    case 'external-reply': {
      const grant = s.externalGrant
      const run = grant && s.runs[grant.runId]
      if (!grant || grant.requestId !== a.requestId || run?.status !== 'running'
        || grant.paperIds.some((id) => !s.library.includes(id))) return s
      return applyEvent({ ...s, externalGrant: { ...grant, status: 'received' } }, {
        type: 'step', runId: run.id, step: {
          id: a.requestId, kind: 'observe', title: 'Simulated read-only helper responded',
          detail: 'Suggested reviewing the selected papers. No request was sent and no research records changed.',
        },
      })
    }
  }
}

export const NEW_SESSION = 'New session'
export const currentTopic = (s: State) => s.route.view === 'topic' ? s.route.topicId : DEMO_TOPIC
export const paperFor = (s: State, id: string) => (s.mainline?.papers ?? PAPERS)[id]
export const evidenceFor = (s: State, id: string) => (s.mainline?.evidence ?? EVIDENCE)[id]
export const allEvidence = (s: State) => Object.values(s.mainline?.evidence ?? EVIDENCE)
const maxOrder = (s: State) => Math.max(0, ...s.sessions.map((x) => x.order))
export const sessionsOf = (s: State, topicId: string) =>
  s.sessions.filter((x) => x.topicId === topicId).sort((a, b) => b.order - a.order)
export const topicsOfPaper = (s: State, paperId: string) => s.paperTopics[paperId] ?? []
export const papersOfTopic = (s: State, topicId: string) => s.library.filter((id) => topicsOfPaper(s, id).includes(topicId))
export const hasMessages = (s: State, sessionId: string) => s.messages.some((m) => m.sessionId === sessionId)

/** Start with the seed session already answered, by replaying its scripted events once. */
function seededState(): State {
  const q = SEED_QUESTION
  let s: State = { ...baseState, messages: [{ id: 'seed-u', sessionId: SEED_SESSION, role: 'user', segments: [{ text: q.text }], done: true }] }
  for (const item of questionScript(q.id, q.text, 'seed-run', 'seed-a', SEED_SESSION)) s = applyEvent(s, item.event)
  return { ...s, qaRunning: false }
}
const initialState = seededState()

function useActions(dispatch: React.Dispatch<Action>, getState: () => State) {
  const seq = useRef(0)
  const tasks = useRef<Record<string, ReturnType<typeof runTask> & { sessionId?: string; stop: (limit: string) => void }>>({})
  const helperRequest = useRef(0)
  const id = (p: string) => `${p}-${++seq.current}`

  function prepareRun(paperIds: string[], discovery = false): RunConfiguration | undefined {
    const { settings, library } = getState()
    const model = settings.models[settings.model]
    const errors = modelErrors(settings.model, model)
    const sources = discovery ? enabledSources(settings) : []
    const message = errors.endpoint || errors.modelId
      ? 'Finish configuring the selected model before starting a task.'
      : discovery && sources.length === 0 ? 'Enable a literature search source before searching.' : null
    dispatch({ type: 'settings-notice', message })
    if (message) return
    const local = settings.model === 'local'
    const destination = local ? 'On-device Ollama' : settings.model === 'compatible' ? model.endpoint.trim() : 'Anthropic API'
    return { model: model.modelId.trim(), destination, sources,
      paperIds: [...new Set(paperIds)].filter((id) => library.includes(id)),
      budget: { ...settings.budget }, askBeyond: settings.askBeyond, local,
    }
  }

  const start = (taskId: string, items: ScriptItem[], configuration: RunConfiguration, sessionId?: string) => {
    const estimate = estimateRun(items, configuration.local)
    const terminal = items.at(-1)?.event
    const stop = (limit: string) => {
      tasks.current[taskId]?.cancel()
      delete tasks.current[taskId]
      dispatch({ type: 'event', event: { type: 'done', runId: taskId, status: 'partial',
        summary: `Stopped at the task budget (${limit}). Work completed so far is retained.`,
        messageId: terminal?.type === 'done' ? terminal.messageId : undefined, interrupted: true } })
      dispatch({ type: 'trace', open: true, focus: taskId })
    }
    const playback = runTask(taskId, items, configuration, (n, usage) => {
      const event = n.params.event
      dispatch({ type: 'event', runId: taskId, usage,
        event: event.type === 'run' ? { ...event, run: { ...event.run, configuration, estimate } } : event })
      if (event.type === 'done') delete tasks.current[taskId]
    }, (limit) => {
      if (configuration.askBeyond) dispatch({ type: 'run-limit', runId: taskId, limit })
      else stop(limit)
    })
    tasks.current[taskId] = { ...playback, sessionId, stop }
  }

  return useMemo(() => {
    const runDiscovery = (question: string, refine = false) => {
      const s = getState()
      if (s.discovery.status === 'running') return
      const config = prepareRun(papersOfTopic(s, DEMO_TOPIC), true)
      if (!config) return
      const refinement = refine ? {
        feedback: s.candidates.filter((c) => c.decision === 'excluded').map((c) => PAPERS[c.paperId].short),
        angles: s.angles,
      } : undefined
      dispatch({ type: 'discovery-start', question, round: refine ? 2 : 1 })
      const runId = id('run')
      start(runId, discoveryScript(runId, question, config.sources, refinement), config)
    }
    const newSession = (topicId: string): string => {
      const s = getState()
      const empty = sessionsOf(s, topicId).find((x) => !hasMessages(s, x.id))
      if (empty) { dispatch({ type: 'session-open', id: empty.id }); return empty.id }
      const session = { id: id('ses'), topicId, title: NEW_SESSION, updated: 'Just now', order: maxOrder(s) + 1 }
      dispatch({ type: 'session-new', session })
      return session.id
    }
    const runCheck = (manuscriptId: string, sentenceId: string | null) => {
      const s = getState()
      const manuscript = MANUSCRIPTS.find(({ id }) => id === manuscriptId)
      const c = s.check.manuscripts[manuscriptId]
      if (!manuscript || c.status === 'running') return
      const index = c.sentences.findIndex((sentence) => sentence.id === sentenceId)
      if (sentenceId !== null && (index < 0 || !c.recheck.includes(sentenceId))) return
      const sentences = sentenceId === null ? c.sentences : [c.sentences[index]]
      const config = prepareRun(sentences.flatMap((sentence) => sentence.cites.map((key) => manuscript.citeKeys[key]).filter(Boolean)))
      if (!config) return
      const runId = id('run')
      dispatch({ type: 'check-start', manuscriptId, runId, sentenceId })
      start(runId, checkScript(runId, manuscript, c.version, sentences,
        (finding) => checkFindingSources(s, manuscript.citeKeys, finding), index < 0 ? undefined : index + 1), config)
    }
    return {
    /** Opening a topic resumes its session; only an explicit new-session action creates one. */
    enterTopic(topicId: string) {
      dispatch({ type: 'navigate', route: { view: 'topic', topicId, tab: 'read' } })
    },
    newSession,
    deleteSession(sessionId: string) {
      Object.entries(tasks.current).forEach(([id, task]) => {
        if (task.sessionId === sessionId) { task.cancel(); delete tasks.current[id] }
      })
      dispatch({ type: 'session-delete', id: sessionId })
    },
    deleteTopic(topicId: string) {
      if (topicId === DEMO_TOPIC) {
        const checks = new Set(Object.values(getState().check.manuscripts).map((check) => check.runId))
        Object.entries(tasks.current).forEach(([runId, task]) => {
          if (!checks.has(runId)) { task.cancel(); delete tasks.current[runId] }
        })
      }
      dispatch({ type: 'topic-delete', id: topicId })
    },
    openSession: (sessionId: string) => dispatch({ type: 'session-open', id: sessionId }),
    navigate: (route: Route) => dispatch({ type: 'navigate', route }),
    openTopic: (topicId: string, tab: Tab = 'discover') => dispatch({ type: 'navigate', route: { view: 'topic', topicId, tab } }),

    newTopic: () => dispatch({ type: 'home-new' }),
    startFromHome(name: string, text = '') {
      const s = getState()
      const question = text.trim()
      if (!name.trim() && !question && !s.dropped.length) return
      const title = name.trim() || question || s.dropped[0].replace(/\.[^.]+$/, '')
      const shortTitle = title.length > 48 ? `${title.slice(0, 46)}…` : title
      const topic: Topic = { id: id('topic'), title: shortTitle, goal: question || 'Read the attached papers',
        paperCount: s.dropped.length, updated: 'Just now', scripted: false }
      const session: Session = { id: id('ses'), topicId: topic.id, title: shortTitle,
        updated: 'Just now', order: maxOrder(s) + 1, attachments: [...s.dropped] }
      dispatch({ type: 'topic-create', topic, session,
        message: { id: id('msg'), sessionId: session.id, role: 'user',
          segments: [{ text: question || 'Read the attached papers' }], done: true } })
    },
    startDemo() {
      if (!getState().topics.some((t) => t.id === DEMO_TOPIC)) return
      dispatch({ type: 'navigate', route: { view: 'topic', topicId: DEMO_TOPIC, tab: 'discover' } })
      if (getState().discovery.status === 'idle') runDiscovery(DEFAULT_QUESTION)
    },
    runDiscovery,
    refineDiscovery: () => runDiscovery(getState().discovery.question, true),
    decide: (candidateId: string, decision: Decision) => dispatch({ type: 'decide', candidateId, decision }),

    async ask(text: string) {
      const s = getState()
      const papers = papersOfTopic(s, DEMO_TOPIC)
      const script = [...QUESTIONS, SEED_QUESTION].find((q) => q.text === text)
      if (!papers.length || (script?.requires && !papers.includes(script.requires))) return false
      if (script && !papers.includes('qasper')) return false
      const config = prepareRun(papers)
      if (!config) return false
      const sessionId = getState().activeSessionId ?? newSession(DEMO_TOPIC)
      dispatch({ type: 'user-message', message: { id: id('msg'), sessionId, role: 'user', segments: [{ text }], done: true } })
      const runId = id('run')
      start(runId, questionScript(script?.id ?? 'free', text, runId, id('msg'), sessionId), config, sessionId)
      return true
    },
    runComparison() {
      const config = prepareRun(['qasper', 'pubmedqa'])
      if (!config) return
      dispatch({ type: 'compare-start' })
      const runId = id('run')
      start(runId, compareScript(runId), config)
    },

    openEvidence: (evId: string, anchor: string, scroll: boolean) => dispatch({ type: 'evidence-open', id: evId, anchor, scroll }),
    closeEvidence: () => dispatch({ type: 'evidence-close' }),
    toggleCite: (evId: string) => dispatch({ type: 'toggle', list: 'cited', id: evId }),
    toggleNote: (evId: string) => dispatch({ type: 'toggle', list: 'noted', id: evId }),
    showTrace: (open: boolean, focus?: string | null) => dispatch({ type: 'trace', open, focus }),
    setReader: (paperId: string) => dispatch({ type: 'reader', paperId }),
    drop: (names: string[]) => dispatch({ type: 'drop', names }),

    deletePaper: (paperId: string) => dispatch({ type: 'lib-delete', paperId }),
    restorePaper: (paperId: string) => dispatch({ type: 'lib-restore', paperId }),
    emptyTrash: (clearExcerpts: boolean) => dispatch({ type: 'lib-empty', clearExcerpts }),
    linkPaper: (paperId: string, topicId: string) => dispatch({ type: 'lib-link', paperId, topicId }),
    unlinkPaper: (paperId: string, topicId: string) => dispatch({ type: 'lib-unlink', paperId, topicId }),
    resolveDuplicate: (choice: 'merged' | 'separate') => dispatch({ type: 'lib-dup', choice }),

    selectManuscript: (manuscriptId: string) => dispatch({ type: 'check-select', manuscriptId }),
    runCheck: (manuscriptId: string) => runCheck(manuscriptId, null),
    reviseSentence: (manuscriptId: string, sentenceId: string, proposal: string) => dispatch({ type: 'check-edit', manuscriptId, sentenceId, proposal }),
    recheck: (manuscriptId: string, sentenceId: string) => runCheck(manuscriptId, sentenceId),
    reviewFinding: (manuscriptId: string, sentenceId: string, decision: FindingDecision | undefined) =>
      dispatch({ type: 'check-review', manuscriptId, sentenceId, decision }),

    runWikiDraft(noteIds: string[], includeComparison: boolean) {
      const s = getState()
      if (s.wiki.status === 'running' || s.wiki.proposal) return
      const notes = [...new Set(noteIds)].filter((id) => s.noted.includes(id) && wikiEvidenceAvailable(s, id))
      const comparison = includeComparison ? wikiComparisonRows(s) : []
      if (!notes.length && !comparison.length) return
      const config = prepareRun([...notes, ...comparison.flatMap((row) => row.cells.map((c) => c.evidenceId))]
        .flatMap((id) => id && EVIDENCE[id] ? [EVIDENCE[id].paperId] : []))
      if (!config) return
      const runId = id('run')
      dispatch({ type: 'wiki-start', runId })
      start(runId, wikiScript(runId, buildWikiProposal(notes, comparison, s.wiki.pages)), config)
    },
    acceptWiki: () => dispatch({ type: 'wiki-accept' }),
    discardWiki: () => dispatch({ type: 'wiki-discard' }),
    openWikiPage: (pageId: string) => dispatch({ type: 'wiki-open', id: pageId }),
    updateSettings: (patch: Partial<Settings>) => dispatch({ type: 'settings', patch }),
    configureModel: (provider: ModelProvider, patch: Partial<ModelConfig>) => dispatch({ type: 'model-config', provider, patch }),
    testModel: (provider: ModelProvider) => dispatch({ type: 'model-tested', provider }),
    clearSettingsNotice: () => dispatch({ type: 'settings-notice', message: null }),
    resolveBudget(runId: string, allow: boolean) {
      const limit = getState().runs[runId]?.limit
      const task = tasks.current[runId]
      if (!task || !limit) return
      if (allow) {
        dispatch({ type: 'run-limit', runId })
        task.resume()
      } else task.stop(limit)
    },
    grantExternal(runId: string) {
      const s = getState()
      const run = s.runs[runId]
      const paperIds = run?.configuration?.paperIds.filter((id) => s.library.includes(id)) ?? []
      if (s.externalGrant || run?.status !== 'running' || !paperIds.length) return
      const requestId = id('helper')
      dispatch({ type: 'external-grant', grant: { runId, paperIds, requestId, status: 'pending' } })
      helperRequest.current = window.setTimeout(() => dispatch({ type: 'external-reply', requestId }), 1800)
    },
    revokeExternal() {
      window.clearTimeout(helperRequest.current)
      dispatch({ type: 'external-grant', grant: null })
    },
    }
  }, [])
}

type Store = { state: State; act: ReturnType<typeof useActions> }
export const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const ref = useRef(state)
  ref.current = state
  const act = useActions(dispatch, () => ref.current)
  return <StoreContext.Provider value={{ state, act }}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const s = useContext(StoreContext)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}

export const anyRunning = (s: State) => Object.values(s.runs).some((r) => r.status === 'running')
