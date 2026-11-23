import type { Write, Picked } from './library'
export type PersonalProfile = {persona?:string;session_access?:"read"|"edit";wiki_access?:"read"|"edit";identity:string;enabled:boolean;memories:string[];revision:string}
export type Model = {
  id: string
  label: string
  model: string
  endpoint: string
  local: boolean
  credential_configured: boolean
  credential_store?: boolean
  credential_stored?: boolean
  credential_preview?: string | null
}
export type Service = {
  id: string
  label: string
  kind: 'search' | 'parser'
  enabled: boolean
  status: string
  fields: string[]
}
export type Budget = Record<'calls' | 'tokens' | 'minutes' | 'cost', number | null>
export const unlimitedBudget: Budget = { calls: null, tokens: null, minutes: null, cost: null }
export type Config = {
  revision: string
  model_id: string
  models: Model[]
  services: Service[]
  budget: Budget
  ask_before_overage: boolean
}
export type Offer = {
  offer_id: string
  task_id: string
  endpoint: string
  purpose: string
  source_versions: string[]
  estimated_usage: string
}
export type Grant = Offer & { grant_id: string; status: 'active' | 'revoked' | 'expired' }
export type Activity = {
  id: string
  topic_id: string
  title: string
  detail: string
  target: 'library' | 'read' | 'discover' | 'compare' | 'wiki' | 'check'
  paper_id?: string
  session_id?: string
  draft_id?: string
  sentence_id?: string
  checkpoint_id?: string
}
export type Watch = { topic_id: string; search_id: string; interval_days: number }
export type ResumeTask = { kind: 'resume'; topic_id: string; input: { checkpoint_id: string } }
type Inspection = { preview_id: string; valid: boolean; summary: string; issues: string[] }
export type ServiceMethods = {
  'preset.get': [Record<string,never>, {mode: 'fixed' | 'agent' | 'wiki'}]
  'preset.save': [Write & {mode: 'fixed' | 'agent' | 'wiki'}, {mode: 'fixed' | 'agent' | 'wiki'}]
  'profile.get': [Record<string,never>,PersonalProfile]
  'profile.save': [Write & PersonalProfile,PersonalProfile]
  'services.get': [Record<string, never>, Config]
  'services.save': [Write & Omit<Config, 'revision'> & { base_revision: string }, Config]
  'services.test': [Write & { id: string }, { ok: boolean; message: string }]
  'services.credentials': [
    { id: string } & ({ action: 'save'; api_key: string } | { action: 'delete' }),
    { configured: boolean; stored: boolean },
  ]
  'access.list': [Record<string, never>, { offers: Offer[]; grants: Grant[] }]
  'access.grant': [Write & { offer_id: string }, Grant]
  'access.revoke': [Write & { grant_id: string }, { revoked: boolean }]
  'backup.create': [Write, { name: string; saved: boolean }]
  'backup.inspect': [{ file_id: string }, Inspection]
  'backup.restore': [Write & { preview_id: string }, { restored: boolean }]
  'discovery.watch': [Write & Watch, { interval_days: number }]
  'workspace.activity': [{ topic_id?: string }, { items: Activity[]; watches: Watch[] }]
  'file.stage_drop': [Write & { paths: string[] }, { files: Picked[] }]
}
export const defaultConfig = (): Config => ({
  revision: 'initial',
  model_id: 'compatible',
  ask_before_overage: true,
  budget: { ...unlimitedBudget },
  models: [
    {
      id: 'compatible',
      label: 'OpenAI-compatible',
      model: 'fixture-model',
      endpoint: 'https://model.example.org',
      local: false,
      credential_configured: false,
    },
    {
      id: 'anthropic',
      label: 'Anthropic',
      model: 'fixture-claude',
      endpoint: 'https://api.anthropic.com',
      local: false,
      credential_configured: false,
    },
    {
      id: 'local',
      label: 'Local Ollama',
      model: 'fixture-local',
      endpoint: 'http://localhost:11434',
      local: true,
      credential_configured: false,
    },
  ],
  services: [
    {
      id: 'openalex',
      label: 'OpenAlex',
      kind: 'search',
      enabled: true,
      status: 'Fixture',
      fields: ['year', 'venue'],
    },
    {
      id: 's2',
      label: 'Semantic Scholar',
      kind: 'search',
      enabled: true,
      status: 'Fixture',
      fields: ['year'],
    },
    { id: 'arxiv', label: 'arXiv', kind: 'search', enabled: false, status: 'Fixture', fields: ['year'] },
    {
      id: 'parser',
      label: 'Local structured-text parser',
      kind: 'parser',
      enabled: true,
      status: 'Fixture',
      fields: [],
    },
  ],
})
