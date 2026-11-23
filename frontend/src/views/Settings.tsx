import { useLanguage } from '../i18n'
import { useId, useState } from 'react'
import { useStore } from '../data/store'
import { addUsage, emptyUsage, enabledSources, modelErrors, SOURCE_NAMES } from '../data/serviceSettings'
import { MODEL_OPTIONS, PARSERS, SEARCH_SOURCES } from '../data/workspace'
import { PAPERS } from '../data/fixtures'
import { Icon } from '../components/Icon'
import { PageHead } from '../components/PageHead'

const BUDGET = [
  { key: 'calls', label: 'Model calls', unit: 'per task', integer: true },
  { key: 'tokens', label: 'Tokens', unit: 'per task', integer: true },
  { key: 'minutes', label: 'Time', unit: 'minutes per task', integer: false },
  { key: 'cost', label: 'Spend cap', unit: 'USD per task', integer: false },
] as const

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={'switch' + (on ? ' on' : '')} onClick={() => onChange(!on)}>
      <span />
    </button>
  )
}

function BudgetInput({ field, value, onCommit }: { field: typeof BUDGET[number]; value: number | null; onCommit: (value: number | null) => void }) {
  const { tr } = useLanguage()
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const id = useId()

  function commit() {
    if (draft === null) return
    const raw = draft.trim()
    const parsed = raw === '' ? null : Number(raw)
    const valid = parsed === null || ((field.integer ? /^\d+$/ : /^\d+(?:\.\d+)?$|^\.\d+$/).test(raw)
      && Number.isFinite(parsed) && parsed <= Number.MAX_SAFE_INTEGER)
    if (!valid) {
      setError(true)
      return
    }
    setError(false)
    setDraft(null)
    onCommit(parsed)
  }

  return (
    <div className="budget">
      <label htmlFor={id}>{tr(field.label)}</label>
      <input id={id} aria-label={tr(field.label) + ' ' + tr(field.unit)}
        inputMode={field.integer ? 'numeric' : 'decimal'} value={draft ?? value ?? ''} placeholder={tr('Unlimited')}
        aria-invalid={error} aria-describedby={error ? id + '-error' : undefined}
        onChange={(e) => { setDraft(e.target.value); setError(false) }}
        onBlur={commit} onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setDraft(null); setError(false) }
        }} />
      <small>{tr(field.unit)}</small>
      {error && <small className="set-error" id={id + '-error'} role="alert">
        {field.integer ? tr('Enter a whole number of 0 or more.') : tr('Enter a number of 0 or more.')}{' '}{tr('Using')}{' '}{value ?? tr('Unlimited')}.
      </small>}
    </div>
  )
}

function ExternalAccess() {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const [selected, setSelected] = useState('')
  const grant = state.externalGrant
  const eligible = state.runOrder.map((id) => state.runs[id])
    .filter((run) => run.status === 'running' && run.configuration?.paperIds.some((id) => state.library.includes(id)))
  const run = grant ? state.runs[grant.runId] : eligible.find(({ id }) => id === selected)
  const paperIds = grant?.paperIds ?? run?.configuration?.paperIds.filter((id) => state.library.includes(id))

  return (
    <>
      <div className="field-chips"><span className="tag">{tr('Demo research helper')}</span><span className="tag quiet">{tr('Simulated · read only')}</span></div>
      {!grant && (eligible.length > 0 ? (
        <label className="set-field">
          <span>{tr('Running task')}</span>
          <select className="lib-select" value={run?.id ?? ''} onChange={(e) => setSelected(e.target.value)}>
            <option value="">{tr('Choose a task…')}</option>
            {eligible.map((item) => <option key={item.id} value={item.id}>{item.task} · {item.label}</option>)}
          </select>
        </label>
      ) : <p className="fine">{tr('Start a task with papers in scope to try read-only access.')}</p>)}
      {run && <>
        {grant && <p className="dialog-text">{run.task} · {run.label}</p>}
        <p className="dialog-text">{tr('The helper can suggest what to review using the titles of these papers.')}</p>
        <ul className="dialog-list">{paperIds?.map((id) => <li key={id}>{PAPERS[id].title}</li>)}</ul>
        <p className="fine">{tr('Access expires when the task ends. This demo sends nothing outside the app.')}</p>
        {grant ? <div className="set-controls">
          <span role="status" className="tag accent">{grant.status === 'pending' ? tr('Waiting for simulated reply') : tr('Simulated reply in Agent trace')}</span>
          <button className="ghost-btn sm" onClick={() => act.revokeExternal()}>{tr('Revoke access')}</button>
        </div> : <div className="set-controls"><button className="ghost-btn sm accent" onClick={() => act.grantExternal(run.id)}>{tr('Grant read-only access')}</button></div>}
      </>}
    </>
  )
}

export function Settings() {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const s = state.settings
  const provider = s.model
  const model = MODEL_OPTIONS.find((m) => m.id === provider)!
  const config = s.models[provider]
  const errors = modelErrors(provider, config)
  const ready = !errors.endpoint && !errors.modelId
  const searchSources = enabledSources(s)
  const usage = Object.values(state.runs).reduce((total, run) => addUsage(total, run.usage ?? emptyUsage), emptyUsage)

  return (
    <div className="page">
      <PageHead icon="settings" title={tr('Models & services')} sub={tr('Configure the model, search sources and limits for new demo tasks.')} trace />
      <div className="page-body scroll settings">
        <section className="set-section">
          <div className="set-intro">
            <h2>{tr('Model')}</h2>
            <p>{tr('Tasks keep the model and destination selected at launch. The demo uses scripted responses.')}</p>
          </div>
          <div className="set-body">
            <div className="model-list" role="radiogroup" aria-label={tr('Model provider')}>
              {MODEL_OPTIONS.map((m) => (
                <label key={m.id} className={'model-card' + (provider === m.id ? ' on' : '')}>
                  <input type="radio" name="provider" checked={provider === m.id} onChange={() => act.updateSettings({ model: m.id })} />
                  <span className="radio" aria-hidden="true" />
                  <span className="grow"><strong>{tr(m.name)}</strong><small>{tr(m.note)}</small></span>
                  <span className={'tag' + (m.id === 'local' ? ' ok' : '')}>{tr(m.where)}</span>
                </label>
              ))}
            </div>

            <div className="set-model-fields">
              {provider === 'compatible' && <label className="set-field">
                <span>{tr('Endpoint base URL')}</span>
                <input aria-label={tr('Endpoint base URL')} inputMode="url" autoComplete="off" placeholder="https://example.org/v1" value={config.endpoint}
                  aria-invalid={!!errors.endpoint} aria-describedby={errors.endpoint ? 'model-endpoint-error' : undefined}
                  onChange={(e) => act.configureModel(provider, { endpoint: e.target.value })} />
                {errors.endpoint && <small className="set-error" id="model-endpoint-error">{tr(errors.endpoint)}</small>}
              </label>}
              <label className="set-field">
                <span>{tr('Model ID')}</span>
                <input aria-label={tr('Model ID')} autoComplete="off" placeholder={provider === 'local' ? tr('Name from Ollama') : tr('Provider model ID')} value={config.modelId}
                  aria-invalid={!!errors.modelId} aria-describedby={errors.modelId ? 'model-id-error' : undefined}
                  onChange={(e) => act.configureModel(provider, { modelId: e.target.value })} />
                {errors.modelId && <small className="set-error" id="model-id-error">{tr(errors.modelId)}</small>}
              </label>
            </div>

            <div className="key-row">
              <Icon name="lock" size={15} />
              <div className="grow">
                <strong>{provider === 'local' ? tr('Local Ollama requires no API key') : tr('Credentials unavailable in this demo')}</strong>
                <p>{provider === 'local' ? tr('Model availability requires a running Ollama service.') : tr('The desktop app manages credentials in the system keychain.')}</p>
              </div>
              <button className="ghost-btn sm" disabled={!ready} onClick={() => act.testModel(provider)}>{tr('Test connection')}</button>
            </div>
            <p className="test-result" role="status"><Icon name="alert" size={14} /> {
              !ready ? tr('Complete the model configuration to simulate a test.')
                : s.tested[provider] ? tr('Configuration passed validation. No request was sent. Connectivity and model capabilities are unverified.')
                  : tr('The connection test checks configuration only in this demo.')
            }</p>
          </div>
        </section>

        <section className="set-section">
          <div className="set-intro">
            <h2>{tr('Task budget')}</h2>
            <p>{tr('Leave a limit blank for unlimited usage.')}</p>
          </div>
          <div className="set-body">
            <div className="budget-grid">
              {BUDGET.map((field) => (
                <BudgetInput key={field.key} field={field} value={s.budget[field.key]}
                  onCommit={(value) => act.updateSettings({ budget: { ...s.budget, [field.key]: value } })} />
              ))}
            </div>
            <label className="switch-row">
              <Switch on={s.askBeyond} onChange={(v) => act.updateSettings({ askBeyond: v })} label={tr('Ask before going over a limit')} />
              <span><strong>{tr('Ask before going over a limit')}</strong><small>{tr('When off, the task stops and keeps the results so far.')}</small></span>
            </label>
            <div className="usage">
              <span>{tr('Workspace demo usage')}</span>{' '}
              <b>{usage.calls}</b>{' '}{tr('model calls ·')}{' '}<b>{usage.tokens.toLocaleString()}</b>{' '}{tr('tokens ·')}{' '}{(usage.ms / 1000).toFixed(1)}{' '}{tr('s · $')}{usage.cost.toFixed(4)}{' '}
              <em>{tr('(simulated)')}</em>
            </div>
          </div>
        </section>

        <section className="set-section">
          <div className="set-intro">
            <h2>{tr('Literature search')}</h2>
            <p>{tr('Source changes apply to new searches. Earlier results remain available.')}</p>
          </div>
          <div className="set-body">
            {searchSources.length === 0 && <p className="test-result" role="status"><Icon name="alert" size={14} />{' '}{tr('Enable a source to run a new search.')}</p>}
            {SEARCH_SOURCES.map((src) => (
              <div key={src.id} className="source-row">
                <Switch on={s.sources[src.id]} onChange={(v) => act.updateSettings({ sources: { ...s.sources, [src.id]: v } })} label={tr('Use {0}', src.name)} />
                <div className="grow">
                  <strong>{src.name}</strong>
                  <small>{tr(src.note)}</small>
                  <div className="field-chips">{src.fields.map((f) => <span key={f} className="tag">{tr(f)}</span>)}</div>
                </div>
                <span className="tag quiet">{s.sources[src.id] ? tr('Enabled for new searches') : tr('Off')}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="set-section">
          <div className="set-intro"><h2>{tr('PDF tools')}</h2><p>{tr('Parsers extract text. The viewer opens the original PDF.')}</p></div>
          <div className="set-body">
            {PARSERS.map((p) => (
              <div key={p.name} className="source-row">
                <Icon name="file" size={16} />
                <div className="grow"><strong>{p.name}</strong><small>{tr(p.role)}</small></div>
                <span className="tag">{tr(p.where)}</span>
                <span className="tag warn">{tr(p.status)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="set-section">
          <div className="set-intro">
            <h2>{tr('Data destinations')}</h2>
            <p>{tr('These are the planned destinations for real tasks. Demo runs send no network requests.')}</p>
          </div>
          <div className="set-body">
            <table className="flow-table">
              <thead><tr><th>{tr('Service')}</th><th>{tr('Destination')}</th><th>{tr('Task data')}</th></tr></thead>
              <tbody>
                <tr><td>{tr('Model inference')}</td><td>{provider === 'compatible' ? (errors.endpoint ? tr('Endpoint pending') : config.endpoint.trim()) : provider === 'local' ? tr('On this device') : model.name}</td>
                  <td>{tr('Question and selected material, such as relevant passages or draft sentences')}</td></tr>
                {provider !== 'local' && <tr><td>{tr('Model authentication')}</td><td>{tr('Configured model endpoint')}</td><td>{tr('The desktop host attaches any stored credential to authenticate the request.')}</td></tr>}
                <tr><td>{tr('Literature search')}</td><td>{searchSources.map((id) => SOURCE_NAMES[id]).join(', ') || tr('Disabled')}</td>
                  <td>{searchSources.length ? tr('Search queries and filters') : tr('No search data')}</td></tr>
                <tr><td>{tr('External agents')}</td><td>{state.externalGrant ? tr('Demo research helper (simulated)') : tr('No active grant')}</td>
                  <td>{state.externalGrant ? tr('Paper titles for the authorized task') : tr('No task data')}</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="set-section">
          <div className="set-intro"><h2>{tr('External agents')}</h2><p>{tr('Preview a revocable grant for one running task.')}</p></div>
          <div className="set-body"><ExternalAccess /></div>
        </section>
      </div>
    </div>
  )
}
