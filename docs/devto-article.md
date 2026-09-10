---
title: "I built a model-pricing plugin on the model it lists as free"
tags: ai, programming, opensource, webdev, deepseek
cover_image: https://raw.githubusercontent.com/vitas/dsh-model-pricing/main/assets/screenshot.png
description: "DeepSeek Harness + Qwen3.8-Flash on a free API promotion: 28 commits, a pricing board for 7,178 models, and a promotion feed that is structurally unable to lie."
---

# I built a model-pricing plugin on the model it lists as free

Chicken-and-egg, in one screenshot: I wrote `dsh-model-pricing` — a plugin that
shows model prices inside DeepSeek Harness — using **Qwen3.8-Flash**, which the
plugin itself currently marks as *"free on the B.AI API"*. The offer was
verified against B.AI's published promotion notices the same evening I started,
with a re-verification date stamped into the record. So yes: total LLM cost of
this project, so far, is $0 — with the honesty caveat the whole article is
about: *free while the promotion lasts, and nobody announced an end.*

What follows is less an ad than a build log: what the plugin is, what the
model was genuinely good at for 28 commits, where it stumbled, and the part I
actually enjoyed designing — a promotions feed that is structurally unable to
lie.

## What it is

DeepSeek Harness is a coding agent where "everything is a plugin" — including
its web UI settings. Its Settings → Models page tells you which models exist.
It does not tell you what they cost. I kept asking two questions before
switching providers:

1. What does this model actually cost per million tokens?
2. The *same model* is served by six providers — is a cheaper route available?

The plugin answers both inside the harness:

- per-1M-token input/output/cache prices for **7,178 priced models across 213
  providers** (models.dev), with the harness's own routing catalog overlaid for
  the 788 models it can actually invoke;
- same-model grouping with a `cheapest` badge and `+N% vs <provider>` deltas —
  e.g. GLM-5.2 ranges from $3.08 to $4.84 per 1M output tokens depending on
  the gateway: the same model, 57% apart;
- capability tags (coding / agentic / vision / long context / open weights)
  computed from structured catalog fields, with user-configurable rules;
- subscription plans (Coding Plan, Token Plan) collected into one group and
  **excluded from per-token ranking**;
- a **community promotion feed** with verified, time-boxed offers;
- English + Chinese UI (the platform's) plus a Russian pack registered by the
  plugin itself.

Prices are catalog estimates, not billing — the UI says so, in every locale.

## The build

~22 hours wall-clock, 28 commits, 18 source files, ~2,300 lines of
JS/TS/TSX, shipped to npm as `dsh-model-pricing` (Apache-2.0). The agent ran
inside DeepSeek Harness itself — the model was Qwen3.8-Flash through B.AI's
free API promotion — and the loop was unusually tight because the harness could
*host the plugin being developed*: edit code → install into a running instance
→ open the real Settings page → see the bug.

I drove in Russian; every artifact — code comments, commit messages, docs,
CHANGELOG — was required to be English, professional, no jargon. Across 28
commits and three language dictionaries (66 keys × en/zh/ru, parity-checked in
CI) the model never once broke that discipline. That, honestly, was the
surprise. If you've ever merged an AI session that sprinkled "🚀" into
production changelogs, you'll know what I mean.

What it was good at, concretely:

- **Cross-file refactors with tests as ground truth.** The promo attach logic
  moved from "match by model" to "match by model, fall back to whole-provider"
  across host, client store, three locales and the CI schema in one pass —
  because the verification loop was a real HTTP call against a running dev
  instance, not vibes.
- **Debugging CI, not just code.** The promo-feed publisher failed on its
  first real run (`gh-pages` branch rejection — Pages wasn't enabled). The
  fix wasn't retrying the push; it was reading *why* — then renaming the feed
  branch, adding a push-retry loop for transient `commit_refs` errors, and
  documenting the decision in the workflow header.
- **Saying "I can't verify this."** Multiple times the honest answer to
  "add these offers to the feed" was *"the source says 'discounted', my record
  requires a percent — I'll put the raw quote in the text field instead."*
  For a pricing tool, that instinct is the product.

Where it stumbled — two war stories worth more than the wins:

**The $0 trap.** First production table ranked `GLM Coding Plan` ($0 list
price, it's a subscription) as the *cheapest route* for 39 models. The lesson
isn't about prices at all: nominal numbers without semantics are poison.
Plan-shaped rows (175 of them, matched by a regex over plan metadata) now live
in a separate visual group, render "sub." instead of $0, and are invisible to
ranking.

**It couldn't see the screenshots.** B.AI announces promotions in UI screenshots
of its docs — and the model driving the session has no image input. So the
pipeline became: screenshot file → macOS Vision OCR. The first two approaches
(`swiftc` helper, JXA bridge) died on a broken Command Line Tools SDK on this
Mac; the third worked — `pyobjc` in a venv calling `VNRecognizeTextRequest`.
Worth naming because a free model's limitation surfaced as a real engineering
fork in the road, and the fix lived outside the model entirely.

## The design bit I'd rewrite the world about: a promo feed that cannot lie

Promotions are where pricing tools usually start lying — stale banners,
endless "LIMITED TIME", invisible affiliate framing. So the feed's schema makes
lies a *type error*:

```json
{
  "model": "deepseek-v4-flash",
  "provider": "b-ai",
  "kind": "discount",
  "discountPct": 50,
  "text": "API: 50% off — end not announced",
  "until": "2026-10-10",
  "verifiedAt": "2026-09-09",
  "by": "vitas (official docs)",
  "url": "https://docs.b.ai/llmservice/promotions-and-pricing-notices/"
}
```

- `url` and `verifiedAt` are **required** — every offer cites its source and
  the day a human checked it.
- `until` is a deadline, not decoration. When the clock passes it, CI drops the
  record and the plugin double-checks locally: expired offers *cannot* render.
- When a promotion has no announced end date, the convention is explicit:
  `until` = the contributor's re-verification horizon, and the user-facing text
  must say *"end not announced"*. The badge can expire honestly; nobody invents
  a fake deadline or hides one.
- The feed is a file in a git repo with CI validation on pull requests. An
  offer cannot merge without schema, date and source. (Gateways *not* in the
  pricing catalog get whole-provider records, so nothing is faked into a price
  row that doesn't exist.)
- Failure modes are one-directional: if the feed is down, prices keep
  rendering, promos disappear. A promotional surface that *hides prices when
  offline* would be something else.

Eight records shipped on day one; one of them describes the model that wrote
this plugin's UI.

## Numbers, since the internet likes them

| | |
|---|---|
| priced rows / providers | 7,178 / 213 |
| harness-catalog overlaid rows | 788 (30 source disagreements flagged, not averaged) |
| subscription-plan rows grouped & excluded from ranking | 175 |
| promo records at launch | 8 (each with source URL + verification date) |
| commits / files / LOC | 28 / 18 / ~2,300 |
| wall-clock | ~22h, incl. overnight autonomous goal rounds |
| LLM cost | $0 — free API promotion, re-verify date 2026-10-10 |
| UI languages | en + zh (platform), ru (plugin) |

Source disagreements get flagged with a ⚠ rather than silently picked — when
models.dev and the routing catalog disagree about DeepSeek V4 prices, the table
shows both. A comparison tool that quietly chooses is a comparison tool with a
secret.

## Try it

```
npx -y @deepseek-ai/dsh plugin --profile web add dsh-model-pricing
```

Settings → Models, no restart. Repo (docs, feature map, contribution guide for
promos — all in there):
[github.com/vitas/dsh-model-pricing](https://github.com/vitas/dsh-model-pricing)
· npm: [dsh-model-pricing](https://www.npmjs.com/package/dsh-model-pricing) ·
Apache-2.0.

If your gateway runs a real, source-documented promotion: the feed accepts
pull requests, and CI will ask you for the URL and the date you checked. That's
the whole business model.
