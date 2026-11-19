import type { FixtureState, Handlers } from './libraryFixture'
import type { Located } from './library'
import type { Cell, Comparison, Draft, Page, ResearchMethods, ResearchTask, Wiki } from './research'
export type ResearchFixture = { comparisons: Record<string, Comparison[]>; wiki: Record<string, Wiki> }
const id = () => crypto.randomUUID()
export function researchFixture(state: FixtureState & { research: ResearchFixture }, original: Located) {
  const wiki = (topic: string): Wiki => (state.research.wiki[topic] ??= { pages: [], drafts: [] })
  const comparisons = (topic: string) => (state.research.comparisons[topic] ??= [])
  function generate(task: ResearchTask, record_id: string) {
    const { topic_id } = task
    if (task.kind === 'paper_comparison') {
      const { question, source_versions, dimensions } = task.input
      const anchors = [original, ...Object.values(state.shelf.anchors)]
      const cells = dimensions.flatMap((dimension) =>
        source_versions.map((v): Cell => {
          const matches = anchors.filter((x) => x.source.source_version_id === v)
          const a =
            matches.find((x) =>
              /therefore present|questions are then answered|shared encoding|without its conclusion/.test(
                x.quote,
              ),
            ) ?? matches[0]
          if (a && /method|approach|data source/i.test(dimension))
            return {
              dimension,
              source_version_id: v,
              text: a.quote,
              status: 'evidenced',
              anchor_ids: [a.anchor_id],
            }
          return {
            dimension,
            source_version_id: v,
            text: 'The selected passages do not establish comparable ' + dimension.toLowerCase() + '.',
            status: 'not_comparable',
            anchor_ids: [],
          }
        }),
      )
      comparisons(topic_id).unshift({
        comparison_id: record_id,
        revision: id(),
        question,
        source_versions,
        cells,
        history: [],
      })
    } else {
      const { title, page_id, note_ids, relation_ids } = task.input
      const space = wiki(topic_id),
        page = space.pages.find((p) => p.page_id === page_id)
      const draft: Draft = { draft_id: record_id, title, page_id, base_revision: page?.revision, changes: [] }
      for (const n of state.shelf.notes[topic_id] ?? [])
        if (note_ids.includes(n.note_id)) {
          const before = page?.statements.find((s) => s.id === n.note_id)
          draft.changes.push({
            id: id(),
            before,
            after: { id: n.note_id, text: n.text, anchor_ids: n.anchor_ids },
          })
          if (n.anchor_ids.length)
            draft.changes.push({
              id: id(),
              after: {
                id: id(),
                from: title,
                to: n.text.split('\n')[0].slice(0, 100),
                kind: 'supported by',
                status: 'proposed',
                anchor_ids: n.anchor_ids,
                counter_anchor_ids: [],
                open_question: '',
              },
            })
        }
      for (const r of space.pages.flatMap((p) => p.relations).filter((r) => relation_ids.includes(r.id))) {
        draft.changes.push({ id: id(), before: page?.relations.find((x) => x.id === r.id), after: r })
      }
      space.drafts.unshift(draft)
    }
  }
  const handlers: Handlers<ResearchMethods> = {
    'comparison.list': ({ topic_id }) => ({ items: comparisons(topic_id) }),
    'comparison.save': ({ topic_id, comparison_id, base_revision, cells }) => {
      const c = comparisons(topic_id).find((c) => c.comparison_id === comparison_id)
      if (!c || c.revision !== base_revision)
        throw new Error('Comparison changed. Reopen the current revision.')
      c.history.push({ revision: c.revision, cells: c.cells })
      c.cells = cells
      c.revision = id()
      return c
    },
    'wiki.list': ({ topic_id }) => wiki(topic_id),
    'wiki.review': ({ topic_id, draft_id, decision, change_ids }) => {
      const space = wiki(topic_id),
        draft = space.drafts.find((d) => d.draft_id === draft_id)
      if (!draft) throw new Error('Draft already reviewed.')
      let page = space.pages.find((p) => p.page_id === draft.page_id)
      if (decision === 'accept') {
        if (page?.revision !== draft.base_revision) throw new Error('Page changed. Generate a fresh draft.')
        if (!change_ids.length) throw new Error('Select at least one change.')
        const target: Page = page ?? {
          page_id: id(),
          revision: id(),
          title: draft.title,
          statements: [],
          relations: [],
        }
        for (const c of draft.changes.filter((c) => change_ids.includes(c.id))) {
          const old = c.before ?? c.after
          target.statements = target.statements.filter((s) => s.id !== old?.id)
          target.relations = target.relations.filter((r) => r.id !== old?.id)
          if (c.after) {
            if ('from' in c.after) target.relations.push(c.after)
            else target.statements.push(c.after)
          }
        }
        target.revision = id()
        if (!page) space.pages.push(target)
        page = target
      }
      space.drafts = space.drafts.filter((d) => d !== draft)
      return page ? { page_id: page.page_id } : {}
    },
  }
  return { handlers, generate }
}
