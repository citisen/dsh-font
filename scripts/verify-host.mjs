/**
 * Verify the host half without a running DSH: import `lib/index.js`, exercise
 * the pure builders against the real `@deepseek-ai/schemastery`, execute the
 * emitted pre-paint bootstrap against a DOM stub, and drive `apply(ctx)` with a
 * stub context to prove the namespace registers and the index-injection row
 * reaches the webserver table.
 *
 * Usage:
 *   node scripts/verify-host.mjs
 */

import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Import `lib/index.js` through the installed profile when one exists.
 *
 * The host half imports `@deepseek-ai/schemastery`, which dsh supplies to a
 * plugin from the installation's module fallback rather than from the plugin's
 * own tree. Importing through the profile link reproduces that resolution, so
 * this check also proves the plugin's runtime dependencies actually resolve at
 * the place dsh will load it from. Falling back to the direct path keeps the
 * check usable in a bare checkout.
 */
async function importHost() {
  const dshHome = process.env.DSH_HOME
  const profile = process.env.DSH_PROFILE ?? 'web'
  if (dshHome !== undefined) {
    const anchor = join(dshHome, 'profiles', profile, 'package.json')
    if (existsSync(anchor)) {
      try {
        // Resolve the bare specifier: `exports` maps "." to lib/index.js, and a
        // direct `dsh-font/lib/index.js` path is deliberately not exported.
        const resolved = createRequire(anchor).resolve('dsh-font')
        return { host: await import(pathToFileURL(resolved).href), via: resolved }
      } catch {
        /* not installed in that profile; fall through to the direct import */
      }
    }
  }
  const direct = join(root, 'lib', 'index.js')
  return { host: await import(pathToFileURL(direct).href), via: direct }
}

const { host, via } = await importHost()
console.log(`verify-host: loaded ${via}`)

const {
  FONT_SETTINGS_NAMESPACE,
  FontSettingsSchema,
  DEFAULT_UI_FONT_FAMILY,
  DEFAULT_CODE_FONT_FAMILY,
  FONT_STYLE_ID,
  fontStyleSheet,
  fontBootstrapScript,
  fontInjection,
  apply,
} = host

assert.equal(FONT_SETTINGS_NAMESPACE, 'ui-font')

// The schema resolves a complete default section — what an absent settings
// document must produce for the pre-paint bootstrap to be a no-op.
const defaults = FontSettingsSchema({})
assert.equal(defaults.uiFontFamily, DEFAULT_UI_FONT_FAMILY)
assert.equal(defaults.codeFontFamily, DEFAULT_CODE_FONT_FAMILY)
assert.equal(defaults.uiFontScale, 1)
assert.equal(defaults.contentFontSize, 14)
assert.equal(defaults.codeFontSize, 12)

// Out-of-range values must be rejected at the wire boundary.
assert.throws(() => FontSettingsSchema({ contentFontSize: 99 }))
assert.throws(() => FontSettingsSchema({ uiFontScale: 0.1 }))

// The pre-paint sheet carries the scale and both size axes, one rule per
// hard-coded UI text step.
const sheet = fontStyleSheet(defaults)
assert.match(sheet, /--dsh-font-ui-scale:1;/)
assert.match(sheet, /--dsh-font-content-size:14px/)
assert.match(sheet, /--dsh-font-code-size:12px/)
assert.match(sheet, /font-size:calc\(14px \* var\(--dsh-font-ui-scale,1\)\) !important/)
for (const step of [11, 12, 13, 14, 16, 20, 24]) {
  assert.ok(sheet.includes(`calc(${String(step)}px * `), `missing scale rule for ${String(step)}px`)
}

const script = fontBootstrapScript(defaults)
assert.ok(script.includes(JSON.stringify(FONT_STYLE_ID)), 'bootstrap must key on the stylesheet id')
assert.ok(!script.includes('</script'), 'bootstrap must not close its own script element')

// Execute the bootstrap against a DOM stub and read back what it wrote.
const appended = []
const created = []
const element = () => ({
  id: '',
  textContent: '',
  dataset: {},
  appendChild: (child) => appended.push(child),
})
const rootStyle = new Map()
globalThis.document = {
  head: element(),
  documentElement: { style: { setProperty: (name, value) => rootStyle.set(name, value) } },
  getElementById: () => null,
  createElement: (tag) => {
    const node = { ...element(), tagName: tag }
    created.push(node)
    return node
  },
}
globalThis.console = console
// eslint-disable-next-line no-eval -- the emitted pre-paint script is a classic script by contract
;(0, eval)(script)

assert.equal(created.length, 1)
assert.equal(created[0].tagName, 'style')
assert.equal(created[0].id, FONT_STYLE_ID)
assert.match(created[0].textContent, /--dsh-font-ui-scale:1;/)
assert.equal(appended.length, 1)
assert.equal(rootStyle.get('--dsw-font-family'), DEFAULT_UI_FONT_FAMILY)
assert.equal(rootStyle.get('--ds-font-family-code'), DEFAULT_CODE_FONT_FAMILY)
delete globalThis.document

// A non-default section must flow through both the sheet and the script.
const custom = { ...defaults, uiFontScale: 1.25, contentFontSize: 16, codeFontSize: 13 }
assert.match(fontStyleSheet(custom), /--dsh-font-content-size:16px/)
assert.match(fontStyleSheet(custom), /font-size:calc\(16px \* var\(--dsh-font-ui-scale,1\)\)/)

const injection = fontInjection(defaults)
assert.equal(injection.kind, 'script')
assert.equal(injection.placement, 'head')

// Drive apply(ctx) with a stub that records the namespace and the injection.
const registered = []
const listeners = new Map()
let injectedSettings
const ctx = {
  inject(deps, callback) {
    assert.deepEqual(deps, ['settings'])
    injectedSettings = {
      settings: {
        register(namespace, schema) {
          registered.push({ namespace, schema })
        },
      },
    }
    callback(injectedSettings)
  },
  on(event, listener) {
    listeners.set(event, listener)
  },
  get(name) {
    return name === 'settings' ? injectedSettings.settings : undefined
  },
}

apply(ctx)

assert.equal(registered.length, 1)
assert.equal(registered[0].namespace, 'ui-font')
assert.ok(registered[0].schema !== undefined)

const table = []
listeners.get('webserver/index-inject')(table)
assert.equal(table.length, 1)
assert.equal(table[0].kind, 'script')

// With no provider at all, apply() must still answer the injection table with
// the schema defaults rather than throwing.
const bareListeners = new Map()
apply({
  inject: () => undefined,
  on: (event, listener) => bareListeners.set(event, listener),
  get: () => undefined,
})
const bareTable = []
bareListeners.get('webserver/index-inject')(bareTable)
assert.equal(bareTable.length, 1)
assert.match(bareTable[0].text, /--dsh-font-ui-scale:1;/)

console.log('verify-host: OK — namespace registered, pre-paint script executed, injection row emitted')
console.log(`verify-host: stylesheet ${String(sheet.length)} chars, script ${String(script.length)} chars`)
