# Spike Results

Platform-validation experiments run 2026-09-09 against the installed DSH
0.1.2-rc.1 (npx installation) on macOS, Node v25. Two test beds:

- **Live** — the `dsh web` server of this workspace on `127.0.0.1:3080`, with
  `patchReload: live` on the web profile.
- **Clone** — a disposable server with an isolated home:
  `DSH_HOME=/tmp/dsh-probe-home dsh web --port 3099`.

## S3 — named HTTP route from an out-of-tree plugin: PASS

- Plugin: `spike/src/pricing-host.js` — plain ESM JavaScript; `apply(ctx)` →
  `ctx.inject(['webServer'], ...)` → `webServer.register({ kind: 'exact', path:
  '/model-pricing/snapshot', handler })`; the returned disposer is attached through
  `ctx.effect`.
- Mounted by an absolute-path entry in `~/.dsh/profiles/web/cordis.patch.yml`.
- Live patch reload applied without restarting the server or losing the running
  sessions; `curl` returned `200` with JSON. Reverting the patch removed the route
  within seconds; the application stayed healthy.
- Conclusion: architecture §2 (transport = named route) is confirmed. The route
  registry treats out-of-tree plugins exactly like DSH's own feature plugins.

## S1 — client bundle accepted by the module system: PASS (server-side)

Test bed: clone; package `spike/client-spike2` (name `dsh-model-pricing-spike2`;
`exports` map with `.` and `./client`; `dsh.client` declaring `platform: "web"` and
`inject: ["@deepseek-ai/dsh-client-ui-settings-models"]`); mounted by package name
through the profile patch.

- Host half loaded at boot (marker sequence in `/tmp/spike2.log`: module evaluated →
  apply ran → webServer available → route registered, probe answered `200`).
- The authenticated index contains the module graph; our `client.js` appears in the
  served combo URL and is downloadable (`46` factory registrations in the batch
  response, including ours with a matching `id`).
- Bundle format: `window.__ModuleLoader__.load({ id, factory })` where the factory's
  `id` must equal the package name; third-party imports (`react`) go through the
  factory's `require`. The format is reproducible from the installed reference
  artifact at `@deepseek-ai/dsh-client-ui-settings-models/lib/client.js`.

Not covered server-side: actual slot rendering in a browser (see S2).

## S2 — slot mount order and rendering: PARTIAL (one manual check pending)

- Order is proven by the graph: our row follows
  `@deepseek-ai/dsh-client-ui-settings-models` (positions 18 → 45 in the combo), so
  the footer slot exists when our `apply` registers into it. `dsh.client.inject`
  behaves as documented.
- Remaining: visual confirmation that a component registered into
  `settings.models.footer` renders below the provider rows. Method: open the clone
  URL, Settings → Models, scroll to the bottom, expect the spike placeholder box.

## S4 — installation and mounting semantics: NOTE

- `dsh plugin --profile web add <dir>` installs a pnpm link dependency. The package
  is **not** activated as a profile layer unless its manifest declares
  `dsh.bundle` ("installed as a plain dependency, not a profile layer" — the
  literal CLI warning). A `cordis.patch.yml` insert then references it by name or by
  absolute path.
- Mounting by package name resolves at server start. In the long-running live
  instance, a runtime patch insert by bare package name did not mount (probe 404, no
  markers) although the same package mounted cleanly in the clone at boot.
  Absolute-path mounts did work live.
- Live-reloaded path-mounted modules are cached by module URL: rewriting a plugin
  file's contents is not re-imported; use a new file name or restart.
- Practical development loop: restart the server for package-name mounts; iterate
  live with path mounts using fresh file names.

## Summary for the architecture

The core bets of architecture §2 hold: an out-of-tree dual-face package can register
a host HTTP route, and its browser bundle is discovered, graph-ordered, and served by
DSH's module system. The only remaining unknown is a thirty-second visual check.
S5 (typed Remote code generation outside the repository) stays deferred to M3.

## Artifacts

- `spike/src/pricing-host.js` — S3 host-route plugin.
- `spike/client-spike2/` — S1/S2 package: host half with probe route and file
  logging; client half rendering a placeholder into `settings.models.footer`.
- Clone cleanup: `pkill -f 'dsh.*--port 3099'`; remove `/tmp/dsh-probe-home`.
- The live profile's `cordis.patch.yml` was reset to `[]` after the experiments.
