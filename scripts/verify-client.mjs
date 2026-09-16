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
assert.equal(typeof plugin.rankFamilyMatches, 'function')

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

// ── the family-stack editor ─────────────────────────────────────────────────
// Drive the real components rather than a re-implementation.
//
// The React stub does not recursively render function-valued children, so a
// `FamilyStack` tree holds its chips as unresolved `<FamilyChip>` elements.
// The chips are therefore verified at their own level (they are pure), and the
// stack is verified through them plus its own combobox.

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

/** Every unresolved `<FamilyChip>` element in a tree, in order. */
function chipElements(tree) {
  return collectElements(tree).filter(
    (element) => typeof element.type === 'function' && element.type.name === 'FamilyChip',
  )
}

const CHIP_CALLS = ['Inter', 'Fira Code', 'Fira Sans', 'Roboto', 'sans-serif']

/** Render one chip and capture the callbacks it fires. */
function renderChip(family, index, count = CHIP_CALLS.length) {
  const calls = []
  const events = []
  const tree = plugin.FamilyChip({
    family,
    index,
    count,
    onMove: (from, to) => calls.push(['move', from, to]),
    onRemove: (position) => calls.push(['remove', position]),
    moveEarlier: 'Earlier',
    moveLater: 'Later',
    remove: 'Remove',
    onDragStart: (event) => events.push(['dragStart', event]),
    onDragEnd: () => events.push(['dragEnd']),
    onDragOver: (event) => events.push(['dragOver', event]),
    onDrop: (event) => events.push(['drop', event]),
  })
  return {
    tree,
    calls,
    events,
    /** Fire the action whose aria-label is `<label>: <family>`. */
    fire(label) {
      const button = collectElements(tree).find(
        (element) =>
          element.type === 'button' && element.props?.['aria-label'] === `${label}: ${family}`,
      )
      assert.ok(button !== undefined, `no "${label}" button on the ${family} chip`)
      if (button.props.disabled === true) return false
      button.props.onClick()
      return true
    },
    button(label) {
      return collectElements(tree).find(
        (element) =>
          element.type === 'button' && element.props?.['aria-label'] === `${label}: ${family}`,
      )
    },
    /** The chip's own element (the drop target). */
    root() {
      return tree
    },
  }
}

// A chip shows its family name and offers all three actions.
{
  const chip = renderChip('Fira Code', 1)
  const labels = collectElements(chip.tree)
    .filter((element) => element.type === 'button')
    .map((element) => element.props['aria-label'])
  assert.deepEqual(labels, ['Earlier: Fira Code', 'Later: Fira Code', 'Remove: Fira Code'])
}

// Moving and removing report the right positions: off-by-one here would
// reorder the wrong font, which is the whole failure mode of this control.
{
  const chip = renderChip('Fira Code', 1)
  assert.equal(chip.fire('Earlier'), true)
  assert.deepEqual(chip.calls.at(-1), ['move', 1, 0])
  chip.fire('Later')
  assert.deepEqual(chip.calls.at(-1), ['move', 1, 2])
  chip.fire('Remove')
  assert.deepEqual(chip.calls.at(-1), ['remove', 1])
}

// The first chip cannot move earlier; the last cannot move later.
{
  const first = renderChip('Inter', 0)
  assert.equal(first.button('Earlier').props.disabled, true)
  assert.equal(first.fire('Earlier'), false)
  assert.equal(first.calls.length, 0)
  const last = renderChip('sans-serif', CHIP_CALLS.length - 1)
  assert.equal(last.button('Later').props.disabled, true)
  assert.equal(last.fire('Later'), false)
}

// Drag wiring: the arrows are the drag handle and the whole chip is the drop
// target, so the two halves of a drag are attached where the pointer goes.
{
  const chip = renderChip('Fira Code', 1)
  const earlier = chip.button('Earlier')
  assert.equal(earlier.props.draggable, true, 'the arrow must be draggable')
  assert.equal(typeof earlier.props.onDragStart, 'function')
  assert.equal(typeof earlier.props.onDragEnd, 'function')

  const root = chip.root()
  assert.equal(typeof root.props.onDragOver, 'function', 'the chip must accept a hover')
  assert.equal(typeof root.props.onDrop, 'function', 'the chip must accept a drop')

  // The index itself is stamped by the STACK's handler — the chip only
  // forwards — so that is asserted against the stack below.
}

// A chip being dragged is marked, so the strip can show it is in flight.
{
  const dragging = plugin.FamilyChip({
    family: 'Inter',
    index: 0,
    count: 2,
    onMove: () => undefined,
    onRemove: () => undefined,
    moveEarlier: 'E',
    moveLater: 'L',
    remove: 'R',
    dragging: true,
  })
  assert.match(dragging.props.className, /dsh-font-tokenDragging/)
}

const stackWrites = []

/**
 * Render the family-stack editor and re-render after each interaction, the way
 * a state update would.
 * @param value - the stored CSS font-family string.
 * @returns the rendered tree plus interaction helpers.
 */
function renderStack(value) {
  let current = value
  stackWrites.length = 0
  const families = CHIP_CALLS
  const instance = mount()

  const render = () =>
    instance.render(plugin.FamilyStack, {
      value: current,
      families,
      monospace: false,
      fallback: 'sans-serif',
      catalogStatus: 'test',
      add: (next) => {
        stackWrites.push(next)
        current = next
      },
      addLabel: 'Add font',
      remove: 'Remove',
      moveEarlier: 'Earlier',
      moveLater: 'Later',
      genericWarning: 'no generic',
    })

  const helpers = {
    tree: render(),
    /** Re-render and remember the result, for state the component holds. */
    rerender() {
      helpers.tree = render()
      return helpers.tree
    },
    /**
     * Drive one chip action through the stack's own wiring, then re-render.
     * @param label - `Earlier`, `Later`, or `Remove`.
     * @param family - the chip's family name.
     */
    click(label, family) {
      // Read the wiring off the rendered chip element, so the test cannot
      // silently diverge from what the component actually passes down.
      const chipElement = chipElements(helpers.tree).find(
        (element) => element.props?.family === family,
      )
      assert.ok(chipElement !== undefined, `no chip element for ${family}`)
      assert.equal(
        renderChip(family, chipElement.props.index).fire(label),
        true,
        `"${label}" is not available for ${family}`,
      )
      const { index } = chipElement.props
      if (label === 'Remove') chipElement.props.onRemove(index)
      else if (label === 'Earlier') chipElement.props.onMove(index, index - 1)
      else chipElement.props.onMove(index, index + 1)
      helpers.tree = render()
      return stackWrites.at(-1)
    },
    /** The chips the stack currently holds, in order. */
    chips() {
      return chipElements(helpers.tree).map((element) => element.props.family)
    },
    /**
     * Add a family exactly as the combobox's pick handler does, and re-render.
     * @param family - the family to append.
     */
    add(family) {
      const comboboxElement = collectElements(helpers.tree).find(
        (element) => typeof element.type === 'function' && element.type.name === 'FamilyCombobox',
      )
      assert.ok(comboboxElement !== undefined, 'the stack must render a FamilyCombobox')
      comboboxElement.props.add(family)
      helpers.tree = render()
      return stackWrites.at(-1)
    },
  }

  return helpers
}

// Chips reflect the stored string, in order, with quotes stripped.
{
  const stack = renderStack('Inter, "Fira Code", sans-serif')
  assert.deepEqual(stack.chips(), ['Inter', 'Fira Code', 'sans-serif'])
}

// Removing a family rewrites the string without it.
{
  const stack = renderStack('Inter, "Fira Code", sans-serif')
  assert.equal(stack.click('Remove', 'Fira Code'), 'Inter, sans-serif')
  assert.deepEqual(stack.chips(), ['Inter', 'sans-serif'])
}

// Reordering is the point of the chips: the first installed family wins, so a
// move must actually rewrite the order.
{
  const stack = renderStack('Inter, "Fira Code", sans-serif')
  assert.equal(stack.click('Earlier', 'Fira Code'), '"Fira Code", Inter, sans-serif')
  assert.deepEqual(stack.chips(), ['Fira Code', 'Inter', 'sans-serif'])
}
{
  const stack = renderStack('Inter, "Fira Code", sans-serif')
  assert.equal(stack.click('Later', 'Inter'), '"Fira Code", Inter, sans-serif')
}

// Typing filters the catalogue; the chosen family appends to the end of the
// stack, which is what the combobox's pick handler does.
{
  const view = plugin.comboboxView(CHIP_CALLS, 'fira', 0)
  assert.equal(view.visible[0], 'Fira Code')
  const stack = renderStack('Inter, sans-serif')
  assert.equal(stack.add(view.visible[0]), 'Inter, sans-serif, "Fira Code"')
  assert.deepEqual(stack.chips(), ['Inter', 'sans-serif', 'Fira Code'])
}

// ── reordering: the arrows and the drop target share one rule ───────────────
// `moveItem` is what both paths call, so the two can never disagree about the
// resulting order.
{
  const list = ['A', 'B', 'C', 'D']
  assert.deepEqual(plugin.moveItem(list, 0, 2), ['B', 'C', 'A', 'D'])
  assert.deepEqual(plugin.moveItem(list, 3, 0), ['D', 'A', 'B', 'C'])
  assert.deepEqual(plugin.moveItem(list, 1, 1), list, 'a no-op move returns the same reference')
  // A drag can end past either end of the strip, so the target clamps.
  assert.deepEqual(plugin.moveItem(list, 1, 99), ['A', 'C', 'D', 'B'])
  assert.deepEqual(plugin.moveItem(list, 1, -5), ['B', 'A', 'C', 'D'])
  // An out-of-range source is ignored rather than throwing.
  assert.equal(plugin.moveItem(list, 9, 0), list)
  assert.equal(plugin.moveItem(list, -1, 0), list)
  assert.deepEqual(plugin.moveItem([], 0, 0), [])
  assert.deepEqual(plugin.moveItem(['only'], 0, 0), ['only'])
}

// The drop target is decided by which half of the hovered chip the pointer is
// in — the rule that silently reverses a drag when it is wrong.
{
  const rect = { left: 100, width: 40 } // midpoint at 120
  assert.equal(plugin.dropTargetIndex(rect, 101, 2), 2, 'left half drops before')
  assert.equal(plugin.dropTargetIndex(rect, 119, 2), 2)
  assert.equal(plugin.dropTargetIndex(rect, 120, 2), 3, 'right half drops after')
  assert.equal(plugin.dropTargetIndex(rect, 200, 2), 3)
  // Missing geometry must not move anything.
  assert.equal(plugin.dropTargetIndex(undefined, 150, 2), 2)
  assert.equal(plugin.dropTargetIndex(null, 150, 2), 2)
  assert.equal(plugin.dropTargetIndex({}, 150, 2), 2)
}

// End to end over the rule the drop handler applies: dropping onto the left
// half of a chip and onto its right half must produce different orders.
{
  const list = ['A', 'B', 'C', 'D']
  const rect = { left: 100, width: 40 }
  const dropOn = (from, hovered, clientX) => {
    const target = plugin.dropTargetIndex(rect, clientX, hovered)
    // The handler removes the dragged item first, so a target past it shifts
    // back by one; this mirrors that adjustment.
    return plugin.moveItem(list, from, target > from ? target - 1 : target)
  }
  assert.deepEqual(dropOn(3, 1, 105), ['A', 'D', 'B', 'C'], 'D before B')
  assert.deepEqual(dropOn(3, 1, 135), ['A', 'B', 'D', 'C'], 'D after B')
  assert.deepEqual(dropOn(0, 2, 105), ['B', 'A', 'C', 'D'], 'A before C')
  assert.deepEqual(dropOn(0, 2, 135), ['B', 'C', 'A', 'D'], 'A after C')
  // Dropping an item onto itself in either half changes nothing.
  assert.deepEqual(dropOn(2, 2, 105), list)
  assert.deepEqual(dropOn(2, 2, 135), list)
}

// ── the combobox view: the picker's whole decision ──────────────────────────
// Tested as a table over the pure function rather than through a faked React
// runtime, so the assertions are about the behaviour and not about the stub.
{
  // An empty query browses the whole catalogue.
  const browse = plugin.comboboxView(CHIP_CALLS, '', 0)
  assert.deepEqual(browse.visible, CHIP_CALLS)
  assert.equal(browse.custom, undefined, 'an empty query offers no custom row')

  // Filtering is case-insensitive and ranks prefix matches first.
  assert.deepEqual(plugin.comboboxView(CHIP_CALLS, 'fira', 0).visible.slice(0, 2), [
    'Fira Code',
    'Fira Sans',
  ])
  assert.deepEqual(plugin.comboboxView(CHIP_CALLS, 'FIRA', 0).visible.slice(0, 2), [
    'Fira Code',
    'Fira Sans',
  ])
  // Whitespace is trimmed before matching.
  assert.equal(plugin.comboboxView(CHIP_CALLS, '  inter  ', 0).visible[0], 'Inter')

  // A typed family that is not in the catalogue gets a custom row, so a font
  // the probe missed can still be entered.
  const custom = plugin.comboboxView(CHIP_CALLS, 'My Font', 0)
  assert.equal(custom.custom, 'My Font')

  // A typed family that IS in the catalogue must not also offer a custom row,
  // or the same pick would appear twice.
  assert.equal(plugin.comboboxView(CHIP_CALLS, 'Inter', 0).custom, undefined)
  assert.equal(plugin.comboboxView(CHIP_CALLS, 'inter', 0).custom, undefined)

  // The highlight is clamped into range, so a catalogue that shrank under the
  // cursor cannot index past the end and commit the wrong family.
  assert.equal(plugin.comboboxView(CHIP_CALLS, 'fira', 99).active, 1)
  assert.equal(plugin.comboboxView(CHIP_CALLS, 'fira', -5).active, 0)
  assert.equal(plugin.comboboxView(CHIP_CALLS, 'zzzz', 3).active, 0)
}

// Removing the only family must not write an empty CSS value.
{
  const stack = renderStack('Inter')
  assert.equal(stack.click('Remove', 'Inter'), 'sans-serif')
}

// A stack with no generic family warns; one with it does not.
{
  const stack = renderStack('Inter, "Fira Code"')
  const warn = collectElements(stack.tree).find(
    (element) => element.props?.className === 'dsh-font-warn',
  )
  assert.ok(warn !== undefined, 'a stack with no generic family must warn')
}
{
  const stack = renderStack('Inter, sans-serif')
  const warn = collectElements(stack.tree).find(
    (element) => element.props?.className === 'dsh-font-warn',
  )
  assert.equal(warn, undefined, 'a stack ending in a generic family must not warn')
}

// The stack stamps the drag payload and reads the drop geometry — the two
// halves of a drag that the chip itself only forwards.
{
  const stack = renderStack('Inter, "Fira Code", sans-serif')
  const dragged = chipElements(stack.tree)[1]

  // Drag start must set the transfer data, or Firefox never starts a drag.
  const data = new Map()
  dragged.props.onDragStart({
    dataTransfer: { setData: (type, value) => data.set(type, value), effectAllowed: undefined },
  })
  assert.equal(data.get('text/plain'), '1', 'the drag must carry the chip index')

  // The same handler marks the chip, so the strip can show it is in flight.
  stack.rerender()
  assert.equal(chipElements(stack.tree)[1].props.dragging, true, 'the dragged chip is marked')

  // A drop with no drag in flight must do nothing, or an unrelated drop on the
  // page would reorder the stack.
  const before = stackWrites.length
  chipElements(stack.tree)[0].props.onDrop({
    preventDefault: () => undefined,
    clientX: 135,
    currentTarget: { getBoundingClientRect: () => ({ left: 100, width: 40 }) },
    dataTransfer: { dropEffect: undefined },
  })
  assert.equal(stackWrites.length, before, 'a drop with no drag in flight must do nothing')

  // Releasing clears the mark.
  chipElements(stack.tree)[1].props.onDragEnd()
  stack.rerender()
  assert.equal(chipElements(stack.tree)[1].props.dragging, false, 'drag end clears the mark')
}

// A real drop reorders the stack. This is the end-to-end path: drag chip 0,
// release over the right half of chip 2, expect it after chip 2.
{
  const stack = renderStack('Inter, "Fira Code", sans-serif')
  assert.deepEqual(stack.chips(), ['Inter', 'Fira Code', 'sans-serif'])

  chipElements(stack.tree)[0].props.onDragStart({
    dataTransfer: { setData: () => undefined, effectAllowed: undefined },
  })
  stack.rerender()

  // Right half of the third chip (indices 2), so the target is "after it".
  chipElements(stack.tree)[2].props.onDrop({
    preventDefault: () => undefined,
    clientX: 135,
    currentTarget: { getBoundingClientRect: () => ({ left: 100, width: 40 }) },
    dataTransfer: { dropEffect: undefined },
  })
  stack.rerender()

  assert.equal(stackWrites.at(-1), '"Fira Code", sans-serif, Inter')
  assert.deepEqual(stack.chips(), ['Fira Code', 'sans-serif', 'Inter'])
}

// Dropping onto the left half of the first chip moves it to the front.
{
  const stack = renderStack('Inter, "Fira Code", sans-serif')
  chipElements(stack.tree)[2].props.onDragStart({
    dataTransfer: { setData: () => undefined, effectAllowed: undefined },
  })
  stack.rerender()
  chipElements(stack.tree)[0].props.onDrop({
    preventDefault: () => undefined,
    clientX: 105,
    currentTarget: { getBoundingClientRect: () => ({ left: 100, width: 40 }) },
    dataTransfer: { dropEffect: undefined },
  })
  stack.rerender()
  assert.deepEqual(stack.chips(), ['sans-serif', 'Inter', 'Fira Code'])
}

console.log('verify-client: family-stack editor verified')

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
assert.equal(themeOverrides[0].source, PACKAGE_NAME)
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
