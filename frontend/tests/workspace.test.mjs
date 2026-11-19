import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
})
after(() => vite.close())
const { createMock } = await vite.ssrLoadModule('/src/api/mock.ts')
const storage = new Map()
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
}
const op = () => crypto.randomUUID()
function client() {
  storage.clear()
  return createMock()
}
async function start(api, input) {
  const { confirmation_id } = await api.call('task.prepare', { ...input, operation_id: op() })
  return api.call('task.start', { ...input, confirmation_id, operation_id: op() })
}
async function finish(api, id) {
  const terminal = Promise.withResolvers()
  const stop = await api.subscribe(id, 0, (e) => {
    if (e.type === 'task.finished') terminal.resolve(e.payload)
  })
  try {
    return await terminal.promise
  } finally {
    stop()
  }
}

test('import retries, review and archive preserve a session bookmark across restart', async () => {
  const api = client()
  const { topic_id } = await api.call('topic.create', { operation_id: op(), title: 'Evidence' })
  const { session_id } = await api.call('session.create', { operation_id: op(), topic_id })
  const input = { kind: 'paper_import', input: { topic_id, files: ['multivers'] } }
  const first = await start(api, input),
    result = await finish(api, first.task_id)
  const paper_id = result.result.paper_ids[0]
  const second = await start(api, input)
  const review = (await finish(api, second.task_id)).result.review_ids[0]
  const params = { operation_id: op(), review_id: review, decision: 'link' }
  assert.equal((await api.call('library.resolve_import', params)).paper_id, paper_id)
  await api.call('library.resolve_import', params)
  const [p] = (await api.call('library.list', { topic_id })).items
  assert.equal(p.source_versions.length, 2)
  const source_version_id = p.source_versions[1].source_version_id
  await api.call('reader.bookmark', {
    operation_id: op(),
    topic_id,
    session_id,
    source_version_id,
    passage_id: 'multivers-p3',
  })
  const restarted = createMock()
  assert.equal(
    (await restarted.call('session.get', { topic_id, session_id })).reader.source_version_id,
    source_version_id,
  )
  const a = await restarted.call('evidence.open', { anchor_id: source_version_id + '/multivers-p3' })
  assert.equal(a.source.passages.find((p) => p.passage_id === a.passage_id).page, 3)
  await restarted.call('workspace.archive', { operation_id: op(), kind: 'topic', id: topic_id })
  assert.equal((await restarted.call('topic.list', {})).items.length, 0)
  await restarted.call('workspace.unarchive', { operation_id: op(), kind: 'topic', id: topic_id })
  assert.equal((await restarted.call('session.list', { topic_id })).items[0].session_id, session_id)
})

test('service changes invalidate confirmation; budget recovery runs once in the original scope', async () => {
  const api = client(),
    { topic_id } = await api.call('topic.create', { operation_id: op(), title: 'Question answering' })
  const input = { topic_id, kind: 'discovery', input: { query: 'PubMedQA' } }
  async function budget(calls) {
    const { revision, ...cfg } = await api.call('services.get', {})
    await api.call('services.save', {
      ...cfg,
      budget: { ...cfg.budget, calls },
      operation_id: op(),
      base_revision: revision,
    })
  }
  const stale = await api.call('task.prepare', { ...input, operation_id: op() })
  await budget(0)
  await assert.rejects(
    api.call('task.start', { ...input, confirmation_id: stale.confirmation_id, operation_id: op() }),
    /confirmation/i,
  )
  const blocked = await start(api, input)
  assert.equal((await finish(api, blocked.task_id)).issue.reason, 'TASK_BUDGET_EXHAUSTED')
  await budget(4)
  const resume = { kind: 'resume', topic_id, input: { checkpoint_id: blocked.task_id } }
  const next = await start(api, resume)
  const resumed = await finish(api, next.task_id)
  assert.deepEqual(resumed.result, { record_id: next.task_id })
  const search = await api.call('discovery.get', { topic_id, search_id: resumed.result.record_id })
  assert.equal(search.candidates.length, 1)
  const stages = []
  const detach = await api.subscribe(next.task_id, 0, (e) => {
    if (e.type === 'task.progress') stages.push(e.payload.stage)
  })
  detach()
  assert.deepEqual(stages, ['validate', 'resume'])
  assert.equal((await api.call('task.history', { topic_id })).items[1].status, 'failed')
  await assert.rejects(api.call('task.prepare', { ...resume, operation_id: op() }), /expired/i)
})

test('verified backup restores the same live workspace and rejects damaged versions', async () => {
  const api = client(),
    { topic_id } = await api.call('topic.create', { operation_id: op(), title: 'Notes' })
  const note = { topic_id, text: 'Original note', origin: 'user', anchor_ids: [] }
  const old = await api.call('note.save', { ...note, operation_id: op() })
  const importer = await start(api, { kind: 'paper_import', input: { files: ['multivers'], topic_id } })
  await finish(api, importer.task_id)
  await api.call('backup.create', { operation_id: op() })
  await api.call('note.save', {
    ...note,
    text: 'Revised note',
    note_id: old.note_id,
    base_revision: old.revision,
    operation_id: op(),
  })
  const inspect = () => api.call('backup.inspect', { file_id: 'demo-backup' })
  const preview = await inspect()
  assert.equal(preview.valid, true)
  const key = [...storage.keys()].find((key) => key.endsWith('/backup')),
    saved = storage.get(key)
  const corrupt = JSON.parse(saved)
  corrupt.state.shelf.documents = {}
  storage.set(key, JSON.stringify(corrupt))
  await assert.rejects(
    api.call('backup.restore', { operation_id: op(), preview_id: preview.preview_id }),
    /changed/i,
  )
  assert.match((await inspect()).issues[0], /missing source version/i)
  assert.equal((await api.call('note.list', { topic_id })).items[0].text, 'Revised note')
  storage.set(key, saved)
  const valid = await inspect()
  assert.equal(
    (await api.call('backup.restore', { operation_id: op(), preview_id: valid.preview_id })).restored,
    true,
  )
  const exported = await api.call('export.create', {
    topic_id,
    format: 'notes',
    include_originals: false,
    operation_id: op(),
  })
  assert.match(exported.text, /Original note/)
  assert.doesNotMatch(exported.text, /Revised note/)
  assert.equal((await createMock().call('note.list', { topic_id })).items[0].text, 'Original note')
})

test('cancelling a run expires live access and leaves explicitly revoked grants revoked', async () => {
  const api = client(),
    { topic_id } = await api.call('topic.create', { operation_id: op(), title: 'Scoped access' })
  const { session_id } = await api.call('session.create', { operation_id: op(), topic_id })
  const run = await start(api, {
    kind: 'reading_qa',
    topic_id,
    session_id,
    input: { question: 'What context?', sources: [{ source_version_id: 'v1', requested_scope: 'abstract' }] },
  })
  const [offer] = (await api.call('access.list', {})).offers
  assert.deepEqual(offer.source_versions, ['v1'])
  const params = { operation_id: op(), offer_id: offer.offer_id }
  const grant = await api.call('access.grant', params)
  assert.equal((await api.call('access.grant', params)).grant_id, grant.grant_id)
  assert.equal(
    (await api.call('access.revoke', { operation_id: op(), grant_id: grant.grant_id })).revoked,
    true,
  )
  await api.call('access.grant', { ...params, operation_id: op() })
  await api.call('task.cancel', { operation_id: op(), task_id: run.task_id })
  const state = await api.call('access.list', {})
  assert.deepEqual(state.offers, [])
  assert.deepEqual(
    state.grants.map((g) => g.status),
    ['revoked', 'expired'],
  )
  assert.equal((await finish(api, run.task_id)).status, 'cancelled')
  await assert.rejects(
    api.call('access.grant', { ...params, operation_id: op() }),
    (e) => e.issue.reason === 'GRANT_EXPIRED',
  )
})

test('desktop adapter sends JSON-RPC IDs, surfaces errors and detaches a task channel', async () => {
  const { createDesktop } = await vite.ssrLoadModule('/src/api/desktop.ts')
  let mismatch = false
  let channel
  globalThis.window = {
    __TAURI_INTERNALS__: {
      transformCallback: () => 1,
      invoke: async (command, args) => {
        const { request } = args
        assert.equal(request.jsonrpc, '2.0')
        const base = { id: mismatch ? 'wrong' : request.id, jsonrpc: '2.0' }
        if (command === 'papertrace_subscribe') {
          channel = args.channel
          return { ...base, result: { task_id: request.params.task_id } }
        }
        assert.equal(command, 'papertrace_rpc')
        if (request.method === 'protocol.version') return { ...base, result: { major: 0, minor: 4 } }
        return {
          ...base,
          error: {
            message: 'Source missing',
            data: { reason: 'NOT_FOUND', next_action: 'refresh_data', retryable: false },
          },
        }
      },
    },
  }
  const api = createDesktop()
  assert.equal((await api.call('protocol.version', {})).minor, 4)
  await assert.rejects(
    api.call('evidence.open', { anchor_id: 'missing' }),
    (e) => e.issue.reason === 'NOT_FOUND',
  )
  let count = 0
  const stop = await api.subscribe('t1', 0, () => count++)
  channel.onmessage({})
  stop()
  channel.onmessage({})
  assert.equal(count, 1)
  mismatch = true
  await assert.rejects(api.call('protocol.version', {}), /Invalid response/)
})
