import { useEffect, useRef, useState } from 'react'
import { errorText, RpcError } from '../api/contract'
import type { Client, Finished, Start, Step, HistoryRun, TaskInput, Transfer } from '../api/contract'

type Preview = { text: string; steps: Step[]; tools: HistoryRun['steps']; progress: string }
const empty: Preview = { text: '', steps: [], tools: [], progress: '' }
type Confirmation = { budget?:import('../api/services').Budget;source_versions?:string[]; input: TaskInput; confirmation_id: string; transfers: Transfer[]; startKey: string }
export const operation = () => crypto.randomUUID()

// If the response was lost, repeat the same logical write with the same parameters.
export async function retryWrite<T>(send: () => Promise<T>) {
  try { return await send() } catch (error) {
    if (error instanceof RpcError) throw error
    return await send()
  }
}

export function useTask(api: Client, onFinished: (task: string, result: Finished) => void) {
  const [task, setTask] = useState<string>()
  const [preview, setPreview] = useState(empty)
  const [confirmation, setConfirmation] = useState<Confirmation>()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [connectionError, setConnectionError] = useState('')
  const [connection, reconnect] = useState(0)
  const tracked = useRef({ id: '', run: '', cursor: 0 })
  const pending = useRef(false)
  const finish = useRef(onFinished)
  finish.current = onFinished

  function attach(id: string, started?: Start) {
    if (tracked.current.id === id) return
    tracked.current = { id, run: started?.run_id ?? '', cursor: 0 }
    setPreview(empty)
    setError('')
    setConnectionError('')
    setStatus('')
    setTask(id)
  }

  useEffect(() => {
    if (!task) return
    const tracker = tracked.current
    let valid = true
    let ended = false
    let gap = false
    let unsubscribe: (() => void) | undefined
    function done(result: Finished) {
      ended = true
      unsubscribe?.()
      setTask(undefined)
      setPreview(empty)
      setConnectionError('')
      setStatus(result.status === 'cancelled' ? 'Task cancelled.' :
        result.status === 'failed' ? `Task failed · ${errorText(new RpcError(result.issue.reason, result.issue))}` : '')
      finish.current(tracker.id, result)
    }
    async function connect() {
      setConnectionError('')
      let replayed = false
      while (valid && !ended && tracker === tracked.current) {
        gap = false
        try {
          unsubscribe = await api.subscribe(tracker.id, tracker.cursor, (event) => {
            if (!valid || ended || gap || tracker !== tracked.current || event.task_id !== tracker.id ||
                (tracker.run && event.run_id !== tracker.run) || event.event_seq <= tracker.cursor) return
            if (event.event_seq !== tracker.cursor + 1) {
              gap = true
              reconnect((value) => value + 1)
              return
            }
            tracker.run = event.run_id
            tracker.cursor = event.event_seq
            switch (event.type) {
              case 'task.progress': {
                const { stage, message } = event.payload
                setPreview(state => ({ ...state, progress: message, tools: stage.startsWith('tool.')
                  ? [...state.tools, { kind: 'tool', title: stage.slice(5), detail: message }] : state.tools }))
                break
              }
              case 'discovery.step': setPreview((state) => ({ ...state, steps: [...state.steps, event.payload] })); break
              case 'answer.delta': setPreview((state) => ({ ...state, text: state.text + event.payload.text })); break
              case 'task.finished': done(event.payload); break
            }
          })
          if (!valid || ended) unsubscribe()
          return
        } catch (cause) {
          if (!valid || ended) return
          if (replayed) throw cause
          const snapshot = await api.call('task.get', { task_id: tracker.id })
          if (!valid || tracker !== tracked.current) return
          if ('result' in snapshot || snapshot.status === 'cancelled' || snapshot.status === 'failed') {
            done(snapshot)
            return
          }
          if (!(cause instanceof RpcError) || !['EVENT_HISTORY_UNAVAILABLE', 'INVALID_CURSOR'].includes(cause.issue.reason)) throw cause
          tracker.run = snapshot.run_id
          tracker.cursor = snapshot.last_event_seq
          setPreview(empty)
          replayed = true
        }
      }
    }
    void connect().catch((cause) => { if (valid) setConnectionError(errorText(cause)) })
    const resume = () => reconnect((value) => value + 1)
    window.addEventListener('online', resume)
    return () => { valid = false; unsubscribe?.(); window.removeEventListener('online', resume) }
  }, [api, task, connection])

  async function exclusive<T>(work: () => Promise<T>) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try { return await work() } catch (cause) {
      const existing = cause instanceof RpcError && cause.issue.reason === 'TASK_IN_PROGRESS' && cause.issue.details?.task_id
      if (typeof existing === 'string') {
        setConfirmation(undefined)
        attach(existing)
      } else {
        if (cause instanceof RpcError && cause.issue.reason === 'CONFIRMATION_REQUIRED') setConfirmation(undefined)
        setError(errorText(cause))
      }
    } finally { pending.current = false; setBusy(false) }
  }
  async function startPrepared(prepared: Confirmation) {
    const params = { ...prepared.input, confirmation_id: prepared.confirmation_id, operation_id: prepared.startKey }
    const started = await retryWrite(() => api.call('task.start', params))
    setConfirmation(undefined)
    attach(started.task_id, started)
    return started
  }
  const prepare = (input: TaskInput, { startImmediately = false, onPrepared }: { startImmediately?: boolean; onPrepared?: () => void } = {}) => exclusive(async () => {
    const params = { ...input, operation_id: operation() }
    const result = await retryWrite(() => api.call('task.prepare', params))
    const prepared = { input, ...result, startKey: operation() }
    if (startImmediately) return startPrepared(prepared)
    setConfirmation(prepared)
    onPrepared?.()
  })
  const start = () => confirmation && exclusive(() => startPrepared(confirmation))
  const cancel = () => task && exclusive(async () => {
    const params = { task_id: task, operation_id: operation() }
    await retryWrite(() => api.call('task.cancel', params))
    reconnect((value) => value + 1)
  })
  return { task, preview, confirmation, busy, status, error, connectionError, attach, prepare, start, cancel,
    detach: () => {
      tracked.current = { id: '', run: '', cursor: 0 }
      setTask(undefined)
      setPreview(empty)
      setConfirmation(undefined)
      setError('')
      setStatus('')
      setConnectionError('')
    },
    clearNotice: () => { setError(''); setConnectionError(''); setStatus('') },
    dismiss: () => { if (!pending.current) setConfirmation(undefined) },
    reconnect: () => reconnect((value) => value + 1) }
}

export type TaskController = ReturnType<typeof useTask>
