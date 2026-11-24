import { useLanguage } from '../i18n'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Dialog } from '../components/PageHead'
import { createPortal } from 'react-dom'
import { Icon } from '../components/Icon'
import { ScopeDetails } from '../components/ScopeDetails'
import { errorText, type Client, type Method, type Methods, type WorkspaceTask } from '../api/contract'
import { operation, retryWrite, useTask } from './useTask'

type WriteMethod = { [M in Method]: Methods[M][0] extends { operation_id: string } ? M : never }[Method]
type Payload<P> = P extends unknown ? Omit<P, 'operation_id'> : never
type Workspace = {
  api: Client
  tick: number
  demo: boolean
  busy: boolean
  setComparisonSlot: (element: HTMLDivElement | null) => void
  refresh: () => void
  report: (error: unknown) => void
  write: <M extends WriteMethod>(method: M, params: Payload<Methods[M][0]>) => Promise<Methods[M][1]>
  prepare: (task: WorkspaceTask, onPrepared?: () => void, startImmediately?: boolean) => Promise<void>
}
const Context = createContext<Workspace | null>(null)
export function useWorkspace() {
  const ctx = useContext(Context)
  if (!ctx) throw new Error('Workspace unavailable')
  return ctx
}
export function useRead<M extends Method>(method: M, params: Methods[M][0], enabled = true) {
  const { api, tick, report } = useWorkspace()
  const [data, setData] = useState<{ key: string; value: Methods[M][1] }>()
  const query = JSON.stringify(params)
  const key = method + query
  useEffect(() => {
    let current = true
    if (enabled)
      void api
        .call(method, JSON.parse(query))
        .then((value) => {
          if (current) setData({ key, value })
        })
        .catch((e) => {
          if (current) report(e)
        })
    return () => {
      current = false
    }
  }, [api, tick, method, query, key, enabled, report])
  return enabled && data?.key === key ? data.value : undefined
}
export function WorkspaceProvider({
  api,
  demo,
  children,
}: {
  api: Client
  demo: boolean
  children: ReactNode
}) {
  const { tr } = useLanguage()
  const [tick, setTick] = useState(0)
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(0)
  const report = useCallback((cause: unknown) => setNotice(errorText(cause)), [])
  const refresh = useCallback(() => setTick((t) => t + 1), [])
  const taskKey = 'papertrace-workspace-task/' + (demo ? 'demo' : 'rpc')
  const comparisonKey = taskKey + '/comparison'
  const [comparisonSlot, setComparisonSlot] = useState<HTMLDivElement | null>(null)
  const [comparison, setComparison] = useState<{ id: string; topic: string }>()
  const task = useTask(api, () => {
    localStorage.removeItem(taskKey)
    localStorage.removeItem(comparisonKey)
    refresh()
  })
  const attached = useRef(false)
  useEffect(() => {
    if (attached.current) return
    attached.current = true
    const saved = localStorage.getItem(taskKey)
    if (saved) {
      const topic = localStorage.getItem(comparisonKey)
      if (topic) setComparison({ id: saved, topic })
      task.attach(saved)
    }
  }, [taskKey, comparisonKey, task])
  useEffect(() => {
    if (task.task) localStorage.setItem(taskKey, task.task)
  }, [task.task, taskKey])
  const writing = useRef(new Map<string, Promise<unknown>>())
  async function write<M extends WriteMethod>(
    method: M,
    params: Payload<Methods[M][0]>,
  ): Promise<Methods[M][1]> {
    const key = method + JSON.stringify(params)
    const active = writing.current.get(key)
    if (active) return active as Promise<Methods[M][1]>
    const payload = { ...params, operation_id: operation() } as unknown as Methods[M][0]
    setPending((p) => p + 1)
    const sent = retryWrite(() => api.call(method, payload))
      .then((result) => {
        refresh()
        if (!demo && method === 'library.import_pdf') {
          const { paper_id, source_version_id } = result as Methods['library.import_pdf'][1]
          const { topic_id } = payload as Methods['library.import_pdf'][0]
          void import('../visual/retrieve').then(m => m.indexFigures(api, topic_id, source_version_id)).catch(() => {
            // Retry incomplete visual indexing on the next figure query.
          })
          void api.call('library.recognize_publication', { paper_id }).then(refresh).catch(() => {
            // PDF import is complete. The inspector supports retrying an offline lookup.
          })
        }
        return result
      })
      .finally(() => {
        writing.current.delete(key)
        setPending((p) => p - 1)
      })
    writing.current.set(key, sent)
    return sent
  }
  const busy = Boolean(task.task || task.busy || task.confirmation || pending)
  function rememberComparison(input: WorkspaceTask | undefined, id?: string) {
    if (id && input?.kind === 'paper_comparison') {
      localStorage.setItem(taskKey, id)
      localStorage.setItem(comparisonKey, input.topic_id)
      setComparison({ id, topic: input.topic_id })
    }
  }
  const inline = comparison && comparisonSlot?.dataset.topic === comparison.topic &&
    (!task.task || task.task === comparison.id) ? comparisonSlot : null
  const taskNotice = task.error || task.connectionError || task.status
  const readCount = task.preview.progress.match(/^paper_read: (\d+) result\(s\)\./)?.[1]
  const stageLabels: Record<string, string> = {
    read: 'Reading the selected papers', reading: 'Reading the selected papers',
    paper_search: 'Searching for relevant passages', paper_read: 'Reviewing source passages',
    align: 'Aligning comparison dimensions', compare: 'Building the comparison table',
  }
  return (
    <Context.Provider value={{ api, tick, report, refresh, write, setComparisonSlot, prepare: async (input, onPrepared, startImmediately) => {
      if (busy) return
      setComparison(undefined)
      const started = await task.prepare(input, { onPrepared, startImmediately })
      rememberComparison(input, started?.task_id)
    }, demo, busy }}>
      {children}
      {task.confirmation && (
        <Dialog title={tr('Confirm task scope')} onClose={task.dismiss}>
          <p className="dialog-text">{tr(task.confirmation.input.kind.replaceAll('_', ' '))}</p>
          <ScopeDetails scope={task.confirmation} />
          {task.confirmation.transfers.length === 0 && <p>{tr('All material stays in this workspace.')}</p>}
          {task.confirmation.transfers.map((t, i) => (
            <p key={i}>
              <b>{tr(t.purpose)}</b>
              <br />
              {t.endpoint}
              <br />
              {t.data_categories.map((category) => tr(category)).join(', ')}
            </p>
          ))}
          <div className="dialog-actions">
            <button className="ghost-btn" onClick={task.dismiss}>
              {tr('Cancel')}
            </button>
            <button className="primary" disabled={task.busy} onClick={async () => {
              const input = task.confirmation?.input
              const started = await task.start()
              if (input?.kind === 'paper_comparison') rememberComparison(input, started?.task_id)
            }}>
              {tr('Confirm and start')}
            </button>
          </div>
        </Dialog>
      )}
      {inline && (task.task || taskNotice) && createPortal(
        <section className="card result-card comparison-progress">
          <header><Icon name="columns" size={18} /><h2>{tr('Comparison progress')}</h2></header>
          <div className="comparison-progress-body">
            <p role="status">{taskNotice ? tr(taskNotice) : readCount
              ? tr('Source passages reviewed in this batch · {0}', readCount)
              : tr(stageLabels[task.preview.stage ?? ''] || 'Comparing the selected papers')}</p>
            <div className="lib-tools">
              {task.task && <button className="ghost-btn sm" disabled={task.busy} onClick={task.cancel}>{tr('Cancel task')}</button>}
              {task.connectionError && <button className="ghost-btn sm" onClick={task.reconnect}>{tr('Reconnect')}</button>}
              {!task.task && <button className="ghost-btn sm" onClick={task.clearNotice}>{tr('Close')}</button>}
            </div>
          </div>
        </section>, inline)}
      {task.task && !inline && (
        <div className="mainline-task-actions" role="status">
          {tr(task.preview.progress || 'Task running')}
          <button className="ghost-btn sm" onClick={task.cancel}>
            {tr('Cancel task')}
          </button>
          <button className="ghost-btn sm" onClick={task.reconnect}>
            {tr('Reconnect')}
          </button>
        </div>
      )}
      {(notice || (!inline && taskNotice)) && (
        <section className="mainline-task-actions workspace-notice" aria-label={tr('Workspace notice')}>
          <p role="alert">{tr(notice || task.error || task.connectionError || task.status)}</p>
          <button
            className="ghost-btn"
            onClick={() => {
              setNotice('')
              task.clearNotice()
            }}
          >
            {tr('Close')}
          </button>
        </section>
      )}
    </Context.Provider>
  )
}
