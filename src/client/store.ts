/**
 * Client-side state for the pricing section: loads the host snapshot (or the
 * embedded fallback), holds filters/sort/expand state, notifies subscribers.
 * Plain module state — one Models page instance per browser tab in practice.
 */

import type { PricingPayload, PricingRow } from './types.js'

export type LoadStatus = 'idle' | 'loading' | 'live' | 'cached' | 'embedded' | 'error'

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

  async function load(force = false) {
    const seq = ++loadSeq
    set({ status: 'loading', error: undefined })
    try {
      const url = force ? '/model-pricing/snapshot?fresh=1' : '/model-pricing/snapshot'
      const response = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-cache' })
      if (!response.ok) throw new Error(`status ${String(response.status)}`)
      const payload = (await response.json()) as PricingPayload
      if (!Array.isArray(payload.rows)) throw new Error('unexpected payload shape')
      if (seq !== loadSeq) return
      set({
        status: payload.fromCache ? 'cached' : 'live',
        payload,
        ageMs: Date.now() - Date.parse(payload.generatedAt),
      })
    } catch (error) {
      if (seq !== loadSeq) return
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
  }

  async function refresh() {
    const seq = ++loadSeq
    set({ status: 'loading', error: undefined })
    try {
      const response = await fetch('/model-pricing/refresh', { method: 'POST' })
      if (!response.ok) throw new Error(`status ${String(response.status)}`)
      const payload = (await response.json()) as PricingPayload
      if (seq !== loadSeq) return
      set({ status: 'live', payload, ageMs: Date.now() - Date.parse(payload.generatedAt) })
    } catch (error) {
      if (seq !== loadSeq) return
      set({ status: state.payload ? state.status : 'error', error: String((error as Error)?.message ?? error) })
    }
  }

  /** Rows after filters/sort applied; stable order by provider+model within equal keys. */
  function visibleRows(): PricingRow[] {
    const { payload, filters } = state
    if (!payload) return []
    const query = filters.query.trim().toLowerCase()
    const configured = new Set(payload.providers?.configured ?? [])
    let rows = payload.rows.filter((row) => {
      if (query && !`${row.name} ${row.modelId} ${row.providerName} ${row.provider}`.toLowerCase().includes(query)) return false
      if (filters.tags.length > 0 && !filters.tags.every((tag) => row.tags.includes(tag))) return false
      if (filters.onlyMine === 'configured' && !configured.has(row.provider)) return false
      return true
    })
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
    allTags,
    setFilters,
    setCollapsed(collapsed: boolean) {
      set({ collapsed })
    },
    load,
    refresh,
  }
}

export type Store = ReturnType<typeof createStore>
