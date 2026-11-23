import type { FixtureState, Handlers } from './libraryFixture'
import type { Located } from './library'
import type { Cell, Comparison, ResearchMethods, ResearchTask } from './research'
export type ResearchFixture = { comparisons: Record<string, Comparison[]> }
const id = () => crypto.randomUUID()
export function researchFixture(state: FixtureState & { research: ResearchFixture }, original: Located) {
  const comparisons = (topic: string) => (state.research.comparisons[topic] ??= [])
  function generate(task: ResearchTask, record_id: string) {
    const { topic_id } = task
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
  }
  return { handlers, generate }
}
