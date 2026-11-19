import fixture from './pubmedqa.json'
import { RpcError } from './contract'
import type { Abstract, Candidate, Client, Discovery, EventBody, Evidence, Finished, LibraryItem, Method, Methods, Reading, Rpc, Session, Step, TaskEvent, TaskInput, Topic, Turn } from './contract'

import { researchFixture, type ResearchFixture } from './researchFixture'
import { asLocated, emptyLibrary, type LibraryFixture } from './library'
import { libraryFixture } from './libraryFixture'

type Run = { input: TaskInput; run_id: string; events: TaskEvent[]; script: EventBody[] }
type State = {
  research:ResearchFixture
  shelf:LibraryFixture
  topics: Topic[]
  sessions: Record<string, Session[]>
  turns: Record<string, Turn[]>
  searches: Record<string, Discovery & { task_id: string; query: string; filters?: { year_from?: number; year_to?: number } }>
  latest: Record<string, string>
  library: LibraryItem[]
  runs: Record<string, Run>
  writes: Record<string, { params: string; result: unknown }>
  confirmations: Record<string, TaskInput>
}
const key = 'papertrace-contract-demo-v1'
const sample = fixture.candidate as Candidate
const evidence = fixture.evidence as Evidence
const exampleAnswer = fixture.answer as Reading

function fail(reason: string, message: string, next_action = 'refresh_data', details?: Record<string, unknown>): never {
  throw new RpcError(message, { reason, retryable: false, next_action, details })
}

export function createMock(): Client {
  const initial: State = { research:{comparisons:{},wiki:{}}, shelf:emptyLibrary(), topics: [], sessions: {}, turns: {}, searches: {}, latest: {}, library: [], runs: {}, writes: {}, confirmations: {} }
  const state: State = JSON.parse(localStorage.getItem(key) ?? 'null') ?? initial
  state.shelf ??= emptyLibrary()
  const shelf=libraryFixture(state,evidence)
  state.research??={comparisons:{},wiki:{}}
  const research=researchFixture(state,state.research,asLocated(evidence))
  const listeners = new Map<string, Set<(event: TaskEvent) => void>>()
  const active = (run: Run) => run.events.at(-1)?.type !== 'task.finished'
  const save = () => localStorage.setItem(key, JSON.stringify(state))
  const id = () => crypto.randomUUID()

  function emit(task: string, body: EventBody) {
    const run = state.runs[task]
    if (!active(run)) return
    if(body.type==='task.finished' && body.payload.status==='completed' && run.input.kind==='paper_import') {
      body={type:'task.finished',payload:{status:'completed',result:shelf.importPapers(run.input)}}
    }
    if(body.type==='task.finished' && body.payload.status==='completed' && (run.input.kind==='paper_comparison'||run.input.kind==='wiki_draft')) research.generate(run.input,task)
    const event = { task_id: task, run_id: run.run_id, event_seq: run.events.length + 1, ...body }
    run.events.push(event)
    if (event.type === 'task.finished' && event.payload.status === 'completed') {
      const { result } = event.payload
      const { input } = run
      if ('search_id' in result && input.kind === 'discovery') {
        const query = 'previous_search_id' in input.input ? state.searches[input.input.previous_search_id] : input.input
        state.searches[result.search_id] = { ...structuredClone(result), query: query.query, filters: query.filters, task_id: task }
        state.latest[input.topic_id] = result.search_id
      }
      if ('message_id' in result && input.kind === 'reading_qa') {
        const turns = state.turns[input.session_id] ??= []
        turns.push({ task_id: task, question: input.input.question, answer: result })
      }
    }
    save()
    listeners.get(task)?.forEach((receive) => receive(structuredClone(event)))
  }

  function schedule(task: string) {
    const run = state.runs[task]
    run.script.slice(run.events.length).forEach((body, index) => {
      setTimeout(() => emit(task, body), 220 * (index + 1))
    })
  }
  Object.entries(state.runs).forEach(([task, run]) => { if (active(run)) schedule(task) })

  function taskScript(input: TaskInput, task: string): EventBody[] {
    if(input.kind==='paper_comparison'||input.kind==='wiki_draft') {
      const stages=input.kind==='paper_comparison'?['read','align','compare']:['collect','propose']
      return [...stages.map((stage):EventBody=>({type:'task.progress',payload:{stage,message:stage}})),{type:'task.finished',payload:{status:'completed',result:{record_id:task}}}]
    }
    if (input.kind==='paper_import') return [
      ...['inspect','match','commit'].map((stage):EventBody=>({type:'task.progress',payload:{stage,message:stage+' · selected materials'}})),
      {type:'task.finished',payload:{status:'completed',result:{paper_ids:[],review_ids:[]}}}
    ]
    if (input.kind === 'reading_qa') {
      const supported = /context|conclusion|abstract|上下文|结论|摘要/i.test(input.input.question)
      const answer: Reading = {
        ...exampleAnswer,
        message_id: task,
        scope_id: task,
        sentences: supported ? exampleAnswer.sentences : [{ text: 'The abstract does not establish an answer to this question.', assessment: 'evidence_not_established', anchor_ids: [] }],
      }
      const source=input.input.sources[0]
      if(source.source_version_id!=='v1') {
        const doc=state.shelf.documents[source.source_version_id]
        const p=doc?.passages.find(p=>p.passage_id===input.input.selection?.passage_id)??doc?.passages[0]
        answer.read_sources=[{source_version_id:source.source_version_id,read_scope:p?source.requested_scope:'none'}]
        answer.sentences=p?[{text:p.text,assessment:'supported',anchor_ids:[doc.source_version_id+'/'+p.passage_id]}]:[{text:'Material unavailable.',assessment:'evidence_not_established',anchor_ids:[]}]
      }
      const sentence = answer.sentences[0].text
      return [
        { type: 'task.progress', payload: { stage: 'reading', message: 'Reading the PubMedQA abstract' } },
        { type: 'answer.delta', payload: { text: sentence.slice(0, 28) } },
        { type: 'answer.delta', payload: { text: sentence.slice(28) } },
        { type: 'task.finished', payload: { status: 'completed', result: answer } },
      ]
    }
    const parent = 'previous_search_id' in input.input ? state.searches[input.input.previous_search_id] : undefined
    const request = parent ?? ('query' in input.input ? input.input : fail('INVALID_PARAMS', 'The previous search could not be found.'))
    const excluded = parent?.excluded ?? []
    const matches = /pubmed|biomed|scientific|abstract|dataset|科学|摘要/i.test(request.query)
      && (request.filters?.year_from ?? 1) <= 2019 && (request.filters?.year_to ?? 9999) >= 2019
    const added = state.library.some((item) => item.paper_id === 'p1' && item.topic_ids.includes(input.topic_id))
    const candidates: Candidate[] = matches && !excluded.length ? [{
      ...sample, candidate_id: `${task}-pubmedqa`, decision: added ? 'added' : 'pending',
      reason: 'The dataset uses biomedical paper abstracts as question context.',
    }] : []
    const angles = ['Scientific question answering datasets', 'Biomedical datasets using abstracts']
    const supplement = matches && !/pubmedqa/i.test(request.query) && !excluded.length
    const steps: Step[] = supplement ? [
      { action: 'search', query: angles[0], source: 'Contract fixture', observation: 'No clear abstract-based match.' },
      { action: 'search_again', reason: 'Check datasets that explicitly use abstracts as context.' },
    ] : []
    steps.push(
      { action: 'search', query: supplement ? angles[1] : request.query, source: 'Contract fixture', observation: candidates.length ? 'Found PubMedQA.' : 'No visible matches.' },
      { action: 'stop', reason: candidates.length ? 'Found a candidate with abstract evidence.' : 'The sample has no more matching candidates.' },
    )
    return [
      { type: 'task.progress', payload: { stage: 'searching', message: 'Searching for candidate papers' } },
      ...steps.map((payload): EventBody => ({ type: 'discovery.step', payload })),
      { type: 'task.finished', payload: { status: 'completed', result: {
        search_id: task, candidates,
        excluded: excluded.map((candidate) => ({ ...candidate, candidate_id: `${task}-pubmedqa` })),
        coverage: { searched_angles: steps.flatMap((step) => step.action === 'search' ? [step.query] : []), gaps: candidates.length ? [] : ['No visible candidates in the sample.'] },
      } } },
    ]
  }

  const handlers: { [M in Method]: (params: Methods[M][0]) => Methods[M][1] } = {
    ...shelf.handlers,...research.handlers,
    'protocol.version': () => ({ major: 0, minor: 4 }),
    'topic.list': () => ({ items: state.topics.filter(t=>!state.shelf.archive.some(a=>a.id===t.topic_id)) }),
    'topic.create': ({ title }) => {
      const topic_id = id()
      state.topics.unshift({ topic_id, title })
      return { topic_id }
    },
    'session.list': ({ topic_id }) => ({ items: (state.sessions[topic_id] ?? []).filter(s=>!state.shelf.archive.some(a=>a.id===s.session_id)) }),
    'session.create': ({ topic_id }) => {
      const session_id = id()
      const sessions = state.sessions[topic_id] ??= []
      sessions.unshift({ session_id, title: `Session ${sessions.length + 1}` })
      return { topic_id, session_id }
    },
    'session.get': ({ session_id }) => ({
      turns: state.turns[session_id] ?? [],
      active_task_id: Object.keys(state.runs).find((task) => {
        const run = state.runs[task]
        return active(run) && run.input.kind === 'reading_qa' && run.input.session_id === session_id
      }),
    }),
    'discovery.latest': ({ topic_id }) => ({
      search_id: state.latest[topic_id],
      active_task_id: Object.keys(state.runs).find((task) => {
        const run = state.runs[task]
        return active(run) && run.input.kind === 'discovery' && run.input.topic_id === topic_id
      }),
    }),
    'discovery.get': ({ search_id }) => {
      const { candidates, excluded, coverage } = state.searches[search_id]
      return { search_id, candidates, excluded, coverage }
    },
    'discovery.steps': ({ task_id }) => ({
      steps: state.runs[task_id].events.flatMap((event) => event.type === 'discovery.step' ? [event.payload] : []),
    }),
    'candidate.decide': ({ topic_id, search_id, candidate_id, decision }) => {
      const search = state.searches[search_id]
      const candidate = [...search.candidates, ...search.excluded].find((item) => item.candidate_id === candidate_id)
        ?? fail('INVALID_PARAMS', 'Candidate unavailable.')
      if (decision === 'add') {
        const version = { source_version_id: 'v1', available_scope: 'abstract' } as const
        let paper = state.library.find((item) => item.paper_id === 'p1')
        if (!paper) {
          paper = { paper_id: 'p1', title: candidate.title, topic_ids: [], source_versions: [version] }
          state.library.push(paper)
        }
        const linked = paper.topic_ids.includes(topic_id)
        if (!linked) paper.topic_ids.push(topic_id)
        search.excluded = search.excluded.filter((item) => item !== candidate)
        if (!search.candidates.includes(candidate)) search.candidates.push(candidate)
        candidate.decision = 'added'
        return { candidate_id, decision: 'added', paper_id: 'p1', link_status: linked ? 'already_linked' : 'linked', ...version }
      }
      if (candidate.decision === 'added') fail('INVALID_TRANSITION', 'This paper is already in the topic.')
      candidate.decision = decision
      search.candidates = search.candidates.filter((item) => item !== candidate)
      search.excluded = search.excluded.filter((item) => item !== candidate)
      const destination = decision === 'exclude' ? search.excluded : search.candidates
      destination.push(candidate)
      return { candidate_id, decision }
    },
    'library.list': ({ topic_id }) => ({ items: state.library.filter((item) => !topic_id || item.topic_ids.includes(topic_id)) }),
    'source.read_abstract': ({ topic_id, source_version_id }): Abstract => {
      const doc=shelf.handlers['source.read']({topic_id,source_version_id})
      const [first,...rest]=doc.passages
      if(!first) return fail('SOURCE_UNAVAILABLE','The source has no readable abstract.')
      return {...doc,passages:[first,...rest]}
    },
    'evidence.locate': ({ topic_id, message_id, anchor_id }) => {
      const exists = state.sessions[topic_id]?.some(({ session_id }) => state.turns[session_id]?.some(({ answer }) =>
        answer.message_id === message_id && answer.sentences.some((sentence) =>
          sentence.assessment === 'supported' && sentence.anchor_ids.includes(anchor_id))))
      return exists ? (anchor_id==='a1' && shelf.lookup(anchor_id) ? evidence : shelf.lookup(anchor_id)) : fail('SOURCE_UNAVAILABLE', 'The original abstract is unavailable.', 'restore_source')
    },
    'task.prepare': ({ operation_id: _, ...input }) => {
      const confirmation_id = id()
      state.confirmations[confirmation_id] = input
      return {
        confirmation_id,
        transfers: input.kind === 'paper_import' ? [] : (input.kind==='wiki_draft'||input.kind==='paper_comparison') ? [{endpoint:'https://model.example.org',purpose:input.kind,data_categories:['Selected source versions and notes']}] : input.kind === 'discovery'
          ? [{ endpoint: 'https://search.example.org', purpose: 'Find relevant papers', data_categories: ['Research question and search terms'] },
             { endpoint: 'https://model.example.org', purpose: 'Assess coverage and relevance', data_categories: ['Research question', 'Candidate metadata and abstracts'] }]
          : [{ endpoint: 'https://model.example.org', purpose: 'Answer the question', data_categories: ['Question and recent conversation', 'Selected abstracts'] }],
      }
    },
    'task.start': ({ operation_id: _, confirmation_id, ...input }) => {
      if (JSON.stringify(state.confirmations[confirmation_id]) !== JSON.stringify(input)) {
        fail('CONFIRMATION_REQUIRED', 'The transfer confirmation has changed.', 'confirm_task')
      }
      const running = Object.entries(state.runs).find(([, run]) =>
        active(run) && 'topic_id' in run.input && 'topic_id' in input && run.input.topic_id === input.topic_id && run.input.kind === input.kind
        && (input.kind === 'discovery' || (input.kind==='reading_qa' && run.input.kind === 'reading_qa' && run.input.session_id === input.session_id)))
      if (running) fail('TASK_IN_PROGRESS', 'A task is already running.', 'open_task', { task_id: running[0] })
      const task_id = id()
      const run_id = id()
      state.runs[task_id] = { input, run_id, events: [], script: taskScript(input, task_id) }
      delete state.confirmations[confirmation_id]
      schedule(task_id)
      return { task_id, run_id, status: 'queued', ...(input.kind === 'reading_qa' ? { scope_id: task_id } : {}) }
    },
    'task.get': ({ task_id }) => {
      const run = state.runs[task_id]
      const last = run.events.at(-1)
      return { task_id, run_id: run.run_id, last_event_seq: last?.event_seq ?? 0,
        ...(last?.type === 'task.finished' ? last.payload : { status: last ? 'running' : 'queued' }) }
    },
    'task.cancel': ({ task_id }) => {
      const last = state.runs[task_id].events.at(-1)
      const status: Finished['status'] = last?.type === 'task.finished' ? last.payload.status : 'cancelled'
      if (last?.type !== 'task.finished') emit(task_id, { type: 'task.finished', payload: { status: 'cancelled' } })
      return { task_id, status }
    },
  }

  const call: Rpc = async <M extends Method>(method: M, params: Methods[M][0]) => {
    if (!('operation_id' in params)) return structuredClone(handlers[method](params))
    const write = `${method}/${params.operation_id}`
    const previous = state.writes[write]
    const serialized = JSON.stringify(params)
    if (previous) {
      if (previous.params !== serialized) fail('OPERATION_CONFLICT', 'The operation key is already in use.')
      return structuredClone(previous.result) as Methods[M][1]
    }
    const result = handlers[method](params)
    state.writes[write] = { params: serialized, result }
    save()
    return structuredClone(result)
  }

  return {
    call,
    async subscribe(task, cursor, receive) {
      const events = state.runs[task].events
      if (cursor > events.length) fail('INVALID_CURSOR', 'The event cursor is ahead of the task.')
      const subscribers = listeners.get(task) ?? new Set()
      listeners.set(task, subscribers)
      subscribers.add(receive)
      queueMicrotask(() => events.slice(cursor).forEach((event) => {
        if (subscribers.has(receive)) receive(structuredClone(event))
      }))
      return () => { subscribers.delete(receive); if (!subscribers.size) listeners.delete(task) }
    },
  }
}
