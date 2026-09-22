/**
 * Host half of `dsh-font`.
 *
 * A dsh Web profile bundle has two halves. This file is the Node half: it owns
 * the durable `ui-font` settings namespace (so every value the Settings row
 * writes survives a restart inside `$DSH_HOME/settings.yaml`) and it
 * contributes a pre-paint `<style>` row to the served index document, so the
 * chosen families and sizes apply to the very first frame instead of flashing
 * the shipped defaults while the browser plugin tree activates.
 *
 * The browser half lives in `./client` (`src/client.js` -> `lib/client.js`) and
 * owns the actual presentation: it stacks the families onto the design system's
 * font tokens through the theme service and registers the Settings row.
 *
 * @module dsh-font
 */

import z from '@deepseek-ai/schemastery'

/**
 * Settings namespace owned by this plugin. Lowercase-hyphenated, matching the
 * sibling `ui-theme` namespace the Web surface already ships.
 */
export const FONT_SETTINGS_NAMESPACE = 'ui-font'

/** Field: CSS font-family list for interface (non-code) text. */
export const UI_FONT_FAMILY_FIELD = 'uiFontFamily'
/** Field: CSS font-family list for code, terminal, and monospace text. */
export const CODE_FONT_FAMILY_FIELD = 'codeFontFamily'
/** Field: numeric `font-weight` for code, terminal, and monospace text. */
export const CODE_FONT_WEIGHT_FIELD = 'codeFontWeight'
/**
 * Field: numeric `font-weight` for interface text.
 *
 * Unlike the code weight this one is opted into: `400` — the value every
 * untouched install resolves to — is the design system's own base, so the
 * plugin emits no weight rule at all for it. Anything else is written as an
 * explicit override, which is why "not set" and "set to 400" are the same
 * state rather than two.
 */
export const UI_FONT_WEIGHT_FIELD = 'uiFontWeight'
/** Field: scale applied to every interface font size, as a unitless number. */
export const UI_FONT_SCALE_FIELD = 'uiFontScale'
/** Field: conversation content font size in px (owns `--dsh-content-font-size`). */
export const CONTENT_FONT_SIZE_FIELD = 'contentFontSize'
/** Field: conversation code font size in px. */
export const CODE_FONT_SIZE_FIELD = 'codeFontSize'

/** Shipped interface family, mirroring `ui-theme`'s `--dsw-font-family`. */
export const DEFAULT_UI_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif'
/** Shipped code family, mirroring `ui-theme`'s `--ds-font-family-code`. */
export const DEFAULT_CODE_FONT_FAMILY =
  '"SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, Courier, "PingFang SC", "Microsoft YaHei"'

/**
 * Weights the code font may be set to.
 *
 * The design system ships **no** weight token — every `font: …` declaration in
 * the interface is a literal, and the code ladder is literally `400`. So the
 * weight is delivered as a `font-weight` override the plugin owns, and it is a
 * closed list rather than a free number: a `font-weight` a family does not have
 * is synthesized by the browser (faux-bold), and offering that silently would
 * be a poor default. The list is the CSS Fonts keyword scale, which is also the
 * scale the Local Font Access API reports individual faces on.
 *
 * Kept in sync by hand with the browser half's table in `src/client.js`; the
 * two halves are separate bundles and share no module.
 */
export const FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900]

/**
 * The shipped code weight. Matches the design system's own literal (`400` in
 * every `--dsw-font-markdown-code*` token), so "no customization" is the
 * default and an untouched install paints exactly what it painted before.
 */
export const DEFAULT_CODE_FONT_WEIGHT = 400

/**
 * The shipped interface weight. Identical to {@link DEFAULT_CODE_FONT_WEIGHT}
 * for the same reason: it is what the shipped interface already computes, so an
 * untouched install paints exactly what it painted before this field existed.
 */
export const DEFAULT_UI_FONT_WEIGHT = 400

/** Accepted interface scale range (1 = the shipped sizes). */
export const UI_FONT_SCALE_MIN = 0.75
/** Accepted interface scale range upper bound. */
export const UI_FONT_SCALE_MAX = 1.5
/** Accepted conversation content font size range in px. */
export const CONTENT_FONT_SIZE_MIN = 12
/** Accepted conversation content font size range in px. */
export const CONTENT_FONT_SIZE_MAX = 20
/** Accepted code font size range in px. */
export const CODE_FONT_SIZE_MIN = 10
/** Accepted code font size range in px. */
export const CODE_FONT_SIZE_MAX = 20

/** The one stylesheet id the pre-paint bootstrap and the browser half share. */
export const FONT_STYLE_ID = 'dsh-font/variables'

/**
 * Durable font preferences, as individual fields. Every field defaults to the
 * shipped value, so an empty (or absent) section resolves to "no customization".
 *
 * The pair is deliberate: the 0.1.5-rc.x settings API takes a whole schema for a
 * registered namespace, and the 0.1.7+ configuration model exposes only fields
 * marked `.volatile()`. Both are built from this one description, so the two
 * lines cannot drift into validating different values.
 */
const FontSettingsFields = {
  [UI_FONT_FAMILY_FIELD]: z.string().default(DEFAULT_UI_FONT_FAMILY),
  [CODE_FONT_FAMILY_FIELD]: z.string().default(DEFAULT_CODE_FONT_FAMILY),
  [CODE_FONT_WEIGHT_FIELD]: z.union(FONT_WEIGHTS).default(DEFAULT_CODE_FONT_WEIGHT),
  [UI_FONT_WEIGHT_FIELD]: z.union(FONT_WEIGHTS).default(DEFAULT_UI_FONT_WEIGHT),
  [UI_FONT_SCALE_FIELD]: z.number().min(UI_FONT_SCALE_MIN).max(UI_FONT_SCALE_MAX).default(1),
  [CONTENT_FONT_SIZE_FIELD]: z
    .number()
    .step(1)
    .min(CONTENT_FONT_SIZE_MIN)
    .max(CONTENT_FONT_SIZE_MAX)
    .default(14),
  [CODE_FONT_SIZE_FIELD]: z
    .number()
    .step(1)
    .min(CODE_FONT_SIZE_MIN)
    .max(CODE_FONT_SIZE_MAX)
    .default(12),
}

/**
 * The durable section registered on the 0.1.5-rc.x settings API.
 *
 * The schema is the wire contract there: the settings domain validates every
 * write from the Settings row against it.
 */
export const FontSettingsSchema = z.object(FontSettingsFields)

/**
 * Mark one field as editable configuration, on whichever schema library the
 * profile resolves.
 *
 * The 0.1.7 configuration model exposes only fields marked volatile, and the copy
 * of `@deepseek-ai/schemastery` a profile hoists may predate `.volatile()`: the
 * 0.1.5-rc.x line ships 3.18.2, where the method does not exist, and 0.1.7 ships
 * 3.18.3, where it does. That hoisted copy is what this module's own import
 * resolves, so calling `.volatile()` is both a TypeError risk on one line and — if
 * guarded away, as it first was — a silent way to leave every field unmarked. An
 * unmarked field is invisible to the configuration editor, and dsh's own import of
 * a legacy `settings.yaml` section into this entry is refused because the entry
 * then has no volatile fields at all.
 *
 * `extra('volatile', true)` is the primitive both versions have — 3.18.3's
 * `.volatile()` is exactly that call — so volatility is set through it, with the
 * public method kept as a fallback for a library that drops the primitive.
 *
 * @param schema - the field schema.
 * @returns the field, marked volatile.
 */
const editableField = (schema) => {
  if (typeof schema.extra === 'function') return schema.extra('volatile', true)
  if (typeof schema.volatile === 'function') return schema.volatile()
  return schema
}

/**
 * The same preferences as a dsh 0.1.7+ configuration form.
 *
 * That line keys settings by Loader entry id — this bundle's patch inserts the
 * entry as `ui-font`, so the namespace is the same string both lines use — and
 * exposes only the fields marked `.volatile()` to the configuration editor. The
 * entry's Config is the durable section there, which is why this is exported
 * rather than registered.
 */
export const Config = z.object(
  Object.fromEntries(
    Object.entries(FontSettingsFields).map(([field, schema]) => [field, editableField(schema)]),
  ),
)

/** The interface font sizes the shipped components hard-code, in px. */
const UI_TEXT_STEPS = [11, 12, 13, 14, 16, 20, 24]

/**
 * The interface-scale rules: every hard-coded UI text size is re-derived from
 * the user's scale. Sizes outside {@link UI_TEXT_STEPS} (display headings, the
 * SVG labels baked into file-type icons) are deliberately left alone.
 *
 * @param scale - unitless multiplier, 1 = shipped sizes.
 * @returns one CSS declaration block body.
 */
function uiScaleRules(scale) {
  return UI_TEXT_STEPS.map(
    (step) =>
      `font-size:calc(${step}px * var(--dsh-font-ui-scale,1)) !important`,
  ).join(';')
}

/**
 * Build the pre-paint stylesheet for one resolved settings section.
 *
 * This is the subset of the browser half's sheet that must exist before any
 * plugin runs: the interface scale and the conversation text size. Families and
 * the code weight are handled separately (see {@link fontBootstrapScript})
 * because the design system resolves them through the token chain.
 *
 * Written as a `<style>` element rather than inline custom properties because
 * `ui-layout`'s theme presenter owns `document.body.style` and rewrites the
 * token set on every theme change; a stylesheet cannot be clobbered by it.
 * The selectors are `html body ...` so they outrank the shipped component
 * rules regardless of stylesheet order.
 *
 * @param section - resolved `ui-font` value (validated or schema-defaulted).
 * @returns the complete stylesheet text.
 */
export function fontStyleSheet(section) {
  const uiScale = section[UI_FONT_SCALE_FIELD]
  const contentSize = section[CONTENT_FONT_SIZE_FIELD]
  const codeSize = section[CODE_FONT_SIZE_FIELD]
  const codeWeight = section[CODE_FONT_WEIGHT_FIELD]
  const uiWeight = section[UI_FONT_WEIGHT_FIELD]

  // The interface weight is the one field that is *not* always emitted: at the
  // shipped 400 the rule would be a no-op (`normal` inherits as 400 anyway), and
  // leaving it out keeps a default install's first frame byte-identical to the
  // shipped one. The browser half repeats this rule in its own — larger — sheet,
  // which replaces this one the moment the plugin activates; both exist so the
  // weight cannot flash between the two.
  const uiWeightRules =
    uiWeight === undefined || uiWeight === DEFAULT_UI_FONT_WEIGHT
      ? []
      : [`html body{font-weight:${String(uiWeight)}}`]

  return [
    '/* dsh-font: pre-paint variables and interface scale */',
    'html body{',
    `--dsh-font-ui-scale:${String(uiScale)};`,
    `--dsh-font-content-size:${String(contentSize)}px;`,
    `--dsh-font-code-size:${String(codeSize)}px;`,
    `--dsh-font-code-weight:${String(codeWeight)};`,
    '}',
    ...uiWeightRules,
    'html body,html body *{',
    uiScaleRules(uiScale),
    '}',
  ].join('\n')
}

/**
 * Escape a stylesheet for embedding inside an inline `<script>` element.
 * @param text - raw stylesheet text.
 * @returns the text safe to place in a script body.
 */
function escapeForScript(text) {
  return text.replaceAll('</', '<\\/')
}

/**
 * The pre-paint bootstrap: inject the stylesheet, then mirror the two family
 * values onto the design system's own tokens so pre-existing CSS that reads
 * `var(--dsw-font-family)` (the shell's `body` rule, for instance) agrees with
 * the hard-coded variable set before the browser half ever runs.
 *
 * @param section - resolved `ui-font` value.
 * @returns inline script text.
 */
export function fontBootstrapScript(section) {
  const uiFamily = JSON.stringify(section[UI_FONT_FAMILY_FIELD])
  const codeFamily = JSON.stringify(section[CODE_FONT_FAMILY_FIELD])
  const codeWeight = JSON.stringify(String(section[CODE_FONT_WEIGHT_FIELD]))
  // Keep the stylesheet after the user-controlled family strings so the
  // `</`-escaping cannot be defeated by a family value that itself contains a
  // script-closing sequence.
  const css = escapeForScript(fontStyleSheet(section))

  return `(() => {
  try {
    const css = ${JSON.stringify(css)}
    const existing = document.getElementById(${JSON.stringify(FONT_STYLE_ID)})
    const tag = existing !== null ? existing : document.createElement('style')
    if (existing === null) {
      tag.id = ${JSON.stringify(FONT_STYLE_ID)}
      tag.dataset.plugin = 'dsh-font'
      const parent = document.head || document.documentElement
      parent.appendChild(tag)
    }
    tag.textContent = css
    const root = document.documentElement.style
    root.setProperty('--dsw-font-family', ${uiFamily})
    root.setProperty('--ds-font-family-code', ${codeFamily})
    root.setProperty('--dsh-font-code-weight', ${codeWeight})
  } catch (error) {
    console.warn('dsh-font: pre-paint bootstrap failed', error)
  }
})()`
}

/**
 * The bootstrap as a webserver index-injection row.
 * @param section - resolved `ui-font` value.
 * @returns the head script row.
 */
export function fontInjection(section) {
  return {
    kind: 'script',
    placement: 'head',
    text: fontBootstrapScript(section),
  }
}

/**
 * Read the section the settings provider holds under this namespace, if it holds
 * one at all. The 0.1.7 line has no such call: there the entry's own configuration
 * is the section, and it arrives as this plugin's second argument.
 * @param ctx - host context.
 * @returns the registered section, or undefined.
 */
function registeredSection(ctx) {
  const settings = ctx.get('settings')
  if (settings === null || typeof settings !== 'object') return undefined
  if (typeof settings.get !== 'function') return undefined
  const section = settings.get(FONT_SETTINGS_NAMESPACE)
  if (section === null || typeof section !== 'object') return undefined
  return section
}

/**
 * Resolve the durable font section from whichever line is running: the resolved
 * entry configuration (0.1.7+, where the entry's Config is the section), the
 * registered namespace (0.1.5-rc.x), or the shipped defaults.
 *
 * The registered section wins over the resolved configuration because on the line
 * that has it the configuration is only the schema's defaults; on the line where
 * the configuration carries the user's choices there is no registered section.
 *
 * @param ctx - host context.
 * @param config - resolved entry configuration, when the loader supplies one.
 * @returns a complete settings section.
 */
function readSection(ctx, config) {
  const fallback = {
    [UI_FONT_FAMILY_FIELD]: DEFAULT_UI_FONT_FAMILY,
    [CODE_FONT_FAMILY_FIELD]: DEFAULT_CODE_FONT_FAMILY,
    [CODE_FONT_WEIGHT_FIELD]: DEFAULT_CODE_FONT_WEIGHT,
    [UI_FONT_WEIGHT_FIELD]: DEFAULT_UI_FONT_WEIGHT,
    [UI_FONT_SCALE_FIELD]: 1,
    [CONTENT_FONT_SIZE_FIELD]: 14,
    [CODE_FONT_SIZE_FIELD]: 12,
  }
  const resolved = config !== null && typeof config === 'object' ? config : {}
  const registered = registeredSection(ctx)
  return { ...fallback, ...resolved, ...(registered ?? {}) }
}

/**
 * Host plugin body: make the durable section real on whichever settings line is
 * composed, and answer every index-injection collection with the current
 * pre-paint bootstrap.
 *
 * The two lines are named explicitly rather than probed for a version: the
 * 0.1.5-rc.x service exposes `register(namespace, schema)`, and the 0.1.7+
 * service carries the entry's own `Config` instead — this package ships its own
 * Settings row, so the generated page is turned off there. A service with
 * neither is reported, because the alternative is an opaque TypeError in the log
 * next to a boot audit that says nothing about a settings API change.
 *
 * @param ctx - host context that may acquire the settings service.
 * @param config - resolved entry configuration, on the line that has one.
 */
export function apply(ctx, config) {
  ctx.inject(['settings'], (settingsCtx) => {
    const settings = settingsCtx.settings
    if (typeof settings.register === 'function') {
      settings.register(FONT_SETTINGS_NAMESPACE, FontSettingsSchema)
      return
    }
    if (typeof settings.configure === 'function') {
      settingsCtx.effect(() => settings.configure({ auto: false }, ctx.fiber))
      return
    }
    settingsCtx.logger.error(
      `dsh-font: this dsh exposes neither settings.register() nor settings.configure(), so the ` +
        `durable "${FONT_SETTINGS_NAMESPACE}" section has nowhere to live and font choices cannot ` +
        'be saved. Pin dsh to 0.1.5-rc.x (latest/next), or upgrade @citisen/dsh-font.',
    )
  })

  ctx.on('webserver/index-inject', (table) => {
    table.push(fontInjection(readSection(ctx, config)))
  })
}
