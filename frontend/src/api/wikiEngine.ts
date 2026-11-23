import type { Wiki, WikiChange, WikiEntry, WikiKind, WikiMethods, WikiOrigin } from './wiki'

// In-browser Topic Wiki used by the contract sample and the scripted demo. It follows
// docs/contracts/topic-wiki.md: activity in the topic is captured as entries on every read or write,
// and summaries and replies settle after a short delay so the page shows the same busy states.
export type WikiMaterial = {
  title: string
  papers: { id: string; title: string; full_text: boolean; chunks: { text: string; anchor_ids: string[] }[] }[]
  notes: { id: string; text: string; anchor_ids: string[] }[]
  turns: { id: string; question: string; sentences: { text: string; anchor_ids: string[] }[] }[]
  findings: { id: string; title: string; text: string; anchor_ids: string[] }[]
}
export type StoredWiki = Omit<Wiki, 'sources' | 'stale' | 'transfer' | 'generator' | 'new_since_summary'> & {
  summaryModel?: Model
  fingerprint: string
  observed: string[]
  captured_since: number
  ready_at?: number
}
type Model = { model: string; endpoint: string }
type Handlers = { [K in keyof WikiMethods]: (params: WikiMethods[K][0]) => WikiMethods[K][1] }

export const SUMMARY_MS = 2400
const REPLY_MS = 1100
const CONSOLIDATE_AFTER = 5
const MAX_ENTRIES = 80
const CAPTURED: WikiOrigin[] = ['qa', 'pdf', 'paper', 'note', 'finding']
export const DATA_CATEGORIES = ['Topic title', 'Paper titles', 'Parsed PDF passages', 'Saved notes',
  'Questions and cited answers', 'Saved findings', 'Wiki conversation']
const CJK = /[㐀-鿿]/
const id = () => crypto.randomUUID()
const now = () => new Date().toISOString()
const words = (text: string) => new Set(text.toLowerCase().match(/[㐀-鿿]|[\p{L}\p{N}]{3,}/gu) ?? [])
const clip = (text: string, limit = 400) => text.replace(/\s+/g, ' ').trim().slice(0, limit)

export function emptyWiki(topic: string): StoredWiki {
  return {
    topic_id: topic, revision: '', status: 'empty', headline: '', summary: [], entries: [], thread: [],
    pending_reply: false, fingerprint: '', observed: [], captured_since: 0,
  }
}

/** Topics created from a PDF are often named after the file; describe the research instead. */
function topicName(source: WikiMaterial) {
  const title = source.title.trim()
  if (!title || /\.(pdf|bib|ris|json)$/i.test(title)) return source.turns[0]?.question || source.papers[0]?.title || title
  return title
}

export function createWikiEngine(options: {
  records: () => Record<string, StoredWiki>
  material: (topic: string) => WikiMaterial
  model: () => Model | undefined
}) {
  const load = (topic: string) => (options.records()[topic] ??= emptyWiki(topic))
  const entry = (kind: WikiKind, text: string, anchor_ids: string[], origin: WikiOrigin, pinned = false): WikiEntry =>
    ({ entry_id: id(), kind, text: clip(text), anchor_ids: [...new Set(anchor_ids)], origin, pinned, updated_at: now() })

  function* observations(source: WikiMaterial): Generator<[string, WikiKind, WikiOrigin, string, string[]]> {
    for (const paper of source.papers) {
      const key = (paper.full_text ? 'pdf:' : 'paper:') + paper.id
      const origin = paper.full_text ? 'pdf' : 'paper'
      if (!paper.chunks.length) yield [key, 'paper', origin, paper.title, []]
      for (const [i, chunk] of paper.chunks.slice(0, 3).entries())
        yield [i ? key + ':' + i : key, 'paper', origin, paper.title + ': ' + chunk.text, chunk.anchor_ids]
    }
    for (const turn of source.turns) {
      const first = turn.sentences[0]
      if (first) yield ['qa:' + turn.id, 'finding', 'qa', first.text, first.anchor_ids]
      else yield ['qa:' + turn.id, 'open_question', 'qa', turn.question, []]
    }
    for (const note of source.notes) yield ['note:' + note.id, 'finding', 'note', note.text, note.anchor_ids]
    for (const f of source.findings) yield ['finding:' + f.id, 'finding', 'finding', (f.title + ': ' + f.text).replace(/^: |: $/g, ''), f.anchor_ids]
  }

  /** Capture new topic activity; start a background summary once enough has accumulated. */
  function capture(topic: string, source = options.material(topic)) {
    const w = load(topic)
    const seen = new Set(w.observed)
    let added = 0
    for (const [key, kind, origin, text, anchors] of observations(source)) {
      if (seen.has(key)) continue
      seen.add(key)
      w.observed.push(key)
      if (clip(text) && !w.entries.some((e) => e.text === clip(text))) {
        w.entries.push(entry(kind, text, anchors, origin))
        added++
      }
    }
    const overflow = w.entries.length - MAX_ENTRIES
    if (overflow > 0) {
      const drop = new Set(w.entries.filter((e) => CAPTURED.includes(e.origin) && !e.pinned).slice(0, overflow))
      w.entries = w.entries.filter((e) => !drop.has(e))
    }
    w.captured_since += added
    if (!w.pending_reply && ((w.status === 'empty' && w.entries.length > 0) ||
      (w.status === 'ready' && w.captured_since >= CONSOLIDATE_AFTER)))
      Object.assign(w, { status: 'generating', ready_at: Date.now() + SUMMARY_MS })
    return w
  }

  /** Install a sample Wiki that already covers ``source``; later activity is captured as new. */
  function adopt(topic: string, wiki: StoredWiki, source: WikiMaterial) {
    options.records()[topic] = {
      ...wiki, observed: [...observations(source)].map(([key]) => key), fingerprint: JSON.stringify(source),
    }
  }

  function summarize(w: StoredWiki, source: WikiMaterial) {
    const name = topicName(source)
    const zh = CJK.test(name + source.turns.slice(0, 3).map((t) => t.question).join(''))
    const shown = source.papers.slice(0, 3).map((p) => p.title).join(zh ? '、' : ', ')
    const questions = source.turns.slice(-3).map((t) => t.question)
    const n = (count: number, noun: string) => count + ' ' + noun + (count === 1 ? '' : 's')
    w.headline = zh
      ? `这个主题研究「${name}」，目前汇集 ${source.papers.length} 篇论文和 ${source.turns.length} 轮问答。`
      : `Research on “${name}”, drawing on ${n(source.papers.length, 'paper')} and ${n(source.turns.length, 'conversation turn')}.`
    w.summary = zh
      ? [source.papers.length ? `主题中的论文包括 ${shown}。` : '主题中还没有论文。',
        ...(questions.length ? ['最近关注的问题：' + questions.map((q) => `「${q}」`).join('；') + '。'] : []),
        ...(source.notes.length ? [`已保存 ${source.notes.length} 条笔记。`] : [])]
      : [source.papers.length ? `The topic’s papers include ${shown}.` : 'No papers have been added to this topic yet.',
        ...(questions.length ? ['Recent questions: ' + questions.map((q) => `“${q}”`).join('; ') + '.'] : []),
        ...(source.notes.length ? [`You have saved ${n(source.notes.length, 'note')}.`] : [])]
    // Without a model nothing rewrites entries, so a local summary only adds a focus when none exists.
    if (!w.entries.some((e) => e.kind === 'focus')) w.entries.unshift(entry('focus', name, [], 'summary'))
  }

  function reply(w: StoredWiki, message: string) {
    const zh = CJK.test(message)
    const changes: WikiChange[] = []
    const remember = /^\s*(?:please\s+)?(?:remember(?:\s+that)?|记住|请记住)[\s:：,，]*(.+)/is.exec(message)
    const forget = /^\s*(?:please\s+)?(?:forget|忘掉|忘记|请忘记)[\s:：,，]*(.+)/is.exec(message)
    let text: string
    if (remember) {
      const added = entry('preference', remember[1], [], 'chat', true)
      w.entries.push(added)
      changes.push({ op: 'add', entry_id: added.entry_id, text: added.text })
      text = zh ? '好的，已记入 Wiki。' : "Got it. I've added that to the Wiki."
    } else {
      const terms = words(forget ? forget[1] : message)
      const matches = w.entries
        .map((e) => [[...words(e.text)].filter((x) => terms.has(x)).length, e] as const)
        .filter(([score]) => score).sort((a, b) => b[0] - a[0]).map(([, e]) => e).slice(0, 4)
      if (forget && matches[0]) {
        w.entries = w.entries.filter((e) => e !== matches[0])
        changes.push({ op: 'remove', entry_id: matches[0].entry_id, text: matches[0].text })
        text = zh ? '已从 Wiki 中移除。' : "Removed from this topic's Wiki."
      } else if (forget) text = zh ? 'Wiki 中没有找到相关内容。' : "I couldn't find that in this topic's Wiki."
      else if (matches.length) text = [zh ? 'Wiki 中记录了：' : 'Here is what the Wiki records:', ...matches.map((e) => '- ' + e.text)].join('\n')
      else text = zh ? '这个主题的 Wiki 里还没有相关内容。' : "There is nothing about that in this topic's Wiki yet."
    }
    w.thread.push({ message_id: id(), role: 'assistant', text, created_at: now(), ...(changes.length && { changes }) })
    if (changes.length && w.revision) w.revision = id()
  }

  function view(topic: string): Wiki {
    const source = options.material(topic)
    const w = capture(topic, source)
    if (w.ready_at && Date.now() >= w.ready_at) {
      delete w.ready_at
      if (w.status === 'generating') {
        summarize(w, source)
        Object.assign(w, { status: 'ready', revision: id(), generated_at: now(), fingerprint: JSON.stringify(source), captured_since: 0 })
      }
      if (w.pending_reply) {
        reply(w, w.thread.at(-1)!.text)
        w.pending_reply = false
      }
    }
    const model = options.model()
    const { fingerprint, observed: _, captured_since, summaryModel, ready_at: __, ...rest } = w
    return structuredClone({
      ...rest,
      sources: { papers: source.papers.length, notes: source.notes.length, answers: source.turns.length, findings: source.findings.length },
      new_since_summary: w.revision ? captured_since : 0,
      stale: !!w.revision && fingerprint !== JSON.stringify(source),
      generator: summaryModel ? { kind: 'model' as const, ...summaryModel } : { kind: 'local' as const },
      ...(model && { transfer: { endpoint: model.endpoint, data_categories: DATA_CATEGORIES } }),
    })
  }

  function busy(w: StoredWiki) {
    if (w.pending_reply || w.status === 'generating') throw new Error('The Wiki is still working on the previous request.')
  }

  const handlers: Handlers = {
    'wiki.get': ({ topic_id }) => view(topic_id),
    'wiki.refresh': ({ topic_id }) => {
      const w = load(topic_id)
      if (w.status !== 'generating' && !w.pending_reply) {
        w.summaryModel = options.model()
        Object.assign(w, { status: 'generating', ready_at: Date.now() + SUMMARY_MS })
        delete w.issue
      }
      return view(topic_id)
    },
    'wiki.chat': ({ topic_id, text }) => {
      const w = load(topic_id)
      busy(w)
      if (!text.trim() || text.length > 2000) throw new Error('Write a message of up to 2000 characters.')
      w.thread.push({ message_id: id(), role: 'user', text: text.trim(), created_at: now() })
      Object.assign(w, { pending_reply: true, ready_at: Date.now() + REPLY_MS })
      return view(topic_id)
    },
    'wiki.edit': (params) => {
      const w = load(params.topic_id)
      if (params.action === 'add') {
        if (!params.text.trim()) throw new Error('Write the entry and choose a valid kind.')
        w.entries.push(entry(params.kind ?? 'finding', params.text, [], 'user', true))
      } else {
        const target = w.entries.find((e) => e.entry_id === params.entry_id)
        if (!target) throw new Error('This Wiki entry was not found.')
        if (params.action === 'remove') w.entries = w.entries.filter((e) => e !== target)
        else if (params.action === 'update') {
          if (!params.text.trim()) throw new Error('Write the entry before saving.')
          Object.assign(target, { text: clip(params.text), origin: 'user', pinned: true, updated_at: now() })
        } else Object.assign(target, { pinned: params.action === 'pin', updated_at: now() })
      }
      if (w.revision) w.revision = id()
      return view(params.topic_id)
    },
    'wiki.clear_chat': ({ topic_id }) => {
      const w = load(topic_id)
      if (w.pending_reply) throw new Error('Wait for the current reply before clearing the conversation.')
      w.thread = []
      return view(topic_id)
    },
  }
  return { handlers, adopt }
}
