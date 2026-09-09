# Feature Map — dsh-model-pricing

A DeepSeek Harness (DSH) plugin that shows the prices and strengths of every model you
can connect to DSH, including current discounts and promotions.

Status: draft v0.1 for review. Confirmed MVP scope: **a pricing table on the Models
settings page** (Epic A + infrastructure Epic E). Architecture and UI design are
separate documents: [architecture.md](architecture.md), [design.md](design.md).

## Verified platform facts

All facts below were checked against the installed DSH build (version 0.1.2-rc.1)
and the public [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
documentation on 2026-09-09.

1. `@deepseek-ai/dsh-client-ui-settings-models` (the Models settings page) declares two
   extension slots intended for plugins distributed outside the DSH repository:
   `settings.models.footer` (an ordered list rendered below the provider rows) and
   `settings.models.provider-card` (rendered inside each provider card). Verified in the
   installed bundle.
2. The `@earendil-works/pi-ai` model catalog — already a dependency of DSH's
   `dsh-llm-pi-ai` adapter — contains a `cost` field per model:
   `{ input, output, cacheRead, cacheWrite }` in USD per 1M tokens, plus optional
   `tiers` (price thresholds based on request input size).
3. [`https://models.dev/api.json`](https://models.dev) is a community catalog of 213
   providers. Each model entry includes `description`, `family`, capability booleans
   (`reasoning`, `tool_call`, `structured_output`, `attachment`), `modalities`,
   `open_weights`, `limit.context` / `limit.output`, `cost` fields, and `release_date`.
   The catalog has no promotion or discount fields (verified against every key in the
   schema).
4. The `dsh-token-meter` plugin can measure token usage of a session
   (`ctx.tokenMeter.measure(session)`), priced per route, but does not convert to
   currency anywhere, and no part of the current DSH UI displays model prices.
5. `dsh-host-webserver` exposes a named-route registry: plugins register HTTP routes
   through `ctx.webServer.register({ kind: 'exact' | 'prefix', path, handler })`.
   Confirmed by inspection of installed DSH packages that register routes this way.
6. The HTTP sources `models.dev`, `raw.githubusercontent.com`, and `openrouter.ai`
   all respond with `access-control-allow-origin: *`, so they can be fetched
   directly from the browser when needed. Verified with `curl`.
7. A plugin ships as one npm package with two halves: a Host half (Node, runs inside
   the user's `dsh` process) and a browser half (declared through the `dsh.client`
   field in package.json, served to the page without rebuilding the DSH web app).
   Install path: `dsh plugin --profile web add <package>`.

## 1. Users and scenarios

| # | Scenario | User question |
|---|----------|----------------|
| S1 | Choosing a new provider | "Which model is good for coding agents, and what does it cost?" |
| S2 | Comparing routes | "The same GLM is reachable through three providers — which one is cheapest?" |
| S3 | Looking for deals | "Where is there an active discount or a subscription plan that beats pay-per-token right now?" |
| S4 | Cost awareness | "Roughly what is this session costing me?" |
| S5 | Diagnostics | "Why is this model unusable for me?" — context window, limits, and modalities next to the price |

## 2. Epics and features

Priorities: **P0** = MVP, **P1** = second release, **P2** = later.
Releases: v0.1 = Epics A + E; v0.2 = Epic B (automatic part) + Epic C; v0.3 = Epic B
(curated promotions) + Epic D.

### Epic A — Pricing table on the Models page (P0, except A6)

| ID | Feature | Details |
|----|---------|---------|
| A1 | A "Model pricing" section mounted in the Models page footer | Uses the `settings.models.footer` slot; renders only when the plugin's Host half is mounted, mirroring the page's existing card rules |
| A2 | The table itself | Columns: provider · model · input / output / cache-read price per 1M tokens · context window · capability tags · price source and freshness |
| A3 | Capability tags derived from catalog data | Mapping rules: `tool_call` + `reasoning` → "Agentic"; description mentioning coding/review/IDE → "Coding"; `attachment` + vision modality → "Vision"; `context >= 200k` → "Long context"; `open_weights` → "Open weights"; `structured_output` → "Structured output". Rules are **configurable** (decision Q3): defaults ship inside the package; users add to them (`tagRules.extend`) or replace them (`tagRules.override`) through plugin settings. Rules are data (predicates over catalog fields), not code |
| A4 | Search and filters | Substring search over model id/name/provider; capability-tag chips; grouping by provider; sorting by price columns and context size |
| A5 | "Only mine" / "only connectable" view | Highlights providers already configured in the profile, reusing the page's existing configured/key-configured semantics |
| A6 | Effective price per typical request — **P1** (decision Q4) | A single comparison figure: blended price = `w1*cacheRead + w2*input + w3*output` with configurable default weights reflecting agentic workloads. Not in v0.1: the default sort is by output price (the one column providers agree on); the blended figure arrives together with B1, where a single "cheaper by N%" number is needed |
| A7 | Refresh and fallback behavior | Manual Refresh button plus TTL-based automatic refresh; if the network is unavailable, fall back to the last cached snapshot; if no cache exists, fall back to the embedded build-time snapshot; the UI always labels which source and age the displayed numbers have, and states that prices are estimates, not billing data |
| A8 | Plugin settings | Settings section `model-pricing`: data sources on/off, refresh interval (TTL), promotion feed URL, tag rules, cache on/off |
| A9 | Rendering cost | The full catalog is ~4.5 MB and 213 providers; the browser receives a pruned, paginated projection (see E2) and only expanded groups are in the DOM; the default view shows a curated first screen, not the whole catalog |

### Epic B — Discounts and "where is it cheaper" (P1 automatic, P2 curated)

| ID | Feature | Details |
|----|---------|---------|
| B1 | Automatic cross-provider comparison | Group models that share a `family` across providers; badge each row with `cheapest` and `−N% vs <provider>` using the A6 blended price |
| B2 | Subscription / coding-plan providers as a separate group | The catalog already carries flat-rate plan providers (`zai-coding-plan`, `minimax-coding-plan`, `kimi-for-coding`, `alibaba-coding-plan`, `tencent-coding-plan`, …); show them as a "Flat-rate plans" section with monthly price instead of per-1M prices |
| B3 | Community-curated promotion feed (decision Q2) | Promotion records live in this repository under `promos/<provider>.json` and are contributed through pull requests. A GitHub Actions workflow validates the schema and expiry fields and compiles an aggregated feed at `promo-dist/index.json`; the plugin fetches that feed by default (URL configurable). Without feed data there are no promotion badges |
| B4 | Trust indicators | Every price shows its source and last-verified date; expired promotions are greyed out automatically |
| B5 | Time-of-day discounts | If a provider publishes time-based pricing, show the currently active window; dormant until such data exists in a source we consume |

### Epic C — Badges on provider cards (P1)

| ID | Feature | Details |
|----|---------|---------|
| C1 | `settings.models.provider-card` slot | A compact line inside each provider card: price range across that provider's configured models, "cheapest route" chip, active promotions for that provider |
| C2 | React to editing | The card knows the user's model list; badges reflect the effective list, not the raw catalog |

### Epic D — Commands and session cost (P2)

| ID | Feature | Details |
|----|---------|---------|
| D1 | `/pricing` popup | Price of the current model plus the three closest alternatives by blended price, using the same popup mechanism as `/model` |
| D2 | "This session ≈ $N" | `ctx.tokenMeter.measure(session)` (tokens) multiplied by the route price; shown in the `/pricing` popup and, if a supported extension point exists, in the stats strip (open question Q5) |
| D3 | Projection before compaction | `contextPressure.projectedTokens` times the route price → "the next request ≈ $X" |

### Epic E — Infrastructure (P0)

| ID | Feature | Details |
|----|---------|---------|
| E1 | Host service `PricingCatalog` | Fetches models.dev and merges the local pi-ai catalog; validates the input schema; TTL cache persisted in the plugin's own storage; emits an update event |
| E2 | Host-to-client transport — **decided** (Q1) | The Host half serves `GET /model-pricing/snapshot` through the webServer route registry and prunes the payload to UI-relevant fields; the browser half has an embedded build-time snapshot as fallback. A typed Remote API is deferred until DSH publishes code generation for out-of-tree packages |
| E3 | Browser half | `src/client/` exported as `./client` with a `dsh.client` declaration; renders its own components; no value imports from other client packages (enforced by DSH's bundle-purity rule) |
| E4 | Settings section `model-pricing` | Registered through `settings.installSection`; appears as a card on the Plugins settings tab |
| E5 | Privacy | Exactly one outbound HTTP host is contacted (configurable); a full offline mode uses only the embedded snapshot; no telemetry of any kind |
| E6 | Distribution | npm package; one-command install into the web profile; documented update and uninstall (including cache-file cleanup) |

## 3. Definition of Done for the MVP (Epics A + E)

1. On the Models settings page, below the provider rows, a section displays prices for
   at least three real configured providers plus the catalog's first-screen list, with
   correct input/output/cache numbers.
2. Removing network access does not break the section: the fallback chain (cache →
   embedded snapshot) is in effect and each displayed number labels its source and age.
3. Refresh and the TTL update the data; provider-topology events re-evaluate the
   "Only mine" view.
4. Search, filters, and sorting work against the full catalog without loading
   everything into the DOM.
5. The section is absent when the Host half is not mounted (standard slot behavior).
6. All labels are localized (English and Russian); the USD unit is stated explicitly.
7. The plugin installs into a fresh web profile with one command and uninstalls without
   residue other than its own cache file.

## 4. Non-goals

- Billing accuracy. Providers round differently and cache policies differ; every figure
  is explicitly an estimate.
- Currency conversion, price history, budgets, spending limits, team reporting.
- Terminal (TUI), SDK, or ACP surfaces. The web client only.
- Automatic model selection on the user's behalf.
- Scraping provider promotion pages. Promotions come only from the curated feed (B3).

## 5. Risks

| Risk | Mitigation |
|------|------------|
| models.dev schema drift | strict validation with optional fields; degrade to the last cached or embedded snapshot; fixed test fixture guards the parser |
| 4.5 MB payload reaching the browser | host-side pruning, per-provider folds, server-side ETag caching |
| Out-of-tree packaging constraints (bundle format, purity rules) | confirmed by spikes before implementation; see `spike/RESULTS.md` |
| Catalog descriptions are marketing text | tags derive only from structured fields (A3); descriptions live in tooltips |
| pi-ai catalog and models.dev disagree | pi-ai wins for routes the user can actually call; disagreement above 10% shows a warning icon with both values |
| Stale curated promotions | mandatory `until` and `verifiedAt` fields; automatic expiry (B4); CI validation |

## 6. Decisions and open questions

- **Q1 (closed) — transport:** Host HTTP route plus embedded build-time snapshot
  fallback (E2). A typed Remote API remains the future upgrade path.
- **Q2 (closed) — promotions:** `promos/` in this repository, contributions via pull
  requests, CI-validated and compiled feed (B3).
- **Q3 (closed) — tag rules:** configurable, defaults shipped, user extend/override
  via settings (A3).
- **Q4 (closed) — blended price metric:** deferred to P1 together with B1; v0.1 sorts
  by output price (A6).
- **Q5 (open):** whether the chat stats strip offers a supported extension point for
  the session-cost display (D2); to be checked in M3.
- **Q6 (closed with follow-up):** attribution is shown per row (source + date) and in
  the README. Before the first public release: confirm the models.dev license permits
  redistributing a pruned snapshot inside the npm package.
