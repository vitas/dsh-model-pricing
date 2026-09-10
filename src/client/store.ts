/**
 * Client-side state for the pricing section: loads the host snapshot (or the
 * embedded fallback), holds filters/sort/expand state, notifies subscribers.
 * Plain module state — one Models page instance per browser tab in practice.
 */

import type { PricingPayload, PricingRow, SessionCostSummary } from './types.js'

export type LoadStatus = 'idle' | 'loading' | 'live' | 'cached' | 'embedded' | 'absent' | 'error'

export interface ProviderSummary { minOutput?: number; models: number; offers: number }

export interface Filters {
  query: string
  tags: string[]
  onlyMine: 'off' | 'configured'
  grouping: 'provider' | 'flat'
  sort: { key: 'input' | 'output' | 'cacheRead' | 'context'; dir: 'asc' | 'desc' }
}

export interface StoreState {
  status: LoadStatus
  error?: string
  ageMs?: number
  payload?: PricingPayload
  /** Local session-cost summary from /model-pricing/sessions (loaded after the catalog). */
  sessions?: SessionCostSummary | null
  filters: Filters
  collapsed: boolean
}

type Listener = () => void

export const DEFAULT_FILTERS: Filters = {
  query: '',
  tags: [],
  onlyMine: 'off',
  grouping: 'provider',
  sort: { key: 'output', dir: 'asc' },
}

/**
 * Create the store bound to an embedded fallback payload (used when the host
 * route is unavailable: headless composition or offline browser).
 */
export function createStore(fallback: PricingPayload | null) {
  let state: StoreState = { status: 'idle', filters: { ...DEFAULT_FILTERS }, collapsed: true }
  const listeners = new Set<Listener>()
  let loadSeq = 0

  const emit = () => {
    for (const l of listeners) l()
  }
  const set = (patch: Partial<StoreState>) => {
    state = { ...state, ...patch }
    emit()
  }
  const setFilters = (patch: Partial<Filters>) => {
    state = { ...state, filters: { ...state.filters, ...patch } }
    emit()
  }

  /**
   * Fetch the host snapshot. A 404 means the host half is not mounted at all
   * (DSH's web server answers unknown paths with 404) — per MVP DoD #5 the
   * section then renders nothing. Every other failure (offline, 5xx) is an
   * upstream problem and takes the fallback path.
   */
  async function fetchSnapshot(url: string, init?: RequestInit): Promise<{ payload?: PricingPayload; absent?: boolean }> {
    const response = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-cache', ...init })
    if (response.status === 404) return { absent: true }
    if (!response.ok) throw new Error(`status ${String(response.status)}`)
    const payload = (await response.json()) as PricingPayload
    if (!Array.isArray(payload.rows)) throw new Error('unexpected payload shape')
    return { payload }
  }

  function useFallback(error: unknown) {
    if (fallback?.rows) {
      set({
        status: 'embedded',
        payload: fallback,
        ageMs: Date.now() - Date.parse(fallback.generatedAt),
        error: String((error as Error)?.message ?? error),
      })
    } else {
      set({ status: 'error', error: String((error as Error)?.message ?? error) })
    }
  }

  /** Session costs load behind the catalog; failure or absence hides the panel. */
  async function fetchSessions() {
    try {
      const response = await fetch('/model-pricing/sessions', { headers: { accept: 'application/json' }, cache: 'no-cache' })
      if (!response.ok) return
      const data = (await response.json()) as SessionCostSummary
      if (Array.isArray(data?.sessions)) set({ sessions: data })
    } catch {
      /* estimation is an extra; never an error surface */
    }
  }

  async function load(force = false) {
    const seq = ++loadSeq
    set({ status: 'loading', error: undefined })
    try {
      const url = force ? '/model-pricing/snapshot?fresh=1' : '/model-pricing/snapshot'
      const { payload, absent } = await fetchSnapshot(url)
      if (seq !== loadSeq) return
      if (absent) return set({ status: 'absent', payload: undefined })
      set({
        status: payload!.fromCache ? 'cached' : 'live',
        payload,
        ageMs: Date.now() - Date.parse(payload!.generatedAt),
      })
      void fetchSessions()
    } catch (error) {
      if (seq !== loadSeq) return
      useFallback(error)
    }
  }

  async function refresh() {
    const seq = ++loadSeq
    set({ status: 'loading', error: undefined })
    try {
      const { payload, absent } = await fetchSnapshot('/model-pricing/refresh', { method: 'POST' })
      if (seq !== loadSeq) return
      if (absent) return set({ status: 'absent', payload: undefined })
      set({ status: 'live', payload, ageMs: Date.now() - Date.parse(payload!.generatedAt) })
    } catch (error) {
      if (seq !== loadSeq) return
      useFallback(error)
    }
  }

  let configuredMiss = false
  const normalizeId = (id: string) => String(id).toLowerCase().replace(/[^a-z0-9]/g, '')

  /** Rows after filters/sort applied; stable order by provider+model within equal keys. */
  function visibleRows(): PricingRow[] {
    const { payload, filters } = state
    if (!payload) return []
    const query = filters.query.trim().toLowerCase()
    const configured = new Set((payload.providers?.configured ?? []).map(normalizeId))
    // A configured id that names no priced row (local/test provider ids, or a
    // custom gateway whose catalog key differs) would otherwise render an
    // empty table — a dead end for anyone trying the filter first. Flag the
    // miss, show all rows and let the banner explain.
    configuredMiss = false
    let rows = payload.rows.filter((row) => {
      if (query && !`${row.name} ${row.modelId} ${row.providerName} ${row.provider}`.toLowerCase().includes(query)) return false
      if (filters.tags.length > 0 && !filters.tags.every((tag) => (tag === 'promo' ? !!row.promo : row.tags.includes(tag)))) return false
      if (filters.onlyMine === 'configured' && !configured.has(normalizeId(row.provider))) return false
      return true
    })
    if (filters.onlyMine === 'configured' && configured.size > 0 && rows.length === 0) {
      configuredMiss = true
      rows = payload.rows.filter((row) => {
        if (query && !`${row.name} ${row.modelId} ${row.providerName} ${row.provider}`.toLowerCase().includes(query)) return false
        if (filters.tags.length > 0 && !filters.tags.every((tag) => (tag === 'promo' ? !!row.promo : row.tags.includes(tag)))) return false
        return true
      })
    }
    const key = filters.sort.key
    const dir = filters.sort.dir === 'asc' ? 1 : -1
    rows = rows.slice().sort((a, b) => {
      const av = a.cost[key] ?? Number.POSITIVE_INFINITY
      const bv = b.cost[key] ?? Number.POSITIVE_INFINITY
      const an = key === 'context' ? a.context ?? Number.POSITIVE_INFINITY : av
      const bn = key === 'context' ? b.context ?? Number.POSITIVE_INFINITY : bv
      if (an !== bn) return (an - bn) * dir
      return a.provider.localeCompare(b.provider) || a.modelId.localeCompare(b.modelId)
    })
    return rows
  }

  /** Every provider that has active whole-provider offers, for the summary panel. */
  function allProviderOffers(): [string, import('./types.js').ProviderOffers][] {
    const map = state.payload?.promotions?.providerOffers
    if (!map) return []
    return Object.entries(map)
  }

  /**
   * Active community offers for a provider, keyed by the normalized id
   * (lowercase alphanumeric). Covers providers absent from the pricing catalog
   * (a gateway with its own promotions) — the provider card is their only seat.
   */
  function providerOffers(providerId: string): import('./types.js').ProviderOffers | undefined {
    const map = state.payload?.promotions?.providerOffers
    if (!map) return undefined
    return map[providerId.toLowerCase().replace(/[^a-z0-9]/g, '')]
  }

  /**
   * Rollup of catalog rows for one provider id (case-insensitive). Used by the
   * provider-card badges (C1) on the Models page; `undefined` when the provider
   * is not in the loaded catalog. Memoized per payload reference.
   */
  let summaryCache: { payload: unknown; map: Map<string, ProviderSummary> } | null = null
  function providerSummary(providerId: string): ProviderSummary | undefined {
    const { payload } = state
    if (!payload) return undefined
    if (!summaryCache || summaryCache.payload !== payload) {
      summaryCache = { payload, map: new Map() }
      for (const row of payload.rows) {
        const key = row.provider.toLowerCase()
        const cur = summaryCache.map.get(key)
        const output = row.cost.output
        if (!cur) {
          summaryCache.map.set(key, {
            minOutput: Number.isFinite(output as number) ? (output as number) : undefined,
            models: 1,
            offers: row.promo ? 1 : 0,
          })
        } else {
          cur.models++
          if (row.promo) cur.offers++
          if (Number.isFinite(output as number) && (cur.minOutput === undefined || (output as number) < cur.minOutput)) {
            cur.minOutput = output as number
          }
        }
      }
    }
    return summaryCache.map.get(providerId.toLowerCase())
  }

  /** All tags present in the loaded payload, ordered by chip label. */
  function allTags(): string[] {
    const tags = new Set<string>()
    for (const row of state.payload?.rows ?? []) for (const tag of row.tags) tags.add(tag)
    return [...tags].sort()
  }

  return {
    subscribe(listener: Listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    getState: () => state,
    visibleRows,
    /** True while "only mine" matched nothing and the table fell back to all rows. */
    configuredMiss: () => configuredMiss,
    providerSummary,
      allProviderOffers,
  providerOffers,
    allTags,
    setFilters,
    setCollapsed(collapsed: boolean) {
      set({ collapsed })
    },
    /** Force a re-render without changing state (locale switch). */
    notify() {
      state = { ...state }
      emit()
    },
    load,
    refresh,
  }
}

export type Store = ReturnType<typeof createStore>
