/**
 * dsh-model-pricing — Host half.
 *
 * Owns the model-pricing catalog on the user's machine: fetches models.dev,
 * merges the pi-ai catalog for routes the user can actually invoke, prunes to the
 * UI row shape, caches with a TTL, and serves it over a named HTTP route on the
 * same port the DSH web GUI already uses. No server of its own; no telemetry.
 *
 * @module @dsh-model-pricing/host
 */

import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_PROMO_URL,
  DEFAULT_SOURCE_URL,
  annotateComparisons,
  attachPromos,
  canonicalModelId,
  fetchModelsDev,
  fetchPromoFeed,
  pruneModelsDev,
} from './catalog.js'
import { PLUGIN_NAME, SETTINGS_NAMESPACE } from '../shared/config.mjs'
import { sessionsRoot, summarizeSessions } from './sessions.js'


const PLUGIN_ID = PLUGIN_NAME
const ROUTE_SNAPSHOT = '/model-pricing/snapshot'
const ROUTE_REFRESH = '/model-pricing/refresh'
const ROUTE_SESSIONS = '/model-pricing/sessions'
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000

/**
 * Load the pi-ai catalog from the runtime DSH already ships. It is a dependency of
 * DSH's own adapter, not of this plugin, so it is imported lazily and its absence
 * is not an error. Access path verified against the installed package:
 * `providers/all` -> `builtinProviders()` -> `provider.getModels()` (sync arrays).
 * @returns {Promise<Map<string, Map<string, object>>>} provider id -> model id -> local info
 */
async function loadPiAiCatalog() {
  const byProvider = new Map()
  try {
    const mod = await import('@earendil-works/pi-ai/providers/all').catch(() => null)
    if (!mod?.builtinProviders) return byProvider
    for (const provider of mod.builtinProviders()) {
      let models = []
      try {
        models = provider.getModels() ?? []
        if (typeof models?.then === 'function') models = await models
      } catch {
        continue // provider failed to materialize its catalog row set
      }
      if (!Array.isArray(models) || models.length === 0) continue
      const entry = new Map()
      for (const m of models) {
        if (!m || typeof m.id !== 'string') continue
        entry.set(m.id, {
          cost: {
            input: numberOrUndef(m.cost?.input),
            output: numberOrUndef(m.cost?.output),
            cacheRead: numberOrUndef(m.cost?.cacheRead),
            cacheWrite: numberOrUndef(m.cost?.cacheWrite),
          },
          context: numberOrUndef(m.contextWindow),
          maxOutput: numberOrUndef(m.maxTokens),
        })
      }
      if (entry.size > 0) byProvider.set(provider.id, entry)
    }
  } catch {
    /* pi-ai not resolvable in this runtime: models.dev alone drives pricing */
  }
  return byProvider
}

const numberOrUndef = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/**
 * Overlay authoritative pi-ai prices onto models.dev rows and flag divergence.
 * Rows present in both with >10% disagreement on input or output get a
 * `divergent` source stamp. Pure function, unit-tested.
 */
export function mergePiAi(rows, catalog) {
  if (!catalog || catalog.size === 0) return rows
  for (const row of rows) {
    const local = catalog.get(row.provider)?.get(row.modelId)
    if (!local) continue
    const src = row.sources.find((s) => s.origin === 'models.dev')
    if (!src) continue
    row.sources.push({ origin: 'pi-catalog', updated: undefined })
    const differ = (a, b) => a != null && b != null && b > 0 && Math.abs(a - b) / b > 0.1
    if (differ(local.cost.input, row.cost.input) || differ(local.cost.output, row.cost.output)) {
      src.divergent = true
      src.piPrice = local.cost
    }
    // The price DSH will actually be billed from is authoritative for this route.
    row.cost = { ...row.cost, ...clean(local.cost) }
    if (local.context != null) row.context = local.context
    if (local.maxOutput != null) row.maxOutput = local.maxOutput
    row.authoritative = 'pi-catalog'
  }
  return rows
}

function clean(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v
  return out
}

/** Compute a stable short revision hash over a snapshot's JSON. */
function etagOf(payload) {
  return `"${createHash('sha256').update(JSON.stringify(payload)).digest('base64').slice(0, 16)}"`
}

/**
 * Build a settings schema, optionally marking every field volatile.
 *
 * `.volatile()` is what tells DSH 0.1.7 which fields belong to a row's settings
 * form: its settings service projects the form from the volatile part of a
 * `Config` schema only (`volatileForm` in dsh-settings) and refuses writes that
 * do not lie beneath a volatile node. A schema with no volatile field is
 * invisible to the Plugins page — the entry is dropped from `describe`, no
 * namespace is served, and every user override is silently rejected.
 *
 * The marker is NOT free: a volatile field resolves from outside the local
 * document, so a bare schemastery call such as `schema({})` yields nothing for
 * it. The imperative `installSection` path below resolves the section that way,
 * so it keeps the plain schema and both versions behave as they always did.
 *
 * `tagRules` is `z.any()`; verified against schemastery 3.18.4 that `z.any()`
 * has `.volatile()` and that its `toJSON()` round-trips through the volatile
 * form projection, so it carries the marker like every other field.
 *
 * @param z - the schemastery module.
 * @param volatile - mark every field `.volatile()`.
 * @returns the object schema.
 */
function makeSchema(z, volatile) {
  /** Apply the volatile marker where the schema type supports it. */
  const mark = (schema) => (volatile && typeof schema.volatile === 'function' ? schema.volatile() : schema)
  return z.object({
    sourceUrl: mark(z.string().default(DEFAULT_SOURCE_URL)),
    promoFeedUrl: mark(z.string().default(DEFAULT_PROMO_URL)),
    ttlMinutes: mark(z.number().default(Math.round(DEFAULT_TTL_MS / 60_000))),
    sessionWindowDays: mark(z.number().default(30)),
    tagRules: mark(z.any()),
  })
}

/**
 * The two schemas, built once. Absent when schemastery does not resolve — a bare
 * development checkout without the peer still composes, with the composition
 * entry as the only configuration source.
 *
 * @returns `{ settings, config }`: the plain schema the imperative 0.1.5 path
 *   registers, and the volatile one the loader exposes as this row's `Config`.
 */
async function buildSchemas() {
  try {
    const { default: z } = await import('@deepseek-ai/schemastery')
    return { settings: makeSchema(z, false), config: makeSchema(z, true) }
  } catch {
    return { settings: undefined, config: undefined }
  }
}

/**
 * The row's Config schema, which the loader applies to `config` before `apply`.
 *
 * DSH 0.1.7 dropped `ctx.settings.installSection` and made a plugin's settings
 * section the Config of its own Loader row: the loader validates the row's
 * configuration against this export, and the settings service projects it into a
 * form the Plugins page renders. Without it a row has no schema, so the settings
 * service has no section for it and every user override is rejected — the plugin
 * silently keeps the composition entry's values.
 *
 * 0.1.5 has no such convention, so `apply` below still registers the same fields
 * imperatively and both versions stay configured. Cordis treats a missing Config
 * as "no schema", so the peer-less checkout composes exactly as it did before.
 */
const SCHEMAS = await buildSchemas()

/** The volatile schema the loader exposes as this row's Config. */
export const Config = SCHEMAS.config

export const name = PLUGIN_ID
export const inject = []

/**
 * Read one resolved config field.
 *
 * DSH 0.1.7 hands a volatile field over as a live accessor rather than a value.
 * Reading that accessor as a scalar yields the accessor object itself, which
 * then looks like an absent field, so every row silently falls back to the
 * schema defaults and the user's own configuration never reaches the catalog —
 * which is exactly what happened to this plugin before the unwrapping was added.
 * 0.1.5 hands over plain values, so this is a no-op there. Reading through the
 * accessor on every call is also what makes a settings edit reach the next
 * catalog build without a restart.
 *
 * @param value - one field of the loader-resolved config.
 * @returns the current value behind it.
 */
function readField(value) {
  return value !== null && typeof value === 'object' && typeof value.get === 'function' ? value.get() : value
}

/** Project a whole resolved config through {@link readField}. */
function readConfig(config) {
  if (config === null || typeof config !== 'object') return {}
  return Object.fromEntries(Object.entries(config).map(([key, value]) => [key, readField(value)]))
}

/**
 * Coerce a raw config object (composition entry or resolved settings section)
 * into the effective values the catalog pipeline consumes.
 *
 * Every field is read through {@link readConfig} first, so the same function
 * serves the 0.1.7 loader (live accessors), the 0.1.5 settings section (plain
 * values) and the composition entry.
 */
function normalizeSettings(input = {}) {
  const raw = readConfig(input)
  return {
    sourceUrl: typeof raw.sourceUrl === 'string' && raw.sourceUrl ? raw.sourceUrl : DEFAULT_SOURCE_URL,
    ttlMs: Number.isFinite(raw.ttlMinutes) && raw.ttlMinutes > 0 ? raw.ttlMinutes * 60_000 : DEFAULT_TTL_MS,
    tagRules: raw.tagRules,
    promoFeedUrl:
      typeof raw.promoFeedUrl === 'string' ? raw.promoFeedUrl : DEFAULT_PROMO_URL,
    sessionWindowDays: Number.isFinite(raw.sessionWindowDays) && raw.sessionWindowDays > 0 ? raw.sessionWindowDays : 30,
  }
}

/**
 * Plugin entry. Reads optional config, wires the catalog cache, and registers the
 * routes through DSH's webServer seam.
 *
 * Live configuration: on 0.1.7 the loader validates the row against {@link Config}
 * and hands the volatile fields over as live accessors, so `config` is re-read on
 * every catalog build and a settings edit needs no restart. On 0.1.5 the section
 * is registered imperatively below and `setSource` supplies the same freshness.
 * Catalog-affecting fields trigger a rebuild on the next request; the TTL applies
 * immediately. Without a settings service (or schemastery in a bare dev
 * environment) the composition entry stays authoritative.
 *
 * @param ctx - Host cordis context.
 * @param config - the row's config, already resolved by the loader against
 *   {@link Config} (`ttlMinutes`, `sourceUrl`, `tagRules`, …); volatile fields
 *   arrive as accessors and are read through {@link readConfig}.
 */
export async function apply(ctx, config = {}) {
  /**
   * Effective configuration, read fresh on every use so a live settings edit
   * applies without a restart. On 0.1.7 the loader commits a volatile-only edit
   * by writing into the accessors it already handed over — `apply` is not re-run
   * — so caching a normalized snapshot here would freeze the first values. On
   * 0.1.5 the registration below swaps in the section's own source.
   */
  let effective = () => normalizeSettings(config)
  /** Key of the catalog-affecting fields a snapshot was built from. */
  const catalogKey = (s) => JSON.stringify({ sourceUrl: s.sourceUrl, tagRules: s.tagRules ?? null, promoFeedUrl: s.promoFeedUrl })
  let builtKey = catalogKey(effective())

  /** @type {{ payload: object, etag: string, fetchedAt: number, fromCache: boolean } | null} */
  let snapshot = null
  let inflight = null

  // DSH 0.1.5 registers the section imperatively; 0.1.7 replaced that seam (a
  // plugin's settings section is now its own Loader row's Config, which the
  // loader already applied to `config` above), so the missing method is the
  // signal to stop. Uses the PLAIN schema: a volatile one validates to an
  // accessor object, which the imperative path resolves as a bare
  // `schema(config)` document and would break.
  ctx.inject(['settings'], (c) => {
    if (typeof c.settings?.installSection !== 'function') return
    if (SCHEMAS.settings === undefined) return
    try {
      let source = () => config
      effective = () => normalizeSettings(source())
      c.settings.installSection(ctx, SETTINGS_NAMESPACE, SCHEMAS.settings, config, {
        setSource: (next) => {
          source = next
        },
        onChange: () => {
          if (catalogKey(effective()) !== builtKey) snapshot = null // forces a rebuild on the next request
        },
      })
    } catch {
      // The composition entry stays authoritative and every other surface keeps
      // working — a settings registration must never take the catalog down.
    }
  })

  async function build() {
    const live = effective()
    // The catalog is required; the promotion feed is best-effort (fetchPromoFeed
    // never throws). They are independent, so they load concurrently.
    const [doc, promos] = await Promise.all([
      fetchModelsDev(live.sourceUrl),
      fetchPromoFeed(live.promoFeedUrl),
    ])
    const { rows, stats } = pruneModelsDev(doc, live.tagRules)
    const pi = await loadPiAiCatalog()
    mergePiAi(rows, pi)
    annotateComparisons(rows)
    const promoResult = attachPromos(rows, promos)
    stats.promotions = promoResult.matched
    builtKey = catalogKey(live)
    const payload = {
      generatedAt: new Date().toISOString(),
      ttlSeconds: Math.round(live.ttlMs / 1000),
      source: { name: 'models.dev', url: live.sourceUrl },
      promotions: { source: live.promoFeedUrl || null, count: stats.promotions, providerOffers: promoResult.providerOffers },
      stats,
      providers: { configured: configuredProviders() },
      rows,
    }
    return { payload, etag: etagOf(payload), fetchedAt: Date.now(), fromCache: false }
  }

  /**
   * Providers the user has actually configured for this harness, read from DSH's
   * `llm` service when present. Powers the client's "Only mine" view (A5); an
   * empty list simply means "no providers highlighted" in a headless composition.
   */
  function configuredProviders() {
    try {
      return (ctx.llm?.listProviders?.() ?? []).map((p) => p.id).filter(Boolean)
    } catch {
      return []
    }
  }

  function stale() {
    return snapshot === null || Date.now() - snapshot.fetchedAt > effective().ttlMs
  }

  /** Disk cache location: under DSH_HOME when set, else `~/.dsh`, else temp. */
  function cacheFile() {
    const base = process.env.DSH_HOME || join(homedir(), '.dsh')
    return join(base, 'plugin-storage', PLUGIN_ID, 'catalog.json')
  }

  /** Last good snapshot survives restarts so an offline start serves real data. */
  function persist(snap) {
    try {
      const file = cacheFile()
      mkdirSync(join(file, '..'), { recursive: true })
      writeFileSync(file, JSON.stringify({ savedAt: snap.fetchedAt, payload: snap.payload }))
    } catch (error) {
      ctx.logger?.debug?.(`${PLUGIN_ID}: cache write skipped: ${String(error?.message ?? error)}`)
    }
  }

  function loadPersisted() {
    try {
      const raw = readFileSync(cacheFile(), 'utf8')
      const { savedAt, payload } = JSON.parse(raw)
      if (!payload || !Array.isArray(payload.rows)) return null
      const fetchedAt = Number(savedAt) || 0
      return { payload, etag: etagOf(payload), fetchedAt, fromCache: true }
    } catch {
      return null
    }
  }

  async function current(force) {
    if (!force && !stale() && snapshot) return snapshot
    if (inflight) return inflight
    inflight = build()
      .then((next) => {
        snapshot = next
        persist(next)
        return next
      })
      .catch((error) => {
        ctx.logger?.warn?.(`${PLUGIN_ID}: catalog refresh failed: ${String(error?.message ?? error)}`)
        if (snapshot) return { ...snapshot, fromCache: true } // serve last good (memory)
        const persisted = loadPersisted() // cold start, offline: serve disk cache
        if (persisted) {
          snapshot = persisted
          return persisted
        }
        throw error
      })
      .finally(() => {
        inflight = null
      })
    return inflight
  }

  /** Memoized gzip per etag: the catalog is refreshed rarely but read per load. */
  const gzipCache = { etag: null, buf: null }
  function sendJson(res, status, body, etag, req) {
    const headers = { 'content-type': 'application/json; charset=utf-8' }
    if (etag) headers.etag = etag
    const wantsGzip = /\bgzip\b/.test(String(req?.headers?.['accept-encoding'] ?? ''))
    if (wantsGzip && body && body.length > 1024) {
      if (gzipCache.etag !== etag) {
        gzipCache.etag = etag
        gzipCache.buf = gzipSync(Buffer.from(body))
      }
      headers['content-encoding'] = 'gzip'
      headers['vary'] = 'accept-encoding'
      res.writeHead(status, headers)
      res.end(status === 304 ? '' : gzipCache.buf)
      return
    }
    res.writeHead(status, headers)
    res.end(body)
  }

  function register(c) {
    const webServer = c.webServer
    if (!webServer?.register) return
    const disposeSnapshot = webServer.register({
      kind: 'exact',
      path: ROUTE_SNAPSHOT,
      handler: async (req, res) => {
        try {
          const snap = await current(false)
          if (req.headers['if-none-match'] === snap.etag) return sendJson(res, 304, '', snap.etag, req)
          sendJson(res, 200, JSON.stringify({ ...snap.payload, fromCache: snap.fromCache }), snap.etag, req)
        } catch (error) {
          sendJson(res, 503, JSON.stringify({ error: 'catalog_unavailable', detail: String(error?.message ?? error) }), undefined, req)
        }
      },
    })
    const disposeRefresh = webServer.register({
      kind: 'exact',
      path: ROUTE_REFRESH,
      handler: async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, JSON.stringify({ error: 'method_not_allowed' }))
        try {
          const snap = await current(true)
          sendJson(res, 200, JSON.stringify(snap.payload), snap.etag)
        } catch (error) {
          sendJson(res, 502, JSON.stringify({ error: 'refresh_failed', detail: String(error?.message ?? error) }))
        }
      },
    })
    // Session-cost estimation: local logs, catalog prices, 60-second cache.
    // Deliberately its own route — the payload is big, the panel is optional.
    let sessionsCache = null
    const disposeSessions = webServer.register({
      kind: 'exact',
      path: ROUTE_SESSIONS,
      handler: async (req, res) => {
        try {
          const window = effective().sessionWindowDays
          if (!sessionsCache || sessionsCache.window !== window || Date.now() - sessionsCache.at > 60_000) {
            const snap = await current(false)
            sessionsCache = {
              at: Date.now(),
              window,
              data: summarizeSessions(snap.payload.rows, sessionsRoot(), canonicalModelId, { windowDays: window }),
            }
          }
          sendJson(res, 200, JSON.stringify(sessionsCache.data), undefined, req)
        } catch (error) {
          sendJson(res, 503, JSON.stringify({ error: 'sessions_unavailable', detail: String(error?.message ?? error) }), undefined, req)
        }
      },
    })
    c.effect(() => () => {
      disposeSnapshot?.()
      disposeRefresh?.()
      disposeSessions?.()
    })
  }

  // Register only once webServer is mounted in this composition; in headless/SDK
  // compositions the injected fiber simply waits and never fires.
  ctx.inject(['webServer'], register)

  // MVP DoD #3: provider-topology changes re-evaluate the "Only mine" view. The
  // catalog itself is unaffected; only the configured-providers stamp is rebuilt,
  // which changes the payload (and its etag), so clients refetch on demand.
  ctx.inject(['llm'], (c) => {
    const off = c.on('llm/adapters-updated', () => {
      if (!snapshot) return
      const payload = { ...snapshot.payload, providers: { ...snapshot.payload.providers, configured: configuredProviders() } }
      snapshot = { ...snapshot, payload, etag: etagOf(payload) }
    })
    return () => off?.()
  })

  // Warm the cache off the activation path; never fatal.
  ctx.effect(() => {
    const timer = setTimeout(() => void current(false).catch(() => {}), 1500)
    return () => clearTimeout(timer)
  })

  ctx.logger?.info?.(`${PLUGIN_ID}: host half mounted`)
}
