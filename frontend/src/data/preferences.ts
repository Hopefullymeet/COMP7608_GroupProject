import { useSyncExternalStore } from 'react'

export const options = {
  appearance: ['light', 'dark', 'system'],
  font: ['14', '16', '18', '20'],
  steps: ['compact', 'detailed'],
  collapse: ['finished', 'never'],
  replies: ['all', 'latest'],
  send: ['enter', 'modifier'],
  busy: ['draft', 'queue'],
  usage: ['detailed', 'hidden'],
  links: ['open', 'confirm'],
} as const
type Key = keyof typeof options
type Preferences = { [K in Key]: (typeof options)[K][number] }
const storage = 'papertrace.interface.v1'
function read(): Preferences {
  let saved: Record<string, unknown> = {}
  try { saved = JSON.parse(localStorage.getItem(storage) || '{}') || {} } catch { /* defaults */ }
  return Object.fromEntries(Object.entries(options).map(([k, values]) =>
    [k, (values as readonly unknown[]).includes(saved[k]) ? saved[k] : values[0]])) as Preferences
}
let current = read()
const listeners = new Set<() => void>()
export function setPreference(key: Key, value: string) {
  if (!(options[key] as readonly string[]).includes(value)) return
  current = { ...current, [key]: value }
  localStorage.setItem(storage, JSON.stringify(current))
  listeners.forEach(fn => fn())
}
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
export const usePreferences = () => useSyncExternalStore(subscribe, () => current)
