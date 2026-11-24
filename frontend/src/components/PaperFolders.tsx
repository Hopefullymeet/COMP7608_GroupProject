import { useState } from 'react'
import type { FolderList } from '../api/library'
import { useWorkspace } from '../data/WorkspaceProvider'
import { useLanguage } from '../i18n'
import { Dialog } from './PageHead'

export function PaperFolders({ topic, folders, filter, onFilter, papers }: {
  topic: string; folders?: FolderList; filter: string; onFilter: (id: string) => void; papers: string[]
}) {
  const { tr } = useLanguage()
  const { write, busy, report } = useWorkspace()
  const [name, setName] = useState<string>()
  return <div className="pt-folder-tools">
    <select aria-label={tr('Paper folders')} value={filter} onChange={e => onFilter(e.target.value)}>
      <option value="">{tr('All folders')}</option>
      <option value="-">{tr('Outside folders')}</option>
      {folders?.items.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
    </select>
    <button className="link-btn" onClick={() => setName('')}>{tr('New folder')}</button>
    {!!papers.length && !!folders?.items.length && <select aria-label={tr('Move to folder')} value="" disabled={busy}
      onChange={e => void write('library.folder_move', { topic_id: topic, paper_ids: papers,
        folder_id: e.target.value === '-' ? '' : e.target.value }).catch(report)}>
      <option value="" disabled>{tr('Move to folder')}</option>
      <option value="-">{tr('Outside folders')}</option>
      {folders.items.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
    </select>}
    {name !== undefined && <Dialog title={tr('New folder')} onClose={() => setName(undefined)}>
      <form onSubmit={e => {
        e.preventDefault()
        void write('library.folder_create', { topic_id: topic, name: name.trim() })
          .then(() => setName(undefined)).catch(report)
      }}>
        <label className="rename-field">{tr('Folder name')}
          <input autoFocus required maxLength={80} value={name} onChange={e => setName(e.target.value)} />
        </label>
        <div className="dialog-actions"><button className="primary" disabled={busy || !name.trim()}>{tr('Create')}</button></div>
      </form>
    </Dialog>}
  </div>
}
