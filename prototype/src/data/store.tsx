import { createContext, useContext, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { runTask, type ScriptItem } from './runtime'
import { compareScript, discoveryScript, questionScript, QUESTIONS, SEED_QUESTION, refineScript } from './scripts'
import { DEFAULT_QUESTION, DEMO_TOPIC, EVIDENCE, PAPERS, SEED_SESSION, SESSIONS, TOPICS } from './fixtures'
import { checkScript, recheckScript, wikiScript } from './workspaceScripts'
import { DRAFT, LIBRARY_SEED, SAMPLE_MEMBERSHIP, WIKI_SEED } from './workspace'
import type {
  AgentRun, Candidate, ChatMessage, ComparisonRow, Coverage, Decision, DraftSentence, Finding, SearchAngle, Session,
  TaskEvent, Topic, TrashItem, WikiPage, WikiProposal,
} from './types'

export type Tab = 'discover' | 'read' | 'compare'
export type Page = 'library' | 'wiki' | 'check' | 'settings'
export type Route = { view: 'home' } | { view: 'topic'; topicId: string; tab: Tab } | { view: Page }

export interface Settings {
  model: string
  tested: boolean
  budget: { calls: number; tokens: number; minutes: number; cost: number }
  askBeyond: boolean
  sources: Record<string, boolean>
  external: boolean
}
type TaskState = 'idle' | 'running' | 'done'

export interface State {
  topics: Topic[]
  route: Route
  topicPaperIds: string[]
  discovery: { status: TaskState; question: string; round: number; coverage?: Coverage; summary?: string }
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
  activeEvidence: { id: string; anchor: string; scroll: boolean } | null
  trace: { open: boolean; focus: string | null }
  readerPaperId: string
  dropped: string[]
  homeRevision: number
  library: string[]
  trash: TrashItem[]
  /** paperId:topicId pairs removed from sample topics. */
  unlinked: string[]
  dupReview: 'pending' | 'merged' | 'separate'
  check: { status: TaskState; version: number; sentences: DraftSentence[]; findings: Record<string, Finding>; reviewed: string[]; recheck: Record<string, string> }
  wiki: { status: TaskState; pages: WikiPage[]; proposal: WikiProposal | null; active: string; discarded: boolean }
  settings: Settings
}

const baseState: State = {
  topics: TOPICS,
  route: { view: 'home' },
  topicPaperIds: ['qasper'],
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
  noted: [],
  activeEvidence: null,
  trace: { open: false, focus: null },
  readerPaperId: 'qasper',
  dropped: [],
  homeRevision: 0,
  library: LIBRARY_SEED,
  trash: [],
  unlinked: [],
  dupReview: 'pending',
  check: { status: 'idle', version: 1, sentences: DRAFT, findings: {}, reviewed: [], recheck: {} },
  wiki: { status: 'idle', pages: WIKI_SEED, proposal: null, active: WIKI_SEED[0].id, discarded: false },
  settings: {
    model: 'anthropic', tested: false, budget: { calls: 40, tokens: 200000, minutes: 10, cost: 2 }, askBeyond: true,
    sources: { openalex: true, s2: true, arxiv: false }, external: false,
  },
}

type Action =
  | { type: 'navigate'; route: Route }
  | { type: 'home-new' }
  | { type: 'topic-create'; topic: Topic; session: Session; message: ChatMessage }
  | { type: 'event'; event: TaskEvent }
  | { type: 'discovery-start'; question: string }
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
  | { type: 'lib-delete'; paperId: string; clear: boolean }
  | { type: 'lib-restore'; paperId: string }
  | { type: 'lib-empty' }
  | { type: 'lib-unlink'; paperId: string; topicId: string }
  | { type: 'lib-dup'; choice: 'merged' | 'separate' }
  | { type: 'check-start' }
  | { type: 'check-edit'; sentenceId: string; text: string; cites: string[]; evidenceId: string }
  | { type: 'check-review'; sentenceId: string }
  | { type: 'wiki-start' }
  | { type: 'wiki-accept' }
  | { type: 'wiki-discard' }
  | { type: 'wiki-open'; id: string }
  | { type: 'settings'; patch: Partial<Settings> }

const upsert = <T extends { id: string }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]

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
      const candidates = upsert(s.candidates, e.candidate)
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
      const recheck = { ...s.check.recheck }
      delete recheck[e.finding.sentenceId]
      return { ...s, check: { ...s.check, recheck, findings: { ...s.check.findings, [e.finding.sentenceId]: e.finding } } }
    }
    case 'wiki-proposal':
      return { ...s, wiki: { ...s.wiki, proposal: e.proposal } }
    case 'done': {
      const run = s.runs[e.runId]
      if (!run) return s
      const next: State = { ...s, runs: { ...s.runs, [run.id]: { ...run, status: e.status, summary: e.summary } } }
      if (run.task === 'Discovery') next.discovery = { ...s.discovery, status: 'done', coverage: e.coverage, summary: e.summary }
      if (run.task === 'Citation check') next.check = { ...s.check, status: 'done' }
      if (run.task === 'Wiki draft') next.wiki = { ...s.wiki, status: 'done' }
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
        route: active && !nextId && s.route.view === 'topic' && s.route.tab === 'read' ? { view: 'home' } : s.route,
        activeEvidence: null, trace: { open: false, focus: null } }
    }
    case 'topic-delete': {
      const topics = s.topics.filter((t) => t.id !== a.id)
      const sessions = s.sessions.filter((x) => x.topicId !== a.id)
      if (a.id === DEMO_TOPIC) return { ...baseState, topics, sessions, homeRevision: s.homeRevision,
        library: s.library, trash: s.trash.map((t) => ({ ...t, topics: t.topics.filter((x) => x !== a.id) })), unlinked: s.unlinked,
        dupReview: s.dupReview, check: s.check, wiki: s.wiki, settings: s.settings,
        messages: s.messages.filter((m) => sessions.some((x) => x.id === m.sessionId)),
        activeSessionId: sessions.some((x) => x.id === s.activeSessionId) ? s.activeSessionId : null,
        route: s.route.view === 'topic' && s.route.topicId !== a.id ? s.route : { view: 'home' } }
      return { ...s, topics, sessions,
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
    case 'event':
      return applyEvent(s, a.event)
    case 'discovery-start':
      return { ...s, discovery: { ...s.discovery, status: 'running', question: a.question, round: s.discovery.round + 1 } }
    case 'decide': {
      const c = s.candidates.find((x) => x.id === a.candidateId)
      if (!c) return s
      const without = s.topicPaperIds.filter((id) => id !== c.paperId)
      return {
        ...s,
        candidates: s.candidates.map((x) => (x.id === c.id ? { ...x, decision: a.decision } : x)),
        topicPaperIds: a.decision === 'added' ? [...without, c.paperId] : without,
        library: a.decision === 'added' && !s.library.includes(c.paperId) ? [...s.library, c.paperId] : s.library,
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
      return { ...s, activeEvidence: { id: a.id, anchor: a.anchor, scroll: a.scroll }, readerPaperId: a.scroll && ev ? ev.paperId : s.readerPaperId }
    }
    case 'evidence-close':
      return { ...s, activeEvidence: null }
    case 'toggle': {
      const list = s[a.list]
      return { ...s, [a.list]: list.includes(a.id) ? list.filter((x) => x !== a.id) : [...list, a.id] }
    }
    case 'trace':
      return { ...s, trace: { open: a.open, focus: a.focus === undefined ? s.trace.focus : a.focus } }
    case 'reader':
      return { ...s, readerPaperId: a.paperId, activeEvidence: null }
    case 'drop':
      return { ...s, dropped: [...s.dropped, ...a.names] }
    case 'lib-delete': {
      const ev = new Set(Object.values(EVIDENCE).filter((e) => e.paperId === a.paperId).map((e) => e.id))
      const item: TrashItem = { paperId: a.paperId, topics: topicsOfPaper(s, a.paperId), clearExcerpts: a.clear, when: 'Just now' }
      return { ...s, library: s.library.filter((id) => id !== a.paperId), trash: [item, ...s.trash],
        topicPaperIds: s.topicPaperIds.filter((id) => id !== a.paperId),
        candidates: s.candidates.map((c) => (c.paperId === a.paperId && c.decision === 'added' && !c.note ? { ...c, decision: 'pending' } : c)),
        noted: a.clear ? s.noted.filter((id) => !ev.has(id)) : s.noted,
        cited: a.clear ? s.cited.filter((id) => !ev.has(id)) : s.cited }
    }
    case 'lib-restore': {
      const item = s.trash.find((t) => t.paperId === a.paperId)
      if (!item) return s
      const inDemo = item.topics.includes(DEMO_TOPIC) && s.topics.some((t) => t.id === DEMO_TOPIC)
      return { ...s, trash: s.trash.filter((t) => t !== item), library: [...s.library, a.paperId],
        topicPaperIds: inDemo && !s.topicPaperIds.includes(a.paperId) ? [...s.topicPaperIds, a.paperId] : s.topicPaperIds }
    }
    case 'lib-empty':
      return { ...s, trash: [] }
    case 'lib-unlink':
      return a.topicId === DEMO_TOPIC
        ? { ...s, topicPaperIds: s.topicPaperIds.filter((id) => id !== a.paperId),
            candidates: s.candidates.map((c) => (c.paperId === a.paperId && c.decision === 'added' && !c.note ? { ...c, decision: 'pending' } : c)) }
        : { ...s, unlinked: [...s.unlinked, a.paperId + ':' + a.topicId] }
    case 'lib-dup':
      return { ...s, dupReview: a.choice }
    case 'check-start':
      return { ...s, check: { ...s.check, status: 'running', findings: {}, reviewed: [], recheck: {} } }
    case 'check-edit': {
      const f = s.check.findings[a.sentenceId]
      const pending: Finding | undefined = f && { sentenceId: a.sentenceId,
        claims: [{ text: a.text, status: 'pending', note: 'The sentence changed, so its earlier result no longer applies. Re-check needed.' }] }
      return { ...s, check: { ...s.check, version: s.check.version + 1,
        sentences: s.check.sentences.map((x) => (x.id === a.sentenceId ? { ...x, text: a.text, cites: a.cites } : x)),
        findings: pending ? { ...s.check.findings, [a.sentenceId]: pending } : s.check.findings,
        reviewed: s.check.reviewed.filter((id) => id !== a.sentenceId),
        recheck: { ...s.check.recheck, [a.sentenceId]: a.evidenceId } } }
    }
    case 'check-review': {
      const r = s.check.reviewed
      return { ...s, check: { ...s.check, reviewed: r.includes(a.sentenceId) ? r.filter((x) => x !== a.sentenceId) : [...r, a.sentenceId] } }
    }
    case 'wiki-start':
      return { ...s, wiki: { ...s.wiki, status: 'running', proposal: null, discarded: false } }
    case 'wiki-accept': {
      const p = s.wiki.proposal
      if (!p) return s
      const pages = s.wiki.pages.map((pg) => {
        const edit = p.edits.find((e) => e.pageId === pg.id)
        return edit ? { ...pg, relations: [...pg.relations, ...edit.relations],
          revisions: [{ when: 'Just now', who: 'You', what: 'Accepted 1 relation from the agent draft' }, ...pg.revisions] } : pg
      })
      const page = { ...p.page, revisions: [{ when: 'Just now', who: 'You', what: 'Accepted the agent draft' }, ...p.page.revisions] }
      return { ...s, wiki: { ...s.wiki, status: 'idle', proposal: null, active: p.page.id, pages: [...pages, page] } }
    }
    case 'wiki-discard':
      return { ...s, wiki: { ...s.wiki, status: 'idle', proposal: null, discarded: true } }
    case 'wiki-open':
      return { ...s, wiki: { ...s.wiki, active: a.id } }
    case 'settings':
      return { ...s, settings: { ...s.settings, ...a.patch } }
  }
}

export const NEW_SESSION = 'New session'
const maxOrder = (s: State) => Math.max(0, ...s.sessions.map((x) => x.order))
export const sessionsOf = (s: State, topicId: string) =>
  s.sessions.filter((x) => x.topicId === topicId).sort((a, b) => b.order - a.order)
/** Topics a library paper belongs to (demo topic from state, sample topics from fixtures). */
export const topicsOfPaper = (s: State, paperId: string) => [
  ...(s.topicPaperIds.includes(paperId) && s.topics.some((t) => t.id === DEMO_TOPIC) ? [DEMO_TOPIC] : []),
  ...(SAMPLE_MEMBERSHIP[paperId] ?? []).filter((t) => s.topics.some((x) => x.id === t) && !s.unlinked.includes(paperId + ':' + t)),
]
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
  const tasks = useRef<Record<string, { cancel: () => void; sessionId?: string }>>({})
  const id = (p: string) => `${p}-${++seq.current}`
  const start = (taskId: string, items: ScriptItem[], sessionId?: string) => {
    tasks.current[taskId] = { sessionId, cancel: runTask(taskId, items, (n) => {
      dispatch({ type: 'event', event: n.params.event })
      if (n.params.event.type === 'done') delete tasks.current[taskId]
    }) }
  }

  return useMemo(() => {
    const runDiscovery = (question: string) => {
      dispatch({ type: 'discovery-start', question })
      const runId = id('run')
      start(runId, discoveryScript(runId, question))
    }
    const newSession = (topicId: string): string => {
      const s = getState()
      const empty = sessionsOf(s, topicId).find((x) => !hasMessages(s, x.id))
      if (empty) { dispatch({ type: 'session-open', id: empty.id }); return empty.id }
      const session = { id: id('ses'), topicId, title: NEW_SESSION, updated: 'Just now', order: maxOrder(s) + 1 }
      dispatch({ type: 'session-new', session })
      return session.id
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
        Object.values(tasks.current).forEach((task) => task.cancel())
        tasks.current = {}
      }
      dispatch({ type: 'topic-delete', id: topicId })
    },
    openSession: (sessionId: string) => dispatch({ type: 'session-open', id: sessionId }),
    navigate: (route: Route) => dispatch({ type: 'navigate', route }),
    openTopic: (topicId: string, tab: Tab = 'discover') => dispatch({ type: 'navigate', route: { view: 'topic', topicId, tab } }),

    newTopic: () => dispatch({ type: 'home-new' }),
    startFromHome(text: string) {
      const s = getState()
      const question = text.trim()
      if (!question && !s.dropped.length) return
      const title = question || s.dropped[0].replace(/\.[^.]+$/, '')
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
    refineDiscovery() {
      const s = getState()
      const names = s.candidates.filter((c) => c.decision === 'excluded').map((c) => PAPERS[c.paperId].short)
      dispatch({ type: 'discovery-start', question: s.discovery.question })
      const runId = id('run')
      start(runId, refineScript(runId, names))
    },
    decide: (candidateId: string, decision: Decision) => dispatch({ type: 'decide', candidateId, decision }),

    ask(text: string) {
      const sessionId = getState().activeSessionId ?? newSession(DEMO_TOPIC)
      const known = [...QUESTIONS, SEED_QUESTION].find((q) => q.text === text)
      dispatch({ type: 'user-message', message: { id: id('msg'), sessionId, role: 'user', segments: [{ text }], done: true } })
      const runId = id('run')
      start(runId, questionScript(known?.id ?? 'free', text, runId, id('msg'), sessionId), sessionId)
    },
    runComparison() {
      dispatch({ type: 'compare-start' })
      const runId = id('run')
      start(runId, compareScript(runId))
    },

    openEvidence: (evId: string, anchor: string, scroll: boolean) => dispatch({ type: 'evidence-open', id: evId, anchor, scroll }),
    closeEvidence: () => dispatch({ type: 'evidence-close' }),
    toggleCite: (evId: string) => dispatch({ type: 'toggle', list: 'cited', id: evId }),
    toggleNote: (evId: string) => dispatch({ type: 'toggle', list: 'noted', id: evId }),
    showTrace: (open: boolean, focus?: string | null) => dispatch({ type: 'trace', open, focus }),
    setReader: (paperId: string) => dispatch({ type: 'reader', paperId }),
    drop: (names: string[]) => dispatch({ type: 'drop', names }),

    deletePaper: (paperId: string, clear: boolean) => dispatch({ type: 'lib-delete', paperId, clear }),
    restorePaper: (paperId: string) => dispatch({ type: 'lib-restore', paperId }),
    emptyTrash: () => dispatch({ type: 'lib-empty' }),
    unlinkPaper: (paperId: string, topicId: string) => dispatch({ type: 'lib-unlink', paperId, topicId }),
    resolveDuplicate: (choice: 'merged' | 'separate') => dispatch({ type: 'lib-dup', choice }),

    runCheck() {
      dispatch({ type: 'check-start' })
      const runId = id('run')
      start(runId, checkScript(runId, getState().check.sentences.map((x) => x.id)))
    },
    reviseSentence: (sentenceId: string, text: string, cites: string[], evidenceId: string) =>
      dispatch({ type: 'check-edit', sentenceId, text, cites, evidenceId }),
    recheck(sentenceId: string) {
      const s = getState()
      const sentence = s.check.sentences.find((x) => x.id === sentenceId)
      const evidenceId = s.check.recheck[sentenceId]
      if (!sentence || !evidenceId) return
      const runId = id('run')
      start(runId, recheckScript(runId, sentenceId, sentence.text, evidenceId))
    },
    toggleReviewed: (sentenceId: string) => dispatch({ type: 'check-review', sentenceId }),

    runWikiDraft() {
      const s = getState()
      const plural = (n: number, w: string) => n + ' ' + w + (n === 1 ? '' : 's')
      const inputs = [plural(s.noted.length, 'saved note'),
        s.comparison.status === 'done' ? '1 comparison' : 'topic abstracts', plural(s.wiki.pages.length, 'existing page')]
      dispatch({ type: 'wiki-start' })
      const runId = id('run')
      start(runId, wikiScript(runId, inputs))
    },
    acceptWiki: () => dispatch({ type: 'wiki-accept' }),
    discardWiki: () => dispatch({ type: 'wiki-discard' }),
    openWikiPage: (pageId: string) => dispatch({ type: 'wiki-open', id: pageId }),
    updateSettings: (patch: Partial<Settings>) => dispatch({ type: 'settings', patch }),
    }
  }, [])
}

type Store = { state: State; act: ReturnType<typeof useActions> }
const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const ref = useRef(state)
  ref.current = state
  const act = useActions(dispatch, () => ref.current)
  return <Ctx.Provider value={{ state, act }}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}

export const anyRunning = (s: State) => Object.values(s.runs).some((r) => r.status === 'running')
