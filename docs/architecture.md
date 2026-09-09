# Architecture — dsh-model-pricing

Status: draft v0.1. Feature decisions (Q1–Q4) from
[feature-map.md](feature-map.md) are reflected here. UI details live in
[design.md](design.md).

## 1. Deployment model

There is no server operated by this project. The plugin has two halves, both running on
the user's machine:

- **Host half:** a Node module inside the user's `dsh` process. It fetches public data
  sources, caches and merges them, and serves a local HTTP route on the same port the
  web GUI already listens on.
- **Browser half:** a client plugin bundle served by DSH's own module system; it
  renders the pricing UI into the Models settings page.

Outbound network traffic consists of anonymous `GET` requests to public sources
(`models.dev`, optionally `openrouter.ai`, and the promotion feed served as static
files from this repository through `raw.githubusercontent.com`). No credentials are
sent anywhere by the plugin; no telemetry is produced.

## 2. Host-to-client transport (decision Q1)

Chosen design: **a named HTTP route on the Host half, with an embedded build-time
snapshot as fallback.** Three alternatives were considered and rejected:

- **Browser fetches models.dev directly.** CORS allows it, but every browser would
  download ~4.5 MB, caching would not survive reloads or multiple windows, the host's
  system proxy settings would not apply, and the later `/pricing` command (Epic D)
  needs the same data on the Node side anyway.
- **A typed Remote API (`@Remote` namespaces).** This is DSH's canonical mechanism, but
  it depends on repository-internal code generation for client declarations and codecs,
  which is not published for out-of-tree packages. Revisit when available.
- **Settings-payload tricks.** Rejected as unidiomatic.

The route registry itself was verified in a spike (see `spike/RESULTS.md`): an
out-of-tree plugin can register `GET /model-pricing/snapshot` on a running DSH web
server; the plugin's other routes coexist with DSH's own (`/api`, `/plugins`, the SPA
fallback) because matching is exact-first and registration failures throw on collision.

```
 models.dev ──GET──┐                       HOST (user's dsh process)
 pi-ai catalog ────┤   PricingCatalog service: validate → merge → prune
 (imported)        ├──→ TTL cache (memory + plugin storage file)
                   │           │
                   │           ▼
        GET /model-pricing/snapshot   (ETag, gzip, Cache-Control)
                   │
        same-origin fetch from the browser half
                   │
        on 404 / error → embedded data/snapshot.json (ships in npm package)
        promotions     → raw.githubusercontent.com feed (fetched directly; CORS *)
```

## 3. Repository layout

```
dsh-model-pricing/
├── src/
│   ├── index.ts              # apply(ctx): settings section, catalog service, route
│   ├── config.ts             # schema for the model-pricing settings section
│   ├── catalog/
│   │   ├── sources.ts        # SnapshotSource interface: models.dev fetch (+ extras)
│   │   ├── merge.ts          # merge with pi-ai catalog; source stamps; divergence
│   │   ├── prune.ts          # reduce to UI fields; provider allowlist support
│   │   └── cache.ts          # TTL, persistence, invalidation
│   ├── tags.ts               # tag-rule engine (defaults + user rules from settings)
│   └── client/
│       ├── index.tsx         # apply(): slot registrations (footer, provider-card)
│       ├── PricingSection.tsx / PricingTable.tsx / FilterBar.tsx / Badges.tsx
│       ├── store.ts          # client-side store: snapshot, filters, refresh state
│       ├── snapshot-data.ts  # imports embedded data/snapshot.json (fallback)
│       └── locales.ts        # label dictionaries (en, ru)
├── data/snapshot.json        # build-time artifact, shipped in the npm package
├── promos/<provider>.json    # curated promotion sources (pull-request land)
├── promo-dist/index.json     # CI-compiled feed consumed by the plugin
├── scripts/build-snapshot.ts # catalog fetch/merge/prune generator
├── spike/                    # platform-validation evidence (see spike/RESULTS.md)
└── package.json              # exports "." and "./client"; dsh.client declaration
```

Naming: one plugin — the npm package name (`dsh-model-pricing`), the settings
namespace (`model-pricing`), route prefix (`/model-pricing/`), storage key, and locale
namespace all align.

## 4. Data model

### 4.1 Table row

```ts
interface PricingRow {
  provider: string; providerName: string;      // catalog id and display name
  modelId: string; name: string; description?: string;
  family?: string;                             // cross-provider comparison key (B1)
  cost: {
    input: number; output: number;             // USD per 1M tokens
    cacheRead?: number; cacheWrite?: number;
    tiers?: { inputTokensAbove: number; input: number; output: number }[];
  };
  context?: number; maxOutput?: number;        // tokens
  caps: {
    reasoning: boolean; toolCall: boolean; structuredOutput: boolean;
    attachment: boolean; openWeights: boolean;
    inputModalities: ('text' | 'image' | 'audio' | 'video')[];
  };
  tags: string[];                              // computed by the host tag engine (A3)
  sources: {
    origin: 'models.dev' | 'pi-catalog' | 'override';
    updated?: string;                          // ISO date from the source
    divergent?: boolean;                       // >10% disagreement between sources
  }[];
  status?: string;                             // catalog status (e.g. deprecated)
}
```

The Host serves `{ generatedAt, ttl, rows }` containing only enabled sources, pruned to
the fields above. Estimated pruned size: 0.8–1.2 MB uncompressed, 40–60 KB gzipped;
the embedded fallback is further limited to the pi-ai catalog plus a curated top list
(~300 KB uncompressed).

### 4.2 Source merge policy

1. For any (provider, model) pair present in the local pi-ai catalog — i.e. a route the
   user can actually invoke — the pi-ai price wins: it is the price the request will be
   billed from.
2. Everything else comes from models.dev.
3. Matching pairs whose prices differ by more than 10% are flagged `divergent`; the UI
   shows both values.
4. Entries with non-default `status` and disabled sources are filtered before merging.

### 4.3 Promotion feed (B3)

Source files in this repository, `promos/<provider>.json`:

```jsonc
[
  {
    "model": "glm-5.2",                 // catalog model id
    "promo": "GLM Coding Lite - 50% first month",
    "discountPct": 50,                 // or fixedCost for absolute prices
    "until": "2026-10-01",             // required, ISO date
    "url": "https://example.com/promo",
    "verifiedAt": "2026-09-01",         // required
    "by": "github-handle"               // attribution
  }
]
```

Contribution flow: a user opens a pull request changing `promos/**`. CI validates
schema, required fields, future `until`, and duplicate (provider, model, promo) keys.
On merge to `main`, CI compiles the active entries into `promo-dist/index.json`, which
is what the plugin fetches (default URL points at this repository; configurable in
settings). Independently, the plugin hides any record whose `until` has passed, so a
missed CI run cannot display an expired offer.

### 4.4 Tag rules (A3, configurable)

```ts
interface TagRule { tag: string; when: Predicate; }
type Predicate =
  | { field: 'toolCall' | 'reasoning' | 'structuredOutput' | 'openWeights' | 'attachment'; equals: boolean }
  | { field: 'context' | 'maxOutput'; gte: number }
  | { field: 'description'; contains: string[] }     // case-insensitive substring
  | { field: 'inputModalities'; includes: string }
  | { all: Predicate[] } | { any: Predicate[] };
```

Default rules ship with the package and implement the mapping in A3. Settings offer
`tagRules.extend` (add rules) and `tagRules.override` (replace the list). v1 edits the
JSON through the settings card; no rule-builder UI is planned.

## 5. Components and contracts

### 5.1 `PricingCatalog` (Host service)

- Required dependencies: `settings`. Optional: `webServer`, `llm` — accessed through
  runtime capability checks so the plugin also loads in profiles without a web server
  (headless/SDK), where only the embedded-snapshot consumers and Epic D exist.
- A `SnapshotSource` interface (`fetch(): Promise<PricingRow[]>`) isolates each input
  (models.dev today; OpenRouter optional later).
- Caching: memory plus a JSON file under the plugin's storage directory. TTL default 6
  hours; invalidation on TTL expiry, on settings change, and on force refresh.
- Catalog work is lazy: nothing is fetched or parsed until the first client request or
  explicit refresh.

### 5.2 Routes

- `GET /model-pricing/snapshot` → `{ generatedAt, ttl, rows }` with `ETag` (hash of the
  snapshot) and `Cache-Control: private, max-age=TTL`; conditional requests answer 304;
  `?fresh=1` forces a source refresh first.
- `POST /model-pricing/refresh` → invalidates the cache (used by the Refresh button).
- Both routes are `exact`; the plugin never claims prefixes beyond `/model-pricing/`
  behavior reserved for future rows.

### 5.3 Client half

- Registers into `settings.models.footer` and `settings.models.provider-card` via
  `ctx.slots.inject(...)`; the provider-card registration keys on each provider's
  settings namespace and receives the card's provider view, configured state, and
  API-key state from the slot's owner props.
- Fetches the snapshot route same-origin; on failure uses the embedded snapshot and
  labels the state. Data lives in one client store shared by the table and the card
  badges.
- Refreshes on forwarded events already used by the Models page (adapter topology and
  settings updates) to keep the "Only mine" view correct.
- Localization through `ctx.locale` with English and Russian dictionaries.

## 6. Build and CI

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `build-snapshot.yml` | release and weekly schedule | regenerate `data/snapshot.json` (fetch, merge, prune), upload as release asset, open a diff PR for review |
| `validate-promos.yml` | pull requests touching `promos/**` | schema and expiry validation, duplicate detection |
| `publish-promos.yml` | push to `main` | compile `promo-dist/index.json` |
| `test.yml` | every PR | unit tests, type checking of both halves |

The weekly snapshot regeneration keeps the offline fallback reasonably fresh between
releases.

## 7. Installation and development workflow

```sh
dsh plugin --profile web add dsh-model-pricing   # end users
```

Spike findings that shape this workflow (`spike/RESULTS.md`):

- `dsh plugin add` installs the dependency; a package is only activated as a profile
  layer when it declares a `dsh.bundle` manifest field, otherwise it must be mounted
  through the profile patch file (`cordis.patch.yml`).
- Mounting by package name works at server start; applying it to a long-running
  instance requires a restart. Mounting by absolute file path works for live
  development, but edited code is cached per module URL — during development use fresh
  file names or restart.
- Practical development loop: `cordis.patch.yml` insert of the built host entry by
  path for UI iteration, with the browser half hot-reloaded by DSH's HMR when a
  rebuild watcher is running; restart for package-name mounts.

## 8. Test strategy

- Pure logic is tested first: merge policy (pi-ai precedence, divergence flags),
  pruning, TTL/cache behavior, tag engine (defaults, extend, override), promotion-feed
  parsing (schema, expiry, duplicates).
- Host routes: exercised against the web-server route table (200/304/ETag, `fresh=1`,
  graceful absence of `webServer` in a composition without one).
- Client half: component smoke tests against DSH's published test doubles for the
  client runtime (Remote and slots), plus golden markup for loading, offline, and
  error states.
- A fixed models.dev fixture protects against upstream schema drift.
- Manual acceptance against the MVP definition of done on a real web profile.

## 9. Milestones

| Milestone | Adds |
|-----------|------|
| **M1 = v0.1 (Epics A + E)** — done, released 2026-09-09 | everything described above |
| **M2 (B1 + C)** — in progress | family grouping in the merged snapshot, blended price (A6) on rows, promotion column, provider-card badges |
| **M3 (B3 UI polish + D)** | `/pricing` popup (reuses the same store), session-cost estimate: token measurement lives on the Host, so the first version either posts the measured totals to a small host route or moves to a typed Remote if DSH publishes out-of-tree code generation by then |

## 10. Architectural risks

- **The client bundle format ("lazy-CJS factory") is only specified by DSH's own build
  presets, not by public documentation.** Mitigated by a working reference artifact on
  disk and confirmed by spike S1; remains the highest platform risk for future DSH
  versions — pin tested DSH versions in release notes.
- models.dev has no service-level agreement: parse defensively, degrade one step at a
  time (cache → embedded), always display source and age.
- Route collisions with other plugins fail loudly at registration — acceptable:
  configuration errors should be visible.
- Large first snapshot parse cost on the Host (multi-MB JSON): lazy, once per TTL, off
  the activation path.
