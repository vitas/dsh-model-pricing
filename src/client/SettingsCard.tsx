/**
 * Settings card for the `model-pricing` namespace, rendered on the Plugins
 * settings tab through the keyed `settings.plugin.item` slot.
 *
 * Reads ride the framework describe-mirror via `settingsScope.bind` (never a
 * private fetch); writes go through the scope's serialized, revision-fenced
 * `set`/`unset`, so this card and settings.yaml can never clobber each other.
 *
 * Built from plain React + design tokens (not the plugins client's internal
 * card primitives) to respect DSH's client bundle-purity rule.
 */
import * as React from 'react'
import { useState, useSyncExternalStore } from 'react'
import { tr } from './i18n'
import type { SettingsSnapshot } from './settings-types'

/** Minimal slice of the framework scope this card consumes. */
export interface PricingScope {
  getSnapshot(): SettingsSnapshot
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
  unset(field: string): Promise<void>
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid var(--dsw-alias-border-default, #444)',
  background: 'var(--dsw-alias-bg-input, transparent)',
  color: 'var(--dsw-alias-text-primary, inherit)',
  font: 'inherit',
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 2 }
const hintStyle: React.CSSProperties = { fontSize: 11, color: 'var(--dsw-alias-text-tertiary, #888)', marginTop: 3 }
const resetStyle: React.CSSProperties = { marginLeft: 6, font: 'inherit', fontSize: 10, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', textDecoration: 'underline' }

/** One labeled field: local draft while typing, parse-on-commit, reset-to-base. */
function Field(props: {
  id: string
  label: string
  hint: string
  value: string
  overridden: boolean
  disabled: boolean
  multiline?: boolean
  parse: (text: string) => unknown
  onCommit: (parsed: unknown) => void
  onReset: () => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const shown = draft ?? props.value
  const commit = () => {
    if (draft === null) return
    setDraft(null)
    try {
      const parsed = props.parse(shown)
      setError(null)
      props.onCommit(parsed)
    } catch (e) {
      setError(String((e as Error)?.message ?? e))
    }
  }
  return (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor={props.id} style={labelStyle}>
        {props.label}
        {props.overridden && (
          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 400, color: 'var(--dsw-alias-text-accent, #69f)' }}>
            {tr('overridden')}
            <button type="button" style={resetStyle} onClick={props.onReset} disabled={props.disabled}>
              {tr('reset')}
            </button>
          </span>
        )}
      </label>
      {props.multiline ? (
        <textarea
          id={props.id}
          rows={5}
          style={{ ...inputStyle, fontFamily: 'var(--dsw-alias-font-mono, monospace)', resize: 'vertical' }}
          value={shown}
          disabled={props.disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
        />
      ) : (
        <input
          id={props.id}
          type="text"
          style={inputStyle}
          value={shown}
          disabled={props.disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
        />
      )}
      <div style={{ ...hintStyle, color: error ? 'var(--dsw-alias-text-danger, #e55)' : undefined }}>{error ?? props.hint}</div>
    </div>
  )
}

/** The card body; the bound scope arrives via closure from apply(). */
export function PricingSettingsCard(props: { scope: PricingScope }) {
  const snap = useSyncExternalStore(
    (cb) => props.scope.subscribe(cb),
    () => props.scope.getSnapshot(),
  )
  if (snap.status === 'loading') return <div style={{ padding: 12, fontSize: 12 }}>{tr('loading')}</div>
  if (snap.status !== 'ready') return null // namespace not served — the tab would not dispatch this anyway
  const value = snap.value ?? {}
  const user = (snap.user ?? {}) as Record<string, unknown>
  const disabled = snap.writable === false
  const toNumber = (text: string) => {
    const n = Number(text.trim())
    if (!Number.isFinite(n) || n <= 0) throw new Error(tr('invalidNumber'))
    return n
  }
  const toUrl = (text: string) => {
    const t = text.trim()
    if (!/^https?:\/\/.+/.test(t)) throw new Error(tr('invalidUrl'))
    return t
  }
  const toRules = (text: string) => {
    const t = text.trim()
    if (!t) return undefined
    let parsed: unknown
    try {
      parsed = JSON.parse(t)
    } catch {
      throw new Error(tr('invalidJson'))
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error(tr('invalidJson'))
    return parsed
  }
  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 8,
        border: '1px solid var(--dsw-alias-border-default, #444)',
        background: 'var(--dsw-alias-bg-secondary, transparent)',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{tr('title')}</div>
      <div style={{ ...hintStyle, marginBottom: 12 }}>{tr('settingsHint')}</div>
      <Field
        id="model-pricing-ttl"
        label={tr('ttlField')}
        hint={tr('ttlHint')}
        value={value.ttlMinutes == null ? '' : String(value.ttlMinutes)}
        overridden={'ttlMinutes' in user}
        disabled={disabled}
        parse={toNumber}
        onCommit={(n) => void props.scope.set('ttlMinutes', n)}
        onReset={() => void props.scope.unset('ttlMinutes')}
      />
      <Field
        id="model-pricing-source"
        label={tr('sourceField')}
        hint={tr('sourceHint')}
        value={value.sourceUrl ?? ''}
        overridden={'sourceUrl' in user}
        disabled={disabled}
        parse={toUrl}
        onCommit={(u) => void props.scope.set('sourceUrl', u)}
        onReset={() => void props.scope.unset('sourceUrl')}
      />
      <Field
        id="model-pricing-tagrules"
        label={tr('tagRulesField')}
        hint={tr('tagRulesHint')}
        multiline
        value={value.tagRules == null ? '' : JSON.stringify(value.tagRules, null, 2)}
        overridden={'tagRules' in user}
        disabled={disabled}
        parse={toRules}
        onCommit={(v) => (v === undefined ? void props.scope.unset('tagRules') : void props.scope.set('tagRules', v))}
        onReset={() => void props.scope.unset('tagRules')}
      />
    </div>
  )
}
