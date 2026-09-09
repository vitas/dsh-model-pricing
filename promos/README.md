# Promotion data

One JSON file per provider, named after the **catalog provider id** used by
models.dev (case-insensitive matching), containing an array of records:

```json
{
  "model": "glm-5.2",
  "promo": "GLM Coding Lite - 50% first month",
  "discountPct": 50,
  "until": "2026-10-01",
  "url": "https://z.ai/promotion-page",
  "verifiedAt": "2026-09-01",
  "by": "your-github-handle"
}
```

Rules (enforced by CI, see `scripts/validate-promos.mjs`):

- `model`, `promo`, `until`, `verifiedAt`, `by` are required; dates are `YYYY-MM-DD`.
- Exactly one of `discountPct` (1–90) or `fixedCost`
  (`{ "input": 0.5, "output": 1.5 }` per 1M tokens, USD).
- `until` must be in the future when the pull request is opened.
- `verifiedAt` is the day you confirmed the offer on the provider's own page —
  attach a screenshot in the PR description when the page requires a login.
- No duplicate (provider, model, promo) records.

Files starting with `_` are examples and are never compiled into the feed.
On merge, CI regenerates the published feed; expired records are dropped by the
compiler and hidden by the plugin at render time regardless.

## Records without `model`

A record may omit `model`. It then describes a **whole-provider** offer and is
shown on the provider's card in the Models settings page — including for
gateways that have no rows in the pricing catalog at all (the feed, not the
catalog, defines the provider's offers).

## Promotions without a published end date

Providers often say "limited-time" without announcing when it ends. The schema
requires `until` regardless. Set it to the date **you will re-verify by** (a
review horizon, e.g. 30 days out), and say so in the `promo` text ("end not
announced"). An expired record disappears from the UI automatically; it can be
re-verified and re-submitted with a fresh date, so the feed can only advertise
promotions that someone vouched for recently.
