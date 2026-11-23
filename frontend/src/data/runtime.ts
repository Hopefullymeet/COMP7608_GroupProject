import type { TaskEvent } from './types'
import { addUsage, budgetLimit, emptyUsage, type RunConfiguration, type Usage } from './serviceSettings'

// Stand-in for the Python worker. A real task would arrive as JSON-RPC 2.0
// notifications over the host channel (Technical Book §3.1); here a scripted
// sequence is replayed on timers in the same envelope.

export interface ScriptItem {
  /** Milliseconds after the previous item. */
  delay: number
  event: TaskEvent
}

export interface TaskNotification {
  jsonrpc: '2.0'
  method: 'task.event'
  params: { task_id: string; seq: number; event: TaskEvent }
}

/** `?speed=4` replays scripts faster, useful for walkthroughs and checks. */
const SPEED = (() => {
  const v = Number(new URLSearchParams(window.location.search).get('speed'))
  return Number.isFinite(v) && v > 0 ? v : 1
})()

function eventUsage(item: ScriptItem, local: boolean): Usage {
  if (item.event.type === 'run' || item.event.type === 'done') return emptyUsage
  const step = item.event.type === 'step' ? item.event.step : undefined
  // Each token-bearing step represents one model call in the demo.
  const tokens = step?.tokens ?? 0
  return {
    calls: Number(tokens > 0), tokens, ms: step?.ms ?? item.delay,
    cost: local ? 0 : tokens / 1_000_000,
  }
}

export function runTask(
  taskId: string, items: ScriptItem[], config: RunConfiguration,
  notify: (notification: TaskNotification, usage: Usage) => void,
  onLimit: (limit: string) => void,
) {
  let timer = 0
  let index = 0
  let usage = emptyUsage
  let approved = false
  let paused = false
  let cancelled = false

  function next() {
    const item = items[index]
    if (!item || cancelled) return
    // Publish the run before checking limits so zero-budget runs can be handled by the store.
    const projected = item.event.type === 'done' ? usage : addUsage(usage, eventUsage(item, config.local))
    const limit = budgetLimit(projected, config.budget)
    if (item.event.type !== 'run' && item.event.type !== 'done' && limit && !approved) {
      paused = true
      onLimit(limit)
      return
    }
    timer = window.setTimeout(() => {
      if (cancelled) return
      usage = projected
      notify({ jsonrpc: '2.0', method: 'task.event', params: { task_id: taskId, seq: index++, event: item.event } }, usage)
      next()
    }, item.delay / SPEED)
  }

  next()
  return {
    cancel() { cancelled = true; window.clearTimeout(timer) },
    resume() {
      if (!paused || cancelled) return
      paused = false
      approved = true
      next()
    },
  }
}
