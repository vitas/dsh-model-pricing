# dsh-model-pricing

Deepseek harness Model price plugin — model pricing & capabilities board for
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH).

A DSH plugin that shows **prices per 1M tokens**, **strength tags** (coding / agentic /
vision / long-context / open-weights) and **where it's cheaper right now** for every
model you can connect — mounted into the **Models settings page** via the
`settings.models.footer` / `settings.models.provider-card` extension slots.

## What you get (planned)

- Pricing table of all connectable models: provider · model · $in / $out / cache-read per 1M · context · capability tags
- Auto price comparison across providers for the same model (`−N% vs …`, `cheapest`)
- Coding-plan / subscription providers shown as a separate flat-rate group
- Curated promotions file with expiry tracking
- Badges inside each provider card on the Models page
- `/pricing` command and "this session ≈ $N" estimate (later milestones)

Data sources: the `pi-ai` model catalog already bundled with DSH (authoritative for
connected routes) and [`models.dev`](https://models.dev) (213 providers with costs and
capability metadata), merged host-side with TTL caching and offline fallback.

## Status

🚧 Pre-implementation. Current artifacts:

| Doc | Purpose |
|-----|---------|
| [docs/feature-map.md](docs/feature-map.md) | Feature spec & map (RU): epics, IDs, DoD, risks, open questions |
| docs/architecture.md | next: transport, package layout, data flow |
| docs/design.md | next: UX of the pricing section |

## Install (will be)

```sh
dsh plugin --profile web add dsh-model-pricing
```

## License

Apache-2.0. Pricing/capability data is retrieved at runtime from [models.dev](https://models.dev)
and the bundled `@earendil-works/pi-ai` catalog; source and freshness are attributed per row in the UI.
