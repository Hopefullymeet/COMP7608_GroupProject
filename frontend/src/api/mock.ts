import fixture from './pubmedqa.json'
import { RpcError } from './contract'
import type {
  Abstract,
  Candidate,
  HistoryRun,
  Client,
  Discovery,
  EventBody,
  Evidence,
  Finished,
  LibraryItem,
  Method,
  Methods,
  Reading,
  Rpc,
  Session,
  Step,
  TaskEvent,
  TaskInput,
  Topic,
  Turn,
} from './contract'

import { citationFixture } from './citationFixture'
import type { Manuscript } from './citation'
import { researchFixture, type ResearchFixture } from './researchFixture'
import { createWikiEngine, type StoredWiki } from './wikiEngine'
import { asLocated, emptyLibrary, type LibraryFixture } from './library'
import { libraryFixture } from './libraryFixture'

import { defaultConfig, unlimitedBudget, type Activity, type Config, type Grant, type Offer, type Watch } from './services'
import { budgetLimit } from '../data/serviceSettings'

type Run = {
  origin_task_id?: string
  usage?: HistoryRun['usage']
  started_at?: string
  input: TaskInput
  run_id: string
  events: TaskEvent[]
  script: EventBody[]
}
type State = {
  preset?: 'fixed' | 'agent' | 'wiki'
  profile?: import('./services').PersonalProfile
  config: Config
  grants: Grant[]
  watches: Watch[]
  activity: Activity[]
  manuscripts: Record<string, Manuscript[]>
  research: ResearchFixture
  wiki?: Record<string, StoredWiki>
  shelf: LibraryFixture
  topics: Topic[]
  sessions: Record<string, Session[]>
  turns: Record<string, Turn[]>
  searches: Record<
    string,
    Discovery & {
      task_id: string
      query: string
      filters?: { year_from?: number; year_to?: number; venue?: string }
    }
  >
  latest: Record<string, string>
  library: LibraryItem[]
  runs: Record<string, Run>
  writes: Record<string, { params: string; result: unknown }>
  confirmedRevision?: Record<string, string>
  confirmations: Record<string, TaskInput>
}
const key = 'papertrace-contract-demo-v1'
const sample = fixture.candidate as Candidate
const evidence = fixture.evidence as Evidence
const exampleAnswer = fixture.answer as Reading

function fail(
  reason: string,
  message: string,
  next_action = 'refresh_data',
  details?: Record<string, unknown>,
): never {
  throw new RpcError(message, { reason, retryable: false, next_action, details })
}

export function createMock(): Client {
  const initial: State = {
    config: defaultConfig(),
    grants: [],
    watches: [],
    activity: [],
    manuscripts: {},
    research: { comparisons: {} },
    shelf: emptyLibrary(),
    topics: [],
    sessions: {},
    turns: {},
    searches: {},
    latest: {},
    library: [],
    runs: {},
    writes: {},
    confirmations: {},
  }
  const state: State = JSON.parse(localStorage.getItem(key) ?? 'null') ?? initial
  state.shelf ??= emptyLibrary()
  state.config ??= defaultConfig()
  if (state.config.revision === 'initial') state.config.budget = { ...unlimitedBudget }
  state.grants ??= []
  state.watches ??= []
  state.activity ??= []
  const shelf = libraryFixture(state, evidence, (versions) => {
    const records: { kind: string; label: string }[] = []
    for (const c of Object.values(state.research?.comparisons ?? {}).flat())
      if (c.source_versions.some((v) => versions.includes(v)))
        records.push({ kind: 'Comparison', label: c.question })
    for (const d of Object.values(state.manuscripts ?? {}).flat())
      for (const s of d.versions[0].sentences)
        if (s.cites.some((v) => versions.includes(v)))
          records.push({ kind: 'Manuscript', label: d.name + ' · ' + s.text })
    return records
  })
  state.research ??= { comparisons: {} }
  state.manuscripts ??= {}
  const research = researchFixture(state, asLocated(evidence))
  const citation = citationFixture(state, asLocated(evidence))
  const wiki = createWikiEngine({
    records: () => (state.wiki ??= {}),
    model: () => {
      const selected = state.config.models.find((m) => m.id === state.config.model_id)
      return selected && !selected.local ? { model: selected.model, endpoint: selected.endpoint } : undefined
    },
    material: (topic) => {
      const anchors = [asLocated(evidence), ...Object.values(state.shelf.anchors)]
      return {
        title: state.topics.find((t) => t.topic_id === topic)?.title ?? '',
        papers: state.library.filter((p) => p.topic_ids.includes(topic)).map((p) => {
          const version = p.source_versions[0]
          return {
            id: version.source_version_id, title: p.alias ?? p.title, full_text: version.available_scope === 'full_text',
            chunks: anchors.filter((a) => a.source.source_version_id === version.source_version_id).slice(0, 3)
              .map((a) => ({ text: a.quote, anchor_ids: [a.anchor_id] })),
          }
        }),
        notes: (state.shelf.notes[topic] ?? []).map((n) => ({ id: n.note_id + ':' + n.revision, text: n.text, anchor_ids: n.anchor_ids })),
        turns: (state.sessions[topic] ?? []).flatMap((s) => state.turns[s.session_id] ?? []).map((t) => ({
          id: t.task_id, question: t.question,
          sentences: t.answer.sentences.filter((x) => x.anchor_ids.length).map((x) => ({ text: x.text, anchor_ids: [...x.anchor_ids] })),
        })),
        findings: [],
      }
    },
  })
  const listeners = new Map<string, Set<(event: TaskEvent) => void>>()
  const active = (run: Run) => run.events.at(-1)?.type !== 'task.finished'
  const save = () => localStorage.setItem(key, JSON.stringify(state))
  const id = () => crypto.randomUUID()

  function emit(task: string, body: EventBody) {
    const run = state.runs[task]
    if (!active(run)) return
    const effective = run.origin_task_id ? state.runs[run.origin_task_id].input : run.input
    if (
      body.type === 'task.finished' &&
      body.payload.status === 'completed' &&
      effective.kind === 'paper_import'
    ) {
      body = {
        type: 'task.finished',
        payload: { status: 'completed', result: shelf.importPapers(effective) },
      }
    }
    if (
      body.type === 'task.finished' &&
      body.payload.status === 'completed' &&
      effective.kind === 'paper_comparison'
    )
      research.generate(effective, task)
    if (
      body.type === 'task.finished' &&
      body.payload.status === 'completed' &&
      (effective.kind === 'citation_audit' || effective.kind === 'citation_suggest')
    ) {
      if (!citation.generate(effective, task))
        body = {
          type: 'task.finished',
          payload: {
            status: 'partial',
            result: { record_id: task },
            issue: { reason: 'Missing target material', next_action: 'restore_source', retryable: false },
          },
        }
    }
    if (body.type === 'task.finished') {
      if (
        effective.kind === 'discovery' &&
        body.payload.status === 'completed' &&
        'candidates' in body.payload.result
      ) {
        state.activity.unshift({
          id: id(),
          topic_id: effective.topic_id,
          title: 'Search results updated',
          detail: body.payload.result.candidates.length + ' visible candidates',
          target: 'discover',
        })
      }
      if (run.origin_task_id && (body.payload.status === 'completed' || body.payload.status === 'partial'))
        state.activity = state.activity.filter((a) => a.checkpoint_id !== run.origin_task_id)
      if (
        body.payload.status === 'failed' &&
        body.payload.issue.reason === 'TASK_BUDGET_EXHAUSTED' &&
        'topic_id' in effective
      )
        state.activity.unshift({
          id: id(),
          topic_id: effective.topic_id,
          title: 'Task stopped at its budget',
          detail: 'Review the budget in Models & services, then resume the saved scope.',
          target: 'read',
          checkpoint_id: run.origin_task_id ?? task,
        })
      for (const grant of state.grants)
        if (grant.task_id === task && grant.status === 'active') grant.status = 'expired'
    }
    const event = { task_id: task, run_id: run.run_id, event_seq: run.events.length + 1, ...body }
    if (
      event.type === 'task.finished' &&
      (event.payload.status === 'completed' || event.payload.status === 'partial')
    ) {
      const { result } = event.payload
      const input = effective
      if ('search_id' in result && input.kind === 'discovery') {
        const query =
          'previous_search_id' in input.input ? state.searches[input.input.previous_search_id] : input.input
        state.searches[result.search_id] = {
          ...structuredClone(result),
          query: query.query,
          filters: query.filters,
          task_id: task,
        }
        state.latest[input.topic_id] = result.search_id
      }
      if ('message_id' in result && input.kind === 'reading_qa') {
        const turns = (state.turns[input.session_id] ??= [])
        const s = state.sessions[input.topic_id]?.find((s) => s.session_id === input.session_id)
        if (s) {
          s.has_turns = true
          s.updated_at = new Date().toISOString()
        }
        turns.push({ task_id: task, question: input.input.question, answer: result })
      }
      if (run.origin_task_id) {
        const record_id =
          'search_id' in result
            ? result.search_id
            : 'message_id' in result
              ? result.message_id
              : 'record_id' in result
                ? result.record_id
                : task
        event.payload.result = { record_id }
      }
    }
    run.events.push(event)
    save()
    listeners.get(task)?.forEach((receive) => receive(structuredClone(event)))
  }

  function schedule(task: string) {
    const run = state.runs[task]
    run.script.slice(run.events.length).forEach((body, index) => {
      setTimeout(() => emit(task, body), 220 * (index + 1))
    })
  }
  Object.entries(state.runs).forEach(([task, run]) => {
    if (active(run)) schedule(task)
  })

  function taskScript(input: TaskInput, task: string): EventBody[] {
    if (input.kind === 'resume') {
      const original = state.runs[input.input.checkpoint_id].input
      const terminal = taskScript(original, task).at(-1)!
      return [
        { type: 'task.progress', payload: { stage: 'validate', message: 'Checking checkpoint scope' } },
        { type: 'task.progress', payload: { stage: 'resume', message: 'Restoring submitted work' } },
        terminal,
      ]
    }
    if (input.kind === 'citation_audit' || input.kind === 'citation_suggest') {
      return [
        ...['identify', 'read', 'assess'].map(
          (stage): EventBody => ({ type: 'task.progress', payload: { stage, message: stage } }),
        ),
        { type: 'task.finished', payload: { status: 'completed', result: { record_id: task } } },
      ]
    }
    if (input.kind === 'paper_comparison') {
      return [
        ...['read', 'align', 'compare'].map((stage): EventBody => ({ type: 'task.progress', payload: { stage, message: stage } })),
        { type: 'task.finished', payload: { status: 'completed', result: { record_id: task } } },
      ]
    }
    if (input.kind === 'paper_import')
      return [
        ...['inspect', 'match', 'commit'].map(
          (stage): EventBody => ({
            type: 'task.progress',
            payload: { stage, message: stage + ' · selected materials' },
          }),
        ),
        {
          type: 'task.finished',
          payload: { status: 'completed', result: { paper_ids: [], review_ids: [] } },
        },
      ]
    if (input.kind === 'reading_qa') {
      const supported = /context|conclusion|abstract|上下文|结论|摘要/i.test(input.input.question)
      const answer: Reading = {
        ...structuredClone(exampleAnswer),
        message_id: task,
        scope_id: task,
        sentences: supported
          ? exampleAnswer.sentences
          : [
              {
                text: 'The abstract does not establish an answer to this question.',
                assessment: 'evidence_not_established',
                anchor_ids: [],
              },
            ],
      }
      const [source, ...extraSources] = input.input.sources
      const fullTextAvailable = (versionId: string) =>
        state.library.some((paper) =>
          paper.source_versions.some(
            (version) => version.source_version_id === versionId && version.available_scope === 'full_text',
          ),
        ) && Boolean(state.shelf.documents[versionId]?.passages.length)
      const missingFullText = input.input.sources.some(
        (source) => source.requested_scope === 'full_text' && !fullTextAvailable(source.source_version_id),
      )
      if (source.source_version_id !== 'v1') {
        const doc = state.shelf.documents[source.source_version_id]
        const p =
          doc?.passages.find((p) => p.passage_id === input.input.selection?.passage_id) ?? doc?.passages[0]
        const scope = source.requested_scope === 'full_text' && !fullTextAvailable(source.source_version_id)
          ? 'abstract'
          : source.requested_scope
        answer.read_sources = [
          { source_version_id: source.source_version_id, read_scope: p ? scope : 'none' },
        ]
        answer.sentences = p
          ? [
              {
                text: p.text,
                assessment: 'supported',
                anchor_ids: [doc.source_version_id + '/' + p.passage_id],
              },
            ]
          : [{ text: 'Material unavailable.', assessment: 'evidence_not_established', anchor_ids: [] }]
      }
      for (const extra of extraSources)
        answer.read_sources.push({ source_version_id: extra.source_version_id, read_scope: 'none' })
      let outcome: Finished
      if (missingFullText) {
        const issue = {
          reason: 'FULL_TEXT_REQUIRED',
          retryable: false,
          next_action: 'attach_full_text',
          details: { read_sources: answer.read_sources },
        }
        if (!answer.sentences.some((sentence) => sentence.assessment === 'supported'))
          return [{ type: 'task.finished', payload: { status: 'failed', issue } }]
        outcome = { status: 'partial', result: answer, issue }
      } else if (extraSources.length) {
        outcome = {
          status: 'partial',
          result: answer,
          issue: {
            reason: 'Fixture reads one selected version',
            retryable: false,
            next_action: 'review_sources',
          },
        }
      } else {
        outcome = { status: 'completed', result: answer }
      }
      const sentence = answer.sentences[0].text
      return [
        {
          type: 'task.progress',
          payload: { stage: 'reading', message: 'Reading the selected source version' },
        },
        { type: 'answer.delta', payload: { text: sentence.slice(0, 28) } },
        { type: 'answer.delta', payload: { text: sentence.slice(28) } },
        { type: 'task.finished', payload: outcome },
      ]
    }
    const parent =
      'previous_search_id' in input.input ? state.searches[input.input.previous_search_id] : undefined
    const request =
      parent ??
      ('query' in input.input
        ? input.input
        : fail('INVALID_PARAMS', 'The previous search could not be found.'))
    const excluded = parent?.excluded ?? []
    const matches =
      /pubmed|biomed|scientific|abstract|dataset|科学|摘要/i.test(request.query) &&
      (!request.filters?.venue ||
        sample.venue?.name.toLowerCase().includes(request.filters.venue.toLowerCase())) &&
      (request.filters?.year_from ?? 1) <= 2019 &&
      (request.filters?.year_to ?? 9999) >= 2019
    const added = state.library.some(
      (item) => item.paper_id === 'p1' && item.topic_ids.includes(input.topic_id),
    )
    const candidates: Candidate[] =
      matches && !excluded.length
        ? [
            {
              ...sample,
              candidate_id: `${task}-pubmedqa`,
              decision: added ? 'added' : 'pending',
              reason: 'The dataset uses biomedical paper abstracts as question context.',
            },
          ]
        : []
    const angles = ['Scientific question answering datasets', 'Biomedical datasets using abstracts']
    const supplement = matches && !/pubmedqa/i.test(request.query) && !excluded.length
    const steps: Step[] = supplement
      ? [
          {
            action: 'search',
            query: angles[0],
            source: 'Contract fixture',
            observation: 'No clear abstract-based match.',
          },
          { action: 'search_again', reason: 'Check datasets that explicitly use abstracts as context.' },
        ]
      : []
    steps.push(
      {
        action: 'search',
        query: supplement ? angles[1] : request.query,
        source: 'Contract fixture',
        observation: candidates.length ? 'Found PubMedQA.' : 'No visible matches.',
      },
      {
        action: 'stop',
        reason: candidates.length
          ? 'Found a candidate with abstract evidence.'
          : 'The sample has no more matching candidates.',
      },
    )
    return [
      { type: 'task.progress', payload: { stage: 'searching', message: 'Searching for candidate papers' } },
      ...steps.map((payload): EventBody => ({ type: 'discovery.step', payload })),
      {
        type: 'task.finished',
        payload: {
          status: 'completed',
          result: {
            search_id: task,
            candidates,
            excluded: excluded.map((candidate) => ({ ...candidate, candidate_id: `${task}-pubmedqa` })),
            coverage: {
              searched_angles: steps.flatMap((step) => (step.action === 'search' ? [step.query] : [])),
              gaps: candidates.length ? [] : ['No visible candidates in the sample.'],
            },
          },
        },
      },
    ]
  }

  const offers = (): Offer[] =>
    Object.entries(state.runs).flatMap(([task_id, r]) => {
      const input = r.input
      const versions =
        'source_versions' in input.input
          ? input.input.source_versions
          : input.kind === 'reading_qa'
            ? input.input.sources.map((s) => s.source_version_id)
            : []
      return active(r) && versions.length
        ? [
            {
              offer_id: task_id,
              task_id,
              endpoint: 'https://helper.example.org',
              purpose: 'Review selected sources',
              source_versions: versions,
              estimated_usage: 'One read-only request',
            },
          ]
        : []
    })
  const backupKey = key + '/backup'
  let preview: { id: string; raw: string } | undefined
  function inspectBackup(raw: string | null): { state?: State; issues: string[] } {
    if (!raw) return { issues: ['Create a demo backup first.'] }
    try {
      const backup = JSON.parse(raw)
      const candidate: State = backup.state
      if (
        !backup.version ||
        !candidate?.shelf?.documents ||
        !Array.isArray(candidate.shelf.trash) ||
        !Array.isArray(candidate.library) ||
        !Array.isArray(candidate.topics) ||
        !candidate.config?.revision ||
        !candidate.runs ||
        !candidate.sessions ||
        !candidate.research ||
        !candidate.manuscripts
      )
        return { issues: ['Incomplete workspace snapshot.'] }
      const missing = [...candidate.library, ...candidate.shelf.trash].flatMap((paper) =>
        paper.source_versions
          .filter(
            (version) =>
              version.source_version_id !== 'v1' &&
              version.available_scope !== 'metadata' &&
              !candidate.shelf.documents[version.source_version_id],
          )
          .map((version) => 'Missing source version ' + version.source_version_id),
      )
      return { state: candidate, issues: missing }
    } catch {
      return { issues: ['Unreadable workspace snapshot.'] }
    }
  }
  const handlers: { [M in Method]: (params: Methods[M][0]) => Methods[M][1] } = {
    ...shelf.handlers,
    ...research.handlers,
    ...wiki.handlers,
    ...citation.handlers,
    'reader.pdf': () => { throw new Error('PDF reading requires the desktop workspace.') },
    'reader.marks': () => ({ items: [] }),
    'reader.mark_save': () => { throw new Error('Annotations require the desktop workspace.') },
    'reader.mark_delete': () => { throw new Error('Annotations require the desktop workspace.') },
    'reader.answers': () => ({ items: [] }),
    'reader.answer_save': () => { throw new Error('Selection answers require the desktop workspace.') },
    'reader.mark_to_wiki': () => { throw new Error('Annotations require the desktop workspace.') },
    'reader.export': () => { throw new Error('PDF export requires the desktop workspace.') },
    'visual.capabilities': () => ({ vision: false }),
    'visual.objects': () => ({ items: [] }),
    'visual.search': () => ({ items: [], skipped: 0 }),
    'visual.crop': () => { throw new Error('PDF regions require the desktop workspace.') },
    'library.preview_pdf': () => { throw new Error('PDF import requires the desktop workspace.') },
    'library.import_pdf': () => { throw new Error('PDF import requires the desktop workspace.') },
    'literature.refs': () => ({ items: [], pending_versions: [] }),
    'source.page': () => { throw new Error('PDF rendering requires the desktop workspace.') },
    'synthesis.list': () => ({ items: [] }),
    'synthesis.wiki': () => ({ revision: '', items: [] }),
    'synthesis.review': () => { throw new Error('Synthesis review requires the desktop workspace.') },
    'preset.get': () => ({mode:state.preset ?? 'wiki'}),
    'preset.save': ({mode}) => ({mode:state.preset=mode}),
    'profile.get': () => state.profile ?? {identity:'',enabled:false,memories:[],revision:''},
    'profile.save': ({identity,enabled,memories}) => state.profile={identity,enabled,memories,revision:crypto.randomUUID()},
    'services.get': () => state.config,
    'services.save': ({ base_revision, operation_id: _, ...config }) => {
      if (base_revision !== state.config.revision)
        fail('STALE_REVISION', 'Settings changed. Reload the current configuration.')
      state.config = { ...config, revision: id() }
      return state.config
    },
    'services.test': ({ id }) => ({
      ok: true,
      message: 'Configuration for ' + id + ' passed fixture validation. Network connectivity is untested.',
    }),
    'services.credentials': () => {
      throw new Error('Connect a desktop host to manage system credentials.')
    },
    'access.list': () => ({ offers: offers(), grants: state.grants }),
    'access.grant': ({ offer_id }) => {
      const offer = offers().find((o) => o.offer_id === offer_id)
      if (!offer) fail('GRANT_EXPIRED', 'This task has ended.')
      const grant: Grant = { ...offer, grant_id: id(), status: 'active' }
      state.grants.push(grant)
      return grant
    },
    'access.revoke': ({ grant_id }) => {
      const g = state.grants.find((g) => g.grant_id === grant_id)
      if (g) g.status = 'revoked'
      return { revoked: !!g }
    },
    'backup.create': () => {
      if (Object.values(state.runs).some(active)) throw new Error('Finish active tasks before backing up.')
      localStorage.setItem(backupKey, JSON.stringify({ version: id(), state }))
      return { name: 'Local demo backup', saved: true }
    },
    'backup.inspect': ({ file_id }) => {
      const raw = localStorage.getItem(backupKey)
      const b = file_id === 'demo-backup' ? inspectBackup(raw) : { issues: ['Unknown backup file.'] }
      const valid = !!b.state && b.issues.length === 0
      preview = valid ? { id: id(), raw: raw! } : undefined
      return {
        preview_id: preview?.id ?? id(),
        valid,
        summary: valid
          ? b.state!.topics.length + ' topics · ' + b.state!.library.length + ' papers'
          : 'No valid local backup.',
        issues: b.issues,
      }
    },
    'backup.restore': ({ preview_id }) => {
      const raw = localStorage.getItem(backupKey)
      if (
        !preview ||
        preview.id !== preview_id ||
        preview.raw !== raw ||
        Object.values(state.runs).some(active)
      )
        throw new Error('Backup changed or a task is active. Inspect again.')
      const checked = inspectBackup(raw)
      if (!checked.state || checked.issues.length) throw new Error('Backup validation failed.')
      Object.assign(state, checked.state)
      preview = undefined
      return { restored: true }
    },
    'library.resolve_import': (p) => {
      const review = state.shelf.reviews.find((r) => r.review_id === p.review_id)
      const previous = state.library.find((x) => x.paper_id === review?.paper_id)
      const oldVersions = previous?.source_versions.map((v) => v.source_version_id) ?? []
      const result = shelf.handlers['library.resolve_import'](p)
      if (p.decision === 'link' && previous)
        for (const topic_id of previous.topic_ids) {
          state.activity.unshift({
            id: id(),
            topic_id,
            target: 'library',
            paper_id: previous.paper_id,
            title: 'Source version added',
            detail: previous.title,
          })
          for (const d of state.manuscripts[topic_id] ?? []) {
            const v = d.versions[0]
            for (const s of v.sentences.filter(
              (s) =>
                s.cites.some((c) => oldVersions.includes(c)) ||
                v.reports.some((r) =>
                  r.findings.some(
                    (f) =>
                      f.sentence_id === s.id &&
                      f.claims.some((c) => c.source_version_id && oldVersions.includes(c.source_version_id)),
                  ),
                ),
            )) {
              v.stale_sentence_ids = [...new Set([...(v.stale_sentence_ids ?? []), s.id])]
              state.activity.unshift({
                id: id(),
                topic_id,
                target: 'check',
                title: 'Review citation after source update',
                detail: s.text,
                draft_id: d.draft_id,
                sentence_id: s.id,
              })
            }
          }
          for (const c of state.research.comparisons[topic_id] ?? [])
            if (c.source_versions.some((v) => oldVersions.includes(v)))
              state.activity.unshift({
                id: id(),
                topic_id,
                target: 'compare',
                title: 'Comparison uses an earlier source',
                detail: c.question,
              })
        }
      return result
    },
    'discovery.watch': ({ topic_id, search_id, interval_days }) => {
      state.watches = state.watches.filter((w) => w.topic_id !== topic_id || w.search_id !== search_id)
      if (interval_days) state.watches.push({ topic_id, search_id, interval_days })
      return { interval_days }
    },
    'workspace.activity': ({ topic_id }) => ({
      items: state.activity.filter((a) => !topic_id || a.topic_id === topic_id),
      watches: state.watches.filter((w) => !topic_id || w.topic_id === topic_id),
    }),
    'file.stage_drop': ({ paths }) => ({
      files: paths.map((path) => {
        const name = path.split(/[\\\\/]/).pop() ?? path
        return { file_id: name, name }
      }),
    }),
    'protocol.version': () => ({ major: 0, minor: 4 }),
    'topic.list': () => ({
      items: state.topics.filter((t) => !state.shelf.archive.some((a) => a.id === t.topic_id)),
    }),
    'topic.create': ({ title }) => {
      const topic_id = id()
      state.topics.unshift({ topic_id, title })
      return { topic_id }
    },
    'topic.rename': ({ topic_id, title }) => {
      const topic = state.topics.find((item) => item.topic_id === topic_id)
      if (!topic || !title.trim() || title.trim().length > 160) throw new Error('Invalid name or topic.')
      topic.title = title.trim()
      return { topic_id, title: topic.title }
    },
    'session.rename': ({ topic_id, session_id, title }) => {
      const session = state.sessions[topic_id]?.find((item) => item.session_id === session_id)
      if (!session || !title.trim() || title.trim().length > 160) throw new Error('Invalid name or session.')
      session.title = title.trim()
      return { topic_id, session_id, title: session.title }
    },
    'session.list': ({ topic_id }) => ({
      items: (state.sessions[topic_id] ?? [])
        .filter((s) => !state.shelf.archive.some((a) => a.id === s.session_id))
        .map((s) => ({ ...s, has_turns: s.has_turns ?? Boolean(state.turns[s.session_id]?.length) })),
    }),
    'session.create': ({ topic_id }) => {
      const session_id = id()
      const sessions = (state.sessions[topic_id] ??= [])
      sessions.unshift({
        session_id,
        title: `Session ${sessions.length + 1}`,
        updated_at: new Date().toISOString(),
        has_turns: false,
      })
      return { topic_id, session_id }
    },
    'session.get': ({ session_id }) => ({
      turns: state.turns[session_id] ?? [],
      reader: state.shelf.positions['session/' + session_id]
        ? { source_version_id: state.shelf.positions['session/' + session_id] }
        : undefined,
      active_task_id: Object.keys(state.runs).find((task) => {
        const run = state.runs[task]
        return active(run) && run.input.kind === 'reading_qa' && run.input.session_id === session_id
      }),
    }),
    'discovery.latest': ({ topic_id }) => ({
      search_id: state.latest[topic_id],
      task_id: state.searches[state.latest[topic_id]]?.task_id,
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
      steps: state.runs[task_id].events.flatMap((event) =>
        event.type === 'discovery.step' ? [event.payload] : [],
      ),
    }),
    'candidate.decide': ({ topic_id, search_id, candidate_id, decision }) => {
      const search = state.searches[search_id]
      const candidate =
        [...search.candidates, ...search.excluded].find((item) => item.candidate_id === candidate_id) ??
        fail('INVALID_PARAMS', 'Candidate unavailable.')
      if (decision === 'add') {
        const version = { source_version_id: 'v1', available_scope: 'abstract' } as const
        let paper = state.library.find((item) => item.paper_id === 'p1')
        if (!paper) {
          paper = { paper_id: 'p1', title: candidate.title, topic_ids: [], source_versions: [version] }
          state.library.push(paper)
        }
        state.shelf.entries[paper.paper_id] ??= {
          identity: candidate.doi ?? paper.paper_id,
          authors: candidate.authors,
        }
        const linked = paper.topic_ids.includes(topic_id)
        if (!linked) paper.topic_ids.push(topic_id)
        search.excluded = search.excluded.filter((item) => item !== candidate)
        if (!search.candidates.includes(candidate)) search.candidates.push(candidate)
        candidate.decision = 'added'
        return {
          candidate_id,
          decision: 'added',
          paper_id: 'p1',
          link_status: linked ? 'already_linked' : 'linked',
          ...version,
        }
      }
      if (candidate.decision === 'added') fail('INVALID_TRANSITION', 'This paper is already in the topic.')
      candidate.decision = decision
      search.candidates = search.candidates.filter((item) => item !== candidate)
      search.excluded = search.excluded.filter((item) => item !== candidate)
      const destination = decision === 'exclude' ? search.excluded : search.candidates
      destination.push(candidate)
      return { candidate_id, decision }
    },
    'library.list': ({ topic_id }) => ({
      items: state.library.filter((item) => !topic_id || item.topic_ids.includes(topic_id)),
    }),
    'source.read_abstract': ({ topic_id, source_version_id }): Abstract => {
      const doc = shelf.handlers['source.read']({ topic_id, source_version_id })
      const [first, ...rest] = doc.passages
      if (!first) return fail('SOURCE_UNAVAILABLE', 'The source has no readable abstract.')
      return { ...doc, passages: [first, ...rest] }
    },
    'evidence.locate': ({ topic_id, message_id, anchor_id }) => {
      const exists = state.sessions[topic_id]?.some(({ session_id }) =>
        state.turns[session_id]?.some(
          ({ answer }) =>
            answer.message_id === message_id &&
            answer.sentences.some(
              (sentence) => sentence.assessment === 'supported' && sentence.anchor_ids.includes(anchor_id),
            ),
        ),
      )
      return exists
        ? anchor_id === 'a1' && shelf.lookup(anchor_id)
          ? evidence
          : shelf.lookup(anchor_id)
        : fail('SOURCE_UNAVAILABLE', 'The original abstract is unavailable.', 'restore_source')
    },
    'task.prepare': ({ operation_id: _, ...input }) => {
      if (input.kind === 'discovery' && !state.config.services.some((s) => s.kind === 'search' && s.enabled))
        throw new Error('Enable a literature search source in Models & services.')
      const scoped = input.kind === 'resume' ? state.runs[input.input.checkpoint_id]?.input : input
      if (!scoped) throw new Error('The original task is unavailable.')
      const selectedModel = state.config.models.find((m) => m.id === state.config.model_id)!
      if (
        input.kind === 'resume' &&
        !state.activity.some(
          (a) => a.topic_id === input.topic_id && a.checkpoint_id === input.input.checkpoint_id,
        )
      )
        throw new Error('This checkpoint has expired.')
      const confirmation_id = id()
      ;(state.confirmedRevision ??= {})[confirmation_id] = state.config.revision
      state.confirmations[confirmation_id] = input
      return {
        confirmation_id,
        budget: state.config.budget,
        source_versions:
          'source_versions' in scoped.input
            ? scoped.input.source_versions
            : scoped.kind === 'reading_qa'
              ? scoped.input.sources.map((s) => s.source_version_id)
              : [],
        transfers:
          selectedModel.local && scoped.kind !== 'discovery'
            ? []
            : scoped.kind === 'citation_suggest' || scoped.kind === 'citation_audit'
              ? [
                  {
                    endpoint: selectedModel.endpoint,
                    purpose: scoped.kind,
                    data_categories: ['Selected manuscript sentences and cited sources'],
                  },
                ]
              : scoped.kind === 'paper_import'
                ? []
                : scoped.kind === 'paper_comparison'
                  ? [
                      {
                        endpoint: selectedModel.endpoint,
                        purpose: scoped.kind,
                        data_categories: ['Selected source versions and notes'],
                      },
                    ]
                  : scoped.kind === 'discovery'
                    ? [
                        {
                          endpoint: 'https://search.example.org',
                          purpose: 'Find relevant papers',
                          data_categories: ['Research question and search terms'],
                        },
                        {
                          endpoint: selectedModel.endpoint,
                          purpose: 'Assess coverage and relevance',
                          data_categories: ['Research question', 'Candidate metadata and abstracts'],
                        },
                      ]
                    : [
                        {
                          endpoint: selectedModel.endpoint,
                          purpose: 'Answer the question',
                          data_categories: [
                            'Question and recent conversation',
                            'Selected material versions and passages',
                            ...(scoped.kind === 'reading_qa' && state.wiki?.[scoped.topic_id]?.entries.length
                              ? ['Compact memory from the current topic Wiki'] : []),
                          ],
                        },
                      ],
      }
    },
    'task.start': ({ operation_id: _, confirmation_id, ...input }) => {
      if (
        state.confirmedRevision?.[confirmation_id] !== state.config.revision ||
        JSON.stringify(state.confirmations[confirmation_id]) !== JSON.stringify(input)
      ) {
        fail('CONFIRMATION_REQUIRED', 'The transfer confirmation has changed.', 'confirm_task')
      }
      const running = Object.entries(state.runs).find(
        ([, run]) =>
          active(run) &&
          'topic_id' in run.input &&
          'topic_id' in input &&
          run.input.topic_id === input.topic_id &&
          run.input.kind === input.kind &&
          (input.kind === 'discovery' ||
            (input.kind === 'reading_qa' &&
              run.input.kind === 'reading_qa' &&
              run.input.session_id === input.session_id)),
      )
      if (running)
        fail('TASK_IN_PROGRESS', 'A task is already running.', 'open_task', { task_id: running[0] })
      const task_id = id()
      const run_id = id()
      const origin_task_id = input.kind === 'resume' ? input.input.checkpoint_id : undefined
      const effective = origin_task_id ? state.runs[origin_task_id]?.input : input
      if (!effective) throw new Error('Original task unavailable.')
      if (
        origin_task_id &&
        (!state.activity.some((a) => a.checkpoint_id === origin_task_id) ||
          Object.values(state.runs).some((r) => active(r) && r.origin_task_id === origin_task_id))
      )
        fail('CONFIRMATION_REQUIRED', 'Checkpoint already resumed. Refresh the workspace.')
      const usage = {
        calls: effective.kind === 'paper_import' ? 0 : 1,
        tokens: effective.kind === 'paper_import' ? 0 : 160,
        ms: 750,
        cost: 0,
      }
      const script: EventBody[] =
        budgetLimit(usage, state.config.budget)
          ? [
              {
                type: 'task.finished',
                payload: {
                  status: 'failed',
                  issue: { reason: 'TASK_BUDGET_EXHAUSTED', retryable: false, next_action: 'adjust_budget' },
                },
              },
            ]
          : taskScript(input, task_id)
      state.runs[task_id] = {
        origin_task_id,
        usage: script.length === 1 ? { calls: 0, tokens: 0, ms: 0, cost: 0 } : usage,
        started_at: new Date().toISOString(),
        input,
        run_id,
        events: [],
        script,
      }
      delete state.confirmedRevision?.[confirmation_id]
      delete state.confirmations[confirmation_id]
      schedule(task_id)
      return {
        task_id,
        run_id,
        status: 'queued',
        ...(input.kind === 'reading_qa' ? { scope_id: task_id } : {}),
      }
    },
    'task.history': ({ topic_id }) => ({
      items: Object.entries(state.runs)
        .reverse()
        .flatMap(([task_id, r]): HistoryRun[] => {
          const input = r.input,
            topic =
              'topic_id' in input
                ? input.topic_id
                : 'topic_id' in input.input
                  ? input.input.topic_id
                  : undefined
          if (topic_id && topic !== topic_id) return []
          const last = r.events.at(-1)
          const steps: HistoryRun['steps'] = r.events.map((e) => {
            if (e.type === 'task.finished')
              return {
                kind: 'stop',
                title: e.payload.status,
                detail: 'issue' in e.payload ? e.payload.issue.reason : 'Results available in the workspace.',
              }
            if (e.type === 'discovery.step')
              return e.payload.action === 'search'
                ? { kind: 'tool', title: e.payload.query, detail: e.payload.observation }
                : {
                    kind: e.payload.action === 'stop' ? 'stop' : 'decide',
                    title: e.payload.action,
                    detail: e.payload.reason,
                  }
            if (e.type === 'task.progress')
              return { kind: 'tool', title: e.payload.stage, detail: e.payload.message }
            return { kind: 'observe', title: 'Answer preview', detail: e.payload.text }
          })
          return [
            {
              task_id,
              run_id: r.run_id,
              kind: input.kind,
              topic_id: topic,
              session_id: input.kind === 'reading_qa' ? input.session_id : undefined,
              label:
                'question' in input.input && input.input.question
                  ? input.input.question
                  : 'query' in input.input
                    ? input.input.query
                    : input.kind.replaceAll('_', ' '),
              status: last?.type === 'task.finished' ? last.payload.status : last ? 'running' : 'queued',
              started_at: r.started_at ?? '',
              usage: r.usage,
              steps,
            },
          ]
        }),
    }),
    'task.get': ({ task_id }) => {
      const run = state.runs[task_id]
      const last = run.events.at(-1)
      return {
        task_id,
        run_id: run.run_id,
        last_event_seq: last?.event_seq ?? 0,
        ...(last?.type === 'task.finished' ? last.payload : { status: last ? 'running' : 'queued' }),
      }
    },
    'task.cancel': ({ task_id }) => {
      const last = state.runs[task_id].events.at(-1)
      const status: Finished['status'] = last?.type === 'task.finished' ? last.payload.status : 'cancelled'
      if (last?.type !== 'task.finished')
        emit(task_id, { type: 'task.finished', payload: { status: 'cancelled' } })
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
      queueMicrotask(() =>
        events.slice(cursor).forEach((event) => {
          if (subscribers.has(receive)) receive(structuredClone(event))
        }),
      )
      return () => {
        subscribers.delete(receive)
        if (!subscribers.size) listeners.delete(task)
      }
    },
  }
}
