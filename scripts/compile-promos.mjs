#!/usr/bin/env node
/**
 * Compile the promotion feed (runs in CI after validation, and locally via
 * `npm run compile-promos`).
 *
 * Reads every `promos/<provider>.json` (skipping `_example` files), drops records
 * whose `until` has passed, normalizes the provider id from the filename, and
 * writes `promo-dist/index.json`. The plugin fetches only the compiled feed, so
 * the repository layout can evolve without breaking clients.
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = fileURLToPath(new URL('../promos', import.meta.url))
const OUT = fileURLToPath(new URL('../promo-dist', import.meta.url))

const now = Date.now()
let files = 0
const promos = []

if (existsSync(DIR)) {
  for (const file of readdirSync(DIR).sort()) {
    if (!file.endsWith('.json') || file.startsWith('_')) continue
    files++
    const provider = file.replace(/\.json$/, '')
    for (const entry of JSON.parse(readFileSync(join(DIR, file), 'utf8'))) {
      if (Date.parse(entry.until) <= now) continue // defensive: CI validated, time may still move
      promos.push({ provider, ...entry })
    }
  }
}

const index = { generatedAt: new Date().toISOString(), count: promos.length, promos }
mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2) + '\n')
console.log(`promo-dist/index.json: ${files} file(s), ${promos.length} active record(s)`)
