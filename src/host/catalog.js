/**
 * Catalog sources: fetch and validate models.dev, prune to the UI row shape,
 * attach capability tags. The host owns all heavy parsing; the browser only ever
 * receives the pruned payload (docs/architecture.md §4).
 */

import { computeTags, resolveTagRules } from '../shared/tags.mjs'

export const DEFAULT_SOURCE_URL = 'https://models.dev/api.json'

/** Matches subscription-plan providers as named by models.dev (B2). */
export const FLAT_PLAN_RE = /(?:coding|token) plan/i

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
    // Subscription plans (coding/token plan bundles) publish $0 per-token prices
    // that are not usable per-token prices; flagged so the UI can group them
    // and the comparison ignores them.
    flatPlan: FLAT_PLAN_RE.test(String(provider.name || provider.id || '')) || undefined,
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

/**
 * Cross-provider comparison (feature A2). Groups rows that are the same model
 * served by different providers (canonical model-id after stripping provider
 * prefixes, version pins and date suffixes), then annotates each row in a
 * multi-provider group with `compare`: the cheapest route (by output price — the
 * v0.1 metric; blended cost is P1 per decision Q4) and how far above the
 * cheapest the row sits. Pure; called once per snapshot build.
 */
export function annotateComparisons(rows) {
  const canonical = (modelId) => {
    let id = String(modelId).toLowerCase()
    const slash = id.lastIndexOf('/')
    if (slash >= 0) id = id.slice(slash + 1) // openrouter-style provider prefix
    id = id.replace(/[:@]\w+$/, '') // bedrock-style version pins (":0", "@20250805")
    id = id.replace(/-20\d{6}$/, '') // release-date suffixes
    id = id.replace(/[^a-z0-9]+/g, '')
    return id
  }
  const groups = new Map()
  for (const row of rows) {
    if (row.flatPlan) continue // $0 subscription prices are not comparable per-token routes
    const key = canonical(row.modelId)
    if (key.length < 5) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  for (const group of groups.values()) {
    const byProvider = new Map()
    for (const row of group) {
      const existing = byProvider.get(row.provider)
      if (!existing || effPrice(row) < effPrice(existing)) byProvider.set(row.provider, row)
    }
    if (byProvider.size < 2) continue
    const winners = [...byProvider.values()].sort((a, b) => effPrice(a) - effPrice(b))
    const best = winners[0]
    for (const row of group) {
      const price = effPrice(row)
      const ratio = effPrice(best) > 0 && Number.isFinite(price) ? price / effPrice(best) : NaN
      row.compare = {
        providers: byProvider.size,
        cheapest: row === best,
        pctOver: Number.isFinite(ratio) ? Math.round((ratio - 1) * 100) : undefined,
        cheapestProvider: best.providerName,
      }
    }
  }
  return rows
}

function effPrice(row) {
  return row.cost.output ?? row.cost.input ?? Number.POSITIVE_INFINITY
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

/** Default compiled promotion feed (this repository's published artifact). */
export const DEFAULT_PROMO_URL =
  'https://raw.githubusercontent.com/vitas/dsh-model-pricing/feed/promo-dist/index.json'

/**
 * Fetch the compiled promotion feed. Non-fatal by contract: any failure returns
 * an empty list so a promo outage can never hide the price table.
 * @param url - feed location; empty/undefined disables promotions.
 * @returns records shaped `{ provider, model, promo, discountPct?, fixedCost?, until, url?, verifiedAt, by }`.
 */
export async function fetchPromoFeed(url) {
  if (!url || typeof url !== 'string') return []
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'dsh-model-pricing/0.1 (local plugin)' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return []
    const doc = await response.json()
    return Array.isArray(doc?.promos) ? doc.promos : []
  } catch {
    return [] // promotions are an enhancement; never break the catalog for them
  }
}

/**
 * Attach active promotions to rows (B3). Matching is case-insensitive on
 * `provider/model`; a record whose `until` has passed is ignored even if the
 * feed still carries it, so a missed CI run cannot display a stale offer. A row
 * takes the earliest-expiring active promotion; additional records are kept
 * only as a count.
 * @param rows - catalog rows (mutated: a `promo` field is set on matches).
 * @param promos - feed records.
 * @returns number of rows that received a promo.
 */
export function attachPromos(rows, promos) {
  if (!Array.isArray(promos) || promos.length === 0) return 0
  const now = Date.now()
  /** @type {Map<string, object[]>} */
  const byModel = new Map()
  for (const p of promos) {
    if (typeof p?.until === 'string' && Date.parse(p.until) <= now) continue // hide expired
    const key = `${String(p.provider ?? '').toLowerCase()}|${String(p.model ?? '').toLowerCase()}`
    const list = byModel.get(key)
    if (list) list.push(p)
    else byModel.set(key, [p])
  }
  if (byModel.size === 0) return 0
  let matched = 0
  for (const row of rows) {
    const list = byModel.get(`${row.provider.toLowerCase()}|${row.modelId.toLowerCase()}`)
    if (!list) continue
    list.sort((a, b) => Date.parse(a.until) - Date.parse(b.until))
    row.promo = { ...list[0], provider: undefined }
    if (list.length > 1) row.promo.more = list.length - 1
    matched++
  }
  return matched
}
