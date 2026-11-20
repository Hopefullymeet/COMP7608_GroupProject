import { useLanguage, type Message } from '../i18n'
import { useEffect, useState } from 'react'
import { Dialog, PageHead } from '../components/PageHead'
import { Icon } from '../components/Icon'
import { useRead, useWorkspace } from '../data/WorkspaceProvider'
import type { Config, Offer, ServiceMethods } from '../api/services'

function SettingsForm({ config }: { config: Config }) {
  const { tr } = useLanguage()
  const { write, busy, report, demo } = useWorkspace()
  const [draft, set] = useState(config),
    [test, setTest] = useState<Message>()
  const selected = draft.models.find((m) => m.id === draft.model_id) ?? draft.models[0]
  const dirty = JSON.stringify(draft) !== JSON.stringify(config)
  const budgetFields = [
    ['calls', 'Model calls'],
    ['tokens', 'Tokens'],
    ['minutes', 'Minutes'],
    ['cost', 'Spend cap (USD)'],
  ] as const
  function validEndpoint(text: string) {
    try {
      const u = new URL(text)
      return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password && !u.hash && !u.search
    } catch {
      return false
    }
  }
  const valid =
    draft.models.every((m) => m.model.trim() && validEndpoint(m.endpoint)) &&
    budgetFields.every(([k]) => Number.isFinite(draft.budget[k]) && draft.budget[k] >= 0) &&
    Number.isInteger(draft.budget.calls) &&
    Number.isInteger(draft.budget.tokens)
  async function save() {
    const { revision, ...fields } = draft
    await write('services.save', { ...fields, base_revision: revision })
  }
  const tryService = (id: string) =>
    void write('services.test', { id })
      .then((r) => setTest([r.ok ? 'Passed · {0}' : 'Failed · {0}', r.message]))
      .catch(report)
  return (
    <>
      <section className="set-section">
        <div className="set-intro">
          <h2>{tr('Model')}</h2>
          <p>{tr('Choose the model and destination for new tasks.')}</p>
        </div>
        <div className="set-body">
          <div className="model-list" role="radiogroup" aria-label={tr('Model provider')}>
            {draft.models.map((m) => (
              <label key={m.id} className={'model-card' + (selected?.id === m.id ? ' on' : '')}>
                <input
                  type="radio"
                  name="model-provider"
                  checked={selected?.id === m.id}
                  onChange={() => {
                    set({ ...draft, model_id: m.id })
                    setTest(undefined)
                  }}
                />
                <span className="radio" aria-hidden="true" />
                <strong className="grow">{tr(m.label)}</strong>
                <span className="tag">{m.local ? tr('Local') : tr('Remote')}</span>
              </label>
            ))}
          </div>
          {selected && (
            <>
              <div className="form-grid">
                {(['endpoint', 'model'] as const).map((k) => (
                  <label className="set-field" key={k}>
                    {k === 'model' ? tr('Model ID') : tr('Endpoint base URL')}
                    <input
                      className="text-field"
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
              </div>
              <div className="set-controls">
                <button
                  className="ghost-btn"
                  disabled={dirty || busy}
                  onClick={() => tryService(selected.id)}
                >
                  {tr('Test connection')}
                </button>
                {!selected.local && (
                  <button
                    className="ghost-btn"
                    disabled={demo || busy}
                    onClick={() => void write('services.credentials', { id: selected.id }).catch(report)}
                  >
                    {tr('Manage system credentials')}
                  </button>
                )}
              </div>
            </>
          )}
          <p className="fine">
            {demo
              ? tr('The fixture tests configuration locally.')
              : tr('Credentials are managed in the system keychain.')}
          </p>
        </div>
      </section>
      <section className="set-section">
        <div className="set-intro">
          <h2>{tr('Task budget')}</h2>
          <p>{tr('Limits apply per task.')}</p>
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
                  value={draft.budget[k]}
                  onChange={(e) =>
                    set({ ...draft, budget: { ...draft.budget, [k]: Number(e.target.value) } })
                  }
                />
              </label>
            ))}
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={draft.ask_before_overage}
              onChange={(e) => set({ ...draft, ask_before_overage: e.target.checked })}
            />
            {tr('Ask before exceeding a limit')}
          </label>
        </div>
      </section>
      {(['search', 'parser'] as const).map((kind) => (
        <section className="set-section" key={kind}>
          <div className="set-intro">
            <h2>{kind === 'search' ? tr('Literature search') : tr('PDF tools')}</h2>
          </div>
          <div className="set-body">
            {draft.services
              .filter((s) => s.kind === kind)
              .map((s) => (
                <div className="source-row" key={s.id}>
                  <button
                    type="button"
                    role="switch"
                    aria-label={tr('Use {0}', s.label)}
                    aria-checked={s.enabled}
                    className={'switch' + (s.enabled ? ' on' : '')}
                    onClick={() =>
                      set({
                        ...draft,
                        services: draft.services.map((x) =>
                          x.id === s.id ? { ...x, enabled: !x.enabled } : x,
                        ),
                      })
                    }
                  >
                    <span />
                  </button>
                  <div className="grow">
                    <strong>{s.label}</strong>
                    <small>{tr(s.status)}</small>
                    <div className="field-chips">
                      {s.fields.map((f) => (
                        <span className="tag" key={f}>
                          {tr(f)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button className="ghost-btn sm" disabled={dirty || busy} onClick={() => tryService(s.id)}>
                    {tr('Test')}
                  </button>
                </div>
              ))}
          </div>
        </section>
      ))}
      <div className="lib-tools settings-save">
        <button
          className="primary"
          disabled={!valid || !dirty || busy}
          onClick={() => void save().catch(report)}
        >
          {tr('Save settings')}
        </button>
        {dirty && (
          <button className="ghost-btn" onClick={() => set(config)}>
            {tr('Discard edits')}
          </button>
        )}
        {!valid && (
          <span className="set-error" role="alert">
            {tr('Check model endpoints, IDs and budget limits.')}
          </span>
        )}
        {test && (
          <span className="record-meta" role="status">
            {tr(test[0], tr(String(test[1])))}
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
export function ServicesPage() {
  const { tr } = useLanguage()
  const config = useRead('services.get', {})
  const { refresh } = useWorkspace()
  useEffect(() => {
    const id = setInterval(refresh, 8000)
    return () => clearInterval(id)
  }, [refresh])
  return (
    <div className="page">
      <PageHead
        trace
        title={tr('Models & services')}
        icon="settings"
        sub={tr('Model destinations, tools and workspace access')}
      />
      <div className="page-body scroll settings">
        {config && <SettingsForm key={config.revision} config={config} />}
        <AccessAndBackup />
      </div>
    </div>
  )
}
