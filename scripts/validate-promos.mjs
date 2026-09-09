#!/usr/bin/env node
/**
 * Promotion feed validation (CI gate for promos/**).
 *
 * Contract (docs/architecture.md §4.3): `promos/<provider>.json` holds an array of
 * records. `provider` is taken from the filename and must match the catalog
 * provider id; matching is case-insensitive at build time. Files prefixed with
 * `_` are examples, never compiled into the feed.
 *
 * Rules enforced here:
 *  - JSON object array, no unknown top-level keys;
 *  - required: promo, until (ISO date), verifiedAt (ISO date), by;
 *  - optional `model`: with it the record targets one catalog route
 *    (provider+model); without it the record is a whole-provider offer, surfaced
 *    on the provider's card in the Models settings page even when that provider
 *    is absent from the pricing catalog (e.g. a gateway with its own promotions);
 *  - exactly one of discountPct (1..90) or fixedCost (per-1M USD object with
 *    input/output, numbers >= 0); discountPct is capped at 90% because deeper
 *    claims are almost always misread "free"; a genuinely free offer uses
 *    fixedCost {input:0,output:0};
 *  - until must be in the future at validation time (expired rows are dropped by
 *    the compiler anyway, but a PR must not add stale data). When a promotion has
 *    no published end date, contributors set `until` to their own next-verify
 *    date so stale offers stop being advertised;
 *  - no duplicate (provider, model, promo) keys across files.
 *
 * Exits 0 when every file is valid; prints one line per problem otherwise.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = fileURLToPath(new URL('../promos', import.meta.url))
const ALLOWED = new Set(['model', 'promo', 'discountPct', 'fixedCost', 'until', 'url', 'verifiedAt', 'by'])
const problems = []
const seen = new Set()

function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
}

function checkFile(file) {
  const provider = file.replace(/\.json$/, '')
  let doc
  try {
    doc = JSON.parse(readFileSync(join(DIR, file), 'utf8'))
  } catch (error) {
    problems.push(`${file}: not valid JSON (${error.message})`)
    return
  }
  if (!Array.isArray(doc)) return problems.push(`${file}: top level must be an array`)
  doc.forEach((entry, i) => {
    const at = `${file}[${i}]`
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return problems.push(`${at}: must be an object`)
    for (const key of Object.keys(entry)) if (!ALLOWED.has(key)) problems.push(`${at}: unknown key "${key}"`)
    for (const key of ['promo', 'until', 'verifiedAt', 'by']) {
      if (typeof entry[key] !== 'string' || !entry[key].trim()) problems.push(`${at}: "${key}" is required (string)`)
    }
    // model is optional: present => a single catalog route; absent => whole provider.
    if (entry.model !== undefined && (typeof entry.model !== 'string' || !entry.model.trim())) {
      problems.push(`${at}: "model" must be a non-empty string when present`)
    }
    if (entry.url !== undefined && !/^https?:\/\/.+/.test(String(entry.url))) problems.push(`${at}: url must be http(s)`)
    if (!isDate(entry.until)) problems.push(`${at}: until must be YYYY-MM-DD`)
    else if (Date.parse(entry.until) <= Date.now()) problems.push(`${at}: until is in the past — expired offers must not be contributed`)
    if (!isDate(entry.verifiedAt)) problems.push(`${at}: verifiedAt must be YYYY-MM-DD`)
    else if (Date.parse(entry.verifiedAt) > Date.now()) problems.push(`${at}: verifiedAt is in the future`)
    const hasPct = entry.discountPct !== undefined
    const hasFixed = entry.fixedCost !== undefined
    if (hasPct === hasFixed) problems.push(`${at}: exactly one of discountPct or fixedCost is required`)
    if (hasPct) {
      const pct = entry.discountPct
      if (typeof pct !== 'number' || !Number.isFinite(pct) || pct <= 0 || pct > 90) problems.push(`${at}: discountPct must be a number in (0, 90]`)
    }
    if (hasFixed) {
      const fc = entry.fixedCost
      if (typeof fc !== 'object' || fc === null || Array.isArray(fc)) problems.push(`${at}: fixedCost must be an object`)
      else {
        for (const field of ['input', 'output']) {
          if (typeof fc[field] !== 'number' || !Number.isFinite(fc[field]) || fc[field] < 0) problems.push(`${at}: fixedCost.${field} must be a number >= 0`)
        }
        for (const field of Object.keys(fc)) if (!['input', 'output', 'cacheRead', 'cacheWrite'].includes(field)) problems.push(`${at}: fixedCost.${field} is not a known price field`)
      }
    }
    const dupKey = `${provider.toLowerCase()}|${(entry.model ?? '').toLowerCase()}|${String(entry.promo).toLowerCase()}`
    if (seen.has(dupKey)) problems.push(`${at}: duplicate (provider, model, promo) already contributed in another file`)
    seen.add(dupKey)
  })
}

if (!existsSync(DIR)) {
  console.log('promos/: directory missing — nothing to validate')
  process.exit(0)
}
const files = readdirSync(DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'))
for (const file of files) checkFile(file)

if (problems.length) {
  console.error(`promotion feed validation failed (${problems.length} problem(s)):`)
  for (const p of problems) console.error('  - ' + p)
  process.exit(1)
}
console.log(`promos/: ${files.length} file(s), ${seen.size} record(s) valid`)
