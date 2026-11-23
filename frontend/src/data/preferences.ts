import { useSyncExternalStore } from 'react'

export const options = {
  appearance: ['light', 'dark', 'system'],
  font: ['14', '16', '18', '20'],
  steps: ['compact', 'detailed'],
  collapse: ['finished', 'never'],
  replies: ['all', 'latest'],
  send: ['enter', 'modifier'],
  busy: ['draft', 'queue'],
  usage: ['detailed', 'compact', 'hidden'],
  findKey: ['f'],
  settingsKey: [','],
  links: ['open', 'confirm', 'sidebar'],
} as const
type Key = keyof typeof options
export type Shortcut = 'findKey' | 'settingsKey'
type Preferences = { [K in Key]: K extends Shortcut ? string : (typeof options)[K][number] }
function valid(key: Key, value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (key === 'findKey' || key === 'settingsKey') return /^[a-z0-9,.]$/.test(value) && !['c','v','x','a','z','q','w'].includes(value)
  return (options[key] as readonly string[]).includes(value)
}
const storage = 'papertrace.interface.v1'
function read(): Preferences {
  let saved: Record<string, unknown> = {}
  try { saved = JSON.parse(localStorage.getItem(storage) || '{}') || {} } catch { /* defaults */ }
  return Object.fromEntries(Object.entries(options).map(([k, values]) =>
    [k, valid(k as Key,saved[k]) ? saved[k] : values[0]])) as Preferences
}
let current = read()
const listeners = new Set<() => void>()
export function setPreference(key: Key, value: string) {
  if (!valid(key,value) || (key === 'settingsKey' && current.findKey === value) || (key === 'findKey' && current.settingsKey === value)) return false
  current = { ...current, [key]: value }
  localStorage.setItem(storage, JSON.stringify(current))
  listeners.forEach(fn => fn())
  return true
}
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
export const usePreferences = () => useSyncExternalStore(subscribe, () => current)

export function applyPreferencesFile(json: string) {
  const data: unknown = JSON.parse(json)
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid settings')
  const next = { ...current }
  for (const [key, value] of Object.entries(data)) {
    if (!Object.prototype.hasOwnProperty.call(options,key) || !valid(key as Key,value)) throw new Error('Invalid setting')
    Object.assign(next, { [key]: value })
  }
  if (next.findKey === next.settingsKey) throw new Error('Duplicate shortcut')
  localStorage.setItem(storage, JSON.stringify(next))
  current = next
  listeners.forEach(fn => fn())
}
