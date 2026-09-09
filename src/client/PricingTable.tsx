/**
 * The pricing section rendered into the Models page footer. Plain React with the
 * platform's CSS design tokens referenced inline (bundle-purity rules forbid
 * importing other DSH client packages' code; tokens are documented in
 * docs/design.md §7).
 */
import * as React from 'react'
import { TAG_LABELS } from '../shared/tags.mjs'
import type { Store } from './store.js'
import type { PricingRow } from './types.js'

const { useState, useSyncExternalStore, useCallback } = React

const num = new Intl.NumberFormat('en')

function money(v: number | undefined): string {
  if (v == null) return '—'
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
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}

const s = {
  region: { margin: '16px 0', padding: '14px 16px', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 10, background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)', fontSize: 13 } as React.CSSProperties,
  header: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' as const },
  title: { fontSize: 15, fontWeight: 600 },
  status: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12 },
  stale: { color: 'var(--dsw-alias-state-warn-primary)', fontSize: 12 },
  spacer: { marginLeft: 'auto' },
  btn: { font: 'inherit', color: 'inherit', background: 'transparent', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '3px 9px', cursor: 'pointer' } as React.CSSProperties,
  toolbar: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const, margin: '12px 0' },
  search: { flex: '1 1 180px', minWidth: 140, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-1)', color: 'inherit' } as React.CSSProperties,
  chip: (active: boolean): React.CSSProperties => ({ font: 'inherit', fontSize: 12, padding: '2px 9px', borderRadius: 12, cursor: 'pointer', border: `1px solid var(--dsw-alias-border-l2)`, background: active ? 'var(--dsw-alias-brand-primary)' : 'transparent', color: active ? 'var(--dsw-alias-label-primary-inverted)' : 'var(--dsw-alias-label-secondary)' }),
  group: { border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, marginTop: 6 },
  groupHead: { display: 'flex', gap: 10, alignItems: 'center', padding: '7px 10px', cursor: 'pointer', width: '100%', textAlign: 'left' as const, background: 'none', border: 'none', color: 'inherit', font: 'inherit' } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' } as React.CSSProperties,
  th: (align: string): React.CSSProperties => ({ textAlign: align as any, padding: '4px 8px', fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', fontWeight: 500, cursor: 'pointer', userSelect: 'none' }),
  td: (align: string): React.CSSProperties => ({ textAlign: align as any, padding: '4px 8px', borderTop: '1px solid var(--dsw-alias-border-l1)', fontVariantNumeric: 'tabular-nums' }),
  mono: { fontFamily: 'ui-monospace, monospace' },
  tagChip: { fontSize: 11, padding: '0 6px', borderRadius: 10, border: '1px solid var(--dsw-alias-border-l2)', color: 'var(--dsw-alias-label-secondary)', marginRight: 4 },
  detail: { padding: '8px 12px', background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-secondary)', fontSize: 12, whiteSpace: 'pre-wrap' } as React.CSSProperties,
}

export function StatusLine({ store }: { store: Store }) {
  const state = useSyncExternalStore(store.subscribe, store.getState)
  if (state.status === 'error') {
    return <span style={s.stale}>Pricing unavailable — {state.error ?? 'unknown error'}</span>
  }
  if (!state.payload) return <span style={s.status}>Loading model pricing…</span>
  const { payload, status, ageMs } = state
  const src = status === 'embedded' ? `bundled snapshot (${payload.truncated ? 'subset' : 'full'}) · built ${payload.generatedAt.slice(0, 10)}`
    : status === 'cached' ? `cached · ${ago(ageMs)}`
    : `updated ${ago(ageMs)}`
  const stale = status === 'cached'
  return (
    <span style={stale ? s.stale : s.status}>
      {payload.source.name} · {src} · {num.format(payload.stats.providers)} providers / {num.format(payload.stats.priced)} priced models ·{' '}
      estimates, not billing{stale ? ' · stale' : ''}
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
            <span title={`Cheapest of ${cmp.providers} providers carrying this model`}
              style={{ ...s.tagChip, color: 'var(--dsw-alias-state-success-primary)', borderColor: 'var(--dsw-alias-state-success-primary)' }}>cheapest · {cmp.providers}×
            </span>
          )}
          {cmp && !cmp.cheapest && cmp.pctOver != null && cmp.pctOver >= 10 && (
            <span title={`Same model on ${cmp.providers} providers; this route costs ${String(cmp.pctOver)}% more (by output price)`}
              style={{ ...s.tagChip, color: 'var(--dsw-alias-label-tertiary)' }}>+{cmp.pctOver}% vs {cmp.cheapestProvider}
            </span>
          )}
          {divergent && <span title="catalog price differs from your route by >10%" style={{ color: 'var(--dsw-alias-state-warn-primary)' }}>⚠</span>}
        </td>
        <td style={s.td('right')}>{money(row.cost.input)}</td>
        <td style={s.td('right')}>{money(row.cost.output)}</td>
        <td style={s.td('right')}>{money(row.cost.cacheRead)}</td>
        <td style={s.td('right')}>{context(row.context)}</td>
        <td style={s.td('left')}>
          {row.tags.slice(0, 3).map((t) => <span key={t} style={s.tagChip}>{TAG_LABELS[t] ?? t}</span>)}
          {row.tags.length > 3 && <span style={s.tagChip} title={row.tags.map((t) => TAG_LABELS[t] ?? t).join(', ')}>+{row.tags.length - 3}</span>}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} style={s.detail}>
            {row.description ?? ''}{'\n'}
            id: {row.provider}/{row.modelId} · max output: {context(row.maxOutput)} · modalities: {row.caps.inputModalities.join(', ') || 'text'}{row.status ? ` · ${row.status}` : ''}{'\n'}
            {row.sources.map((x, i) => (
              <span key={i}>source: {x.origin}{x.updated ? ` (${x.updated})` : ''}{x.divergent && x.piPrice ? ` — your route: ${money(x.piPrice.input)}/${money(x.piPrice.output)}` : ''}{'  '}</span>
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

  const groups = new Map<string, PricingRow[]>()
  for (const row of rows) {
    const g = filters.grouping === 'flat' ? 'All models' : row.providerName
    ;(groups.get(g) ?? groups.set(g, []).get(g)!).push(row)
  }

  const head = (
    <thead>
      <tr>
        <th style={s.th('left')}>{filters.grouping === 'flat' ? 'Model' : 'Model'}</th>
        <th style={s.th('right')} onClick={() => setSort('input')}>Input {filters.sort.key === 'input' ? (filters.sort.dir === 'asc' ? '▲' : '▼') : ''}</th>
        <th style={s.th('right')} onClick={() => setSort('output')}>Output {filters.sort.key === 'output' ? (filters.sort.dir === 'asc' ? '▲' : '▼') : ''}</th>
        <th style={s.th('right')} onClick={() => setSort('cacheRead')}>Cache {filters.sort.key === 'cacheRead' ? (filters.sort.dir === 'asc' ? '▲' : '▼') : ''}</th>
        <th style={s.th('right')} onClick={() => setSort('context')}>Context {filters.sort.key === 'context' ? (filters.sort.dir === 'asc' ? '▲' : '▼') : ''}</th>
        <th style={s.th('left')}>Tags</th>
      </tr>
    </thead>
  )

  if (state.status === 'loading') return <div style={s.status}>Loading…</div>
  if (!state.payload) return <div style={s.status}>No pricing data available.</div>

  return (
    <div>
      <div style={s.toolbar} role="search">
        <input style={s.search} placeholder="Search models or providers" value={filters.query} aria-label="Search models or providers"
          onChange={(e) => store.setFilters({ query: e.target.value })} />
        {tags.map((t) => (
          <button key={t} style={s.chip(filters.tags.includes(t))} aria-pressed={filters.tags.includes(t)}
            onClick={() => store.setFilters({ tags: filters.tags.includes(t) ? filters.tags.filter((x) => x !== t) : [...filters.tags, t] })}>
            {TAG_LABELS[t] ?? t}
          </button>
        ))}
        <button style={s.chip(filters.onlyMine === 'configured')} aria-pressed={filters.onlyMine === 'configured'}
          onClick={() => store.setFilters({ onlyMine: filters.onlyMine === 'configured' ? 'off' : 'configured' })}>Only mine</button>
        <button style={s.btn} onClick={() => store.setFilters({ grouping: filters.grouping === 'provider' ? 'flat' : 'provider' })}>
          Group: {filters.grouping}
        </button>
      </div>
      {[...groups.entries()].map(([g, grows]) => {
        const open = filters.grouping === 'flat' || openGroups.has(g)
        const inputs = grows.map((r) => r.cost.input ?? Infinity)
        const outputs = grows.map((r) => r.cost.output ?? Infinity)
        const min = (xs: number[]) => xs.length ? money(Math.min(...xs)) : '—'
        return (
          <div key={g} style={s.group}>
            {filters.grouping === 'provider' && (
              <button style={s.groupHead} aria-expanded={open} onClick={() => toggleGroup(g)}>
                <span>{open ? '▾' : '▸'}</span>
                <b>{g}</b>
                <span style={s.status}>from {min(inputs)} / {min(outputs)} per 1M · {grows.length} models</span>
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
