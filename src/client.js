/**
 * Browser half of `dsh-font` — the source of the prebuilt `lib/client.js`.
 *
 * This file is NOT loaded as an ES module. `scripts/build-client.mjs` wraps it
 * in the DSH client-bundle envelope and writes `lib/client.js`, which is what
 * the Web shell fetches. Keep it dependency-light: the only modules it may
 * `import` are the platform-singleton specifiers the shell seeds into its
 * module table, and the only Node-side API it may use is that table.
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

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import {
  IconChevronDownOutline14,
  IconChevronUpOutline14,
} from '@deepseek-ai/dsh-client-ui-primitives'

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
    const quoteChar = core[0]
    const quoted = quoteChar === '"' || quoteChar === "'"
    const close = quoted ? core.indexOf(quoteChar, 1) : -1
    const closed = close > 0
    // The family text: the quotes are punctuation, not part of the name, and
    // anything after the closing quote (a weight word) still belongs to the
    // entry, so it is kept — with the quote pair taken out of the middle.
    const tail = closed ? core.slice(close + 1).trim() : ''
    const inner = quoted
      ? [closed ? core.slice(1, close) : core.slice(1), tail].filter((part) => part !== '').join(' ')
      : core
    return {
      text,
      start: from,
      end: to,
      lead,
      core,
      trail,
      quoted,
      closed,
      inner,
    }
  })
}

/**
 * Read one entry into the family it names, the weight word it carries, and the
 * highlight kind of its family part.
 *
 * The two shapes a weight can take are both here: a bare entry whose last word
 * is a weight (`Geist Mono medium`), and a quoted family followed by one
 * (`"Geist Mono" medium` — which is what the canonical form writes, and why a
 * quoted entry cannot simply mean "no weight"). A quoted name whose closing
 * quote is the last character carries no weight, so `"Book Antiqua"` stays a
 * name even though a bare `Book Antiqua` could split if it were not catalogued.
 *
 * @param entry - one record from {@link splitQueryEntries}.
 * @param known - the lowercase catalogue.
 * @param enumerated - whether the catalogue is authoritative.
 * @returns `{ name, word, wordLength, kind, diagnostics }`.
 */
function readQueryEntry(entry, known, enumerated) {
  const core = entry.core
  const diagnostics = []
  if (core === '') return { name: '', word: undefined, wordLength: 0, kind: 'empty', diagnostics }

  const quoteChar = core[0]
  const quote = quoteChar === '"' || quoteChar === "'" ? quoteChar : ''
  const lower = core.toLowerCase()
  let name = core
  let word
  let wordLength = 0

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
          wordLength = rest.length
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
    wordLength = core.length
  } else {
    const cut = lower.lastIndexOf(' ')
    if (cut > 0 && Object.hasOwn(WEIGHT_WORDS, lower.slice(cut + 1))) {
      word = lower.slice(cut + 1)
      wordLength = word.length
      name = core.slice(0, core.length - wordLength).trim()
    }
  }

  const nameLower = name.trim().toLowerCase()
  const generic = nameLower !== '' && isGenericFamilyName(nameLower)
  const catalogued = nameLower !== '' && known.has(nameLower)
  if (nameLower !== '' && !generic && !catalogued && enumerated) {
    diagnostics.push({ code: QUERY_DIAGNOSTIC.unknownFamily, name: name.trim() })
  }
  return {
    name: name.trim(),
    word,
    wordLength,
    kind:
      nameLower === ''
        ? 'weight'
        : generic
          ? 'generic'
          : catalogued || !enumerated
            ? 'family'
            : 'unknown',
    diagnostics,
  }
}

/** The diagnostic-free pieces a query resolves to. */
function emptyQueryRead() {
  return {
    families: [],
    weight: undefined,
    weightWord: undefined,
    effective: -1,
    diagnostics: [],
    tokens: [],
  }
}

/**
 * Read a query into families, a weight, and highlight tokens — the one pass
 * behind both {@link parseFontQuery} and {@link fontQueryTokens}.
 * @param text - the query.
 * @param options - `{ catalogue, styles, enumerated }`. `enumerated` declares
 *   the catalogue authoritative (read from the machine), which is what makes an
 *   unrecognized family worth warning about.
 * @returns `{ entries, families, weight, weightWord, effective, diagnostics, tokens }`.
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

  const entries = splitQueryEntries(text)
  let sawWeight = false

  for (const entry of entries) {
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

    // ── the highlight tokens for this entry ─────────────────────────────────
    // They concatenate back into the input exactly, which is what lets the
    // painted layer and the (invisible) textarea stay aligned glyph for glyph.
    if (entry.lead !== '') read.tokens.push({ text: entry.lead, kind: 'space' })
    if (entry.core !== '') {
      if (readEntry.wordLength > 0 && readEntry.name !== '') {
        read.tokens.push({
          text: entry.core.slice(0, entry.core.length - readEntry.wordLength),
          kind: readEntry.kind,
          family: readEntry.name,
        })
        read.tokens.push({
          text: entry.core.slice(-readEntry.wordLength),
          kind: 'weight',
          family: readEntry.name,
        })
      } else {
        read.tokens.push({ text: entry.core, kind: readEntry.kind, family: readEntry.name })
      }
    }
    if (entry.trail !== '') read.tokens.push({ text: entry.trail, kind: 'space' })
    if (entry.end < text.length) read.tokens.push({ text: ',', kind: 'comma' })
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
      for (const token of read.tokens) {
        if (token.kind === 'weight') token.kind = 'weightMissing'
      }
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
 * Tokenize a query for the painted layer that sits behind the textarea.
 * @param text - the query.
 * @param options - see {@link readFontQuery}.
 * @returns the tokens, whose `text` concatenates back into the input exactly.
 */
function fontQueryTokens(text, options) {
  return readFontQuery(text, options).tokens
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
 * Locate the entry a caret sits in, and the word inside it being typed.
 *
 * The replacement range is the WHOLE entry, not the word: a family name is
 * several words (`Geist Mono`), so completing `geist mo` has to replace both.
 * The word is still reported, because it is what tells a weight completion
 * (`Geist Mono b` -> `bold`) from a family completion.
 *
 * @param text - the query.
 * @param caret - the caret offset.
 * @returns `{ start, end, core, inner, quoted, head, word, weightWord, familyEnd,
 *   caretInCore }`: `inner` is the entry with its quotes taken out, `head` the
 *   entry text before the word being typed (trimmed, unquoted), `weightWord` the
 *   complete weight word the entry already ends with, and `familyEnd` where the
 *   family part of the entry stops, in core offsets.
 */
function queryContextAt(text, caret) {
  const source = typeof text === 'string' ? text : ''
  const position = Math.min(Math.max(Number.isFinite(caret) ? caret : 0, 0), source.length)
  const entries = splitQueryEntries(source)
  let entry = entries[entries.length - 1]
  for (const candidate of entries) {
    if (position <= candidate.end) {
      entry = candidate
      break
    }
  }
  const caretInCore = Math.max(position - entry.start - entry.lead.length, 0)
  const before = entry.core.slice(0, caretInCore)
  const after = entry.core.slice(before.length)
  const left = /\S*$/.exec(before)?.[0] ?? ''
  const right = /^\S*/.exec(after)?.[0] ?? ''

  // A trailing complete weight word is not part of the family name, so the
  // family text ends before it: that is what keeps `"Geist Mono" medium`
  // suggesting families and weights instead of being read as one long name.
  const lower = entry.core.toLowerCase()
  const cut = lower.lastIndexOf(' ')
  const tail = cut > 0 ? lower.slice(cut + 1) : ''
  const weightWord = Object.hasOwn(WEIGHT_WORDS, tail) ? tail : undefined

  return {
    start: entry.start,
    end: entry.end,
    core: entry.core,
    inner: entry.inner,
    quoted: entry.quoted,
    head: unquoteName(before.slice(0, before.length - left.length).trim()),
    word: `${left}${right}`,
    weightWord,
    familyEnd: weightWord === undefined ? entry.core.length : Math.max(cut, 0),
    caretInCore,
  }
}

/** Strip one matching pair of surrounding quotes from a name. */
function unquoteName(name) {
  const text = String(name)
  const quoteChar = text[0]
  if ((quoteChar === '"' || quoteChar === "'") && text.length >= 2 && text.endsWith(quoteChar)) {
    return text.slice(1, -1)
  }
  return text
}

/** Exact, case-insensitive lookup of one name in a suggestion space. */
function findExactName(names, needle) {
  const lower = needle.toLowerCase()
  return names.find((name) => name.toLowerCase() === lower)
}

/** One entry of the autocomplete list, in the order the popup shows them. */
const SUGGESTION_LIMIT = 40

/**
 * The whole autocomplete decision, as a pure function of the text and caret.
 *
 * Candidates are family names, generic keywords, and — when the entry already
 * names a family — that family's weight words, written as `<family> <weight>`
 * so picking one both sets the family and the weight in a single edit. The
 * weights come from the machine's faces when they could be read, and from the
 * closed CSS vocabulary otherwise, so the weight is always discoverable even
 * without the Local Font Access permission.
 *
 * @param context - the result of {@link queryContextAt}.
 * @param options - `{ catalogue, styles, enumerated, shippedWeight }`.
 *   `shippedWeight` is the axis's implicit weight, offered as a row that takes
 *   the word away instead of writing it.
 * @returns `{ start, end, at, items, custom }`; `items` are ordered for display.
 */
function querySuggestions(context, options) {
  const catalogue = Array.isArray(options?.catalogue) ? options.catalogue : []
  const styles = options?.styles ?? {}
  const space = [...new Set([...catalogue, ...GENERIC_FAMILIES])]
  // The needle is the FAMILY part of the entry: a weight word the entry already
  // carries would otherwise make `"Geist Mono" medium` match no family at all.
  const inner = context.inner.trim()
  const needle = context.weightWord === undefined ? inner : inner.slice(0, -(context.weightWord.length)).trim()
  const exact = needle === '' ? undefined : findExactName(space, needle)
  const head = context.head === '' ? undefined : findExactName(space, context.head)
  const family = exact ?? head
  const wordPrefix = (exact === undefined ? context.word : '').toLowerCase()

  const matches = rankFamilyMatches(space, needle).slice(0, SUGGESTION_LIMIT)

  const items = []
  const families = matches.map((name) => ({
    id: `family:${name}`,
    kind: isGenericFamilyName(name.toLowerCase()) ? 'generic' : 'family',
    // A completion never drops a weight the entry already states: the word
    // travels with the pick, so swapping the family does not quietly reset the
    // weight and picking the family already there changes nothing at all.
    insert:
      context.weightWord === undefined
        ? quoteFamily(name)
        : `${quoteFamily(name)} ${context.weightWord}`,
    name,
  }))

  // A weight is only offered once the entry names a family, so the list never
  // fills with weights while the user is still spelling the family out.
  const weights = []
  if (family !== undefined) {
    const key = Object.keys(styles).find((name) => name.toLowerCase() === family.toLowerCase())
    const detected = key === undefined ? [] : faceWeights(styles[key])
    const pool = detected.length > 0 ? detected : FONT_WEIGHTS
    for (const weight of pool) {
      const word = weightWord(weight)
      if (wordPrefix !== '' && !word.startsWith(wordPrefix)) continue
      weights.push({
        id: `weight:${family}:${String(weight)}`,
        kind: 'weight',
        // The axis's shipped weight is implicit, so picking it takes the word
        // away rather than spelling out a value nobody chose.
        insert: weight === options?.shippedWeight ? quoteFamily(family) : `${quoteFamily(family)} ${word}`,
        family,
        word,
        weight,
      })
    }
    // The weight the entry already states leads its own list, so an Enter that
    // accepts the highlighted row re-applies what is written instead of
    // silently moving a complete query to another weight.
    const current = weights.findIndex((item) => item.word === context.weightWord)
    if (current > 0) weights.unshift(...weights.splice(current, 1))
  }

  // The word being typed decides what leads: once the caret is past the family
  // name, the weight is what the user is reaching for (`Geist Mono b` -> Bold),
  // while a caret inside the name keeps the family list first (`inter t` ->
  // Inter Tight, not Inter's Thin).
  const atFamilyEnd = context.caretInCore >= context.familyEnd
  const weightFirst =
    family !== undefined && atFamilyEnd && (exact !== undefined || families.length === 0)

  // Where the pick lands. A caret at the very start of a COMPLETE entry is a
  // boundary, not an edit: the user put it before the family to place another
  // one ahead of it — a fallback stays a fallback — which is how a family is
  // promoted to the front without dragging anything. Anywhere else the entry
  // under the caret is what is being written, so the pick replaces it. A weight
  // never inserts a new entry: it completes the one it is next to, which
  // {@link applySuggestion} enforces from the chosen row's kind.
  const atBoundary = context.caretInCore === 0 && exact !== undefined

  return {
    start: context.start,
    end: context.end,
    at: atBoundary ? 'before' : 'entry',
    items: [...(weightFirst ? weights : families), ...(weightFirst ? families : weights)].slice(
      0,
      SUGGESTION_LIMIT,
    ),
    // The custom row inserts the entry AS TYPED — weight word included — while
    // the ranking above used the family part alone.
    custom:
      needle !== '' && exact === undefined && !isGenericFamilyName(needle.toLowerCase())
        ? inner
        : undefined,
  }
}

/** Clamp the highlighted index against a list that may have shrunk under it. */
function clampHighlight(items, active) {
  return items.length === 0 ? -1 : Math.min(Math.max(active, 0), items.length - 1)
}

/**
 * Place a chosen completion into the query.
 *
 * Two shapes, because the caret means two things. `at: 'entry'` replaces the
 * entry under the caret — what completing a half-typed family needs, since a
 * family name is several words. `at: 'before'` inserts a whole new entry ahead
 * of the one under the caret, which is how a family is put in charge without
 * touching the fallbacks behind it.
 *
 * A trailing `, ` is added after a family so the next fallback can be typed
 * straight away — but not after a weight, which completes the entry instead of
 * inviting another one. An empty entry at the end of the query is what the
 * canonical form drops on commit, so the affordance never reaches the setting.
 *
 * @param text - the query.
 * @param suggestion - `{ start, end, at }` from {@link querySuggestions}.
 * @param insert - the text to place there.
 * @param kind - the chosen item's kind, which decides the trailing comma.
 * @returns `{ text, caret }`.
 */
function applySuggestion(text, suggestion, insert, kind) {
  const source = typeof text === 'string' ? text : ''
  const start = Math.min(Math.max(suggestion.start, 0), source.length)
  const end = Math.min(Math.max(suggestion.end, start), source.length)
  const before = source.slice(0, start)
  // Inserting ahead of the entry keeps the whole entry; replacing it keeps only
  // what follows it. A weight is never an insertion, whatever the caret says.
  const insertingBefore = suggestion.at === 'before' && kind !== 'weight'
  const after = source.slice(insertingBefore ? start : end)

  if (insertingBefore) {
    // The space the entry carried belonged to the comma before it, so it is
    // restored rather than doubled — and the entry itself is kept verbatim.
    const rest = after.replace(/^\s+/, '')
    const head = before !== '' && !/\s$/.test(before) ? `${before} ` : before
    return { text: `${head}${insert}, ${rest}`, caret: head.length + insert.length + 2 }
  }

  const trailing = after === '' && kind !== 'weight' ? ', ' : ''
  return {
    text: `${before}${insert}${trailing}${after}`,
    caret: before.length + insert.length + trailing.length,
  }
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

/**
 * Rank the catalogue against what the user has typed: exact match, then prefix,
 * then substring, then everything else. An empty query returns the catalogue
 * as-is so the dropdown doubles as a browse list.
 * @param families - the catalogue.
 * @param query - the current input text.
 * @returns the ordered candidates.
 */
function rankFamilyMatches(families, query) {
  const needle = query.trim().toLowerCase()
  if (needle === '') return families
  const exact = []
  const prefix = []
  const contains = []
  for (const family of families) {
    const lower = family.toLowerCase()
    if (lower === needle) exact.push(family)
    else if (lower.startsWith(needle)) prefix.push(family)
    else if (lower.includes(needle)) contains.push(family)
  }
  return [...exact, ...prefix, ...contains]
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
  'font.suggestions': '字体建议',
  'font.familyKind': '字体族',
  'font.genericKind': '通用族',
  'font.pending': '按 Enter 应用（文本不会被改写）',
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
  'font.add': '插入',
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
  'font.suggestions': 'Font suggestions',
  'font.familyKind': 'family',
  'font.genericKind': 'generic',
  'font.pending': 'Press Enter to apply (your text is not rewritten)',
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
  'font.add': 'Insert',
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
  // The editor is a textarea with a painted layer behind it. The textarea owns
  // the text and the caret but renders it transparent; the layer renders the
  // same characters, split into coloured tokens.
  //
  // ONE FONT, AND IT IS NOT THE USER'S. A textarea cannot style a substring, so
  // the layer and the field can only stay aligned if every character comes from
  // the same face at the same weight — the whole box therefore uses one system
  // monospace at 400, whatever font the query names. The user's font would break
  // this twice over: a programming face with ligatures (`->` in Fira Code) draws
  // one glyph in the layer while the field draws two, and a weight the face does
  // not have is synthesized differently in each. Ligatures, kerning, and
  // stretching are switched off outright for the same reason.
  //
  // The layer is therefore only ever allowed colour, background, and
  // text-decoration: anything that changes a glyph's advance would desynchronize
  // the two.
  '.dsh-font-query{flex-direction:column;gap:4px;display:flex}',
  '.dsh-font-queryBox{position:relative;border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;background:var(--dsw-alias-bg-module-platform)}',
  '.dsh-font-queryBox:focus-within{border-color:var(--dsw-alias-brand-primary)}',
  '.dsh-font-queryLayer,.dsh-font-queryInput{box-sizing:border-box;width:100%;margin:0;padding:5px 10px;border:none;font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;font-size:13px;font-weight:400;font-style:normal;font-stretch:normal;font-variant-ligatures:none;font-kerning:none;font-feature-settings:"liga" 0,"calt" 0,"dlig" 0;line-height:20px;letter-spacing:normal;word-spacing:normal;text-transform:none;text-indent:0;tab-size:4;white-space:pre-wrap;overflow-wrap:break-word;word-break:break-word}',
  '.dsh-font-queryLayer{position:absolute;inset:0;overflow:hidden;pointer-events:none;color:var(--dsw-alias-label-primary)}',
  '.dsh-font-queryInput{position:relative;display:block;min-height:32px;max-height:120px;resize:none;overflow-y:auto;background:transparent;color:transparent;caret-color:var(--dsw-alias-label-primary);outline:none}',
  '.dsh-font-queryInput::placeholder{color:var(--dsw-alias-label-tertiary)}',
  '.dsh-font-queryInput::selection{background:var(--dsw-alias-interactive-bg-active)}',
  '.dsh-font-qFamily{color:var(--dsw-alias-label-primary)}',
  // The family that is in effect: the first one the browser can actually use.
  '.dsh-font-qEffective{background:var(--dsw-alias-markdown-inline-code);border-radius:3px}',
  // Keywords, not state: a generic family and a weight word are syntax. The
  // accent is the link colour because `--dsw-alias-brand-primary` resolves to
  // the ordinary text colour in both themes, which would colour nothing.
  '.dsh-font-qGeneric,.dsh-font-qWeight{color:var(--dsw-alias-link)}',
  '.dsh-font-qUnknown{color:var(--dsw-alias-state-warn-primary)}',
  '.dsh-font-qWeightMissing{color:var(--dsw-alias-state-warn-primary);text-decoration:underline wavy var(--dsw-alias-state-warn-primary)}',
  '.dsh-font-qComma{color:var(--dsw-alias-label-caption)}',
  '.dsh-font-menu{position:absolute;z-index:20;left:0;right:0;top:calc(100% + 4px);max-height:240px;overflow-y:auto;margin:0;padding:4px;list-style:none;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l2);border-radius:10px;box-shadow:var(--dsw-elevation-panel)}',
  '.dsh-font-option{cursor:pointer;border-radius:6px;padding:5px 8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:8px}',
  '.dsh-font-optionActive{background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-font-optionKey{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}',
  '.dsh-font-optionDetail{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px}',
  '.dsh-font-optionCustom{color:var(--dsw-alias-label-secondary);border-top:.5px solid var(--dsw-alias-border-l2);border-radius:0 0 6px 6px;display:block}',
  '.dsh-font-meta{flex-wrap:wrap;gap:8px;justify-content:space-between;display:flex}',
  '.dsh-font-warn{color:var(--dsw-alias-state-warn-primary);font-size:11px;line-height:16px}',
  // Text the reader could not parse: a red line, not a suggestion.
  '.dsh-font-warn.dsh-font-error{color:var(--dsw-alias-state-error-primary)}',
  '.dsh-font-pending{color:var(--dsw-alias-link);font-size:11px;line-height:16px}',
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

/** The class one highlight token is painted with. */
const QUERY_TOKEN_CLASS = {
  family: 'dsh-font-qFamily',
  generic: 'dsh-font-qGeneric',
  unknown: 'dsh-font-qUnknown',
  weight: 'dsh-font-qWeight',
  weightMissing: 'dsh-font-qWeightMissing',
  comma: 'dsh-font-qComma',
  space: '',
}

/**
 * The class for one token, plus the pill that marks the family in effect.
 *
 * Only colour, background, and text-decoration may ever appear here: the layer
 * this paints shares a box with the real textarea, so any property that changes
 * a glyph's advance would slide every colour off its character.
 * @param token - one token from {@link fontQueryTokens}.
 * @param effectiveFamily - the lowercase name of the family in effect.
 * @returns the class attribute value.
 */
function queryTokenClass(token, effectiveFamily) {
  const base = QUERY_TOKEN_CLASS[token.kind] ?? ''
  if (token.family === undefined || effectiveFamily === undefined) return base
  return token.family.toLowerCase() === effectiveFamily
    ? `${base} dsh-font-qEffective`.trim()
    : base
}

/**
 * The font-query editor: a textarea over a painted layer, with autocomplete.
 *
 * Why a textarea and not `contenteditable`: the query is a *string* the user is
 * editing, so the browser's own text editing — selection, undo, IME, soft wrap
 * — is exactly what is wanted, and a painted layer behind a transparent
 * textarea reproduces it with syntax colours. `contenteditable` would mean
 * re-implementing all of that on top of a DOM that fights back.
 *
 * THE RULE THIS COMPONENT FOLLOWS: the text belongs to the user.
 *
 * It is never rewritten — not quoted, not reordered, not tidied, not refilled
 * when it is empty. Applying a query (Enter, or leaving the field) parses it and
 * writes the settings it names; it does not touch a character. Anything wrong
 * with the query is marked under the field and left alone. The only exception is
 * a completion the user picks from the list, which is an explicit request for
 * that replacement, and the only way a value from outside takes the text over is
 * a change that means something different from what is on screen (Reset, another
 * tab) while the field is not focused.
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
  /**
   * The axis's shipped weight. A query at this weight carries no word: the
   * shipped value is not something the user chose, and spelling it out put a
   * `regular` after every interface font that nobody asked for. What applies is
   * still always stated in the line under the field.
   */
  const shippedWeight = monospace === true ? DEFAULT_CODE_FONT_WEIGHT : DEFAULT_UI_FONT_WEIGHT
  const options = { catalogue, styles, enumerated }
  /** Families plus a weight, as the text the field edits. */
  const asQuery = (families, weight) =>
    serializeFontQuery(families, weight === shippedWeight ? undefined : weight)
  // The stored value rendered as the field's text. A weight word left inside the
  // family string by a hand edit belongs to the weight field, so the two stored
  // values are shown as one query rather than the raw string.
  const stored = parseFontQuery(value, options)
  const storedFamilies = stored.families.length > 0 ? stored.families : parseFamilyList(value)
  const storedText = asQuery(storedFamilies, weight)

  /**
   * THE EDITING RULE: the text is the user's.
   *
   * Nothing here ever rewrites what was typed. `draft` holds it verbatim, and it
   * is replaced only by a value that arrives from outside (Reset, another tab) —
   * or by a completion the user explicitly picked. Applying a query parses it and
   * writes the two settings fields; it does not touch the text. A query that
   * resolves to nothing is an unfinished edit and writes nothing at all, rather
   * than being "helpfully" replaced by the shipped stack: silently refilling a
   * box the user just cleared is indistinguishable from a bug.
   *
   * `undefined` means "nothing typed yet — show the stored value".
   */
  const [draft, setDraft] = useState(undefined)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [caret, setCaret] = useState(0)
  const inputRef = useRef(null)
  const layerRef = useRef(null)
  const focused = useRef(false)
  /** A caret to restore after the next render, for edits made without a mouse. */
  const pendingCaret = useRef(undefined)

  const text = draft === undefined ? storedText : draft
  const position = Math.min(Math.max(caret, 0), text.length)
  const context = queryContextAt(text, position)
  const suggestion = querySuggestions(context, { ...options, shippedWeight })
  const parsed = parseFontQuery(text, options)
  const tokens = fontQueryTokens(text, options)
  /** The custom row is a completion too, so it takes part in keyboard travel. */
  const rows =
    suggestion.custom === undefined
      ? suggestion.items
      : [...suggestion.items, { id: 'custom', kind: 'custom', insert: suggestion.custom }]
  const highlighted = clampHighlight(rows, active)
  /** What the axis is set to — the setting, not the text being typed. */
  const appliedWeight = normalizeWeight(weight)
  /** A query that says nothing about a family is an unfinished edit. */
  const unfilled = parsed.families.length === 0 && parsed.weight === undefined
  // The text carries something the setting does not (yet). Compared by MEANING,
  // so lowercase or unquoted input is not reported as "not applied".
  const pendingText =
    draft === undefined ? undefined : asQuery(parsed.families, parsed.weight ?? weight)
  const pending = pendingText !== undefined && pendingText !== storedText
  const effectiveFamily =
    parsed.effective >= 0 ? parsed.families[parsed.effective].toLowerCase() : undefined
  const typed = context.inner.trim()

  const messages = parsed.diagnostics
    .map((diagnostic) => ({
      text: describeDiagnostic(diagnostic, labels),
      kind: diagnosticKind(diagnostic.code),
    }))
    .filter((message) => message.text !== '')
  if (parsed.families.length > 0 && !parsed.families.some((f) => isGenericFamilyName(f.toLowerCase()))) {
    messages.push({ text: labels.genericWarning, kind: 'warn' })
  }

  // The auto-height and the caret both belong to the render *after* the one that
  // changed the text: a controlled textarea cannot be given a selection range in
  // the same tick as the value it refers to.
  useEffect(() => {
    const node = inputRef.current
    if (node === null || node === undefined) return
    node.style.height = 'auto'
    node.style.height = `${String(Math.min(node.scrollHeight, 120))}px`
    const wanted = pendingCaret.current
    if (wanted === undefined) return
    pendingCaret.current = undefined
    const clamped = Math.min(wanted, node.value.length)
    node.focus()
    node.setSelectionRange(clamped, clamped)
    setCaret(clamped)
  }, [text])

  // A value that arrived from elsewhere — the Reset button, another tab — takes
  // the field over. Our own write coming back does not: it means the same thing
  // as the text on screen, and replacing the text then would be the plugin
  // rewriting the user's typing. Nor does anything interrupt a focused field.
  useEffect(() => {
    if (focused.current) return
    setDraft((current) => {
      if (current === undefined) return undefined
      const read = parseFontQuery(current, options)
      return asQuery(read.families, read.weight ?? weight) === storedText ? current : undefined
    })
  }, [storedText])

  /**
   * Apply a query: parse it and write the settings fields it names.
   *
   * The text is NOT touched — not quoted, not reordered, not tidied. A query
   * that names no family is an unfinished edit and writes nothing, leaving the
   * stored stack alone; a query that names a weight but no family still moves
   * that axis, because a weight alone is a complete statement about it.
   * @param raw - the text to apply.
   */
  const apply = (raw) => {
    const read = parseFontQuery(raw, options)
    if (read.families.length > 0) onFamilies(serializeFamilyList(read.families))
    if (read.weight !== undefined) onWeight(read.weight)
  }

  /**
   * Take one completion the user picked. This is the one place text is replaced
   * without the user having typed the replacement, and it only ever runs from an
   * explicit pick: a click on a row, or Tab on the highlighted one.
   * @param row - the chosen suggestion row.
   */
  const accept = (row) => {
    const next = applySuggestion(text, suggestion, row.insert, row.kind)
    pendingCaret.current = next.caret
    setDraft(next.text)
    setCaret(next.caret)
    setOpen(false)
    setActive(0)
    // A weight row is an instruction about that axis value, not just text: the
    // shipped weight is implicit in the text, so the number has to travel with
    // the row rather than be re-parsed out of the insertion.
    const read = parseFontQuery(next.text, options)
    if (read.families.length > 0) onFamilies(serializeFamilyList(read.families))
    const nextWeight = row.weight ?? read.weight
    if (nextWeight !== undefined) onWeight(nextWeight)
  }

  /** Move the caret's entry, which is the keyboard's reorder. */
  const move = (delta) => {
    const next = moveFontQueryEntry(text, position, delta)
    if (next.text === text) return
    pendingCaret.current = next.caret
    setDraft(next.text)
    setCaret(next.caret)
  }

  const trackCaret = (event) => {
    const node = event.target
    if (node !== null && node !== undefined && typeof node.selectionStart === 'number') {
      setCaret(node.selectionStart)
    }
  }

  const onKeyDown = (event) => {
    if (event.altKey === true && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      move(event.key === 'ArrowUp' ? -1 : 1)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      setActive((current) => {
        const last = Math.max(rows.length - 1, 0)
        return event.key === 'ArrowDown'
          ? Math.min(current + 1, last)
          : Math.max(current - 1, 0)
      })
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      // Enter APPLIES, it never completes: transforming what was typed because
      // the user pressed Enter is the rudest thing this control could do. Taking
      // a suggestion is Tab (or a click), which are unambiguous requests for it.
      setOpen(false)
      apply(text)
      return
    }
    if (event.key === 'Tab' && open && highlighted >= 0 && typed !== '') {
      event.preventDefault()
      accept(rows[highlighted])
      return
    }
    if (event.key === 'Escape') {
      if (open) setOpen(false)
      // The one way back to the stored value: the user asks for their own text
      // to be discarded.
      else setDraft(undefined)
    }
  }

  return React.createElement(
    'div',
    { className: 'dsh-font-query' },
    React.createElement(
      'div',
      { className: 'dsh-font-queryBox' },
      React.createElement(
        'div',
        { className: 'dsh-font-queryLayer', ref: layerRef, 'aria-hidden': 'true' },
        tokens.map((token, index) =>
          React.createElement(
            'span',
            { key: `${token.kind}-${String(index)}`, className: queryTokenClass(token, effectiveFamily) },
            token.text,
          ),
        ),
        // A zero-width space keeps the layer's last line box as tall as the
        // textarea's: a trailing newline would otherwise collapse in the layer
        // alone, and the box would jump as soon as one is typed.
        '\u200b',
      ),
      React.createElement('textarea', {
        ref: inputRef,
        className: 'dsh-font-queryInput',
        value: text,
        rows: 1,
        spellCheck: false,
        autoComplete: 'off',
        autoCorrect: 'off',
        autoCapitalize: 'off',
        // No placeholder: a ghost of the shipped stack in an empty box reads as
        // a value the plugin put there. The hint above the field is the example.
        role: 'combobox',
        'aria-label': label,
        'aria-expanded': open && rows.length > 0,
        'aria-autocomplete': 'list',
        onFocus: (event) => {
          focused.current = true
          setOpen(true)
          trackCaret(event)
        },
        onBlur: () => {
          focused.current = false
          setOpen(false)
          // A caret restored after this would pull focus straight back.
          pendingCaret.current = undefined
          // An untouched field writes nothing: the stored value is already what
          // the settings hold, and a blur is not an edit.
          if (draft !== undefined) apply(text)
        },
        onChange: (event) => {
          const node = event.target
          const raw = node.value
          // Typed text goes in EXACTLY as typed. No comma is inserted, no quote
          // is added, nothing is reordered: a control that edits your keystrokes
          // is broken even when its guess would have been right.
          setDraft(raw)
          setCaret(typeof node.selectionStart === 'number' ? node.selectionStart : raw.length)
          setOpen(true)
          setActive(0)
        },
        onKeyDown,
        onKeyUp: trackCaret,
        onClick: trackCaret,
        onSelect: trackCaret,
        onScroll: (event) => {
          const layer = layerRef.current
          if (layer === null || layer === undefined) return
          layer.scrollTop = event.target.scrollTop
          layer.scrollLeft = event.target.scrollLeft
        },
      }),
      open && rows.length > 0
        ? React.createElement(
            'ul',
            { className: 'dsh-font-menu', role: 'listbox', 'aria-label': labels.list },
            rows.map((row, index) =>
              React.createElement(
                'li',
                {
                  key: row.id,
                  role: 'option',
                  'aria-selected': index === highlighted,
                  className: `dsh-font-option${index === highlighted ? ' dsh-font-optionActive' : ''}${row.kind === 'custom' ? ' dsh-font-optionCustom' : ''}`,
                  // `onMouseDown` beats the textarea's blur, so a pick is not
                  // lost to the commit that blur would otherwise run first.
                  onMouseDown: (event) => {
                    event.preventDefault()
                    accept(row)
                  },
                  onMouseEnter: () => {
                    setActive(index)
                  },
                },
                row.kind === 'weight'
                  ? [
                      React.createElement(
                        'span',
                        { key: 'key', className: 'dsh-font-optionKey' },
                        `${row.family} ${row.word}`,
                      ),
                      React.createElement(
                        'span',
                        { key: 'detail', className: 'dsh-font-optionDetail' },
                        labels.weightName(row.weight),
                      ),
                    ]
                  : row.kind === 'custom'
                    ? `${labels.add}: "${row.insert}"`
                    : [
                        React.createElement(
                          'span',
                          { key: 'key', className: 'dsh-font-optionKey' },
                          row.name,
                        ),
                        React.createElement(
                          'span',
                          { key: 'detail', className: 'dsh-font-optionDetail' },
                          row.kind === 'generic' ? labels.generic : labels.font,
                        ),
                      ],
              ),
            ),
          )
        : null,
    ),
    React.createElement(
      'div',
      { className: 'dsh-font-meta' },
      React.createElement(
        'span',
        { className: monospace === true ? 'dsh-font-hint dsh-font-code' : 'dsh-font-hint' },
        `font-family: ${serializeFamilyList(storedFamilies)}`,
      ),
    ),
    // The value the axis is SET to — not what the text parses to. Nothing here
    // pretends the typed query has been applied: that is what the line below is
    // for, and it is why clearing the field cannot change the readout.
    React.createElement(
      'div',
      { className: 'dsh-font-hint' },
      `${labels.weightLine}: ${labels.weightName(appliedWeight)} ${String(appliedWeight)}${
        appliedWeight === shippedWeight ? labels.weightShipped : ''
      }`,
    ),
    // An unfinished edit is reported, never "corrected": the stored stack is
    // still in use, and the text is left exactly as it was typed. There is
    // nothing to apply either, so the pending line stays out of it.
    unfilled && draft !== undefined
      ? React.createElement('div', { className: 'dsh-font-hint' }, labels.emptyQuery)
      : null,
    pending && !unfilled
      ? React.createElement('div', { className: 'dsh-font-pending' }, labels.pending)
      : null,
    messages.map((message, index) =>
      React.createElement(
        'div',
        {
          key: `${String(index)}`,
          className:
            message.kind === 'error' ? 'dsh-font-warn dsh-font-error' : 'dsh-font-warn',
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
   * @param weightLine - the axis's weight label (`代码字重` / `界面字重`).
   * @returns the label bag both {@link FontQueryEditor}s consume.
   */
  const editorLabels = (weightLine) => ({
    list: t('font.suggestions'),
    add: t('font.add'),
    font: t('font.familyKind'),
    generic: t('font.genericKind'),
    weightLine,
    weightShipped: t('font.weightShipped'),
    pending: t('font.pending'),
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
        // A commit that resolves to what is already stored writes nothing: the
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
 * The services this plugin waits for: the settings transport plus slots/locale
 * for the row. The theme service is read through `ctx.get` (optional) so a
 * composition without `ui-theme` still gets families from the stylesheet path.
 */
const inject = ['slots', 'locale', 'settingsScope']

/**
 * Client plugin body: resolve the durable section, paint it, and register the
 * feature-owned Fonts row into the General section's item slot.
 * @param ctx - client cordis context.
 */
export function apply(ctx) {
  installRowStyles(ctx)
  observeScale(ctx)

  const scope = ctx.settingsScope.bind({
    namespace: FONT_SETTINGS_NAMESPACE,
    decode: (section) => {
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
    },
  })

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

  const paint = (section, revision) => {
    actions?.sync(section, revision)
    applyFonts(section)
    publishFamilyTokens(ctx, section)
  }

  ctx.effect(
    () =>
      scope.subscribe(() => {
        const snapshot = scope.getSnapshot()
        if (snapshot.value === undefined) return
        paint(snapshot.value, snapshot.revision)
      }),
    'dsh-font: settings adoption',
  )

  const initial = scope.getSnapshot()
  paint(initial.value ?? defaults, initial.revision)

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
