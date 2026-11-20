import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { defineTool } from "__TOOLS__"

export const inject = ['tools']
export function apply(ctx) {
  const scope = JSON.parse(readFileSync("__SCOPE__", 'utf8'))
  const db = new DatabaseSync(scope.database, { readOnly: true })
  const versions = new Set(scope.sources.map((paper) => paper.source_version_id))
  const fullVersions = new Set(scope.sources.filter((paper) => paper.available_scope === "full_text").map((paper) => paper.source_version_id))
  const abstract = new Map(scope.sources.flatMap((paper) =>
    (paper.passages ?? []).map((passage) => [passage.passage_id, {
      ...passage, paper_id: paper.paper_id, source_version_id: paper.source_version_id,
    }])))
  const slots = [...fullVersions].map(() => '?').join(',')
  const select = 'passage_id, version_id AS source_version_id, page, ordinal, text'
  const terms = (query) => [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].slice(0, 12)
  let calls = 0
  let evidenceReads = 0

  function tool(name, description, parameters, execute) {
    ctx.tools.register(defineTool({
      name, description, parameters,
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute(args) {
        if (++calls > scope.max_calls) return JSON.stringify({ limit_reached: true })
        return JSON.stringify(execute(args))
      },
    }))
  }
  tool('paper_search', 'Search scoped paper text. Use distinctive terms or exact names and choose a version to inspect it. Read returned IDs before quoting.',
    { query: { type: 'string' }, version: { type: 'string', description: 'Exact version ID, or an empty string for all selected papers.' } },
    ({ query, version }) => {
      if (version && !versions.has(version)) throw new Error('Version outside topic scope.')
      const tokens = terms(query)
      if (!tokens.length) return []
      const selected = version ? [version] : [...versions]
      const full = selected.filter((item) => fullVersions.has(item))
      const placeholders = version ? '?' : slots
      const expression = tokens.map((word) => '"' + word + '"').join(' OR ')
      const rows = full.length ? db.prepare(`SELECT ${select} FROM paper_passages
        WHERE paper_passages MATCH ? AND version_id IN (${placeholders})
        ORDER BY bm25(paper_passages), version_id, page, ordinal LIMIT 10`).all(expression, ...full) : []
      const results = [...rows, ...[...abstract.values()].filter((p) => selected.includes(p.source_version_id)
        && tokens.some((token) => p.text.toLowerCase().includes(token)))]
      return results.slice(0, 12).map(({ text, ...row }) => ({ ...row, preview: text.slice(0, 180) }))
    })
  tool('paper_read', 'Read exact passage IDs and their adjacent context within the same PDF page. Use the returned IDs and verbatim quotes.',
    { ids: { type: 'array', items: { type: 'string' }, description: 'Up to four passage IDs returned by search or Wiki.' } },
    ({ ids }) => {
      if (!ids.length || ids.length > 4) throw new Error('Read one to four passage IDs.')
      const results = new Map()
      for (const id of new Set(ids)) {
        if (abstract.has(id)) results.set(id, abstract.get(id))
        else {
          if (!fullVersions.size) throw new Error('Passage outside topic scope.')
          const row = db.prepare(`SELECT ${select} FROM paper_passages
            WHERE passage_id = ? AND version_id IN (${slots})`).get(id, ...fullVersions)
          if (!row) throw new Error('Passage outside topic scope.')
          const context = db.prepare(`SELECT ${select} FROM paper_passages
            WHERE version_id = ? AND page = ? AND ordinal BETWEEN ? AND ? ORDER BY ordinal`)
            .all(row.source_version_id, row.page, row.ordinal - 1, row.ordinal + 1)
          for (const p of context) results.set(p.passage_id, p)
        }
      }
      evidenceReads += results.size
      if (evidenceReads > scope.max_reads) return { limit_reached: true }
      return [...results.values()]
    })
  tool('wiki_search', 'Find reviewed topic discoveries and open questions. Wiki is a lead: read original passages and search for missing or contrary evidence.',
    { query: { type: 'string' } },
    ({ query }) => {
      const tokens = terms(query)
      return scope.wiki.map((entry) => ({ entry,
        score: tokens.filter((token) => entry.search_text.toLowerCase().includes(token)).length }))
        .filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).slice(0, 6)
        .map(({ entry }) => entry)
    })
}
