export type ModelProvider = 'anthropic' | 'compatible' | 'local'
export type SearchSourceId = 'openalex' | 's2' | 'arxiv'

export interface TaskBudget {
  calls: number
  tokens: number
  minutes: number
  cost: number
}

export interface Usage {
  calls: number
  tokens: number
  ms: number
  cost: number
}

export interface RunConfiguration {
  model: string
  destination: string
  sources: SearchSourceId[]
  paperIds: string[]
  budget: TaskBudget
  askBeyond: boolean
  local: boolean
}

export interface ModelConfig {
  modelId: string
  endpoint: string
}

export interface Settings {
  model: ModelProvider
  models: Record<ModelProvider, ModelConfig>
  tested: Partial<Record<ModelProvider, true>>
  budget: TaskBudget
  askBeyond: boolean
  sources: Record<SearchSourceId, boolean>
}

export const SOURCE_NAMES: Record<SearchSourceId, string> = {
  openalex: 'OpenAlex', s2: 'Semantic Scholar', arxiv: 'arXiv',
}

export function modelErrors(provider: ModelProvider, config: ModelConfig) {
  let endpoint = ''
  if (provider === 'compatible') {
    try {
      const endpointUrl = config.endpoint.trim()
      const url = new URL(endpointUrl)
      if (!/^https?:\/\//i.test(endpointUrl) || url.username || url.password || /[?#]/.test(endpointUrl)) {
        endpoint = 'Enter an HTTP(S) base URL without credentials, query parameters or fragments.'
      }
    } catch {
      endpoint = 'Enter a valid HTTP(S) base URL.'
    }
  }
  return { endpoint, modelId: !config.modelId.trim() ? 'Enter a model ID.' : /\s/.test(config.modelId.trim()) ? 'Model IDs cannot contain spaces.' : '' }
}

export const enabledSources = (settings: Settings) =>
  (Object.keys(SOURCE_NAMES) as SearchSourceId[]).filter((id) => settings.sources[id])

export const emptyUsage: Usage = { calls: 0, tokens: 0, ms: 0, cost: 0 }

export function addUsage(a: Usage, b: Usage): Usage {
  return { calls: a.calls + b.calls, tokens: a.tokens + b.tokens, ms: a.ms + b.ms, cost: a.cost + b.cost }
}

export function budgetLimit(usage: Usage, budget: TaskBudget) {
  const exceeded = []
  if (usage.calls > budget.calls) exceeded.push('model calls')
  if (usage.tokens > budget.tokens) exceeded.push('tokens')
  if (usage.ms > budget.minutes * 60_000) exceeded.push('time')
  if (Math.round(usage.cost * 1_000_000) / 1_000_000 > budget.cost) exceeded.push('spend')
  return exceeded.join(', ')
}
