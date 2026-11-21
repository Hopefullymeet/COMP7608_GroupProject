import { useEffect, useRef, useState } from 'react'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import type { MetadataRecord } from '../api/library'
import { isTauri } from '../api/desktop'
import { pdfInput, pickPdfs } from '../api/pdf'
import { Dialog } from '../components/PageHead'
import { useWorkspace } from '../data/WorkspaceProvider'
import { useLanguage } from '../i18n'

type Attachment = File | string
type Topic = { id: string; title: string }
type Preview = { preview_id: string; metadata: MetadataRecord; existing_paper_id?: string }
type ImportRow = {
  id: string
  label: string
  file?: Attachment
  identifier?: string
  preview?: Preview
  result?: string
  error?: string
}

function pdfRows(files: Attachment[]): ImportRow[] {
  return files.map((file) => ({
    id: crypto.randomUUID(), file, label: typeof file === 'string' ? file.split(/[\\/]/).at(-1) ?? file : file.name,
  }))
}

export function usePdfDrop(onDrop: ((files: string[]) => void) | undefined) {
  const callback = useRef(onDrop)
  callback.current = onDrop
  const enabled = !!onDrop
  useEffect(() => {
    if (!enabled || !isTauri()) return
    let live = true
    const subscription = getCurrentWebview().onDragDropEvent((event) => {
      if (live && event.payload.type === 'drop') callback.current?.(event.payload.paths)
    })
    void subscription.catch(() => {})
    return () => { live = false; void subscription.then((stop) => stop()).catch(() => {}) }
  }, [enabled])
}

export function PaperImportDialog({ topics, initialTopic, initialFiles = [], paperId, onClose, onImported, onOpenTopic }: {
  topics: Topic[]
  initialTopic?: string
  initialFiles?: Attachment[]
  paperId?: string
  onClose: () => void
  onImported?: (paper_id: string, source_version_id: string) => void
  onOpenTopic?: (topic_id: string) => void
}) {
  const { tr } = useLanguage()
  const workspace = useWorkspace()
  const [topic, setTopic] = useState(initialTopic || topics[0]?.id || '')
  const [title, setTitle] = useState('')
  const [input, setInput] = useState('')
  const [rows, setRows] = useState<ImportRow[]>(() => pdfRows(initialFiles))
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const running = useRef(false)
  const started = rows.some((row) => row.result || row.preview)
  const positive = rows.some((row) => row.result)
  const available = rows.filter((row) => !row.result && !row.error)
  const ready = available.filter((row) => row.preview)
  const amend = (id: string, change: Partial<ImportRow>) =>
    setRows((old) => old.map((row) => row.id === id ? { ...row, ...change } : row))
  const queueFiles = (files: Attachment[]) => {
    if (!running.current) setRows((old) => [...old, ...pdfRows(files)])
  }
  usePdfDrop(queueFiles)
  const queueIdentifiers = () => {
    const seen = new Set(rows.flatMap((row) => row.identifier ? [row.identifier.toLowerCase()] : []))
    const additions: ImportRow[] = []
    for (const identifier of input.trim().split(/\s+/)) {
      if (!identifier || seen.has(identifier.toLowerCase())) continue
      seen.add(identifier.toLowerCase())
      additions.push({ id: crypto.randomUUID(), label: identifier, identifier })
    }
    setRows((old) => [...old, ...additions])
    setInput('')
  }

  async function process(entries: ImportRow[]) {
    if (running.current || !entries.length || (!topic && paperId)) return
    running.current = true
    setProcessing(true)
    setError('')
    try {
      let topicId = topic
      if (!topicId) {
        if (!title.trim()) return
        const response = await workspace.write('topic.create', { title: title.trim() })
        topicId = response.topic_id
        setTopic(topicId)
      }
      for (const row of entries) {
        amend(row.id, { error: undefined })
        try {
          if (row.file) {
            const value = await workspace.write('library.import_pdf', {
              topic_id: topicId, paper_id: paperId, ...await pdfInput(row.file),
            })
            amend(row.id, { result: value.duplicate ? 'Already in library' :
              value.available_scope === 'metadata' ? 'Text unavailable' : 'Imported' })
            onImported?.(value.paper_id, value.source_version_id)
          } else if (row.preview) {
            const value = await workspace.write('library.commit_identifier', {
              topic_id: topicId, preview_id: row.preview.preview_id, paper_id: paperId,
            })
            amend(row.id, { result: value.already_linked ? 'Already in library' :
              value.available_scope === 'metadata' ? 'PDF needed' : 'Imported' })
            onImported?.(value.paper_id, value.source_version_id)
          } else if (row.identifier) {
            const preview = await workspace.api.call('library.preview_identifier', { topic_id: topicId, identifier: row.identifier })
            amend(row.id, { preview })
          }
        } catch (problem) {
          amend(row.id, { error: problem instanceof Error ? problem.message : 'Import failed' })
        }
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Import failed')
    } finally {
      running.current = false
      setProcessing(false)
    }
  }

  return <Dialog title={tr('Import papers')} onClose={() => { if (!running.current) onClose() }}>
    <div className="paper-import-body" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
      event.preventDefault()
      queueFiles(Array.from(event.dataTransfer.files))
    }}>
      {(topics.length > 1 || (!initialTopic && onOpenTopic)) && <label className="rename-field">{tr('Research topic')}
        <select value={topic} disabled={processing || started}
          onChange={(event) => setTopic(event.currentTarget.value)}>
          {!!onOpenTopic && !initialTopic && <option value="">{tr('New topic')}</option>}
          {topic && !topics.some((item) => item.id === topic) && <option value={topic}>{title}</option>}
          {topics.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}
        </select>
      </label>}
      {!topic && paperId && <p>{tr('Select a topic to import PDFs.')}</p>}
      {!topic && !paperId && <label className="rename-field">{tr('Topic name')}
        <input className="text-field" value={title} disabled={processing} maxLength={160}
          onChange={(event) => setTitle(event.currentTarget.value)} />
      </label>}
      <button className="ghost-btn" disabled={processing} onClick={() => void pickPdfs(!paperId).then(queueFiles)}>{tr('Add PDFs')}</button>
      {!paperId && <div className="rename-field">
        <textarea className="text-field" aria-label={tr('Paste DOI or arXiv IDs')} placeholder={tr('Paste DOI or arXiv IDs')}
          value={input} disabled={processing} onChange={(event) => setInput(event.currentTarget.value)} />
        <button className="link-btn" disabled={!input.trim() || processing} onClick={queueIdentifiers}>{tr('Add identifiers')}</button>
      </div>}
      {error && <p role="alert">{tr(error)}</p>}
      {rows.map((row) => <div className="synthesis-claim" key={row.id}>
        <strong>{row.preview?.metadata.title || row.label}</strong>
        {row.preview && <p className="fine">{[row.preview.metadata.authors.join(', '),
          row.preview.metadata.year, row.preview.metadata.venue, row.preview.metadata.provider].filter(Boolean).join(' · ')}</p>}
        {row.result && <p role="status">{tr(row.result)}</p>}
        {row.error && <p role="alert">{tr(row.error)}</p>}
        <div className="lib-tools">
          {row.error && <button className="link-btn" disabled={processing || (!topic && !title.trim())}
            onClick={() => void process([row])}>{tr('Retry')}</button>}
          {row.preview && !row.result && !row.error && <button className="link-btn" disabled={processing}
            onClick={() => void process([row])}>{tr('Add to topic')}</button>}
          {!row.result && <button className="link-btn" disabled={processing}
            onClick={() => setRows((old) => old.filter((r) => r.id !== row.id))}>{tr('Remove')}</button>}
        </div>
      </div>)}
      <div className="dialog-actions">
        {onOpenTopic && positive && <button className="ghost-btn" disabled={processing} onClick={() => {
          onClose(); onOpenTopic(topic)
        }}>{tr('Open topic')}</button>}
        {ready.length > 1 && <button className="primary" disabled={processing}
          onClick={() => void process(ready)}>{tr('Add reviewed papers')}</button>}
        <button className="primary" disabled={processing || (!topic && (!!paperId || !title.trim())) || !available.some((row) => !row.preview)}
          onClick={() => void process(available.filter((row) => !row.preview))}>
          {tr(processing ? 'Processing…' : 'Process items')}
        </button>
      </div>
    </div>
  </Dialog>
}
