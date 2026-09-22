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
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Import `lib/index.js`, either from a path given on the command line or from
 * an installed profile.
 *
 * The host half imports `@deepseek-ai/schemastery`, which dsh supplies to a
 * plugin from the installation's module fallback rather than from the plugin's
 * own tree. Importing through the profile link reproduces that resolution, so
 * this check also proves the plugin's runtime dependencies actually resolve at
 * the place dsh will load it from. Falling back to the direct path keeps the
 * check usable in a bare checkout.
 *
 * Note that importing through a directory junction resolves to its real path,
 * so pass the installed `lib/index.js` explicitly to exercise a published copy
 * rather than a linked one.
 */
async function importHost() {
  const explicit = process.argv[2] ?? process.env.DSH_FONT_HOST
  if (explicit !== undefined) {
    return { host: await import(pathToFileURL(resolve(explicit)).href), via: resolve(explicit) }
  }
  const dshHome = process.env.DSH_HOME
  const profile = process.env.DSH_PROFILE ?? 'web'
  if (dshHome !== undefined) {
    const anchor = join(dshHome, 'profiles', profile, 'package.json')
    if (existsSync(anchor)) {
      try {
        // Resolve the bare specifier: `exports` maps "." to lib/index.js, and a
        // direct `dsh-font/lib/index.js` path is deliberately not exported.
        const resolved = createRequire(anchor).resolve('@citisen/dsh-font')
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
  Config,
  DEFAULT_UI_FONT_FAMILY,
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_CODE_FONT_WEIGHT,
  DEFAULT_UI_FONT_WEIGHT,
  FONT_WEIGHTS,
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
assert.equal(defaults.codeFontWeight, DEFAULT_CODE_FONT_WEIGHT)
assert.equal(defaults.uiFontWeight, DEFAULT_UI_FONT_WEIGHT)
assert.equal(DEFAULT_UI_FONT_WEIGHT, 400, 'the shipped interface weight is the design system base')
assert.equal(defaults.uiFontScale, 1)
assert.equal(defaults.contentFontSize, 14)
assert.equal(defaults.codeFontSize, 12)

// The weight is a closed vocabulary, not a free number: a weight no family is
// guaranteed to have would be synthesized by the browser (faux-bold), so it
// must be rejected at the wire boundary rather than painted.
assert.deepEqual(FONT_WEIGHTS, [100, 200, 300, 400, 500, 600, 700, 800, 900])
for (const weight of FONT_WEIGHTS) {
  assert.equal(FontSettingsSchema({ codeFontWeight: weight }).codeFontWeight, weight)
  assert.equal(FontSettingsSchema({ uiFontWeight: weight }).uiFontWeight, weight)
}
assert.throws(() => FontSettingsSchema({ codeFontWeight: 550 }))
assert.throws(() => FontSettingsSchema({ codeFontWeight: 0 }))
assert.throws(() => FontSettingsSchema({ codeFontWeight: '500' }))
assert.throws(() => FontSettingsSchema({ uiFontWeight: 550 }))
assert.throws(() => FontSettingsSchema({ uiFontWeight: 'medium' }))

// Out-of-range values must be rejected at the wire boundary.
assert.throws(() => FontSettingsSchema({ contentFontSize: 99 }))
assert.throws(() => FontSettingsSchema({ uiFontScale: 0.1 }))

// The pre-paint sheet carries the scale and both size axes, one rule per
// hard-coded UI text step — and the code weight, which the design system has no
// token of its own for.
const sheet = fontStyleSheet(defaults)
assert.match(sheet, /--dsh-font-ui-scale:1;/)
assert.match(sheet, /--dsh-font-content-size:14px/)
assert.match(sheet, /--dsh-font-code-size:12px/)
assert.match(sheet, /--dsh-font-code-weight:400;/)
assert.match(sheet, /font-size:calc\(14px \* var\(--dsh-font-ui-scale,1\)\) !important/)
for (const step of [11, 12, 13, 14, 16, 20, 24]) {
  assert.ok(sheet.includes(`calc(${String(step)}px * `), `missing scale rule for ${String(step)}px`)
}

// The interface weight is opted into: the shipped 400 emits no rule at all, so
// a default install's first frame is exactly what the design system paints.
assert.ok(
  !/font-weight:/.test(sheet),
  'the shipped interface weight must not emit a weight rule',
)
const heavy = fontStyleSheet({ ...defaults, uiFontWeight: 500 })
assert.match(heavy, /html body\{font-weight:500\}/)

const script = fontBootstrapScript(defaults)
assert.ok(script.includes(JSON.stringify(FONT_STYLE_ID)), 'bootstrap must key on the stylesheet id')
assert.ok(!script.includes('</script'), 'bootstrap must not close its own script element')
assert.ok(!script.includes('font-weight'), 'the default bootstrap must carry no weight rule')
assert.ok(
  fontBootstrapScript({ ...defaults, uiFontWeight: 500 }).includes('font-weight:500'),
  'a set interface weight must reach the pre-paint bootstrap',
)

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
assert.equal(rootStyle.get('--dsh-font-code-weight'), '400')
delete globalThis.document

// A non-default section must flow through both the sheet and the script.
const custom = {
  ...defaults,
  uiFontScale: 1.25,
  contentFontSize: 16,
  codeFontSize: 13,
  codeFontWeight: 500,
}
assert.match(fontStyleSheet(custom), /--dsh-font-content-size:16px/)
assert.match(fontStyleSheet(custom), /--dsh-font-code-weight:500;/)
assert.match(fontStyleSheet(custom), /font-size:calc\(16px \* var\(--dsh-font-ui-scale,1\)\)/)
assert.ok(fontBootstrapScript(custom).includes('--dsh-font-code-weight'))

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

// ── the 0.1.7 line: the entry's Config is the section ──────────────────────
//
// That line's settings service has `configure` and no `register`: the durable
// section is the entry's own exported `Config` (fields marked `.volatile()`, which
// is how the configuration editor knows what it may write). The pre-paint script
// then reads the *resolved configuration* the loader hands `apply`, because there
// is no registered namespace to read.
{
  const configured = []
  const errors = []
  const fiber = { name: 'font' }
  const configListeners = new Map()
  const ctx071 = {
    fiber,
    inject: (_deps, callback) => {
      callback({
        effect: (execute) => {
          execute()
          return { dispose: () => undefined }
        },
        settings: {
          configure: (presentation, owner) => {
            configured.push({ presentation, owner })
            return () => undefined
          },
        },
        logger: { error: (message) => errors.push(message) },
      })
    },
    on: (event, listener) => configListeners.set(event, listener),
    get: () => undefined,
  }

  apply(ctx071, { uiFontFamily: 'Inter Tight, sans-serif' })

  assert.equal(configured.length, 1, 'the generated page must be turned off exactly once')
  assert.deepEqual(configured[0].presentation, { auto: false })
  assert.equal(configured[0].owner, fiber, 'the policy belongs to this plugin fiber')
  assert.deepEqual(errors, [], 'the 0.1.7 settings API is supported, not reported')

  const configTable = []
  configListeners.get('webserver/index-inject')(configTable)
  assert.equal(configTable.length, 1)
  assert.match(
    configTable[0].text,
    /Inter Tight, sans-serif/,
    'the resolved configuration must reach the pre-paint script',
  )
}

// Every field the durable schema validates must also be offered to the 0.1.7
// configuration editor, or a preference would exist on one line and be missing
// from the other.
{
  assert.ok(Config !== undefined, 'the entry must export a Config for the 0.1.7 line')
  const durable = Object.keys(FontSettingsSchema({})).sort()
  const editable = Object.keys(Config({})).sort()
  assert.deepEqual(editable, durable, 'the two schemas must describe the same fields')
  // Only volatile fields are exposed to the 0.1.7 configuration editor, and this
  // verifier runs against the copy of schemastery that exposes no `.volatile()` at
  // all — so this is the assertion that catches a marking that silently did
  // nothing, which is what made dsh refuse to import this entry's settings.
  for (const [field, schema] of Object.entries(Config.dict ?? {})) {
    assert.equal(
      schema.meta.volatile,
      true,
      `${field} must be marked volatile, or the 0.1.7 configuration editor cannot write it`,
    )
  }
}

// A settings service with neither call is a dsh whose settings model moved again.
// Registering is impossible there, so the plugin's job is to say why, in its own
// words, instead of leaving an opaque TypeError beside a boot audit about plugin
// activation.
{
  const errors = []
  apply({
    inject: (_deps, callback) => {
      callback({ settings: {}, logger: { error: (message) => errors.push(message) } })
    },
    on: () => undefined,
    get: () => undefined,
  })
  assert.equal(errors.length, 1, 'the unsupported settings API must be reported')
  assert.match(errors[0], /settings\.register/)
  assert.match(errors[0], /settings\.configure/)
  assert.match(errors[0], /ui-font/)
  assert.match(errors[0], /0\.1\.5-rc\.x/)
}

console.log('verify-host: OK — namespace registered, pre-paint script executed, injection row emitted')
console.log(`verify-host: stylesheet ${String(sheet.length)} chars, script ${String(script.length)} chars`)
