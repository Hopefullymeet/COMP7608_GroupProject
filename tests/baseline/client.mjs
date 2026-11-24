import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.env.PAPERTRACE_CLIENT_ROOT || '../..'
const { createMock } = await import(pathToFileURL(resolve(root, 'frontend/src/api/mock.ts')))

export async function workspace(t) {
  const storage = new Map()
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  } })
  t.after(() => previous ? Object.defineProperty(globalThis, 'localStorage', previous) : delete globalThis.localStorage)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { call, subscribe } = createMock()
  const write = (method, params) => call(method, { ...params, operation_id: crypto.randomUUID() })
  const { topic_id } = await write('topic.create', { title: 'Scientific QA' })
  const { session_id } = await write('session.create', { topic_id })
  async function start(input) {
    const confirmation = await write('task.prepare', input)
    const { task_id } = await write('task.start', { ...input, confirmation_id: confirmation.confirmation_id })
    return { task_id, confirmation }
  }
  async function finish(task_id) {
    t.mock.timers.runAll()
    return call('task.get', { task_id })
  }
  const search = await start({ topic_id, kind: 'discovery', input: { query: 'scientific question answering datasets' } })
  const found = await finish(search.task_id)
  const search_id = found.result.search_id
  const candidate = found.result.candidates.find(c => c.doi === '10.18653/v1/D19-1259')
  const add = () => write('candidate.decide', { topic_id, search_id, candidate_id: candidate.candidate_id, decision: 'add' })
  async function ask(paper, question, requested_scope = 'abstract') {
    const { paper_id, source_version_id } = paper
    return start({ topic_id, session_id, kind: 'reading_qa', input: {
      question, sources: [{ paper_id, source_version_id, requested_scope }],
    } })
  }
  return { call, write, subscribe, finish, add, ask, topic_id, session_id, search, search_id, candidate }
}
