/**
 * The font query — the small language this plugin's two family settings are
 * edited in — as a grammar for `@citisen/litearea`.
 *
 * `litearea` is a generic editor that receives a grammar as a value: it ships no
 * language of its own, and it must not. A grammar is a fact about a product
 * rather than about an editor, so the description of this language lives here,
 * beside the parser that reads it, and it is built from THAT parser's constants
 * ({@link WEIGHT_WORDS}, {@link GENERIC_FAMILIES}, {@link COMMON_FAMILIES})
 * rather than from a second copy of them. The editor can therefore never offer a
 * family {@link parseFontQuery} would then call unknown.
 *
 * The language
 * ------------
 *
 *     Geist Mono medium, "Zhuque Fangsong (technical preview)", monospace
 *     └─────┬────┘ └──┬─┘
 *         family    weight
 *
 * A CSS font-family list, plus the one thing the list cannot carry. `font-family:
 * "Geist Mono" 500, monospace` is an invalid declaration that drops the whole
 * stack, so the weight has to be its own `font-weight` — but it can still be
 * WRITTEN next to the family it belongs to, which is what lets one field describe
 * both. A weight is chosen for a family; having to change them in two places is
 * exactly the problem this language exists to remove.
 *
 *     query  := entry ("," entry)*
 *     entry  := family | weight
 *     family := '"' … '"' | "'" … "'" | word (space word)*
 *     weight := a word from WEIGHT_WORDS
 *
 * Only the LAST word of an unquoted entry may be a weight, and only when the
 * whole entry is not itself a catalogued family: `Book Antiqua` and
 * `Franklin Gothic Medium` are real families, and stripping either would
 * silently retarget the stack at a font nobody picked. Quoting always means
 * "this is the family name, verbatim", so a quoted entry never splits.
 *
 * What it adds over a parse
 * -------------------------
 *
 * The parser is forgiving on purpose: text it cannot place is kept as written and
 * reported, never silently dropped. The grammar keeps that reading — it splits
 * and reads the entries with the parser's own rules — and adds what a parse
 * cannot do: it marks a problem the moment the character is typed, explains a
 * token under the pointer, and offers the next entry before it is spelled out.
 *
 * Two of the scopes below are not lexical at all. `weight.missing` — a weight the
 * chosen family has no face for — depends on the machine's installed faces, and
 * `family.unknown` depends on whether the catalogue was actually read. Both are
 * painted from a `scope` FUNCTION that reads the analysis, because a rule may
 * look at `match.state`. That is this library's answer to VSCode's split between
 * a TextMate grammar and semantic tokens: one rule set, two sources of truth
 * about a span, and the semantic one is allowed to override.
 *
 * How it reaches the bundle
 * -------------------------
 *
 * There is no bundler. `scripts/build-client.mjs` splices this file into the same
 * scope as `src/client.js`, which is why the constants and the helpers named
 * above are readable here with no import. The library's public API is the only
 * import this file may carry.
 *
 * @module dsh-font/font-grammar
 */

import { defineGrammar, defineVocabulary } from '@citisen/litearea'

// ─── the scopes this grammar paints with ────────────────────────────────────
//
// A scope is a plain string: the engine turns it into a CSS class
// (`litearea-scope-<scope>`) and a stylesheet decides how it looks. The dots are
// kept so a group can be themed at once, and the two semantic scopes sit beside
// their lexical siblings deliberately — the same word is `weight` on a family
// that has it and `weight.missing` on one that does not.

/** The scope names this grammar paints with. */
const SCOPE = {
  family: 'family',
  generic: 'family.generic',
  unknown: 'family.unknown',
  unclosed: 'family.unclosed',
  weight: 'weight',
  weightMissing: 'weight.missing',
  separator: 'separator',
}

/**
 * One entry of the query, as the reader found it.
 *
 * The offsets are what the decoration and the completion need: a pick replaces
 * the entry's CORE rather than its whole slice, which is what keeps the
 * whitespace around it — and the comma before it — from being swallowed.
 *
 * @typedef {object} FontGrammarEntry
 * @property {number} from - the entry's first character, whitespace included.
 * @property {number} to - one past the entry's last character.
 * @property {number} coreFrom - the first character of the trimmed core.
 * @property {number} coreTo - one past the trimmed core.
 * @property {string} core - the entry with the whitespace around it removed.
 * @property {boolean} quoted - whether the core opens with a quote.
 * @property {boolean} closed - whether that quote was also closed. An unclosed
 *   one has no name boundary to find, which is what makes the two cases worth
 *   telling apart after the fact.
 * @property {string} name - the family name, quotes and weight word taken out.
 * @property {number} nameFrom - the first character of that name.
 * @property {number} nameTo - one past that name.
 * @property {string|undefined} word - the weight word the entry carries, if any.
 * @property {number} wordFrom - the first character of that word.
 * @property {number} wordTo - one past that word.
 * @property {'empty'|'family'|'generic'|'unknown'|'weight'} kind - what the
 *   reader made of the entry.
 */

/**
 * A problem the structural pass found, and the range to mark.
 *
 * @typedef {object} FontGrammarProblem
 * @property {number} from - the first character to mark.
 * @property {number} to - one past the last character to mark.
 * @property {string} message - what is wrong, in English.
 * @property {string} code - a stable tag, so a host can recognize it.
 * @property {'error'|'warning'|'info'|'hint'} severity - how loudly it speaks.
 */

/**
 * What one pass over the query produced.
 *
 * @typedef {object} FontGrammarState
 * @property {FontGrammarEntry[]} entries - every entry, in order.
 * @property {string[]} families - the family names the entries name, in order.
 * @property {number} effective - which of them the browser will paint with, or
 *   `-1` when none will.
 * @property {number|undefined} weight - the numeric weight the query states.
 * @property {string|undefined} weightWord - the word it states it with.
 * @property {FontGrammarProblem[]} problems - what the pass complained about.
 */

/**
 * What a host supplies to describe the machine the query will run on.
 *
 * Every field is optional, and the three vocabularies default to the parser's
 * own constants, because a host that has nothing to say about the machine still
 * wants the language described.
 *
 * @typedef {object} FontGrammarOptions
 * @property {readonly string[]} [catalogue] - the family names the machine has.
 * @property {boolean} [enumerated] - whether that catalogue was READ from the
 *   machine. It changes what an unrecognized name means: with a read catalogue
 *   the browser will fall through to a later family, which is worth warning
 *   about; without one the catalogue is only a suggestion list.
 * @property {Readonly<Record<string, readonly string[]>>} [styles] - the face
 *   style names of each family, as the Local Font Access API reports them.
 * @property {number} [shippedWeight] - the weight the axis ships with, offered
 *   as a row that takes the word away rather than spelling it out.
 * @property {readonly string[]} [commonFamilies] - families offered even when
 *   they were not detected.
 * @property {readonly string[]} [genericFamilies] - the generic CSS families.
 * @property {number} [phraseWords] - how many words one unquoted family name may
 *   span when it is matched against the catalogue.
 */

/**
 * Whether a lowercase name is a generic CSS family (`monospace`, `serif`, …).
 *
 * The list is an argument rather than a closed-over constant because it is an
 * option of the factory: a host that declares its own generics gets exactly
 * those, and that is also what makes "the vocabulary is not compiled in"
 * something a test can check.
 * @param name - a lowercase family name.
 * @param generics - the generic families in force.
 * @returns whether the name names a generic family.
 */
function isGenericName(name, generics) {
  return generics.includes(name)
}

/**
 * The face style names of one family, matched without regard to case.
 *
 * The keys are the machine's own spelling while the query holds the user's, so
 * the two are folded together here rather than at every call site.
 * @param styles - the faces read off this machine, keyed by family.
 * @param family - the family name as the query writes it.
 * @returns the face style names, or undefined when none were read for it.
 */
function lookupStyles(styles, family) {
  if (Object.hasOwn(styles, family)) return styles[family]
  const lower = family.toLowerCase()
  for (const [name, faces] of Object.entries(styles)) {
    if (name.toLowerCase() === lower) return faces
  }
  return undefined
}

/**
 * The scope a closed quoted entry is painted with.
 *
 * The quotes are punctuation and not part of the name, so what decides the
 * colour is what is INSIDE them: a quoted generic is still a generic, and a
 * quoted name the machine does not have is still worth painting as unknown.
 * @param text - the quoted text, quotes included.
 * @param known - the lowercase catalogue.
 * @param generics - the generic families in force.
 * @param enumerated - whether the catalogue is authoritative.
 * @returns the scope to paint it with.
 */
function quotedScope(text, known, generics, enumerated) {
  const quote = text.charAt(0)
  const inner = text.length >= 2 && text.endsWith(quote) ? text.slice(1, -1) : text.slice(1)
  const lower = inner.trim().toLowerCase()
  if (lower === '') return SCOPE.family
  if (isGenericName(lower, generics)) return SCOPE.generic
  if (known.has(lower)) return SCOPE.family
  return enumerated ? SCOPE.unknown : SCOPE.family
}

/**
 * Take one matching pair of surrounding quotes off a name.
 * @param name - the text as it was written.
 * @returns the text without its quotes, or unchanged when it has none.
 */
function unquote(name) {
  const text = String(name)
  const quote = text.charAt(0)
  if ((quote === '"' || quote === "'") && text.length >= 2 && text.endsWith(quote)) {
    return text.slice(1, -1)
  }
  return text
}

/**
 * Case-insensitive exact lookup in a suggestion space.
 * @param names - the names to search.
 * @param needle - the text to match.
 * @returns the name as the space spells it, or undefined when it has none.
 */
function findExact(names, needle) {
  const lower = needle.toLowerCase()
  return names.find((name) => name.toLowerCase() === lower)
}

/**
 * The entry an offset falls in, when it falls in one.
 *
 * A caret past the last entry's end still belongs to that entry — it is where
 * text is about to be typed — so running off the end returns the last entry
 * rather than nothing.
 * @param entries - the query's entries.
 * @param offset - a caret offset into the query.
 * @returns the entry, or undefined for a query that has none.
 */
function entryAt(entries, offset) {
  for (const entry of entries) {
    if (offset >= entry.from && offset <= entry.to) return entry
  }
  return entries[entries.length - 1]
}

/**
 * The range a completion over the caret replaces: the CORE of the entry it sits
 * in, without the whitespace around it.
 *
 * The whitespace is left out on purpose, and it matters twice. It keeps the
 * replacement from swallowing the separator that belongs to the comma before it,
 * and it keeps the needle honest — the text between the range's start and the
 * caret is what the list is filtered by, and a leading space in it would match
 * nothing while looking like it should match everything.
 * @param state - the analysis.
 * @param caret - the caret offset.
 * @returns the range to replace.
 */
function entryRange(state, caret) {
  const entry = entryAt(state.entries, caret)
  return entry === undefined ? { from: caret, to: caret } : { from: entry.coreFrom, to: entry.coreTo }
}

/**
 * Whether the caret's entry is the last one in the query.
 *
 * Only the last entry is followed by nothing, which is what decides whether a
 * pick should invite the next one with a comma: inside a list the comma is
 * already there, and appending a second would leave `Inter, , monospace`.
 * @param state - the analysis.
 * @param caret - the caret offset.
 * @returns whether it is the last entry.
 */
function lastEntry(state, caret) {
  const entry = entryAt(state.entries, caret)
  return entry === undefined || entry === state.entries[state.entries.length - 1]
}

/**
 * Read one entry into the family it names and the weight it carries.
 *
 * The two shapes a weight can take are both here: a bare entry whose last word
 * is a weight (`Geist Mono medium`), and a quoted family followed by one
 * (`"Geist Mono" medium` — what the canonical serializer writes, which is why a
 * quoted entry cannot simply mean "no weight"). Only the last word of an
 * UNQUOTED entry may be a weight, and only when the whole entry is not itself a
 * catalogued family.
 *
 * @param source - the whole query, for the offsets.
 * @param bounds - one record from {@link splitQueryEntries}.
 * @param known - the lowercase catalogue.
 * @param generics - the generic families in force.
 * @param enumerated - whether the catalogue is authoritative.
 * @returns `{ entry, problems }`.
 */
function readEntry(source, bounds, known, generics, enumerated) {
  const raw = bounds.text
  const trimmed = raw.trim()
  const coreFrom = bounds.start + bounds.lead.length
  const core = trimmed
  const coreTo = coreFrom + core.length
  const problems = []

  const entry = {
    from: bounds.start,
    to: bounds.end,
    coreFrom,
    coreTo,
    core,
    quoted: false,
    closed: false,
    name: '',
    nameFrom: coreFrom,
    nameTo: coreTo,
    word: undefined,
    wordFrom: coreTo,
    wordTo: coreTo,
    kind: 'empty',
  }
  if (core === '') return { entry, problems }

  const quoteChar = core.charAt(0)
  const quote = quoteChar === '"' || quoteChar === "'" ? quoteChar : ''
  const lower = core.toLowerCase()
  /**
   * Whether the entry is still worth looking up.
   *
   * A quote that never closes, or text after a closing one that is neither a
   * weight nor part of the name, means the entry is already reported — and the
   * name the reader salvaged from it is a consequence of that mistake rather
   * than a separate fact about the machine. Warning that the consequence is
   * "not in the font list" would bury the cause under its symptom.
   */
  let lookUp = true

  if (quote !== '') {
    entry.quoted = true
    const close = core.indexOf(quote, 1)
    if (close < 0) {
      // An unclosed quote runs to the end of the document, which is why it is
      // reported rather than repaired: everything after it became one name.
      entry.name = core.slice(1).trim()
      entry.nameFrom = coreFrom + 1
      entry.kind = 'family'
      problems.push({
        from: coreFrom,
        to: coreTo,
        message:
          'This quote is never closed, so everything after it is read as part of one family name.',
        code: 'unclosed-quote',
        severity: 'error',
      })
      return { entry, problems }
    }
    entry.name = core.slice(1, close)
    entry.nameFrom = coreFrom + 1
    entry.nameTo = coreFrom + close
    entry.closed = true
    const rest = core.slice(close + 1).trim()
    if (rest !== '') {
      const restFrom = coreTo - rest.length
      if (Object.hasOwn(WEIGHT_WORDS, rest.toLowerCase())) {
        entry.word = rest.toLowerCase()
        entry.wordFrom = restFrom
        entry.wordTo = coreTo
      } else {
        problems.push({
          from: restFrom,
          to: coreTo,
          message: `"${rest}" follows a quoted family name but is neither a weight nor part of it, so it is ignored.`,
          code: 'trailing-text',
          severity: 'error',
        })
        lookUp = false
      }
    }
    entry.kind = 'family'
  } else if (isGenericName(lower, generics) || known.has(lower)) {
    // The whole entry is one family: there is nothing to strip off it.
    entry.name = core
    entry.kind = isGenericName(lower, generics) ? 'generic' : 'family'
  } else if (Object.hasOwn(WEIGHT_WORDS, lower)) {
    // A bare weight word stands on its own, without a family.
    entry.kind = 'weight'
    entry.word = lower
    entry.wordFrom = coreFrom
    entry.wordTo = coreTo
  } else {
    const cut = lower.lastIndexOf(' ')
    const tail = cut > 0 ? lower.slice(cut + 1) : ''
    if (cut > 0 && Object.hasOwn(WEIGHT_WORDS, tail)) {
      entry.word = tail
      entry.wordFrom = coreFrom + cut + 1
      entry.wordTo = coreTo
      entry.name = core.slice(0, cut).trim()
      entry.nameTo = entry.nameFrom + entry.name.length
    } else {
      entry.name = core
    }
    entry.kind = 'family'
  }

  const nameLower = entry.name.trim().toLowerCase()
  const generic = nameLower !== '' && isGenericName(nameLower, generics)
  const catalogued = nameLower !== '' && known.has(nameLower)
  if (lookUp && nameLower !== '' && !generic && !catalogued && enumerated) {
    entry.kind = 'unknown'
    problems.push({
      from: entry.nameFrom,
      to: entry.nameFrom + entry.name.length,
      message: `"${entry.name}" is not in this machine's font list. It is still written, and the browser will fall back to whatever comes after it.`,
      code: 'unknown-family',
      severity: 'warning',
    })
  } else if (generic) {
    entry.kind = 'generic'
  }
  return { entry, problems }
}

/**
 * Build the grammar for this plugin's font query.
 *
 * The returned value is a plain grammar: `analyze` is this file's parse, and the
 * rules, the completion source, the hover, and the decoration are all derived
 * from the machine description the host passes in. Nothing here holds state, so
 * a host may rebuild it whenever the catalogue changes — and the editor
 * re-resolves it in place on `refresh()`, which is how a list that arrives late
 * grows without the undo history being thrown away.
 *
 * @param options - the machine's catalogue, its faces, and the shipped weight.
 * @returns a grammar that paints, completes, diagnoses, and explains the
 *   language.
 */
export function dshFontQueryGrammar(options = {}) {
  const CATALOGUE = options.catalogue ?? []
  const COMMON = options.commonFamilies ?? COMMON_FAMILIES
  const GENERICS = options.genericFamilies ?? GENERIC_FAMILIES
  const STYLES = options.styles ?? {}
  const ENUMERATED = options.enumerated === true
  const SHIPPED_WEIGHT = options.shippedWeight
  const PHRASE_WORDS = options.phraseWords ?? 4

  /** The lowercase catalogue, which is what every lookup folds against. */
  const KNOWN = new Set(CATALOGUE.map((family) => String(family).toLowerCase()))
  /** The suggestion space: the catalogue when there is one, plus the curated list. */
  const SUGGESTION_SPACE = [...new Set([...CATALOGUE, ...COMMON, ...GENERICS])]
  /** Every weight word, as a literal alternation, for the lexical weight rule. */
  const WEIGHT_ALTERNATION = Object.keys(WEIGHT_WORDS).join('|')

  /** The families that explain themselves through hover and complete by name. */
  const FAMILY_VOCAB = defineVocabulary({
    id: 'family',
    words: SUGGESTION_SPACE,
    scope: SCOPE.family,
    format: quoteFamily,
  })

  const GENERIC_VOCAB = defineVocabulary({
    id: 'generic',
    words: GENERICS,
    scope: SCOPE.generic,
    docs: Object.fromEntries(
      GENERICS.map((name) => [
        name,
        {
          detail: 'a generic CSS family',
          body: 'Always valid, and only useful at the end of the list: it is what the browser falls back to when nothing before it resolves.',
        },
      ]),
    ),
  })

  // There is deliberately no `words` rule for the weights. A weight is only a
  // weight in the LAST position of an entry — the same word is part of a family
  // name anywhere else — and a vocabulary matches wherever it finds a member.

  return defineGrammar({
    id: 'dsh-font-query',
    name: 'dsh-font font query',

    // A hyphen belongs to a name (`-apple-system`; `Helvetica Neue` has spaces and
    // is reached by the phrase rule instead), and `.` deliberately does not: no
    // family name in this vocabulary contains one, and leaving it out keeps a
    // stray `Inter.` from being read as a single unknown name.
    wordChars: /[\p{L}\p{N}_-]/u,

    rules: [
      // ── quoted names, before anything can split them ───────────────────
      {
        kind: 'match',
        pattern: /"[^"\n]*"|'[^'\n]*'/,
        // The scope is decided by what is INSIDE the quotes: a quoted generic is
        // still a generic, and a quoted name the machine does not have is still
        // worth painting as unknown.
        scope: (match) => quotedScope(match.text, KNOWN, GENERICS, ENUMERATED),
      },
      {
        kind: 'match',
        pattern: /["'][^\n]*/,
        scope: SCOPE.unclosed,
      },

      { kind: 'match', scope: SCOPE.separator, pattern: /,/ },

      // ── a weight word, but only where a weight may stand ──────────────
      // A weight is the LAST word of an entry, so the rule looks ahead for a
      // comma or the end of the line. Without that lookahead `Book` in
      // `Book Antiqua` would be painted as a weight. `prevNot` stops it matching
      // the tail of a longer word.
      //
      // The scope is decided from the ANALYSIS rather than from the characters,
      // which is the one place this grammar needs that: `weight` and
      // `weight.missing` are the same word, and only the machine knows which one
      // it is. A rule may look at `match.state` precisely so that a semantic
      // judgement does not have to become a second highlighter.
      {
        kind: 'match',
        pattern: new RegExp(`(?:${WEIGHT_ALTERNATION})(?=\\s*(?:,|$))`, 'im'),
        when: { prevNot: '\\w' },
        scope: (match) => {
          const state = match.state
          if (state.weight === undefined || state.effective < 0) return SCOPE.weight
          const family = state.families[state.effective] ?? ''
          const faces = faceWeights(lookupStyles(STYLES, family))
          // An unread face list means "unknown", never "absent".
          if (faces.length === 0 || faces.includes(state.weight)) return SCOPE.weight
          return SCOPE.weightMissing
        },
      },

      // ── the catalogue, longest phrase first ──────────────────────────
      // The generics come first because they are ALSO in the suggestion space,
      // and a generic painted as an installed family would say the wrong thing
      // about a word whose whole point is that it names no particular font.
      { kind: 'words', words: GENERIC_VOCAB },
      {
        kind: 'words',
        words: FAMILY_VOCAB,
        phrase: { max: PHRASE_WORDS },
      },

      // ── anything else is a name the reader has not seen ──────────────
      // `unknown` when the catalogue is authoritative, because then the browser
      // really will fall through; plain `family` when it is only a suggestion
      // list, because the parser has no business doubting the user.
      {
        kind: 'match',
        pattern: /[^\s,]+/,
        scope: ENUMERATED ? SCOPE.unknown : SCOPE.family,
      },
    ],

    fallbackScope: 'text',

    // ── what the query means ──────────────────────────────────────────────
    analyze: (text) => {
      const entries = []
      const problems = []
      for (const bounds of splitQueryEntries(text)) {
        const read = readEntry(text, bounds, KNOWN, GENERICS, ENUMERATED)
        entries.push(read.entry)
        problems.push(...read.problems)
      }

      const families = []
      let weight
      let weightWord
      let sawWeight = false
      for (const entry of entries) {
        if (entry.name.trim() !== '') families.push(entry.name.trim())
        if (entry.word !== undefined) {
          if (!sawWeight) {
            sawWeight = true
            weight = WEIGHT_WORDS[entry.word]
            weightWord = entry.word
          } else {
            problems.push({
              from: entry.wordFrom,
              to: entry.wordTo,
              message: `The weight is stated more than once. The first one is used and this "${entry.word}" is ignored.`,
              code: 'duplicate-weight',
              severity: 'warning',
            })
          }
        }
      }

      // ── the family that is actually in effect ───────────────────────────
      // With a catalogue read from the machine the first INSTALLED family wins,
      // because that is the one the browser will paint with. Without one the
      // catalogue is only a suggestion list, so the first entry stands.
      let effective = -1
      if (families.length > 0) {
        if (!ENUMERATED) {
          effective = 0
        } else {
          for (let index = 0; index < families.length; index += 1) {
            const lower = (families[index] ?? '').toLowerCase()
            if (isGenericName(lower, GENERICS) || KNOWN.has(lower)) {
              effective = index
              break
            }
          }
        }
      }

      // ── a weight the effective family does not have ──────────────────────
      // Only reported when that family's faces are actually known: an empty face
      // list means "not read", never "not installed".
      if (weight !== undefined && effective >= 0) {
        const family = families[effective] ?? ''
        const faces = faceWeights(lookupStyles(STYLES, family))
        if (faces.length > 0 && !faces.includes(weight)) {
          const entry = entries.find((candidate) => candidate.word !== undefined)
          if (entry !== undefined) {
            problems.push({
              from: entry.wordFrom,
              to: entry.wordTo,
              message: `"${family}" has no ${String(weight)} face, so the browser will synthesise one. It does have ${faces.join(', ')}.`,
              code: 'missing-weight',
              severity: 'warning',
            })
          }
        }
      }

      // A list with no generic tail is a list with nothing to fall back to. The
      // note belongs to the document rather than to a character, which is why its
      // range is empty and sits at the end: underlining an entry to say the LIST
      // is incomplete would put a squiggle on text that is perfectly correct, and
      // a diagnostic outranks a description in a tooltip, so it would also hide
      // what that entry has to say about itself.
      if (
        families.length > 0 &&
        !families.some((family) => isGenericName(family.toLowerCase(), GENERICS))
      ) {
        problems.push({
          from: text.length,
          to: text.length,
          message:
            'No generic family at the end, so a name that fails to resolve has nothing to fall back to. Adding one, such as `sans-serif`, is free.',
          code: 'no-generic-fallback',
          severity: 'info',
        })
      }

      return { entries, families, effective, weight, weightWord, problems }
    },

    validate: (context) => {
      for (const problem of context.state.problems) {
        context.report({
          from: problem.from,
          to: problem.to,
          message: problem.message,
          code: problem.code,
          severity: problem.severity,
        })
      }
    },

    // ── the family in effect, marked rather than recoloured ───────────────
    // It is a decoration and not a scope because it depends on the machine, not
    // on the characters: the same text means something else on a computer with
    // different fonts, and re-lexing the document whenever the catalogue changed
    // would be the wrong shape of work.
    decorate: (_text, state) => {
      const decorations = []
      if (state.effective < 0) return decorations
      const family = state.families[state.effective] ?? ''
      const target = state.entries.find((candidate) => candidate.name.trim() === family)
      if (target !== undefined) {
        decorations.push({
          from: target.nameFrom,
          to: target.nameFrom + target.name.length,
          kind: 'effective',
          title: `in effect: ${family}`,
        })
      }
      return decorations
    },

    // ── what can come next ────────────────────────────────────────────────
    compose: [
      {
        id: 'family',
        // The whole query is entries, so this source is always eligible; the
        // entry under the caret decides what it replaces.
        when: () => true,
        range: (context) => entryRange(context.state, context.caret),
        items: (context) => {
          const entry = entryAt(context.state.entries, context.caret)
          const core = entry?.core ?? ''
          const carried = entry?.word
          // The needle is the FAMILY part of the entry: a weight word the entry
          // already carries would otherwise make `"Geist Mono" medium` match no
          // family at all.
          const inner = unquote(core)
          // The entry as WRITTEN, which is not the same question as what it
          // names. The list is filtered by the text inside the completion range,
          // and that text is the raw entry — so a quoted family is searched for
          // with its quotes, and a row that spells the family without them
          // matches no needle at all. Rows therefore carry a filter text in the
          // spelling the entry is written in, while their label and their insert
          // stay canonical: `"Geist Mono" b` is filtered by `"Geist Mono" bold`
          // and still reads and inserts as the family plus its weight.
          //
          // The CHARACTER matters as much as the fact. A family may be opened
          // with either quote, and the needle carries whichever the user typed, so
          // writing the serializer's `"` here left every single-quoted entry
          // matching nothing at all — the same empty list, one spelling further
          // out. The entry's own character is used; the label and the insert are
          // free to ignore it, because the plugin still writes `"` itself.
          const quote = entry?.quoted === true ? core.charAt(0) : ''
          const asWritten = (name) => (quote === '' ? name : quote + name + quote)
          // A quoted entry is the case slicing cannot solve. The reader stopped
          // the family at the closing quote, and no cut of the raw core recovers
          // that boundary: the quotes stay on, so `"Geist Mono"` is looked up as
          // a family and matches nothing. That is how the canonical spelling —
          // `"Geist Mono" medium`, which is what the serializer writes for every
          // multi-word family — lost its weight rows while the bare spelling kept
          // them. The reader already resolved it, so ask the reader; an unclosed
          // quote has nothing to ask it about, and keeps the text as typed so the
          // "as typed" row still matches it exactly.
          const needle =
            entry?.closed === true
              ? entry.name.trim()
              : carried === undefined
                ? inner.trim()
                : inner.slice(0, -carried.length).trim()
          const exact = findExact(SUGGESTION_SPACE, needle)
          // What the caret has already spelled, with any weight word still to
          // come left out. This is what makes `Geist Mono b` offer Geist Mono's
          // weights: the entry as a whole is not a family name, but the part
          // before the word being typed is. Without this fallback a weight
          // becomes unreachable the moment its first letter is typed.
          const headFrom = entry?.coreFrom ?? context.word.from
          const head = unquote(
            context.text.slice(headFrom, Math.max(context.word.from, headFrom)),
          ).trim()
          // Where the caret sits decides whether a pick replaces the entry or is
          // inserted ahead of it. A caret at the very start of a COMPLETE entry is
          // a boundary, not an edit: the user put it there to place another family
          // in front, which is how a fallback stays a fallback.
          const atBoundary =
            entry !== undefined && context.caret <= entry.coreFrom && exact !== undefined

          const familyInEntry = exact ?? findExact(SUGGESTION_SPACE, head)
          // Past the family name the user is reaching for a weight (`Geist Mono b`
          // → Bold); inside the name they are still spelling it out, so the family
          // list leads and never fills with weights while a name is half-written.
          const atFamilyEnd = entry === undefined || context.caret >= entry.wordFrom

          // A weight is only offered once the entry names a family.
          const weightRows = []
          if (familyInEntry !== undefined && !atBoundary && atFamilyEnd) {
            const detected = faceWeights(lookupStyles(STYLES, familyInEntry))
            const pool = detected.length > 0 ? detected : [...FONT_WEIGHTS]
            const typedWord = context.word.prefix.toLowerCase()
            for (const value of pool) {
              const word = weightWord(value)
              if (typedWord !== '' && !word.startsWith(typedWord)) continue
              weightRows.push({
                label: `${familyInEntry} ${word}`,
                filterText: `${asWritten(familyInEntry)} ${word}`,
                insert:
                  quoteFamily(familyInEntry) + (value === SHIPPED_WEIGHT ? '' : ` ${word}`),
                kind: 'weight',
                detail: `font-weight ${String(value)}`,
                documentation:
                  value === SHIPPED_WEIGHT
                    ? 'The weight this axis already uses, so picking it takes the word away rather than spelling out a value nobody chose.'
                    : undefined,
                // A weight's position is decided by the SCALE and not by the
                // length of its label, which is what the zero-padded key is for:
                // without it the shortest word would lead, so `bold` would sit
                // above the shipped `regular` and the list would look shuffled.
                // The weight the entry already states outranks all of them, so an
                // Enter that accepts the top row re-applies what is written.
                sortText: word === carried ? '0' : `1${String(value).padStart(3, '0')}`,
              })
            }
          }

          const familyRows = []
          for (const name of SUGGESTION_SPACE) {
            const generic = isGenericName(name.toLowerCase(), GENERICS)
            familyRows.push({
              label: name,
              // The family alone, in the entry's spelling — never with the carried
              // weight word appended. The needle is the whole entry, so a family
              // row beside a completed weight would match it twice and put two
              // rows with the same insert in the list.
              filterText: asWritten(name),
              // A completion never drops a weight the entry already states: the
              // word travels with the pick, so swapping the family does not
              // quietly reset the weight.
              insert: quoteFamily(name) + (carried === undefined ? '' : ` ${carried}`),
              mode: atBoundary ? 'before' : 'replace',
              // A comma invites the next fallback. Only after a family, never
              // after a weight, which completes the entry instead of starting one.
              append: atBoundary || lastEntry(context.state, context.caret) ? ', ' : '',
              kind: generic ? 'generic' : 'family',
              detail: generic
                ? 'generic family'
                : KNOWN.has(name.toLowerCase())
                  ? 'installed'
                  : 'suggested',
              // After the weights when weights lead, which is the whole reason a
              // grammar gets to name the group: `2` sorts above `1xxx` and below
              // `0`.
              sortText: weightRows.length > 0 ? '2' : '0',
            })
          }

          const rows = weightRows.length > 0 ? [...weightRows, ...familyRows] : familyRows
          // The entry exactly as typed, so a name nobody catalogued can still be
          // completed to itself rather than being impossible to accept.
          if (needle !== '' && exact === undefined && !isGenericName(needle.toLowerCase(), GENERICS)) {
            rows.push({
              label: inner,
              filterText: quote === '' ? inner : core,
              insert: inner,
              kind: 'custom',
              detail: 'as typed',
              documentation:
                'Written exactly as it stands. A name the browser does not have is still a valid declaration: it is what lets a stack work on a machine this one cannot see.',
              sortText: '3',
            })
          }
          return rows
        },
      },
    ],

    // ── what a thing is ───────────────────────────────────────────────────
    describe: (context) => {
      const token = context.token
      if (token === undefined) return undefined
      const state = context.state
      const entry = entryAt(state.entries, context.offset)

      if (token.scope === SCOPE.separator) return undefined

      if (token.scope === SCOPE.weight || token.scope === SCOPE.weightMissing) {
        const word = token.text.toLowerCase()
        const value = WEIGHT_WORDS[word]
        const family = state.effective >= 0 ? state.families[state.effective] : undefined
        if (value === undefined) return { title: token.text }
        const faces = family === undefined ? [] : faceWeights(lookupStyles(STYLES, family))
        return {
          title: `${word} — font-weight ${String(value)}`,
          detail:
            entry?.name === ''
              ? 'applies to the whole axis'
              : `applies to ${family ?? 'the first family'}`,
          body:
            faces.length === 0
              ? `${family ?? 'This family'} was not read, so whether it has a ${String(value)} face is unknown.`
              : faces.includes(value)
                ? `${family ?? 'This family'} has this face.`
                : `${family ?? 'This family'} has no ${String(value)} face, so the browser will synthesise one.`,
        }
      }

      if (token.scope === SCOPE.generic) {
        return {
          title: token.text,
          detail: 'a generic CSS family',
          body: 'Always valid, and only useful at the end of the list: it is what the browser falls back to when nothing before it resolves.',
        }
      }

      if (token.scope === SCOPE.unclosed) {
        return {
          title: token.text,
          detail: 'unclosed quote',
          body: 'The closing quote is missing, so this and everything after it are read as one family name. A font family containing a quote character has to be written with the other quote style, because backslash escapes are deliberately not interpreted.',
        }
      }

      if (entry !== undefined && entry.kind === 'unknown') {
        return {
          title: entry.name,
          detail: 'not installed here',
          body: 'Still a valid declaration: it is written to the setting, and the browser falls through to the next family in the list when it cannot resolve. Reordering it to the end of the list is what the fallbacks are for.',
        }
      }

      const entryDoc = FAMILY_VOCAB.entryFor(token.text)
      const installed = KNOWN.has(token.text.toLowerCase())
      const faces = faceWeights(lookupStyles(STYLES, token.text))
      return {
        title: token.text,
        detail: installed ? 'installed' : 'not read on this machine',
        body:
          entryDoc?.body ??
          (faces.length > 0
            ? `Faces read from this machine: ${faces.join(', ')}.`
            : 'This family has no faces recorded, so its weights are unknown rather than absent.'),
      }
    },
  })
}
