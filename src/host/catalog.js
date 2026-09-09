/**
 * Catalog sources: fetch and validate models.dev, prune to the UI row shape,
 * attach capability tags. The host owns all heavy parsing; the browser only ever
 * receives the pruned payload (docs/architecture.md §4).
 */

import { computeTags, resolveTagRules } from '../shared/tags.mjs'

export const DEFAULT_SOURCE_URL = 'https://models.dev/api.json'

const finite = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)

/** Normalize one catalog model into a PricingRow, or return null when unusable. */
function toRow(model, provider, rules) {
  if (!model || typeof model.id !== 'string' || typeof model.name !== 'string') return null
  const cost = model.cost
  if (!cost || typeof cost !== 'object') return null // no public price: not a pricing row
  const input = finite(cost.input)
  const output = finite(cost.output)
  if (input === undefined && output === undefined) return null

  const modalities = model.modalities && typeof model.modalities === 'object' ? model.modalities : {}
  const inputModalities = Array.isArray(modalities.input) ? modalities.input.filter((m) => typeof m === 'string') : []
  const row = {
    provider: provider.id,
    providerName: provider.name || provider.id,
    modelId: model.id,
    name: model.name,
    description: typeof model.description === 'string' ? model.description.slice(0, 240) : undefined,
    family: typeof model.family === 'string' ? model.family : undefined,
    cost: {
      input,
      output,
      cacheRead: finite(cost.cache_read),
      cacheWrite: finite(cost.cache_write),
      reasoning: finite(cost.reasoning),
      tiers: Array.isArray(cost.tiers) && cost.tiers.length > 0 ? cost.tiers : undefined,
    },
    context: finite(model.limit?.context),
    maxOutput: finite(model.limit?.output),
    caps: {
      reasoning: model.reasoning === true,
      toolCall: model.tool_call === true,
      structuredOutput: model.structured_output === true,
      attachment: model.attachment === true,
      openWeights: model.open_weights === true,
      inputModalities,
    },
    sources: [{ origin: 'models.dev', updated: typeof model.last_updated === 'string' ? model.last_updated : undefined }],
    status: model.status === 'beta' || model.status === 'deprecated' ? model.status : undefined,
    experimental: model.experimental === true || undefined,
  }
  row.tags = computeTags(row, row.description, rules)
  return row
}

/**
 * Validate and prune a parsed models.dev document.
 * @returns {{ rows: object[], stats: { providers: number, models: number, priced: number } }}
 * @throws when the document shape is not recognized at all
 */
export function pruneModelsDev(document, tagRulesConfig) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('unexpected models.dev document shape')
  }
  const rules = resolveTagRules(tagRulesConfig)
  const rows = []
  let providers = 0
  let models = 0
  for (const provider of Object.values(document)) {
    if (!provider || typeof provider !== 'object' || !provider.models || typeof provider.models !== 'object') continue
    providers += 1
    for (const model of Object.values(provider.models)) {
      models += 1
      const row = toRow(model, provider, rules)
      if (row) rows.push(row)
    }
  }
  if (rows.length === 0) throw new Error('models.dev document contained no priced models')
  rows.sort((a, b) => a.provider.localeCompare(b.provider) || a.modelId.localeCompare(b.modelId))
  return { rows, stats: { providers, models, priced: rows.length } }
}

/** Fetch the catalog source. Node global fetch; 30 s budget. */
export async function fetchModelsDev(url = DEFAULT_SOURCE_URL) {
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'dsh-model-pricing/0.1 (local plugin)' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`models.dev responded ${String(response.status)}`)
  return await response.json()
}
