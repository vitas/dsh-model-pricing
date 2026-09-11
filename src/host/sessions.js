/**
 * Local session-cost estimation.
 *
 * DSH writes every agent session as a zstd-compressed JSONL log under
 * `<DSH_HOME>/sessions/--<workspace>--/session-<id>/session.jsonl.zstd`. The
 * log carries two facts that hardcoded cost widgets cannot have: a
 * `model/selection` event whenever the model or provider changes, and a
 * per-step `usage` chunk (input / output / cache-read tokens). Replaying one
 * file therefore yields per-(provider, model) token totals for the session —
 * the exact input this plugin's catalog is built to price.
 *
 * Pricing policy (mirrors the table's honesty rules):
 *  - a model+provider pair is resolved against the live catalog rows;
 *  - a route present in the harness's own pi-catalog is treated as
 *    authoritative (`confidence: "routed"`) — that is the price DSH bills;
 *  - an exact provider id match is `"listed"`;
 *  - when only cross-provider listings match, cost is reported as a range
 *    (`"estimated"`) instead of pretending a single number is true.
 * Promotion records price the promo-adjusted cost and report the difference
 * against list as `savedUsd` — the counterfactual the free tier hides.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { normalizeProviderId } from './catalog.js'

/**
 * Decode a zstd buffer that may hold MULTIPLE concatenated frames.
 *
 * DSH appends to session logs as it goes, and each append is written as its
 * own zstd frame (a 190 KB sample file held 846 frames). Node's
 * zstdDecompressSync decodes exactly one frame and returns 179 silent bytes
 * for the rest — so frames are located by their 28B52FFD magic and decoded
 * slice by slice. A false-positive magic hit inside compressed payload costs
 * at most two skipped frames (the per-frame try/catch); with a 1-in-2^32
 * random-match rate over a few megabytes that is the accepted trade for a
 * zero-dependency decoder that never hard-fails on an odd file.
 */
function decompressZstd(buf) {
  const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
  const bounds = []
  for (let i = buf.indexOf(magic); i !== -1; i = buf.indexOf(magic, i + 1)) bounds.push(i)
  if (!bounds.length) return zstdDecompressSync(buf).toString('utf8') // single raw frame or throw
  let out = ''
  for (let k = 0; k < bounds.length; k++) {
    const end = k + 1 < bounds.length ? bounds[k + 1] : buf.length
    try { out += zstdDecompressSync(buf.subarray(bounds[k], end)).toString('utf8') } catch { /* skip undecodable slice */ }
  }
  return out
}

/** Session dirs newer than this count are skipped (mtime order). */
const MAX_SESSIONS = 60

/**
 * Vendor prompt-cache idle TTLs, ms, as documented by each provider (checked
 * 2026-09). Providers without a documented TTL are deliberately absent: their
 * expiry leaks fold into `other` rather than being invented. Values are the
 * conservative reading (Anthropic's 5-minute default, not the paid 1-hour
 * tier) — this figures feed an ESTIMATE badge, never a bill.
 */
const CACHE_TTL_MS = {
  anthropic: 300_000,
  claude: 300_000,
  openai: 600_000,
  google: 300_000,
  gemini: 300_000,
  moonshot: 300_000,
  kimi: 300_000,
}

/** Idle TTL for a configured provider id, or null when undocumented. */
function cacheTtl(provider) {
  const id = normalizeProviderId(provider)
  for (const [key, ms] of Object.entries(CACHE_TTL_MS)) {
    if (id === key || id.startsWith(key)) return ms
  }
  return null
}

/**
 * Sessions root, honoring the harness's own home layout. `DSH_HOME` is set for
 * the web process; the default matches the CLI's storage location.
 */
export function sessionsRoot() {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'sessions')
}

/** Newest session files across all workspace dirs, capped by count. */
function listSessionFiles(root) {
  if (!existsSync(root)) return []
  const found = []
  for (const ws of safeReadDir(root)) {
    if (!ws.startsWith('--')) continue
    for (const dir of safeReadDir(join(root, ws))) {
      if (!dir.startsWith('session-')) continue
      const file = join(root, ws, dir, 'session.jsonl.zstd')
      try {
        if (existsSync(file)) found.push({ file, workspace: ws.slice(2, -2), id: dir, mtime: statSync(file).mtimeMs })
      } catch { /* unreadable dir — skip silently */ }
    }
  }
  return found.sort((a, b) => b.mtime - a.mtime).slice(0, MAX_SESSIONS)
}

function safeReadDir(path) {
  try { return readdirSync(path) } catch { return [] }
}

/**
 * Replay one session log: walk events in order, track the active
 * (provider, model) selection and sum usage per selection.
 * @returns {{ usage: Map<string, {provider: string, model: string, turns: number, input: number, output: number, cacheRead: number}>, turns: number } | null}
 */
function replaySession(text) {
  let current = { provider: 'unknown', model: 'unknown' }
  const usage = new Map()
  const timeline = [] // ordered usage events for cache-leak attribution
  const turns = new Set()
  for (const line of text.split('\n')) {
    if (!line) continue
    let event
    try { event = JSON.parse(line) } catch { continue }
    const data = event.data ?? {}
    // request/context fires per API call and carries the route actually used;
    // model/selection is the UI switch. Both retarget the active route —
    // request/context first when present, since it sits closest to the usage.
    if ((event.type === 'request/context' || event.type === 'model/selection') && data.model) {
      current = { provider: String(data.provider ?? 'unknown'), model: String(data.model) }
      continue
    }
    const chunk = event.type === 'assistant/chunk' ? data.chunk : undefined
    const u = chunk?.usage
    if (!u) continue
    turns.add(data.turn)
    const key = `${current.provider}\u0000${current.model}`
    let bucket = usage.get(key)
    if (!bucket) usage.set(key, (bucket = { provider: current.provider, model: current.model, turns: 0, input: 0, output: 0, cacheRead: 0 }))
    bucket.input += num(u.inputTokens)
    bucket.output += num(u.outputTokens)
    bucket.cacheRead += num(u.cacheReadTokens)
    // reasoningTokens is a subset of outputTokens in this format — never add it.
    timeline.push({
      t: num(event.time),
      provider: current.provider,
      model: current.model,
      input: num(u.inputTokens),
      output: num(u.outputTokens),
      cacheRead: num(u.cacheReadTokens),
    })
  }
  for (const bucket of usage.values()) bucket.turns = turns.size
  return { usage, timeline, turns: turns.size }
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/**
 * Resolve a (provider, model) selection against catalog rows.
 * @param {Array<object>} rows all priced rows (payload rows)
 * @param {(id: string) => string} canonical shared model-id normalizer from the catalog
 */
function resolveRows(rows, canonical, provider, model) {
  const want = canonical(model)
  const candidates = rows.filter((r) => !r.flatPlan && r.modelId && canonical(r.modelId) === want)
  if (!candidates.length) return { kind: 'missing' }
  const provId = normalizeProviderId(provider)
  const exact = candidates.filter((r) => normalizeProviderId(r.provider) === provId || normalizeProviderId(r.providerName) === provId)
  const pool = exact.length ? exact : candidates
  const routed = pool.find((r) => r.sources.some((s) => s.origin === 'pi-catalog'))
  if (routed && !exact.length) return { kind: 'routed', row: routed, candidates: pool.length }
  if (exact.length === 1) return { kind: 'listed', row: exact[0] }
  if (exact.length > 1) return { kind: 'listed', row: cheapest(exact) }
  return { kind: 'estimated', min: cheapest(pool), max: dearest(pool), candidates: pool.length }
}

const priceOf = (row, field) => (typeof row.cost[field] === 'number' ? row.cost[field] : 0)
const usd = (row, b) => (b.input * priceOf(row, 'input') + b.output * priceOf(row, 'output') + b.cacheRead * priceOf(row, 'cacheRead')) / 1e6
const cheapest = (rows) => rows.slice().sort((a, b) => priceOf(a, 'output') - priceOf(b, 'output'))[0]
const dearest = (rows) => rows.slice().sort((a, b) => priceOf(b, 'output') - priceOf(a, 'output'))[0]

/**
 * Attribute cache re-billing to causes. Invariant: the full context of step i
 * is roughly input+cacheRead+output of the same step; growth over the previous
 * step's context is genuinely new content. Anything billed as fresh input
 * beyond that growth is history re-billed at full price — the leak. Cause
 * picks the cheapest explanation: route switch, then documented-TTL expiry,
 * then "other" (compaction, prompt edits, provider-side eviction). Leaks are
 * priced with the SAME join the cost table uses; unresolvable routes drop out
 * rather than borrow a neighbor's price.
 */
function attributeLeaks(timeline, rows, canonical) {
  const out = { ttlUsd: 0, switchUsd: 0, otherUsd: 0, hitRate: null }
  let prev = null
  let inAll = 0
  let cacheAll = 0
  for (const ev of timeline) {
    inAll += ev.input
    cacheAll += ev.cacheRead
    if (prev) {
      const ctxNow = ev.input + ev.cacheRead + ev.output
      const ctxPrev = prev.input + prev.cacheRead + prev.output
      // A shrunk context is a compaction (or fresh start): its input is the new
      // baseline history, not re-billed old tokens — counting it would fine the
      // user for the very action that saves money.
      const grew = Math.max(0, ctxNow - ctxPrev)
      const leakTok = ctxNow < ctxPrev ? 0 : Math.max(0, ev.input - grew)
      const switched = ev.provider !== prev.provider || ev.model !== prev.model
      const gap = ev.t - prev.t
      const ttl = cacheTtl(ev.provider)
      const cause = switched ? 'switch' : ttl && gap > ttl ? 'ttl' : leakTok > 0 ? 'other' : null
      if (cause && leakTok > 0) {
        const res = resolveRows(rows, canonical, ev.provider, ev.model)
        const row = res.kind === 'listed' || res.kind === 'routed' ? res.row : null
        if (row) {
          const premium = (priceOf(row, 'input') - priceOf(row, 'cacheRead')) / 1e6
          const usdLeak = leakTok * premium
          if (premium > 0 && usdLeak > 0.000001) out[cause === 'switch' ? 'switchUsd' : cause === 'ttl' ? 'ttlUsd' : 'otherUsd'] += usdLeak
        }
      }
    }
    prev = ev
  }
  const total = inAll + cacheAll
  out.hitRate = total > 0 ? cacheAll / total : null
  out.ttlUsd = round(out.ttlUsd)
  out.switchUsd = round(out.switchUsd)
  out.otherUsd = round(out.otherUsd)
  return out
}

/** Promo-adjusted cost: free tiers and percentage discounts, vs the list price. */
function withPromo(row, listCost) {
  const promo = row.promo
  if (!promo) return { cost: listCost, saved: 0 }
  const allFree = promo.fixedCost && ['input', 'output', 'cacheRead'].every((k) => promo.fixedCost[k] === 0)
  const factor = promo.discountPct ? (100 - promo.discountPct) / 100 : 1
  const cost = allFree ? 0 : listCost * factor
  return { cost, saved: Math.max(0, listCost - cost) }
}

/**
 * Build the session-cost summary.
 * @param {Array<object>} rows catalog rows from the current snapshot payload
 * @param {string} root sessions directory (injectable for tests)
 * @param {(id: string) => string} canonical model-id normalizer from catalog.js
 */
export function summarizeSessions(rows, root = sessionsRoot(), canonical, opts = {}) {
  const perModel = new Map() // "provider|model" -> aggregates
  const sessions = []
  // Calendar bounds: the window drops stale sessions entirely; "this month" is
  // a reporting slice inside whatever the window kept. Local time on purpose —
  // budgets are felt in the user's timezone, not UTC.
  const now = Date.now()
  const windowDays = Number.isFinite(opts.windowDays) && opts.windowDays > 0 ? opts.windowDays : null
  const cutoff = windowDays ? now - windowDays * 86_400_000 : -Infinity
  const d0 = new Date(now)
  const monthStart = new Date(d0.getFullYear(), d0.getMonth(), 1).getTime()
  const files = listSessionFiles(root).filter((f) => f.mtime >= cutoff)
  let unreadable = 0
  for (const entry of files) {
    let replay
    try {
      replay = replaySession(decompressZstd(readFileSync(entry.file)))
    } catch {
      unreadable += 1
      continue
    }
    const parts = []
    let listUsd = 0
    let actualUsd = 0
    for (const bucket of replay.usage.values()) {
      const key = `${bucket.provider}\u0000${bucket.model}`
      let agg = perModel.get(key)
      if (!agg) perModel.set(key, (agg = { provider: bucket.provider, model: bucket.model, input: 0, output: 0, cacheRead: 0, turns: 0, sessions: 0 }))
      agg.input += bucket.input
      agg.output += bucket.output
      agg.cacheRead += bucket.cacheRead
      agg.sessions += 1
      const resolution = resolveRows(rows, canonical, bucket.provider, bucket.model)
      const part = { provider: bucket.provider, model: bucket.model, input: bucket.input, output: bucket.output, cacheRead: bucket.cacheRead }
      if (resolution.kind === 'missing') {
        part.confidence = 'missing'
      } else if (resolution.kind === 'estimated') {
        part.confidence = 'estimated'
        part.minUsd = round(usd(resolution.min, bucket))
        part.maxUsd = round(usd(resolution.max, bucket))
        listUsd += part.maxUsd
        actualUsd += part.maxUsd // conservative while unconfirmed
      } else {
        const list = usd(resolution.row, bucket)
        const { cost, saved } = withPromo(resolution.row, list)
        part.confidence = resolution.kind // routed | listed
        part.listUsd = round(list)
        part.actualUsd = round(cost)
        part.savedUsd = round(saved)
        listUsd += list
        actualUsd += cost
      }
      parts.push(part)
    }
    if (!parts.length) continue
    const leaks = attributeLeaks(replay.timeline, rows, canonical)
    sessions.push({
      leaks,
      id: entry.id,
      workspace: entry.workspace,
      updatedAt: new Date(entry.mtime).toISOString(),
      thisMonth: entry.mtime >= monthStart,
      turns: replay.turns,
      models: parts.sort((a, b) => (b.actualUsd ?? b.maxUsd ?? 0) - (a.actualUsd ?? a.maxUsd ?? 0)),
      listUsd: round(listUsd),
      actualUsd: round(actualUsd),
      savedUsd: round(listUsd - actualUsd),
    })
  }
  const totals = sessions.reduce(
    (acc, s) => ({
      list: acc.list + s.listUsd,
      actual: acc.actual + s.actualUsd,
      saved: acc.saved + s.savedUsd,
      month: acc.month + (s.thisMonth ? s.actualUsd : 0),
      ttl: acc.ttl + s.leaks.ttlUsd,
      switch: acc.switch + s.leaks.switchUsd,
      other: acc.other + s.leaks.otherUsd,
    }),
    { list: 0, actual: 0, saved: 0, month: 0, ttl: 0, switch: 0, other: 0 },
  )
  const models = [...perModel.values()]
    .map((m) => {
      const resolution = resolveRows(rows, canonical, m.provider, m.model)
      const out = { provider: m.provider, model: m.model, input: m.input, output: m.output, cacheRead: m.cacheRead, sessions: m.sessions }
      out.confidence = resolution.kind
      if (resolution.kind === 'estimated') {
        // Range only: the configured provider matched no single listing.
        out.minUsd = round(usd(resolution.min, m))
        out.maxUsd = round(usd(resolution.max, m))
      } else if (resolution.kind !== 'missing') {
        const list = usd(resolution.row, m)
        const { cost, saved } = withPromo(resolution.row, list)
        out.listUsd = round(list)
        out.actualUsd = round(cost)
        out.savedUsd = round(saved)
      }
      return out
    })
    .sort((a, b) => (b.actualUsd ?? 0) - (a.actualUsd ?? 0))
  return {
    generatedAt: new Date().toISOString(),
    scanned: files.length,
    sessions: sessions.slice(0, 24),
    models,
    windowDays,
    totals: { listUsd: round(totals.list), actualUsd: round(totals.actual), savedUsd: round(totals.saved), monthUsd: round(totals.month), leakTtlUsd: round(totals.ttl), leakSwitchUsd: round(totals.switch), leakOtherUsd: round(totals.other), sessions: sessions.length, unreadable },
  }
}

const round = (v) => Math.round(v * 1e6) / 1e6
