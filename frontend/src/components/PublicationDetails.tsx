import { useState } from 'react'
import { useRead, useWorkspace } from '../data/WorkspaceProvider'
import { useLanguage } from '../i18n'
import type { PaperMetadata, VenueRankings } from '../api/library'

type Rank = VenueRankings['items'][number]
const labels = { quartile: 'Quartiles', index: 'Indexes', rank: 'Venue ratings' } as const
const statuses = {
  catalog_missing: 'Catalog not installed', venue_unknown: 'Publication venue is missing',
  not_found: 'No match in the installed catalog', ambiguous: 'Check the venue or ISSN',
  not_applicable: 'Not applicable to this publication type',
} as const

function Ranking({ rank }: { rank: Rank }) {
  const { tr } = useLanguage()
  return <li>
    <strong>{rank.label}</strong> {rank.edition && <small>· {rank.edition} · {rank.year}</small>}
    {rank.applicability === 'verify_track' && <p className="fine">{tr('Conference grade found. Confirm the paper track.')}</p>}
    <ul>{rank.entries.map((entry) => <li key={JSON.stringify(entry)}>
      <a href={entry.source_url} target="_blank" rel="noreferrer">{entry.value}</a>
      {entry.category && <> · {entry.category}</>}
    </li>)}</ul>
  </li>
}

export function PublicationDetails({ topic, paper }: { topic: string; paper: string }) {
  const { tr } = useLanguage()
  const workspace = useWorkspace()
  const [open, setOpen] = useState(false)
  const [draft, edit] = useState<(Omit<PaperMetadata, 'issns'> & { issns: string; revision: string })>()
  const entry = useRead('library.metadata', { topic_id: topic, paper_id: paper }, open && !workspace.demo)
  const metadata = entry?.metadata
  const rankings = entry?.rankings.items ?? []
  const unavailable = rankings.filter((item) => item.status !== 'matched' && item.status !== 'not_applicable')
  return <details className="synthesis-item" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{tr('Publication details')}</summary>
    {open && !entry && <p role="status">{tr('Loading…')}</p>}
    {entry && metadata && <>
      <p>{[metadata.venue, metadata.year, metadata.issns?.join(', ')].filter(Boolean).join(' · ')}</p>
      {metadata.metadata_url && <a href={metadata.metadata_url} target="_blank" rel="noreferrer">{tr('Bibliographic source')}</a>}
      {!draft && <button className="link-btn" onClick={() => edit({
        ...metadata, issns: metadata.issns?.join(', ') ?? '', revision: entry.revision,
      })}>{tr('Edit venue details')}</button>}
      {draft && <form onSubmit={(event) => {
        event.preventDefault()
        const { revision, venue, issns, venue_type, publication_track } = draft
        void workspace.write('library.update_metadata', { topic_id: topic, paper_id: paper, base_revision: revision,
          changes: { venue, issns: issns.split(/[,\s]+/).filter(Boolean), venue_type, publication_track } })
          .then(() => edit(undefined)).catch(workspace.report)
      }}>
        <label className="rename-field">{tr('Publication venue')}
          <input className="text-field" value={draft.venue ?? ''} onChange={(e) => edit({
            ...draft, venue: e.target.value,
            issns: draft.issns === (metadata.issns?.join(', ') ?? '') ? '' : draft.issns,
          })} />
        </label>
        <label className="rename-field">ISSN / eISSN
          <input className="text-field" value={draft.issns} onChange={(e) => edit({ ...draft, issns: e.target.value })} />
        </label>
        <label className="rename-field">{tr('Publication type')}
          <select value={draft.venue_type ?? ''} onChange={(e) => edit({ ...draft,
            venue_type: e.target.value as PaperMetadata['venue_type'], publication_track: '' })}>
            <option value="">{tr('Unknown')}</option>
            <option value="journal">{tr('Journal')}</option>
            <option value="conference">{tr('Conference')}</option>
            <option value="preprint">{tr('Preprint')}</option>
          </select>
        </label>
        {draft.venue_type === 'conference' && <label className="rename-field">{tr('Paper track')}
          <select value={draft.publication_track ?? ''} onChange={(e) => edit({ ...draft,
            publication_track: e.target.value as PaperMetadata['publication_track'] })}>
            <option value="">{tr('Unknown')}</option>
            <option value="regular">{tr('Regular paper')}</option>
            <option value="other">{tr('Other track')}</option>
          </select>
        </label>}
        <button className="primary" disabled={workspace.busy}>{tr('Save')}</button>
        <button type="button" className="link-btn" onClick={() => edit(undefined)}>{tr('Cancel')}</button>
      </form>}
      {(Object.keys(labels) as (keyof typeof labels)[]).map((metric) => {
        const hits = rankings.filter((item) => item.status === 'matched' && item.metric === metric)
        return hits.length > 0 && <div key={metric}>
          <h4>{tr(labels[metric])}</h4><ul>{hits.map((rank) => <Ranking key={rank.scheme} rank={rank} />)}</ul>
        </div>
      })}
      {unavailable.length > 0 && <details>
        <summary>{tr('Other catalog results')}</summary>
        <ul>{unavailable.map((rank) => <li key={rank.scheme}>
          {rank.label} · {rank.status !== 'matched' && tr(statuses[rank.status as keyof typeof statuses])}
        </li>)}</ul>
      </details>}
    </>}
  </details>
}
