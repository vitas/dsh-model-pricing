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
  compare?: { providers: number; cheapest: boolean; pctOver?: number; cheapestProvider?: string }
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

export interface PricingPayload {
  generatedAt: string
  ttlSeconds: number
  source: { name: string; url: string }
  stats: { providers: number; models: number; priced: number; promotions?: number }
  providers: { configured: string[] }
  /** Promotion feed provenance (the compiled feed URL, or null when disabled). */
  promotions?: { source: string | null; count: number }
  rows: PricingRow[]
  fromCache?: boolean
  /** Embedded fallbacks ship a curated subset; flagged so the UI can say so. */
  truncated?: boolean
}
