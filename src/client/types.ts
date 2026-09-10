/**
 * Shapes shared between the host payload and the client. Mirrors
 * docs/architecture.md §4.1. Kept in the client bundle as types only (erased).
 */

export interface RowCost {
  input?: number
  output?: number
  cacheRead?: number
  cacheWrite?: number
  reasoning?: number
  tiers?: { inputTokensAbove: number; input?: number; output?: number; cacheRead?: number }[]
}

export interface RowSource {
  origin: 'models.dev' | 'pi-catalog' | 'override'
  updated?: string
  divergent?: boolean
  piPrice?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number }
}

export interface ProviderOffer {
  model?: string
  promo: string
  discountPct?: number
  fixedCost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number }
  until: string
  url?: string
  verifiedAt: string
  by: string
}

export interface ProviderOffers {
  /** Original provider id as contributed (display; keys are normalized). */
  provider: string
  count: number
  /** Earliest expiry among the provider's active offers. */
  until?: string
  offers: ProviderOffer[]
}

export interface PricingRow {
  provider: string
  providerName: string
  modelId: string
  name: string
  description?: string
  family?: string
  cost: RowCost
  context?: number
  maxOutput?: number
  caps: {
    reasoning: boolean
    toolCall: boolean
    structuredOutput: boolean
    attachment: boolean
    openWeights: boolean
    inputModalities: string[]
  }
  tags: string[]
  sources: RowSource[]
  status?: string
  experimental?: boolean
  authoritative?: string
  /** Cross-provider comparison for the same model (A2); present in multi-provider groups. */
  free?: boolean
  /** Cross-provider comparison metadata; see annotateComparisons in the host. */
  compare?: {
    providers: number
    cheapest?: boolean
    pctOver?: number
    cheapestProvider?: string
    /** Cheapest paid route far below the first-party listing — verify before relying. */
    verify?: boolean
    baselineVerify?: boolean
    officialProvider?: string
  }
  /** Subscription plan (coding/token plan): the $0 per-token prices are nominal. */
  flatPlan?: boolean
  /** Active community-contribution promotion for this route; absent when none. */
  promo?: {
    promo: string
    discountPct?: number
    fixedCost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number }
    until: string
    url?: string
    verifiedAt: string
    by: string
    more?: number
  }
}

/** One (provider, model) slice of session usage priced against the catalog. */
export interface SessionModelCost {
  provider: string
  model: string
  input: number
  output: number
  cacheRead: number
  /** routed | listed | estimated | missing — see summarizeSessions in the host. */
  confidence: string
  listUsd?: number
  actualUsd?: number
  savedUsd?: number
  minUsd?: number
  maxUsd?: number
}

export interface SessionCostSummary {
  generatedAt: string
  scanned?: number
  sessions: Array<{
    id: string
    workspace: string
    updatedAt: string
    turns: number
    models: SessionModelCost[]
    listUsd: number
    actualUsd: number
    savedUsd: number
  }>
  models: SessionModelCost[]
  totals: { listUsd: number; actualUsd: number; savedUsd: number; sessions: number; unreadable: number }
}

export interface PricingPayload {
  generatedAt: string
  ttlSeconds: number
  source: { name: string; url: string }
  stats: { providers: number; models: number; priced: number; promotions?: number }
  providers: { configured: string[] }
  /** Promotion feed provenance (the compiled feed URL, or null when disabled). */
  promotions?: {
    source: string | null
    /** Catalog rows that carry an attached row-level promotion. */
    count: number
    /** Active offers per normalized provider id (whole-provider and model-scoped). */
    providerOffers?: Record<string, ProviderOffers>
  }
  rows: PricingRow[]
  fromCache?: boolean
  /** Embedded fallbacks ship a curated subset; flagged so the UI can say so. */
  truncated?: boolean
}
