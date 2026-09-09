# dsh-model-pricing

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) plugin that
shows model prices and capabilities inside the DSH web client.

For every model you can connect to DSH, the plugin displays **prices per 1M tokens**,
**capability tags** (coding, agentic, vision, long context, open weights), and
**which reachable route is cheapest right now**, including curated promotions. The
pricing view mounts into the existing **Models settings page** through DSH's public
extension slots (`settings.models.footer` and `settings.models.provider-card`).

## Features (planned)

- Pricing table of all connectable models: provider · model · input / output /
  cache-read price per 1M · context window · capability tags
- Automatic cross-provider comparison for the same model (`−N% vs …`, `cheapest`)
- Flat-rate subscription ("coding plan") providers shown as a separate group
- Curated promotions feed with expiry tracking, contributed through pull requests
- Price badges inside each provider card on the Models page
- A `/pricing` command and an approximate "this session ≈ $N" estimate (later milestones)

Data sources: the `pi-ai` model catalog already bundled with DSH (authoritative for
routes the user can actually invoke) and [`models.dev`](https://models.dev) (213
providers with costs and capability metadata), merged on the plugin's host side with
TTL caching and an embedded offline fallback. All figures are labeled estimates, not
billing data.

## Status

Pre-implementation. Design documents:

| Document | Contents |
|----------|----------|
| [docs/feature-map.md](docs/feature-map.md) | Feature specification: scenarios, epics, MVP definition of done, risks, recorded decisions |
| [docs/architecture.md](docs/architecture.md) | System architecture: deployment model, transport, data model, packaging, CI, milestones |
| [docs/design.md](docs/design.md) | UX design of the pricing section: layout, states, badge vocabulary, tokens, accessibility |
| [spike/RESULTS.md](spike/RESULTS.md) | Platform-validation evidence for the architectural assumptions |

## Planned installation

```sh
dsh plugin --profile web add dsh-model-pricing
```

The plugin runs entirely on the user's machine; it operates no server of its own. Its
only outbound traffic is anonymous reads of public data sources; the promotion feed is
served as static files from this repository.

## License

Apache-2.0. Pricing and capability data are retrieved at runtime from
[models.dev](https://models.dev) and from the bundled `@earendil-works/pi-ai` catalog;
the source and freshness of every displayed price are attributed in the UI.
