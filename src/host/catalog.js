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
// First-party anchors: the family prefix of the model id mapped to the
// developer's own provider entry in the catalog. Used purely as a sanity
// reference — when the group's cheapest paid route undercuts the first-party
// listing by more than 2x, that route is flagged for verification instead of
// silently becoming the baseline the market is said to prove.
const FIRST_PARTY = {
  claude: 'anthropic',
  gpt: 'openai',
  chatgpt: 'openai',
  gemini: 'google',
  deepseek: 'deepseek',
  kimi: 'moonshotai',
  grok: 'xai',
  mistral: 'mistral',
  codestral: 'mistral',
  devstral: 'mistral',
  glm: 'zhipuai',
  qwen: 'alibaba',
  minimax: 'minimax',
}

function firstPartyProvider(modelId) {
  const id = String(modelId).toLowerCase()
  const slash = id.lastIndexOf('/')
  const bare = slash >= 0 ? id.slice(slash + 1) : id
  for (const [family, provider] of Object.entries(FIRST_PARTY)) {
    if (!bare.startsWith(family)) continue
    const next = bare[family.length]
    if (next === undefined || !/[a-z0-9]/.test(next)) return provider
  }
  return undefined
}

/**
 * Attach comparison metadata to rows. Three policies, learned from live data:
 *  1. $0 subscription plans (flatPlan) never join a group at all (0.2.0).
 *  2. Genuine $0 listings (free tiers) carry a `free` flag and are NOT the
 *     comparison baseline — paid routes compare against the cheapest PAID
 *     route, so groups containing a free winner still produce real
 *     comparisons instead of silence (2,773 rows were silent before this).
 *  3. A baseline that is less than half the first-party listing for a
 *     first-party-anchored model is flagged `verify`: the badge then states
 *     the catalog claim and names the doubt, instead of asserting the market.
 * `pctOver` on the other rows keeps its meaning, but is only computed against
 * the paid baseline; `baselineVerify` propagates the doubt to the `+N%` badge.
 */
/**
 * Canonical model-id for cross-provider grouping and cost joins: strips
 * provider prefixes (openrouter-style), version pins (bedrock ":0"/"@2025...")
 * and release-date suffixes, then reduces to lowercase alphanumerics. Exported
 * so the session-cost estimator joins on exactly the same key the table groups
 * on — divergence between the two would silently mismatch prices to routes.
 */
export function canonicalModelId(modelId) {
  let id = String(modelId).toLowerCase()
  const slash = id.lastIndexOf('/')
  if (slash >= 0) id = id.slice(slash + 1) // openrouter-style provider prefix
  id = id.replace(/[:@]\w+$/, '') // bedrock-style version pins (":0", "@20250805")
  id = id.replace(/-20\d{6}$/, '') // release-date suffixes
  id = id.replace(/[^a-z0-9]+/g, '')
  return id
}

export function annotateComparisons(rows) {
  const canonical = canonicalModelId
  const groups = new Map()
  for (const row of rows) {
    row.free = !row.flatPlan && effPrice(row) === 0
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
    const paid = [...byProvider.values()].filter((r) => effPrice(r) > 0).sort((a, b) => effPrice(a) - effPrice(b))
    const bestPaid = paid[0]
    const officialId = firstPartyProvider(group[0].modelId)
    const official = officialId ? byProvider.get(officialId) : undefined
    const verify = !!bestPaid && !!official && bestPaid !== official && effPrice(official) > 0 && effPrice(bestPaid) * 2 < effPrice(official)
    for (const row of group) {
      const price = effPrice(row)
      const ratio = !row.free && bestPaid && row !== bestPaid ? price / effPrice(bestPaid) : NaN
      row.compare = {
        providers: byProvider.size,
        cheapest: !row.free && !!bestPaid && row === bestPaid,
        pctOver: Number.isFinite(ratio) ? Math.round((ratio - 1) * 100) : undefined,
        cheapestProvider: bestPaid?.providerName,
        verify: row === bestPaid ? verify : undefined,
        baselineVerify: verify && row !== bestPaid ? true : undefined,
        officialProvider: verify ? official?.providerName : undefined,
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
  const empty = { matched: 0, providerOffers: {} }
  if (!Array.isArray(promos) || promos.length === 0) return empty
  const now = Date.now()
  const active = promos.filter((p) => !(typeof p?.until === 'string' && Date.parse(p.until) <= now))
  // Row-level records (with `model`): attach the earliest-expiring offer per route.
  /** @type {Map<string, object[]>} */
  const byModel = new Map()
  // Provider-level rollup: every active offer of a provider, keyed by normalized
  // id, including model-scoped ones — a provider card may be rendered for a
  // gateway that has no rows in the pricing catalog at all.
  /** @type {Map<string, object[]>} */
  const byProviderKey = new Map()
  for (const p of active) {
    const prov = String(p.provider ?? '')
    if (!prov) continue
    const list = byProviderKey.get(normalizeProviderId(prov))
    if (list) list.push(p)
    else byProviderKey.set(normalizeProviderId(prov), [p])
    if (!p.model) continue
    const key = `${prov.toLowerCase()}|${String(p.model).toLowerCase()}`
    const lm = byModel.get(key)
    if (lm) lm.push(p)
    else byModel.set(key, [p])
  }
  let matched = 0
  for (const row of rows) {
    const list = byModel.get(`${row.provider.toLowerCase()}|${row.modelId.toLowerCase()}`)
    if (!list) continue
    list.sort((a, b) => Date.parse(a.until) - Date.parse(b.until))
    row.promo = { ...list[0], provider: undefined }
    if (list.length > 1) row.promo.more = list.length - 1
    matched++
  }
  const providerOffers = {}
  for (const [key, list] of byProviderKey) {
    const sorted = [...list].sort((a, b) => Date.parse(a.until) - Date.parse(b.until))
    providerOffers[key] = {
      // Best-effort display name: the original provider string as contributed.
      provider: sorted[0]?.provider ?? key,
      count: sorted.length,
      until: sorted[0]?.until,
      offers: sorted.map((p) => ({
        model: p.model,
        promo: p.promo,
        discountPct: p.discountPct,
        fixedCost: p.fixedCost,
        until: p.until,
        url: p.url,
        verifiedAt: p.verifiedAt,
        by: p.by,
      })),
    }
  }
  return { matched, providerOffers }
}

/** Lowercase alphanumeric-only form of a provider id, for cross-source matching. */
export function normalizeProviderId(id) {
  return String(id).toLowerCase().replace(/[^a-z0-9]/g, '')
}
