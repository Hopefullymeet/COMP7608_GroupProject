import { useState } from 'react'
import type { PdfObject } from '../api/reader'
import { useWorkspace } from '../data/WorkspaceProvider'
import { useLanguage } from '../i18n'
import { Dialog } from './PageHead'

export function FigureSearch({ topic, versions, names, onOpen, onAsk, onClose }: {
  topic: string; versions: string[]; names: Record<string, string>
  onOpen: (figure: PdfObject) => void; onAsk: (figure: PdfObject) => void; onClose: () => void
}) {
  const { tr } = useLanguage()
  const workspace = useWorkspace()
  const [figureQuery, setFigureQuery] = useState('')
  const [figures, setFigures] = useState<PdfObject[]>()
  const [skippedFigures, setSkippedFigures] = useState(0)
  const [finding, setFinding] = useState(false)

  async function searchFigures() {
    if (!figureQuery.trim() || !versions.length) return
    setFinding(true)
    try {
      const result = await workspace.api.call('visual.search', { topic_id: topic, source_versions: versions,
        query: figureQuery.trim() })
      setFigures(result.items)
      setSkippedFigures(result.skipped)
    } catch (error) { workspace.report(error) }
    finally { setFinding(false) }
  }

  return <Dialog title={tr('Find a figure')} onClose={onClose}>
        <form className="synthesis-question" onSubmit={(e) => { e.preventDefault(); void searchFigures() }}>
          <label htmlFor="pt-figure-query">{tr('Describe the figure, table or equation')}</label>
          <input id="pt-figure-query" value={figureQuery} maxLength={400} onChange={(e) => setFigureQuery(e.target.value)} />
          <button className="primary" disabled={finding || !figureQuery.trim()}>{tr('Search figures')}</button>
        </form>
        {figures?.length === 0 && <p>{tr('No matching regions. Try another description.')}</p>}
        {skippedFigures > 0 && <p className="fine">{tr('{0} selected papers could not be indexed.', skippedFigures)}</p>}
        {figures?.map((figure) => <article className="synthesis-item" key={figure.object_id}>
          <strong>{names[figure.source_version_id]} · {tr(figure.label)}</strong>
          {figure.match_kind && <small className="fine"> · {tr({
            caption: 'Caption match', region: 'Indexed region', page: 'Page mention only',
          }[figure.match_kind])}</small>}
          {figure.caption && <p className="fine">{figure.caption}</p>}
          <button className="link-btn" onClick={() => {
            onOpen(figure)
            onClose()
          }}>{tr('PDF page {0}', figure.page)}</button>
          <button className="link-btn" onClick={() => {
            onAsk(figure)
            onClose()
          }}>{tr('Ask AI')}</button>
          {Boolean(figure.rows?.length) && <details className="pt-parsed-table">
            <summary>{tr('Extracted table')}</summary>
            <table><thead><tr>{figure.rows?.[0].map((cell, col) => <th key={col} scope="col">{cell}</th>)}</tr></thead>
              <tbody>{figure.rows?.slice(1).map((row, i) => <tr key={i}>
                {row.map((cell, col) => <td key={col}>{cell}</td>)}
              </tr>)}</tbody>
            </table>
          </details>}
        </article>)}
      </Dialog>
}
