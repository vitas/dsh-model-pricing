/**
 * Builds the browser half into DSH's module-loader factory format:
 * `window.__ModuleLoader__.load({ id, factory })` (shape verified against the
 * installed `@deepseek-ai/dsh-client-ui-settings-models/lib/client.js`).
 *
 * Steps: esbuild bundles `src/client/index.tsx` to CommonJS with react and
 * `react/jsx-runtime` kept external (the platform provides them), then the output
 * is wrapped into the loader factory. No DSH client packages are imported as
 * values — only the cordis context is used at runtime.
 *
 * Usage: npm run build
 */
import { build } from 'esbuild'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

const result = await build({
  entryPoints: [resolve(root, 'src/client/index.tsx')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'],
  loader: { '.json': 'json' },
  minify: process.env.NODE_ENV === 'production',

  write: false,
  legalComments: 'none',
})

const body = result.outputFiles[0].text
  .split('\n')
  .map((line) => (line.length > 0 ? `\t\t${line}` : line))
  .join('\n')

const out = `window.__ModuleLoader__.load({
\tid: "${pkg.name}",
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
${body}
\t\treturn module.exports;
\t}
});
`

mkdirSync(resolve(root, 'lib'), { recursive: true })
writeFileSync(resolve(root, 'lib/client.js'), out)
console.log(`lib/client.js: ${Math.round(out.length / 1024)} KB`)
