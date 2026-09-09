/**
 * Generates the embedded offline fallback: `data/snapshot.json`. Runs in Node,
 * reuses the host's pruning logic so the fallback shape is identical to the live
 * route. Kept small by limiting to the providers with the most priced models; the
 * full catalog is always available through the running host route.
 *
 * Usage: npm run snapshot
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { annotateComparisons, fetchModelsDev, pruneModelsDev } from '../src/host/catalog.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MAX_PROVIDERS = 12
const MAX_MODELS_PER_PROVIDER = 28

const doc = await fetchModelsDev()
const { rows, stats } = pruneModelsDev(doc)
// Annotate on the full catalog first, so cross-provider comparison is correct
// even after the offline subset is trimmed below.
annotateComparisons(rows)

// Keep the largest providers so the offline table still covers mainstream models.
const byProvider = new Map()
for (const r of rows) {
  if (!byProvider.has(r.provider)) byProvider.set(r.provider, [])
  byProvider.get(r.provider).push(r)
}
const top = [...byProvider.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, MAX_PROVIDERS)
// The offline fallback optimizes for size: drop descriptions and tier detail that
// the full host route always carries.
const kept = top.flatMap(([, list]) =>
  list.slice(0, MAX_MODELS_PER_PROVIDER).map((r) => {
    const { description, cost, ...rest } = r
    return { ...rest, cost: { input: cost.input, output: cost.output, cacheRead: cost.cacheRead, cacheWrite: cost.cacheWrite } }
  }),
)

const payload = {
  generatedAt: new Date().toISOString(),
  ttlSeconds: 0,
  source: { name: 'models.dev', url: 'https://models.dev' },
  stats: { providers: top.length, models: stats.models, priced: kept.length },
  providers: { configured: [] },
  rows: kept,
  truncated: true,
}

mkdirSync(resolve(root, 'data'), { recursive: true })
const out = resolve(root, 'data', 'snapshot.json')
writeFileSync(out, JSON.stringify(payload))
console.log(`data/snapshot.json: ${top.length} providers, ${kept.length} rows (${Math.round(JSON.stringify(payload).length / 1024)} KB) from ${stats.priced} priced models total`)
