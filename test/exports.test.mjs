/**
 * Module-shape regression guard for both halves of the plugin.
 *
 * The DSH Loader normalizes every plugin module through
 * `unwrapExports: exports = exports.default ?? exports`
 * (`@deepseek-ai/cordis-plugin-loader/lib/index.js`). A module that grows a
 * `default` export is therefore unwrapped to that value, and the named `name`,
 * `inject`, and `Config` exports disappear with it — the host loses its settings
 * schema and the browser half loses its service injections, with no error that
 * names the cause. This is not hypothetical: `dsh-jev-subagent-dispatch` shipped
 * `export default apply` on both halves and lost its whole settings section
 * silently. The named exports are the contract.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/** Source files whose module shape the Loader consumes. */
const SOURCES = ['src/host/index.js', 'src/client/index.tsx']

/**
 * Both spellings that produce a `default` export. The Loader's
 * `exports.default ?? exports` cannot tell them apart, so the guard must not
 * either — `export { apply as default }` is just as fatal as `export default`.
 */
const DEFAULT_EXPORT = /^\s*export\s+default\b|^\s*export\s*\{[^}]*\bas\s+default\b/m

for (const file of SOURCES) {
  test(`${file} declares no default export`, () => {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.ok(
      !DEFAULT_EXPORT.test(text),
      `${file} must not default-export: the Loader would unwrap it and drop name/inject/Config`,
    )
  })
}

test('the host module keeps the named plugin surface the Loader reads', async () => {
  const host = await import('../src/host/index.js')
  assert.equal(host.default, undefined, 'a default export would be unwrapped, dropping Config')
  assert.equal(typeof host.apply, 'function')
  assert.ok(host.Config !== undefined, 'Config is the schema the Plugins page projects a form from')
})

test('every field the Plugins page can edit is volatile', async () => {
  const schemastery = await import('@deepseek-ai/schemastery').catch(() => null)
  // The dependency is a peer: a checkout that never installed it composes with
  // the profile patch as the only configuration source, and has no Config to
  // check. (This is exactly the state that made the settings page vanish in a
  // pnpm profile — the import failed silently and `Config` came out undefined.)
  assert.ok(schemastery, 'schemastery must resolve for the settings section to exist')
  const z = schemastery.default
  // 3.18.2 ships with DSH 0.1.5 and has no `.volatile()`: the plugin degrades to
  // the imperative installSection path there by design. Under 3.18.4
  // (0.1.7/0.2.0) a field left unmarked is silently dropped from `describe`,
  // which is the failure this pins down.
  if (typeof z.string().volatile !== 'function') return
  const { Config } = await import('../src/host/index.js')
  const fields = Config?.dict ?? {}
  assert.ok(Object.keys(fields).length > 0, 'Config must expose its fields')
  const unmarked = Object.keys(fields).filter((key) => fields[key]?.meta?.volatile !== true)
  assert.deepEqual(unmarked, [], 'unmarked fields are invisible in the Plugins page and reject writes')
})
