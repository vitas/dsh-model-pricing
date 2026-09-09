/**
 * Translation shim. Components call `tr(key, params)`; the active translator is
 * bound to DSH's locale service during apply (see index.tsx). If the locale
 * service is absent (unexpected in the web composition), everything keeps
 * rendering in English from the dictionary instead of failing.
 */
import { en, type CopyKey } from './locales.js'

export type Translator = (key: CopyKey, params?: Record<string, string | number>) => string

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}

let active: Translator = (key, params) => interpolate(String((en as Record<string, string>)[key] ?? key), params)

/** Install the bound translate function (called once from apply). */
export function bindTranslator(translate: Translator): void {
  active = translate
}

/** Translate a copy key at render time; reads whatever locale is active now. */
export const tr: Translator = (key, params) => active(key, params)
