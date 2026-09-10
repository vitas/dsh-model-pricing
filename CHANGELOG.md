# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
semantic versioning.

## [Unreleased]

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
