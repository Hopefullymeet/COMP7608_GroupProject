import { useCallback, useMemo, useRef, type ReactNode } from 'react'
import { createWikiEngine, emptyWiki, type StoredWiki, type WikiMaterial } from '../api/wikiEngine'
import type { WikiMethods } from '../api/wiki'
import { SourceChip } from '../components/SourceChip'
import { WikiSourceProvider, type WikiSource } from '../views/WikiPage'
import { EVIDENCE, PAPERS } from './fixtures'
import { baseState, useStore, type State } from './store'
import { WIKI_SAMPLES } from './workspace'

// The scripted demo keeps topic Wikis for the whole browser session, across route changes.
const records: Record<string, StoredWiki> = {}
let seeded = false

/** Everything the demo store knows about one topic, in the shape the Wiki engine captures from. */
function material(s: State, topic: string): WikiMaterial {
  const papers = s.library.filter((id) => s.paperTopics[id]?.includes(topic) && PAPERS[id])
  const evidenceOf = (paperId: string) => Object.values(EVIDENCE).filter((e) => e.paperId === paperId)
  const sessions = new Set(s.sessions.filter((x) => x.topicId === topic).map((x) => x.id))
  const messages = s.messages.filter((m) => sessions.has(m.sessionId))
  const turns = messages.flatMap((m, i) => {
    const answer = messages[i + 1]
    if (m.role !== 'user' || answer?.role !== 'agent' || !answer.done) return []
    return [{
      id: answer.id, question: m.segments.map((x) => x.text).join(''),
      sentences: answer.segments.flatMap((x) => {
        const ids = x.evidenceIds ?? (x.evidenceId ? [x.evidenceId] : [])
        return ids.length && x.text.trim() ? [{ text: x.text.trim(), anchor_ids: ids }] : []
      }),
    }]
  })
  return {
    title: s.topics.find((t) => t.id === topic)?.title ?? '',
    papers: papers.map((id) => ({
      id, title: PAPERS[id].short, full_text: PAPERS[id].stored === 'full-text' || PAPERS[id].stored === 'excerpt',
      chunks: evidenceOf(id).slice(0, 2).map((e) => ({ text: e.quote, anchor_ids: [e.id] })),
    })),
    notes: s.noted.filter((id) => EVIDENCE[id] && papers.includes(EVIDENCE[id].paperId))
      .map((id) => ({ id, text: EVIDENCE[id].quote, anchor_ids: [id] })),
    turns,
    findings: [],
  }
}

function sample(topic: string): StoredWiki | undefined {
  const seed = WIKI_SAMPLES.find((w) => w.topicId === topic)
  if (!seed) return
  const at = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString()
  const entries = seed.entries.map(([kind, origin, text, anchor_ids, pinned]) => ({
    entry_id: crypto.randomUUID(), kind, origin, text, anchor_ids, pinned: !!pinned, updated_at: at(seed.minutesAgo),
  }))
  return {
    ...emptyWiki(topic), revision: crypto.randomUUID(), status: 'ready', headline: seed.headline, summary: seed.summary,
    generated_at: at(seed.minutesAgo), entries,
    thread: seed.thread.map((m, i) => {
      const added = m.added && entries.find((e) => e.text === m.added)
      return {
        message_id: topic + '-m' + i, role: m.role, text: m.text, created_at: at(seed.minutesAgo + 10 - i),
        ...(added && { changes: [{ op: 'add' as const, entry_id: added.entry_id, text: added.text }] }),
      }
    }),
  }
}

export function StoreWikiSource({ children }: { children: ReactNode }) {
  const { state } = useStore()
  const current = useRef(state)
  current.current = state
  const engine = useMemo(() => createWikiEngine({
    records: () => records, model: () => undefined, material: (topic) => material(current.current, topic),
  }), [])
  if (!seeded) {
    seeded = true
    for (const topic of state.topics) {
      const wiki = sample(topic.id)
      if (wiki) engine.adopt(topic.id, wiki, material(baseState, topic.id))
    }
  }
  const call = useCallback(<M extends keyof WikiMethods>(method: M, params: Omit<WikiMethods[M][0], 'operation_id'>) =>
    Promise.resolve().then(() => (engine.handlers[method] as (p: unknown) => WikiMethods[M][1])({ ...params, operation_id: '' })),
  [engine])
  const Source = useCallback(({ id, anchor }: { id: string; anchor: string }) => <SourceChip evidenceId={id} anchor={anchor} />, [])
  // Re-read when topic activity changes so new answers, notes and papers are captured while the page is open.
  const tick = state.messages.length + state.noted.length * 1000 + state.library.length * 100000
  const source: WikiSource = { call, tick, Source }
  return <WikiSourceProvider value={source}>{children}</WikiSourceProvider>
}
