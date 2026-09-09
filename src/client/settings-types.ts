/**
 * Structural slice of the framework's settings scope snapshot
 * (`@deepseek-ai/dsh-client-ui-settings` SettingsScopeSnapshot). Declared
 * locally so the client bundle stays pure (no type imports from other client
 * packages needed at runtime; these are erased at build).
 */
export interface SettingsSnapshot {
  status: 'loading' | 'ready' | 'unavailable'
  value: { sourceUrl?: string; promoFeedUrl?: string; ttlMinutes?: number; tagRules?: unknown } | undefined
  base: unknown
  user: unknown
  revision: number | undefined
  writable?: boolean
}
