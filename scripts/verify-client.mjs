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
assert.equal(typeof plugin.rankFamilyMatches, 'function')
for (const name of [
  'weightWord',
  'faceWeights',
  'emphasisWeight',
  'parseFontQuery',
  'fontQueryTokens',
  'serializeFontQuery',
  'queryContextAt',
  'querySuggestions',
  'applySuggestion',
  'moveFontQueryEntry',
  'queryTokenClass',
  'clampHighlight',
  'describeDiagnostic',
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

// ── suggestion ranking ──────────────────────────────────────────────────────
const catalogue = ['Fira Code', 'Fira Sans', 'Inter', 'Inter Tight', 'Roboto Mono', 'monospace']
assert.deepEqual(plugin.rankFamilyMatches(catalogue, ''), catalogue)
assert.equal(plugin.rankFamilyMatches(catalogue, 'inter')[0], 'Inter', 'an exact match must lead')
assert.deepEqual(
  plugin.rankFamilyMatches(catalogue, 'fira').slice(0, 2),
  ['Fira Code', 'Fira Sans'],
  'prefix matches must precede substring matches',
)
assert.deepEqual(plugin.rankFamilyMatches(catalogue, 'code'), ['Fira Code'])
assert.deepEqual(plugin.rankFamilyMatches(catalogue, 'zzz'), [])

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

// ── the highlight: tokens that concatenate back into the input ───────────────
// This invariant is what keeps the painted layer aligned with the textarea, so
// it is asserted over shapes that stress quotes, weight words, and spacing.
for (const value of [
  '',
  'Geist Mono medium',
  'Geist Mono medium, "Zhuque Fangsong (technical preview)", monospace',
  '"Foo, Bar" bold ,  Inter',
  'Inter,',
  '   ',
  '"unclosed, monospace',
]) {
  const tokens = plugin.fontQueryTokens(value, QUERY)
  assert.equal(
    tokens.map((token) => token.text).join(''),
    value,
    `tokens must reproduce ${JSON.stringify(value)} exactly`,
  )
}

{
  const tokens = plugin.fontQueryTokens('Geist Mono medium, "Foo, Bar", monospace', {
    ...QUERY,
    catalogue: [...QUERY_CATALOGUE, 'Foo, Bar'],
  })
  assert.deepEqual(
    tokens.map((token) => [token.text, token.kind]),
    [
      ['Geist Mono ', 'family'],
      ['medium', 'weight'],
      [',', 'comma'],
      [' ', 'space'],
      ['"Foo, Bar"', 'family'],
      [',', 'comma'],
      [' ', 'space'],
      ['monospace', 'generic'],
    ],
  )
  // The family is carried on the token so the layer can mark the one in effect.
  assert.equal(tokens[0].family, 'Geist Mono')
  assert.equal(tokens[1].family, 'Geist Mono')
  assert.equal(tokens[7].family, 'monospace')
}

// A family the machine does not have is painted apart, but only when the
// catalogue is authoritative — otherwise every curated name would look wrong.
{
  const unknown = plugin.fontQueryTokens('Nope Sans, monospace', QUERY)
  assert.equal(unknown[0].kind, 'unknown')
  assert.equal(plugin.fontQueryTokens('Nope Sans', { catalogue: [], enumerated: false })[0].kind, 'family')
}

// The pill marks the family that is in effect — the first one the browser can
// actually use — and nothing else.
{
  const tokens = plugin.fontQueryTokens('"Nope Sans", monospace', QUERY)
  assert.equal(plugin.queryTokenClass(tokens[0], 'monospace'), 'dsh-font-qUnknown')
  assert.equal(plugin.queryTokenClass(tokens[3], 'monospace'), 'dsh-font-qGeneric dsh-font-qEffective')
  assert.equal(plugin.queryTokenClass({ text: ',', kind: 'comma' }, 'monospace'), 'dsh-font-qComma')
  assert.equal(plugin.queryTokenClass({ text: ' ', kind: 'space' }, 'monospace'), '')
}

// The highlighted row is clamped against a list that may have shrunk under the
// cursor, so the popup can never commit a row that is not on screen.
assert.equal(plugin.clampHighlight([], 3), -1)
assert.equal(plugin.clampHighlight(['a', 'b'], 9), 1)
assert.equal(plugin.clampHighlight(['a', 'b'], -4), 0)

// ── the caret's entry, and what the popup offers there ───────────────────────
// The completion replaces the WHOLE entry, because a family name is several
// words: completing `geist mo` has to replace both of them.
{
  const context = plugin.queryContextAt('Inter, geist mo', 15)
  assert.deepEqual(
    [context.start, context.end, context.core, context.head, context.word],
    [6, 15, 'geist mo', 'geist', 'mo'],
  )
}
// A trailing complete weight word is not part of the family, so the family text
// ends before it — `"Geist Mono" medium` must still suggest families.
{
  const context = plugin.queryContextAt('"Geist Mono" medium', 19)
  assert.equal(context.weightWord, 'medium')
  assert.equal(context.familyEnd, 12)
  assert.equal(context.caretInCore >= context.familyEnd, true)
}
// The last entry is the caret's entry even when the caret sits past its end,
// and an empty query is one empty entry rather than none.
assert.equal(plugin.queryContextAt('Inter, monospace', 999).core, 'monospace')
assert.equal(plugin.queryContextAt('', 0).core, '')
assert.equal(plugin.queryContextAt('Inter', 2).word, 'Inter')

// A partial family name completes to the family, and the typed text stays
// available as a custom row because the catalogue is never complete.
{
  const suggestion = plugin.querySuggestions(plugin.queryContextAt('geist', 5), QUERY)
  assert.deepEqual(suggestion.items.map((item) => item.insert), ['"Geist Mono"'])
  assert.equal(suggestion.custom, 'geist')
  assert.deepEqual([suggestion.start, suggestion.end], [0, 5])
}
// An exact family name leads with its WEIGHTS, written as `<family> <weight>` so
// one pick sets both fields — and only the weights the machine actually has.
{
  const suggestion = plugin.querySuggestions(plugin.queryContextAt('Geist Mono', 10), QUERY)
  assert.deepEqual(
    suggestion.items.slice(0, 3).map((item) => [item.kind, item.insert, item.weight]),
    [
      ['weight', '"Geist Mono" regular', 400],
      ['weight', '"Geist Mono" medium', 500],
      ['weight', '"Geist Mono" bold', 700],
    ],
  )
  // No custom row: the typed text already names a family.
  assert.equal(suggestion.custom, undefined)
}
// With no face data the whole closed vocabulary is offered instead, so a weight
// is still discoverable without the Local Font Access permission.
{
  const suggestion = plugin.querySuggestions(plugin.queryContextAt('monospace', 9), {
    catalogue: QUERY_CATALOGUE,
    enumerated: false,
  })
  assert.deepEqual(
    suggestion.items.slice(0, 9).map((item) => item.weight),
    [100, 200, 300, 400, 500, 600, 700, 800, 900],
  )
}
// A query that already states its weight is never silently moved by an Enter
// that accepts the highlighted row: the stated weight leads its own list, and a
// family pick carries the word along.
{
  const context = plugin.queryContextAt('"Geist Mono" medium', 19)
  const suggestion = plugin.querySuggestions(context, QUERY)
  assert.equal(suggestion.items[0].word, 'medium')
  assert.equal(suggestion.items[0].insert, '"Geist Mono" medium')
  assert.equal(suggestion.items.at(-1).insert, '"Geist Mono" medium')
  // Swapping the family keeps the weight the user wrote rather than resetting it.
  const swap = plugin.queryContextAt('"Geist Mono" medium', 19)
  const inter = plugin.querySuggestions(
    { ...swap, inner: 'Inter', head: 'Inter', word: '' },
    QUERY,
  ).items.find((item) => item.name === 'Inter')
  assert.equal(inter.insert, 'Inter medium')
}
// A word after a complete family is read as a weight prefix: `Geist Mono b`
// offers Bold, and nothing else — Geist Mono has no Black face here.
{
  const suggestion = plugin.querySuggestions(plugin.queryContextAt('Geist Mono b', 12), QUERY)
  assert.deepEqual(suggestion.items.map((item) => item.word), ['bold'])
  assert.equal(suggestion.custom, 'Geist Mono b')
}
// A partial family name keeps the FAMILY list first, even when the text before
// the caret happens to be a family of its own: `inter t` means Inter Tight.
{
  const suggestion = plugin.querySuggestions(plugin.queryContextAt('inter t', 7), QUERY)
  assert.equal(suggestion.items[0].name, 'Inter Tight')
  assert.equal(suggestion.items[0].kind, 'family')
}
// An empty query browses, and offers no custom row — an Enter there must not
// replace the stack with whatever happens to sort first.
{
  const suggestion = plugin.querySuggestions(plugin.queryContextAt('', 0), QUERY)
  assert.ok(suggestion.items.length > 0, 'an empty query browses the catalogue')
  assert.equal(suggestion.custom, undefined)
}
// A name the catalogue does not have is still insertable, quoted the way CSS
// requires it — and the weight word the user typed goes in with it.
{
  const suggestion = plugin.querySuggestions(plugin.queryContextAt('My Font bold', 11), QUERY)
  assert.deepEqual(suggestion.items, [])
  assert.equal(suggestion.custom, 'My Font bold')
}
// Taking a completion replaces the entry and invites the next one with a comma —
// except after a weight, which completes the entry instead.
{
  const context = plugin.queryContextAt('geist', 5)
  const suggestion = plugin.querySuggestions(context, QUERY)
  assert.equal(suggestion.at, 'entry')
  assert.deepEqual(plugin.applySuggestion('geist', suggestion, '"Geist Mono"', 'family'), {
    text: '"Geist Mono", ',
    caret: 14,
  })
  assert.deepEqual(plugin.applySuggestion('geist', suggestion, '"Geist Mono" medium', 'weight'), {
    text: '"Geist Mono" medium',
    caret: 19,
  })
  // An entry in the middle keeps the comma that already separates it.
  const middle = plugin.queryContextAt('geist, monospace', 5)
  assert.deepEqual(
    plugin.applySuggestion('geist, monospace', plugin.querySuggestions(middle, QUERY), '"Geist Mono"', 'family'),
    { text: '"Geist Mono", monospace', caret: 12 },
  )
  // A custom row inserts the typed text as it stands.
  const custom = plugin.querySuggestions(plugin.queryContextAt('My Font', 7), QUERY)
  assert.equal(plugin.applySuggestion('My Font', custom, 'My Font', 'custom').text, 'My Font, ')
}

// A caret at the START of a complete entry is a boundary: the pick goes in ahead
// of it, so the family already there stays as a fallback. That is how a font is
// put in charge without dragging anything.
{
  const context = plugin.queryContextAt('"Geist Mono", monospace', 0)
  const suggestion = plugin.querySuggestions(context, QUERY)
  assert.equal(suggestion.at, 'before')
  assert.deepEqual(plugin.applySuggestion('"Geist Mono", monospace', suggestion, 'Inter', 'family'), {
    text: 'Inter, "Geist Mono", monospace',
    caret: 7,
  })
  // Ahead of a middle entry: the entry's own spacing does not double up.
  const middle = plugin.queryContextAt('"Geist Mono", monospace', 14)
  assert.equal(middle.core, 'monospace')
  assert.deepEqual(
    plugin.applySuggestion('"Geist Mono", monospace', plugin.querySuggestions(middle, QUERY), 'Inter', 'family'),
    { text: '"Geist Mono", Inter, monospace', caret: 21 },
  )
  // A weight completes the entry it sits next to, at a boundary or not.
  assert.equal(
    plugin.applySuggestion('"Geist Mono", monospace', suggestion, '"Inter" medium', 'weight').text,
    '"Inter" medium, monospace',
  )
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
// The React stub does not recursively render function children, so the editor
// is driven at its own level: its handlers are called the way a browser calls
// them, and the tree it returns is inspected.

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

/** The copy the editor takes as props, so the component stays locale-free. */
const EDITOR_LABELS = {
  list: 'font.suggestions',
  add: 'font.add',
  font: 'font.familyKind',
  generic: 'font.genericKind',
  weightLine: 'font.codeWeight',
  weightShipped: 'font.weightShipped',
  pending: 'font.pending',
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
 * Render the editor and drive its handlers, re-rendering after every write the
 * way a state update would.
 * @param overrides - prop overrides.
 * @returns the tree plus interaction helpers and the recorded writes.
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
  const render = () => {
    tree = instance.render(plugin.FontQueryEditor, props)
    return tree
  }
  const helpers = {
    props,
    familyWrites,
    weightWrites,
    get tree() {
      return tree
    },
    render,
    /** The editor's real text surface. */
    textarea() {
      const node = collectElements(tree).find((element) => element.type === 'textarea')
      assert.ok(node !== undefined, 'the editor must render a textarea')
      return node
    },
    /** The painted tokens behind the textarea (a space token has no class). */
    painted() {
      return collectElements(tree).filter(
        (element) =>
          element.type === 'span' &&
          typeof element.props?.className === 'string' &&
          (element.props.className === '' || element.props.className.startsWith('dsh-font-q')),
      )
    },
    /** The completion rows, in the order the popup shows them. */
    rows() {
      return collectElements(tree).filter((element) => element.type === 'li')
    },
    type(text, caret) {
      helpers.textarea().props.onChange({ target: { value: text, selectionStart: caret ?? text.length } })
      return render()
    },
    key(key, extra = {}) {
      helpers.textarea().props.onKeyDown({ key, preventDefault: () => undefined, ...extra })
      return render()
    },
    focus(caret = 0) {
      helpers.textarea().props.onFocus({ target: { selectionStart: caret } })
      return render()
    },
    blur() {
      helpers.textarea().props.onBlur()
      return render()
    },
  }
  return helpers
}

// The field shows the stored family and weight as one query, and offers no
// placeholder: a ghost of the shipped stack in an empty box reads as a value the
// plugin put there.
{
  const editor = renderEditor()
  assert.equal(editor.textarea().props.value, '"Geist Mono" medium, monospace')
  assert.equal(editor.textarea().props.role, 'combobox')
  assert.equal(editor.textarea().props.placeholder, undefined)
  assert.equal(editor.rows().length, 0, 'the popup starts closed')
}

// The painted layer renders exactly the same characters as the field, and marks
// the family that is in effect.
{
  const editor = renderEditor()
  const painted = editor.painted()
  assert.equal(painted.map((token) => token.children.join('')).join(''), '"Geist Mono" medium, monospace')
  assert.match(painted[0].props.className, /dsh-font-qEffective/)
  assert.equal(painted[0].children.join(''), '"Geist Mono" ')
  assert.match(painted[1].props.className, /dsh-font-qWeight/)
  assert.equal(painted[1].children.join(''), 'medium')
  assert.match(painted.at(-1).props.className, /dsh-font-qGeneric/)
}

// Focusing opens the browse list; typing narrows it, and the typed text stays
// available as a custom row because the catalogue is never complete.
{
  const editor = renderEditor({ value: 'monospace', weight: 400 })
  editor.focus(0)
  assert.ok(editor.rows().length > 0, 'focus opens the completion list')
  editor.type('geist', 5)
  assert.equal(editor.rows().length, 2, 'the one matching family, then the custom row')
  assert.equal(editor.rows()[0].props.role, 'option')
  assert.match(editor.rows()[0].props.className, /dsh-font-optionActive/)
  assert.match(editor.rows()[1].props.className, /dsh-font-optionCustom/)
}

// Enter APPLIES; it never completes. Transforming what was typed because Enter
// was pressed is the one thing this control must not do.
{
  const editor = renderEditor({ value: 'sans-serif', weight: 400 })
  editor.focus(0)
  editor.type('geist', 5)
  editor.key('Enter')
  assert.equal(editor.textarea().props.value, 'geist', 'Enter must not rewrite the text')
  assert.deepEqual(editor.familyWrites, ['geist'], 'the typed name is what gets stored')
}

// Tab takes the highlighted completion — an unambiguous request for it — and the
// entry is replaced with the quoted family.
{
  const editor = renderEditor({ value: 'sans-serif', weight: 400 })
  editor.focus(0)
  editor.type('geist', 5)
  editor.key('Tab')
  assert.equal(editor.textarea().props.value, '"Geist Mono", ')
  assert.deepEqual(editor.familyWrites, ['"Geist Mono"'])
}

// Picking a weight writes the weight AND keeps the family: one edit, one place.
{
  const editor = renderEditor({ value: 'monospace', weight: 400 })
  editor.type('Geist Mono', 10)
  const rows = editor.rows()
  assert.equal(rows.length, 4, 'the three faces Geist Mono has, then the family itself')
  editor.key('ArrowDown')
  editor.key('Tab')
  assert.equal(editor.textarea().props.value, '"Geist Mono" medium')
  assert.deepEqual(editor.familyWrites, ['"Geist Mono"'])
  assert.deepEqual(editor.weightWrites, [500])
}

// Picking the SHIPPED weight takes the word away instead of writing it: the row
// is offered (it is a real choice) but its text is just the family, and the
// number travels with the row rather than being read back out of the text. The
// weight the query already states leads its own list, so the pick below is one
// step from what is written.
{
  const editor = renderEditor({ value: 'monospace', weight: 500 })
  editor.type('Geist Mono medium', 17)
  editor.key('ArrowDown')
  editor.key('Tab')
  assert.equal(editor.textarea().props.value, '"Geist Mono"')
  assert.deepEqual(editor.weightWrites, [400])
}

// A typed name the catalogue does not list is taken as it stands: Enter applies
// it, Tab accepts the custom row (which is the version with the comma).
{
  const editor = renderEditor({ value: 'sans-serif', weight: 400, catalogue: [] })
  editor.type('My Font bold', 11)
  editor.key('Enter')
  assert.equal(editor.textarea().props.value, 'My Font bold', 'Enter leaves the text alone')
  assert.deepEqual(editor.familyWrites, ['"My Font"'])
  assert.deepEqual(editor.weightWrites, [700])
}
{
  const editor = renderEditor({ value: 'sans-serif', weight: 400, catalogue: [] })
  editor.type('My Font bold', 11)
  editor.key('Tab')
  assert.equal(editor.textarea().props.value, 'My Font bold, ')
  assert.deepEqual(editor.familyWrites, ['"My Font"'])
}

// An empty query is an UNFINISHED EDIT, not a value: it writes nothing at all.
// Refilling the box with the shipped stack — which is what "an empty stack is
// not a valid CSS value" used to justify — is indistinguishable from a bug to
// the person who just cleared it.
{
  const editor = renderEditor({ value: '', weight: 400 })
  editor.focus(0)
  assert.ok(editor.rows().length > 0, 'an empty query browses')
  editor.key('Enter')
  assert.deepEqual(editor.familyWrites, [], 'an empty query writes no family')
  assert.deepEqual(editor.weightWrites, [], 'and no weight')
  assert.equal(editor.textarea().props.value, '')
}

// Blur applies what was typed and leaves the text EXACTLY as it is: no quotes
// added, no word moved, no comma dropped. The stored value is the plugin's
// serialization of the parse; the box is the user's text, and the two are
// allowed to differ.
{
  const editor = renderEditor({ value: 'sans-serif', weight: 500 })
  editor.type('geist mono', 10)
  editor.blur()
  assert.equal(editor.textarea().props.value, 'geist mono', 'blur must not rewrite the text')
  assert.equal(editor.familyWrites.at(-1), '"geist mono"')
  // The query names no weight, so the weight already set is left alone rather
  // than silently reset.
  assert.deepEqual(editor.weightWrites, [])
}
// A weight the text names IS applied.
{
  const editor = renderEditor({ value: 'sans-serif', weight: 500 })
  editor.type('geist mono medium', 17)
  editor.blur()
  assert.equal(editor.textarea().props.value, 'geist mono medium')
  assert.equal(editor.weightWrites.at(-1), 500)
}
// Clearing the box writes NOTHING and stays empty: the saved stack is still the
// one in use, and the field says so instead of refilling itself with a string
// from nowhere.
{
  const editor = renderEditor()
  editor.type('', 0)
  editor.blur()
  assert.equal(editor.textarea().props.value, '')
  assert.deepEqual(editor.familyWrites, [])
  assert.deepEqual(editor.weightWrites, [])
  const text = []
  const walk = (node) => {
    if (typeof node === 'string') text.push(node)
    else if (Array.isArray(node)) for (const child of node) walk(child)
    else if (typeof node === 'object' && node !== null) {
      for (const child of node.children ?? []) walk(child)
      walk(node.props?.children)
    }
  }
  walk(editor.tree)
  assert.ok(
    text.some((line) => line.includes('font.emptyQuery')),
    'an unfinished edit is reported, not corrected',
  )
  assert.ok(
    !text.some((line) => line.includes('font.pending')),
    'and there is nothing to apply, so no pending line either',
  )
}

// The shipped weight is NOT spelled out in the field: nobody chose it, and a
// `regular` appearing after every interface font reads as junk the plugin
// injected. It is stated in the line under the field instead, and it comes back
// the moment a weight is actually chosen.
{
  const plain = renderEditor({ value: 'sans-serif', weight: 400, monospace: false })
  assert.equal(plain.textarea().props.value, 'sans-serif')
  const text = []
  const walk = (node) => {
    if (typeof node === 'string') text.push(node)
    else if (Array.isArray(node)) for (const child of node) walk(child)
    else if (typeof node === 'object' && node !== null) {
      for (const child of node.children ?? []) walk(child)
      walk(node.props?.children)
    }
  }
  walk(plain.tree)
  assert.ok(
    text.some((line) => line.includes('font.codeWeight: w400 400font.weightShipped')),
    'the shipped weight is reported below the field',
  )

  const chosen = renderEditor({ value: 'sans-serif', weight: 300, monospace: false })
  assert.equal(chosen.textarea().props.value, 'sans-serif light')
  const code = renderEditor({ value: '"Geist Mono", monospace', weight: 400, monospace: true })
  assert.equal(code.textarea().props.value, '"Geist Mono", monospace')
  // A weight word left in the stored family string by a hand edit is the weight
  // field's business, so what is SHOWN is derived from the two values.
  const legacy = renderEditor({ value: 'Geist Mono medium, monospace', weight: 400, monospace: true })
  assert.equal(legacy.textarea().props.value, '"Geist Mono", monospace')
}

// Alt+Arrow moves the entry under the caret, which is the editor's replacement
// for dragging a chip — and it is a text edit, not a settings write.
{
  const editor = renderEditor({ value: 'Inter, monospace', weight: undefined })
  editor.focus(0)
  editor.key('ArrowDown', { altKey: true })
  assert.equal(editor.textarea().props.value, 'monospace, Inter')
  assert.equal(editor.familyWrites.length, 0)
}

// Typing at the front of an existing stack inserts EXACTLY the typed characters:
// no comma is conjured up, nothing is moved. Putting a family in charge is either
// typed out by the user (comma included) or taken from the completion list, where
// the pick at a boundary is an explicit request for it.
{
  const editor = renderEditor({ value: 'sans-serif', weight: 400 })
  editor.focus(0)
  editor.type('Isans-serif', 1)
  assert.equal(editor.textarea().props.value, 'Isans-serif', 'only the typed characters appear')
  // Putting the comma in is the user's job, and then the name completes as usual.
  editor.type('I, sans-serif', 12)
  assert.equal(editor.textarea().props.value, 'I, sans-serif')
  editor.blur()
  assert.deepEqual(editor.familyWrites.at(-1), 'I, sans-serif')
}
// A pick at the START of a complete family inserts a new entry ahead of it — the
// one text transformation the user asks for by picking from the list.
{
  const editor = renderEditor({ value: 'sans-serif', weight: 400 })
  editor.type('Inter, sans-serif', 0)
  assert.equal(editor.rows()[0].props['aria-selected'], true)
  editor.key('ArrowDown')
  editor.key('Tab')
  assert.equal(editor.textarea().props.value, '"Inter Tight", Inter, sans-serif')
}

// Escape closes the list first, and only a second press discards the draft —
// the standard two-step, so a stray Escape cannot throw away typing.
{
  const editor = renderEditor()
  editor.focus(0)
  assert.ok(editor.rows().length > 0)
  editor.key('Escape')
  assert.equal(editor.rows().length, 0, 'Escape closes the popup')
  editor.type('Inter', 5)
  editor.key('Escape')
  assert.equal(editor.textarea().props.value, 'Inter', 'the first Escape only closes the list')
  editor.key('Escape')
  assert.equal(
    editor.textarea().props.value,
    '"Geist Mono" medium, monospace',
    'the second Escape reverts the draft',
  )
}

// The row's copy: the weight line, the un-written hint, and one line per
// diagnostic the query raised.
{
  const editor = renderEditor()
  const text = []
  const walk = (node) => {
    if (typeof node === 'string') text.push(node)
    else if (Array.isArray(node)) for (const child of node) walk(child)
    else if (typeof node === 'object' && node !== null) {
      for (const child of node.children ?? []) walk(child)
      walk(node.props?.children)
    }
  }
  walk(editor.tree)
  assert.ok(text.some((line) => line.includes('font.codeWeight: w500 500')), 'the applied weight is stated')
  assert.ok(text.some((line) => line.includes('font-family: "Geist Mono", monospace')), 'and the stack')

  const warned = renderEditor({ value: '"Nope Sans", monospace', weight: 700 })
  const warnings = collectElements(warned.tree)
    .filter((element) => element.props?.className === 'dsh-font-warn')
    .map((element) => String(element.children.join('')))
  assert.deepEqual(warnings, ['no Nope Sans here'])
}

// The interface axis is not monospace, and its weight word is its own field.
{
  const editor = renderEditor({ monospace: false, weight: 300, value: 'Inter, sans-serif' })
  assert.equal(editor.tree.props.className, 'dsh-font-query')
  assert.equal(editor.textarea().props.value, 'Inter light, sans-serif')
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

// The editor's painted layer and its real textarea must share ONE font, and it
// must not be the user's: a textarea cannot style a substring, so a face with
// ligatures would draw one glyph in the layer and two in the field, and a
// synthesized weight would differ between them. Anything that changes a glyph's
// advance slides the colours off the characters.
{
  const rowStyle = appended
    .map((node) => String(node.textContent ?? ''))
    .find((css) => css.includes('dsh-font-queryInput'))
  assert.ok(rowStyle !== undefined, 'the row stylesheet must be installed')
  const rule = /\.dsh-font-queryLayer,\.dsh-font-queryInput\{([^}]*)\}/.exec(rowStyle)?.[1]
  assert.ok(rule !== undefined, 'both layers must carry exactly the same font rule')
  assert.match(rule, /font-family:ui-monospace/)
  assert.match(rule, /font-weight:400/)
  assert.match(rule, /font-variant-ligatures:none/)
  assert.match(rule, /font-feature-settings:"liga" 0/)
  assert.ok(!rule.includes('--ds-font-family-code'), 'the field must not use the code font')
  assert.ok(!rule.includes('--dsw-font-family'), 'nor the interface font')
  assert.ok(
    !/\.dsh-font-queryCode/.test(rowStyle),
    'no per-axis font rule may exist for the field',
  )
}

assert.equal(dictionaries.length, 1)
assert.deepEqual(Object.keys(dictionaries[0].dict.zh).sort(), Object.keys(dictionaries[0].dict.en).sort())
for (const key of [
  'font.suggestions',
  'font.pending',
  'font.diag.unknownFamily',
  'font.diag.missingWeight',
  'font.diag.duplicateWeight',
  'font.diag.unclosedQuote',
  'font.diag.trailingText',
]) {
  assert.ok(key in dictionaries[0].dict.zh, `the dictionary is missing ${key}`)
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

console.log('verify-client: OK — envelope, stylesheet, theme stacking, and settings row all verified')
console.log(`verify-client: factory required ${requested.join(', ')}`)
