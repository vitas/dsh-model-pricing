# Announcement texts

Copy-paste-ready posts for each channel listed in `docs/distribution.md`.
All factual claims below are verified against the live snapshot on 2026-09-09
(`GET /model-pricing/snapshot`): 213 providers, 7,612 models, 7,178 priced rows,
788 rows carrying the harness's own routing prices (30 divergences flagged),
175 subscription-plan rows, 8 community promotion records (B.AI).

Screenshot for all posts: `assets/screenshot.png`.

---

## 1. GitHub Discussions — deepseek-ai/deepseek-harness (category: Show and tell)

**Title:** `dsh-model-pricing: model prices, cheapest-route comparison and a promotion feed in Settings`

> A third-party web-profile plugin that answers "what does this model actually
> cost, and is there a cheaper route to the same model?" without leaving the
> harness.
>
> Install (one line):
>
> ```
> npx -y @deepseek-ai/dsh plugin --profile web add dsh-model-pricing
> ```
>
> What it does:
>
> - Pricing table on **Settings → Models**: per-1M-token input / output / cache
>   prices for **7,178 priced models across 213 providers** from
>   [models.dev](https://models.dev), with the **harness's own pi-ai catalog
>   overlaid** — for the 788 models DSH can actually invoke, the price shown is
>   the routing price, and any disagreement between the two sources is flagged
>   with ⚠ instead of silently picked.
> - **Cross-provider comparison**: the same model served by several providers is
>   grouped automatically; the cheapest route gets a `cheapest` badge, others
>   show `+N% vs <provider>`.
> - **Capability tags** (coding / agentic / vision / long context / open
>   weights / structured output) computed from structured catalog fields, with a
>   user-configurable tag-rule engine.
> - **Subscription plans** (GLM Coding Plan, Token Plans, …) are grouped
>   together and excluded from per-token price ranking — their $0 list price is
>   a subscription, not a usable rate.
> - **Community promotion feed**: verified, time-boxed offers
>   (`promos/<provider>.json`, schema-checked in CI, each record carries an
>   expiry date, a verification date and a source link). Expired offers are
>   hidden by both CI and the plugin; the feed cannot hide prices if it is
>   down. Whole-provider offers also render on provider cards, so gateways that
>   are not in the pricing catalog (e.g. B.AI) are covered.
> - Plugin settings (`model-pricing` namespace): refresh interval, catalog URL,
>   feed URL, tag rules — editable in `settings.yaml` or the Plugins tab card;
>   changes apply without restart.
> - Languages: English + Chinese (platform) and **Russian** (registered by the
>   plugin); falls back to browser language.
>
> Prices are estimates from catalog data, explicitly labeled "estimates, not
> billing". Offline first run embeds a snapshot of 336 popular routes.
>
> Repo: https://github.com/vitas/dsh-model-pricing · npm:
> https://www.npmjs.com/package/dsh-model-pricing · Apache-2.0.
>
> Built purely on public plugin seams (`dsh.bundle` + web client inject,
> `ctx.settings.installSection`, `settingsScope`, slots
> `settings.models.footer` / `settings.plugin.item` /
> `settings.models.provider-card` keyed by the describe mirror) — happy to
> serve as a reference for cookbook entries.

**Chinese addendum (append below the English body):**

> 中文简介：在「设置 → 模型」中显示 213 家供应商、7 178 个有价格模型的每
> 100 万 token 价格（models.dev 数据，叠加本地目录的路由价），自动比价并标出
> 最便宜路由，含能力标签、订阅计划分组，以及社区维护的限时促销信息源。安装：
> `npx -y @deepseek-ai/dsh plugin --profile web add dsh-model-pricing`

---

## 2. Show HN

**Title:** `Show HN: Model pricing board for DeepSeek Harness – 7k models, cheapest-route comparison`

> Text:
>
> DSH (DeepSeek Harness) is a plugin-first coding agent, and its Settings page
> didn't answer the first question I had every time I picked a model: what does
> it cost, and is another provider serving the same model cheaper?
>
> So I wrote `dsh-model-pricing`, a plugin that adds a pricing table inside the
> harness's own Settings:
>
> - 7,178 priced models / 213 providers from models.dev, per-1M-token prices
> - the harness's own routing catalog overlaid (788 models); source
>   disagreements are flagged, not averaged
> - same model across providers is grouped; `cheapest` badge + `+N% vs X`
> - coding/agentic/vision/long-context tags from structured fields, user-rule
>   engine
> - subscription plans (e.g. GLM Coding Plan) are grouped and excluded from
>   per-token ranking — their $0 list price is a plan, not a rate
> - a community promotion feed: PRs against a JSON schema with mandatory
>   expiry + verification date + source link, validated in CI. Expired offers
>   disappear; a feed outage never hides prices. Currently seeded with B.AI's
>   documented offers (four free API models, two 50% routes, etc.)
>
> Honest caveats: prices are catalog estimates, not billing; offline fallback
> shows a smaller embedded snapshot; the plugin is third-party (Apache-2.0).
>
> Install: `npx -y @deepseek-ai/dsh plugin --profile web add dsh-model-pricing`
> Repo: https://github.com/vitas/dsh-model-pricing
>
> It's built entirely on public seams — settings sections, scoped write APIs,
> slot injection — so it doubles as an example of what the plugin system can
> surface in its own UI. Feedback welcome.

---

## 3. 掘金 / V2EX（中文）

掘金标题：`给 DeepSeek Harness 加了个「模型价格表」插件：7000+ 模型、同模型跨供应商比价、社区促销信息源`

V2EX 标题（[分享] 节点）：`写了个 DeepSeek Harness 插件：设置页里看 7000+ 模型价格和跨供应商比价`

> 正文（两个平台通用）：
>
> DeepSeek Harness（DSH）是 everything-is-a-plugin 架构的编码 Agent。它的设置
> 页原来回答不了我最常问的问题：这个模型到底多少钱，同一个模型换一家供应商
> 是不是更便宜。于是我做了 `dsh-model-pricing` 插件，装完直接出现在
> 设置 → 模型里：
>
> ```
> npx -y @deepseek-ai/dsh plugin --profile web add dsh-model-pricing
> ```
>
> - 213 家供应商、7,178 个有价模型，每 100 万 token 输入/输出/缓存价
>   （models.dev，叠加 DSH 本地目录的路由价；两边不一致会 ⚠ 标出来而不是二选一）
> - 同一模型多供应商自动归组，最便宜打 `cheapest`，其余显示 `+N% vs X`
> - 能力标签（编程 / agentic / 视觉 / 长上下文 / 开源权重 / 结构化输出），
>   规则可自定义
> - Coding Plan / Token Plan 这类订阅计划单独分组、不参与按 token 比价——
>   标价 $0 是订阅，不是每 token 零价
> - 社区促销信息源：JSON schema + CI 校验，每条必须有截止日期、核实日期和
>   来源链接；过期自动隐藏，信息源挂了也不影响价格显示。目前已收录 B.AI
>   官方文档里的 8 条（GLM-5.3-Flash / Qwen3.8-Flash / Hy3 / MiMo-V2.5 API
>   限免，DeepSeek-V4-Flash 五折等）
> - 自带中文（跟随平台 zh 语言包，另支持英/俄）
>
> 说明：价格是目录估算值，界面里也明确标注「estimates, not billing」；离线
> 首次安装用内置快照。插件开源 Apache-2.0，只用了 DSH 的公开扩展点。
>
> 仓库：https://github.com/vitas/dsh-model-pricing
> npm：https://www.npmjs.com/package/dsh-model-pricing

---

## 4. Reddit — r/LocalLLaMA（可同发 r/DeepSeek）

**Title:** `I built a model-pricing board inside DeepSeek Harness: 7,178 models, cheapest-route comparison, verified promo feed`

> Same bullets as Show HN, plus one line for this audience:
>
> The comparison is the part I actually use: same model id across providers,
> sorted by output price, `cheapest` badge — e.g. GLM-5.2 ranges from $3.08 per
> 1M output tokens (GMI Cloud) to $4.84 (Volcano Engine): the same model, 57%
> apart. Promo data is the risky
> part, so every offer is a schema-validated record with expiry, verification
> date and source URL, hidden automatically when past its end date.
>
> Not billing-accurate — catalog estimates, labeled as such. Repo/install in
> the comments (Apache-2.0, one npx line, web profile).

(Post the install line as the first comment, not in the body, per subreddit
norms; self-promo flair.)

---

## 5. X/Twitter — short thread

> 1/ DeepSeek Harness settings now know what every model costs.
> `dsh-model-pricing`: 7,178 priced models · 213 providers · per-1M prices ·
> cheapest-route comparison — inside the agent's own Settings page. 🧵
> 2/ [screenshot.png]
> 3/ Same model, five providers, one badge: `cheapest` — and the harness's own
> routing price is overlaid on top of models.dev; when the two disagree, the
> row flags ⚠ instead of guessing.
> 4/ Promo feed done responsibly: every offer is a schema-checked record with
> expiry + verification date + source link, CI-validated, auto-hidden when
> expired. Live now: B.AI's free API tiers.
> 5/ One line: `npx -y @deepseek-ai/dsh plugin --profile web add dsh-model-pricing`
> github.com/vitas/dsh-model-pricing · Apache-2.0 · EN/中文/Русский

---

## 6. awesome-dsh-plugin pull request (submit after 2026-09-10T17:00Z)

The list's CI auto-rejects repos younger than 1 day; this repo was created
2026-09-09T16:36Z. Entry file: `packaging/awesome-dsh-plugin.yml`.

```sh
cd /tmp
gh repo fork awesome-dsh-plugin/awesome-dsh-plugin --clone=false
git clone https://github.com/vitas/awesome-dsh-plugin adspl && cd adspl
mkdir -p data/plugins
cp /Users/vitas/git/dsh-model-pricing/packaging/awesome-dsh-plugin.yml \
   data/plugins/vitas__dsh-model-pricing.yml
git checkout -b add-dsh-model-pricing && git add data/plugins && git commit -m \
  "add vitas/dsh-model-pricing" && git push -u origin add-dsh-model-pricing
gh pr create --fill --repo awesome-dsh-plugin/awesome-dsh-plugin \
  --head vitas:add-dsh-model-pricing
```

PR body (short, factual):

> Adds `vitas/dsh-model-pricing` (category: model). Repo declares the full
> `dsh.bundle` manifest (plus web `dsh.client`), is published to npm
> (`dsh-model-pricing@0.2.0`), and the entry description matches the code:
> numbers are the live snapshot stats. `dsh-plugin` topic is set. Thanks!

---

## 7. Outreach drafts (optional)

**models.dev issue — list the B.AI gateway:**

> Title: `Add provider: B.AI (b.ai) — OpenAI-compatible LLM gateway`
> Body: B.AI runs an OpenAI-compatible gateway documented at
> https://docs.b.ai/llmservice/ with a published model list and per-token
> credit prices, and is a routable provider in several agent tools (it ships
> an official DeepSeek Harness integration guide:
> https://docs.b.ai/llmservice/deepseek-harness/introduction/ ).
> Happy to PR the provider JSON if you confirm the expected schema/fields.

**B.AI outreach (their Discord/support/DM):**

> Hi — I maintain `dsh-model-pricing`, an open-source plugin for DeepSeek
> Harness that shows model prices and time-boxed promotions inside the
> harness's settings UI. I verified your current API promotions (GLM-5.3-Flash
> / Qwen3.8-Flash / Hy3 / MiMo-V2.5 free; DeepSeek-V4-Flash −50%…) against
> docs.b.ai and listed them in our community feed with the source link and a
> re-verification date. Two things you might want: (1) a pointer from your
> promotions page so users can find the plugin, and (2) if B.AI gets listed on
> models.dev, the offers would also badge each model row automatically. Both
> free — Apache-2.0 repo: https://github.com/vitas/dsh-model-pricing

---

## Posting order (proposed)

1. Day 0: awesome-dsh-plugin PR (after the 1-day gate) + GitHub Discussions post.
2. Day 0–1: merge approval → then Juejin/V2EX (zh audience is the platform's
   first language and the list is bilingual).
3. Day 2+: Show HN and Reddit (mention the list inclusion if merged), X thread
   same day.
4. Outreach (7) any time; independent.
