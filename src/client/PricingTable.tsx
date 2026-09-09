/**
 * The pricing section rendered into the Models page footer. Plain React with the
 * platform's CSS design tokens referenced inline (bundle-purity rules forbid
 * importing other DSH client packages' code; tokens are documented in
 * docs/design.md §7). All copy goes through `tr()` — see src/client/locales.ts.
 */
import * as React from 'react'
import { TAG_LABELS } from '../shared/tags.mjs'
import { tr } from './i18n.js'
import type { Store } from './store.js'
import type { PricingRow } from './types.js'

const { useState, useSyncExternalStore, useCallback } = React

const num = new Intl.NumberFormat('en')

function money(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  if (v === 0) return '$0'
  if (v < 0.01) return `$${v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`
  if (v < 1) return `$${v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}`
  return `$${v.toFixed(2)}`
}

function context(v: number | undefined): string {
  if (v == null) return '—'
  if (v >= 1_000_000) return `${Math.round(v / 1_000_000)}M`
  if (v >= 1000) return `${Math.round(v / 1000)}k`
  return String(v)
}

function ago(ms: number | undefined): string {
  if (ms == null) return '—'
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m} min`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} h`
  return `${Math.round(h / 24)} d`
}

const btnStyle: React.CSSProperties = { font: 'inherit', fontSize: 12, color: 'inherit', background: 'transparent', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '3px 9px', cursor: 'pointer' }

const s = {
  header: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' as const },
  title: { fontSize: 15, fontWeight: 600, margin: 0 },
  status: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12 },
  stale: { color: 'var(--dsw-alias-state-warn-primary)', fontSize: 12 },
  toolbar: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const, margin: '12px 0' },
  search: { flex: '1 1 180px', minWidth: 140, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-1)', color: 'inherit' } as React.CSSProperties,
  chip: (active: boolean): React.CSSProperties => ({ font: 'inherit', fontSize: 12, padding: '2px 9px', borderRadius: 12, cursor: 'pointer', border: '1px solid var(--dsw-alias-border-l2)', background: active ? 'var(--dsw-alias-brand-primary)' : 'transparent', color: active ? 'var(--dsw-alias-label-primary-inverted)' : 'var(--dsw-alias-label-secondary)' }),
  group: { border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, marginTop: 6 },
  groupHead: { display: 'flex', gap: 10, alignItems: 'center', padding: '7px 10px', cursor: 'pointer', width: '100%', textAlign: 'left' as const, background: 'none', border: 'none', color: 'inherit', font: 'inherit' } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' } as React.CSSProperties,
  th: (align: 'left' | 'right'): React.CSSProperties => ({ textAlign: align, padding: '4px 8px', fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', fontWeight: 500, cursor: 'pointer', userSelect: 'none' }),
  td: (align: 'left' | 'right'): React.CSSProperties => ({ textAlign: align, padding: '4px 8px', borderTop: '1px solid var(--dsw-alias-border-l1)', fontVariantNumeric: 'tabular-nums' }),
  badge: { fontSize: 11, padding: '0 6px', borderRadius: 10, border: '1px solid var(--dsw-alias-border-l2)', marginRight: 4, whiteSpace: 'nowrap' as const },
  detail: { padding: '8px 12px', background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-secondary)', fontSize: 12, whiteSpace: 'pre-wrap' } as React.CSSProperties,
}

/** Header row: title, status line, refresh, collapse toggle. */
export function PricingHeader({ store }: { store: Store }) {
  const state = useSyncExternalStore(store.subscribe, store.getState)
  return (
    <div style={s.header}>
      <h3 id="dsh-model-pricing-title" style={s.title}>{tr('title')}</h3>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
        <StatusLine state={state} />
        <button style={btnStyle} aria-busy={state.status === 'loading'} onClick={() => void store.refresh()} title={tr('refreshTitle')}>
          {tr('refresh')}
        </button>
        <button style={{ ...btnStyle, border: 'none' }} aria-expanded={!state.collapsed} onClick={() => store.setCollapsed(!state.collapsed)}>
          {state.collapsed ? tr('show') : tr('hide')}
        </button>
      </span>
    </div>
  )
}

function StatusLine({ state }: { state: ReturnType<Store['getState']> }) {
  if (state.status === 'error') {
    return <span style={s.stale}>{`${tr('unavailable')} — ${state.error ?? ''}`}</span>
  }
  if (!state.payload) return <span style={s.status}>{tr(state.status === 'loading' ? 'loading' : 'noData')}</span>
  const { payload, status, ageMs } = state
  const stamp = status === 'embedded'
    ? tr('builtOn', { coverage: payload.truncated ? tr('subset') : tr('full'), date: payload.generatedAt.slice(0, 10) })
    : status === 'cached'
      ? tr('cached', { age: ago(ageMs) })
      : tr('updated', { age: ago(ageMs) })
  const stale = status === 'cached'
  return (
    <span style={stale ? s.stale : s.status}>
      {`${payload.source.name} · ${stamp} · ${tr('statsLine', { providers: num.format(payload.stats.providers), models: num.format(payload.stats.priced) })}${payload.stats.promotions ? ` · ${tr('promoCount', { n: payload.stats.promotions })}` : ''} · ${tr('estimates')} · ${tr('perMillion')}${stale ? ` · ${tr('stale')}` : ''}`}
    </span>
  )
}

function Row({ row, expanded, onToggle, configured }: { row: PricingRow; expanded: boolean; onToggle: () => void; configured: boolean }) {
  const divergent = row.sources.some((x) => x.divergent)
  const cmp = row.compare
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: 'pointer' }}>
        <td style={s.td('left')}>
          {configured ? '● ' : ''}{row.name}{' '}
          {cmp?.cheapest && (
            <span title={tr('cheapestTip', { n: cmp.providers })}
              style={{ ...s.badge, color: 'var(--dsw-alias-state-success-primary)', borderColor: 'var(--dsw-alias-state-success-primary)' }}>
              {tr('cheapestBadge', { n: cmp.providers })}
            </span>
          )}
          {cmp && !cmp.cheapest && cmp.pctOver != null && cmp.pctOver >= 10 && (
            <span title={tr('overTip', { n: cmp.providers, pct: cmp.pctOver })} style={{ ...s.badge, color: 'var(--dsw-alias-label-tertiary)' }}>
              {tr('overBadge', { pct: cmp.pctOver, provider: cmp.cheapestProvider })}
            </span>
          )}
          {divergent && <span title={tr('divergentTip')} style={{ color: 'var(--dsw-alias-state-warn-primary)' }}>⚠</span>}
          {row.promo && (
            <a
              href={row.promo.url || undefined}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(e) => row.promo.url ? undefined : e.preventDefault()}
              title={tr('promoTip', {
                text: row.promo.promo,
                until: row.promo.until,
                more: row.promo.more ? tr('promoMore', { n: row.promo.more }) : '',
                verifiedAt: row.promo.verifiedAt,
                by: row.promo.by,
              })}
              style={{ ...s.badge, marginLeft: 6, color: 'var(--dsw-alias-brand-primary)', borderColor: 'var(--dsw-alias-brand-primary)', fontWeight: 600, textDecoration: 'none' }}
            >
              {row.promo.promo}
            </a>
          )}
        </td>
        <td style={s.td('right')} title={row.flatPlan ? tr('subTip') : undefined}>
          {row.flatPlan ? <span style={{ color: 'var(--dsw-alias-label-tertiary)' }}>{tr('subCell')}</span> : money(row.cost.input)}
        </td>
        <td style={s.td('right')}>{row.flatPlan ? '' : money(row.cost.output)}</td>
        <td style={s.td('right')}>{row.flatPlan ? '' : money(row.cost.cacheRead)}</td>
        <td style={s.td('right')}>{context(row.context)}</td>
        <td style={s.td('left')}>
          {row.tags.slice(0, 3).map((t) => <span key={t} style={s.badge}>{TAG_LABELS[t] ?? t}</span>)}
          {row.tags.length > 3 && <span style={s.badge} title={row.tags.map((t) => TAG_LABELS[t] ?? t).join(', ')}>+{row.tags.length - 3}</span>}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} style={s.detail}>
            {row.description ?? ''}{'\n'}
            {tr('rowDetail', { provider: row.provider, modelId: row.modelId, maxOutput: context(row.maxOutput), modalities: row.caps.inputModalities.join(', ') || 'text' })}
            {row.status ? ` · ${row.status}` : ''}{'\n'}
            {row.sources.map((x, i) => (
              <span key={i}>{tr('sourceLine', { origin: x.origin, updated: x.updated ? ` (${x.updated})` : '' })}{x.divergent && x.piPrice ? ` — ${tr('yourRoute', { input: money(x.piPrice.input), output: money(x.piPrice.output) })}` : ''}{'  '}</span>
            ))}
          </td>
        </tr>
      )}
    </>
  )
}

export function PricingTable({ store }: { store: Store }) {
  const state = useSyncExternalStore(store.subscribe, store.getState)
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const [openRow, setOpenRow] = useState<string | null>(null)
  const configured = new Set(state.payload?.providers?.configured ?? [])
  const rows = store.visibleRows()
  const tags = store.allTags()
  const { filters } = state

  const toggleGroup = useCallback((g: string) => setOpenGroups((prev) => {
    const next = new Set(prev); next.has(g) ? next.delete(g) : next.add(g); return next
  }), [])

  const setSort = (key: 'input' | 'output' | 'cacheRead' | 'context') => {
    const cur = filters.sort
    store.setFilters({ sort: cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' } })
  }

  if (state.status === 'loading') return <div style={s.status}>{tr('loading')}</div>
  if (!state.payload) return <div style={s.status}>{tr('noData')}</div>

  const groups = new Map<string, PricingRow[]>()
  for (const row of rows) {
    const g = filters.grouping === 'flat' ? '—' : row.flatPlan ? tr('plansGroup') : row.providerName
    ;(groups.get(g) ?? groups.set(g, []).get(g)!).push(row)
  }

  const arrow = (key: string) => (filters.sort.key === key ? (filters.sort.dir === 'asc' ? ' ▲' : ' ▼') : '')
  const head = (
    <thead>
      <tr>
        <th scope="col" style={s.th('left')}>{tr('colModel')}</th>
        <th scope="col" style={s.th('right')} onClick={() => setSort('input')}>{tr('colInput')}{arrow('input')}</th>
        <th scope="col" style={s.th('right')} onClick={() => setSort('output')}>{tr('colOutput')}{arrow('output')}</th>
        <th scope="col" style={s.th('right')} onClick={() => setSort('cacheRead')}>{tr('colCache')}{arrow('cacheRead')}</th>
        <th scope="col" style={s.th('right')} onClick={() => setSort('context')}>{tr('colContext')}{arrow('context')}</th>
        <th scope="col" style={s.th('left')}>{tr('colTags')}</th>
      </tr>
    </thead>
  )

  return (
    <div>
      <div style={s.toolbar} role="search">
        <input style={s.search} placeholder={tr('searchPlaceholder')} value={filters.query} aria-label={tr('searchPlaceholder')}
          onChange={(e) => store.setFilters({ query: e.target.value })} />
        {tags.map((t) => (
          <button key={t} style={s.chip(filters.tags.includes(t))} aria-pressed={filters.tags.includes(t)}
            onClick={() => store.setFilters({ tags: filters.tags.includes(t) ? filters.tags.filter((x) => x !== t) : [...filters.tags, t] })}>
            {TAG_LABELS[t] ?? t}
          </button>
        ))}
        <button style={s.chip(filters.onlyMine === 'configured')} aria-pressed={filters.onlyMine === 'configured'}
          onClick={() => store.setFilters({ onlyMine: filters.onlyMine === 'configured' ? 'off' : 'configured' })}>{tr('onlyMine')}</button>
          {state.payload?.stats.promotions ? (
            <button style={s.chip(filters.tags.includes('promo'))} aria-pressed={filters.tags.includes('promo')}
              onClick={() => store.setFilters({ tags: filters.tags.includes('promo') ? filters.tags.filter((x) => x !== 'promo') : [...filters.tags, 'promo'] })}>{tr('promoChip')}</button>
          ) : null}
        <button style={btnStyle} onClick={() => store.setFilters({ grouping: filters.grouping === 'provider' ? 'flat' : 'provider' })}>
          {filters.grouping === 'provider' ? tr('groupProvider') : tr('groupFlat')}
        </button>
      </div>
      {rows.length === 0 && <div style={s.status}>{tr('emptyFilter')}</div>}
      {[...groups.entries()].map(([g, grows]) => {
        const open = filters.grouping === 'flat' || openGroups.has(g)
        const min = (xs: number[]) => (xs.length ? money(Math.min(...xs)) : '—')
        return (
          <div key={g} style={s.group}>
            {filters.grouping === 'provider' && (
              <button style={s.groupHead} aria-expanded={open} onClick={() => toggleGroup(g)}>
                <span aria-hidden="true">{open ? '▾' : '▸'}</span>
                <b>{g}</b>
                <span style={s.status}>{`${tr('fromRange', { input: min(grows.map((r) => r.cost.input ?? Infinity)), output: min(grows.map((r) => r.cost.output ?? Infinity)) })} · ${tr('modelsCount', { n: grows.length })}`}</span>
              </button>
            )}
            {open && (
              <table style={s.table}>
                {head}
                <tbody>
                  {grows.map((r) => (
                    <Row key={`${r.provider}/${r.modelId}`} row={r} configured={configured.has(r.provider)}
                      expanded={openRow === `${r.provider}/${r.modelId}`}
                      onToggle={() => setOpenRow(openRow === `${r.provider}/${r.modelId}` ? null : `${r.provider}/${r.modelId}`)} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * C1: badge for DSH provider cards on the Models page (keyed slot
 * settings.models.provider-card). Renders only when the DSH provider id maps to
 * a catalog provider with priced models; maps `llm-<id>` namespaces to the
 * models.dev provider id. Prices stay list prices — the badge says where the
 * provider stands in the catalog, nothing more.
 */
export function makeProviderBadge(store: Store) {
  return function ProviderBadge(props: { provider?: { provider?: string; settingsNs?: string }; store?: unknown }) {
    const state = useSyncExternalStore(store.subscribe, store.getState)
    React.useEffect(() => {
      void store.load()
    }, [])
    if (!state.payload) return null
    const entry = props.provider ?? {}
    const candidates = [entry.settingsNs?.replace(/^llm-/, ''), entry.provider]
    let summary: ReturnType<Store['providerSummary']> | undefined
    for (const id of candidates) {
      if (!id) continue
      summary = store.providerSummary(id)
      if (summary) break
    }
    if (!summary || !Number.isFinite(summary.minOutput as number)) return null
    return (
      <span
        title={`${tr('estimates')} · ${tr('perMillion')}`}
        style={{ ...s.badge, color: 'var(--dsw-alias-label-secondary)' }}
      >
        {tr('providerBadge', { price: money(summary.minOutput), models: summary.models })}
        {summary.offers ? tr('providerBadgeOffers', { n: summary.offers }) : ''}
      </span>
    )
  }
}
