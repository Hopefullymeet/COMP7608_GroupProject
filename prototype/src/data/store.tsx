import { createContext, useContext, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { runTask, type ScriptItem } from './runtime'
import { compareScript, discoveryScript, questionScript, QUESTIONS, SEED_QUESTION, refineScript } from './scripts'
import { DEFAULT_QUESTION, DEMO_TOPIC, EVIDENCE, PAPERS, SEED_SESSION, SESSIONS, TOPICS } from './fixtures'
import type {
  AgentRun, Candidate, ChatMessage, ComparisonRow, Coverage, Decision, SearchAngle, Session, TaskEvent, Topic,
} from './types'

export type Tab = 'discover' | 'read' | 'compare'
export type Route = { view: 'home' } | { view: 'topic'; topicId: string; tab: Tab }
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
    case 'done': {
      const run = s.runs[e.runId]
      if (!run) return s
      const next: State = { ...s, runs: { ...s.runs, [run.id]: { ...run, status: e.status, summary: e.summary } } }
      if (run.task === 'Discovery') next.discovery = { ...s.discovery, status: 'done', coverage: e.coverage, summary: e.summary }
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
  }
}

export const NEW_SESSION = 'New session'
const maxOrder = (s: State) => Math.max(0, ...s.sessions.map((x) => x.order))
export const sessionsOf = (s: State, topicId: string) =>
  s.sessions.filter((x) => x.topicId === topicId).sort((a, b) => b.order - a.order)
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
