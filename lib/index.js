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
 * Durable font preferences. Every field defaults to the shipped value, so an
 * empty (or absent) `ui-font` section resolves to "no customization".
 *
 * The schema is the wire contract: the settings domain validates every write
 * from the Settings row against it, and the configuration surface renders it.
 */
export const FontSettingsSchema = z.object({
  [UI_FONT_FAMILY_FIELD]: z.string().default(DEFAULT_UI_FONT_FAMILY),
  [CODE_FONT_FAMILY_FIELD]: z.string().default(DEFAULT_CODE_FONT_FAMILY),
  [UI_FONT_SCALE_FIELD]: z
    .number()
    .min(UI_FONT_SCALE_MIN)
    .max(UI_FONT_SCALE_MAX)
    .default(1),
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
})

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
 * plugin runs: the interface scale and the conversation text size. Families are
 * handled separately (see {@link fontBootstrapScript}) because the design
 * system resolves them through `var()` chains the shell's own `body` rule
 * already reads.
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

  return [
    '/* dsh-font: pre-paint variables and interface scale */',
    'html body{',
    `--dsh-font-ui-scale:${String(uiScale)};`,
    `--dsh-font-content-size:${String(contentSize)}px;`,
    `--dsh-font-code-size:${String(codeSize)}px;`,
    '}',
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
 * Read the registered `ui-font` section, or the schema defaults when the
 * settings provider is absent or the section is unreadable.
 * @param ctx - host context.
 * @returns a complete settings section.
 */
function readSection(ctx) {
  const fallback = {
    [UI_FONT_FAMILY_FIELD]: DEFAULT_UI_FONT_FAMILY,
    [CODE_FONT_FAMILY_FIELD]: DEFAULT_CODE_FONT_FAMILY,
    [UI_FONT_SCALE_FIELD]: 1,
    [CONTENT_FONT_SIZE_FIELD]: 14,
    [CODE_FONT_SIZE_FIELD]: 12,
  }
  const settings = ctx.get('settings')
  if (settings === null || typeof settings !== 'object') return fallback
  if (typeof settings.get !== 'function') return fallback
  const section = settings.get(FONT_SETTINGS_NAMESPACE)
  if (section === null || typeof section !== 'object') return fallback
  return { ...fallback, ...section }
}

/**
 * Host plugin body: register the durable namespace when the optional settings
 * provider is composed, and answer every index-injection collection with the
 * current pre-paint bootstrap.
 * @param ctx - host context that may acquire the settings service.
 */
export function apply(ctx) {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(FONT_SETTINGS_NAMESPACE, FontSettingsSchema)
  })

  ctx.on('webserver/index-inject', (table) => {
    table.push(fontInjection(readSection(ctx)))
  })
}
