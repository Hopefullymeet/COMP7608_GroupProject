import { useEffect, useRef, useState } from 'react'
import { Dialog } from '../../../prototype/src/components/PageHead'
import { baseState, StoreContext, useStore } from '../../../prototype/src/data/store'
import type { Route, State, Tab } from '../../../prototype/src/data/store'
import type { AgentRun, ChatMessage, Decision, EvidenceAnchor, Paper, SearchAngle, Session } from '../../../prototype/src/data/types'
import { errorText } from '../api/contract'
import type { Client, Discovery, Finished, Step, TaskInput, Turn, Abstract } from '../api/contract'
import { asLocated, type DocumentView, type Origin, type Picked } from '../api/library'
import { ScopeDetails } from '../components/ScopeDetails'
import { isTauri } from '../api/desktop'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { useRead, useWorkspace } from './Workspace'
import { operation, retryWrite, useTask } from './useTask'

type Request = { message_id: string; anchor_id: string }
const evidenceId = (message: string, anchor: string) => JSON.stringify([message, anchor])
const discoveryKey = (topic: string, search: string) => `papertrace-discovery-task/${topic}/${search}`
const emptyTrace = { open: false, focus: null }
const defaultView = {
  ...baseState, topics: [], sessions: [], activeSessionId: null, library: [], paperTopics: {},
  messages: [], readerPaperId: '', runs: {}, runOrder: [], noted: [], trace: emptyTrace,
  wiki: { ...baseState.wiki, pages: [] },
}

function answers(session: string, turns: Turn[]): ChatMessage[] {
  return turns.flatMap(({ task_id, question, answer }) => [
    { id: `user:${task_id}`, sessionId: session, role: 'user', done: true, segments: [{ text: question }] },
    { id: `answer:${answer.message_id}`, sessionId: session, role: 'agent', done: true, segments: [
      ...answer.sentences.map((sentence) => ({
        text: sentence.text + ' ',
        ...(sentence.assessment === 'supported' ? {
          evidenceIds: sentence.anchor_ids.map((anchor) => evidenceId(answer.message_id, anchor)),
        } : { text: sentence.text + ' · Evidence not established. ' }),
      })),
      { text: answer.read_sources.length ? 'Read: ' + answer.read_sources.map((source) =>
        `${source.source_version_id} (${source.read_scope.replace('_', ' ')})`).join(', ') : 'No sources read.', tone: 'scope' },
    ] },
  ])
}

function traceSteps(steps: Step[]): AgentRun['steps'] {
  return steps.map((step, index) => step.action === 'search'
    ? { id: String(index), kind: 'tool', title: step.query, call: step.source, detail: step.observation }
    : { id: String(index), kind: step.action === 'stop' ? 'stop' : 'decide',
      title: step.action === 'stop' ? 'Stop searching' : 'Search again', detail: step.reason })
}

function paperFromAbstract(source: Abstract | DocumentView, paper?: Paper): Paper {
  return {
    id: source.source_version_id, short: paper?.short ?? 'Source abstract', title: paper?.title ?? 'Source abstract',
    authors: paper?.authors ?? [], venue: paper?.venue ?? '', venueSource: paper?.venueSource ?? '', year: paper?.year ?? 0,
    stored: source.passages.some(p=>'page' in p && typeof p.page==='number' && p.page>0)?'full-text':'abstract', passages: source.passages.map((p, i) => ({
      id: p.passage_id, section: 'section' in p ? p.section : 'Abstract · Paragraph '+(i+1), page: 'page' in p ? p.page : 0, text: p.text + ('warning' in p && p.warning ? ' ['+p.warning+']' : ''),
    })),
  }
}

export function MainlineProvider({ api, demo, children }: { api: Client; demo: boolean; children: React.ReactNode }) {
  const workspace=useWorkspace()
  const [files,setFiles]=useState<Picked[]>([])
  const config=useRead('services.get',{})
  const activity=useRead('workspace.activity',{})
  const selection=useRef<{source_version_id:string;passage_id:string;quote:string}>()
  const { act: prototypeActions } = useStore()
  const [view, setView] = useState<State>(defaultView)
  const [papers, setPapers] = useState<Record<string, Paper>>({})
  const [evidence, setEvidence] = useState<Record<string, EvidenceAnchor>>({})
  const [search, setSearch] = useState<Discovery>()
  const [savedTrace, setSavedTrace] = useState<{ id: string; steps: Step[] }>()
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [initializing, setInitializing] = useState(true)
  const [working, setWorking] = useState(false)
  const [draft, setDraft] = useState('')
  const [searchQuestion, setSearchQuestion] = useState('')
  const [round, setRound] = useState(0)
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [loadingSession, setLoadingSession] = useState(false)
  const selected = useRef<{ topic: string; session: string | null; epoch: number }>({ topic: '', session: null, epoch: 0 })
  const lock = useRef(false)
  const readerRequest = useRef(0)
  const searchRequest = useRef(0)
  const connectionRequest = useRef(0)
  const creation = useRef<{ title: string; topicKey: string; sessionKey: string; topic?: string }>()
  const writeKeys = useRef(new Map<string, string>())
  const topic = view.route.view === 'topic' ? view.route.topicId : ''
  const session = view.activeSessionId
  const reveal = (cause: unknown) => setError(errorText(cause))
  const current = (expected: { topic: string; session: string | null; epoch: number }) => selected.current === expected

  async function status<T>(work: () => Promise<T>) {
    if (lock.current) return
    lock.current = true
    setWorking(true)
    try { await work() } catch (cause) { reveal(cause) }
    finally { lock.current = false; setWorking(false) }
  }

  async function keyedWrite<T>(name: string, request: (key: string) => Promise<T>) {
    const key = writeKeys.current.get(name) ?? operation()
    writeKeys.current.set(name, key)
    const result = await retryWrite(() => request(key))
    writeKeys.current.delete(name)
    return result
  }

  useEffect(()=>{
    if(!isTauri()||view.route.view!=='home')return
    let valid=true
    const listener=getCurrentWebview().onDragDropEvent(e=>{
      if(!valid||e.payload.type!=='drop')return
      const paths=e.payload.paths
      void workspace.write('file.stage_drop',{paths}).then(({files})=>{if(valid)setFiles(old=>[...old,...files])}).catch(reveal)
    })
    void listener.catch(reveal)
    return ()=>{valid=false;void listener.then(stop=>stop()).catch(()=>{})}
  },[api,view.route.view])

  async function refreshLibrary(topic_id: string) {
    const { items } = await api.call('library.list', { topic_id })
    if (selected.current.topic !== topic_id) return
    const list = items.flatMap((item) => item.source_versions.map((version): Paper => ({
      id: version.source_version_id, short: item.source_versions.length > 1 ? `${item.title} · ${version.source_version_id}` : item.title,
      title: item.title, authors: [], venue: '', venueSource: '', year: 0, passages: [],
      stored: version.available_scope === 'full_text' ? 'full-text' : version.available_scope,
    })))
    setPapers((existing) => ({
      ...existing,
      ...Object.fromEntries(list.map((paper) => [paper.id, { ...paper, passages: existing[paper.id]?.passages ?? [] }])),
    }))
    setView((state) => ({ ...state, library: list.map((p) => p.id), paperTopics: Object.fromEntries(list.map((p) => [p.id, [topic_id]])) }))
  }

  async function refreshSearch(topic_id: string, search_id: string, taskId?: string) {
    const revision = ++searchRequest.current
    const result = await api.call('discovery.get', { topic_id, search_id })
    if (selected.current.topic !== topic_id || revision !== searchRequest.current) return
    setSearch(result)
    if (taskId) {
      const { steps } = await api.call('discovery.steps', { task_id: taskId })
      if (selected.current.topic === topic_id && revision === searchRequest.current) setSavedTrace({ id: taskId, steps })
    }
  }

  async function refreshSession(wanted: typeof selected.current, resume = true) {
    if (!wanted.session) return
    const { turns, active_task_id } = await api.call('session.get', { topic_id: wanted.topic, session_id: wanted.session })
    if (!current(wanted)) return
    setView((state) => ({ ...state, messages: answers(wanted.session!, turns) }))
    if (resume && active_task_id) reading.attach(active_task_id)
  }

  function finishDiscovery(id: string, finished: Finished) {
    if (!('result' in finished) || !finished.result || !('search_id' in finished.result) || finished.status === 'cancelled') return
    const topic = selected.current.topic
    const { search_id } = finished.result
    localStorage.setItem(discoveryKey(topic, search_id), id)
    setSearch(finished.result)
    setSavedTrace({ id, steps: discovering.preview.steps })
    void refreshSearch(topic, search_id, id).catch(reveal)
  }

  const discovering = useTask(api, finishDiscovery)
  const reading = useTask(api, (_id, finished) => {
    setDraft('')
    if (finished.status === 'completed' || finished.status === 'partial') void refreshSession(selected.current, false).catch(reveal)
  })
  const confirmation = discovering.confirmation ? discovering : reading.confirmation ? reading : null
  const activeTask = view.route.view === 'topic' && view.route.tab === 'discover' ? discovering : reading
  const busy = working || discovering.busy || reading.busy || Boolean(confirmation)

  async function initialize() {
    const request = ++connectionRequest.current
    setInitializing(true)
    setError('')
    try {
      const version = await api.call('protocol.version', {})
      if (version.major !== 0) throw new Error(`Incompatible host protocol ${version.major}.${version.minor}.`)
      const { items } = await api.call('topic.list', {})
      const sessions = await Promise.all(items.map(async ({ topic_id }) => (await api.call('session.list', { topic_id })).items
        .map((s, i): Session => ({ id: s.session_id, topicId: topic_id, title: s.title ?? 'New session', updated: '', order: -i }))))
      if (request !== connectionRequest.current) return
      setView((state) => ({ ...state, topics: items.map((t) => ({
        id: t.topic_id, title: t.title, goal: '', scripted: true, paperCount: 0, updated: '',
      })), sessions: sessions.flat() }))
      setReady(true)
    } catch (cause) { if (request === connectionRequest.current) reveal(cause) }
    finally { if (request === connectionRequest.current) setInitializing(false) }
  }
  useEffect(() => { void initialize() }, [api,workspace.tick])

  useEffect(() => {
    if (!topic) return
    let active = true
    setLoadingSearch(true)
    void Promise.all([
      api.call('discovery.latest', { topic_id: topic }).then(async ({ search_id, active_task_id,task_id }) => {
        if (!active) return
        const saved = search_id ? refreshSearch(topic, search_id, task_id ?? localStorage.getItem(discoveryKey(topic, search_id)) ?? undefined) : undefined
        if (active_task_id) discovering.attach(active_task_id)
        await saved
      }),
      refreshLibrary(topic),
    ]).catch((cause) => { if (active) reveal(cause) }).finally(() => { if (active) setLoadingSearch(false) })
    return () => { active = false }
  }, [api, topic,workspace.tick])

  useEffect(() => {
    if (!session || !topic) return
    const wanted = selected.current
    setLoadingSession(true)
    void refreshSession(wanted).catch((cause) => { if (current(wanted)) reveal(cause) })
      .finally(() => { if (current(wanted)) setLoadingSession(false) })
  }, [api, topic, session])

  function openTopic(topicId: string, tab: Tab = 'discover', sessionId?: string | null, title?: string) {
    if (discovering.busy || reading.busy || confirmation) return
    const previous = selected.current
    const changedTopic = previous.topic !== topicId
    const nextSession = sessionId === undefined
      ? changedTopic ? view.sessions.find((item) => item.topicId === topicId)?.id ?? null : previous.session
      : sessionId
    if (changedTopic || previous.session !== nextSession) {
      selected.current = { topic: topicId, session: nextSession, epoch: previous.epoch + 1 }
      readerRequest.current++
      reading.detach()
      setDraft('')
      setLoadingSession(Boolean(nextSession))
    }
    if (changedTopic) {
      searchRequest.current++
      discovering.detach()
      setSearch(undefined)
      setSavedTrace(undefined)
      setRound(0)
      setLoadingSearch(true)
      setSearchQuestion(title ?? view.topics.find((item) => item.id === topicId)?.title ?? '')
    }
    const switchingToDiscover = view.route.view === 'topic' && view.route.tab !== tab && tab === 'discover'
    if (switchingToDiscover) readerRequest.current++
    setView((state) => ({
      ...state, route: { view: 'topic', topicId, tab }, activeSessionId: nextSession,
      ...(previous.session !== nextSession || changedTopic ? { messages: [], activeEvidence: null } : {}),
      ...(switchingToDiscover && { activeEvidence: null }),
      ...(changedTopic ? { library: [], readerPaperId: '', trace: emptyTrace } : {}),
    }))
  }

  function goHome(reset = false) {
    if (busy) return
    selected.current = { topic: '', session: null, epoch: selected.current.epoch + 1 }
    readerRequest.current++
    searchRequest.current++
    discovering.detach()
    reading.detach()
    setView((state) => ({ ...state, route: { view: 'home' }, activeSessionId: null, activeEvidence: null,
      messages: [], trace: emptyTrace, homeRevision: state.homeRevision + Number(reset) }))
  }

  function rememberSession(topicId: string, id: string) {
    setView((state) => ({
      ...state, sessions: [{ id, topicId, title: 'New session', order: Date.now(), updated: '' }, ...state.sessions],
    }))
    void api.call('session.list', { topic_id: topicId }).then(({ items }) => {
      setView((state) => ({ ...state, sessions: state.sessions.map((item) =>
        item.topicId === topicId ? { ...item, title: items.find((s) => s.session_id === item.id)?.title ?? item.title } : item) }))
    }).catch(reveal)
  }

  function create(text: string) {
    const title = text.trim() || files[0]?.name
    if (!title || !ready) return
    void status(async () => {
      if (creation.current?.title !== title) creation.current = { title, topicKey: operation(), sessionKey: operation() }
      const attempt = creation.current
      if (!attempt.topic) {
        const { topic_id } = await retryWrite(() => api.call('topic.create', { title, operation_id: attempt.topicKey }))
        attempt.topic = topic_id
        setView((state) => ({ ...state, topics: [{ id: topic_id, title, goal: '', scripted: true, paperCount: 0, updated: '' }, ...state.topics] }))
      }
      const topicId = attempt.topic
      const { session_id } = await retryWrite(() => api.call('session.create', { topic_id: topicId, operation_id: attempt.sessionKey }))
      creation.current = undefined
      rememberSession(topicId, session_id)
      openTopic(topicId, 'discover', session_id, title)
      if(files.length) { await workspace.prepare({kind:'paper_import',input:{topic_id:topicId,files:files.map(f=>f.file_id)}});setFiles([]) }
    })
  }

  function setReader(id: string) {
    const topic_id = selected.current.topic
    const token = ++readerRequest.current
    setView((state) => ({ ...state, readerPaperId: id, activeEvidence: null }))
    if(id) void api.call('reader.position',{topic_id,source_version_id:id}).then(({passage_id})=>{
      if(!passage_id||token!==readerRequest.current)return
      requestAnimationFrame(()=>{const el=document.querySelector<HTMLElement>('[data-passage-id="'+CSS.escape(passage_id)+'"]')
        const parent=el?.closest('.reader-scroll');if(el&&parent)parent.scrollTop+=el.getBoundingClientRect().top-parent.getBoundingClientRect().top})
    }).catch(reveal)
    if (!id || papers[id]?.stored === 'metadata' || papers[id]?.passages.length) return
    selection.current=undefined
    void (papers[id]?.stored==='full-text'? api.call('source.read',{topic_id,source_version_id:id}) : api.call('source.read_abstract', { topic_id, source_version_id: id })).then((source) => {
      if (token === readerRequest.current) setPapers((state) => ({ ...state, [id]: paperFromAbstract(source, state[id]) }))
    }).catch((cause) => { if (token === readerRequest.current) reveal(cause) })
  }

  useEffect(() => {
    if (view.route.view !== 'topic' || view.route.tab !== 'read' || view.activeEvidence) return
    const id = view.library.includes(view.readerPaperId) ? view.readerPaperId : view.library[0]
    if (id && (id !== view.readerPaperId || !papers[id]?.passages.length)) setReader(id)
  }, [topic, view.route, view.library])

  function locate(id: string) {
    const topic_id = selected.current.topic
    const token = ++readerRequest.current
    const [message_id, anchor_id] = JSON.parse(id) as [Request['message_id'], Request['anchor_id']]
    setView((state) => ({ ...state, activeEvidence: null }))
    void api.call('evidence.locate', { topic_id, message_id, anchor_id }).then((result) => {
      const located='anchor' in result ? asLocated(result) : result
      const {source}=located
      if (token !== readerRequest.current) return
      if (!source.passages.some((passage) => passage.passage_id === located.passage_id)) {
        throw new Error('The original abstract passage could not be located.')
      }
      const version = source.source_version_id
      setPapers((state) => ({ ...state, [version]: paperFromAbstract(source, state[version]) }))
      setEvidence((state) => ({ ...state, [id]: { id, paperId: version, passageId: located.passage_id, quote: located.quote, scope: located.read_scope.replace('_',' ')+' evidence' } }))
      setView((state) => ({ ...state, readerPaperId: version, activeEvidence: { id, anchor: 'active-abstract-passage', scroll: true } }))
    }).catch((cause) => { if (token === readerRequest.current) reveal(cause) })
  }

  function discover(text: string, refine = false, filters?: { year_from?: number; year_to?: number; venue?:string }) {
    if (busy || loadingSearch || discovering.task || !topic || !text.trim() || (refine && !search)) return
    const input = refine && search ? { previous_search_id: search.search_id } : { query: text.trim(), ...(filters && { filters }) }
    setSearchQuestion(text.trim())
    setRound((value) => refine ? value + 1 : 1)
    void discovering.prepare({ topic_id: topic, kind: 'discovery', input })
  }

  function decide(id: string, decision: Decision) {
    if (!search || busy || discovering.task) return
    const actions = { pending: 'pending', held: 'hold', excluded: 'exclude', added: 'add' } as const
    const { search_id } = search
    void status(async () => {
      await keyedWrite(JSON.stringify([search_id, id, decision]), (operation_id) => api.call('candidate.decide', {
        topic_id: topic, search_id, candidate_id: id, decision: actions[decision], operation_id,
      }))
      await Promise.all([refreshSearch(topic, search_id), refreshLibrary(topic)])
    })
  }

  function ask(text: string): false | undefined {
    if (busy || loadingSession || !session || reading.task) return false
    const version = [view.readerPaperId, ...view.library].find((id) => view.library.includes(id) && papers[id]?.stored !== 'metadata')
    if (!version) return false
    void status(async () => {
      const { items } = await api.call('library.list', { topic_id: topic })
      const paper = items.find((item) => item.source_versions.some((v) => v.source_version_id === version && v.available_scope !== 'metadata'))
      if (!paper) throw new Error('This abstract is no longer available in the topic.')
      setDraft(text)
      await reading.prepare({ topic_id: topic, session_id: session, kind: 'reading_qa',
        input: { question: text, ...(selection.current?.source_version_id===version && {selection:selection.current}), sources: [{ paper_id: paper.paper_id, source_version_id: version, requested_scope: papers[version]?.stored==='full-text'?'full_text':'abstract' }] } })
    })
  }

  const candidates = [...(search?.candidates ?? []), ...(search?.excluded ?? [])]
  const candidatePapers: Record<string, Paper> = Object.fromEntries(candidates.map((c) => [c.candidate_id, {
    id: c.candidate_id, short: c.title, title: c.title, authors: c.authors, venue: c.venue?.name ?? '', year: c.year ?? 0,
    venueSource: c.venue?.source ?? '', doi: c.doi, stored: c.available_scope === 'full_text' ? 'full-text' : c.available_scope, passages: [],
  }]))
  const steps = discovering.task ? discovering.preview.steps : savedTrace?.steps ?? []
  const runId = discovering.task ?? savedTrace?.id
  const discoveryRun: AgentRun | undefined = runId ? {
    id: runId, task: 'Discovery', label: searchQuestion, status: discovering.task ? 'running' : 'done', steps: traceSteps(steps),
  } : undefined
  const questionRun: AgentRun | undefined = reading.task ? {
    id: reading.task, task: 'Question', label: draft || 'Reading abstracts', status: 'running',
    steps: reading.preview.progress ? [{ id: 'reading', kind: 'tool', title: reading.preview.progress }] : [],
  } : undefined
  const runs = [questionRun, discoveryRun].filter((run): run is AgentRun => Boolean(run))
  const searchSteps = steps.filter((step) => step.action === 'search')
  const angles: SearchAngle[] = searchSteps.map((step, index) => ({
    id: `angle-${index}`, label: step.query, query: step.query,
    status: discovering.task && index === searchSteps.length - 1 ? 'searching' : 'covered', found: 0,
    }))
  if (search) angles.push({
    id: 'results', label: 'Search results', query: searchQuestion, status: search.candidates.length ? 'covered' : 'gap',
    found: search.candidates.length, gapReason: search.coverage.gaps.join(' ') || undefined,
  })
  const messages = reading.task && session ? [...view.messages,
    ...(draft ? [{ id: 'pending-user', sessionId: session, role: 'user' as const, done: true, segments: [{ text: draft }] }] : []),
    { id: 'pending-answer', sessionId: session, role: 'agent' as const, done: false, runId: reading.task, segments: [{ text: reading.preview.text }] },
  ] : view.messages

  async function saveNote(text:string,anchor_ids:string[],origin:Origin) {
    await workspace.write('note.save',{topic_id:topic,session_id:session??undefined,text,anchor_ids,origin})
  }
  function saveEvidence(id:string,origin:'citation'|'answer') {
    const [,anchor]=JSON.parse(id) as [string,string]
    void status(async()=>{await saveNote(evidence[id].quote,[anchor],origin)
      setView(s=>origin==='citation'?{...s,cited:[...s.cited,id]}:{...s,noted:[...s.noted,id]})})
  }
  function archive(kind:'topic'|'session',id:string) {
    if(!window.confirm('Archive this '+kind+'? You can restore it from Library.')) return
    void status(async()=>{await workspace.write('workspace.archive',{kind,id});if(id===topic||id===session)goHome()})
  }
  const state: State = {
    ...view,dropped:files.map(f=>f.name),mainline: { demo,pages:['library','wiki','check','settings'],
      venueFilter:config?.services.some(s=>s.kind==='search'&&s.enabled&&s.fields.includes('venue')),
      interval:activity?.watches.find(w=>w.topic_id===topic&&w.search_id===search?.search_id)?.interval_days??0,
      watch:search?(interval_days:number)=>void workspace.write('discovery.watch',{topic_id:topic,search_id:search.search_id,interval_days}).catch(reveal):undefined,
      activity:activity?.items.map(item=>({id:item.id,title:item.title,detail:item.detail,topic:item.topic_id,open:()=>{
        if(item.checkpoint_id){void workspace.prepare({kind:'resume',topic_id:item.topic_id,input:{checkpoint_id:item.checkpoint_id}});return}
        if(item.target==='library')act.navigate({view:'library',paperId:item.paper_id})
        else if(item.target==='wiki'||item.target==='check')act.navigate({view:item.target,topicId:item.topic_id,draftId:item.draft_id,sentenceId:item.sentence_id})
        else openTopic(item.topic_id,item.target,item.session_id)
      }})),
      attachFiles:incoming=>{void status(async()=>{
        const selected=demo&&incoming?.length?incoming.map(f=>({file_id:f.name,name:f.name})):(await api.call('file.pick',{purpose:'papers'})).files
        setFiles(old=>[...old,...selected.filter(f=>!old.some(o=>o.file_id===f.file_id))])
      })},
      original:id=>void api.call('source.original',{source_version_id:id}).catch(reveal),
      bookmark:(id,passage_id)=>void workspace.write('reader.bookmark',{topic_id:topic,source_version_id:id,passage_id}).catch(reveal),
      selectQuote:(source_version_id,passage_id,quote)=>{selection.current={source_version_id,passage_id,quote}},
      saveAnswer:m=>void status(async()=>{await saveNote(m.segments.filter(s=>s.tone!=='scope').map(s=>s.text).join('').trim(),
        m.segments.flatMap(s=>(s.evidenceIds??[]).map(id=>(JSON.parse(id) as string[])[1])),'answer');setError('Answer saved to the topic’s research notes.')}), papers: { ...papers, ...candidatePapers }, evidence,
      search: (query, filters) => discover(query, false, filters), searchBusy: busy || loadingSearch },
    discovery: {
      question: searchQuestion, round, status: discovering.task ? 'running' : search ? 'done' : 'idle',
      ...(search && { coverage: { covered: search.coverage.searched_angles, gaps: search.coverage.gaps },
        summary: `${search.candidates.length} visible candidates` }),
    },
    angles, messages, qaRunning: Boolean(reading.task) || loadingSession || busy,
    runs: Object.fromEntries(runs.map((run) => [run.id, run])), runOrder: runs.map((run) => run.id),
    candidates: candidates.map((c) => ({
      id: c.candidate_id, paperId: c.candidate_id, angleId: 'results', reason: c.reason, round,
      readLevel: c.read_scope === 'none' ? 'Metadata only' : c.read_scope==='full_text'?'Full text read':'Abstract read',
      source: c.venue?.source ?? 'Search',
      decision: c.decision === 'hold' ? 'held' : c.decision === 'exclude' ? 'excluded' : c.decision,
      ...(c.decision === 'added' && { note: 'Added to topic' }),
    })),
  }

  const act = {
    ...prototypeActions,
    navigate: (route: Route) => { if (route.view === 'home') goHome(); else if (route.view === 'topic') {openTopic(route.topicId, route.tab);if(route.sourceVersion)setView(s=>({...s,readerPaperId:route.sourceVersion!}))} else if (!busy){goHome();setView(s=>({...s,route}))} },
    newTopic: () => {setFiles([]);goHome(true)},
    toggleNote:(id:string)=>{if(!view.noted.includes(id)) saveEvidence(id,'answer')},
    toggleCite:(id:string)=>{if(!view.cited.includes(id)) saveEvidence(id,'citation')},
    deleteTopic:(id:string)=>archive('topic',id), deleteSession:(id:string)=>archive('session',id),
    startFromHome: create,
    startDemo: () => create('Which scientific QA datasets use paper abstracts?'),
    enterTopic: openTopic,
    openTopic,
    newSession: (topicId: string) => {
      if (!busy) void status(async () => {
        const { session_id } = await keyedWrite(`session/${topicId}`, (operation_id) => api.call('session.create', { topic_id: topicId, operation_id }))
        rememberSession(topicId, session_id)
        openTopic(topicId, 'read', session_id)
      })
      return ''
    },
    openSession: (id: string) => {
      const found = view.sessions.find((s) => s.id === id)
      if (found && !busy) openTopic(found.topicId, 'read', found.id)
    },
    runDiscovery: discover,
    refineDiscovery: () => discover(searchQuestion, true),
    decide, ask, setReader,
    openEvidence: locate,
    closeEvidence: () => { readerRequest.current++; setView((state) => ({ ...state, activeEvidence: null })) },
    showTrace: (open: boolean, focus?: string | null) => setView((state) => ({ ...state, trace: { open, focus: focus ?? null } })),
  }
  const taskError = activeTask.error || activeTask.connectionError || activeTask.status
  const [dismissed, dismiss] = useState('')
  const notice = error || (taskError !== dismissed ? taskError : '')
  const taskInput: TaskInput | undefined = confirmation?.confirmation?.input
  return <StoreContext.Provider value={{ state, act }}>
    {children}
    {activeTask.task && <div className="mainline-task-actions">
      <button className="ghost-btn sm" disabled={activeTask.busy} onClick={activeTask.cancel}>Cancel task</button>
      <button className="ghost-btn sm" onClick={activeTask.reconnect}>Reconnect</button>
    </div>}
    {confirmation?.confirmation && <Dialog title="Confirm data transfer" onClose={confirmation.dismiss}>
      <p className="dialog-text">{taskInput?.kind === 'reading_qa' ? 'Review the destinations before asking.' : 'Review the destinations before searching.'}</p>
      <ScopeDetails scope={confirmation.confirmation}/>
      {confirmation.confirmation.transfers.map((transfer, index) => <p className="dialog-text" key={index}>
        <strong>{transfer.purpose}</strong><br />{transfer.endpoint}<br />{transfer.data_categories.join(', ')}
      </p>)}
      {confirmation.error && <p role="alert">{confirmation.error}</p>}
      <div className="dialog-actions">
        <button className="ghost-btn" disabled={confirmation.busy} onClick={confirmation.dismiss}>Cancel</button>
        <button className="primary" disabled={confirmation.busy} onClick={confirmation.start}>Confirm and start</button>
      </div>
    </Dialog>}
    {!confirmation && notice && <Dialog title="Workspace notice" onClose={() => { setError(''); dismiss(taskError) }}>
      <p className="dialog-text" role="status">{notice}</p>
      <div className="dialog-actions">
        {!ready && !initializing && <button className="primary" onClick={() => void initialize()}>Retry connection</button>}
        {activeTask.connectionError && <button className="primary" onClick={() => { dismiss(taskError); activeTask.reconnect() }}>Reconnect</button>}
        <button className="ghost-btn" onClick={() => { setError(''); dismiss(taskError) }}>Close</button>
      </div>
    </Dialog>}
    {!ready && !initializing && !notice && <div className="mainline-task-actions">
      <button className="ghost-btn" onClick={() => void initialize()}>Retry connection</button>
    </div>}
  </StoreContext.Provider>
}
