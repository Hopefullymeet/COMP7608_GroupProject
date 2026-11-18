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

function BudgetInput({ field, value, onCommit }: { field: typeof BUDGET[number]; value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const id = useId()

  function commit() {
    if (draft === null) return
    const raw = draft.trim()
    const parsed = Number(raw)
    const valid = (field.integer ? /^\d+$/ : /^\d+(?:\.\d+)?$|^\.\d+$/).test(raw)
      && Number.isFinite(parsed) && parsed <= Number.MAX_SAFE_INTEGER
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
      <label htmlFor={id}>{field.label}</label>
      <input id={id} aria-label={field.label + ' ' + field.unit}
        inputMode={field.integer ? 'numeric' : 'decimal'} value={draft ?? value}
        aria-invalid={error} aria-describedby={error ? id + '-error' : undefined}
        onChange={(e) => { setDraft(e.target.value); setError(false) }}
        onBlur={commit} onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setDraft(null); setError(false) }
        }} />
      <small>{field.unit}</small>
      {error && <small className="set-error" id={id + '-error'} role="alert">
        {field.integer ? 'Enter a whole number of 0 or more.' : 'Enter a number of 0 or more.'} Using {value}.
      </small>}
    </div>
  )
}

function ExternalAccess() {
  const { state, act } = useStore()
  const [selected, setSelected] = useState('')
  const grant = state.externalGrant
  const eligible = state.runOrder.map((id) => state.runs[id])
    .filter((run) => run.status === 'running' && run.configuration?.paperIds.some((id) => state.library.includes(id)))
  const run = grant ? state.runs[grant.runId] : eligible.find(({ id }) => id === selected)
  const paperIds = grant?.paperIds ?? run?.configuration?.paperIds.filter((id) => state.library.includes(id))

  return (
    <>
      <div className="field-chips"><span className="tag">Demo research helper</span><span className="tag quiet">Simulated · read only</span></div>
      {!grant && (eligible.length > 0 ? (
        <label className="set-field">
          <span>Running task</span>
          <select className="lib-select" value={run?.id ?? ''} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Choose a task…</option>
            {eligible.map((item) => <option key={item.id} value={item.id}>{item.task} · {item.label}</option>)}
          </select>
        </label>
      ) : <p className="fine">Start a task with papers in scope to try read-only access.</p>)}
      {run && <>
        {grant && <p className="dialog-text">{run.task} · {run.label}</p>}
        <p className="dialog-text">The helper can suggest what to review using the titles of these papers.</p>
        <ul className="dialog-list">{paperIds?.map((id) => <li key={id}>{PAPERS[id].title}</li>)}</ul>
        <p className="fine">Access expires when the task ends. This demo sends nothing outside the app.</p>
        {grant ? <div className="set-controls">
          <span role="status" className="tag accent">{grant.status === 'pending' ? 'Waiting for simulated reply' : 'Simulated reply in Agent trace'}</span>
          <button className="ghost-btn sm" onClick={() => act.revokeExternal()}>Revoke access</button>
        </div> : <div className="set-controls"><button className="ghost-btn sm accent" onClick={() => act.grantExternal(run.id)}>Grant read-only access</button></div>}
      </>}
    </>
  )
}

export function Settings() {
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
      <PageHead icon="settings" title="Models & services" sub="Configure the model, search sources and limits for new demo tasks." trace />
      <div className="page-body scroll settings">
        <section className="set-section">
          <div className="set-intro">
            <h2>Model</h2>
            <p>Tasks keep the model and destination selected at launch. The demo uses scripted responses.</p>
          </div>
          <div className="set-body">
            <div className="model-list" role="radiogroup" aria-label="Model provider">
              {MODEL_OPTIONS.map((m) => (
                <label key={m.id} className={'model-card' + (provider === m.id ? ' on' : '')}>
                  <input type="radio" name="provider" checked={provider === m.id} onChange={() => act.updateSettings({ model: m.id })} />
                  <span className="radio" aria-hidden="true" />
                  <span className="grow"><strong>{m.name}</strong><small>{m.note}</small></span>
                  <span className={'tag' + (m.id === 'local' ? ' ok' : '')}>{m.where}</span>
                </label>
              ))}
            </div>

            <div className="set-model-fields">
              {provider === 'compatible' && <label className="set-field">
                <span>Endpoint base URL</span>
                <input aria-label="Endpoint base URL" inputMode="url" autoComplete="off" placeholder="https://example.org/v1" value={config.endpoint}
                  aria-invalid={!!errors.endpoint} aria-describedby={errors.endpoint ? 'model-endpoint-error' : undefined}
                  onChange={(e) => act.configureModel(provider, { endpoint: e.target.value })} />
                {errors.endpoint && <small className="set-error" id="model-endpoint-error">{errors.endpoint}</small>}
              </label>}
              <label className="set-field">
                <span>Model ID</span>
                <input aria-label="Model ID" autoComplete="off" placeholder={provider === 'local' ? 'Name from Ollama' : 'Provider model ID'} value={config.modelId}
                  aria-invalid={!!errors.modelId} aria-describedby={errors.modelId ? 'model-id-error' : undefined}
                  onChange={(e) => act.configureModel(provider, { modelId: e.target.value })} />
                {errors.modelId && <small className="set-error" id="model-id-error">{errors.modelId}</small>}
              </label>
            </div>

            <div className="key-row">
              <Icon name="lock" size={15} />
              <div className="grow">
                <strong>{provider === 'local' ? 'Local Ollama requires no API key' : 'Credentials unavailable in this demo'}</strong>
                <p>{provider === 'local' ? 'Model availability requires a running Ollama service.' : 'The desktop app manages credentials in the system keychain.'}</p>
              </div>
              <button className="ghost-btn sm" disabled={!ready} onClick={() => act.testModel(provider)}>Test connection</button>
            </div>
            <p className="test-result" role="status"><Icon name="alert" size={14} /> {
              !ready ? 'Complete the model configuration to simulate a test.'
                : s.tested[provider] ? 'Configuration passed validation. No request was sent. Connectivity and model capabilities are unverified.'
                  : 'The connection test checks configuration only in this demo.'
            }</p>
          </div>
        </section>

        <section className="set-section">
          <div className="set-intro">
            <h2>Task budget</h2>
            <p>Limits apply to new demo tasks. Zero allows no usage for that item.</p>
          </div>
          <div className="set-body">
            <div className="budget-grid">
              {BUDGET.map((field) => (
                <BudgetInput key={field.key} field={field} value={s.budget[field.key]}
                  onCommit={(value) => act.updateSettings({ budget: { ...s.budget, [field.key]: value } })} />
              ))}
            </div>
            <label className="switch-row">
              <Switch on={s.askBeyond} onChange={(v) => act.updateSettings({ askBeyond: v })} label="Ask before going over a limit" />
              <span><strong>Ask before going over a limit</strong><small>When off, the task stops and keeps the results so far.</small></span>
            </label>
            <div className="usage">
              <span>Workspace demo usage</span>{' '}
              <b>{usage.calls}</b> model calls · <b>{usage.tokens.toLocaleString()}</b> tokens · {(usage.ms / 1000).toFixed(1)} s · ${usage.cost.toFixed(4)}{' '}
              <em>(simulated)</em>
            </div>
          </div>
        </section>

        <section className="set-section">
          <div className="set-intro">
            <h2>Literature search</h2>
            <p>Source changes apply to new searches. Earlier results remain available.</p>
          </div>
          <div className="set-body">
            {searchSources.length === 0 && <p className="test-result" role="status"><Icon name="alert" size={14} /> Enable a source to run a new search.</p>}
            {SEARCH_SOURCES.map((src) => (
              <div key={src.id} className="source-row">
                <Switch on={s.sources[src.id]} onChange={(v) => act.updateSettings({ sources: { ...s.sources, [src.id]: v } })} label={'Use ' + src.name} />
                <div className="grow">
                  <strong>{src.name}</strong>
                  <small>{src.note}</small>
                  <div className="field-chips">{src.fields.map((f) => <span key={f} className="tag">{f}</span>)}</div>
                </div>
                <span className="tag quiet">{s.sources[src.id] ? 'Enabled for new searches' : 'Off'}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="set-section">
          <div className="set-intro"><h2>PDF tools</h2><p>Parsers extract text. The viewer opens the original PDF.</p></div>
          <div className="set-body">
            {PARSERS.map((p) => (
              <div key={p.name} className="source-row">
                <Icon name="file" size={16} />
                <div className="grow"><strong>{p.name}</strong><small>{p.role}</small></div>
                <span className="tag">{p.where}</span>
                <span className="tag warn">{p.status}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="set-section">
          <div className="set-intro">
            <h2>Data destinations</h2>
            <p>These are the planned destinations for real tasks. Demo runs send no network requests.</p>
          </div>
          <div className="set-body">
            <table className="flow-table">
              <thead><tr><th>Service</th><th>Destination</th><th>Task data</th></tr></thead>
              <tbody>
                <tr><td>Model inference</td><td>{provider === 'compatible' ? (errors.endpoint ? 'Endpoint pending' : config.endpoint.trim()) : provider === 'local' ? 'On this device' : model.name}</td>
                  <td>Question and selected material, such as relevant passages or draft sentences</td></tr>
                {provider !== 'local' && <tr><td>Model authentication</td><td>Configured model endpoint</td><td>The desktop host attaches any stored credential to authenticate the request.</td></tr>}
                <tr><td>Literature search</td><td>{searchSources.map((id) => SOURCE_NAMES[id]).join(', ') || 'Disabled'}</td>
                  <td>{searchSources.length ? 'Search queries and filters' : 'No search data'}</td></tr>
                <tr><td>External agents</td><td>{state.externalGrant ? 'Demo research helper (simulated)' : 'No active grant'}</td>
                  <td>{state.externalGrant ? 'Paper titles for the authorized task' : 'No task data'}</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="set-section">
          <div className="set-intro"><h2>External agents</h2><p>Preview a revocable grant for one running task.</p></div>
          <div className="set-body"><ExternalAccess /></div>
        </section>
      </div>
    </div>
  )
}
