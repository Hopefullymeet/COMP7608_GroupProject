import { useEffect, useState } from 'react'
import { Dialog } from '../components/PageHead'
import { useWorkspace } from '../data/WorkspaceProvider'
import { useLanguage } from '../i18n'
import { providerName } from '../api/services'
import type { ConnectionAction, Connection, ConnectionList } from '../api/services'

export function CredentialDialog({ role, endpoint, model, directAdd = false, onClose, onChanged }: {
  directAdd?: boolean; role: 'model' | 'reviewer'; endpoint: string; model: string; onClose: () => void; onChanged: () => void
}) {
  const { tr } = useLanguage()
  const { api } = useWorkspace()
  const [library, setLibrary] = useState<ConnectionList>()
  const [adding, setAdding] = useState(directAdd)
  const [removing, setRemoving] = useState<Connection>()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<Connection>()
  const [url, setUrl] = useState(directAdd ? '' : endpoint)
  const [modelId, setModelId] = useState(directAdd ? '' : model)
  const [key, setKey] = useState('')
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [reload, setReload] = useState(0)
  const valid = !!name.trim() && /^https?:\/\/[^\s]+$/i.test(url.trim()) && !!modelId.trim() && (key.trim() ? /^[!-~]{1,512}$/.test(key.trim()) : role === 'reviewer' || !!editing?.preview)
  const displayName = (entry: Connection) => entry.id.startsWith('Key-') ? entry.name : tr(role === 'model' ? providerName(entry) : entry.name)

  useEffect(() => {
    if (directAdd) return
    let current = true
    setFailed(false)
    api.call('services.connections', { role, action: 'list' })
      .then(result => { if (current) setLibrary(result) })
      .catch(() => { if (current) setFailed(true) })
    return () => { current = false }
  }, [api, role, directAdd, reload])

  function resetForm() {
    setEditing(undefined)
    setAdding(false)
    setRemoving(undefined)
    setName('')
    setKey('')
    setFailed(false)
  }

  async function update(action: ConnectionAction) {
    setPending(true)
    setFailed(false)
    try {
      const result = await api.call('services.connections', { role, ...action })
      setLibrary(result)
      resetForm()
      onChanged()
      if (directAdd) onClose()
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  return <Dialog title={tr(role === 'reviewer' ? 'Reviewer connections' : adding && !editing ? 'Add model provider' : 'Manage providers')} onClose={() => { if (!pending) onClose() }}>
    {failed && <p className="set-error" role="alert">{tr('The system credential store could not complete the request.')}</p>}
    {!directAdd && !library && (failed
      ? <button className="ghost-btn" onClick={() => setReload(reload + 1)}>{tr('Retry')}</button>
      : <p role="status">{tr('Loading…')}</p>)}
    {(library || directAdd) && <>
      {!adding && library && <ul className="credential-list" tabIndex={0} aria-label={tr('Connections')}>
        {library.entries.map(entry => <li className="source-row" key={entry.id}>
          <span className="grow"><strong>{displayName(entry)}</strong><small>{entry.model || tr('Set endpoint and model ID')}</small><small>{entry.endpoint}</small><small>{entry.preview}</small></span>
          {entry.id === library.selected ? <span className="tag ok">{tr('In use')}</span>
            : <button className="ghost-btn sm" disabled={pending || adding || !!removing || !entry.endpoint}
              onClick={() => void update({ action: 'select', entry: entry.id })}>{tr('Use credential')}</button>}
          <button className="ghost-btn sm" disabled={pending || !!removing} onClick={() => {
            setEditing(entry); setName(displayName(entry)); setUrl(entry.endpoint || endpoint); setModelId(entry.model || model)
            setAdding(true); setFailed(false)
          }}>{tr('Edit')}</button>
          <button className="ghost-btn sm" disabled={pending || adding || !!removing}
            aria-label={tr('Delete {0}', displayName(entry))} onClick={() => { setFailed(false); setRemoving(entry) }}>{tr('Delete')}</button>
        </li>)}
      </ul>}
      {!library?.entries.length && !adding && <p className="dialog-text">{tr('No saved connections.')}</p>}
      {removing ? <div>
        <p>{tr('Delete the connection “{0}” and its saved key?', displayName(removing))}</p>
        <div className="dialog-actions">
          <button className="ghost-btn" disabled={pending} onClick={directAdd ? onClose : resetForm}>{tr('Cancel')}</button>
          <button className="danger" disabled={pending} onClick={() => void update({ action: 'remove', entry: removing.id })}>{tr('Delete connection')}</button>
        </div>
      </div> : adding ? <form className="credential-form" onSubmit={event => {
        event.preventDefault()
        if (valid && !pending) void update({ action: editing ? 'edit' : 'add', entry: editing?.id, url: url.trim(), model: modelId.trim(), name: name.trim(), api_key: key.trim() })
      }}>
        <label className="set-field">{tr(role === 'model' ? 'Provider name' : 'Connection name')}<input className="text-field" autoFocus maxLength={80}
          disabled={pending} value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="set-field">{tr(role === 'model' ? 'Endpoint base URL' : 'System One decision endpoint')}<input className="text-field" type="url" required
          placeholder={role === 'model' ? 'https://api.example.com/v1' : undefined}
          value={url} disabled={pending} onChange={e => setUrl(e.target.value)} />
          {role === 'model' && <small className="fine">{tr('Enter the OpenAI-compatible base URL. Include /v1 if your provider requires it. A trailing slash is optional. PaperTrace appends /chat/completions.')}</small>}</label>
        <label className="set-field">{tr('Model ID')}<input className="text-field" required value={modelId}
          disabled={pending} onChange={e => setModelId(e.target.value)} /></label>
        <label className="set-field">{tr(editing?.preview ? 'API key (leave blank to keep saved key)' : role === 'reviewer' ? 'API key (optional)' : 'API key')}<input className="text-field" type="password" autoComplete="off"
          spellCheck={false} disabled={pending} value={key} onChange={e => setKey(e.target.value)} /></label>
        <div className="dialog-actions">
          <button type="button" className="ghost-btn" disabled={pending} onClick={directAdd ? onClose : resetForm}>{tr('Cancel')}</button>
          <button className="primary" disabled={pending || !valid}>{tr('Save connection')}</button>
        </div>
      </form> : <div className="dialog-actions">
        <button className="primary" disabled={pending} onClick={() => { setFailed(false); setUrl(role === 'model' ? '' : endpoint); setModelId(role === 'model' ? '' : model); setAdding(true) }}>{tr(role === 'model' ? 'Add model provider' : 'Add connection')}</button>
      </div>}
    </>}
  </Dialog>
}
