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
