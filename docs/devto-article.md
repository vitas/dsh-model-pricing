---
title: "I tested DeepSeek Harness for a week. I left with a shipped plugin and $0 in API costs"
tags: ai, programming, opensource, webdev, deepseek
cover_image: https://raw.githubusercontent.com/vitas/dsh-model-pricing/main/assets/screenshot.png
description: "A hands-on test of DeepSeek Harness and its everything-is-a-plugin architecture — and how far a free model got me building a real product on it."
---

# I tested DeepSeek Harness for a week. I left with a shipped plugin and $0 in API costs

I came to DeepSeek Harness as a reviewer and left as one of its plugin authors,
which is a fair measure of how the week went.

The hook is on the repo's first line: **"Everything is a plugin."** Not the
usual marketing meaning — not a config file with a couple of third-party hooks.
In DSH the agent hosts its own web UI as plugin packages; the settings screen
where you pick and configure models is assembled from plugin contributions
(this is the part I verified the hard way); even the optional subagents —
Codex, Claude Code — ship as plugins you can add or drop. All of it loaded
through manifests over a real extension API. I've poked at a lot of "extensible" tools. This one takes it literally, and poking at it turned into
the most fun I've had with an agent harness in a while.

So I did the thing you do when an architecture makes you believe it: I set out
to build something on it.

## The test project: a pricing board inside the harness itself

The gap I kept feeling in Settings → Models was the two questions I ask before
switching providers every time: **what does this model actually cost per
million tokens, and is a cheaper route to the *same* model available?** DSH
tells you which models exist. It doesn't tell you what they cost.

`dsh-model-pricing` closes that, and it lives *inside the harness's own
Settings page* — because that's the point of testing the plugin system:

- per-1M-token input / output / cache prices for **7,178 priced models across
  213 providers** (models.dev data)
- the harness's own routing catalog overlaid for the 788 models it can actually
  invoke — where the two sources disagree, the row is flagged with ⚠ rather
  than silently averaged
- same-model, cross-provider comparison with a `cheapest` badge: GLM-5.2, say,
  runs from $3.08 to $4.84 per 1M output tokens depending on the gateway — the
  same model, 57% apart
- capability tags (coding / agentic / vision / long context / open weights)
  computed from structured catalog fields, with a user-configurable rule engine
- subscription plans (Coding Plan, Token Plan) grouped separately and excluded
  from per-token ranking
- a community **promotions feed** — the part I most want to tell you about,
  below
- English + Chinese UI (the platform's) plus a Russian pack the plugin itself
  registers

It installs through the harness's own plugin manager — I never forked anything:

```
npx -y @deepseek-ai/dsh plugin --profile web add dsh-model-pricing
```

## What surprised me: I built it on a free model

Here's the part I didn't expect. I built the whole thing **using DeepSeek
Harness, driven by Qwen3.8-Flash** through B.AI's current promotion — the one
the plugin itself ships as a record: *"Qwen3.8-Flash API at 0 Credits (free),"*
with a source link, a verification date and "end not announced" stamped in.
Total LLM spend for the project: **$0.** Which made the week a perfect loop —
an agent harness, used to build a plugin about the economics of agent
harnesses, on a free model the plugin advertises.

And I have to be blunt about the coding quality, because I was not prepared for
it from a free-tier model:

**The loop was self-referential in the best way.** DSH could install and run
the plugin under development *in its own UI*: edit code → load into a live
instance → open the real Settings page → see the bug. The agent was developing
the software that hosts it, and fixed its own rendering mistakes in a running
browser like it was nothing.

**It held a ruthless process rule for 28 commits straight.** I drove the
session in Russian; every artifact — code comments, commit messages, docs,
CHANGELOG — had to be English, professional, no jargon, no emoji confetti.
Across ~2,300 lines and three locale dictionaries (66 keys × en/zh/ru), zero
violations. If you've ever merged an AI session that sprinkled "🚀" into a
production changelog, you'll recognize this as the actual headline, not a
footnote.

**It debugged infrastructure, not just code.** When the feed publisher failed
its first live run (a rejected branch push — Pages wasn't enabled), the fix
wasn't a retry button. It read *why*, renamed the feed branch, added a
push-retry loop for the transient error, and wrote the decision into the
workflow header. Big refactors landed with tests as ground truth — the promo
matcher moved from "match by model" to "match by model, fall back to
whole-provider" across the host, the client store, three locales and the CI
schema in a single pass, verified against a running dev instance.

**It repeatedly refused to lie.** Asked to add offers, the answer several times
was: *"the source says 'discounted' — my schema requires a percent, so I'll put
the raw quote in the text field instead."* No invented end dates, no stretched
numbers. For a pricing tool, that instinct *is* the product — and I audited
every record it added by hand.

**It kept going while I slept.** DSH has goal-continuation rounds: I'd set an
objective, walk away, and come back to the next milestone implemented, tested
and committed. 28 commits over ~22 wall-clock hours — including a night I
wasn't at the keyboard.

## The limits — a review that skips these is just an ad

The free model driving the session has no image input. B.AI publishes some
promotions as *screenshots* of its docs — so the pipeline became screenshot →
OCR, and my first two attempts died on a broken macOS toolchain before
`pyobjc` + Vision worked. That fix lived entirely outside the model; a paid
frontier model would have looked at the image directly. Free-tier means you hit
edges like this one.

Second, and more important: an agent this capable makes it easy to write checks
your project can't cash. My first draft of *this article* claimed "locale
parity is checked in CI." It wasn't. I caught it before publishing — then made
it true: a dependency-free gate (`scripts/check-locales.mjs`) now fails any
pull request that drifts the three dictionaries out of sync. Capability raises
the ceiling; your review discipline still sets the floor.

## The plugin system, as tested

Here's what "everything is a plugin" bought me as an outsider, no access to
DSH's source:

- I added a full section to the agent's **own Settings page** — server side and
  client side — without touching a line of the harness.
- Each model **provider got a card badge** (its lowest price, priced-model
  count, active offers) via a keyed slot the platform exposes.
- A **scoped settings namespace** (`model-pricing`) means users tune refresh
  interval, data sources and tag rules in `settings.yaml` — or in the card I
  contributed — and it applies without a restart.
- The whole thing ships as an **npm package + web bundle** that the plugin
  manager installs with one command.

It's genuinely unusual for a third party to extend a product's own settings UI
this deep. The seam list in the plugin's docs reads like a guided tour of the
system — and it's a little disorienting that I never once had to fork anything
to use them.

## The design bit I'd rewrite the world about: a promo feed that can't lie

Promotions are where pricing tools usually start lying — stale banners,
endless "LIMITED TIME," invisible affiliate framing. So the feed's schema makes
a lie a *type error*:

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

- `url` and `verifiedAt` are **required** — every offer names its source and the
  day a human checked it.
- `until` is a deadline, not decoration. Past it, CI drops the record and the
  plugin double-checks locally: an expired offer *cannot* render.
- When a promotion announces no end date, the convention is explicit: `until`
  becomes the contributor's re-verification horizon and the UI text must say
  *"end not announced."* The badge ages honestly; nobody invents a deadline or
  hides one.
- The feed is a file in a git repo, validated on pull requests by CI. An offer
  can't merge without schema, dates and source. Gateways not in the pricing
  catalog get whole-provider records, so nothing is faked into a row that
  doesn't exist.
- Failure runs one way: if the feed is down, prices keep showing and promos
  vanish. A promotional surface that *hides prices when offline* is something
  else entirely.

Eight records shipped on day one; one of them describes the free model that
wrote this plugin's UI.

## Numbers, since the internet likes them

| | |
|---|---|
| priced rows / providers | 7,178 / 213 |
| harness-catalog overlaid rows | 788 (30 disagreements flagged, not averaged) |
| plan rows grouped & excluded from ranking | 175 |
| promo records at launch | 8 (each with source URL + verification date) |
| commits / files / LOC | 28 / 18 / ~2,300 |
| wall-clock | ~22h, incl. overnight autonomous rounds |
| LLM cost | $0 — free API promotion, re-verify date 2026-10-10 |
| UI languages | en + zh (platform), ru (plugin) |

## Try it — as reviewer and as builder

If you're curious about DeepSeek Harness the way I was: run it, then break into
its settings page. The architecture is the product; the agent is very good at
both jobs, even on a model that costs nothing.

```
npx -y @deepseek-ai/dsh plugin --profile web add dsh-model-pricing
```

Repo (docs, feature map, the promotion contribution rules — all public):
[github.com/vitas/dsh-model-pricing](https://github.com/vitas/dsh-model-pricing)
· npm:
[dsh-model-pricing](https://www.npmjs.com/package/dsh-model-pricing) ·
Apache-2.0. And if your gateway runs a real, source-documented promotion: the
feed accepts pull requests, and CI will ask you for the URL and the date you
checked. That's the whole business model.
