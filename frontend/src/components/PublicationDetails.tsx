import { Fragment, useState } from 'react'
import { Disclosure } from './Disclosure'
import { useRead, useWorkspace } from '../data/WorkspaceProvider'
import { useLanguage } from '../i18n'
import type { MetadataRecord, PaperMetadata, VenueRankings } from '../api/library'

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

const fields: [keyof MetadataRecord, string][] = [
  ['item_type', 'Item type'],
  ['translated_title', 'Translated title'],
  ['title', 'Title'],
  ['authors', 'Authors'],
  ['venue', 'Publication venue'],
  ['publisher', 'Publisher'],
  ['place', 'Place'],
  ['date', 'Publication date'],
  ['volume', 'Volume'],
  ['issue', 'Issue'],
  ['pages', 'Pages'],
  ['article_number', 'Article number'],
  ['part_number', 'Part number'],
  ['part_title', 'Part title'],
  ['series', 'Series'],
  ['series_title', 'Series title'],
  ['series_text', 'Series description'],
  ['journal_abbreviation', 'Journal abbreviation'],
  ['doi', 'DOI'],
  ['citation_key', 'Citation key'],
  ['url', 'URL'],
  ['accessed', 'Accessed'],
  ['pmid', 'PMID'],
  ['pmcid', 'PMCID'],
  ['issns', 'ISSN / eISSN'],
  ['arxiv_id', 'arXiv'],
  ['archive', 'Archive'],
  ['archive_location', 'Archive location'],
  ['library_catalog', 'Library catalog'],
  ['call_number', 'Call number'],
  ['rights', 'Rights'],
  ['extra', 'Extra'],
  ['date_added', 'Date added'],
  ['date_modified', 'Date modified'],
  ['provider', 'Metadata source'],
]

function CatalogImport({ rankings }: { rankings: Rank[] }) {
  const { tr } = useLanguage()
  const { write, busy } = useWorkspace()
  const [status, setStatus] = useState('')
  return <details><summary>{tr('Import a catalog')}</summary><form className="catalog-import" onSubmit={async e => {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const file = data.get('file') as File
    if (file.size > 8000000) { setStatus(tr('Choose a CSV smaller than 8 MB.')); return }
    try {
      const result = await write('library.import_catalog', {scheme: String(data.get('scheme')), edition: String(data.get('edition')),
        year: Number(data.get('year')), source_url: String(data.get('url')), content: await file.text()})
      setStatus(tr('Imported {0} catalog entries.', result.count))
      form.reset()
    } catch (err) { setStatus(err instanceof Error ? err.message : String(err)) }
  }}>
    <label>{tr('Classification scheme')}<select name="scheme">{rankings.map(r=><option key={r.scheme} value={r.scheme}>{r.label}</option>)}</select></label>
    <label>{tr('Edition')}<input required name="edition" /></label>
    <label>{tr('Catalog year')}<input required name="year" type="number" min="1900" max="9999" /></label>
    <label>{tr('Catalog source')}<input required name="url" type="url" placeholder="https://" /></label>
    <label>CSV<input required name="file" type="file" accept=".csv,text/csv" /></label>
    <small>{tr('Required columns: venue, venue_type (journal or conference), value. Optional: issns, aliases, category, source_url.')}</small>
    <button className="ghost-btn" disabled={busy}>{tr('Import a catalog')}</button>
    {status && <small role="status">{status}</small>}
  </form></details>
}

export function PublicationDetails({ topic, paper }: { topic: string; paper: string }) {
  const { tr } = useLanguage()
  const workspace = useWorkspace()
  const [open, setOpen] = useState(false)
  const [rankOpen, setRankOpen] = useState(false)
  const [draft, edit] = useState<(Omit<PaperMetadata, 'issns'> & { issns: string; revision: string })>()
  const entry = useRead('library.metadata', { ...(topic && {topic_id:topic}), paper_id: paper }, (open || rankOpen) && !workspace.demo)
  const metadata = entry?.metadata
  const rankings = entry?.rankings.items ?? []
  const unavailable = rankings.filter((item) => item.status !== 'matched' && item.status !== 'not_applicable')
  return <><Disclosure className="publication-details" icon="book" title={tr('Publication details')} onOpenChange={setOpen}>
    <div className="publication-body">
    {open && !entry && <p role="status">{tr('Loading…')}</p>}
    {entry && metadata && <>
      <dl className="bibliographic-fields">{fields.map(([key,label]) => {
        const raw = metadata[key] || (key === 'item_type' ? metadata.venue_type : key === 'date' ? metadata.year : undefined)
        if (!raw || (Array.isArray(raw) && !raw.length)) return null
        const value = Array.isArray(raw) ? raw.join(key === 'authors' ? '\n' : ', ') : String(raw)
        return <Fragment key={key}><dt>{tr(label)}</dt><dd>{key === 'url' && /^https?:\/\//i.test(value)
          ? <a href={value} target="_blank" rel="noreferrer">{value}</a> : tr(value)}</dd></Fragment>
      })}</dl>
      {metadata.metadata_url && <a href={metadata.metadata_url} target="_blank" rel="noreferrer">{tr('Bibliographic source')}</a>}
      {topic && !draft && <button className="link-btn" onClick={() => edit({
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
    </>}
    </div>
  </Disclosure>
  <Disclosure className="publication-details" icon="library" title={tr('Rankings and indexes')} onOpenChange={setRankOpen}>
    {rankOpen && !entry && <p role="status">{tr('Loading…')}</p>}
    {entry && <>
      {(Object.keys(labels) as (keyof typeof labels)[]).map((metric) => {
        const hits = rankings.filter((item) => item.status === 'matched' && item.metric === metric)
        return hits.length > 0 && <div key={metric}>
          <h4>{tr(labels[metric])}</h4><ul>{hits.map((rank) => <Ranking key={rank.scheme} rank={rank} />)}</ul>
        </div>
      })}
      {unavailable.length > 0 && <Disclosure title={tr('Other catalog results')}>
        <ul>{unavailable.map((rank) => <li key={rank.scheme}>
          {rank.label} · {rank.status !== 'matched' && tr(statuses[rank.status as keyof typeof statuses])}
        </li>)}</ul>
      </Disclosure>}
      <CatalogImport rankings={rankings} />
    </>}
  </Disclosure></>
}
