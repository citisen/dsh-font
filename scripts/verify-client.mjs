/**
 * Load an emitted DSH client bundle in Node, assert its envelope, and then run
 * `apply(ctx)` against stub services to prove the presentation path works.
 *
 * A broken client bundle otherwise fails only in the browser, where the
 * diagnostic is a console error inside the boot audit. This check makes the
 * cheap-to-catch failure modes — a bundle that registers nothing, one whose
 * factory throws, one that paints nothing, one that registers no Settings row —
 * fail on the command line instead.
 *
 * Usage:
 *   node scripts/verify-client.mjs [path/to/lib/client.js]
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bundlePath = resolve(process.argv[2] ?? join(root, 'lib', 'client.js'))
const source = readFileSync(bundlePath, 'utf8')

/** Minimal React stub: enough for the row component to build a tree. */
const react = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useCallback: (fn) => fn,
  useEffect: () => undefined,
  useRef: (value) => ({ current: value }),
  useState: (value) => [value, () => undefined],
}

/** A tiny observable store, matching the `@deepseek-ai/dsh-client-store` face. */
const stores = []
const storeModule = {
  defineStore: (spec) => {
    const state = spec.init()
    const listeners = new Set()
    const handle = {
      spec,
      state,
      create: () =>
        Object.fromEntries(
          Object.entries(spec.actions).map(([name, action]) => [
            name,
            (...args) => {
              action(state, ...args)
              for (const listener of listeners) listener()
            },
          ]),
        ),
      getSnapshot: () => state,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }
    stores.push(handle)
    return handle
  },
}

const stubs = {
  react,
  'react/jsx-runtime': { jsx: react.createElement, jsxs: react.createElement },
  'react-dom': {},
  'react-dom/client': {},
  '@deepseek-ai/cordis': {},
  '@deepseek-ai/dsh-client-store': storeModule,
  '@deepseek-ai/dsh-client-ui-slots': {},
  '@deepseek-ai/dsh-client-ui-primitives': new Proxy(
    {},
    { get: (_target, key) => (key === 'then' ? undefined : () => null) },
  ),
  '@deepseek-ai/dsh-client-ui-dockkit': {},
}

const registrations = []
globalThis.window = {
  __ModuleLoader__: {
    load(registration) {
      registrations.push(registration)
    },
  },
}

const requested = []
const requireStub = (specifier) => {
  requested.push(specifier)
  if (!(specifier in stubs)) throw new Error(`unknown platform module "${specifier}"`)
  return stubs[specifier]
}

// eslint-disable-next-line no-eval -- the bundle is a classic script by contract
;(0, eval)(source)

assert.equal(registrations.length, 1, 'the bundle must register exactly one factory')
const [registration] = registrations
assert.equal(registration.id, 'dsh-font')
assert.equal(typeof registration.factory, 'function')

const plugin = registration.factory(requireStub)
assert.equal(typeof plugin.apply, 'function', 'bundle must export apply()')
assert.ok(Array.isArray(plugin.inject), 'bundle must export inject as an array')
assert.deepEqual(plugin.inject, ['slots', 'locale', 'settingsScope'])
assert.equal(typeof plugin.fontStyleSheet, 'function')
assert.equal(typeof plugin.applyFonts, 'function')

// ── the stylesheet builder ──────────────────────────────────────────────────
const section = {
  uiFontFamily: 'Inter, sans-serif',
  codeFontFamily: '"JetBrains Mono", monospace',
  uiFontScale: 1.25,
  contentFontSize: 16,
  codeFontSize: 13,
}
const sheet = plugin.fontStyleSheet(section)
assert.match(sheet, /--dsh-font-ui-scale:1\.25;/)
assert.match(sheet, /--dsh-font-code-size:13px;/)
// The content size is an INLINE custom property on `body` (ui-layout's theme
// presenter owns that declaration), so the sheet must not declare it — an
// inline value would win and nothing here could override it.
assert.ok(
  !sheet.includes('--dsh-content-font-size:'),
  'the sheet must not declare the inline-owned content size',
)
assert.match(sheet, /\.dsh-font-size-14\{font-size:calc\(14px \* var\(--dsh-font-ui-scale,1\)\) !important\}/)
for (const step of [11, 12, 13, 14, 16, 20, 24]) {
  assert.ok(sheet.includes(`.dsh-font-size-${String(step)}{`), `missing scale class for ${String(step)}px`)
}
// The scale is stamped per element, never inherited from a universal rule.
assert.ok(
  !sheet.includes('html body,html body *'),
  'the scale must not be a universal rule (it would compound with the content size)',
)

// The conversation ladder must be absolute px derived from the content slider.
assert.match(sheet, /--dsh-font-markdown-h1:700 calc\(16px \+ 7px\) \/ calc\(16px \+ 16px\)/)
assert.match(sheet, /--dsh-font-markdown-base:var\(--dsh-font-conversation-size,14px\) \/ calc\(16px \+ 10px\)/)
assert.match(sheet, /--dsw-font-markdown-code-block-font-size:var\(--dsh-font-code-size,12px\) !important;/)

// A different content size must move the ladder, not just the base variable.
const bigger = plugin.fontStyleSheet({ ...section, contentFontSize: 20 })
assert.match(bigger, /--dsh-font-markdown-h1:700 calc\(20px \+ 7px\) \/ calc\(20px \+ 16px\)/)
assert.notEqual(bigger, sheet)

// ── applyFonts against a DOM stub ───────────────────────────────────────────
const appended = []
const styleTags = []
const rootProperties = new Map()
const bodyProperties = new Map()
const makeNode = (tagName) => ({
  tagName,
  id: '',
  textContent: '',
  dataset: {},
  className: '',
  appendChild: (child) => appended.push(child),
  querySelectorAll: () => [],
  classList: { add: () => undefined, remove: () => undefined },
  getAttribute: () => null,
})
globalThis.document = {
  head: makeNode('head'),
  body: { ...makeNode('body'), style: { setProperty: (name, value) => bodyProperties.set(name, value) } },
  documentElement: { style: { setProperty: (name, value) => rootProperties.set(name, value) } },
  getElementById: (id) => styleTags.find((tag) => tag.id === id) ?? null,
  createElement: (tagName) => {
    const node = makeNode(tagName)
    styleTags.push(node)
    return node
  },
}
globalThis.console = console

plugin.applyFonts(section)
assert.equal(styleTags.length, 1, 'applyFonts must create one stylesheet')
assert.equal(styleTags[0].tagName, 'style')
assert.equal(styleTags[0].id, 'dsh-font/variables')
assert.equal(styleTags[0].dataset.plugin, 'dsh-font')
assert.match(styleTags[0].textContent, /\.dsh-font-size-14\{/)
assert.equal(rootProperties.get('--dsw-font-family'), 'Inter, sans-serif')
assert.equal(rootProperties.get('--ds-font-family-code'), '"JetBrains Mono", monospace')
// The content size must be written where ui-layout writes it, or the inline
// presenter value would win over the stylesheet.
assert.equal(bodyProperties.get('--dsh-content-font-size'), '16px')

// Re-applying must rewrite the same tag, not accumulate stylesheets.
plugin.applyFonts({ ...section, contentFontSize: 18, uiFontScale: 1 })
assert.equal(styleTags.length, 1, 'applyFonts must reuse its own stylesheet tag')
assert.match(styleTags[0].textContent, /--dsh-font-ui-scale:1;/)
assert.equal(bodyProperties.get('--dsh-content-font-size'), '18px')

// ── the interface-scale stamping pass ───────────────────────────────────────
// A fake tree whose computed sizes are the shipped ones.
const sizes = new Map()
const fakeElement = (size, extras = {}) => {
  const classes = new Set()
  const element = {
    className: 'x',
    classList: {
      contains: (name) => classes.has(name),
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
    },
    getAttribute: () => null,
    classes,
    ...extras,
  }
  sizes.set(element, `${String(size)}px`)
  return element
}
const shipped14 = fakeElement(14)
const shipped12 = fakeElement(12)
const shipped9 = fakeElement(9)
const shipped17 = fakeElement(17)
const inlineStyled = fakeElement(16)
inlineStyled.className = ''
inlineStyled.getAttribute = (name) => (name === 'style' ? 'color:red' : null)

const allElements = [shipped14, shipped12, shipped9, shipped17, inlineStyled]
const stampedSelector = /\.dsh-font-size-(\d+)(?:,|$)/
globalThis.document = {
  head: makeNode('head'),
  body: {
    ...makeNode('body'),
    style: { setProperty: () => undefined },
    querySelectorAll: (selector) =>
      selector.startsWith('.dsh-font-size-')
        ? allElements.filter((element) => [...element.classes].some((name) => name.startsWith('dsh-font-size-')))
        : allElements,
  },
  documentElement: { style: { setProperty: () => undefined } },
  getElementById: () => null,
  createElement: (tagName) => makeNode(tagName),
}
globalThis.getComputedStyle = (element) => ({ fontSize: sizes.get(element) ?? '' })

plugin.applyFonts({ ...section, uiFontScale: 1.25 })
assert.ok(shipped14.classes.has('dsh-font-size-14'), '14px must be stamped')
assert.ok(shipped12.classes.has('dsh-font-size-12'), '12px must be stamped')
assert.ok(inlineStyled.classes.has('dsh-font-size-16'), 'inline-styled 16px must be stamped')
assert.equal(shipped9.classes.size, 0, 'an unlisted size must not be stamped')
assert.equal(shipped17.classes.size, 0, 'an unlisted size must not be stamped')

// A repeat pass reuses the measurement and does not duplicate stamps.
plugin.applyFonts({ ...section, uiFontScale: 1.5 })
assert.equal(shipped14.classes.size, 1, 'a repeat pass must not accumulate stamps')

// Returning to 1 must clear every stamp.
plugin.applyFonts({ ...section, uiFontScale: 1 })
assert.equal(shipped14.classes.size, 0, 'scale 1 must clear the stamps')
assert.equal(inlineStyled.classes.size, 0, 'scale 1 must clear the stamps')
void stampedSelector

// Restore a recording DOM for the remaining checks.
rootProperties.clear()
bodyProperties.clear()
globalThis.document = {
  head: makeNode('head'),
  body: { ...makeNode('body'), style: { setProperty: (name, value) => bodyProperties.set(name, value) } },
  documentElement: { style: { setProperty: (name, value) => rootProperties.set(name, value) } },
  getElementById: (id) => styleTags.find((tag) => tag.id === id) ?? null,
  createElement: (tagName) => {
    const node = makeNode(tagName)
    styleTags.push(node)
    return node
  },
}

// ── apply(ctx) end to end ───────────────────────────────────────────────────
const themeOverrides = []
const registeredSlots = []
const dictionaries = []
const locale = {
  register: (namespace, dict) => {
    dictionaries.push({ namespace, dict })
    return () => undefined
  },
}

let scopeListener
const scope = {
  getSnapshot: () => ({
    status: 'ready',
    value: section,
    revision: 7,
    writable: true,
    mode: 'host',
  }),
  subscribe: (listener) => {
    scopeListener = listener
    return () => undefined
  },
  set: () => Promise.resolve(),
  unset: () => Promise.resolve(),
}

const ctx = {
  effect: (execute) => {
    execute()
    return { dispose: () => undefined }
  },
  on: () => undefined,
  get: (name) => (name === 'theme' ? { overrideTokens: (source, tokens) => themeOverrides.push({ source, tokens }) } : undefined),
  locale,
  settingsScope: { bind: (spec) => (assert.equal(spec.namespace, 'ui-font'), scope) },
  slots: {
    inject: (name, callback) => {
      assert.equal(name, 'settings.general.item')
      callback()
    },
    register: (options, component) => {
      registeredSlots.push({ options, component })
      return () => undefined
    },
  },
}

plugin.apply(ctx)

assert.equal(themeOverrides.length, 1, 'the families must be stacked onto the theme')
assert.equal(themeOverrides[0].source, 'dsh-font')
assert.deepEqual(Object.keys(themeOverrides[0].tokens).sort(), ['--ds-font-family-code', '--dsw-font-family'])
assert.equal(themeOverrides[0].tokens['--dsw-font-family'].light, section.uiFontFamily)
assert.equal(themeOverrides[0].tokens['--dsw-font-family'].dark, section.uiFontFamily)

assert.equal(dictionaries.length, 1)
assert.deepEqual(Object.keys(dictionaries[0].dict.zh).sort(), Object.keys(dictionaries[0].dict.en).sort())

assert.equal(registeredSlots.length, 1)
const [{ options, component }] = registeredSlots
assert.equal(options.id, 'font')
assert.equal(options.name, 'settings.general.item')
assert.equal(options.locale, 'settings.font')
assert.ok(stores.length >= 1, 'the row must register a store')
assert.equal(typeof component, 'function')

// The row's inject face must expose the two write paths.
const actions = options.inject(options.store.create())
assert.equal(typeof actions.setField, 'function')
assert.equal(typeof actions.reset, 'function')

// The component must render a tree containing the localized labels.
const rendered = component({
  t: (key) => key,
  useStore: (selector) => selector(options.store.getSnapshot()),
  ...actions,
})
const labels = []
const collect = (node) => {
  if (node === null || node === undefined) return
  if (typeof node === 'string' || typeof node === 'number') {
    labels.push(String(node))
    return
  }
  if (typeof node !== 'object') return
  const children = Array.isArray(node.children) ? node.children : [node.children]
  for (const child of children) collect(child)
  // `Field` and `SliderControl` carry their copy in props, because the stubs
  // above do not render function components.
  collect(node.props?.children)
  for (const key of ['label', 'value', 'hint', 'ariaLabel', 'placeholder']) {
    collect(node.props?.[key])
  }
}
collect(rendered)
for (const key of [
  'font.title',
  'font.uiFamily',
  'font.codeFamily',
  'font.uiScale',
  'font.contentSize',
  'font.codeSize',
  'font.reset',
]) {
  assert.ok(labels.includes(key), `rendered row is missing ${key}`)
}

// A pushed settings change must repaint.
rootProperties.clear()
scopeListener()
assert.equal(rootProperties.get('--dsw-font-family'), section.uiFontFamily)

delete globalThis.document

console.log('verify-client: OK — envelope, stylesheet, theme stacking, and settings row all verified')
console.log(`verify-client: factory required ${requested.join(', ')}`)
