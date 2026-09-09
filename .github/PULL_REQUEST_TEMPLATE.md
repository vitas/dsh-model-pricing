## What this changes

<!-- For a promotion: provider/model, the discount, and the public source URL. -->
<!-- For code: the feature-map epic/requirement id it serves (A1..E3) or the bug fixed. -->

## Type

- [ ] Promotion entry (`promos/**`) — source URL + expiry included
- [ ] Code change
- [ ] Documentation

## Checklist

- [ ] For `promos/**`: `promos/<provider>.json` validates against the schema in
      `docs/architecture.md` §5 and every field cites a public source.
- [ ] For code: `npm run build && npm run check` pass; client bundle still exports
      `apply`/`inject` in the `window.__ModuleLoader__.load({ id, factory })` shape.
- [ ] No browser bundle imports another DSH client package as a value (bundle-purity).
- [ ] Screenshots for user-visible UI changes.
