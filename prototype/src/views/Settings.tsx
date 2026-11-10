import { useStore, type Settings as SettingsState } from '../data/store'
import { MODEL_OPTIONS, PARSERS, SEARCH_SOURCES } from '../data/workspace'
import { Icon } from '../components/Icon'
import { PageHead } from '../components/PageHead'

const BUDGET: { key: keyof SettingsState['budget']; label: string; unit: string; step: number }[] = [
  { key: 'calls', label: 'Model calls', unit: 'per task', step: 5 },
  { key: 'tokens', label: 'Tokens', unit: 'per task', step: 10000 },
  { key: 'minutes', label: 'Time', unit: 'minutes per task', step: 1 },
  { key: 'cost', label: 'Spend cap', unit: 'USD per task', step: 0.5 },
]

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <span />
    </button>
  )
}

export function Settings() {
  const { state, act } = useStore()
  const s = state.settings
  const set = act.updateSettings
  const model = MODEL_OPTIONS.find((m) => m.id === s.model) ?? MODEL_OPTIONS[0]
  const tokens = Object.values(state.runs).flatMap((r) => r.steps).reduce((n, x) => n + (x.tokens ?? 0), 0)
  const calls = Object.values(state.runs).flatMap((r) => r.steps).filter((x) => x.kind !== 'observe').length

  return (
    <div className="page">
      <PageHead icon="settings" title="Models & services" sub="Choose what the agent may use, how much it may spend, and what may leave this computer." />

      <div className="page-body scroll settings">
        <section className="set-section">
          <div className="set-intro">
            <h2>Model</h2>
            <p>Used for planning, reading and checking. Each task shows the papers in scope and the destination before it runs.</p>
          </div>
          <div className="set-body">
            <div className="model-list" role="radiogroup" aria-label="Model provider">
              {MODEL_OPTIONS.map((m) => (
                <button key={m.id} role="radio" aria-checked={s.model === m.id} className={`model-card ${s.model === m.id ? 'on' : ''}`}
                  onClick={() => set({ model: m.id, tested: false })}>
                  <span className="radio" />
                  <span className="grow">
                    <strong>{m.name}</strong>
                    <small>{m.model}</small>
                    <small className="model-note">{m.note}</small>
                  </span>
                  <span className={`tag ${m.where === 'This device' ? 'ok' : ''}`}>{m.where}</span>
                </button>
              ))}
            </div>
            <div className="key-row">
              <Icon name="lock" size={15} />
              <div className="grow">
                <strong>{model.where === 'This device' ? 'No key needed' : 'API key: kept in the system keychain'}</strong>
                <p>{model.where === 'This device'
                  ? 'The local model runs on this computer.'
                  : 'The desktop host stores the key and adds it to requests. This page never sees it, and it is not written to logs or exports.'}</p>
              </div>
              {model.where !== 'This device' && <button className="ghost-btn sm" disabled title="Handled by the desktop host">Set key…</button>}
              <button className="ghost-btn sm" onClick={() => set({ tested: true })}>Test connection</button>
            </div>
            {s.tested && (
              <p className="test-result"><Icon name="alert" size={14} /> Prototype: no request was sent. In the app this makes one short call to check the key, the model name and the quota.</p>
            )}
          </div>
        </section>

        <section className="set-section">
          <div className="set-intro">
            <h2>Task budget</h2>
            <p>Limits apply to every agent task. Estimates and actual use are shown separately; when a price is unknown, the call and token limits still hold.</p>
          </div>
          <div className="set-body">
            <div className="budget-grid">
              {BUDGET.map((b) => (
                <label key={b.key} className="budget">
                  <span>{b.label}</span>
                  <input type="number" min={0} step={b.step} value={s.budget[b.key]}
                    onChange={(e) => set({ budget: { ...s.budget, [b.key]: Math.max(0, Number(e.target.value)) } })} />
                  <small>{b.unit}</small>
                </label>
              ))}
            </div>
            <label className="switch-row">
              <Switch on={s.askBeyond} onChange={(v) => set({ askBeyond: v })} label="Ask before going over a limit" />
              <span><strong>Ask before going over a limit</strong><small>Otherwise the task stops, saves progress and shows how to resume.</small></span>
            </label>
            <div className="usage">
              <span>This session so far</span>
              <b>{calls}</b> calls · <b>~{tokens.toLocaleString()}</b> tokens <em>(mock figures from the scripted runs)</em>
            </div>
          </div>
        </section>

        <section className="set-section">
          <div className="set-intro">
            <h2>Literature search</h2>
            <p>Each source declares which filters it really supports. A filter a source lacks is not guessed; it is applied from another source or left out.</p>
          </div>
          <div className="set-body">
            {SEARCH_SOURCES.map((src) => (
              <div key={src.id} className="source-row">
                <Switch on={!!s.sources[src.id]} onChange={(v) => set({ sources: { ...s.sources, [src.id]: v } })} label={`Use ${src.name}`} />
                <div className="grow">
                  <strong>{src.name}</strong>
                  <small>{src.note}</small>
                  <div className="field-chips">{src.fields.map((f) => <span key={f} className="tag">{f}</span>)}</div>
                </div>
                <span className="tag quiet">Sends: query and filters</span>
              </div>
            ))}
          </div>
        </section>

        <section className="set-section">
          <div className="set-intro">
            <h2>PDF parsing</h2>
            <p>Runs on this computer. The original PDF is always kept for checking.</p>
          </div>
          <div className="set-body">
            {PARSERS.map((p) => (
              <div key={p.name} className="source-row">
                <Icon name="file" size={16} />
                <div className="grow"><strong>{p.name}</strong><small>{p.role}</small></div>
                <span className="tag">{p.where}</span>
                <span className="tag warn">Not installed in prototype</span>
              </div>
            ))}
          </div>
        </section>

        <section className="set-section">
          <div className="set-intro">
            <h2>What leaves this computer</h2>
            <p>Before each remote call, a material pack is built with only what the task needs.</p>
          </div>
          <div className="set-body">
            <table className="flow-table">
              <thead><tr><th>Destination</th><th>Receives</th><th>Never receives</th></tr></thead>
              <tbody>
                <tr><td>{model.name}</td><td>{model.where === 'This device' ? 'Nothing (local)' : 'Your question and the selected passages'}</td><td>Whole library, other topics, API keys</td></tr>
                <tr><td>Search sources</td><td>Search queries and filters</td><td>Paper text, notes, drafts</td></tr>
                <tr><td>External agents</td><td>{s.external ? 'Read-only pack for the current task' : 'Nothing (off)'}</td><td>Write access, model keys</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="set-section">
          <div className="set-intro">
            <h2>External agents</h2>
            <p>Another agent, for example over MCP, can propose answers or candidates. Writes always go through PaperTrace's own checks.</p>
          </div>
          <div className="set-body">
            <label className="switch-row">
              <Switch on={s.external} onChange={(v) => set({ external: v })} label="Allow read-only access" />
              <span>
                <strong>Allow read-only access for the current task</strong>
                <small>{s.external
                  ? 'On. Turning it off stops further calls; results that arrive late are not written. Content already sent cannot be recalled.'
                  : 'Off. External agents see nothing.'}</small>
              </span>
            </label>
          </div>
        </section>
      </div>
    </div>
  )
}
