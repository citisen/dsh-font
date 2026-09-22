/**
 * Browser half of `dsh-font` — the source of the prebuilt `lib/client.js`.
 *
 * This file is NOT loaded as an ES module. `scripts/build-client.mjs` wraps it
 * in the DSH client-bundle envelope and writes `lib/client.js`, which is what
 * the Web shell fetches. Keep it dependency-light: the only modules it may
 * `import` are the platform-singleton specifiers the shell seeds into its
 * module table, the editor engine the build compiles in, and this plugin's own
 * `./font-grammar.js`, which the build splices into this same scope.
 *
 * Presentation strategy
 * ---------------------
 * Families are *not* written as CSS custom properties directly, because
 * `ui-layout`'s theme presenter owns `document.body.style` and deletes any
 * custom property it did not write on every theme change. Instead the families
 * are stacked onto the design system through the theme service
 * (`ctx.theme.overrideTokens`), which folds them into the active token set so
 * the presenter republishes them — and keeps republishing them — itself.
 *
 * Sizes are a stylesheet, because the shipped components hard-code every
 * interface text size in px and the shipped token scale is a fixed ladder
 * (`--dsw-font-xs-13` is 13px, period). The sheet re-derives each hard-coded
 * step from `--dsh-font-ui-scale` and redefines the conversation text tokens
 * as absolute px, so one integer drives the whole surface.
 *
 * @module dsh-font/client
 */

import React, { useEffect, useRef, useState } from 'react'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import {
  IconChevronDownOutline14,
  IconChevronUpOutline14,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { createEditor } from '@citisen/litearea'
import { dshFontQueryGrammar } from './font-grammar.js'

/** Settings namespace owned by this plugin (mirrors the host half). */
const FONT_SETTINGS_NAMESPACE = 'ui-font'
/** Locale namespace owning this feature's settings-row copy. */
const SETTINGS_LOCALE_NAMESPACE = 'settings.font'
/** Cosmetic namespace for this plugin's CSS classes and tags. */
const STYLE_PREFIX = 'dsh-font'
/**
 * Id of the single stylesheet this plugin owns. The host half's pre-paint
 * bootstrap looks the same element up by this id, so the two must agree;
 * `scripts/verify-client.mjs` asserts that they do.
 */
const FONT_STYLE_ID = `${STYLE_PREFIX}/variables`
/**
 * The plugin's identity in the theme registry, substituted with the real
 * package name by `scripts/build-client.mjs`. The theme pins one override layer
 * per source, so this must equal the package the roster mounted.
 */
const PLUGIN_ID = /* dsh:plugin-id */ 'dsh-font'

/** Field names — must match the host schema in `lib/index.js`. */
const UI_FONT_FAMILY_FIELD = 'uiFontFamily'
const CODE_FONT_FAMILY_FIELD = 'codeFontFamily'
const CODE_FONT_WEIGHT_FIELD = 'codeFontWeight'
const UI_FONT_WEIGHT_FIELD = 'uiFontWeight'
const UI_FONT_SCALE_FIELD = 'uiFontScale'
const CONTENT_FONT_SIZE_FIELD = 'contentFontSize'
const CODE_FONT_SIZE_FIELD = 'codeFontSize'

/** Defaults — must match the host schema in `lib/index.js`. */
const DEFAULT_UI_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif'
const DEFAULT_CODE_FONT_FAMILY =
  '"SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, Courier, "PingFang SC", "Microsoft YaHei"'

/** Accepted ranges — must match the host schema in `lib/index.js`. */
const UI_FONT_SCALE_MIN = 0.75
const UI_FONT_SCALE_MAX = 1.5
const UI_FONT_SCALE_STEP = 0.05
const CONTENT_FONT_SIZE_MIN = 12
const CONTENT_FONT_SIZE_MAX = 20
const CODE_FONT_SIZE_MIN = 10
const CODE_FONT_SIZE_MAX = 20
/** The shipped code weight — must match `DEFAULT_CODE_FONT_WEIGHT` in the host. */
const DEFAULT_CODE_FONT_WEIGHT = 400
/**
 * The shipped interface weight — must match `DEFAULT_UI_FONT_WEIGHT` in the
 * host. It is the design system's own base weight, so it is the "no override"
 * value: the interface weight rule is emitted only for something else.
 */
const DEFAULT_UI_FONT_WEIGHT = 400

/** The interface text sizes the shipped components hard-code, in px. */
const UI_TEXT_STEPS = [11, 12, 13, 14, 16, 20, 24]

// ─── the code weight: a closed vocabulary ───────────────────────────────────
//
// The design system ships no weight token at all: every `font:` declaration in
// the interface is a literal, and the code ladder is literally `400`. So the
// weight cannot ride the family token the way the family does — `font-family`
// has no slot for it, and `font-family: "Geist Mono" 500, monospace` is simply
// an invalid declaration that would drop the whole stack. It has to be a
// separate `font-weight`, which is what the field below carries.
//
// The list is closed rather than a free number on purpose: a `font-weight` a
// family does not have is synthesized by the browser, and offering faux-bold as
// a normal choice is worse than not offering it. The numbers are the CSS Fonts
// keyword scale, which is also the scale the Local Font Access API reports the
// individual faces of a family on.

/** Selectable code weights, in the order the picker shows them. */
const FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900]

/** Locale key suffix per weight — `font.weight.medium` and friends. */
const WEIGHT_KEYS = {
  100: 'thin',
  200: 'extralight',
  300: 'light',
  400: 'regular',
  500: 'medium',
  600: 'semibold',
  700: 'bold',
  800: 'extrabold',
  900: 'black',
}

/**
 * Weight words a typed family name may end with, mapped to their number.
 *
 * This is what makes `Geist Mono Medium` mean "Geist Mono at 500" rather than a
 * literal family called `Geist Mono Medium`, which resolves to nothing. A
 * variable font like Geist Mono has one family and the whole weight axis, so
 * every one of these words — and each static `Light`/`Medium`/`Bold` face file
 * — is a weight, never a family.
 *
 * Deliberately absent: the bare numbers. `400` is far too easy to hit as part
 * of a real family name (`Mono 2`, `JBMono 400`), and the picker has a control
 * for the weight, so a numeric suffix is left alone.
 */
const WEIGHT_WORDS = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  book: 400,
  normal: 400,
  regular: 400,
  roman: 400,
  medium: 500,
  demibold: 600,
  semibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
  extrablack: 900,
  ultrablack: 900,
}

// ─── the font query: a small language over `font-family` ────────────────────
//
// What the settings row edits is a *query*, not a CSS value:
//
//     Geist Mono medium, "Zhuque Fangsong (technical preview)", monospace
//     └─────┬────┘ └──┬─┘
//         family    weight
//
// The grammar is the CSS font-family list plus the one thing the list cannot
// carry: the weight. `font-family: "Geist Mono" 500, monospace` is an invalid
// declaration that drops the whole stack, so the weight has to be its own
// `font-weight` — but it can still be *written* next to the family it belongs
// to, which is what makes one field able to describe both. A weight is chosen
// for a family; having to change them in two separate places is exactly the
// problem this language exists to remove.
//
//   query  := entry ("," entry)*
//   entry  := family | weight
//   family := '"' … '"' | "'" … "'" | word (space word)*
//   weight := a word from WEIGHT_WORDS
//
// Only the LAST word of an unquoted entry may be a weight word, and only when
// the whole entry is not itself a catalogued family: `Book Antiqua` and
// `Franklin Gothic Medium` are real families, and stripping either would
// silently retarget the stack at a font nobody picked. Quoting always means
// "this is the family name, verbatim", so a quoted entry never splits.
//
// The weight is one value for the whole axis, so where it is written does not
// change what it means. The canonical form puts it after the FIRST family —
// the one that is in effect — where it reads as a property of that family.
//
// The parser is forgiving on purpose. This text is typed by hand into a small
// box, not generated, so anything it cannot place is kept as written and
// reported as a diagnostic instead of being silently dropped.

/** One diagnostic code the reader can raise; the row localizes each one. */
const QUERY_DIAGNOSTIC = {
  unknownFamily: 'unknown-family',
  missingWeight: 'missing-weight',
  duplicateWeight: 'duplicate-weight',
  unclosedQuote: 'unclosed-quote',
  trailingText: 'trailing-text',
}

/**
 * The word a numeric weight is spelled with in a query: 500 -> `medium`.
 * @param weight - a numeric weight, or anything `normalizeWeight` accepts.
 * @returns the canonical word for it.
 */
function weightWord(weight) {
  return WEIGHT_KEYS[normalizeWeight(weight)] ?? String(weight)
}

/**
 * The weights one family actually has, read off its faces' style names.
 *
 * The Local Font Access API reports a face's `style` (`Regular`, `SemiBold`,
 * `Bold Italic`) rather than a number, so the mapping is the same vocabulary
 * the query itself accepts — which is also why `Semi Bold` has to be folded
 * back into one word before the lookup: the API's spelling is not guaranteed.
 *
 * An empty result means "unknown", not "none": enumerating faces is
 * permission-gated and a family may report styles this vocabulary cannot read.
 * Callers must treat it as the absence of evidence.
 * @param styles - the face style names of one family.
 * @returns the distinct weights, ascending.
 */
function faceWeights(styles) {
  if (!Array.isArray(styles)) return []
  const found = new Set()
  for (const style of styles) {
    const text = String(style)
      .toLowerCase()
      .replace(/\b(semi|demi)\s+(?=[a-z])/g, 'semi')
      .replace(/\b(extra|ultra)\s+(?=[a-z])/g, 'extra')
    for (const word of text.split(/[^a-z]+/)) {
      if (Object.hasOwn(WEIGHT_WORDS, word)) found.add(WEIGHT_WORDS[word])
    }
  }
  return [...found].sort((left, right) => left - right)
}

/**
 * Whether a lowercase name is a generic CSS family (`monospace`, `serif`, …).
 * Generic families are always valid in a list, but picking one is a different
 * intent from picking an installed font, so the language colours them apart.
 * @param name - a lowercase family name.
 * @returns whether it is generic.
 */
function isGenericFamilyName(name) {
  return GENERIC_FAMILIES.includes(name)
}

/**
 * Split a query into its comma-separated entries, keeping every raw slice.
 *
 * The raw slices are what makes an edit able to rewrite the text without
 * reformatting it: `lead + core + trail` is always exactly the entry as it was
 * found, so a rewrite that only reorders entries cannot lose a space.
 *
 * Commas inside quotes are not separators. Backslash escapes are deliberately
 * not interpreted — consistent with {@link parseFamilyList} — so a family name
 * containing the quote character has to be written with the other quote style.
 *
 * @param text - the query.
 * @returns one record per entry, in order; a blank query yields one empty entry.
 */
function splitQueryEntries(text) {
  const source = typeof text === 'string' ? text : ''
  const bounds = []
  let start = 0
  let quote = ''
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quote !== '') {
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === ',') {
      bounds.push([start, index])
      start = index + 1
    }
  }
  bounds.push([start, source.length])

  return bounds.map(([from, to]) => {
    const text = source.slice(from, to)
    const trimmed = text.trim()
    const lead = trimmed === '' ? text : text.slice(0, text.indexOf(trimmed))
    const core = trimmed
    const trail = text.slice(lead.length + core.length)
    return {
      text,
      start: from,
      end: to,
      lead,
      core,
      trail,
    }
  })
}

/**
 * Read one entry into the family it names and the weight word it carries.
 *
 * The two shapes a weight can take are both here: a bare entry whose last word
 * is a weight (`Geist Mono medium`), and a quoted family followed by one
 * (`"Geist Mono" medium` — which is what the canonical form writes, and why a
 * quoted entry cannot simply mean "no weight"). A quoted name whose closing
 * quote is the last character carries no weight, so `"Book Antiqua"` stays a
 * name even though a bare `Book Antiqua` could split if it were not catalogued.
 *
 * This is the same reading the editor's grammar performs, and the grammar is
 * built on this function rather than on a second copy of it.
 *
 * @param entry - one record from {@link splitQueryEntries}.
 * @param known - the lowercase catalogue.
 * @param enumerated - whether the catalogue is authoritative.
 * @returns `{ name, word, diagnostics }`.
 */
function readQueryEntry(entry, known, enumerated) {
  const core = entry.core
  const diagnostics = []
  if (core === '') return { name: '', word: undefined, diagnostics }

  const quoteChar = core[0]
  const quote = quoteChar === '"' || quoteChar === "'" ? quoteChar : ''
  const lower = core.toLowerCase()
  let name = core
  let word

  if (quote !== '') {
    const close = core.indexOf(quote, 1)
    if (close < 0) {
      diagnostics.push({ code: QUERY_DIAGNOSTIC.unclosedQuote })
      name = core.slice(1).trim()
    } else {
      name = core.slice(1, close)
      const rest = core.slice(close + 1).trim()
      if (rest !== '') {
        if (Object.hasOwn(WEIGHT_WORDS, rest.toLowerCase())) {
          word = rest.toLowerCase()
        } else {
          diagnostics.push({ code: QUERY_DIAGNOSTIC.trailingText, text: rest })
        }
      }
    }
  } else if (isGenericFamilyName(lower) || known.has(lower)) {
    // The whole entry is one family: there is nothing to strip off it.
  } else if (Object.hasOwn(WEIGHT_WORDS, lower)) {
    // A bare weight word stands on its own, without a family.
    name = ''
    word = lower
  } else {
    const cut = lower.lastIndexOf(' ')
    if (cut > 0 && Object.hasOwn(WEIGHT_WORDS, lower.slice(cut + 1))) {
      word = lower.slice(cut + 1)
      name = core.slice(0, core.length - word.length).trim()
    }
  }

  const nameLower = name.trim().toLowerCase()
  const generic = nameLower !== '' && isGenericFamilyName(nameLower)
  const catalogued = nameLower !== '' && known.has(nameLower)
  if (nameLower !== '' && !generic && !catalogued && enumerated) {
    diagnostics.push({ code: QUERY_DIAGNOSTIC.unknownFamily, name: name.trim() })
  }
  return { name: name.trim(), word, diagnostics }
}

/** The diagnostic-free pieces a query resolves to. */
function emptyQueryRead() {
  return {
    families: [],
    weight: undefined,
    weightWord: undefined,
    effective: -1,
    diagnostics: [],
  }
}

/**
 * Read a query into the families it names, the weight it carries, and the
 * problems a reader is owed — the one pass behind {@link parseFontQuery}.
 * @param text - the query.
 * @param options - `{ catalogue, styles, enumerated }`. `enumerated` declares
 *   the catalogue authoritative (read from the machine), which is what makes an
 *   unrecognized family worth warning about.
 * @returns `{ entries, families, weight, weightWord, effective, diagnostics }`.
 */
function readFontQuery(text, options) {
  const read = emptyQueryRead()
  if (typeof text !== 'string' || text === '') return read

  const catalogue = Array.isArray(options?.catalogue) ? options.catalogue : []
  const known = new Set(catalogue.map((family) => String(family).toLowerCase()))
  const styles = options?.styles ?? {}
  const styleKeys = new Map()
  for (const key of Object.keys(styles)) styleKeys.set(key.toLowerCase(), key)
  const enumerated = options?.enumerated === true

  let sawWeight = false

  for (const entry of splitQueryEntries(text)) {
    const readEntry = readQueryEntry(entry, known, enumerated)
    for (const diagnostic of readEntry.diagnostics) read.diagnostics.push(diagnostic)
    if (readEntry.name !== '') read.families.push(readEntry.name)

    if (readEntry.word !== undefined) {
      if (!sawWeight) {
        sawWeight = true
        read.weight = WEIGHT_WORDS[readEntry.word]
        read.weightWord = readEntry.word
      } else {
        read.diagnostics.push({ code: QUERY_DIAGNOSTIC.duplicateWeight, word: readEntry.word })
      }
    }
  }

  // ── the family that is actually in effect ────────────────────────────────
  // With an authoritative catalogue the first *installed* family wins, because
  // that is the one the browser will paint with. Without one the catalogue is
  // only a suggestion list, so the parser cannot second-guess the first entry.
  if (read.families.length > 0) {
    if (!enumerated) {
      read.effective = 0
    } else {
      for (let index = 0; index < read.families.length; index += 1) {
        const lower = read.families[index].toLowerCase()
        if (isGenericFamilyName(lower) || known.has(lower)) {
          read.effective = index
          break
        }
      }
    }
  }

  // ── a weight the effective family does not have ──────────────────────────
  // Only reported when the faces of that family are actually known: an empty
  // face list means "not read", never "not installed".
  if (read.weight !== undefined && read.effective >= 0) {
    const family = read.families[read.effective]
    const key = styleKeys.get(family.toLowerCase())
    const weights = key === undefined ? [] : faceWeights(styles[key])
    if (weights.length > 0 && !weights.includes(read.weight)) {
      read.diagnostics.push({
        code: QUERY_DIAGNOSTIC.missingWeight,
        name: family,
        weight: read.weight,
        word: read.weightWord,
      })
    }
  }

  return read
}

/**
 * Parse a query into the two stored fields it stands for.
 * @param text - the query.
 * @param options - see {@link readFontQuery}.
 * @returns `{ families, weight, weightWord, effective, diagnostics }`.
 */
function parseFontQuery(text, options) {
  const read = readFontQuery(text, options)
  return {
    families: read.families,
    weight: read.weight,
    weightWord: read.weightWord,
    effective: read.effective,
    diagnostics: read.diagnostics,
  }
}

/**
 * Write families and a weight back out as the canonical query.
 *
 * The weight is attached to the first family — the one in effect — and is
 * omitted entirely for `undefined`, which is how an axis says "no weight of my
 * own". Everything else is quoted the way CSS requires.
 * @param families - family names in priority order.
 * @param weight - the numeric weight, or undefined.
 * @returns the query text.
 */
function serializeFontQuery(families, weight) {
  const list = Array.isArray(families) ? families : []
  const word = weight === undefined || weight === null ? undefined : weightWord(weight)
  return list
    .map((family, index) =>
      index === 0 && word !== undefined ? `${quoteFamily(family)} ${word}` : quoteFamily(family),
    )
    .filter((token) => token !== '')
    .join(', ')
}

/**
 * Families plus a weight, as the text the editor edits.
 *
 * The axis's shipped weight carries no word. Nobody chose it, so spelling it out
 * would put a `regular` after every interface font, and for the interface axis
 * 400 literally means "no override"; the readout under the field is where the
 * value in force is stated instead.
 * @param families - family names in priority order.
 * @param weight - the axis's weight.
 * @param shippedWeight - the weight the axis ships with.
 * @returns the query text.
 */
function asQuery(families, weight, shippedWeight) {
  return serializeFontQuery(families, weight === shippedWeight ? undefined : weight)
}

/**
 * The two stored fields read as the one query the editor edits.
 *
 * The family list is parsed rather than trusted: a weight word left inside the
 * stored string by a hand edit belongs to the weight field, so the two values
 * are read as one query instead of the raw string being shown. A value that
 * parses to no family at all is kept as written, which is what stops a stack
 * the parser cannot place from being silently emptied on load.
 * @param value - the stored family list.
 * @param weight - the stored weight.
 * @param options - see {@link readFontQuery}.
 * @param shippedWeight - the weight the axis ships with.
 * @returns `{ text, families }`: the text the editor starts from, and the family
 *   names it stands for, which is what the readout under the box states.
 */
function storedQuery(value, weight, options, shippedWeight) {
  const read = parseFontQuery(value, options)
  const families = read.families.length > 0 ? read.families : parseFamilyList(value)
  return { text: asQuery(families, weight, shippedWeight), families }
}

/**
 * Tell the row what a query means: the two settings fields it names.
 *
 * This is the whole hand-off between the editor and the settings, and it is a
 * pure function of the text, so the verifier can drive it without a browser. It
 * runs on EVERY change rather than on a commit: the library owns the text, so
 * there is no controlled field to re-render and nothing to wait for.
 *
 * A query that names no family is an unfinished edit and writes nothing — the
 * saved stack is still in use, and silently refilling a box the user just
 * cleared is indistinguishable from a bug. A query that names a weight but no
 * family still moves that axis, because a weight alone is a complete statement
 * about it.
 * @param text - the query as it stands in the editor.
 * @param options - see {@link readFontQuery}.
 * @param write - `{ onFamilies, onWeight }`, the row's two write paths.
 * @returns the parse, so a caller can report the same reading it wrote.
 */
function applyFontQuery(text, options, write) {
  const read = parseFontQuery(text, options)
  if (read.families.length > 0) write.onFamilies(serializeFamilyList(read.families))
  if (read.weight !== undefined) write.onWeight(read.weight)
  return read
}

/**
 * Move the entry a caret sits in one slot earlier or later.
 *
 * This is the editor's answer to drag-and-drop: order is still significant (the
 * first installed family wins), but it is edited as text, so the keyboard never
 * has to reach for a pointer. Only the entries swap; every space and comma
 * stays exactly where it was.
 *
 * @param text - the query.
 * @param caret - the caret offset, which selects the entry to move.
 * @param delta - `-1` for earlier, `1` for later.
 * @returns `{ text, caret }`; unchanged when the move leaves the list.
 */
function moveFontQueryEntry(text, caret, delta) {
  const source = typeof text === 'string' ? text : ''
  const entries = splitQueryEntries(source)
  if (entries.length < 2) return { text: source, caret }

  let index = entries.length - 1
  for (let position = 0; position < entries.length; position += 1) {
    if (caret <= entries[position].end) {
      index = position
      break
    }
  }
  const target = index + delta
  if (target < 0 || target >= entries.length) return { text: source, caret }

  const cores = entries.map((entry) => entry.core)
  const moved = cores[index]
  cores[index] = cores[target]
  cores[target] = moved

  const parts = entries.map((entry, position) => `${entry.lead}${cores[position]}${entry.trail}`)
  const starts = []
  let cursor = 0
  for (const part of parts) {
    starts.push(cursor)
    cursor += part.length + 1 // the comma this part is joined with
  }
  const offset = Math.min(
    Math.max(caret - (entries[index].start + entries[index].lead.length), 0),
    cores[target].length,
  )
  return {
    text: parts.join(','),
    caret: starts[target] + entries[target].lead.length + offset,
  }
}

/**
 * Alt+Arrow: move the entry the caret sits in, and put the caret back on it.
 *
 * This is the plugin's own binding, not an editor feature. The library has no
 * such key — reordering is a fact about a font stack, where the first resolvable
 * family wins, and not about text in general — so it is implemented here, on the
 * editor's own `input`, and it is the only keyboard gesture this plugin adds.
 *
 * It is a TEXT edit rather than a settings write. `setValue(…, true)` is what
 * makes it one undoable edit rather than a document load, which is what keeps
 * Ctrl+Z from throwing away everything the user typed before the move; the caret
 * is restored afterwards because the reorder moved the text under it.
 *
 * @param editor - the editor handle: `value`, `input`, `setValue`, `setSelection`.
 * @param event - the `keydown` event.
 * @param options - see {@link readFontQuery}.
 * @param write - `{ onFamilies, onWeight }`, the row's two write paths.
 * @returns `{ text, caret }` when the key moved an entry, `undefined` when it was
 *   not a reorder or the entry was already at the end of the list.
 */
function reorderFontQueryEntry(editor, event, options, write) {
  if (event.altKey !== true) return undefined
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return undefined
  const moved = moveFontQueryEntry(
    editor.value,
    editor.input.selectionStart ?? 0,
    event.key === 'ArrowUp' ? -1 : 1,
  )
  if (moved.text === editor.value) return undefined
  event.preventDefault()
  editor.setValue(moved.text, true)
  editor.setSelection(moved.caret)
  applyFontQuery(moved.text, options, write)
  return moved
}

/**
 * The weight an interface step keeps when the whole interface is moved.
 *
 * The interface has a weight hierarchy — headings 700, table heads 500, body
 * 400 — and setting the interface weight has to preserve the *contrast* between
 * those steps rather than flatten it, or every heading would sink below the body
 * once the base goes past it. So each step keeps its shipped distance from 400
 * and is never allowed below the base.
 *
 * @param shipped - the step's shipped weight.
 * @param weight - the interface weight.
 * @returns the weight that step takes.
 */
function emphasisWeight(shipped, weight) {
  if (weight === DEFAULT_UI_FONT_WEIGHT) return shipped
  return Math.min(900, Math.max(shipped, shipped + weight - DEFAULT_UI_FONT_WEIGHT))
}

/**
 * Whether a diagnostic is a syntax error or a note about the machine.
 *
 * Text the reader cannot make sense of is marked as an error — the red line the
 * user is owed when their input is wrong — while a family or a weight that is
 * merely not installed here stays a warning: it is still a valid query, and the
 * browser may well resolve it.
 * @param code - a `QUERY_DIAGNOSTIC` code.
 * @returns `'error'` or `'warn'`.
 */
function diagnosticKind(code) {
  return code === QUERY_DIAGNOSTIC.unclosedQuote || code === QUERY_DIAGNOSTIC.trailingText
    ? 'error'
    : 'warn'
}

/** Substitute `{name}`-style placeholders in one locale template. */
function fillTemplate(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  )
}

/**
 * Localize one query diagnostic.
 * @param diagnostic - a record from {@link parseFontQuery}'s `diagnostics`.
 * @param labels - the row's copy: `unknownFamily`, `missingWeight`,
 *   `duplicateWeight`, `unclosedQuote`.
 * @returns the message to show, or `''` for a code this build does not know.
 */
function describeDiagnostic(diagnostic, labels) {
  switch (diagnostic.code) {
    case QUERY_DIAGNOSTIC.unknownFamily:
      return fillTemplate(labels.unknownFamily, { name: diagnostic.name })
    case QUERY_DIAGNOSTIC.missingWeight:
      return fillTemplate(labels.missingWeight, {
        family: diagnostic.name,
        weight: diagnostic.weight,
        word: diagnostic.word,
      })
    case QUERY_DIAGNOSTIC.duplicateWeight:
      return fillTemplate(labels.duplicateWeight, { word: diagnostic.word })
    case QUERY_DIAGNOSTIC.unclosedQuote:
      return labels.unclosedQuote
    case QUERY_DIAGNOSTIC.trailingText:
      return fillTemplate(labels.trailingText, { text: diagnostic.text })
    default:
      return ''
  }
}

/**
 * The number a stored weight token stands for.
 * @param weight - a stored value or a weight word.
 * @returns the numeric weight, falling back to the shipped one.
 */
function normalizeWeight(weight) {
  if (typeof weight === 'number' && FONT_WEIGHTS.includes(weight)) return weight
  if (typeof weight === 'string' && Object.hasOwn(WEIGHT_WORDS, weight.toLowerCase())) {
    return WEIGHT_WORDS[weight.toLowerCase()]
  }
  return DEFAULT_CODE_FONT_WEIGHT
}

// ─── the font-family list: parse, serialize, discover ───────────────────────
//
// The stored value stays a plain CSS font-family string (that is what the host
// schema declares and what the theme token consumes), so this section is purely
// a presentation layer over it: parse the string into an ordered list for the
// chips, and serialize the chips back. The weight is the one thing the string
// cannot express, so it is a second field rather than anything added here.

/** Generic CSS families. Valid anywhere in a list, but only useful at the end. */
const GENERIC_FAMILIES = [
  'system-ui',
  'sans-serif',
  'serif',
  'monospace',
  'cursive',
  'fantasy',
  'math',
  'emoji',
  'fangsong',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'ui-rounded',
]

/**
 * Popular families offered as suggestions even when not detected. Detection
 * cannot see every font, and a family may be installed later, so the picker
 * must not present itself as the complete truth.
 */
const COMMON_FAMILIES = [
  'Inter',
  'IBM Plex Sans',
  'IBM Plex Mono',
  'Noto Sans',
  'Noto Sans SC',
  'Noto Serif',
  'Source Han Sans SC',
  'Source Han Serif SC',
  'JetBrains Mono',
  'Fira Code',
  'Fira Sans',
  'Cascadia Code',
  'Cascadia Mono',
  'Maple Mono',
  'Roboto',
  'Roboto Mono',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Ubuntu',
  'Ubuntu Mono',
  'DejaVu Sans',
  'DejaVu Sans Mono',
  'Hack',
  'Inconsolata',
  'Iosevka',
  'Comic Sans MS',
  'PingFang SC',
  'Hiragino Sans GB',
  'Microsoft YaHei',
  'Microsoft YaHei UI',
  'Microsoft JhengHei',
  'SimSun',
  'SimHei',
  'KaiTi',
  'Segoe UI',
  'Segoe UI Variable',
  'Helvetica Neue',
  'Arial',
  'Consolas',
  'Menlo',
  'Monaco',
  'SF Mono',
  'Courier New',
  'Times New Roman',
  'Georgia',
]

/**
 * Families worth probing for when the Local Font Access API is unavailable.
 * Each entry costs two text measurements, so this stays curated rather than
 * exhaustive.
 */
const PROBE_FAMILIES = [
  ...new Set([...COMMON_FAMILIES, ...GENERIC_FAMILIES]),
  '-apple-system',
  'BlinkMacSystemFont',
  'Meiryo',
  'Yu Gothic',
  'Malgun Gothic',
  'Segoe UI Emoji',
  'Noto Color Emoji',
  'Apple Color Emoji',
  'Cambria',
  'Calibri',
  'Candara',
  'Corbel',
  'Franklin Gothic Medium',
  'Trebuchet MS',
  'Verdana',
  'Tahoma',
  'Lucida Console',
  'Lucida Sans Unicode',
  'Palatino Linotype',
  'Book Antiqua',
  'Garamond',
  'FangSong',
  'Microsoft Himalaya',
  'Sarasa Mono SC',
  'LXGW WenKai',
  'HarmonyOS Sans SC',
  'MiSans',
  'Source Code Pro',
  'Roboto Condensed',
  'Roboto Slab',
  'PT Sans',
  'PT Mono',
  'Nunito',
  'Rubik',
  'Work Sans',
  'Space Mono',
  'Victor Mono',
  'Cousine',
  'Anonymous Pro',
  'Liberation Mono',
  'Liberation Sans',
  'Nimbus Mono PS',
  'Droid Sans Mono',
]

/** The family used as the "not installed" baseline when probing. */
const PROBE_BASELINE = 'monospace'
/** Text that renders differently across families in both width and height. */
const PROBE_TEXT = 'mmmmmmmmmmlliWWQ@#中永'
/** Probe font size, in px. */
const PROBE_SIZE = 72
/** One finished discovery result. */
const FONT_DISCOVERY_CACHE_KEY = 'dsh-font:discovery:v2'

/**
 * Split a CSS font-family string into its individual family names, unwrapping
 * quotes. Commas inside quotes are preserved, which a naive `split(',')` gets
 * wrong for the `"Foo, Bar"` form.
 * @param value - a CSS font-family value.
 * @returns family names in order; `[]` for a blank value.
 */
function parseFamilyList(value) {
  if (typeof value !== 'string') return []
  const families = []
  let current = ''
  let quote = ''
  for (const char of value) {
    if (quote !== '') {
      if (char === quote) quote = ''
      else current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === ',') {
      families.push(current)
      current = ''
      continue
    }
    current += char
  }
  families.push(current)
  return families.map((family) => family.trim()).filter((family) => family !== '')
}

/**
 * Render one family name for a CSS list, quoting it when CSS requires it.
 * A family is a sequence of identifiers, so anything with a space or a leading
 * digit must be quoted; names are emitted double-quoted because that is the
 * form the shipped defaults already use.
 * @param family - a bare family name.
 * @returns the CSS token for it.
 */
function quoteFamily(family) {
  const name = family.trim()
  if (name === '') return ''
  // A CSS-wide keyword or a generic family must not be quoted: `"sans-serif"`
  // would name a literal font instead of the generic family. A single leading
  // hyphen is part of an identifier (`-apple-system`), so it survives unquoted
  // too — which is what lets the shipped interface stack round-trip unchanged.
  if (/^-?[A-Za-z][\w-]*$/.test(name)) return name
  return `"${name.replaceAll('"', '')}"`
}

/**
 * Join family names back into a CSS font-family string.
 * @param families - family names in priority order.
 * @returns the CSS value.
 */
function serializeFamilyList(families) {
  return families.map(quoteFamily).filter((token) => token !== '').join(', ')
}

/**
 * Measure whether one family is actually installed.
 *
 * The technique is the classic width/height comparison: render the probe text
 * in `<family>, <baseline>` and again in the bare baseline. When the family is
 * absent both renders lay out identically, because the browser fell through to
 * the same baseline font. This needs no permission and works in every browser,
 * which is why it is the fallback rather than the primary.
 * @param family - family name to test.
 * @returns whether it renders differently from the baseline.
 */
function isFamilyAvailable(family) {
  if (typeof document === 'undefined') return false
  if (family === PROBE_BASELINE) return true
  const probe = document.createElement('span')
  probe.textContent = PROBE_TEXT
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = [
    'position:absolute',
    'left:-9999px',
    'top:-9999px',
    'visibility:hidden',
    'white-space:nowrap',
    `font-size:${String(PROBE_SIZE)}px`,
    'line-height:normal',
  ].join(';')
  const parent = document.body ?? document.documentElement
  if (parent === null || parent === undefined) return false
  parent.appendChild(probe)
  try {
    probe.style.fontFamily = PROBE_BASELINE
    const baseWidth = probe.offsetWidth
    const baseHeight = probe.offsetHeight
    probe.style.fontFamily = `${quoteFamily(family)}, ${PROBE_BASELINE}`
    return probe.offsetWidth !== baseWidth || probe.offsetHeight !== baseHeight
  } finally {
    probe.remove()
  }
}

/**
 * Ask the browser for the real installed families and their face styles.
 *
 * Chromium's Local Font Access API is the only way to enumerate actual fonts.
 * It is permission-gated, absent in Firefox and Safari, and — per the spec —
 * browsers are not obliged to return the complete list, so the result is a
 * supplement to the curated catalogue, never a replacement.
 *
 * The per-face `style` names (`Regular`, `Medium`, `Bold Italic`) are collected
 * alongside the families because they are what lets the editor offer *this*
 * family's weights and catch a weight the family does not have, instead of
 * offering the whole CSS vocabulary blindly.
 * @returns `{ families, styles }`, or undefined when unavailable or declined.
 */
async function queryInstalledFamilies() {
  if (typeof window === 'undefined') return undefined
  const query = window.queryLocalFonts
  if (typeof query !== 'function') return undefined
  try {
    const fonts = await query.call(window)
    const families = new Set()
    const styles = {}
    for (const font of fonts) {
      if (typeof font?.family !== 'string' || font.family.trim() === '') continue
      const family = font.family.trim()
      families.add(family)
      const style = typeof font.style === 'string' ? font.style.trim() : ''
      if (style === '') continue
      const list = styles[family] ?? (styles[family] = [])
      if (!list.includes(style)) list.push(style)
    }
    return {
      families: [...families].sort((left, right) => left.localeCompare(right)),
      styles,
    }
  } catch {
    // A denied or dismissed permission prompt lands here. Fall back quietly:
    // the picker still works, just with a smaller catalogue.
    return undefined
  }
}

/** Read the cached discovery result, if it is still valid. */
function readDiscoveryCache() {
  try {
    const raw = sessionStorage.getItem(FONT_DISCOVERY_CACHE_KEY)
    if (raw === null) return undefined
    const parsed = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return undefined
    if (!Array.isArray(parsed.families)) return undefined
    // A cache written before the face styles existed has the families but not
    // the weights, so it is treated as a miss rather than half-adopted.
    const styles = parsed.styles
    if (styles === null || typeof styles !== 'object' || Array.isArray(styles)) return undefined
    return { families: parsed.families, styles, enumerated: parsed.enumerated === true }
  } catch {
    return undefined
  }
}

/** Remember a discovery result for the rest of the session. */
function writeDiscoveryCache(result) {
  try {
    sessionStorage.setItem(FONT_DISCOVERY_CACHE_KEY, JSON.stringify(result))
  } catch {
    /* private mode or a full quota; the in-memory copy still serves this render */
  }
}

/**
 * Discover selectable families, cheapest source first: the session cache, then
 * the Local Font Access API when the browser offers it, then the measurement
 * probe. Measured families are verified as present; enumerated and curated ones
 * are offered without that guarantee, and the UI says so.
 * @returns `{ families, styles, enumerated, measured }`.
 */
async function discoverFamilies() {
  const cached = readDiscoveryCache()
  if (cached !== undefined) {
    const result = { families: cached.families, styles: cached.styles, enumerated: cached.enumerated }
    writeDiscoveryCache(result)
    return { ...result, measured: true }
  }

  const enumerated = await queryInstalledFamilies()
  if (enumerated !== undefined && enumerated.families.length > 0) {
    const families = [...new Set([...enumerated.families, ...COMMON_FAMILIES])].sort((left, right) =>
      left.localeCompare(right),
    )
    const result = { families, styles: enumerated.styles, enumerated: true }
    writeDiscoveryCache(result)
    return { ...result, measured: true }
  }

  const installed = PROBE_FAMILIES.filter((family) => {
    try {
      return isFamilyAvailable(family)
    } catch {
      return false
    }
  })
  const families = [...new Set([...installed, ...COMMON_FAMILIES])].sort((left, right) =>
    left.localeCompare(right),
  )
  const result = { families, styles: {}, enumerated: false }
  writeDiscoveryCache(result)
  return { ...result, measured: true }
}

/** Row copy, keyed by locale. `zh` is the key-set source of truth. */
const zh = {
  'font.title': '字体',
  'font.description': '自定义界面与代码字体、字号，设置会保存到本机',
  'font.uiFamily': '界面字体',
  'font.uiFamilyHint':
    '字体查询：字体族，后面可以跟字重，例如 Inter, "PingFang SC", sans-serif；逗号分隔，靠前的优先',
  'font.codeFamily': '代码字体',
  'font.codeFamilyHint':
    '用于代码块、行内代码与终端等宽文本，例如 Geist Mono medium, monospace',
  'font.uiWeight': '界面字重',
  'font.codeWeight': '代码字重',
  'font.weightShipped': '（出厂值，未覆盖）',
  'font.emptyQuery': '这个查询还是空的：没有写入任何字体，当前仍在用已保存的设置；要回到出厂值请按「恢复默认」',
  'font.diag.unknownFamily': '本机字体列表里没有 {name}，仍会写入，浏览器可能回退到后面的字体',
  'font.diag.missingWeight': '{family} 在本机没有 {weight} 这个字面（{word}），浏览器会合成',
  'font.diag.duplicateWeight': '字重只能写一次，已采用第一个；多余的 {word} 被忽略',
  'font.diag.unclosedQuote': '引号没有闭合，之后的内容都会被当作同一个字体名',
  'font.diag.trailingText': '引号后面多了“{text}”，它既不是字重也不属于这个字体名，已被忽略',
  'font.weight.thin': '极细',
  'font.weight.extralight': '特细',
  'font.weight.light': '细体',
  'font.weight.regular': '常规',
  'font.weight.medium': '中等',
  'font.weight.semibold': '半粗',
  'font.weight.bold': '粗体',
  'font.weight.extrabold': '特粗',
  'font.weight.black': '黑体',
  'font.uiScale': '界面字号',
  'font.uiScaleHint': '按比例缩放整个界面的文字大小',
  'font.contentSize': '会话正文字号',
  'font.contentSizeHint': '对话正文、标题与表格的字号',
  'font.codeSize': '代码字号',
  'font.codeSizeHint': '代码块与行内代码的字号',
  'font.unit': 'px',
  'font.reset': '恢复默认',
  'font.increase': '增大',
  'font.decrease': '减小',
  'font.catalogProbed':
    '字体列表只包含探测到的常用字体（读取本机字体的权限不可用或被拒绝）；任何字体名仍然可以直接写',
  'font.genericWarning': '末尾缺少通用字体族（如 sans-serif），指定字体都缺失时可能回退到意外字体',
}

/** English dictionary, checked complete against the `zh` key set. */
const en = {
  'font.title': 'Fonts',
  'font.description':
    'Customize the interface and code fonts and sizes; values are saved on this machine',
  'font.uiFamily': 'Interface font',
  'font.uiFamilyHint':
    'A font query: a family, optionally followed by a weight — e.g. Inter, "PingFang SC", sans-serif. Comma-separated, earlier wins',
  'font.codeFamily': 'Code font',
  'font.codeFamilyHint':
    'Used for code blocks, inline code, and monospace text, e.g. Geist Mono medium, monospace',
  'font.uiWeight': 'Interface weight',
  'font.codeWeight': 'Code weight',
  'font.weightShipped': ' (shipped, not overridden)',
  'font.emptyQuery':
    'This query is empty: nothing is written, the saved setting is still in use — press Reset to defaults to go back to the shipped stack',
  'font.diag.unknownFamily':
    'No {name} in this machine\u2019s font list; it is still stored, but the browser may fall through to the next family',
  'font.diag.missingWeight':
    '{family} has no {weight} face on this machine ({word}), so the browser will synthesize it',
  'font.diag.duplicateWeight': 'A query carries one weight; the first wins and {word} is ignored',
  'font.diag.unclosedQuote':
    'The quote is never closed, so everything after it is read as the same family name',
  'font.diag.trailingText':
    '“{text}” follows the closing quote; it is neither a weight nor part of that name, so it is ignored',
  'font.weight.thin': 'Thin',
  'font.weight.extralight': 'ExtraLight',
  'font.weight.light': 'Light',
  'font.weight.regular': 'Regular',
  'font.weight.medium': 'Medium',
  'font.weight.semibold': 'SemiBold',
  'font.weight.bold': 'Bold',
  'font.weight.extrabold': 'ExtraBold',
  'font.weight.black': 'Black',
  'font.uiScale': 'Interface text size',
  'font.uiScaleHint': 'Scales every interface text size proportionally',
  'font.contentSize': 'Conversation text size',
  'font.contentSizeHint': 'Size of message bodies, headings, and tables',
  'font.codeSize': 'Code text size',
  'font.codeSizeHint': 'Size of code blocks and inline code',
  'font.unit': 'px',
  'font.reset': 'Reset to defaults',
  'font.increase': 'Increase',
  'font.decrease': 'Decrease',
  'font.catalogProbed':
    'The font list holds only common fonts found by probing (reading this machine\u2019s fonts is unavailable or was declined); any family can still be typed',
  'font.genericWarning':
    'No generic family at the end (such as sans-serif), so a missing font may fall back unpredictably',
}

/** The stylesheet this plugin owns, keyed by the resolved settings section. */
function fontStyleSheet(section) {
  const scale = section[UI_FONT_SCALE_FIELD]
  const contentSize = section[CONTENT_FONT_SIZE_FIELD]
  const codeSize = section[CODE_FONT_SIZE_FIELD]
  const codeWeight = normalizeWeight(section[CODE_FONT_WEIGHT_FIELD])
  const uiWeight = normalizeWeight(section[UI_FONT_WEIGHT_FIELD])

  const scaleRules = UI_TEXT_STEPS.map(
    (step) => `.dsh-font-size-${String(step)}{font-size:calc(${String(step)}px * var(--dsh-font-ui-scale,1)) !important}`,
  ).join('')

  // The interface weight is opt-in. At the shipped 400 nothing below changes,
  // which keeps a default install's sheet byte-identical to the shipped one; at
  // anything else the base of every `font:` shorthand has to be written out,
  // because a shorthand with no weight component resets `font-weight` to
  // `normal` and would silently defeat an inherited value.
  const shippedUiWeight = uiWeight === DEFAULT_UI_FONT_WEIGHT
  const baseWeight = shippedUiWeight ? '' : `${String(uiWeight)} `
  const emphasis = (shipped) => (shippedUiWeight ? shipped : emphasisWeight(shipped, uiWeight))
  const uiWeightRules = shippedUiWeight
    ? []
    : [
        '/* The interface weight: the base of interface text. Only the text that',
        '   inherits its weight moves — a label or a button whose weight the design',
        '   system fixes keeps it — and the heading steps keep their shipped',
        '   distance from the base so the hierarchy survives the change. */',
        `html body{font-weight:${String(uiWeight)}}`,
      ]

  return [
    '/* dsh-font: interface scale + conversation text sizes.',
    '   The scale is emitted as one utility class per hard-coded UI text size and',
    '   stamped onto every element by applyFonts(), so it is a deterministic',
    '   override that never inherits into a subtree. */',
    'html body{',
    `--dsh-font-ui-scale:${String(scale)};`,
    `--dsh-font-code-size:${String(codeSize)}px;`,
    `--dsh-font-code-weight:${String(codeWeight)};`,
    // A CSS-side mirror of the content size. The authoritative declaration is
    // inline on `body` (written by applyFonts), because ui-layout's theme
    // presenter owns that one and an inline value outranks any stylesheet.
    `--dsh-font-conversation-size:${String(contentSize)}px;`,
    '}',
    ...uiWeightRules,
    scaleRules,
    '/* Conversation text sizes: absolute px, replacing the shipped 12..17px',
    '   ladder that ui-layout drives from the `ui-theme` namespace. This is the',
    '   size axis for conversation content; the scale above is the axis for the',
    '   surrounding interface, and the two never compose. */',
    'html body{',
    `--dsh-font-markdown-base:${baseWeight}var(--dsh-font-conversation-size,14px) / calc(${String(contentSize)}px + 10px) var(--dsw-font-family) !important;`,
    `--dsh-font-markdown-h1:${String(emphasis(700))} calc(${String(contentSize)}px + 7px) / calc(${String(contentSize)}px + 16px) var(--dsw-font-family) !important;`,
    `--dsh-font-markdown-h2:${String(emphasis(700))} calc(${String(contentSize)}px + 5px) / calc(${String(contentSize)}px + 14px) var(--dsw-font-family) !important;`,
    `--dsh-font-markdown-h3:${String(emphasis(700))} calc(${String(contentSize)}px + 4px) / calc(${String(contentSize)}px + 12px) var(--dsw-font-family) !important;`,
    `--dsh-font-markdown-h4:${String(emphasis(600))} var(--dsh-font-conversation-size,14px) / calc(${String(contentSize)}px + 10px) var(--dsw-font-family) !important;`,
    `--dsh-font-markdown-table:${baseWeight}calc(${String(contentSize)}px - 1px) / calc(${String(contentSize)}px + 9px) var(--dsw-font-family) !important;`,
    `--dsh-font-markdown-table-head:${String(emphasis(500))} calc(${String(contentSize)}px - 1px) / calc(${String(contentSize)}px + 9px) var(--dsw-font-family) !important;`,
    '}',
    '/* Code text sizes, on their own axis. */',
    'html body{',
    `--dsw-font-markdown-code:var(--dsh-font-code-weight,400) var(--dsh-font-code-size,12px) / calc(var(--dsh-font-code-size,12px) + 7px) var(--ds-font-family-code) !important;`,
    `--dsw-font-markdown-code-font-size:var(--dsh-font-code-size,12px) !important;`,
    `--dsw-font-markdown-code-block:var(--dsh-font-code-weight,400) var(--dsh-font-code-size,12px) / calc(var(--dsh-font-code-size,12px) + 8px) var(--ds-font-family-code) !important;`,
    `--dsw-font-markdown-code-block-font-size:var(--dsh-font-code-size,12px) !important;`,
    `--dsw-font-markdown-code-block-small:var(--dsh-font-code-weight,400) calc(var(--dsh-font-code-size,12px) - 1px) / calc(var(--dsh-font-code-size,12px) + 5px) var(--ds-font-family-code) !important;`,
    `--dsw-font-markdown-code-block-small-font-size:calc(var(--dsh-font-code-size,12px) - 1px) !important;`,
    '}',
    '/* The code weight, which the design system has no token for. The three',
    '   `font:` shorthands above carry it for the surfaces that read a token,',
    '   but most code in the interface is styled directly with',
    '   `font-family: var(--ds-font-family-code)` in a component stylesheet with',
    '   its own literal weight — the tool I/O cards, the terminal output, the',
    '   diff and source previews. Those are matched structurally instead, and',
    '   the `!important` is what outranks `font: 500 12px/18px …`.',
    '   Note that this is deliberately NOT a universal rule: it reaches code the',
    '   interface owns, never the surrounding labels. */',
    'html body pre,html body code,html body [class*="code" i]{',
    `font-family:var(--ds-font-family-code) !important;`,
    `font-weight:var(--dsh-font-code-weight,${String(DEFAULT_CODE_FONT_WEIGHT)}) !important;`,
    '}',
  ].join('\n')
}

/** The most recent resolved section; the observer re-stamps against it. */
let currentSection

/**
 * Keep the interface-scale stamps current as the interface mounts new
 * elements. A single coalesced pass per frame is enough: the conversation,
 * tool panels, and dialogs all grow by appending nodes.
 * @param ctx - client context owning the observer's lifetime.
 */
function observeScale(ctx) {
  if (typeof document === 'undefined' || typeof MutationObserver !== 'function') return
  const target = document.body
  if (target === null || target === undefined) return
  let scheduled = false
  const observer = new MutationObserver(() => {
    if (scheduled || currentSection === undefined) return
    scheduled = true
    const run = () => {
      scheduled = false
      stampScaleClasses(currentSection[UI_FONT_SCALE_FIELD])
    }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
    else setTimeout(run, 16)
  })
  ctx.effect(() => {
    observer.observe(target, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
    }
  }, 'dsh-font: interface scale observer')
}

/**
 * Write the owned stylesheet and the two family tokens onto the document.
 * @param section - resolved settings section.
 */
function applyFonts(section) {
  if (typeof document === 'undefined') return
  currentSection = section
  const uiFamily = section[UI_FONT_FAMILY_FIELD]
  const codeFamily = section[CODE_FONT_FAMILY_FIELD]

  let tag = document.getElementById(FONT_STYLE_ID)
  if (tag === null) {
    tag = document.createElement('style')
    tag.id = FONT_STYLE_ID
    tag.dataset.plugin = STYLE_PREFIX
    const parent = document.head || document.documentElement
    parent.appendChild(tag)
  }
  tag.textContent = fontStyleSheet(section)

  // Pre-paint parity. The theme presenter re-asserts both of these on `body`
  // from the override layer installed by `publishFamilyTokens`.
  const root = document.documentElement.style
  root.setProperty('--dsw-font-family', uiFamily)
  root.setProperty('--ds-font-family-code', codeFamily)

  // `--dsh-content-font-size` is an INLINE custom property on `body`, written
  // by ui-layout's presenter from the `ui-theme` namespace. Inline declarations
  // outrank a stylesheet regardless of `!important`, so the one authoritative
  // value has to be written here too, in the same place the presenter writes.
  if (document.body !== null && document.body !== undefined) {
    document.body.style.setProperty(
      '--dsh-content-font-size',
      `${String(section[CONTENT_FONT_SIZE_FIELD])}px`,
    )
  }

  stampScaleClasses(section[UI_FONT_SCALE_FIELD])
}

/** The stamped utility class for one shipped text size. */
function sizeClass(step) {
  return `dsh-font-size-${String(step)}`
}

/** Selector matching any element already stamped by {@link stampScaleClasses}. */
const SCALE_STAMPED_SELECTOR = UI_TEXT_STEPS.map((step) => `.${sizeClass(step)}`).join(',')

/**
 * The shipped text size measured for each element, so a later pass reuses the
 * measurement instead of calling `getComputedStyle` again. Cleared whenever the
 * stamps are removed, which is what makes a re-measure exact.
 * @type {WeakMap<Element, number>}
 */
const measuredScaleStep = new WeakMap()

/**
 * Stamp the interface-scale utility class onto every element whose shipped
 * stylesheet fixes a font size in px.
 *
 * The shipped design system has no interface size variable — each component
 * hard-codes one of {@link UI_TEXT_STEPS} — so the scale is applied per element
 * rather than through inheritance. That keeps it a deterministic override with
 * no compounding, and it needs no knowledge of any component's class names.
 *
 * An element is measured while it carries no stamp; changing the scale clears
 * every stamp first, which restores the shipped value and re-measures.
 * @param scale - current interface scale; 1 means "shipped sizes" and stamps nothing.
 */
function stampScaleClasses(scale) {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return
  const root = document.body
  if (root === null || root === undefined) return
  if (typeof root.querySelectorAll !== 'function') return

  const stamped = [...root.querySelectorAll(SCALE_STAMPED_SELECTOR)]
  if (scale === 1) {
    for (const element of stamped) {
      for (const step of UI_TEXT_STEPS) element.classList.remove(sizeClass(step))
      measuredScaleStep.delete(element)
    }
    return
  }

  const candidates = [...stamped, ...root.querySelectorAll('*')].filter(
    (element) =>
      element.classList !== undefined &&
      (element.className !== '' ||
        (typeof element.getAttribute === 'function' && element.getAttribute('style') !== null)),
  )

  for (const element of candidates) {
    let step = measuredScaleStep.get(element)
    if (step === undefined) {
      const measured = getComputedStyle(element).fontSize
      if (typeof measured !== 'string' || !measured.endsWith('px')) continue
      const exact = Number.parseFloat(measured)
      const rounded = Math.round(exact)
      if (!UI_TEXT_STEPS.includes(rounded) || Math.abs(exact - rounded) > 0.01) continue
      step = rounded
      measuredScaleStep.set(element, step)
    }
    // Move the element to the stamp for its measured size, dropping any other.
    for (const candidate of UI_TEXT_STEPS) {
      if (candidate !== step) element.classList.remove(sizeClass(candidate))
    }
    element.classList.add(sizeClass(step))
  }
}

/**
 * Stack the two family tokens onto the design system through the theme
 * service, so the theme presenter keeps them applied across palette changes.
 * @param ctx - client context carrying the theme service.
 * @param section - resolved settings section.
 */
function publishFamilyTokens(ctx, section) {
  const theme = ctx.get('theme')
  if (theme === undefined) return
  theme.overrideTokens(PLUGIN_ID, {
    '--dsw-font-family': {
      light: section[UI_FONT_FAMILY_FIELD],
      dark: section[UI_FONT_FAMILY_FIELD],
    },
    '--ds-font-family-code': {
      light: section[CODE_FONT_FAMILY_FIELD],
      dark: section[CODE_FONT_FAMILY_FIELD],
    },
  })
}

/** Live-state store behind the General settings row. */
function createFontRowStore() {
  return defineStore({
    init: () => ({
      uiFontFamily: DEFAULT_UI_FONT_FAMILY,
      codeFontFamily: DEFAULT_CODE_FONT_FAMILY,
      codeFontWeight: DEFAULT_CODE_FONT_WEIGHT,
      uiFontWeight: DEFAULT_UI_FONT_WEIGHT,
      uiFontScale: 1,
      contentFontSize: 14,
      codeFontSize: 12,
      revision: -1,
    }),
    actions: {
      sync: (draft, section, revision) => {
        if (revision !== undefined && revision <= draft.revision) return
        draft.uiFontFamily = section[UI_FONT_FAMILY_FIELD]
        draft.codeFontFamily = section[CODE_FONT_FAMILY_FIELD]
        draft.codeFontWeight = normalizeWeight(section[CODE_FONT_WEIGHT_FIELD])
        draft.uiFontWeight = normalizeWeight(section[UI_FONT_WEIGHT_FIELD])
        draft.uiFontScale = section[UI_FONT_SCALE_FIELD]
        draft.contentFontSize = section[CONTENT_FONT_SIZE_FIELD]
        draft.codeFontSize = section[CODE_FONT_SIZE_FIELD]
        if (revision !== undefined) draft.revision = revision
      },
    },
  })
}

/** The stylesheet for the row's own chrome. */
const ROW_CSS = [
  '.dsh-font-row{border-bottom:.5px solid var(--dsw-alias-border-l2);flex-direction:column;gap:16px;padding:16px 0;display:flex}',
  '.dsh-font-head{flex-direction:column;gap:4px;display:flex}',
  '.dsh-font-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}',
  '.dsh-font-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}',
  '.dsh-font-field{flex-direction:column;gap:6px;display:flex}',
  '.dsh-font-labelRow{align-items:center;justify-content:space-between;gap:8px;display:flex}',
  '.dsh-font-label{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:20px}',
  '.dsh-font-value{color:var(--dsw-alias-label-secondary);font-size:12px;font-variant-numeric:tabular-nums;line-height:18px}',
  '.dsh-font-hint{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
  '.dsh-font-code{font-family:var(--ds-font-family-code);font-weight:var(--dsh-font-code-weight,400)}',
  '.dsh-font-sliderRow{align-items:center;gap:10px;display:flex}',
  '.dsh-font-slider{flex:1;min-width:0;accent-color:var(--dsw-alias-brand-primary)}',
  '.dsh-font-stepper{background:var(--dsw-alias-bg-module-platform);border-radius:16px;justify-content:center;align-items:center;gap:2px;min-width:96px;height:32px;display:inline-flex;flex:none;padding:0 4px}',
  '.dsh-font-step{border:none;background:0 0;color:var(--dsw-alias-label-primary);cursor:pointer;width:20px;height:20px;border-radius:4px;justify-content:center;align-items:center;padding:0;display:inline-flex}',
  '.dsh-font-step:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-font-step:disabled{color:var(--dsw-alias-label-caption);cursor:default}',
  '.dsh-font-stepValue{text-align:center;min-width:32px;color:var(--dsw-alias-label-primary);font-size:13px;font-variant-numeric:tabular-nums;line-height:20px}',
  '.dsh-font-reset{align-self:flex-start;border:.5px solid var(--dsw-alias-border-l4);background:0 0;color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:10px;padding:5px 12px;font-family:inherit;font-size:12px;line-height:18px}',
  '.dsh-font-reset:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  // ── the query editor ──────────────────────────────────────────────────────
  //
  // The editor is `@citisen/litearea`'s, and it carries its own stylesheet: the
  // layer it paints behind the textarea, the completion list, the tooltip, and
  // the one typography rule that keeps the paint on the characters. Its
  // appearance comes from custom properties, which `EDITOR_VARIABLES` binds to
  // the interface's own tokens per instance, so nothing here restates any of it.
  //
  // The border is the one exception: every field in this interface is a hairline,
  // which is a fact about the design system rather than about the editor.
  '.dsh-font-query{flex-direction:column;gap:4px;display:flex}',
  '.dsh-font-editor{display:block}',
  '.dsh-font-editor .litearea-box{border-width:.5px}',
  '.dsh-font-meta{flex-wrap:wrap;gap:8px;justify-content:space-between;display:flex}',
  '.dsh-font-warn{color:var(--dsw-alias-state-warn-primary);font-size:11px;line-height:16px}',
  // Text the reader could not parse: a red line, not a suggestion.
  '.dsh-font-warn.dsh-font-error{color:var(--dsw-alias-state-error-primary)}',
].join('')

/** Install the row chrome stylesheet for the plugin's lifetime. */
function installRowStyles(ctx) {
  if (typeof document === 'undefined') return
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = STYLE_PREFIX
    tag.dataset.pluginCss = `${STYLE_PREFIX}/row.css`
    tag.textContent = ROW_CSS
    document.head.appendChild(tag)
    return () => {
      tag.remove()
    }
  }, 'dsh-font: row stylesheet')
}

/**
 * One labelled field wrapper.
 * @param props - React props.
 * @returns the field element.
 */
function Field({ label, value, hint, children }) {
  return React.createElement(
    'div',
    { className: 'dsh-font-field' },
    React.createElement(
      'div',
      { className: 'dsh-font-labelRow' },
      React.createElement('span', { className: 'dsh-font-label' }, label),
      value === undefined
        ? null
        : React.createElement('span', { className: 'dsh-font-value' }, value),
    ),
    children,
    hint === undefined
      ? null
      : React.createElement('div', { className: 'dsh-font-hint' }, hint),
  )
}

/**
 * The design tokens the editor is themed with, as litearea custom properties.
 *
 * CSS stays the theme language: the editor's whole appearance is already
 * described by custom properties, so binding them to the interface's own tokens
 * is what makes the box look native instead of like a control that wandered in
 * from somewhere else. Setting them here rather than in the stylesheet also
 * means they follow the INTERFACE's theme switch, not the operating system's —
 * the library's own dark palette is driven by `prefers-color-scheme`, and those
 * two are not the same thing.
 *
 * The type is the one thing deliberately not inherited from the interface. The
 * box edits a query rather than prose: one system monospace at a fixed size
 * keeps the entries aligned as the list they are, and keeps the text from
 * reflowing the moment the query changes the interface font. The weight is
 * fixed too — a face whose 400 is synthesized differently from its 700 would
 * move the glyphs under the paint.
 *
 * Deliberately not mapped: the per-scope colours. Every hue the grammar paints
 * with is derived from one of these except the generic-family one, and that one
 * is legible on either surface.
 */
const EDITOR_VARIABLES = {
  font: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  'font-size': '13px',
  'line-height': '20px',
  'padding-block': '5px',
  'padding-inline': '10px',
  radius: '8px',
  fg: 'var(--dsw-alias-label-primary)',
  'fg-dim': 'var(--dsw-alias-label-tertiary)',
  'fg-strong': 'var(--dsw-alias-label-primary)',
  bg: 'var(--dsw-alias-bg-module-platform)',
  'bg-raised': 'var(--dsw-alias-bg-layer-2)',
  border: 'var(--dsw-alias-border-l4)',
  'border-focus': 'var(--dsw-alias-state-business-primary)',
  accent: 'var(--dsw-alias-state-business-primary)',
  error: 'var(--dsw-alias-state-error-primary)',
  warning: 'var(--dsw-alias-state-warn-primary)',
  shadow: 'var(--dsw-elevation-panel)',
}

/**
 * The font-query editor: the library's editor over this plugin's grammar.
 *
 * The hand-written half is gone — the painted token layer, the completion
 * popup, the highlight index, the caret bookkeeping, and the alignment contract
 * between two stacked elements — and with it every reason this field was hard
 * to get right. What stays is the plugin's own: the query's parse, its
 * localized diagnostics, the two settings it writes, and the keyboard reorder.
 *
 * THE RULE THIS COMPONENT STILL FOLLOWS: the text belongs to the user.
 *
 * Nothing here rewrites it — not quoting, not reordering, not tidying, not
 * refilling an empty box. The editor owns the text, so the settings follow
 * EVERY keystroke: the old field had to wait for Enter because writing on each
 * change re-rendered a controlled textarea, and that round trip is exactly what
 * destroyed the browser's undo stack and reset the caret. A value that arrives
 * from outside takes the field over only when it MEANS something different from
 * what is on screen, and never while the user is in the field.
 *
 * @param props - React props.
 * @returns the editor element.
 */
function FontQueryEditor({
  value,
  weight,
  catalogue,
  styles,
  enumerated,
  monospace,
  label,
  labels,
  onFamilies,
  onWeight,
}) {
  const hostRef = useRef(null)
  const editorRef = useRef(undefined)
  /**
   * The axis's shipped weight. A query at this weight carries no word: the
   * shipped value is not something the user chose, and spelling it out put a
   * `regular` after every interface font that nobody asked for. What applies is
   * still always stated in the line under the field.
   */
  const shippedWeight = monospace === true ? DEFAULT_CODE_FONT_WEIGHT : DEFAULT_UI_FONT_WEIGHT
  const options = { catalogue, styles, enumerated }
  /** The stored settings as the text the editor starts from, and the stack. */
  const stored = storedQuery(value, weight, options, shippedWeight)
  /** The text the editor holds, mirrored into state for the readouts below. */
  const [text, setText] = useState(stored.text)

  /**
   * The grammar as the library resolves it: a live view of the newest options.
   *
   * The catalogue is the machine's and it answers late — discovery finishes long
   * after this row has mounted — so the vocabulary cannot be fixed at mount. The
   * library re-resolves a grammar in place on `refresh()`, so a proxy onto the
   * current build is what lets the list grow without rebuilding the editor,
   * which would throw the undo history away.
   */
  const grammarRef = useRef(undefined)
  grammarRef.current = dshFontQueryGrammar({
    catalogue,
    enumerated,
    styles,
    shippedWeight,
    // The vocabularies come from this plugin's own constants, so the editor
    // cannot offer a family the plugin's own parser would then call unknown.
    commonFamilies: COMMON_FAMILIES,
    genericFamilies: GENERIC_FAMILIES,
  })
  const liveGrammar = useRef(
    new Proxy({}, { get: (_target, key) => Reflect.get(grammarRef.current, key) }),
  ).current
  // The newest props, so the editor's own callbacks are never a render behind.
  const latest = useRef({})
  latest.current = { options, write: { onFamilies, onWeight }, setText }

  useEffect(() => {
    const host = hostRef.current
    if (host === null || host === undefined) return undefined
    const editor = createEditor(host, {
      grammar: liveGrammar,
      // Read once, at construction: later external values go through the effect
      // below, which is the only place that decides whether one wins.
      value: stored.text,
      ariaLabel: label,
      // No placeholder. A ghost of the shipped stack in an empty box reads as a
      // value the plugin put there; the hint above the field is the example.
      //
      // 32px to 120px, which is what the field this replaces was bounded by: one
      // row of the type above, and four before the box scrolls rather than
      // pushing the rest of the settings off the panel.
      sizing: { minRows: 1, minHeight: 32, maxHeight: 120 },
      variables: EDITOR_VARIABLES,
      // A family explains itself on hover, including the faces read off this
      // machine — which is the question the old popup answered by listing them.
      hover: { enabled: true, delay: 140 },
      // A space does not open the list. A family is separated from its weight by
      // one, which is exactly why a popup would be in the way of the most ordinary
      // thing anyone types in this field; the list is already open while the next
      // token is typed, and Ctrl+Space asks for it by hand. Stated rather than
      // inherited, because this plugin compiles in a pinned copy of the editor:
      // what the library defaults to on the day it is built is not a promise
      // about the day after.
      completion: { triggerCharacters: '' },
      onChange: (next) => {
        const current = latest.current
        current.setText(next)
        applyFontQuery(next, current.options, current.write)
      },
    })
    editorRef.current = editor

    /**
     * The keyboard's reorder, kept from the field this replaces.
     *
     * Order is significant — the first family the browser can resolve wins — and
     * this moves the entry the caret sits in without the pointer. The library's
     * own handler may have moved a completion row first, which costs nothing: the
     * text is about to change underneath it.
     */
    const onKeyDown = (event) => {
      const current = latest.current
      const moved = reorderFontQueryEntry(editor, event, current.options, current.write)
      if (moved !== undefined) current.setText(moved.text)
    }
    editor.input.addEventListener('keydown', onKeyDown)

    return () => {
      editor.input.removeEventListener('keydown', onKeyDown)
      editor.destroy()
      editorRef.current = undefined
    }
  }, [])

  // The catalogue arrives after this row mounts, so the grammar the editor is
  // running is REFRESHED when it changes — re-read, never rebuilt, because a
  // rebuild is what would throw the undo history away.
  useEffect(() => {
    const editor = editorRef.current
    if (editor === undefined) return
    editor.refresh()
  }, [catalogue, styles, enumerated])

  // A value that arrived from elsewhere — the Reset button, another tab — takes
  // the field over. Our own write coming back does not, and neither does
  // anything at all while the user is in the field: that would be the plugin
  // rewriting their typing.
  //
  // The comparison is by MEANING rather than by characters, because the setting
  // holds the canonical serialization of what the box says: a value that spells
  // the same stack differently is the same value, and adopting it would rewrite
  // the user's spelling — quoting, spacing, case — under their eyes.
  useEffect(() => {
    const editor = editorRef.current
    if (editor === undefined) return
    if (editor.focused) return
    const read = parseFontQuery(editor.value, latest.current.options)
    if (asQuery(read.families, read.weight ?? weight, shippedWeight) === stored.text) return
    editor.setValue(stored.text)
    setText(stored.text)
  }, [stored.text])

  const read = parseFontQuery(text, options)
  const appliedWeight = normalizeWeight(weight)
  /** A query that names no family is an unfinished edit, and writes nothing. */
  const unfilled = read.families.length === 0
  const messages = read.diagnostics
    .map((diagnostic) => ({
      text: describeDiagnostic(diagnostic, labels),
      kind: diagnosticKind(diagnostic.code),
    }))
    .filter((message) => message.text !== '')
  if (read.families.length > 0 && !read.families.some((f) => isGenericFamilyName(f.toLowerCase()))) {
    messages.push({ text: labels.genericWarning, kind: 'warn' })
  }

  return React.createElement(
    'div',
    { className: 'dsh-font-query' },
    // The editor mounts here, from the effect above. React never renders the
    // field itself: a textarea whose value React rewrites is the bug this whole
    // migration is about.
    React.createElement('div', { className: 'dsh-font-editor', ref: hostRef }),
    // What the SETTINGS hold, in canonical form. The box is allowed to spell it
    // differently — it is the user's text — so this is the line that says what
    // the stack actually is.
    React.createElement(
      'div',
      { className: 'dsh-font-meta' },
      React.createElement(
        'span',
        { className: monospace === true ? 'dsh-font-hint dsh-font-code' : 'dsh-font-hint' },
        `font-family: ${serializeFamilyList(stored.families)}`,
      ),
    ),
    // The value the axis is SET to — not what the text parses to. Nothing here
    // pretends the typed query has been applied: the setting follows every
    // change, and this line is the value in force.
    React.createElement(
      'div',
      { className: 'dsh-font-hint' },
      `${labels.weightLine}: ${labels.weightName(appliedWeight)} ${String(appliedWeight)}${
        appliedWeight === shippedWeight ? labels.weightShipped : ''
      }`,
    ),
    // An unfinished edit is reported, never "corrected": the stored stack is
    // still in use, and the text is left exactly as it was typed.
    unfilled ? React.createElement('div', { className: 'dsh-font-hint' }, labels.emptyQuery) : null,
    // The library marks the same problems in the box, and explains a token on
    // hover, but its words are English only. This list is the field's own
    // explanation, in the interface's language, and it is the one the reader is
    // owed when something is wrong.
    messages.map((message, index) =>
      React.createElement(
        'div',
        {
          key: `${String(index)}`,
          className: message.kind === 'error' ? 'dsh-font-warn dsh-font-error' : 'dsh-font-warn',
        },
        message.text,
      ),
    ),
  )
}

/**
 * A horizontal slider plus an exact stepper.
 * @param props - React props.
 * @returns the control element.
 */
function SliderControl({ min, max, step, value, format, onChange, ariaLabel, increase, decrease }) {
  return React.createElement(
    'div',
    { className: 'dsh-font-sliderRow' },
    React.createElement('input', {
      type: 'range',
      className: 'dsh-font-slider',
      min,
      max,
      step,
      value,
      'aria-label': ariaLabel,
      onChange: (event) => {
        onChange(Number(event.target.value))
      },
    }),
    React.createElement(
      'div',
      { className: 'dsh-font-stepper' },
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'dsh-font-step',
          'aria-label': decrease,
          disabled: value <= min,
          onClick: () => {
            onChange(Number((value - step).toFixed(2)))
          },
        },
        React.createElement(IconChevronDownOutline14, { size: 9 }),
      ),
      React.createElement('span', { className: 'dsh-font-stepValue' }, format(value)),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'dsh-font-step',
          'aria-label': increase,
          disabled: value >= max,
          onClick: () => {
            onChange(Number((value + step).toFixed(2)))
          },
        },
        React.createElement(IconChevronUpOutline14, { size: 9 }),
      ),
    ),
  )
}

/**
 * The General-settings row: the two font queries plus the four size axes.
 * @param props - composed slot props (`t`, `useStore`, and the inject actions).
 * @returns the row element tree.
 */
function FontRow({ t, useStore, setField, reset }) {
  const uiFontFamily = useStore((s) => s.uiFontFamily)
  const codeFontFamily = useStore((s) => s.codeFontFamily)
  const codeFontWeight = useStore((s) => s.codeFontWeight)
  const uiFontWeight = useStore((s) => s.uiFontWeight)
  const uiFontScale = useStore((s) => s.uiFontScale)
  const contentFontSize = useStore((s) => s.contentFontSize)
  const codeFontSize = useStore((s) => s.codeFontSize)

  // Discovery runs once per session (the result is cached) and only when this
  // row is actually rendered, so the cost is never paid by a user who never
  // opens Settings.
  const [catalog, setCatalog] = useState({
    families: COMMON_FAMILIES,
    styles: {},
    enumerated: false,
  })
  useEffect(() => {
    let cancelled = false
    discoverFamilies()
      .then((result) => {
        if (!cancelled) setCatalog(result)
      })
      .catch(() => {
        /* the curated catalogue is already in state */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // The catalogue's provenance is worth one line, and only when it is BAD news:
  // an enumerated list is the machine's own and needs no announcing, while the
  // probe fallback is a short curated list the completion popup can never
  // complete — which the user would otherwise read as "my font is missing".
  // `measured` distinguishes a finished fallback from discovery still running.
  const catalogueNotice =
    catalog.measured === true && catalog.enumerated !== true ? t('font.catalogProbed') : undefined

  /**
   * The editors' copy, resolved once per render so the components stay free of
   * the locale service and remain pure functions of their props.
   *
   * Only what the plugin still says is here. The completion list, the tooltips,
   * and the syntax colours are the library's now, and so are its words.
   * @param weightLine - the axis's weight label (`代码字重` / `界面字重`).
   * @returns the label bag both {@link FontQueryEditor}s consume.
   */
  const editorLabels = (weightLine) => ({
    weightLine,
    weightShipped: t('font.weightShipped'),
    emptyQuery: t('font.emptyQuery'),
    genericWarning: t('font.genericWarning'),
    unknownFamily: t('font.diag.unknownFamily'),
    missingWeight: t('font.diag.missingWeight'),
    duplicateWeight: t('font.diag.duplicateWeight'),
    unclosedQuote: t('font.diag.unclosedQuote'),
    trailingText: t('font.diag.trailingText'),
    weightName: (weight) => t(`font.weight.${WEIGHT_KEYS[normalizeWeight(weight)]}`),
  })

  return React.createElement(
    'div',
    { className: 'dsh-font-row' },
    React.createElement(
      'div',
      { className: 'dsh-font-head' },
      React.createElement('div', { className: 'dsh-font-title' }, t('font.title')),
      React.createElement('div', { className: 'dsh-font-desc' }, t('font.description')),
      catalogueNotice === undefined
        ? null
        : React.createElement('div', { className: 'dsh-font-hint' }, catalogueNotice),
    ),
    React.createElement(
      Field,
      { label: t('font.uiFamily'), hint: t('font.uiFamilyHint') },
      React.createElement(FontQueryEditor, {
        value: uiFontFamily,
        weight: normalizeWeight(uiFontWeight),
        catalogue: catalog.families,
        styles: catalog.styles,
        enumerated: catalog.enumerated,
        label: t('font.uiFamily'),
        labels: editorLabels(t('font.uiWeight')),
        // The editor reports every change, so these run on each keystroke. A
        // write that resolves to what is already stored writes nothing: the
        // settings document is durable, and a no-op round trip is still a write.
        onFamilies: (value) => {
          if (value !== uiFontFamily) setField(UI_FONT_FAMILY_FIELD, value)
        },
        onWeight: (weight) => {
          if (normalizeWeight(weight) !== normalizeWeight(uiFontWeight)) {
            setField(UI_FONT_WEIGHT_FIELD, weight)
          }
        },
      }),
    ),
    React.createElement(
      Field,
      { label: t('font.codeFamily'), hint: t('font.codeFamilyHint') },
      React.createElement(FontQueryEditor, {
        value: codeFontFamily,
        weight: normalizeWeight(codeFontWeight),
        catalogue: catalog.families,
        styles: catalog.styles,
        enumerated: catalog.enumerated,
        monospace: true,
        label: t('font.codeFamily'),
        labels: editorLabels(t('font.codeWeight')),
        onFamilies: (value) => {
          if (value !== codeFontFamily) setField(CODE_FONT_FAMILY_FIELD, value)
        },
        onWeight: (weight) => {
          if (normalizeWeight(weight) !== normalizeWeight(codeFontWeight)) {
            setField(CODE_FONT_WEIGHT_FIELD, weight)
          }
        },
      }),
    ),
    React.createElement(
      Field,
      {
        label: t('font.uiScale'),
        value: `${String(Math.round(uiFontScale * 100))}%`,
        hint: t('font.uiScaleHint'),
      },
      React.createElement(SliderControl, {
        min: UI_FONT_SCALE_MIN,
        max: UI_FONT_SCALE_MAX,
        step: UI_FONT_SCALE_STEP,
        value: uiFontScale,
        format: (value) => `${String(Math.round(value * 100))}%`,
        ariaLabel: t('font.uiScale'),
        increase: t('font.increase'),
        decrease: t('font.decrease'),
        onChange: (value) => {
          setField(UI_FONT_SCALE_FIELD, value)
        },
      }),
    ),
    React.createElement(
      Field,
      {
        label: t('font.contentSize'),
        value: `${String(contentFontSize)} ${t('font.unit')}`,
        hint: t('font.contentSizeHint'),
      },
      React.createElement(SliderControl, {
        min: CONTENT_FONT_SIZE_MIN,
        max: CONTENT_FONT_SIZE_MAX,
        step: 1,
        value: contentFontSize,
        format: (value) => `${String(value)} ${t('font.unit')}`,
        ariaLabel: t('font.contentSize'),
        increase: t('font.increase'),
        decrease: t('font.decrease'),
        onChange: (value) => {
          setField(CONTENT_FONT_SIZE_FIELD, value)
        },
      }),
    ),
    React.createElement(
      Field,
      {
        label: t('font.codeSize'),
        value: `${String(codeFontSize)} ${t('font.unit')}`,
        hint: t('font.codeSizeHint'),
      },
      React.createElement(SliderControl, {
        min: CODE_FONT_SIZE_MIN,
        max: CODE_FONT_SIZE_MAX,
        step: 1,
        value: codeFontSize,
        format: (value) => `${String(value)} ${t('font.unit')}`,
        ariaLabel: t('font.codeSize'),
        increase: t('font.increase'),
        decrease: t('font.decrease'),
        onChange: (value) => {
          setField(CODE_FONT_SIZE_FIELD, value)
        },
      }),
    ),
    React.createElement(
      'button',
      {
        type: 'button',
        className: 'dsh-font-reset',
        onClick: () => {
          reset()
        },
      },
      t('font.reset'),
    ),
  )
}

/**
 * The two settings APIs this build speaks, newest first.
 *
 * Literals rather than imports: a client bundle may not import another bundle's
 * values, and a service name is a fact about the composition, not a dependency of
 * this package.
 *
 * - `configForms` (dsh 0.1.7+): one configuration form per Loader entry, addressed
 *   by the entry id — `ui-font`, the row this bundle's patch inserts.
 * - `settingsScope` (0.1.5-rc.x): one scope per registered namespace, addressed by
 *   the name the host half registers — the same `ui-font` string.
 *
 * Both are read and written here, so the row offers the same preferences on either
 * line. A composition with neither still gets the row on the shipped defaults, and
 * says why the first time a control is used.
 */
const CONFIG_FORMS_SERVICE = 'configForms'
const SETTINGS_SCOPE_SERVICE = 'settingsScope'

/**
 * The snapshot a scope reports when there is nothing to report.
 *
 * Shape-for-shape the one a bound scope answers with when the Host itself keeps
 * settings process-local — a non-loopback page: no value, nothing writable. The
 * row already paints its defaults for that state, which is why "settings
 * refused" and "no settings service at all" need no separate presentation.
 */
const EMPTY_SNAPSHOT = Object.freeze({
  status: 'unavailable',
  value: undefined,
  base: undefined,
  user: undefined,
  revision: undefined,
  writable: false,
  mode: 'memory',
})

/** Whether the missing-settings report has been made; one page, one report. */
let reportedMissingSettings = false

/**
 * Say, once, why this plugin is running without durable settings.
 *
 * Called from every write that lands on the stand-in scope: that is the moment a
 * user has to be told that the control they just used is not going to be saved.
 * Activation itself stays quiet, because a composition that binds late must not be
 * reported for being slow.
 */
function reportMissingSettings() {
  if (reportedMissingSettings) return
  reportedMissingSettings = true
  console.error(
    `${PLUGIN_ID}: no settings service this build speaks is present ("${CONFIG_FORMS_SERVICE}" on ` +
      `dsh 0.1.7+, "${SETTINGS_SCOPE_SERVICE}" on the 0.1.5-rc.x line), so the Fonts row shows its ` +
      'shipped defaults and changes are not saved. Pin dsh to 0.1.5-rc.x (latest/next), or install ' +
      'a newer @citisen/dsh-font.',
  )
}

/**
 * The settings section this plugin never got.
 *
 * Reads answer "nothing resolved", so the row paints its defaults; every write
 * reports the mismatch instead of failing silently. That is the contract of a
 * bound scope whose Host refuses a write, minus the wire call.
 * @returns an object shaped like a bound settings scope.
 */
function missingSettingsScope() {
  return {
    getSnapshot: () => EMPTY_SNAPSHOT,
    subscribe: () => () => undefined,
    set: () => {
      reportMissingSettings()
      return Promise.resolve(false)
    },
    unset: () => {
      reportMissingSettings()
      return Promise.resolve(false)
    },
    mutate: () => {
      reportMissingSettings()
      return Promise.resolve(false)
    },
  }
}

/**
 * Narrow a raw `ui-font` section to this plugin's own field shapes.
 *
 * Applied to whatever either API hands over, because only one of them can do it
 * itself: a 0.1.5 scope takes a `decode` at bind time, a 0.1.7 form has no such
 * hook. Decoding here means `adopt` sees one shape whichever line is running.
 *
 * @param section - the section as stored, if any.
 * @returns the resolved fields, or undefined when there is no section.
 */
function decodeFontSection(section) {
  if (section === null || typeof section !== 'object') return undefined
  const raw = section
  const text = (key, fallback) =>
    typeof raw[key] === 'string' && raw[key] !== '' ? raw[key] : fallback
  const number = (key, fallback, min, max) => {
    const value = Number(raw[key])
    return Number.isFinite(value) && value >= min && value <= max ? value : fallback
  }
  return {
    [UI_FONT_FAMILY_FIELD]: text(UI_FONT_FAMILY_FIELD, DEFAULT_UI_FONT_FAMILY),
    [CODE_FONT_FAMILY_FIELD]: text(CODE_FONT_FAMILY_FIELD, DEFAULT_CODE_FONT_FAMILY),
    [CODE_FONT_WEIGHT_FIELD]: normalizeWeight(raw[CODE_FONT_WEIGHT_FIELD]),
    [UI_FONT_WEIGHT_FIELD]: normalizeWeight(raw[UI_FONT_WEIGHT_FIELD]),
    [UI_FONT_SCALE_FIELD]: number(UI_FONT_SCALE_FIELD, 1, UI_FONT_SCALE_MIN, UI_FONT_SCALE_MAX),
    [CONTENT_FONT_SIZE_FIELD]: Math.round(
      number(CONTENT_FONT_SIZE_FIELD, 14, CONTENT_FONT_SIZE_MIN, CONTENT_FONT_SIZE_MAX),
    ),
    [CODE_FONT_SIZE_FIELD]: Math.round(
      number(CODE_FONT_SIZE_FIELD, 12, CODE_FONT_SIZE_MIN, CODE_FONT_SIZE_MAX),
    ),
  }
}

/**
 * Present a dsh 0.1.7 configuration form as the scope this plugin reads.
 *
 * A form already answers `getSnapshot`/`subscribe`/`set`/`unset`/`mutate`, so the
 * only gap is its value: it reports the section as stored, and this plugin reads
 * decoded fields.
 *
 * @param form - the configuration form for this plugin's entry.
 * @returns a scope-shaped object.
 */
function decodedForm(form) {
  return {
    getSnapshot: () => {
      const snapshot = form.getSnapshot()
      return { ...snapshot, value: decodeFontSection(snapshot.value) }
    },
    subscribe: (listener) => form.subscribe(listener),
    set: (field, value) => form.set(field, value),
    unset: (field) => form.unset(field),
    mutate: (operations, revision) => form.mutate(operations, revision),
  }
}

/**
 * The services this plugin waits for: slots and locale for the row.
 *
 * Settings are deliberately **not** in this list. A required service that a dsh
 * release stops providing holds the entire plugin in `pending` forever — and an
 * entry that never activates blocks the web boot — which is how 0.1.7-alpha.1
 * turned `settingsScope` into `configForms` and left plugins reported as "waiting
 * for service" instead of a working interface. Both APIs are bound optionally in
 * `apply` instead, so a composition with neither still gets the row on the shipped
 * defaults, and says so the first time a control is used.
 *
 * The theme service is read through `ctx.get` (optional) so a composition
 * without `ui-theme` still gets families from the stylesheet path.
 */
const inject = ['slots', 'locale']

/**
 * Client plugin body: resolve the durable section, paint it, and register the
 * feature-owned Fonts row into the General section's item slot.
 * @param ctx - client cordis context.
 */
export function apply(ctx) {
  installRowStyles(ctx)
  observeScale(ctx)

  /** The bound `ui-font` section, or a stand-in until (and unless) dsh provides one. */
  let scope = missingSettingsScope()

  const store = createFontRowStore()

  ctx.effect(
    () =>
      ctx.locale.register(SETTINGS_LOCALE_NAMESPACE, {
        zh,
        en,
      }),
    'dsh-font: settings row dictionaries',
  )

  const defaults = {
    [UI_FONT_FAMILY_FIELD]: DEFAULT_UI_FONT_FAMILY,
    [CODE_FONT_FAMILY_FIELD]: DEFAULT_CODE_FONT_FAMILY,
    [CODE_FONT_WEIGHT_FIELD]: DEFAULT_CODE_FONT_WEIGHT,
    [UI_FONT_WEIGHT_FIELD]: DEFAULT_UI_FONT_WEIGHT,
    [UI_FONT_SCALE_FIELD]: 1,
    [CONTENT_FONT_SIZE_FIELD]: 14,
    [CODE_FONT_SIZE_FIELD]: 12,
  }

  let actions

  /** Whether a settings answer has painted yet; see the two `adopt` callers. */
  let painted = false

  const paint = (section, revision) => {
    actions?.sync(section, revision)
    applyFonts(section)
    publishFamilyTokens(ctx, section)
  }

  /** Paint what the live scope holds, or the shipped defaults when it holds nothing. */
  const adopt = () => {
    painted = true
    const snapshot = scope.getSnapshot()
    paint(snapshot.value ?? defaults, snapshot.revision)
  }

  // Bind the durable section through whichever settings API this dsh provides,
  // and follow it while it stays: a replacement or an unload puts the row back on
  // the defaults. Only the first bind counts, so a composition carrying both
  // services (no released dsh does) cannot double-subscribe.
  let boundSettings = false

  /**
   * Adopt one bound scope and follow it.
   * @param binding - the child context the scope was obtained from.
   * @param bound - the scope to read and write.
   * @returns the disposer the injecting fiber collects.
   */
  const bindSettings = (binding, bound) => {
    if (boundSettings) return undefined
    boundSettings = true
    scope = bound
    binding.effect(() => bound.subscribe(adopt), 'dsh-font: settings adoption')
    adopt()
    return () => {
      boundSettings = false
      scope = missingSettingsScope()
      adopt()
    }
  }

  // dsh 0.1.7+: the entry's own configuration form, by Loader entry id.
  ctx.inject([CONFIG_FORMS_SERVICE], (settingsCtx) =>
    bindSettings(
      settingsCtx,
      decodedForm(settingsCtx[CONFIG_FORMS_SERVICE].get(FONT_SETTINGS_NAMESPACE)),
    ),
  )

  // dsh 0.1.5-rc.x: the registered namespace, decoded by the scope itself.
  ctx.inject([SETTINGS_SCOPE_SERVICE], (settingsCtx) =>
    bindSettings(
      settingsCtx,
      settingsCtx[SETTINGS_SCOPE_SERVICE].bind({
        namespace: FONT_SETTINGS_NAMESPACE,
        decode: decodeFontSection,
      }),
    ),
  )

  // Exactly one paint per settings answer: a bind that happened during activation
  // has painted already, and this covers the composition whose service never
  // arrives — the row still has to draw, on its defaults.
  if (!painted) adopt()

  ctx.slots.inject('settings.general.item', () =>
    ctx.slots.register(
      {
        name: 'settings.general.item',
        id: 'font',
        order: 12,
        store,
        locale: SETTINGS_LOCALE_NAMESPACE,
        inject: (bound) => {
          actions = bound
          const snapshot = scope.getSnapshot()
          paint(snapshot.value ?? defaults, snapshot.revision)
          return {
            setField: (field, value) => {
              scope.set(field, value)
            },
            reset: () => {
              for (const field of Object.keys(defaults)) scope.unset(field)
            },
          }
        },
      },
      FontRow,
    ),
  )
}
