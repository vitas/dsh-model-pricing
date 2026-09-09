# Distribution and Discovery

How this project gets found, installed, and starred. Channels and requirements
below were verified against the live ecosystem on 2026-09-09; anything marked
*hypothesis* is an expectation to validate, not a fact.

## Positioning

- **Searchable problem statements the plugin answers:** "dsh model pricing",
  "compare LLM API prices", "cheapest model for coding", "OpenRouter price
  comparison", "DSH plugin pricing". The README front matter, the GitHub
  description, and the topic list carry these terms.
- **Audience:** primarily DSH users choosing between connected routes; secondarily
  the wider LLM-tooling audience arriving from search and the plugin lists. The
  README is written so the value is clear before the reader learns what DSH is.

## Channels (verified)

1. **npm registry.** `dsh plugin --profile web add dsh-model-pricing` resolves by
   npm name (like `dshmarket`). A single command only works once the package is
   published, so **publishing is the first distribution step** (see Release
   process). Package keywords are set for npm search.
2. **awesome-dsh-plugin** ([repo](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin),
   [site](https://awesome-dsh-plugin.com)). Submission = one PR adding
   `data/plugins/vitas__dsh-model-pricing.yml` (see the ready file at
   `packaging/awesome-dsh-plugin.yml` in this repo):

   ```yaml
   url: https://github.com/vitas/dsh-model-pricing
   name: vitas/dsh-model-pricing
   category: model
   description:
     en: 'Model pricing for the DSH settings page: per-1M-token prices from models.dev with the harness catalog overlaid, capability tags, cross-provider comparison, and a community promotion feed.'
     zh: 'DSH 设置页中的模型价格表：基于 models.dev 的每 100 万 token 价格并叠加本地目录，含能力标签、跨供应商比价和社区促销信息源。'
   ```

   (`description.en` must end with a period; quote it because it contains ": ".
   Post texts for every channel, and the exact submission commands, live in
   `docs/announcements.md`.)
   Listing requirements: installs through `dsh plugin add` (a `dsh.bundle`
   manifest is what makes that possible), accurate one-line description,
   reasonable category, maintained repo. The correct category is `model`
   (*Models & Providers*), which already holds catalog tools like
   `dsh-model-info-fill` and `dsh-model-manager`. CI checks manifest shape and
   **repository age** (>= 1 day, automatic), and a maintainer reads the target repo
   before merging — so submit after the gate with docs, README, npm package and
   first release already in place, and keep the description exactly as checkable
   claims (numbers there must match the code).
3. **dsh-market** (`dsh plugin --profile web add dshmarket`) — an in-app plugin
   browser embedded in DSH Settings; the awesome list advertises it as carrying
   "every plugin on this list", so market presence follows from (2) rather than a
   separate submission. *Hypothesis to verify:* whether the market syncs
   automatically.
4. **GitHub metadata** (already applied to `vitas/dsh-model-pricing`): keyword
   description, homepage link, topics (`dsh-plugin`, `deepseek-harness`,
   `model-pricing`, `llm-pricing`, …), Issues enabled, README first line states the
   searchable benefit. GitHub renders first in web search for "dsh plugin …"
   queries, so the repo page itself is the SEO surface; the awesome-plugin site
   mirrors per-plugin pages and links back.
5. **Announcements** (owner's call, after `v0.1.0`): DSH community
   spaces, Hacker News *Show*, r/DeepSeek / r/LocalLLaMA (the pricing-comparison
   angle performs there), X. Draft copy lives in this repository's releases page;
   a screenshot or short GIF is a precondition — text-only posts underperform.

## Star acquisition

Stars follow three concrete things rather than requests:

- **A visible working demo** — screenshot in the README (pending) and per-plugin
  pages on awesome-dsh-plugin.com.
- **Low-friction value** — one install command, zero configuration, no account.
- **Reasons to return** — the promotion feed (epic B3) gives users a reason to
  re-check and recommend; each refreshed `promos/` contribution is a small
  announcement moment.

The README ends with one restrained sentence asking for a star; no begging, no
interstitials.

## Release process

Publishing uses npm **trusted publishing (OIDC)**: there is no stored token and
no two-factor code to enter, because the GitHub Actions job authenticates to the
npm registry with a short-lived OIDC token. Requires the one-time "Trusted
Publishing" registration on npmjs.com described in `.github/workflows/publish.yml`.

1. `npm run snapshot && npm run build` (generates `data/snapshot.json`, `lib/client.js`).
2. Version bump + `CHANGELOG.md` entry + `git tag vX.Y.Z` + `git push --follow-tags`.
3. GitHub Release created from the tag; publishing is **triggered by the release**
   (`.github/workflows/publish.yml` runs `npm publish --provenance`), so the npm
   package is signed with provenance and attributed to this repository.
4. Confirm the `publish` workflow is green and `npm view dsh-model-pricing` shows
   the new version.
5. PR to awesome-dsh-plugin with the single `data/plugins/vitas__dsh-model-pricing.yml`
   file (content prepared in `packaging/awesome-dsh-plugin.yml`; hold until the
   repository-age check window has passed and submit as one clean PR).
6. Post-release announcements (channel list above).

> History: `v0.1.0` was published 2026-09-09 under the `samebits` npm account via
> an interactive `npm login` (a one-time password was required at publish time).
> npm has since deprecated two-factor-bypassing access tokens for direct
> publishing, so `v0.2.0` and later move to the trusted-publishing flow above.

## Repository hygiene that discovery depends on

- License file (Apache-2.0) and per-row source attribution: reviewers and users
  check both.
- Issue templates that funnel value back into the data plane: *Submit a
  promotion* and *Wrong price* forms produce structured issues that turn into
  `promos/**` pull requests (epic B3 loop).
- `CONTRIBUTING` guidance for promotion edits lives in `docs/architecture.md`
  §6; the PR template restates the checklist.

## Metrics

- GitHub traffic + star history (the shields badge in the README is social proof
  and a feedback loop).
- npm download counts (`npm dl`, no auth required).
- Awesome-list plugin page comments (the list hosts per-plugin discussion threads).
