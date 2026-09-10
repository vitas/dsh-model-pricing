# LinkedIn post

Publish this *after* the dev.to article is live; replace the placeholder URL.
Best days/times: Tue–Thu, 08:00–10:00 in your audience's timezone. The first
two lines are the hook LinkedIn shows before "…see more" — keep them intact.

---

For most tools, "extensible" means a config file and some patience.

I spent a week with DeepSeek Harness, where "everything is a plugin" is meant
literally: the product's own settings screen is assembled from plugin
contributions, even its optional subagents (Codex, Claude Code) ship as
plugins — and a third party (me) could add a card to its model-settings UI
without forking a single line.

So I tested the claim by building on it — a model-pricing board that lives
inside the harness's own settings: 7,178 priced models across 213 providers,
cross-provider comparison for the same model (GLM-5.2: $3.08 vs $4.84 per 1M
output depending on the gateway), and a promotions feed whose schema makes a
false offer a type error — every record requires a source URL, a verification
date, and an expiry that auto-hides.

The part I didn't expect: I built it using the harness itself, driven by
Qwen3.8-Flash on a free API promotion. 28 commits, ~2,300 lines, one night of
autonomous goal rounds — and the model held our documentation standard
(English-only, no fluff) across every single commit. Total API cost: $0.

Full build log, including where the free model hit real limits (it has no
vision — we built an OCR detour) and where I caught my own project overselling
— on my blog:

[ARTICLE URL]

Repo if you want the plugin: github.com/vitas/dsh-model-pricing

#AIengineering #DeepSeek #LLM #opensource #devtools
