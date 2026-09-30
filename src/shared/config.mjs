/**
 * Configuration vocabulary shared by the host and browser halves.
 *
 * The names here are the plugin's identity on both settings models DSH offers,
 * so the two halves cannot disagree about which entry they own:
 *
 * - DSH 0.1.5 keeps the imperative settings section registered with
 *   `ctx.settings.installSection`, addressed by {@link SETTINGS_NAMESPACE}.
 * - DSH 0.1.7 dropped that seam: a plugin's settings section is now the `Config`
 *   of its own Loader row, addressed by the row's id ({@link ROW_NAMESPACE}) and
 *   rendered through the keyed `plugins.row.config` slot under
 *   {@link ROW_CONFIG_KEY} (`<package name>#<row id>`).
 *
 * Dependency-free and side-effect-free on purpose: the host imports it with a
 * plain `import`, and esbuild inlines it into the browser bundle.
 *
 * @module dsh-model-pricing/config
 */

/** npm package name this plugin ships as. */
export const PACKAGE_NAME = 'dsh-model-pricing'

/**
 * Cordis plugin name, and the id this plugin's row is inserted under by
 * `cordis.patch.yml` — the loader names the row's settings namespace after it.
 */
export const PLUGIN_NAME = 'dsh-model-pricing'

/** Settings namespace the plugin owns on DSH 0.1.5. */
export const SETTINGS_NAMESPACE = 'model-pricing'

/** Settings namespace DSH 0.1.7 serves this plugin's row under. */
export const ROW_NAMESPACE = PLUGIN_NAME

/**
 * Key the browser half registers the row's configuration page under.
 *
 * DSH 0.1.7 keys `plugins.row.config` by `<package name>#<row id>`; here both
 * parts are the same string. 0.1.5 keys the old `settings.plugin.item` by
 * {@link SETTINGS_NAMESPACE} instead.
 */
export const ROW_CONFIG_KEY = `${PACKAGE_NAME}#${PLUGIN_NAME}`
