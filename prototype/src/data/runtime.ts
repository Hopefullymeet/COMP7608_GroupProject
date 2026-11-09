import type { TaskEvent } from './types'

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

export function runTask(taskId: string, items: ScriptItem[], notify: (n: TaskNotification) => void): () => void {
  const timers: number[] = []
  let elapsed = 0
  items.forEach((item, seq) => {
    elapsed += item.delay / SPEED
    timers.push(
      window.setTimeout(() => {
        notify({ jsonrpc: '2.0', method: 'task.event', params: { task_id: taskId, seq, event: item.event } })
      }, elapsed),
    )
  })
  return () => timers.forEach((t) => window.clearTimeout(t))
}
