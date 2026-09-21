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
 *
 * The editor engine is imported here as well as compiled into the bundle under
 * test. That is deliberate: the plugin's grammar is its own code, and running it
 * through the very engine the browser runs it through — `inspect`, `resolveHover`,
 * `complete`, `applyCompletion` — is the only honest way to assert what it paints,
 * explains, and offers. It is a devDependency for exactly this reason.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyCompletion, complete, inspect, resolveHover } from '@citisen/litearea'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bundlePath = resolve(process.argv[2] ?? join(root, 'lib', 'client.js'))
const source = readFileSync(bundlePath, 'utf8')

/** The package name, which the bundle id must equal. */
const PACKAGE_NAME = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name

/**
 * Minimal React stub: enough to build a tree, plus enough hook state to drive
 * interactions.
 *
 * Only ONE component instance may hold live hook state at a time, because the
 * slots are keyed by `useState` call order. `mount()` therefore creates that
 * instance: it returns a `render(props)` that seeds fresh slots on the first
 * call and reuses them afterwards, so a state write followed by a re-render
 * behaves like the real thing. A previous instance's slots are discarded, which
 * is what keeps one harness from clobbering another's.
 *
 * `useEffect` is deliberately inert: nothing under test depends on an effect
 * having run, and the components only use effects for work the tests drive
 * explicitly.
 *
 * @returns `{ render, state }`.
 */
function mount() {
  let slots
  const state = () => slots
  const render = (component, props) => {
    if (slots === undefined) slots = [] // first render of this instance
    react.__hookIndex = 0
    react.__slots = slots
    return component(props)
  }
  return { render, state }
}

const react = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useCallback: (fn) => fn,
  useEffect: () => undefined,
  useRef: (value) => ({ current: value }),
  useState: (value) => {
    const slots = react.__slots ?? (react.__slots = [])
    const index = react.__hookIndex ?? 0
    if (slots.length <= index) slots.push(value)
    react.__hookIndex = index + 1
    return [
      slots[index],
      (next) => {
        slots[index] = typeof next === 'function' ? next(slots[index]) : next
      },
    ]
  },
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
assert.equal(registration.id, PACKAGE_NAME)
assert.equal(typeof registration.factory, 'function')

const plugin = registration.factory(requireStub)
assert.equal(typeof plugin.apply, 'function', 'bundle must export apply()')
assert.ok(Array.isArray(plugin.inject), 'bundle must export inject as an array')
assert.deepEqual(plugin.inject, ['slots', 'locale', 'settingsScope'])
assert.equal(typeof plugin.fontStyleSheet, 'function')
assert.equal(typeof plugin.applyFonts, 'function')
assert.equal(typeof plugin.parseFamilyList, 'function')
assert.equal(typeof plugin.serializeFamilyList, 'function')
assert.equal(typeof plugin.normalizeWeight, 'function')
// Every name below is what the build re-exports, and the list is kept to what
// this plugin still owns: the parse and the serialization of the two settings,
// the grammar that describes their language, and the row. The hand-rolled
// editor's matcher, tokenizer, popup, and highlight index are gone with it — see
// the note where their tests used to be.
assert.equal(Array.isArray(plugin.GENERIC_FAMILIES), true, 'the generic families must be exported')
assert.equal(Array.isArray(plugin.COMMON_FAMILIES), true, 'the curated families must be exported')
for (const name of [
  'weightWord',
  'faceWeights',
  'emphasisWeight',
  'parseFontQuery',
  'serializeFontQuery',
  'asQuery',
  'storedQuery',
  'applyFontQuery',
  'moveFontQueryEntry',
  'reorderFontQueryEntry',
  'describeDiagnostic',
  'diagnosticKind',
  'dshFontQueryGrammar',
  'FontQueryEditor',
]) {
  assert.equal(typeof plugin[name], 'function', `the bundle must export ${name}()`)
}

// ── the family list: parse and serialize ────────────────────────────────────
// A naive `split(',')` is the obvious implementation and it is wrong: a quoted
// family may itself contain a comma, and CSS allows that.
assert.deepEqual(plugin.parseFamilyList('Inter, "PingFang SC", sans-serif'), [
  'Inter',
  'PingFang SC',
  'sans-serif',
])
assert.deepEqual(plugin.parseFamilyList('"Foo, Bar", monospace'), ['Foo, Bar', 'monospace'])
assert.deepEqual(plugin.parseFamilyList("'Single Quoted', serif"), ['Single Quoted', 'serif'])
assert.deepEqual(plugin.parseFamilyList('  Arial  ,  , Helvetica '), ['Arial', 'Helvetica'])
assert.deepEqual(plugin.parseFamilyList(''), [])
assert.deepEqual(plugin.parseFamilyList(undefined), [])

// Serialization quotes only what CSS requires. Quoting a generic family would
// name a literal font instead of the generic one, which breaks silently.
assert.equal(
  plugin.serializeFamilyList(['Inter', 'PingFang SC', 'sans-serif']),
  'Inter, "PingFang SC", sans-serif',
)
assert.equal(plugin.serializeFamilyList(['Foo, Bar', 'monospace']), '"Foo, Bar", monospace')
assert.equal(
  plugin.serializeFamilyList(['Segoe UI Variable', 'system-ui']),
  '"Segoe UI Variable", system-ui',
)

// Round-tripping must be stable: this property is what lets the plain CSS
// string stay the stored form with no schema change and no migration.
for (const value of [
  'Inter, "PingFang SC", sans-serif',
  '"SF Mono", "JetBrains Mono", Consolas, monospace',
  '"Foo, Bar", "Baz, Qux", serif',
]) {
  assert.equal(
    plugin.serializeFamilyList(plugin.parseFamilyList(value)),
    value,
    `round-trip changed ${value}`,
  )
}

// ── the suggestion space ────────────────────────────────────────────────────
// `rankFamilyMatches` was this plugin's own fuzzy matcher, and it went with the
// popup it fed: ranking is `@citisen/litearea`'s `rank()`, and that library's own
// suite is where it is asserted from now on. What this plugin still owns is the
// SET the list ranks over — the curated fallback, which is what a machine whose
// fonts cannot be read still gets, and the generic families — and the grammar
// built from those two is checked further down.
assert.ok(plugin.COMMON_FAMILIES.includes('Inter'))
assert.ok(plugin.COMMON_FAMILIES.includes('JetBrains Mono'))
assert.ok(plugin.COMMON_FAMILIES.includes('Microsoft YaHei'))
assert.deepEqual(
  plugin.COMMON_FAMILIES,
  [...new Set(plugin.COMMON_FAMILIES)],
  'the curated list must not repeat a name',
)
assert.ok(plugin.GENERIC_FAMILIES.includes('monospace'))
assert.ok(plugin.GENERIC_FAMILIES.includes('ui-monospace'))
// Nothing curated may be a generic family. The two are painted differently, and a
// generic must never be quoted, so a name in both would be a contradiction.
{
  const generics = new Set(plugin.GENERIC_FAMILIES.map((name) => name.toLowerCase()))
  assert.deepEqual(
    plugin.COMMON_FAMILIES.filter((name) => generics.has(name.toLowerCase())),
    [],
  )
}

// The build must have substituted the template's identity placeholder, or the
// bundle would register the placeholder instead of the real package name.
assert.ok(
  !source.includes('dsh:plugin-id'),
  'the identity placeholder must be substituted at build time',
)

// ── the stylesheet builder ──────────────────────────────────────────────────
const section = {
  uiFontFamily: 'Inter, sans-serif',
  codeFontFamily: '"JetBrains Mono", monospace',
  codeFontWeight: 500,
  uiFontScale: 1.25,
  contentFontSize: 16,
  codeFontSize: 13,
}
const sheet = plugin.fontStyleSheet(section)
assert.match(sheet, /--dsh-font-ui-scale:1\.25;/)
assert.match(sheet, /--dsh-font-code-size:13px;/)
assert.match(sheet, /--dsh-font-code-weight:500;/)
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

// The code weight has no design-system token of its own, so it rides in the
// `font:` value of every code token — a bare `font-family` cannot carry it, and
// the shipped ladder is a literal 400 that nothing else would move. The size
// and line-height must survive the substitution untouched.
assert.match(sheet, /--dsw-font-markdown-code:var\(--dsh-font-code-weight,400\) var\(--dsh-font-code-size,12px\) \/ calc\(var\(--dsh-font-code-size,12px\) \+ 7px\)/)
assert.match(sheet, /--dsw-font-markdown-code-block:var\(--dsh-font-code-weight,400\) var\(--dsh-font-code-size,12px\) \/ calc\(var\(--dsh-font-code-size,12px\) \+ 8px\)/)
assert.match(sheet, /--dsw-font-markdown-code-block-small:var\(--dsh-font-code-weight,400\) calc\(var\(--dsh-font-code-size,12px\) - 1px\) \/ calc\(var\(--dsh-font-code-size,12px\) \+ 5px\)/)

// Most code in the interface never reads a token: it is styled with
// `font-family: var(--ds-font-family-code)` and a literal weight inside a
// component stylesheet. Those are reached structurally, and only there — the
// rule must stay scoped to code rather than becoming a universal weight.
assert.match(sheet, /html body pre,html body code,html body \[class\*="code" i\]\{/)
assert.match(sheet, /font-weight:var\(--dsh-font-code-weight,400\) !important;/)
assert.ok(
  !/body\s*\*\{[^}]*font-weight/.test(sheet),
  'the code weight must not be applied to every element',
)

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

// The host half looks this element up by the same id when it repaints the
// pre-paint row; a drift between the two halves would silently stack two
// stylesheets with the later one winning.
const hostSource = readFileSync(join(root, 'lib', 'index.js'), 'utf8')
const hostStyleId = /const FONT_STYLE_ID = '([^']+)'/.exec(hostSource)?.[1]
assert.equal(
  hostStyleId,
  styleTags[0].id,
  'lib/index.js FONT_STYLE_ID must equal the client half stylesheet id',
)

assert.match(styleTags[0].textContent, /\.dsh-font-size-14\{/)
assert.equal(rootProperties.get('--dsw-font-family'), 'Inter, sans-serif')
assert.equal(rootProperties.get('--ds-font-family-code'), '"JetBrains Mono", monospace')
// The content size must be written where ui-layout writes it, or the inline
// presenter value would win over the stylesheet.
assert.equal(bodyProperties.get('--dsh-content-font-size'), '16px')

// Re-applying must rewrite the same tag, not accumulate stylesheets, and a
// changed weight must reach the sheet.
plugin.applyFonts({ ...section, contentFontSize: 18, uiFontScale: 1, codeFontWeight: 700 })
assert.equal(styleTags.length, 1, 'applyFonts must reuse its own stylesheet tag')
assert.match(styleTags[0].textContent, /--dsh-font-ui-scale:1;/)
assert.match(styleTags[0].textContent, /--dsh-font-code-weight:700;/)
assert.equal(bodyProperties.get('--dsh-content-font-size'), '18px')

// An unreadable stored weight must fall back to the shipped one rather than
// writing an invalid declaration into every code `font:` shorthand.
plugin.applyFonts({ ...section, codeFontWeight: 'wobble' })
assert.match(styleTags[0].textContent, /--dsh-font-code-weight:400;/)

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

// ── the font query: what the settings row edits ─────────────────────────────
//
// The language is the CSS font-family list plus a weight word, which is the one
// thing the list cannot carry. Everything here is a pure function of (text,
// catalogue), so the table below is the specification.

const QUERY_CATALOGUE = [
  'Book Antiqua',
  'Fira Code',
  'Fira Sans',
  'Franklin Gothic Medium',
  'Geist Mono',
  'Inter',
  'Inter Tight',
  'Roboto Mono',
  'monospace',
]
/** The faces one machine reports, keyed by family. */
const QUERY_STYLES = {
  'Geist Mono': ['Regular', 'Medium', 'Bold', 'Bold Italic'],
  Inter: ['Thin', 'Regular', 'SemiBold'],
}
const QUERY = { catalogue: QUERY_CATALOGUE, styles: QUERY_STYLES, enumerated: true }

// One family plus its weight: the case the whole language exists for. Geist Mono
// is a variable font, so `medium` is its 500 face and not part of a family name.
{
  const read = plugin.parseFontQuery('Geist Mono medium', QUERY)
  assert.deepEqual(read.families, ['Geist Mono'])
  assert.equal(read.weight, 500)
  assert.equal(read.weightWord, 'medium')
  assert.equal(read.effective, 0)
  assert.deepEqual(read.diagnostics, [])
}

// The canonical form quotes the family and leaves the weight where it reads as
// a property of that family — and parses back into the same two values, which is
// what lets one text field be the source of both settings.
{
  const value = plugin.serializeFontQuery(['Geist Mono', 'monospace'], 500)
  assert.equal(value, '"Geist Mono" medium, monospace')
  const read = plugin.parseFontQuery(value, QUERY)
  assert.deepEqual(read.families, ['Geist Mono', 'monospace'])
  assert.equal(read.weight, 500)
  assert.equal(read.weightWord, 'medium')
}

// A bare weight word stands on its own: it sets the axis weight without naming
// a family, which is how a query that only carries a weight is written.
{
  const read = plugin.parseFontQuery('Inter, medium', QUERY)
  assert.deepEqual(read.families, ['Inter'])
  assert.equal(read.weight, 500)
}
{
  const read = plugin.parseFontQuery('medium', QUERY)
  assert.deepEqual(read.families, [])
  assert.equal(read.weight, 500)
  assert.equal(read.effective, -1)
}

// Only the LAST word of an unquoted entry can be a weight, and a name that is
// itself a catalogued family keeps its word: stripping `Book Antiqua` or
// `Franklin Gothic Medium` would silently retarget the stack at a font nobody
// picked. `Fira Sans Book` is the case the split is for.
for (const name of ['Book Antiqua', 'Franklin Gothic Medium']) {
  const read = plugin.parseFontQuery(name, QUERY)
  assert.deepEqual(read.families, [name])
  assert.equal(read.weight, undefined)
}
{
  const read = plugin.parseFontQuery('Fira Sans Book', QUERY)
  assert.deepEqual(read.families, ['Fira Sans'])
  assert.equal(read.weight, 400)
}
// Anything that is not a weight word is part of the name, even after a word
// that is one — `Geist Mono SemiBold Italic` is one name, not a guess.
{
  const read = plugin.parseFontQuery('Geist Mono SemiBold Italic', QUERY)
  assert.deepEqual(read.families, ['Geist Mono SemiBold Italic'])
  assert.equal(read.weight, undefined)
}
// A quoted name is verbatim, so only text AFTER the closing quote can be a
// weight — this is the form the canonical serializer writes.
{
  const read = plugin.parseFontQuery('"Geist Mono" bold', QUERY)
  assert.deepEqual(read.families, ['Geist Mono'])
  assert.equal(read.weight, 700)
}
{
  const read = plugin.parseFontQuery('"Book Antiqua"', QUERY)
  assert.deepEqual(read.families, ['Book Antiqua'])
  assert.equal(read.weight, undefined)
}

// The weight belongs to the axis, so it is honoured wherever it is written but
// only counted once.
{
  const read = plugin.parseFontQuery('Inter bold, monospace light', QUERY)
  assert.equal(read.weight, 700)
  assert.deepEqual(read.diagnostics.map((d) => d.code), ['duplicate-weight', 'missing-weight'])
  assert.equal(read.diagnostics[1].weight, 700)
}

// Bad text is reported, never silently dropped: an unclosed quote swallows the
// rest of the entry, and a word after a quoted name is neither the name nor a
// weight.
{
  const unclosed = plugin.parseFontQuery('"Geist Mono', QUERY)
  assert.deepEqual(unclosed.families, ['Geist Mono'])
  assert.deepEqual(unclosed.diagnostics.map((d) => d.code), ['unclosed-quote'])
}
{
  const stray = plugin.parseFontQuery('"Geist Mono" wobble', QUERY)
  assert.deepEqual(stray.families, ['Geist Mono'])
  assert.equal(stray.weight, undefined)
  assert.deepEqual(stray.diagnostics.map((d) => d.code), ['trailing-text'])
}

// A family the machine does not list is worth saying out loud — but only when
// the catalogue is authoritative; the curated fallback list is not evidence.
{
  const read = plugin.parseFontQuery('Nope Sans, monospace', QUERY)
  assert.deepEqual(read.diagnostics.map((d) => d.code), ['unknown-family'])
  assert.equal(read.diagnostics[0].name, 'Nope Sans')
  assert.deepEqual(
    plugin.parseFontQuery('Nope Sans, monospace', { catalogue: QUERY_CATALOGUE, enumerated: false })
      .diagnostics,
    [],
  )
  // The generic fallback is what the browser will really use when nothing
  // before it is installed.
  assert.equal(read.effective, 1)
}

// A weight the family has no face for is synthesized by the browser, so it is
// reported — and only when the faces were actually read.
{
  const read = plugin.parseFontQuery('Inter bold', QUERY)
  assert.deepEqual(read.diagnostics.map((d) => d.code), ['missing-weight'])
  assert.equal(read.diagnostics[0].name, 'Inter')
  assert.equal(read.diagnostics[0].weight, 700)
  assert.deepEqual(
    plugin.parseFontQuery('Inter bold', { catalogue: QUERY_CATALOGUE, styles: {}, enumerated: true })
      .diagnostics,
    [],
  )
}

// Serialization: quoting rules, the weight only on the first family, and an
// empty stack staying empty rather than becoming a stray space.
assert.equal(plugin.serializeFontQuery(['Inter', 'sans-serif'], 400), 'Inter regular, sans-serif')
assert.equal(plugin.serializeFontQuery(['Foo, Bar', 'monospace'], undefined), '"Foo, Bar", monospace')
assert.equal(plugin.serializeFontQuery(['-apple-system', 'sans-serif'], 400), '-apple-system regular, sans-serif')
assert.equal(plugin.serializeFontQuery([], 500), '')
assert.equal(plugin.serializeFontQuery(undefined, undefined), '')
for (const value of [
  'Inter regular, "PingFang SC", sans-serif',
  '"Geist Mono" medium, monospace',
  '"Foo, Bar", "Baz, Qux", serif',
]) {
  const read = plugin.parseFontQuery(value, QUERY)
  assert.equal(
    plugin.serializeFontQuery(read.families, read.weight),
    value,
    `the canonical form of ${value} must be itself`,
  )
}

// The number a stored value stands for, and the word the query spells it with.
assert.equal(plugin.normalizeWeight('medium'), 500)
assert.equal(plugin.normalizeWeight('Medium'), 500)
assert.equal(plugin.normalizeWeight(700), 700)
assert.equal(plugin.normalizeWeight('book'), 400)
assert.equal(plugin.normalizeWeight(undefined), 400)
assert.equal(plugin.normalizeWeight('wobble'), 400)
assert.equal(plugin.normalizeWeight(550), 400)
assert.equal(plugin.weightWord(500), 'medium')
assert.equal(plugin.weightWord(400), 'regular')
assert.equal(plugin.weightWord(900), 'black')

// Face styles are the only weight evidence the browser gives, and its spelling
// is not guaranteed, so an intensifier written apart has to be folded back.
assert.deepEqual(plugin.faceWeights(['Semi Bold', 'ExtraLight', 'Bold Italic', 'Regular']), [
  200, 400, 600, 700,
])
assert.deepEqual(plugin.faceWeights(['Light', 'Medium', 'Black']), [300, 500, 900])
assert.deepEqual(plugin.faceWeights(['Italic', 'Oblique']), [])
assert.deepEqual(plugin.faceWeights(undefined), [])

// The hand-off to the row: the parse, written back as the two settings the
// settings document actually holds. It runs on EVERY change rather than on a
// commit — the editor owns its own text, so there is no controlled field to
// re-render — which is why a query naming no family writes nothing at all, and a
// query naming only a weight still moves that axis.
{
  const write = []
  const sink = {
    onFamilies: (value) => write.push(['family', value]),
    onWeight: (weight) => write.push(['weight', weight]),
  }
  plugin.applyFontQuery('Geist Mono medium, "PingFang SC", monospace', QUERY, sink)
  assert.deepEqual(write, [
    ['family', '"Geist Mono", "PingFang SC", monospace'],
    ['weight', 500],
  ])
  write.length = 0
  plugin.applyFontQuery('', QUERY, sink)
  assert.deepEqual(write, [], 'an unfinished edit writes nothing at all')
  plugin.applyFontQuery('medium', QUERY, sink)
  assert.deepEqual(write, [['weight', 500]], 'a weight alone is a statement about the axis')
  write.length = 0
  plugin.applyFontQuery('Geist Mono', QUERY, sink)
  assert.deepEqual(write, [['family', '"Geist Mono"']], 'a family with no weight leaves the weight be')
}

// ── the grammar, which is this plugin's own code ────────────────────────────
//
// The editor receives its language as a VALUE, and a language belongs to the
// product: `@citisen/litearea` ships no syntax at all, so this plugin's grammar
// lives in this repo's `src/font-grammar.js` and is built from the parser's own
// constants rather than from a second copy of them.
//
// It is run below through the library's own engine — `inspect`, `resolveHover`,
// `complete`, `applyCompletion` — because that is the only honest way to assert
// what a grammar paints and offers. The hand-rolled equivalents of these
// assertions were `fontQueryTokens`, `queryTokenClass`, `clampHighlight`,
// `queryContextAt`, `querySuggestions`, and `applySuggestion`. What replaces them
// is the same claims made against the grammar that replaced them.

/** The engine's view of one document: paint, problems, decorations, and state. */
const look = (text, grammar) => inspect(text, grammar)

/** Every token of one document, with its scope. */
const paint = (text, grammar) =>
  look(text, grammar).tokens.map((token) => [token.text, token.scope])

/** The codes of every problem the engine reports for one document. */
const codes = (text, grammar) =>
  look(text, grammar).diagnostics.map((diagnostic) => diagnostic.code)

/** The grammar the row's editor runs, over the verifier's machine. */
const GRAMMAR = plugin.dshFontQueryGrammar({
  catalogue: QUERY_CATALOGUE,
  styles: QUERY_STYLES,
  enumerated: true,
  shippedWeight: 400,
})

/** The same machine, plus the family whose name contains a comma. */
const GRAMMAR_FOO = plugin.dshFontQueryGrammar({
  catalogue: [...QUERY_CATALOGUE, 'Foo, Bar'],
  styles: QUERY_STYLES,
  enumerated: true,
})

// The paint concatenates back into the input exactly. That invariant is what
// keeps the library's layer aligned with its field glyph for glyph, so it is
// asserted over the shapes that stress quotes, weight words, and spacing.
for (const value of [
  '',
  'Geist Mono medium',
  'Geist Mono medium, "Zhuque Fangsong (technical preview)", monospace',
  '"Foo, Bar" bold ,  Inter',
  'Inter,',
  '   ',
  '"unclosed, monospace',
]) {
  assert.equal(
    look(value, GRAMMAR).tokens.map((token) => token.text).join(''),
    value,
    `the paint must reproduce ${JSON.stringify(value)} exactly`,
  )
}

// Every part of the language has a scope of its own, which is what lets a
// stylesheet colour a family apart from a weight apart from a comma. The
// whitespace between entries is claimed by no rule and takes the fallback.
assert.deepEqual(paint('Geist Mono medium, "Foo, Bar", monospace', GRAMMAR_FOO), [
  ['Geist Mono', 'family'],
  [' ', 'text'],
  ['medium', 'weight'],
  [',', 'separator'],
  [' ', 'text'],
  ['"Foo, Bar"', 'family'],
  [',', 'separator'],
  [' ', 'text'],
  ['monospace', 'family.generic'],
])

// A family the machine does not have is painted apart and reported — but only
// when the catalogue was READ: the curated fallback list is not evidence about
// the machine, and the parser has no business doubting a name typed at it.
{
  assert.ok(paint('Nope Sans, monospace', GRAMMAR).some(([, scope]) => scope === 'family.unknown'))
  assert.deepEqual(
    codes('Nope Sans, monospace', GRAMMAR).filter((code) => code !== 'no-generic-fallback'),
    ['unknown-family'],
  )
  const quoted = look('"Nope Sans", monospace', GRAMMAR).diagnostics.find(
    (diagnostic) => diagnostic.code === 'unknown-family',
  )
  assert.deepEqual([quoted.from, quoted.to], [1, 10], 'the squiggle covers the name, not the quotes')
  assert.deepEqual(
    codes(
      'Nope Sans, monospace',
      plugin.dshFontQueryGrammar({ catalogue: QUERY_CATALOGUE, enumerated: false }),
    ),
    [],
  )
}

// A weight the effective family has no face for will be synthesized by the
// browser, so it is painted apart and reported — and again only when the faces
// were actually read. An empty face list means "unknown", never "absent".
{
  assert.deepEqual(paint('Inter bold', GRAMMAR), [
    ['Inter', 'family'],
    [' ', 'text'],
    ['bold', 'weight.missing'],
  ])
  assert.ok(codes('Inter bold', GRAMMAR).includes('missing-weight'))
  const unread = plugin.dshFontQueryGrammar({
    catalogue: QUERY_CATALOGUE,
    styles: {},
    enumerated: true,
  })
  assert.deepEqual(paint('Inter bold', unread)[2], ['bold', 'weight'])
  assert.deepEqual(codes('Inter bold', unread), ['no-generic-fallback'])
}

// Text the reader cannot place is reported, never silently repaired: an unclosed
// quote swallows the rest of the entry, and a word after a quoted name is neither
// that name nor a weight.
{
  assert.deepEqual(paint('"Geist Mono', GRAMMAR), [['"Geist Mono', 'family.unclosed']])
  assert.ok(codes('"Geist Mono', GRAMMAR).includes('unclosed-quote'))
  assert.deepEqual(
    codes('"Geist Mono" wobble', GRAMMAR).filter((code) => code !== 'no-generic-fallback'),
    ['trailing-text'],
  )
  // The salvaged name is a consequence of the mistake and not a separate fact
  // about the machine, so it is NOT reported as unknown on top of the cause.
  assert.ok(!codes('"Geist Mono" wobble', GRAMMAR).includes('unknown-family'))
}

// The family actually in effect is a decoration rather than a colour: it depends
// on the machine and not on the characters, so re-lexing the document whenever
// the catalogue changed would be the wrong shape of work.
{
  const decorations = look('Geist Mono medium, monospace', GRAMMAR).decorations
  assert.equal(decorations.length, 1)
  assert.deepEqual([decorations[0].kind, decorations[0].from, decorations[0].to], [
    'effective',
    0,
    10,
  ])
  assert.equal(decorations[0].title, 'in effect: Geist Mono')
}

// Hover: a family explains its own faces, which is new and useful, and a problem
// explains itself where it is. Both are the library's words and English only,
// which is why the row keeps its own localized list below.
{
  const family = resolveHover(look('Geist Mono medium', GRAMMAR), GRAMMAR, 2)
  assert.match(family.body, /Faces read from this machine: 400, 500, 700\./)
  const problem = resolveHover(look('Nope Sans', GRAMMAR), GRAMMAR, 1)
  assert.equal(problem.title, 'Warning')
  assert.ok(problem.body.includes('is not in this machine'))
}

// What can come next at a caret. The whole entry is replaced by a pick, so a
// family name of several words completes as one, and a name nobody catalogued can
// still be accepted exactly as it was typed.
{
  const found = complete(look('geist', GRAMMAR), GRAMMAR, {
    text: 'geist',
    caret: 5,
    trigger: 'explicit',
  })
  assert.deepEqual(
    found.rows.map((row) => [row.item.kind, row.item.insert]),
    [
      ['family', '"Geist Mono"'],
      ['custom', 'geist'],
    ],
  )
  assert.equal(found.rows[0].item.append, ', ', 'a family invites the next fallback with a comma')
  const applied = applyCompletion('geist', found.range, found.rows[0].item)
  assert.deepEqual([applied.text, applied.caret], ['"Geist Mono", ', 14])
  // Only the range that changed is rewritten, which is what keeps the browser's
  // undo history: a pick must not be a whole-document assignment.
  assert.deepEqual([applied.from, applied.to, applied.insert], [0, 5, '"Geist Mono", '])
}

// A weight is offered only once the entry names a family, and only the weights
// that family actually has — the face data is this plugin's, read off the machine
// by the plugin's own discovery.
{
  const found = complete(look('Geist Mono b', GRAMMAR), GRAMMAR, {
    text: 'Geist Mono b',
    caret: 12,
    trigger: 'explicit',
  })
  assert.deepEqual(
    found.rows.map((row) => row.item.kind),
    ['weight', 'custom'],
  )
  assert.equal(found.rows[0].item.insert, '"Geist Mono" bold')
  assert.equal(
    applyCompletion('Geist Mono b', found.range, found.rows[0].item).text,
    '"Geist Mono" bold',
    'a weight completes the entry instead of starting a new one',
  )
}

// The same slot in the spelling the serializer actually writes. Every multi-word
// family is quoted, and quoting a family is what makes a weight word after it
// safe to read — so the quoted form is the canonical one and not an edge case: if
// only the bare spelling completed its weights, the editor would be unable to
// complete the text the plugin itself produces.
{
  const rowsOf = (text) =>
    complete(look(text, GRAMMAR), GRAMMAR, {
      text,
      caret: text.length,
      trigger: 'explicit',
    })
  const quoted = rowsOf('"Geist Mono" b')
  assert.deepEqual(
    quoted.rows.map((row) => row.item.kind),
    ['weight'],
    'a quoted family reaches its weights like a bare one does',
  )
  assert.equal(quoted.rows[0].item.insert, '"Geist Mono" bold')
  assert.equal(
    applyCompletion('"Geist Mono" b', quoted.range, quoted.rows[0].item).text,
    '"Geist Mono" bold',
  )
  // A weight the entry already states is still the first row, in either spelling:
  // this is the pair that must agree, and it is what the quoted branch got wrong.
  assert.deepEqual(
    rowsOf('"Geist Mono" medium').rows.map((row) => row.item.kind),
    rowsOf('Geist Mono medium').rows.map((row) => row.item.kind),
    'both spellings of one query offer the same slot',
  )
  // Negative control, and the one that keeps the fix honest: an UNCLOSED quote
  // also starts with a quote, and there the reader has salvaged a name it cannot
  // vouch for. Nothing may be completed as a weight against it, so the only row
  // left is the text as typed. If the fix ever keyed off "starts with a quote"
  // rather than "has a closing quote", this turns into a weight row and fails.
  assert.deepEqual(
    rowsOf('"Geist Mono b').rows.map((row) => row.item.kind),
    ['custom'],
    'an unclosed quote offers no weights to complete',
  )
  // A quoted name still being written reaches the list too: rows are filtered by
  // the spelling the entry uses, so `"Geis` finds Geist Mono exactly as `Geis`
  // does. When only the label was consulted the quote matched nothing and the
  // list was empty for as long as the user was inside a quoted name.
  assert.ok(
    rowsOf('"Geis').rows.some((row) => row.item.label === 'Geist Mono'),
    'a half-written quoted name still offers the family it names',
  )
  // And a quoted name the catalogue does not have stays accept-as-typed: the row
  // has to be reachable, which means it must be filtered by the spelling the user
  // is writing rather than by the name the reader salvaged from it.
  assert.deepEqual(
    rowsOf('"Nope Sans"').rows.map((row) => row.item.kind),
    ['custom'],
    'an unknown quoted family is still insertable as typed',
  )
}

// An unknown name is still insertable as typed: a catalogue is never the whole
// truth about a machine this verifier cannot see.
{
  const bare = plugin.dshFontQueryGrammar({ catalogue: [], enumerated: true })
  const found = complete(look('My Font bold', bare), bare, {
    text: 'My Font bold',
    caret: 11,
    trigger: 'explicit',
  })
  assert.deepEqual(
    found.rows.map((row) => row.item.kind),
    ['custom'],
  )
  assert.equal(found.rows[0].item.insert, 'My Font bold')
}

// A caret at the START of a complete entry is a boundary and not an edit: the user
// put it there to place another family in front, which is how a fallback stays a
// fallback.
{
  const text = '"Geist Mono", monospace'
  const found = complete(look(text, GRAMMAR), GRAMMAR, { text, caret: 0, trigger: 'explicit' })
  assert.equal(found.rows[0].item.mode, 'before')
  const applied = applyCompletion(text, found.range, found.rows[0].item)
  assert.ok(
    applied.text.endsWith(', "Geist Mono", monospace'),
    'the entry already there must survive',
  )
}

// ── the grammar is built from THIS plugin's constants ───────────────────────
//
// This is the claim that matters most about the move: the language is described
// once, and the description is derived from the parser's own tables.
//
// The default vocabulary is the curated family list and the generic list. With an
// empty catalogue and an authoritative one, a name is painted as a plain family
// only if the grammar knows it from those constants — anything else is unknown —
// so every member below has to come back painted, and the lists cannot be copies
// that drifted.
{
  const defaults = plugin.dshFontQueryGrammar({ catalogue: [], enumerated: true })
  for (const name of plugin.COMMON_FAMILIES) {
    assert.deepEqual(paint(name, defaults), [[name, 'family']], `${name} must be offered by default`)
  }
  for (const name of plugin.GENERIC_FAMILIES) {
    assert.deepEqual(
      paint(name, defaults),
      [[name, 'family.generic']],
      `${name} must be generic by default`,
    )
  }
  // A name in neither list really is unknown under the same grammar, so the loops
  // above are not passing on a grammar that calls everything a family.
  assert.deepEqual(paint('Nope Sans', defaults), [
    ['Nope', 'family.unknown'],
    [' ', 'text'],
    ['Sans', 'family.unknown'],
  ])
}

// Overriding a vocabulary changes what the grammar accepts, and taking a name OUT
// of one changes what it rejects. Both directions are asserted, because a grammar
// with the list compiled in would agree with neither.
{
  const custom = plugin.dshFontQueryGrammar({
    catalogue: [],
    enumerated: true,
    genericFamilies: ['mystery-sans'],
  })
  assert.deepEqual(paint('mystery-sans', custom), [['mystery-sans', 'family.generic']])
  assert.deepEqual(paint('monospace', custom), [['monospace', 'family.unknown']])

  const limited = plugin.dshFontQueryGrammar({ catalogue: ['Fira Code'], enumerated: true })
  assert.deepEqual(paint('Fira Code', limited), [['Fira Code', 'family']])
  assert.ok(paint('Book Antiqua', limited).some(([, scope]) => scope === 'family.unknown'))

  const curated = plugin.dshFontQueryGrammar({
    catalogue: [],
    enumerated: true,
    commonFamilies: ['Zzz Family'],
  })
  assert.deepEqual(paint('Zzz Family', curated), [['Zzz Family', 'family']])
  const found = complete(look('Zzz', curated), curated, {
    text: 'Zzz',
    caret: 3,
    trigger: 'explicit',
  })
  assert.equal(found.rows[0].item.insert, '"Zzz Family"')
}

// ── moving an entry: the keyboard's answer to drag-and-drop ─────────────────
// Order is significant (the first installed family wins), so it has to be
// editable — but as text, which leaves every space and comma exactly where the
// user put it.
assert.deepEqual(plugin.moveFontQueryEntry('Inter, monospace, "Fira Code"', 3, 1), {
  text: 'monospace, Inter, "Fira Code"',
  caret: 14,
})
assert.deepEqual(plugin.moveFontQueryEntry('Inter, monospace, "Fira Code"', 26, -1), {
  text: 'Inter, "Fira Code", monospace',
  caret: 15,
})
// The spacing is the user's, not the serializer's: a move only reorders.
{
  const source = 'Inter ,  monospace'
  const moved = plugin.moveFontQueryEntry(source, 16, -1)
  assert.deepEqual([...moved.text].sort(), [...source].sort(), 'a move must not lose a character')
  assert.equal(moved.text.replace(/\s+/g, ' '), 'monospace , Inter')
}
// Moving off either end of the list changes nothing at all.
{
  const source = 'Inter, monospace'
  assert.deepEqual(plugin.moveFontQueryEntry(source, 2, -1), { text: source, caret: 2 })
  assert.deepEqual(plugin.moveFontQueryEntry(source, 16, 1), { text: source, caret: 16 })
  assert.deepEqual(plugin.moveFontQueryEntry('Inter', 2, 1), { text: 'Inter', caret: 2 })
}

// Alt+Arrow is the plugin's own binding, and it is the one keyboard gesture this
// plugin adds to the editor: it reorders the entry the caret sits in, as a single
// undoable TEXT edit, and then writes the parse of the result to the settings.
// The stub React never runs the effect that attaches it, so the binding is driven
// directly — which is also the only way to assert that a key it does NOT own is
// left alone.
{
  const calls = []
  const writes = []
  const editor = {
    value: 'Inter, monospace',
    input: { selectionStart: 2 },
    setValue: (text, preserveHistory) => calls.push(['setValue', text, preserveHistory]),
    setSelection: (caret) => calls.push(['setSelection', caret]),
  }
  const write = { onFamilies: (value) => writes.push(value), onWeight: () => undefined }
  const event = (extra) => ({ preventDefault: () => calls.push(['preventDefault']), ...extra })

  const moved = plugin.reorderFontQueryEntry(
    editor,
    event({ altKey: true, key: 'ArrowDown' }),
    QUERY,
    write,
  )
  assert.deepEqual(moved, { text: 'monospace, Inter', caret: 13 })
  assert.deepEqual(calls, [
    ['preventDefault'],
    ['setValue', 'monospace, Inter', true],
    ['setSelection', 13],
  ])
  assert.deepEqual(writes, ['monospace, Inter'], 'the reorder writes the parse of the new text')

  // A key this plugin does not own is left entirely alone: the handler must not
  // swallow a gesture the editor or the browser wants.
  calls.length = 0
  assert.equal(
    plugin.reorderFontQueryEntry(editor, event({ altKey: false, key: 'ArrowDown' }), QUERY, write),
    undefined,
  )
  assert.equal(
    plugin.reorderFontQueryEntry(editor, event({ altKey: true, key: 'ArrowLeft' }), QUERY, write),
    undefined,
  )
  // Moving off the top of the list changes nothing, and so writes nothing.
  assert.equal(
    plugin.reorderFontQueryEntry(editor, event({ altKey: true, key: 'ArrowUp' }), QUERY, write),
    undefined,
  )
  assert.deepEqual(calls, [], 'a move that leaves the list must not touch the editor')
  assert.deepEqual(writes, ['monospace, Inter'], 'and must not write the setting')
}
// ── the interface weight, which is opted into ───────────────────────────────
// The interface has a weight hierarchy, so setting the base has to move the
// heading steps with it rather than flatten them — and the shipped 400 must
// emit nothing at all, keeping a default install's sheet byte-identical.
assert.equal(plugin.emphasisWeight(700, 400), 700)
assert.equal(plugin.emphasisWeight(700, 500), 800)
assert.equal(plugin.emphasisWeight(600, 500), 700)
assert.equal(plugin.emphasisWeight(500, 500), 600)
assert.equal(plugin.emphasisWeight(700, 100), 700)
assert.equal(plugin.emphasisWeight(700, 900), 900)
{
  const plain = plugin.fontStyleSheet({ ...section, uiFontWeight: 400 })
  assert.equal(plain, sheet, 'the shipped interface weight must change nothing')
  assert.ok(!plain.includes('font-weight:400}'), 'no rule is emitted for the shipped weight')

  const heavy = plugin.fontStyleSheet({ ...section, uiFontWeight: 500 })
  assert.match(heavy, /html body\{font-weight:500\}/)
  assert.match(heavy, /--dsh-font-markdown-base:500 var\(--dsh-font-conversation-size,14px\)/)
  assert.match(heavy, /--dsh-font-markdown-table:500 calc\(16px - 1px\)/)
  assert.match(heavy, /--dsh-font-markdown-h1:800 calc\(16px \+ 7px\)/)
  assert.match(heavy, /--dsh-font-markdown-h4:700 var\(--dsh-font-conversation-size,14px\)/)
  assert.match(heavy, /--dsh-font-markdown-table-head:600 calc\(16px - 1px\)/)
  // The code ladder is a different axis and must not move with it.
  assert.match(heavy, /--dsw-font-markdown-code:var\(--dsh-font-code-weight,400\)/)
}

// ── the diagnostic messages the row shows ───────────────────────────────────
assert.equal(
  plugin.describeDiagnostic(
    { code: 'missing-weight', name: 'Inter', weight: 700, word: 'bold' },
    { missingWeight: '{family}→{weight}→{word}' },
  ),
  'Inter→700→bold',
)
assert.equal(
  plugin.describeDiagnostic({ code: 'unknown-family', name: 'X' }, { unknownFamily: 'no {name}' }),
  'no X',
)
assert.equal(plugin.describeDiagnostic({ code: 'unclosed-quote' }, { unclosedQuote: 'open' }), 'open')
assert.equal(
  plugin.describeDiagnostic({ code: 'trailing-text', text: 'wobble' }, { trailingText: 'stray {text}' }),
  'stray wobble',
)
assert.equal(plugin.describeDiagnostic({ code: 'nonsense' }, {}), '')

// ── the editor component ────────────────────────────────────────────────────
//
// The editor needs a real document, and this file runs in Node with a stubbed
// React whose `useEffect` does nothing — so the editor never mounts here and the
// component cannot be driven through it. That is expected, and it is why the
// assertions below are about the shape the stub can honestly check: one host
// element for the editor to mount into, the ref it needs, no controlled field,
// and nothing at all written to the setting while rendering.
//
// Everything the EDITOR itself does — undo, the caret, the alignment of the
// painted layer, the completion popup and its keys, squiggles, tooltips, and
// auto-sizing — is `@citisen/litearea`'s behaviour now, asserted by that
// library's own suite and its real-browser harness. It is deliberately not
// covered here, because this plugin no longer contains that code. What the plugin
// still claims about it is the grammar above, the two settings the parse writes,
// and the reorder binding below.

/** Collect every element in a tree, depth-first, flattening array children. */
function collectElements(node, out = []) {
  if (node === null || node === undefined) return out
  if (Array.isArray(node)) {
    for (const entry of node) collectElements(entry, out)
    return out
  }
  if (typeof node !== 'object') return out
  out.push(node)
  const children = Array.isArray(node.children) ? node.children : [node.children]
  for (const child of children) collectElements(child, out)
  collectElements(node.props?.children, out)
  return out
}

/**
 * The copy the editor takes as props, so the component stays locale-free.
 *
 * This is the row's own `editorLabels` bag, narrowed to what the component still
 * reads: the completion list, the tooltips, and the syntax colours are the
 * library's now, and so are their words.
 */
const EDITOR_LABELS = {
  weightLine: 'font.codeWeight',
  weightShipped: 'font.weightShipped',
  emptyQuery: 'font.emptyQuery',
  genericWarning: 'font.genericWarning',
  unknownFamily: 'no {name} here',
  missingWeight: '{family} has no {weight} ({word})',
  duplicateWeight: 'one weight only ({word})',
  unclosedQuote: 'unclosed quote',
  trailingText: 'stray {text}',
  weightName: (weight) => `w${String(weight)}`,
}

/**
 * Every string one rendered tree produces, in document order.
 *
 * The stub React returns a plain object per element, so the copy is reachable
 * only by walking it. This mirrors {@link collectElements} deliberately: the two
 * are the whole of what the stub can inspect.
 * @param node - a rendered node.
 * @param out - the accumulator.
 * @returns the strings, one per text child.
 */
function textOf(node, out = []) {
  if (node === null || node === undefined) return out
  if (Array.isArray(node)) {
    for (const entry of node) textOf(entry, out)
    return out
  }
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (typeof node !== 'object') return out
  const children = Array.isArray(node.children) ? node.children : [node.children]
  for (const child of children) textOf(child, out)
  textOf(node.props?.children, out)
  return out
}

/**
 * Render the editor the way the row does, re-rendering after every write the way
 * a state update would.
 * @param overrides - prop overrides.
 * @returns the tree, the props, and the recorded writes.
 */
function renderEditor(overrides = {}) {
  const familyWrites = []
  const weightWrites = []
  const instance = mount()
  const props = {
    value: '"Geist Mono", monospace',
    weight: 500,
    catalogue: QUERY_CATALOGUE,
    styles: QUERY_STYLES,
    enumerated: true,
    monospace: true,
    label: 'font.codeFamily',
    labels: EDITOR_LABELS,
    onFamilies: (value) => familyWrites.push(value),
    onWeight: (weight) => weightWrites.push(weight),
    ...overrides,
  }
  let tree = instance.render(plugin.FontQueryEditor, props)
  return {
    props,
    familyWrites,
    weightWrites,
    get tree() {
      return tree
    },
    /** Re-render, the way a state update would. */
    render() {
      tree = instance.render(plugin.FontQueryEditor, props)
      return tree
    },
    /** Every element in the tree, depth-first. */
    elements() {
      return collectElements(tree)
    },
    /** The element the editor mounts into. */
    host() {
      const node = collectElements(tree).find(
        (element) => element.props?.className === 'dsh-font-editor',
      )
      assert.ok(node !== undefined, 'the editor needs a host element to mount into')
      return node
    },
    /** Every line of copy the component renders. */
    text() {
      return textOf(tree)
    },
  }
}

// The field is a host element the editor mounts into, not a controlled textarea.
// A textarea whose value React rewrites is the bug this migration is about: the
// round trip through the store is what destroyed the browser's undo stack and
// reset the caret.
{
  const editor = renderEditor()
  assert.equal(
    editor.elements().filter((element) => element.props?.className === 'dsh-font-editor').length,
    1,
    'exactly one host element for the editor',
  )
  assert.equal(
    editor.elements().filter((element) => element.type === 'textarea').length,
    0,
    'the plugin must not render a bare textarea',
  )
  assert.notEqual(
    editor.host().props.ref,
    undefined,
    'the host must carry the ref the effect mounts into',
  )
  assert.equal(editor.tree.props.className, 'dsh-font-query')
  // Rendering is not writing: the setting follows the editor's own `onChange`,
  // never a render of the component.
  assert.deepEqual(editor.familyWrites, [], 'rendering must not write the family')
  assert.deepEqual(editor.weightWrites, [], 'rendering must not write the weight')
}

// What the field starts from, and the two readouts under it.
//
// The text is the plugin's CANONICAL form of the two stored values, so a weight
// word left inside the family string by a hand edit is read as the weight it
// means, and the weight the axis ships with is not spelled out: nobody chose it,
// and a `regular` after every interface font reads as junk the plugin injected.
// The value in force is stated in the line below the field instead.
{
  const stored = plugin.storedQuery('Geist Mono medium, monospace', 400, QUERY, 400)
  assert.equal(stored.text, '"Geist Mono", monospace')
  assert.deepEqual(stored.families, ['Geist Mono', 'monospace'])
  assert.equal(plugin.storedQuery('', 400, QUERY, 400).text, '')
  assert.equal(plugin.asQuery(['sans-serif'], 400, 400), 'sans-serif')
  assert.equal(plugin.asQuery(['sans-serif'], 300, 400), 'sans-serif light')

  const editor = renderEditor()
  assert.ok(
    editor.text().some((line) => line.includes('font.codeWeight: w500 500')),
    'the applied weight is stated',
  )
  assert.ok(
    editor.text().some((line) => line.includes('font-family: "Geist Mono", monospace')),
    'and the stack the settings hold',
  )

  const shipped = renderEditor({ value: 'sans-serif', weight: 400, monospace: false })
  assert.ok(
    shipped.text().some((line) => line.includes('font.codeWeight: w400 400font.weightShipped')),
    'the shipped weight is reported below the field',
  )
}

// The interface axis is not monospace, and its weight word comes from its own
// field.
{
  const editor = renderEditor({ monospace: false, weight: 300, value: 'Inter, sans-serif' })
  assert.equal(editor.host().props.className, 'dsh-font-editor')
  assert.ok(editor.text().some((line) => line.includes('font-family: Inter, sans-serif')))
}

// An empty query is an UNFINISHED EDIT, not a value: it writes nothing at all.
// Refilling the box with the shipped stack — which is what "an empty stack is not
// a valid CSS value" used to justify — is indistinguishable from a bug to the
// person who just cleared it.
{
  const editor = renderEditor({ value: '', weight: 400 })
  assert.deepEqual(editor.familyWrites, [], 'an empty query writes no family')
  assert.deepEqual(editor.weightWrites, [], 'and no weight')
  assert.ok(
    editor.text().some((line) => line.includes('font.emptyQuery')),
    'an unfinished edit is reported, not corrected',
  )
}

// The row's own explanation of a problem: one line per diagnostic, in the
// interface's language, with a syntax mistake marked as an error rather than as a
// note about the machine. The library's grammar words the same problems in
// English for its tooltips, and that is not this list's replacement.
{
  const warned = renderEditor({ value: '"Nope Sans", monospace', weight: 700 })
  const warnings = collectElements(warned.tree)
    .filter((element) => element.props?.className === 'dsh-font-warn')
    .map((element) => String(element.children.join('')))
  assert.deepEqual(warnings, ['no Nope Sans here'])

  const broken = renderEditor({ value: '"Geist Mono', weight: 400 })
  const errors = collectElements(broken.tree)
    .filter((element) => element.props?.className === 'dsh-font-warn dsh-font-error')
    .map((element) => String(element.children.join('')))
  assert.deepEqual(errors, [], 'well-formed text raises no error')

  // Which kind a code is shown as is the plugin's own judgement: text it cannot
  // read is an error — the red line the reader is owed — while a family or a
  // weight that is merely not installed here stays a warning, because it is still
  // a valid query. The line only appears once the user has typed: the field starts
  // from the plugin's canonical text, which is well formed by construction, and
  // the stub React cannot type.
  assert.equal(plugin.diagnosticKind('unclosed-quote'), 'error')
  assert.equal(plugin.diagnosticKind('trailing-text'), 'error')
  assert.equal(plugin.diagnosticKind('unknown-family'), 'warn')
  assert.equal(plugin.diagnosticKind('missing-weight'), 'warn')
  assert.equal(plugin.diagnosticKind('duplicate-weight'), 'warn')

  // A list with no generic tail is the plugin's own note, said in the interface's
  // words rather than left to the grammar's English info code.
  const tail = renderEditor({ value: 'Inter', weight: 400 })
  assert.ok(tail.text().some((line) => line.includes('font.genericWarning')))
}

// ── what the effect hands the library, and what the build compiled in ───────
//
// The editor mounts from an effect, which the stub never runs, so the options
// this plugin passes are asserted where they can be: in the bundle's own text.
// They are the wiring the row depends on and could not otherwise see — the
// field's bounds, its accessible name, and the hover that explains a family's
// faces.
{
  assert.match(source, /ariaLabel: label/)
  assert.match(source, /sizing: \{ minRows: 1, minHeight: 32, maxHeight: 120 \}/)
  assert.match(source, /hover: \{ enabled: true, delay: 140 \}/)
  assert.match(source, /grammar: liveGrammar/)
  // The box is themed by binding the editor's custom properties to the
  // INTERFACE's own tokens. The library's own dark palette is driven by
  // `prefers-color-scheme`, and the interface's theme switch is not the same
  // thing, so leaving the palette alone would make the box follow the operating
  // system instead of the app.
  for (const variable of ['fg', 'bg', 'border', 'accent', 'error', 'warning']) {
    assert.match(
      source,
      new RegExp(`${variable}: 'var\\(--dsw-alias-`),
      `the editor's ${variable} must come from the interface tokens`,
    )
  }
  assert.match(source, /'bg-raised': 'var\(--dsw-alias-bg-layer-2\)'/)
  assert.match(source, /'border-focus': 'var\(--dsw-alias-state-business-primary\)'/)
}

// ── the engine was compiled in, and the shell is not asked for it ───────────
//
// `@citisen/litearea` is not a platform singleton, so the bundle cannot `require`
// it: the shell's module table would not have it, and the failure would appear
// only in the browser, as a plugin that never loads. It is compiled in instead,
// and these assertions are what make that a checked fact rather than a claim
// about the build.
//
// ONE module, because the engine ships no syntax of its own: this plugin's
// grammar is this plugin's own file, spliced into the same scope by
// `scripts/build-client.mjs`, and it is exported from the envelope precisely so
// the section above could run it.
{
  assert.equal(
    (source.match(/let _citisen_litearea = \(function \(\) \{/g) ?? []).length,
    1,
    'the engine must be compiled in exactly once',
  )
  assert.ok(
    !/require\(["']@citisen\/litearea/.test(source),
    'the compiled-in engine must not be asked of the module table',
  )
  assert.ok(
    !/require\(["']\.\/font-grammar/.test(source),
    "the plugin's own grammar must not be asked of the module table either",
  )
  assert.ok(
    source.includes('// ./font-grammar.js is compiled in above'),
    'the grammar must be spliced into the template scope',
  )
  // No ES module syntax may survive into a classic script.
  assert.ok(!/^\s*import[\s{*]/m.test(source), 'the bundle must carry no ES import')
  assert.ok(!/^\s*export[\s{]/m.test(source), 'the bundle must carry no ES export')
  // The engine's stylesheet travels with it, because the library injects it: a
  // bundle without those rules would render an unstyled box.
  assert.ok(
    source.includes('.litearea-layer') && source.includes('.litearea-popup'),
    'the compiled-in engine must carry its stylesheet',
  )
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
  get: (name) =>
    name === 'theme'
      ? { overrideTokens: (source, tokens) => themeOverrides.push({ source, tokens }) }
      : undefined,
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
assert.equal(themeOverrides[0].source, PACKAGE_NAME)
assert.deepEqual(Object.keys(themeOverrides[0].tokens).sort(), ['--ds-font-family-code', '--dsw-font-family'])
assert.equal(themeOverrides[0].tokens['--dsw-font-family'].light, section.uiFontFamily)
assert.equal(themeOverrides[0].tokens['--dsw-font-family'].dark, section.uiFontFamily)

// The row's own stylesheet now carries only what is the plugin's: the row chrome,
// one hairline for the library's box, and the two warning lines. The painted
// layer, the popup, the option rows, and the token colours went with the
// hand-rolled editor — the library styles all of that itself, from the custom
// properties above.
{
  const rowStyle = appended
    .map((node) => String(node.textContent ?? ''))
    .find((css) => css.includes('dsh-font-editor'))
  assert.ok(rowStyle !== undefined, 'the row stylesheet must be installed')
  assert.ok(
    rowStyle.includes('.dsh-font-editor .litearea-box{border-width:.5px}'),
    'the box keeps the design system hairline',
  )
  for (const gone of [
    'dsh-font-queryLayer',
    'dsh-font-queryInput',
    'dsh-font-queryBox',
    'dsh-font-queryCode',
    'dsh-font-menu',
    'dsh-font-option',
    'dsh-font-qFamily',
    'dsh-font-qGeneric',
    'dsh-font-qWeight',
    'dsh-font-qComma',
    'dsh-font-qUnknown',
  ]) {
    assert.ok(!rowStyle.includes(gone), `the hand-rolled layer's ${gone} rules must be gone`)
  }
  // The rule that kept the paint on the characters is the library's now, together
  // with the whole layer it aligned.
  assert.ok(!rowStyle.includes('font-variant-ligatures'), 'the alignment rule belongs to the editor')
}

assert.equal(dictionaries.length, 1)
assert.deepEqual(Object.keys(dictionaries[0].dict.zh).sort(), Object.keys(dictionaries[0].dict.en).sort())
const rowCopy = dictionaries[0].dict
for (const key of [
  'font.emptyQuery',
  'font.genericWarning',
  'font.weightShipped',
  'font.diag.unknownFamily',
  'font.diag.missingWeight',
  'font.diag.duplicateWeight',
  'font.diag.unclosedQuote',
  'font.diag.trailingText',
]) {
  assert.ok(key in rowCopy.zh, `the dictionary is missing ${key}`)
  assert.ok(key in rowCopy.en, `the dictionary is missing ${key}`)
}
// The popup's copy went with the popup. The completion list is the library's now
// and so are its words, and there is no Enter-to-apply prompt left to word — an
// affordance this plugin no longer has.
for (const gone of [
  'font.suggestions',
  'font.add',
  'font.familyKind',
  'font.genericKind',
  'font.pending',
]) {
  assert.ok(!(gone in rowCopy.zh), `${gone} belonged to the hand-rolled editor`)
  assert.ok(!(gone in rowCopy.en), `${gone} belonged to the hand-rolled editor`)
}

// The row's OWN explanation of a problem, in the interface's language, for every
// code the parser raises — and in both locales, because a code with no message is
// a problem the reader is never told about. The library's grammar says the same
// things in English for its tooltips; that is a second, richer answer, not the
// row's.
{
  const sample = {
    'unknown-family': { code: 'unknown-family', name: 'Nope Sans' },
    'missing-weight': { code: 'missing-weight', name: 'Inter', weight: 700, word: 'bold' },
    'duplicate-weight': { code: 'duplicate-weight', word: 'bold' },
    'unclosed-quote': { code: 'unclosed-quote' },
    'trailing-text': { code: 'trailing-text', text: 'wobble' },
  }
  const said = {}
  for (const locale of ['zh', 'en']) {
    const messages = {}
    for (const [code, diagnostic] of Object.entries(sample)) {
      messages[code] = plugin.describeDiagnostic(diagnostic, {
        unknownFamily: rowCopy[locale]['font.diag.unknownFamily'],
        missingWeight: rowCopy[locale]['font.diag.missingWeight'],
        duplicateWeight: rowCopy[locale]['font.diag.duplicateWeight'],
        unclosedQuote: rowCopy[locale]['font.diag.unclosedQuote'],
        trailingText: rowCopy[locale]['font.diag.trailingText'],
      })
      assert.notEqual(messages[code], '', `${locale} must explain ${code}`)
      assert.ok(!messages[code].includes('{'), `${locale}: ${code} left a placeholder unfilled`)
    }
    // The values reach the message rather than staying in the template.
    assert.ok(messages['unknown-family'].includes('Nope Sans'))
    assert.ok(messages['missing-weight'].includes('700'))
    assert.ok(messages['missing-weight'].includes('bold'))
    assert.ok(messages['duplicate-weight'].includes('bold'))
    assert.ok(messages['trailing-text'].includes('wobble'))
    said[locale] = messages
  }
  assert.notDeepEqual(said.zh, said.en, 'the two locales must not say the same words')

  // The grammar raises one more code of its own — the missing generic tail — and
  // it is deliberately NOT one of the row's five: the row says that in its own
  // words, and a code this build does not know must produce nothing rather than a
  // line of raw template.
  assert.equal(plugin.describeDiagnostic({ code: 'no-generic-fallback' }, {}), '')
}

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

/** Render the row with `setField` recorded. */
function renderRow() {
  const writes = []
  const row = component({
    t: (key) => key,
    useStore: (selector) => selector(options.store.getSnapshot()),
    setField: (field, value) => {
      writes.push([field, value])
    },
    reset: () => undefined,
  })
  return { row, writes }
}

// The component must render a tree containing the localized labels.
const { row: rendered, writes } = renderRow()
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

// The catalogue's provenance is announced once, and only when it is bad news:
// an enumerated list is the machine's own and needs no badge, while the probe
// fallback is a short curated list the popup can never complete. Discovery that
// has not answered yet says nothing either, so no caveat flashes and vanishes.
{
  const text = (node, out = []) => {
    if (typeof node === 'string' || typeof node === 'number') out.push(String(node))
    else if (Array.isArray(node)) for (const child of node) text(child, out)
    else if (typeof node === 'object' && node !== null) {
      for (const child of node.children ?? []) text(child, out)
      text(node.props?.children, out)
    }
    return out
  }
  // The row's first state slot is its catalogue; seeding it is how the verifier
  // reaches the two discovery outcomes without a React runtime.
  const notice = (catalog) => {
    react.__slots = [catalog]
    react.__hookIndex = 0
    return text(
      component({
        t: (key) => key,
        useStore: (selector) => selector(options.store.getSnapshot()),
        setField: () => undefined,
        reset: () => undefined,
      }),
    ).join('|')
  }
  assert.match(
    notice({ families: [], styles: {}, enumerated: false, measured: true }),
    /font\.catalogProbed/,
    'the probe fallback must be called out',
  )
  assert.doesNotMatch(
    notice({ families: [], styles: {}, enumerated: true, measured: true }),
    /font\.catalogProbed/,
    'a machine read needs no badge',
  )
  assert.doesNotMatch(
    notice({ families: [], styles: {}, enumerated: false }),
    /font\.catalogProbed/,
    'discovery still running must say nothing',
  )
  react.__slots = undefined
  react.__hookIndex = 0
}

// The row owns the wiring: one query editor per axis, each writing its own
// family and weight fields, and each holding the copy for its axis.
{
  const editors = collectElements(rendered).filter(
    (element) => typeof element.type === 'function' && element.type.name === 'FontQueryEditor',
  )
  assert.equal(editors.length, 2, 'one editor per axis')

  const [ui, code] = editors
  assert.equal(ui.props.value, section.uiFontFamily)
  assert.equal(ui.props.weight, 400, 'the shipped interface weight')
  assert.equal(ui.props.monospace, undefined)
  assert.equal(ui.props.labels.weightLine, 'font.uiWeight')
  assert.equal(ui.props.label, 'font.uiFamily')

  assert.equal(code.props.value, section.codeFontFamily)
  assert.equal(code.props.weight, section.codeFontWeight)
  assert.equal(code.props.monospace, true)
  assert.equal(code.props.labels.weightLine, 'font.codeWeight')
  assert.equal(code.props.labels.weightName(500), 'font.weight.medium')

  ui.props.onFamilies('Inter Tight, sans-serif')
  ui.props.onWeight(300)
  code.props.onFamilies('"Geist Mono", monospace')
  code.props.onWeight(700)
  assert.deepEqual(writes, [
    ['uiFontFamily', 'Inter Tight, sans-serif'],
    ['uiFontWeight', 300],
    ['codeFontFamily', '"Geist Mono", monospace'],
    ['codeFontWeight', 700],
  ])

  // A commit that resolves to the stored value must not write at all: the
  // settings document is durable, and a no-op round trip is still a write.
  ui.props.onFamilies(section.uiFontFamily)
  ui.props.onWeight(400)
  code.props.onFamilies(section.codeFontFamily)
  code.props.onWeight(section.codeFontWeight)
  assert.equal(writes.length, 4, 'an unchanged commit must not write')

  // Both axes share the machine's catalogue, faces included.
  assert.equal(ui.props.styles, code.props.styles)
  assert.ok(Array.isArray(code.props.catalogue))
}

// A pushed settings change must repaint.
rootProperties.clear()
scopeListener()
assert.equal(rootProperties.get('--dsw-font-family'), section.uiFontFamily)

delete globalThis.document

console.log(
  'verify-client: OK — envelope, stylesheet, theme stacking, grammar, and settings row all verified',
)
console.log(`verify-client: factory required ${requested.join(', ')}`)
