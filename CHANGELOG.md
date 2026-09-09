# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
semantic versioning.

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
