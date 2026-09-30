# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
semantic versioning.

## [0.6.1] - 2026-09-30

The settings form is now on the plugin's own page, the way the shipped plugins do
it: opening Plugins → `dsh-model-pricing` shows the fields immediately, instead of
one click further in behind a **Configure** control that nothing in the list
announced.

### Changed

- Register the form in `plugins.bundle.config`, keyed by package name, the slot
  the plugin manager draws inline on the package page. `plugins.row.config` is
  kept alongside it, so DSH 0.1.7 — which knows only that slot — still gets a
  form rather than none.

## [0.6.0] - 2026-09-30

Supports both settings models: DSH 0.1.7 and 0.2.0 (Plugins row pages) and DSH
0.1.5 (the `model-pricing` page under Settings). No configuration change is
needed on any version — the same `cordis.patch.yml` entry keeps working.

### Added

- Row-configuration page for DSH 0.1.7+, which replaced `settings.plugin.item`
  with the keyed `plugins.row.config` slot. A row's own `Config` is its settings
  section there, so the form is registered against
  `dsh-model-pricing#dsh-model-pricing`.
- `src/shared/config.mjs` — the single place both halves read the package name,
  row id, and settings namespaces from, so the host and the browser cannot
  disagree about which entry they own.
- Optional `heading` prop on the settings card: the 0.1.7+ row page draws the
  title and crumb around the form itself, so the card drops its own there.

### Fixed

- **DSH 0.1.7+: the configuration card is reachable again.** The entry was
  missing from the Plugins page entirely — no Configure control and no namespace
  — because it is the *volatile* part of a `Config` schema that 0.1.7 projects a
  form from. Every field is now marked `.volatile()`, which is inert on 0.1.5,
  whose `schemastery` (3.18.2) has no such method.
- **DSH 0.1.7+: the configured source URL, TTL, and tag rules reach the catalog
  again.** 0.1.7 hands each volatile field to `apply` as a live accessor
  (`config.sourceUrl.get()`) rather than a value. Read as a scalar it looks like
  an absent field, so the plugin silently fell back to its constants —
  models.dev and a 6-hour TTL — whatever the patch or the form said.
- **Provider price badges survive the move.** They were registered only inside
  the `settingsScope` path, so on 0.1.7+ they would have disappeared along with
  the section. Both settings models expose the same describe mirror, and the
  badges now read from whichever one is present.

## [0.5.0] - 2026-09-12

### Added
- **Route performance intelligence (Epic D7–D8)**: per-(provider, model) medians of
  time-to-first-token and output speed, reconstructed from local session logs
  (step-windowed, delta-encoded stream timestamps decoded), shown beside the list
  output price in a quadrant table — cheap & fast / cheap & slow / premium & quick /
  overpriced & slow. Routes with fewer than five samples are never labelled;
  medians, not means, so one bad retry cannot poison a route.

## [0.4.0] - 2026-09-11

### Added
- **Cache-leak attribution (Epic D5–D6)**: the session panel now quantifies history
  re-billed at full input price instead of the cached price, split by cause —
  route switches, idle gaps over documented provider cache TTLs, and unattributed
  events (provider eviction, prompt edits). Compaction is never counted as a leak
  (a shrunk context is the user saving money), and providers without a documented
  TTL fold expiry leaks into `other` instead of getting an invented number. Only
  price-resolvable routes contribute. Measured on a real workload: 25% of spend.

## [0.3.0] - 2026-09-11

### Added
- **Session-cost estimation (D1–D3)**: `GET /model-pricing/sessions` replays the
  harness's own zstd session logs (multi-frame), attributes every usage chunk to
  the (provider, model) route active at that step — including mid-session model
  switches — and prices it against the live catalog. Confidence is explicit
  (`routed` / `listed` / `estimated` range / `missing`), promotions price the
  actual cost and report the list-price difference as savings, and the panel
  hides silently when the data is not there. Local files only; labeled an
  estimate, never a bill.
- Session-cost polish: `sessionWindowDays` setting (default 30) bounds which
  sessions are estimated and summed; the panel groups by workspace with per-project
  subtotals and reports the current calendar month (local time) as its own figure,
  so the number tracks how costs are actually felt.

### Fixed
- **Comparison badges no longer go silent when a route is listed at $0.**
  Genuine free-tier listings (Azure, HuggingFace and similar) are now flagged
  `free` and excluded from the comparison baseline; paid routes in the same
  group compare against the cheapest paid route. Before this, any group whose
  winner listed $0 produced no comparison at all — 2,773 of 7,178 rows had no
  actionable badge.
- **"Only mine" can no longer dead-end an empty table.** A configured provider
  id that matches no priced catalog row (local test providers, gateways whose
  catalog key differs) now falls back to showing all providers with a
  explanatory banner instead of silently emptying the section.

### Changed
- **The `cheapest` badge states a catalog claim, not a market fact.** It reads
  "cheapest listed", and when the winning route is less than half the listed
  first-party price for that model family (Anthropic/OpenAI/Google/DeepSeek/
  Moonshot/xAI/Mistral/Zhipu/Qwen/MiniMax anchors), it is rendered with a
  warning tone and ⚠ naming the official reference. The `+N% vs` badges keep
  their percentage (it is true of the catalog) but flag an unverified baseline
  in their tooltip.

## [0.2.0] - 2026-09-09

### Added
- **Plugin settings** (`model-pricing` namespace): refresh interval, catalog
  source URL, promotion-feed URL and tag rules — editable in `settings.yaml` or
  through a card on the Settings → Plugins tab; changes take effect without a
  restart (catalog fields trigger a rebuild, TTL applies to the staleness
  window immediately).
- **Community promotion feed (B3)**: `promos/<provider>.json` records with a
  strict schema (expiry, verification date, attribution; either a percentage
  discount capped at 90 or a fixed per-1M price), CI-validated on every pull
  request and compiled to the `feed` branch on merge. The host attaches active
  promotions to matching rows; expired records never render, feed outages never
  hide prices.
- **Promotion badges** on the pricing table: accent badge with provenance
  tooltip (offer text, expiry, verified-by, link), a "Promotions" filter chip,
  and an active-offers count in the status line.
- **Whole-provider offers**: feed records without a `model` describe a provider
  as a whole and surface both on the provider's card in the Models settings page
  and in a "Current promotions" panel at the top of the pricing table — including
  gateways that are not in the pricing catalog at all. The feed is seeded with
  B.AI's eight documented promotions (API free tiers and discounts, verified
  against the official pricing-notices page, with a re-verification horizon).
- **Provider-card badges** on the Models page: each configured provider's card
  shows its lowest per-1M output price, priced-model count and active-offer
  count, straight from the catalog.
- **Subscription-plan grouping**: coding/token plan providers are collected
  into one group, their nominal $0 per-token prices render as "sub.", and plan
  routes are excluded from cross-provider comparison (they previously won
  "cheapest" for 39 models on a $0 price that is not a per-token rate).
- **Russian language pack**: the harness ships English and Chinese; this plugin
  additionally registers Russian, selected automatically for Russian browsers.
- **Disk cache** under the DSH home: an offline cold start serves the last real
  catalog instead of the reduced built-in snapshot.

### Changed
- The "Only mine" view now follows provider topology live (`llm/adapters-updated`).
- HTTP responses are gzip-compressed (~8× smaller wire payload).

## [0.1.0] - 2026-09-09

### Added
- Initial release: pricing table in Settings → Models for ~7,200 priced models
  across 213 providers (models.dev), per-1M-token prices, context and capability
  tags; authoritative price overlay from the pi-ai catalog with divergence
  flags; automatic cross-provider comparison (cheapest route, +N% vs cheapest);
  embedded offline fallback snapshot; ETag/304 handling.
