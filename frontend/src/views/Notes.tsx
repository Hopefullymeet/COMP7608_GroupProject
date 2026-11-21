import { useLanguage } from '../i18n'
import { useEffect, useRef, useState } from 'react'
import { Dialog } from '../components/PageHead'
import { Disclosure } from '../components/Disclosure'
import { Icon } from '../components/Icon'
import type { Located, Note } from '../api/library'
import { useRead, useWorkspace } from '../data/WorkspaceProvider'

export function EvidenceLink({ id }: { id: string }) {
  const { tr } = useLanguage()
  const { api, report } = useWorkspace()
  const [item, setItem] = useState<Located>()
  const p = item?.source.passages.find((p) => p.passage_id === item.passage_id)
  const page = useRead('source.page', {
    topic_id: item?.topic_id ?? '', source_version_id: item?.source.source_version_id ?? '', page: p?.page ?? 0,
  }, Boolean(item?.topic_id && p?.page))
  const crop = useRead('visual.crop', { topic_id: item?.topic_id ?? '', source_version_id: item?.source.source_version_id ?? '',
    page: item?.region?.page ?? 0, rect: item?.region?.rect ?? [0, 0, 1, 1] }, Boolean(item?.topic_id && item.region))
  return (
    <>
      <button
        className="src-btn"
        onClick={() => void api.call('evidence.open', { anchor_id: id }).then(setItem).catch(report)}
      >
        <Icon name="quote" size={13} />{' '}{tr('View source')}
      </button>
      {item && (
        <Dialog title={tr('Source evidence')} onClose={() => setItem(undefined)}>
          <p className="record-meta">
            {item.source.source_version_id} · {tr(item.read_scope.replace('_', ' '))} · {p?.section}
            {p?.page ? tr(' · p. {0}', p.page) : ''}
          </p>
          <blockquote className="evidence-excerpt">{item.quote}</blockquote>
          <p>{p?.text}</p>
          {page && <img className="evidence-pdf-page" src={'data:image/png;base64,' + page.png} alt={'Original PDF page ' + page.page} />}
          {crop && <img className="evidence-pdf-page" src={'data:image/png;base64,' + crop.image}
            alt={tr('PDF page {0}', item.region?.page ?? 0)} />}
          {p?.page && !item.topic_id ? (
            <button
              className="ghost-btn"
              onClick={() =>
                void api
                  .call('source.original', { source_version_id: item.source.source_version_id, page: p.page })
                  .catch(report)
              }
            >
              {tr('Open original page')}
            </button>
          ) : null}
        </Dialog>
      )}
    </>
  )
}
function Editor({ topic, note, close }: { topic: string; note?: Note; close: () => void }) {
  const { tr } = useLanguage()
  const { write, report } = useWorkspace()
  const [text, setText] = useState(note?.text ?? ''),
    [anchors, setAnchors] = useState(note?.anchor_ids ?? [])
  const [add, setAdd] = useState(''),
    [status, setStatus] = useState('')
  const previous = useRef(note),
    ongoing = useRef<Promise<void>>()
  const current = useRef({ text, anchors })
  current.current = { text, anchors }
  async function save() {
    if (ongoing.current) await ongoing.current
    const entry = previous.current,
      draft = current.current
    if (
      !draft.text.trim() ||
      (draft.text === entry?.text && JSON.stringify(draft.anchors) === JSON.stringify(entry.anchor_ids))
    )
      return
    setStatus('Saving…')
    const request = write('note.save', {
      topic_id: topic,
      note_id: entry?.note_id,
      base_revision: entry?.revision,
      session_id: entry?.session_id,
      text: draft.text,
      anchor_ids: draft.anchors,
      origin: 'user',
    }).then((n) => {
      previous.current = n
      setStatus('Saved')
    })
    ongoing.current = request
    try {
      await request
    } finally {
      ongoing.current = undefined
    }
  }
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    const timer = setTimeout(() => void saveRef.current().catch(report), 850)
    return () => clearTimeout(timer)
  }, [text, anchors, report])
  const done = () => void save().then(close).catch(report)
  return (
    <Dialog title={tr('Research note')} onClose={done}>
      <textarea
        className="text-field"
        aria-label={tr('Note text')}
        rows={6}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setStatus('Edited')
        }}
      />
      <div>
        {anchors.map((a) => (
          <EvidenceLink key={a} id={a} />
        ))}
      </div>
      <label className="set-field">
        {tr('Insert source anchor')}
        <input className="text-field" value={add} onChange={(e) => setAdd(e.target.value)} />
      </label>
      <button
        className="link-btn"
        disabled={!add.trim() || anchors.includes(add.trim())}
        onClick={() => {
          setAnchors([...anchors, add.trim()])
          setAdd('')
        }}
      >
        {tr('Insert')}
      </button>
      {previous.current?.history.map((h) => (
        <Disclosure
          className="record-history"
          key={h.revision}
          icon="clock"
          title={<span title={h.revision}>{tr('Revision ·')}{' '}{h.revision.slice(0, 8)}</span>}
        >
          <div className="history-entries">
            <p>{h.text}</p>
            <button
              className="link-btn"
              onClick={() => {
                setText(h.text)
                setAnchors(h.anchor_ids)
              }}
            >
              {tr('Restore this version')}
            </button>
          </div>
        </Disclosure>
      ))}
      <div className="dialog-actions">
        <small className="record-meta" role="status">
          {tr(status)}
        </small>
        <button className="primary" onClick={done}>
          {tr('Done')}
        </button>
      </div>
    </Dialog>
  )
}
export function Notes({ topic }: { topic: string }) {
  const { tr } = useLanguage()
  const result = useRead('note.list', { topic_id: topic }, !!topic)
  const [edit, setEdit] = useState<Note | 'new'>(),
    [query, search] = useState('')
  return (
    <section className="card lib-detail">
      <h2>{tr('Research notes')}</h2>
      {!topic ? (
        <p>{tr('Select a working topic to open its notes.')}</p>
      ) : (
        <>
          <div className="lib-tools">
            <label className="field-search">
              <Icon name="search" size={16} />
              <input
                aria-label={tr('Search notes')}
                placeholder={tr('Search text, session or source')}
                value={query}
                onChange={(e) => search(e.target.value)}
              />
            </label>
            <button className="primary" onClick={() => setEdit('new')}>
              <Icon name="plus" size={14} />{' '}{tr('New note')}
            </button>
          </div>
          {result?.items
            .filter((n) =>
              [n.text, n.session_id, ...n.anchor_ids].join(' ').toLowerCase().includes(query.toLowerCase()),
            )
            .map((n) => (
              <article className="research-record" key={n.note_id}>
                <small className="record-meta" title={n.revision}>
                  {n.origin} · {n.revision.slice(0, 8)}
                </small>
                <p>{n.text}</p>
                <div className="set-controls">
                  {n.anchor_ids.map((a) => (
                    <EvidenceLink key={a} id={a} />
                  ))}
                  <button className="link-btn" onClick={() => setEdit(n)}>
                    {tr('Edit note')}
                  </button>
                </div>
              </article>
            ))}
          {edit && (
            <Editor topic={topic} note={edit === 'new' ? undefined : edit} close={() => setEdit(undefined)} />
          )}
        </>
      )}
    </section>
  )
}
