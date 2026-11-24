import { Channel, invoke, isTauri } from '@tauri-apps/api/core'
import { RpcError } from './contract'
import type { Client, Issue, Method, Methods, Rpc, TaskEvent } from './contract'

type Request = { jsonrpc: '2.0'; id: string; method: string; params: unknown }
type Response<T> = { jsonrpc: '2.0'; id: string } & (
  { result: T } | { error: { message: string; data?: Issue } }
)

export { isTauri }

export function createDesktop(): Client {
  async function send<T>(command: string, method: string, params: unknown, channel?: Channel<TaskEvent>) {
    const request: Request = { jsonrpc: '2.0', id: crypto.randomUUID(), method, params }
    const response = await invoke<Response<T>>(command, { request, ...(channel && { channel }) })
    if (response.jsonrpc !== '2.0' || response.id !== request.id) throw new Error('Invalid response from the desktop host.')
    if ('error' in response) {
      const { message, data } = response.error
      throw data ? new RpcError(message, data) : new Error(message)
    }
    return response.result
  }
  const call: Rpc = <M extends Method>(method: M, params: Methods[M][0]) =>
    send<Methods[M][1]>('papertrace_rpc', method, params)
  return {
    call,
    async subscribe(task, cursor, receive) {
      const channel = new Channel<TaskEvent>(receive)
      try {
        await send('papertrace_subscribe', 'task.subscribe', { task_id: task, after_seq: cursor }, channel)
      } catch (error) {
        channel.onmessage = () => {}
        throw error
      }
      return () => { channel.onmessage = () => {} }
    },
  }
}
