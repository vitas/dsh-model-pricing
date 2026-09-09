# UX Design — the pricing section on the Models page

Status: draft v0.1. Scope: Epic A (MVP) plus the badge vocabulary reused by Epics B
and C later. See [feature-map.md](feature-map.md) for behavior and
[architecture.md](architecture.md) for data availability.

## 1. Design principles

1. **Honest data over polished presentation.** Every number can be traced to its
   source and freshness; estimates are labeled as estimates.
2. **The Models page stays about models.** The pricing section is mounted below the
   provider rows, starts collapsed, and never steals scroll position or focus.
3. **Dense, tabular, not marketing.** Numbers in a table; no hero treatment.
4. **Both DSH themes for free.** All colors come from the platform's design tokens;
   the plugin defines no color literals.
5. **Keyboard and screen-reader access are first-class.**

## 2. Layout

The section renders in the page footer slot, separated by the page's standard
divider. Top to bottom:

```
┌ Model pricing ────────────────────────────────────────── [⟳ Refresh] [⚙ Settings] ┐
│ Models.dev · updated 14 min ago · 213 providers / 4,486 models · estimates, not billing │
├────────────────────────────────────────────────────────────────────────────────────┤
│ [⌕ Search models or providers    ] (Coding)(Agentic)(Vision)(Long context)(Open)  │
│ [Only mine ▾] [Group: provider ▾]                          sorted by Output ▾      │
│                                                                                    │
│ ▸ DeepSeek — from $0.14 / $0.28 per 1M · 3 models                                  │
│ ▾ Z.ai — from $1.40 / $4.40 per 1M · 6 models                                     │
│     GLM-5.2      $1.40  $4.40  $0.26    1M    (Coding)(Agentic)(Long context)      │
│     GLM-4.7      $0.60  $2.20  $0.11    200k  (Coding)(Agentic)                    │
│     GLM-4.6V     $0.30  $0.90     —     128k  (Vision)                             │
│ ▸ MiniMax — from $0.30 / $1.20 per 1M · 5 models                                   │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Header row (always visible)

- Section title styled like the page's card headings.
- Right side: Refresh (icon button in the page's ghost style) and Settings (jumps to
  the plugin's card on the Plugins tab).
- Status line: `source · updated {relative time} · counters · "estimates, not
  billing"`. The disclaimer is secondary text and shortens to `est.` on narrow
  viewports.

## 3. States

| State | Header | Body |
|-------|--------|------|
| Collapsed (first visit) | status line visible | expand affordance "Show pricing table" |
| Loading (first fetch after expanding) | status + spinner in Refresh | skeleton of 6 rows |
| Loaded | as designed above | table |
| Stale (cache older than TTL) | "stale" chip in warning color, tooltip explains | table as usual |
| Offline (Host route unreachable) | `cached · 3 h ago` or `bundled snapshot · built {date}` | table |
| Source error (Host-side fetch failed) | error color; tooltip carries the error code | last good data |
| Filter result empty | — | "No models match — Clear filters" |
| Host half not mounted | section absent entirely | (standard slot behavior) |

Freshness thresholds: under 1 hour tertiary text; up to TTL secondary; beyond TTL the
stale chip. Default TTL is 6 hours (a setting).

## 4. The table

### 4.1 Columns (v0.1)

| Column | Alignment | Format |
|--------|-----------|--------|
| Provider | — | only in group headers |
| Model | left | display name; model id in tooltip; clicking inserts the id into search |
| Input $/1M | right | monospaced, 2–4 significant digits, leading `$`; values under `$0.01` keep their digits, never round to `$0.00` |
| Output $/1M | right | same; **default sort column** |
| Cache read $/1M | right | `—` when the source declares nothing |
| Context | right | `128k` / `1M` |
| Tags | left | up to three chips plus `+N` with the full list in a tooltip |

Expanding a row reveals: catalog description (plain text, max two lines), max output,
modality icons, structured-output support, tiered prices when present, the source and
age block (§6), and a Docs link.

### 4.2 Grouping and size

- Rows group into provider folds; header: `name — from {min} / {max} per 1M ·
  {N} models · flags`.
- One group is expanded by default: the current session's provider if it is in the
  catalog, otherwise the first alphabetically.
- Folds provide the virtualization: only expanded rows exist in the DOM, which keeps
  ~4,500 models affordable without a virtualized table in v0.1.
- A `Flat` grouping mode removes folds, adds a Provider column, and supports
  cheapest-first browsing.

### 4.3 Sorting and filtering

- Clicking a price/context header cycles asc → desc → none; `aria-sort` maintained.
- Search: 150 ms debounce, plain substring over ids, names, providers.
- Tag chips AND together; clicking a chip inside a row adds its filter.
- "Only mine" has three states: off / configured / key configured, mirroring the page
  row semantics (a provider appears in settings; green/red dot meaning).

## 5. Badge vocabulary (shared by Epics A–C)

| Badge | Style | Where |
|-------|-------|-------|
| Capability tag (`Coding`, `Agentic`, `Vision`, `Long context`, `Open weights`, `Structured output`) | neutral chip, secondary label | rows (§A3 engine) |
| `−N% vs <provider>` | success fill | B1 (M2) |
| `cheapest` | success outline | B1 (M2) |
| `Promotion — 50% · until Oct 1` | warning fill, date monospaced | B3/B4 (M2–M3) |
| Divergence `⚠` in a price cell | tooltip: "catalog says $X, your route charges $Y" | merge flags (§4.2 arch) |
| `stale` | warning chip in the status line | §3 |
| `plan` (flat-rate) | brand outline; `$N/mo` replaces per-1M cells | B2 (M2) |

At most one status badge per row at once; priority order: promotion > cheapest >
stale. Capability tags do not count against this limit.

## 6. Source and trust

Clicking a price opens a popover listing: source (`models.dev` / `pi-catalog`), fetch
date, the local route price when it exists and differs, and a link to this plugin's
data-sources note in the README. The page already has a tooltip/hovercard primitive;
the popover reuses platform surfaces, never a custom dialog.

## 7. Tokens and metrics

All values reference DSH's design tokens (verified present in the installed web build):

| Role | Token |
|------|-------|
| Primary / secondary / tertiary text | `--dsw-alias-label-primary` / `-secondary` / `-tertiary` |
| Page and card backgrounds | `--dsw-alias-bg-base` / `--dsw-alias-bg-layer-1` |
| Row and chip borders | `--dsw-alias-border-l1` / `-l2` |
| Row hover | `--dsw-alias-interactive-bg-hover` |
| Refresh button | the page's ghost-button tokens |
| Success / warning / error badges | `--dsw-alias-state-success-*` / `-warn-*` / `-error-primary` |
| Plan/brand accent | `--dsw-alias-brand-primary` |

Metrics: 32 px rows; 15 px semibold section heading matching page cards; tabular
figures (`font-variant-numeric: tabular-nums`); monospaced price column; horizontal
padding aligned with the provider cards.

## 8. Copy (English; Russian mirrors the same keys)

| Key | English |
|-----|---------|
| section.title | Model pricing |
| status.updated | updated {relative} |
| status.source.bundled | bundled snapshot · built {date} |
| status.est | estimates, not billing |
| group.from | from {min} / {max} per 1M |
| empty.filters | No models match — Clear filters |
| badge.stale | stale |
| promo.until | until {date} |

## 9. Accessibility

- The section is a landmark region with an accessible name.
- A real table (`table`, `caption`, header cells with scope); provider groups are
  full-width header rows with `aria-expanded` buttons.
- Refresh sets `aria-busy`; the result is announced through a polite live region
  ("Updated 4,486 models").
- Sortable headers expose `aria-sort`; chips are toggle buttons with `aria-pressed`;
  the price popover closes on Escape and does not trap focus.
- Every interactive cell is reachable by Tab; chip contrast meets 4.5:1 in both themes.

## 10. Responsive behavior

- ≥1280 px: full table.
- 900–1280 px: cache column moves into the expanded row.
- <900 px: card layout per model (name, then `in → out` on one line; context and tags
  below); group headers remain; the toolbar chips scroll horizontally with edge fade
  instead of wrapping.

## 11. Out of scope for this document

- The `/pricing` popup and session-cost display (Epic D) — they reuse §5/§6 patterns;
  a mini-design accompanies M3.
- The settings card — standard plugin-card pattern; fields are the settings schema in
  architecture §4.4.
- Screenshot diffs for theme review — they arrive with the first end-to-end tests.
