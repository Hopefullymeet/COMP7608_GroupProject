import { EVIDENCE } from './fixtures'
import type { ComparisonRow, WikiPage, WikiProposal } from './types'

export function buildWikiProposal(noteIds: string[], comparison: ComparisonRow[], pages: WikiPage[]): WikiProposal {
  const comparisonEvidenceIds = [...new Set(comparison.flatMap((row) => row.cells.flatMap((cell) => cell.evidenceId ?? [])))]
  const evidenceIds = [...new Set([...noteIds, ...comparisonEvidenceIds])]
  const page: WikiPage = {
    id: 'w-grounded',
    title: 'Evidence-grounded QA datasets',
    kind: 'Concept',
    summary: 'Evidence from the notes and comparisons selected for this page.',
    statements: evidenceIds.map((id) => ({
      id: 'statement-' + id, text: EVIDENCE[id].quote, evidenceIds: [id], author: 'Agent draft', excerpt: true,
    })),
    relations: [],
    questions: [],
    revisions: [],
  }
  const edits: WikiProposal['edits'] = []
  for (const row of comparison) {
    const [left, right] = row.cells
    if (row.comparable || !row.note || !left.evidenceId || !right.evidenceId) continue
    const fromPaperId = EVIDENCE[left.evidenceId].paperId
    const toPaperId = EVIDENCE[right.evidenceId].paperId
    const evidenceIds = [left.evidenceId, right.evidenceId]
    const relation = { id: 'comparison-' + row.id, fromPaperId, toPaperId, evidenceIds, type: 'not comparable with', status: 'verified' } as const
    page.relations.push(relation)
    page.questions.push({
      id: relation.id,
      kind: 'comparison-gap',
      claim: row.dimension,
      sides: [{ text: left.value, evidenceId: left.evidenceId }, { text: right.value, evidenceId: right.evidenceId }],
      question: row.note,
    })
    const target = pages.find((p) => p.paperId === fromPaperId)
    if (target) {
      const existingEdit = edits.find((edit) => edit.pageId === target.id)
      if (existingEdit) existingEdit.relations.push(relation)
      else edits.push({ pageId: target.id, relations: [relation] })
    }
  }
  return { page, edits, inputs: { noteIds, comparisonEvidenceIds } }
}

export function reviewWikiProposal(proposal: WikiProposal, pages: WikiPage[], isAvailable: (id: string) => boolean) {
  const selected = new Set([...proposal.inputs.noteIds, ...proposal.inputs.comparisonEvidenceIds])
  const unavailable = new Set([...selected].filter((id) => !isAvailable(id)))
  let blocked = 0
  let unchanged = 0
  function additions<T extends { id: string }>(items: T[], saved: T[], sources: (item: T) => string[]) {
    const seen = new Set(saved.map((item) => item.id))
    return items.filter((item) => {
      if (seen.has(item.id)) {
        unchanged += 1
        return false
      }
      const ids = sources(item)
      const missing = ids.filter((id) => !selected.has(id) || !isAvailable(id))
      if (!ids.length || missing.length) {
        missing.forEach((id) => unavailable.add(id))
        blocked += 1
        return false
      }
      seen.add(item.id)
      return true
    })
  }

  const targets = [proposal.page, ...proposal.edits.flatMap((edit) => {
    const current = pages.find((page) => page.id === edit.pageId)
    return current ? [{ ...current, statements: [], relations: edit.relations, questions: [] }] : []
  })]
  const changes = targets.flatMap((proposed) => {
    const current = pages.find((page) => page.id === proposed.id)
    const statements = additions(proposed.statements, current?.statements ?? [], (item) => item.evidenceIds)
    const relations = additions(proposed.relations, current?.relations ?? [], (item) => item.evidenceIds)
    const questions = additions(proposed.questions, current?.questions ?? [], (item) => item.sides.map((side) => side.evidenceId))
    const count = statements.length + relations.length + questions.length
    return count ? [{ current, proposed: { ...proposed, statements, relations, questions }, count }] : []
  })
  return { changes, blocked, unchanged, unavailableIds: [...unavailable] }
}
