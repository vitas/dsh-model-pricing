/**
 * Capability tag engine (feature A3). Plain ESM, no dependencies: imported by the
 * host half (to precompute tags) and bundled into the client half (to recompute
 * tags when the user config overrides the rules).
 *
 * A rule maps structured catalog fields (never free-text marketing, except the
 * `coding` description substrings) to a display tag. Rules are data so users can
 * extend or replace them through plugin configuration.
 */

export const DEFAULT_TAG_RULES = [
  {
    tag: 'agentic',
    when: { all: [{ field: 'toolCall', equals: true }, { field: 'reasoning', equals: true }] },
  },
  {
    tag: 'coding',
    when: {
      field: 'description',
      contains: ['coding', 'code review', 'software engineer', 'programming', 'agent swarm', 'agentic coding', 'code generation'],
    },
  },
  { tag: 'vision', when: { field: 'inputModalities', includes: 'image' } },
  { tag: 'long context', when: { field: 'context', gte: 200_000 } },
  { tag: 'open weights', when: { field: 'openWeights', equals: true } },
  { tag: 'structured output', when: { field: 'structuredOutput', equals: true } },
]

/** Human-readable chip label for a tag id. */
export const TAG_LABELS = {
  agentic: 'Agentic',
  coding: 'Coding',
  vision: 'Vision',
  'long context': 'Long context',
  'open weights': 'Open weights',
  'structured output': 'Structured out',
}

/** Fields a predicate can observe on a catalog row. */
function rowView(row, description) {
  return {
    toolCall: row.caps?.toolCall === true,
    reasoning: row.caps?.reasoning === true,
    structuredOutput: row.caps?.structuredOutput === true,
    openWeights: row.caps?.openWeights === true,
    attachment: row.caps?.attachment === true,
    context: row.context ?? 0,
    maxOutput: row.maxOutput ?? 0,
    description: String(description ?? '').toLowerCase(),
    inputModalities: row.caps?.inputModalities ?? [],
  }
}

/** Evaluate one predicate against the row view. Unknown shapes are false. */
export function evaluatePredicate(predicate, view) {
  if (!predicate || typeof predicate !== 'object') return false
  if (Array.isArray(predicate.all)) return predicate.all.every((p) => evaluatePredicate(p, view))
  if (Array.isArray(predicate.any)) return predicate.any.some((p) => evaluatePredicate(p, view))
  const value = view[predicate.field]
  if (value === undefined) return false
  if ('equals' in predicate) return value === predicate.equals
  if ('gte' in predicate) return typeof value === 'number' && value >= predicate.gte
  if ('includes' in predicate) return Array.isArray(value) && value.includes(predicate.includes)
  if ('contains' in predicate) return typeof value === 'string' && Array.isArray(predicate.contains) && predicate.contains.some((needle) => value.includes(needle))
  return false
}

/** Ordered, de-duplicated tags for one row under the given rules. */
export function computeTags(row, description, rules) {
  const view = rowView(row, description)
  const seen = new Set()
  const tags = []
  for (const rule of rules ?? DEFAULT_TAG_RULES) {
    if (typeof rule?.tag !== 'string') continue
    if (seen.has(rule.tag)) continue
    if (evaluatePredicate(rule.when, view)) {
      seen.add(rule.tag)
      tags.push(rule.tag)
    }
  }
  return tags
}

/**
 * Resolve the effective rule list from a user config object:
 * `{ extend: [...rules] }` appends to defaults, `{ override: [...rules] }`
 * replaces them. Invalid shapes fall back to the defaults untouched.
 */
export function resolveTagRules(config) {
  const user = config && typeof config === 'object' ? config : null
  if (Array.isArray(user?.override) && user.override.length > 0) return user.override
  if (Array.isArray(user?.extend) && user.extend.length > 0) return [...DEFAULT_TAG_RULES, ...user.extend]
  return DEFAULT_TAG_RULES
}
