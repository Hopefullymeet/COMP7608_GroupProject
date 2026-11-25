import { PersonalSettings, RoleSettings } from './PersonalSettings'
import { useLanguage, type Message } from '../i18n'
import { useEffect, useState } from 'react'
import { CredentialDialog } from './CredentialDialog'
import { Dialog } from '../components/PageHead'
import { Icon } from '../components/Icon'
import { useRead, useWorkspace } from '../data/WorkspaceProvider'
import { errorText } from '../api/contract'
import { defaultConfig, providerName, unlimitedBudget } from '../api/services'
import type { Config, ConnectionList, Offer, ServiceMethods } from '../api/services'

function SettingsForm({ config, modelPage = false }: { config: Config; modelPage?: boolean }) {
  const { tr } = useLanguage()
  const { api, write, busy, report, demo, refresh } = useWorkspace()
  const [saveResult, setSaveResult] = useState<{ base: string; config: Config }>(),
    [saveError, setSaveError] = useState(''),
    [edits, set] = useState<Config>(),
    [saving, setSaving] = useState(false),
    [test, setTest] = useState<{ id: string; result: Message }>(),
    [providerDialog, setProviderDialog] = useState<'add' | 'manage'>()
  const saved = saveResult?.base === config.revision ? saveResult.config : config
  const draft = edits ?? saved
  const [reviewKeyOpen, setReviewKeyOpen] = useState(false)
  const reviewer = draft.reviewer ?? { enabled: false, model: '', endpoint: '' }
  const selected = draft.models.find((m) => m.id === draft.model_id) ?? draft.models[0]
  const credentials = config.models.find((m) => m.id === selected?.id)
  const desktopProviders = !!credentials?.credential_store
  const fetchedProviders = useRead('services.connections', { role: 'model', action: 'list' }, desktopProviders)
  const [updatedProviders, setUpdatedProviders] = useState<{ base?: ConnectionList; value: ConnectionList }>()
  const providers = updatedProviders && updatedProviders.base === fetchedProviders ? updatedProviders.value : fetchedProviders
  const currentProvider = providers?.entries.find(entry => entry.id === providers.selected)
  const [switching, setSwitching] = useState(false)
  async function selectProvider(entry: string) {
    setSwitching(true)
    setTest(undefined)
    try {
      const value = await api.call('services.connections', { role: 'model', action: 'select', entry })
      setUpdatedProviders({ base: fetchedProviders, value })
      refresh()
    } catch (error) {
      report(error)
    } finally {
      setSwitching(false)
    }
  }
  function closeCredentials() {
    setProviderDialog(undefined)
    setReviewKeyOpen(false)
    refresh()
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const budgetFields = [
    ['calls', 'Model calls'],
    ['tokens', 'Tokens'],
    ['minutes', 'Minutes'],
    ['cost', 'Spend cap (USD)'],
  ] as const
  function validEndpoint(text: string) {
    const endpoint = text.trim()
    try {
      const u = new URL(endpoint)
      return /^https?:\/\//i.test(endpoint) && !/[\s\\?#<>"`]/.test(endpoint) &&
        !u.username && !u.password && !endpoint.split('/')[2]?.includes('@') && u.port !== '0'
    } catch {
      return false
    }
  }
  const valid =
    (!reviewer.enabled || (validEndpoint(reviewer.endpoint) && reviewer.model.trim().length > 0)) &&
    draft.models.every((m) => (demo ? m.model.trim() : /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(m.model.trim())) &&
      validEndpoint(m.endpoint)) &&
    budgetFields.every(([k]) => {
      const limit = draft.budget[k]
      return limit === null || (Number.isFinite(limit) && limit >= 0 && limit <= Number.MAX_SAFE_INTEGER &&
        ((k !== 'calls' && k !== 'tokens') || Number.isInteger(limit)))
    })
  async function save() {
    const { revision, ...fields } = draft
    setSaving(true)
    setSaveError('')
    try {
      const result = await write('services.save', { ...fields, base_revision: revision })
      if (fields.models.some(model => {
        const stored = result.models.find(item => item.id === model.id)
        return !stored || stored.model.trim() !== model.model.trim() ||
          stored.endpoint.trim().replace(/\/+$/, '') !== model.endpoint.trim().replace(/\/+$/, '')
      })) {
        setSaveError('The saved model or endpoint differs from your changes.')
        set({ ...draft, revision: result.revision })
        return
      }
      setSaveResult({ base: config.revision, config: result })
      set(undefined)
      setTest(undefined)
    } catch (error) {
      setSaveError(errorText(error))
    } finally {
      setSaving(false)
    }
  }
  function restoreDefaults() {
    const defaults = demo ? defaultConfig() : {
      ...saved,
      budget: { ...unlimitedBudget },
      ask_before_overage: true,
    }
    set({ ...defaults, revision: saved.revision })
    setTest(undefined)
    setSaveError('')
  }
  const tryService = (id: string) =>
    void write('services.test', { id })
      .then((r) => setTest({ id, result: [r.ok ? 'Passed · {0}' : 'Failed · {0}', r.message] }))
      .catch(report)
  const testStatus = (id: string) => test?.id === id && (
    <p className="record-meta" role="status">
      {tr(test.result[0], tr(String(test.result[1])))}
    </p>
  )
  return (
    <>
      <div className={modelPage ? 'settings-content scroll' : undefined}>
      <section className="set-section">
        {!modelPage && <div className="set-intro">
          <h2>{tr('Model')}</h2>
          <p>{tr('Choose the model and destination for new tasks.')}</p>
        </div>}
        <div className="set-body">
          <div className="provider-picker">
            <label className="set-field">{tr('Model provider')}
              {desktopProviders ? <select className="text-field" value={providers?.selected ?? ''}
                disabled={!providers?.entries.length || dirty || busy || switching}
                onChange={e => void selectProvider(e.target.value)}>
                {!providers?.selected && <option value="" disabled>
                  {tr(!providers ? 'Loading…' : credentials.credential_configured ? 'Launch environment' : 'Choose a provider')}
                </option>}
                {providers?.entries.map(entry => <option key={entry.id} value={entry.id} disabled={!entry.endpoint}>
                  {entry.id === 'DeepSeek' ? tr(providerName(entry)) : entry.name}
                </option>)}
              </select> : <select className="text-field" value={selected?.id ?? ''} disabled={saving}
                onChange={e => { set({ ...draft, model_id: e.target.value }); setTest(undefined) }}>
                {draft.models.map(m => <option key={m.id} value={m.id}>{tr(m.label)}</option>)}
              </select>}
            </label>
            {desktopProviders && selected && <button className="ghost-btn" disabled={dirty || busy || switching ||
              !providers || (!currentProvider && !credentials.credential_configured)}
              onClick={() => tryService(selected.id)}>{tr('Test selected provider')}</button>}
          </div>
          {desktopProviders && selected && testStatus(selected.id)}
          {selected && (
            <>
              {!credentials?.credential_store && <div className="form-grid">
                {(['endpoint', 'model'] as const).map((k) => (
                  <label className="set-field" key={k}>
                    {k === 'model' ? tr('Model ID') : tr('Endpoint base URL')}
                    <input
                      className="text-field"
                      inputMode={k === 'endpoint' ? 'url' : undefined}
                      autoComplete="off"
                      spellCheck={false}
                      disabled={saving}
                      aria-invalid={
                        k === 'model' ? !selected.model.trim() : !validEndpoint(selected.endpoint)
                      }
                      value={selected[k]}
                      onChange={(e) =>
                        set({
                          ...draft,
                          models: draft.models.map((m) =>
                            m.id === selected.id ? { ...m, [k]: e.target.value } : m,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
              </div>}
              {!demo && !credentials?.credential_store && <p className="fine">{tr('Use an OpenAI-compatible base URL. The connection test uses the saved URL, model ID and API key.')}</p>}
              <div className="set-controls">
                {!desktopProviders && <button
                  className="ghost-btn"
                  disabled={dirty || busy}
                  onClick={() => tryService(selected.id)}
                >
                  {tr('Test connection')}
                </button>}
                {credentials?.credential_store && (
                  <>
                    <button className="primary" disabled={busy || dirty || switching}
                      onClick={() => setProviderDialog('add')}>{tr('Add model provider')}</button>
                    {!!providers?.entries.length && <button className="ghost-btn" disabled={busy || dirty || switching}
                      onClick={() => setProviderDialog('manage')}>{tr('Manage providers')}</button>}
                  </>
                )}
              </div>
            </>
          )}
          {!desktopProviders && <p className="fine" role="status">
            {demo
              ? tr('The fixture tests configuration locally.')
              : credentials?.credential_stored ? tr('Saved API key {0}', credentials.credential_preview ?? '••••')
              : tr(credentials?.credential_configured ? 'The API key currently comes from the launch environment.'
                : 'No API key configured.')}
          </p>}
          {!desktopProviders && selected && testStatus(selected.id)}
          {providerDialog && credentials?.credential_store && (
            <CredentialDialog directAdd={providerDialog === 'add'} role="model" endpoint={credentials.endpoint} model={credentials.model} onClose={closeCredentials} onChanged={() => setTest(undefined)} />
          )}
        </div>
      </section>
      <section className="set-section">
        <div className="set-intro">
          <h2>{tr('Task budget')}</h2>
          <p>{tr('Leave a limit blank for unlimited usage.')}</p>
          {!demo && <p>{tr('Desktop tasks currently use the runtime limits.')}</p>}
        </div>
        <div className="set-body">
          <div className="budget-grid">
            {budgetFields.map(([k, label]) => (
              <label className="budget" key={k}>
                {tr(label)}
                <input
                  type="number"
                  min="0"
                  step={k === 'tokens' || k === 'calls' ? 1 : 'any'}
                  placeholder={tr('Unlimited')}
                  value={draft.budget[k] ?? ''}
                  disabled={saving}
                  onChange={(e) =>
                    set({ ...draft, budget: { ...draft.budget, [k]: e.target.value === '' ? null : e.target.valueAsNumber } })
                  }
                />
              </label>
            ))}
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={draft.ask_before_overage}
              disabled={saving}
              onChange={(e) => set({ ...draft, ask_before_overage: e.target.checked })}
            />
            {tr('Ask before exceeding a limit')}
          </label>
        </div>
      </section>
      {!demo && <section className="set-section">
        <div className="set-intro">
          <h2>{tr('Evidence reviewer')}</h2>
          <p>{tr('Send selected excerpts and candidate figures to this model for review. Results appear in the agent trace.')}</p>
        </div>
        <div className="set-body">
          <label><input type="checkbox" checked={reviewer.enabled} disabled={saving || (!!credentials?.credential_store && !reviewer.endpoint)}
            onChange={e => set({ ...draft, reviewer: { ...reviewer, enabled: e.target.checked } })} /> {tr('Enable evidence review')}</label>
          {(credentials?.credential_store || reviewer.enabled || reviewer.endpoint) && <>
            {credentials?.credential_store ? <p className="fine">{[reviewer.model, reviewer.endpoint].filter(Boolean).join(' · ')}</p> : <div className="form-grid">
              {(['endpoint', 'model'] as const).map(field => <label className="set-field" key={field}>
                {tr(field === 'endpoint' ? 'System One decision endpoint' : 'Model ID')}
                <input className="text-field" value={reviewer[field]} autoComplete="off" spellCheck={false} disabled={saving}
                  onChange={e => set({ ...draft, reviewer: { ...reviewer, [field]: e.target.value } })} />
              </label>)}
            </div>}
            <div className="set-controls">
              <button className="ghost-btn" disabled={dirty || busy || !reviewer.model || !reviewer.endpoint}
                onClick={() => tryService('reviewer')}>{tr('Test connection')}</button>
              {credentials?.credential_store && <button className="ghost-btn" disabled={dirty || busy}
                onClick={() => setReviewKeyOpen(true)}>{tr('Reviewer connections')}</button>}
            </div>
            {testStatus('reviewer')}
          </>}
          {reviewKeyOpen && <CredentialDialog role="reviewer" endpoint={reviewer.endpoint} model={reviewer.model}
            onClose={closeCredentials} onChanged={() => setTest(undefined)} />}
        </div>
      </section>}
      {modelPage && demo && <AccessAndBackup/>}
      </div>
      <div className="lib-tools settings-save">
        <button
          className="primary"
          disabled={!valid || !dirty || saving}
          onClick={() => void save()}
        >
          {tr('Save settings')}
        </button>
        {modelPage && <button className="ghost-btn" disabled={saving} onClick={restoreDefaults}>
          {tr('Restore defaults')}
        </button>}
        {dirty && (
          <button className="ghost-btn" disabled={saving} onClick={() => { set(undefined); setSaveError('') }}>
            {tr('Discard edits')}
          </button>
        )}
        <span className="record-meta" role="status">
          {tr(saving ? 'Saving settings…' : dirty ? 'Unsaved changes' : 'Settings saved')}
        </span>
        {saveError && <span className="set-error" role="alert">{tr(saveError)}</span>}
        {!valid && (
          <span className="set-error" role="alert">
            {tr('Check model endpoints, IDs and budget limits.')}
          </span>
        )}
      </div>
    </>
  )
}
function AccessAndBackup() {
  const { tr } = useLanguage()
  const { api, write, busy, report } = useWorkspace()
  const { grants, offers } = useRead('access.list', {}) ?? { grants: [], offers: [] }
  const [offer, choose] = useState<Offer>(),
    [result, setResult] = useState<Message>()
  const [inspection, setInspection] = useState<ServiceMethods['backup.inspect'][1]>()
  async function inspect() {
    const { files } = await api.call('file.pick', { purpose: 'backup' })
    if (files[0]) setInspection(await api.call('backup.inspect', { file_id: files[0].file_id }))
  }
  return (
    <>
      <section className="set-section">
        <div className="set-intro">
          <h2>{tr('External Agent access')}</h2>
        </div>
        <div className="set-body">
          {!offers.length && !grants.length && (
            <p className="usage">{tr('No active task has requested read-only access.')}</p>
          )}
          {offers
            .filter((o) => !grants.some((g) => g.offer_id === o.offer_id && g.status === 'active'))
            .map((o) => (
              <div className="source-row" key={o.offer_id}>
                <Icon name="shield" size={17} />
                <strong className="grow">{o.purpose}</strong>
                <button className="ghost-btn" onClick={() => choose(o)}>
                  {tr('Review access')}
                </button>
              </div>
            ))}
          {grants.map((g) => (
            <div key={g.grant_id} className="source-row">
              <Icon name="shield" size={17} />
              <div className="grow">
                <strong className="target-material">{g.endpoint}</strong>
                <small>{g.source_versions.join(', ')}</small>
              </div>
              <span className={`tag ${g.status === 'active' ? 'ok' : ''}`}>{tr(g.status)}</span>
              {g.status === 'active' && (
                <button
                  className="ghost-btn"
                  onClick={() => void write('access.revoke', { grant_id: g.grant_id }).catch(report)}
                >
                  {tr('Revoke access')}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
      <section className="set-section">
        <div className="set-intro">
          <h2>{tr('Backup and restore')}</h2>
          <p>{tr('Verify the material manifest before restoring a workspace.')}</p>
        </div>
        <div className="set-body">
          <div className="set-controls">
            <button
              className="ghost-btn"
              disabled={busy}
              onClick={() =>
                void write('backup.create', {})
                  .then((r) => setResult(r.saved ? ['Saved {0}', r.name] : ['Backup cancelled.']))
                  .catch(report)
              }
            >
              {tr('Create backup')}
            </button>
            <button className="ghost-btn" disabled={busy} onClick={() => void inspect().catch(report)}>
              {tr('Inspect backup')}
            </button>
          </div>
          {result && (
            <p className="record-meta" role="status">
              {tr(...result)}
            </p>
          )}
        </div>
      </section>
      {offer && (
        <Dialog title={tr('Grant read-only access?')} onClose={() => choose(undefined)}>
          <p>
            {offer.endpoint} · {offer.purpose}
          </p>
          <p>{tr('Versions ·')}{' '}{offer.source_versions.join(', ')}</p>
          <p>{offer.estimated_usage}{' '}{tr('· Expires when this task ends.')}</p>
          <button
            className="primary"
            onClick={() =>
              void write('access.grant', { offer_id: offer.offer_id })
                .then(() => choose(undefined))
                .catch(report)
            }
          >
            {tr('Grant read-only access')}
          </button>
        </Dialog>
      )}
      {inspection && (
        <Dialog title={tr('Review backup')} onClose={() => setInspection(undefined)}>
          <p>{inspection.summary}</p>
          {inspection.issues.map((i) => (
            <p key={i}>{i}</p>
          ))}
          <p>{tr('Restoring replaces the current workspace with the verified snapshot.')}</p>
          <button
            className="danger"
            disabled={!inspection.valid || busy}
            onClick={() =>
              void write('backup.restore', { preview_id: inspection.preview_id })
                .then((r) => {
                  if (r.restored) window.location.reload()
                })
                .catch(report)
            }
          >
            {tr('Restore verified backup')}
          </button>
        </Dialog>
      )}
    </>
  )
}
const settingsTabs = [
  ['general', 'settings', 'General settings'],
  ['model', 'globe', 'Model'],
  ['preset', 'trace', 'Customize roles'],
] as const

export function ServicesPage() {
  const { tr } = useLanguage()
  const [[tab, , title], setTab] = useState<typeof settingsTabs[number]>(settingsTabs[0])
  const config = useRead('services.get', {})
  const { refresh } = useWorkspace()
  useEffect(() => {
    const id = setInterval(refresh, 8000)
    return () => clearInterval(id)
  }, [refresh])
  return <div className="settings-layout">
    <nav aria-label={tr('Settings')}>{settingsTabs.map((item) => {
      const [id, icon, label] = item
      return <button key={id} className={'side-item' + (tab === id ? ' active' : '')}
        aria-pressed={tab === id} onClick={() => setTab(item)}><Icon name={icon} size={16}/>{tr(label)}</button>
    })}</nav>
    <div className="settings-tab-panel">
      <h2>{tr(title)}</h2>
      <div className={tab === 'model' ? 'settings-model-panel' : 'settings-content scroll'}>
        {tab === 'general' && <PersonalSettings/>}
        {tab === 'model' && config && <SettingsForm config={config} modelPage/>}
        {tab === 'preset' && <RoleSettings/>}
      </div>
    </div>
  </div>
}

export function FirstRunSettings() {
  const { tr } = useLanguage()
  const config = useRead('services.get', {})
  const [stage, setStage] = useState(() => localStorage.getItem('papertrace.role-intro.v1'))
  function finish() {
    const next = ready ? 'done' : 'api-deferred'
    localStorage.setItem('papertrace.role-intro.v1',next)
    setStage(next)
  }
  if (stage === 'done' || !config) return null
  const ready = config.models.some(m => m.id === config.model_id && (m.local || m.credential_configured))
  if (!ready && stage === 'api-deferred') return null
  return <Dialog title={tr(ready ? 'Set up your research assistant' : 'Connect your model')} onClose={finish} panelClass="first-run-settings">
    {ready ? <RoleSettings showTitle onSaved={finish}/> : <SettingsForm config={config}/>}
    <button className="link-btn" onClick={finish}>{tr('Set up later')}</button>
  </Dialog>
}
