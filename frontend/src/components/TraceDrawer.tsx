import { usePreferences } from '../data/preferences'
import { count, useLanguage, type Translate } from '../i18n'
import { useEffect, useState } from 'react'
import { useStore } from '../data/store'
import { SOURCE_NAMES, type Usage } from '../data/serviceSettings'
import { Icon, Spinner } from './Icon'
import { scrollWithin } from './util'
import type { AgentRun, StepKind } from '../data/types'

const KIND: Record<StepKind, { icon: string; label: string }> = {
  plan: { icon: 'plan', label: 'Plan' },
  tool: { icon: 'tool', label: 'Tool call' },
  observe: { icon: 'eye', label: 'Observation' },
  decide: { icon: 'flag', label: 'Decision' },
  stop: { icon: 'stop', label: 'Stop' },
}

function usageLabel(tr: Translate, usage: Usage) {
  return tr('{0} · {1} tokens · {2} s · ${3}', count(tr, usage.calls, 'model call'), usage.tokens.toLocaleString(), (usage.ms / 1000).toFixed(1), usage.cost.toFixed(4))
}

function RunCard({ run, open, onToggle }: { run: AgentRun; open: boolean; onToggle: () => void }) {
  const { tr } = useLanguage()
  const {state}=useStore()
  const prefs = usePreferences()
  const tokens = run.steps.reduce((n, s) => n + (s.tokens ?? 0), 0)
  const ms = run.steps.reduce((n, s) => n + (s.ms ?? 0), 0)
  const config = run.configuration
  const limit = (value: number | null) => value?.toLocaleString() ?? tr('Unlimited')
  return (
    <div className="run" id={`run-${run.id}`}>
      <button className="run-head" onClick={onToggle} aria-expanded={open}>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
        <span className="grow">
          <small>{tr(run.task)}</small>
          <strong>{run.label}</strong>
        </span>
        <span className={`run-chip ${run.status === 'partial' ? 'done' : run.status}`}>{run.limit ? tr('Paused') : run.status === 'running' ? <><Spinner />{' '}{tr('Running')}</> : run.status === 'failed' ? tr('Failed') : run.status === 'cancelled' ? tr('Cancelled') : tr('Done')}</span>
      </button>
      {open && (
        <>
          <ol className="steps">
            {run.steps.map((s) => (
              <li key={s.id} className={`step ${s.kind}`}>
                <span className="step-icon"><Icon name={KIND[s.kind].icon} size={13} /></span>
                <div>
                  <small>{tr(KIND[s.kind].label)}</small>
                  <strong>{tr(s.title)}</strong>
                  {prefs.steps === 'detailed' && s.call && <code>{s.call}</code>}
                  {prefs.steps === 'detailed' && s.detail && <p>{tr(s.detail)}</p>}
                </div>
              </li>
            ))}
          </ol>
          <div className="run-foot">
            {run.summary && <p>{run.summary}</p>}
            {config && <>
              <p>{config.model} · {tr(config.destination)}</p>
              {config.sources.length > 0 && <p>{tr('Search sources:')}{' '}{config.sources.map((id) => SOURCE_NAMES[id]).join(', ')}</p>}
              <p>{tr('Budget:')}{' '}{limit(config.budget.calls)}{' '}{tr('calls ·')}{' '}{limit(config.budget.tokens)}{' '}{tr('tokens ·')}{' '}{limit(config.budget.minutes)}{' '}{tr('min · USD')}{' '}{limit(config.budget.cost)}</p>
            </>}
            {prefs.usage === 'compact' && <span>{run.usage ? count(tr,run.usage.calls,'model call') + ' · ' + run.usage.tokens.toLocaleString() + ' tokens' : tr('Usage unavailable')}</span>}
            {prefs.usage === 'detailed' && run.estimate && <p>{tr('Estimated (demo):')}{' '}{usageLabel(tr, run.estimate)}</p>}
            {prefs.usage === 'detailed' && (run.usage ? <span>{state.mainline&&!state.mainline.demo?tr('Used'):tr('Used (demo)')} · {usageLabel(tr, run.usage)}</span>
              : state.mainline?<span>{count(tr, run.steps.length,'step')}{' '}{tr('· Usage unavailable')}</span> : <span>{count(tr, run.steps.length, 'step')} · ~{tokens.toLocaleString()}{' '}{tr('tokens ·')}{' '}{(ms / 1000).toFixed(1)}{' '}{tr('s')}{' '}<em>{tr('(mock)')}</em></span>)}
          </div>
        </>
      )}
    </div>
  )
}

export function TraceDrawer() {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const prefs = usePreferences()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const { open, focus } = state.trace
  const runIds = !state.mainline && state.route.view === 'check'
    ? state.runOrder.filter((id) => state.runs[id]?.manuscriptId === state.check.activeId)
    : state.runOrder

  useEffect(() => {
    if (open && focus) {
      setCollapsed((c) => ({ ...c, [focus]: false }))
      requestAnimationFrame(() => scrollWithin(document.getElementById(`run-${focus}`), '.drawer-body', 'start'))
    }
  }, [open, focus])

  return (
    <aside className={`drawer ${open ? 'open' : ''}`} aria-hidden={!open} aria-label={tr('Agent trace')}>
      <div className="drawer-head">
        <div>
          <h2>{tr('Agent trace')}</h2>
          <small>{tr('What the agent planned, called, saw and decided')}</small>
        </div>
        <button className="icon-btn" onClick={() => act.showTrace(false)} aria-label={tr('Close trace')}><Icon name="x" /></button>
      </div>
      <div className="drawer-body scroll">
        {runIds.length === 0 && <p className="muted-text pad">{state.route.view === 'check'
          ? tr('No checks for this manuscript yet.') : tr('No runs yet. Start a search, ask a question or run a comparison.')}</p>}
        {runIds.map((id, i) => {
          const run = state.runs[id]
          const isOpen = collapsed[id] === undefined ? (id === focus || (i === 0 && (prefs.collapse === 'never' || run.status === 'running'))) : !collapsed[id]
          return <RunCard key={id} run={run} open={isOpen} onToggle={() => setCollapsed((c) => ({ ...c, [id]: isOpen }))} />
        })}
      </div>
    </aside>
  )
}
