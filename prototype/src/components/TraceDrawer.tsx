import { useEffect, useState } from 'react'
import { useStore } from '../data/store'
import { SOURCE_NAMES, type Usage } from '../data/serviceSettings'
import { Icon, Spinner } from './Icon'
import { plural, scrollWithin } from './util'
import type { AgentRun, StepKind } from '../data/types'

const KIND: Record<StepKind, { icon: string; label: string }> = {
  plan: { icon: 'plan', label: 'Plan' },
  tool: { icon: 'tool', label: 'Tool call' },
  observe: { icon: 'eye', label: 'Observation' },
  decide: { icon: 'flag', label: 'Decision' },
  stop: { icon: 'stop', label: 'Stop' },
}

function usageLabel(usage: Usage) {
  return `${plural(usage.calls, 'model call')} · ${usage.tokens.toLocaleString()} tokens · ${(usage.ms / 1000).toFixed(1)} s · $${usage.cost.toFixed(4)}`
}

function RunCard({ run, open, onToggle }: { run: AgentRun; open: boolean; onToggle: () => void }) {
  const tokens = run.steps.reduce((n, s) => n + (s.tokens ?? 0), 0)
  const ms = run.steps.reduce((n, s) => n + (s.ms ?? 0), 0)
  const config = run.configuration
  return (
    <div className="run" id={`run-${run.id}`}>
      <button className="run-head" onClick={onToggle} aria-expanded={open}>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
        <span className="grow">
          <small>{run.task}</small>
          <strong>{run.label}</strong>
        </span>
        <span className={`run-chip ${run.status}`}>{run.limit ? 'Paused' : run.status === 'running' ? <><Spinner /> Running</> : run.status === 'partial' ? 'Partial' : 'Done'}</span>
      </button>
      {open && (
        <>
          <ol className="steps">
            {run.steps.map((s) => (
              <li key={s.id} className={`step ${s.kind}`}>
                <span className="step-icon"><Icon name={KIND[s.kind].icon} size={13} /></span>
                <div>
                  <small>{KIND[s.kind].label}</small>
                  <strong>{s.title}</strong>
                  {s.call && <code>{s.call}</code>}
                  {s.detail && <p>{s.detail}</p>}
                </div>
              </li>
            ))}
          </ol>
          <div className="run-foot">
            {run.summary && <p>{run.summary}</p>}
            {config && <>
              <p>{config.model} · {config.destination}</p>
              {config.sources.length > 0 && <p>Search sources: {config.sources.map((id) => SOURCE_NAMES[id]).join(', ')}</p>}
              <p>Budget: {plural(config.budget.calls, 'call')} · {config.budget.tokens.toLocaleString()} tokens · {config.budget.minutes} min · ${config.budget.cost}</p>
            </>}
            {run.estimate && <p>Estimated (demo): {usageLabel(run.estimate)}</p>}
            {run.usage ? <span>Used (demo): {usageLabel(run.usage)}</span>
              : <span>{plural(run.steps.length, 'step')} · ~{tokens.toLocaleString()} tokens · {(ms / 1000).toFixed(1)} s <em>(mock)</em></span>}
          </div>
        </>
      )}
    </div>
  )
}

export function TraceDrawer() {
  const { state, act } = useStore()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const { open, focus } = state.trace
  const runIds = state.route.view === 'check'
    ? state.runOrder.filter((id) => state.runs[id]?.manuscriptId === state.check.activeId)
    : state.runOrder

  useEffect(() => {
    if (open && focus) {
      setCollapsed((c) => ({ ...c, [focus]: false }))
      requestAnimationFrame(() => scrollWithin(document.getElementById(`run-${focus}`), '.drawer-body', 'start'))
    }
  }, [open, focus])

  return (
    <aside className={`drawer ${open ? 'open' : ''}`} aria-hidden={!open} aria-label="Agent trace">
      <div className="drawer-head">
        <div>
          <h2>Agent trace</h2>
          <small>What the agent planned, called, saw and decided</small>
        </div>
        <button className="icon-btn" onClick={() => act.showTrace(false)} aria-label="Close trace"><Icon name="x" /></button>
      </div>
      <div className="drawer-body scroll">
        {runIds.length === 0 && <p className="muted-text pad">{state.route.view === 'check'
          ? 'No checks for this manuscript yet.' : 'No runs yet. Start a search, ask a question or run a comparison.'}</p>}
        {runIds.map((id, i) => {
          const run = state.runs[id]
          const isOpen = collapsed[id] === undefined ? i === 0 || id === focus : !collapsed[id]
          return <RunCard key={id} run={run} open={isOpen} onToggle={() => setCollapsed((c) => ({ ...c, [id]: isOpen }))} />
        })}
      </div>
    </aside>
  )
}
