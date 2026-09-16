window.__ModuleLoader__.load({
	id: "@citisen/dsh-font",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
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

		let _react = require("react");
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
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
const PLUGIN_ID = "@citisen/dsh-font"

/** Field names — must match the host schema in `lib/index.js`. */
const UI_FONT_FAMILY_FIELD = 'uiFontFamily'
const CODE_FONT_FAMILY_FIELD = 'codeFontFamily'
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

/** The interface text sizes the shipped components hard-code, in px. */
const UI_TEXT_STEPS = [11, 12, 13, 14, 16, 20, 24]

// ─── the font-family list: parse, serialize, discover ───────────────────────
//
// The stored value stays a plain CSS font-family string (that is what the host
// schema declares and what the theme token consumes), so this section is purely
// a presentation layer over it: parse the string into an ordered list for the
// chips, and serialize the chips back. No schema field is added, which also
// means an existing value keeps working untouched.

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
const FONT_DISCOVERY_CACHE_KEY = 'dsh-font:discovery'

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
  // would name a literal font instead of the generic family.
  if (/^[A-Za-z][\w-]*$/.test(name)) return name
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
 * Ask the browser for the real installed families.
 *
 * Chromium's Local Font Access API is the only way to enumerate actual fonts.
 * It is permission-gated, absent in Firefox and Safari, and — per the spec —
 * browsers are not obliged to return the complete list, so the result is a
 * supplement to the curated catalogue, never a replacement.
 * @returns installed family names, or undefined when unavailable or declined.
 */
async function queryInstalledFamilies() {
  if (typeof window === 'undefined') return undefined
  const query = window.queryLocalFonts
  if (typeof query !== 'function') return undefined
  try {
    const fonts = await query.call(window)
    const families = new Set()
    for (const font of fonts) {
      if (typeof font?.family === 'string' && font.family.trim() !== '') {
        families.add(font.family.trim())
      }
    }
    return [...families].sort((left, right) => left.localeCompare(right))
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
    return { families: parsed.families, enumerated: parsed.enumerated === true }
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
 * @returns `{ families, enumerated, measured }`.
 */
async function discoverFamilies() {
  const cached = readDiscoveryCache()
  if (cached !== undefined) return { ...cached, measured: true }

  const enumerated = await queryInstalledFamilies()
  if (enumerated !== undefined && enumerated.length > 0) {
    const families = [...new Set([...enumerated, ...COMMON_FAMILIES])].sort((left, right) =>
      left.localeCompare(right),
    )
    const result = { families, enumerated: true }
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
  const result = { families, enumerated: false }
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

/** Curated family presets, offered as one-click fills for both inputs. */
const UI_FAMILY_PRESETS = [
  { id: 'system', label: 'System', value: DEFAULT_UI_FONT_FAMILY },
  {
    id: 'inter',
    label: 'Inter',
    value: 'Inter, "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  },
  {
    id: 'plex',
    label: 'IBM Plex Sans',
    value: '"IBM Plex Sans", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  {
    id: 'noto',
    label: 'Noto Sans',
    value: '"Noto Sans", "Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif',
  },
]

/** Curated code-family presets. */
const CODE_FAMILY_PRESETS = [
  { id: 'system', label: 'System mono', value: DEFAULT_CODE_FONT_FAMILY },
  {
    id: 'jetbrains',
    label: 'JetBrains Mono',
    value: '"JetBrains Mono", "Fira Code", Consolas, monospace',
  },
  { id: 'fira', label: 'Fira Code', value: '"Fira Code", Consolas, monospace' },
  {
    id: 'cascadia',
    label: 'Cascadia Code',
    value: '"Cascadia Code", "Cascadia Mono", Consolas, monospace',
  },
  {
    id: 'maple',
    label: 'Maple Mono',
    value: '"Maple Mono", "JetBrains Mono", Consolas, monospace',
  },
  { id: 'mono', label: 'Generic mono', value: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
]

/** Row copy, keyed by locale. `zh` is the key-set source of truth. */
const zh = {
  'font.title': '字体',
  'font.description': '自定义界面与代码字体、字号，设置会保存到本机',
  'font.uiFamily': '界面字体',
  'font.uiFamilyHint': 'CSS font-family 列表，例如 Inter, "PingFang SC", sans-serif',
  'font.codeFamily': '代码字体',
  'font.codeFamilyHint': '用于代码块、行内代码与终端等宽文本',
  'font.uiScale': '界面字号',
  'font.uiScaleHint': '按比例缩放整个界面的文字大小',
  'font.contentSize': '会话正文字号',
  'font.contentSizeHint': '对话正文、标题与表格的字号',
  'font.codeSize': '代码字号',
  'font.codeSizeHint': '代码块与行内代码的字号',
  'font.unit': 'px',
  'font.reset': '恢复默认',
  'font.presets': '预设',
  'font.increase': '增大',
  'font.decrease': '减小',
  'font.add': '添加字体',
  'font.remove': '移除',
  'font.moveEarlier': '前移（也可拖动排序）',
  'font.moveLater': '后移（也可拖动排序）',
  'font.catalogEnumerated': '已读取本机字体',
  'font.catalogProbed': '仅列出探测到的常用字体',
  'font.genericWarning': '末尾缺少通用字体族（如 sans-serif），指定字体都缺失时可能回退到意外字体',
}

/** English dictionary, checked complete against the `zh` key set. */
const en = {
  'font.title': 'Fonts',
  'font.description':
    'Customize the interface and code fonts and sizes; values are saved on this machine',
  'font.uiFamily': 'Interface font',
  'font.uiFamilyHint': 'A CSS font-family list, e.g. Inter, "PingFang SC", sans-serif',
  'font.codeFamily': 'Code font',
  'font.codeFamilyHint': 'Used for code blocks, inline code, and monospace text',
  'font.uiScale': 'Interface text size',
  'font.uiScaleHint': 'Scales every interface text size proportionally',
  'font.contentSize': 'Conversation text size',
  'font.contentSizeHint': 'Size of message bodies, headings, and tables',
  'font.codeSize': 'Code text size',
  'font.codeSizeHint': 'Size of code blocks and inline code',
  'font.unit': 'px',
  'font.reset': 'Reset to defaults',
  'font.presets': 'Presets',
  'font.increase': 'Increase',
  'font.decrease': 'Decrease',
  'font.add': 'Add font',
  'font.remove': 'Remove',
  'font.moveEarlier': 'Move earlier (or drag to reorder)',
  'font.moveLater': 'Move later (or drag to reorder)',
  'font.catalogEnumerated': 'Read from this machine',
  'font.catalogProbed': 'Common fonts detected by probing',
  'font.genericWarning':
    'No generic family at the end (such as sans-serif), so a missing font may fall back unpredictably',
}

/** The stylesheet this plugin owns, keyed by the resolved settings section. */
function fontStyleSheet(section) {
  const scale = section[UI_FONT_SCALE_FIELD]
  const contentSize = section[CONTENT_FONT_SIZE_FIELD]
  const codeSize = section[CODE_FONT_SIZE_FIELD]

  const scaleRules = UI_TEXT_STEPS.map(
    (step) => `.dsh-font-size-${String(step)}{font-size:calc(${String(step)}px * var(--dsh-font-ui-scale,1)) !important}`,
  ).join('')

  return [
    '/* dsh-font: interface scale + conversation text sizes.',
    '   The scale is emitted as one utility class per hard-coded UI text size and',
    '   stamped onto every element by applyFonts(), so it is a deterministic',
    '   override that never inherits into a subtree. */',
    'html body{',
    `--dsh-font-ui-scale:${String(scale)};`,
    `--dsh-font-code-size:${String(codeSize)}px;`,
    // A CSS-side mirror of the content size. The authoritative declaration is
    // inline on `body` (written by applyFonts), because ui-layout's theme
    // presenter owns that one and an inline value outranks any stylesheet.
    `--dsh-font-conversation-size:${String(contentSize)}px;`,
    '}',
    scaleRules,
    '/* Conversation text sizes: absolute px, replacing the shipped 12..17px',
    '   ladder that ui-layout drives from the `ui-theme` namespace. This is the',
    '   size axis for conversation content; the scale above is the axis for the',
    '   surrounding interface, and the two never compose. */',
    'html body{',
    `--dsh-font-markdown-base:var(--dsh-font-conversation-size,14px) / calc(${String(contentSize)}px + 10px) var(--dsw-font-family) !important;`,
    `--dsh-font-markdown-h1:700 calc(${String(contentSize)}px + 7px) / calc(${String(contentSize)}px + 16px) var(--dsw-font-family) !important;`,
    `--dsh-font-markdown-h2:700 calc(${String(contentSize)}px + 5px) / calc(${String(contentSize)}px + 14px) var(--dsw-font-family) !important;`,
    `--dsh-font-markdown-h3:700 calc(${String(contentSize)}px + 4px) / calc(${String(contentSize)}px + 12px) var(--dsw-font-family) !important;`,
    `--dsh-font-markdown-h4:600 var(--dsh-font-conversation-size,14px) / calc(${String(contentSize)}px + 10px) var(--dsw-font-family) !important;`,
    `--dsh-font-markdown-table:calc(${String(contentSize)}px - 1px) / calc(${String(contentSize)}px + 9px) var(--dsw-font-family) !important;`,
    `--dsh-font-markdown-table-head:500 calc(${String(contentSize)}px - 1px) / calc(${String(contentSize)}px + 9px) var(--dsw-font-family) !important;`,
    '}',
    '/* Code text sizes, on their own axis. */',
    'html body{',
    `--dsw-font-markdown-code:var(--dsh-font-code-size,12px) / calc(var(--dsh-font-code-size,12px) + 7px) var(--ds-font-family-code) !important;`,
    `--dsw-font-markdown-code-font-size:var(--dsh-font-code-size,12px) !important;`,
    `--dsw-font-markdown-code-block:var(--dsh-font-code-size,12px) / calc(var(--dsh-font-code-size,12px) + 8px) var(--ds-font-family-code) !important;`,
    `--dsw-font-markdown-code-block-font-size:var(--dsh-font-code-size,12px) !important;`,
    `--dsw-font-markdown-code-block-small:calc(var(--dsh-font-code-size,12px) - 1px) / calc(var(--dsh-font-code-size,12px) + 5px) var(--ds-font-family-code) !important;`,
    `--dsw-font-markdown-code-block-small-font-size:calc(var(--dsh-font-code-size,12px) - 1px) !important;`,
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
  return _deepseek_ai_dsh_client_store.defineStore({
    init: () => ({
      uiFontFamily: DEFAULT_UI_FONT_FAMILY,
      codeFontFamily: DEFAULT_CODE_FONT_FAMILY,
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
  '.dsh-font-input{box-sizing:border-box;width:100%;height:32px;padding:0 10px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-module-platform);border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;font-family:inherit;font-size:13px;line-height:20px;outline:none}',
  '.dsh-font-input:focus{border-color:var(--dsw-alias-brand-primary)}',
  '.dsh-font-code{font-family:var(--ds-font-family-code)}',
  '.dsh-font-sliderRow{align-items:center;gap:10px;display:flex}',
  '.dsh-font-slider{flex:1;min-width:0;accent-color:var(--dsw-alias-brand-primary)}',
  '.dsh-font-stepper{background:var(--dsw-alias-bg-module-platform);border-radius:16px;justify-content:center;align-items:center;gap:2px;min-width:96px;height:32px;display:inline-flex;flex:none;padding:0 4px}',
  '.dsh-font-step{border:none;background:0 0;color:var(--dsw-alias-label-primary);cursor:pointer;width:20px;height:20px;border-radius:4px;justify-content:center;align-items:center;padding:0;display:inline-flex}',
  '.dsh-font-step:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-font-step:disabled{color:var(--dsw-alias-label-caption);cursor:default}',
  '.dsh-font-stepValue{text-align:center;min-width:32px;color:var(--dsw-alias-label-primary);font-size:13px;font-variant-numeric:tabular-nums;line-height:20px}',
  '.dsh-font-presets{flex-wrap:wrap;gap:6px;display:flex}',
  '.dsh-font-chip{border:.5px solid var(--dsw-alias-border-l4);background:0 0;color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:12px;padding:3px 10px;font-family:inherit;font-size:11px;line-height:16px}',
  '.dsh-font-chip:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-font-chip[data-active="true"]{border-color:var(--dsw-static-neutral-bluish-400);color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-module-platform)}',
  '.dsh-font-reset{align-self:flex-start;border:.5px solid var(--dsw-alias-border-l4);background:0 0;color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:10px;padding:5px 12px;font-family:inherit;font-size:12px;line-height:18px}',
  '.dsh-font-reset:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '/* The family stack: ordered chips, the combobox, and the derived value. */',
  '.dsh-font-stack{flex-wrap:wrap;gap:6px;display:flex;min-height:22px;align-items:center}',
  '.dsh-font-stackEmpty{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
  '.dsh-font-token{align-items:center;gap:2px;background:var(--dsw-alias-bg-module-platform);border:.5px solid var(--dsw-alias-border-l4);border-radius:14px;padding:2px 4px 2px 10px;display:inline-flex;max-width:100%}',
  '.dsh-font-tokenText{color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.dsh-font-tokenActions{display:inline-flex;gap:1px;flex:none}',
  '.dsh-font-tokenButton{border:none;background:0 0;color:var(--dsw-alias-label-secondary);cursor:pointer;width:18px;height:18px;border-radius:9px;justify-content:center;align-items:center;padding:0;font-size:11px;line-height:1;display:inline-flex}',
  '.dsh-font-tokenButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  '.dsh-font-tokenButton:disabled{opacity:.3;cursor:default}',
  '.dsh-font-tokenRemove:hover:not(:disabled){color:var(--dsw-alias-state-error-primary)}',
  '.dsh-font-tokenDragging{opacity:.4}',
  '.dsh-font-tokenDrag{cursor:grab}',
  '.dsh-font-tokenDrag:active{cursor:grabbing}',
  '.dsh-font-combo{position:relative}',
  '.dsh-font-menu{position:absolute;z-index:20;left:0;right:0;top:calc(100% + 4px);max-height:240px;overflow-y:auto;margin:0;padding:4px;list-style:none;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l2);border-radius:10px;box-shadow:var(--dsw-elevation-panel)}',
  '.dsh-font-option{cursor:pointer;border-radius:6px;padding:5px 8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.dsh-font-optionActive{background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-font-optionCustom{color:var(--dsw-alias-label-secondary);border-top:.5px solid var(--dsw-alias-border-l2);border-radius:0 0 6px 6px}',
  '.dsh-font-optionName{font-family:inherit}',
  '.dsh-font-meta{flex-wrap:wrap;gap:8px;justify-content:space-between;display:flex}',
  '.dsh-font-warn{color:var(--dsw-alias-state-warn-primary);font-size:11px;line-height:16px}',
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
 * @param props - _react props.
 * @returns the field element.
 */
function Field({ label, value, hint, children }) {
  return _react.createElement(
    'div',
    { className: 'dsh-font-field' },
    _react.createElement(
      'div',
      { className: 'dsh-font-labelRow' },
      _react.createElement('span', { className: 'dsh-font-label' }, label),
      value === undefined
        ? null
        : _react.createElement('span', { className: 'dsh-font-value' }, value),
    ),
    children,
    hint === undefined
      ? null
      : _react.createElement('div', { className: 'dsh-font-hint' }, hint),
  )
}

/** Cap the suggestion list: rendering a 2000-entry catalogue is needless work. */
const SUGGESTION_LIMIT = 60

/**
 * The combobox's whole decision, as a pure function: which families to offer
 * for the current query, which one is highlighted, and whether the custom
 * "add what I typed" row applies.
 *
 * Keeping this out of the component is what makes the behaviour testable
 * without a _react runtime — an interaction test that fakes hooks proves less
 * than a table test over this function does.
 *
 * @param families - the catalogue.
 * @param query - the current input text.
 * @param active - the highlighted index.
 * @returns the row to render.
 */
function comboboxView(families, query, active) {
  const typed = query.trim()
  const matches = rankFamilyMatches(families, typed)
  const visible = matches.slice(0, SUGGESTION_LIMIT)
  const exact = matches.some((family) => family.toLowerCase() === typed.toLowerCase())
  return {
    typed,
    visible,
    // Clamp, so a catalogue that shrank under the cursor cannot index past the
    // end and commit the wrong family.
    active: visible.length === 0 ? 0 : Math.min(Math.max(active, 0), visible.length - 1),
    /** The custom row: offered only for a non-empty, not-already-listed query. */
    custom: typed !== '' && !exact ? typed : undefined,
  }
}

/**
 * Move one entry within a list, returning a new list.
 *
 * Both the arrow buttons and drag-and-drop route through this, so the two ways
 * of reordering cannot disagree. Out-of-range destinations are clamped rather
 * than throwing, because a drag can end past either end of the strip.
 * @param list - the list to reorder.
 * @param from - the index being moved.
 * @param to - its destination index.
 * @returns the reordered list (the same reference when nothing moves).
 */
function moveItem(list, from, to) {
  if (from < 0 || from >= list.length) return list
  const target = Math.min(Math.max(to, 0), list.length - 1)
  if (target === from) return list
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(target, 0, moved)
  return next
}

/**
 * Where a dragged chip should land, from the pointer position within the chip
 * it is hovering.
 *
 * The rule is the standard one for a horizontal strip: past the midpoint means
 * "after this chip", before it means "before". The destination is expressed in
 * the list with the dragged item still present, which is what `moveItem`
 * expects.
 *
 * This is deliberately a pure function over geometry and an index: the rest of
 * drag-and-drop is browser plumbing, but this is the part that gets the order
 * wrong when it is wrong, so it is the part worth testing.
 * @param rect - the hovered chip's bounding box.
 * @param clientX - the pointer's x position.
 * @param index - the hovered chip's index.
 * @returns the destination index.
 */
function dropTargetIndex(rect, clientX, index) {
  if (rect === null || rect === undefined || typeof rect.width !== 'number') return index
  // After the hovered chip, the insertion point is one past it — unless the
  // hovered chip is the one being dragged, in which case nothing moves.
  return clientX >= rect.left + rect.width / 2 ? index + 1 : index
}

/**
 * One selectable chip in the family list.
 *
 * Reordering is available two ways on purpose: dragging for the mouse, and the
 * arrow buttons for the keyboard, since a drag-only control cannot be operated
 * without a pointer. The arrows double as the drag handle, which keeps the
 * whole chip available as a drop target.
 * @param props - _react props.
 * @returns the chip element.
 */
function FamilyChip({
  family,
  index,
  count,
  onMove,
  onRemove,
  moveEarlier,
  moveLater,
  remove,
  dragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}) {
  const actions = [
    {
      key: 'earlier',
      glyph: '\u2190',
      label: moveEarlier,
      disabled: index === 0,
      to: index - 1,
    },
    {
      key: 'later',
      glyph: '\u2192',
      label: moveLater,
      disabled: index === count - 1,
      to: index + 1,
    },
  ]

  return _react.createElement(
    'span',
    {
      className: dragging === true ? 'dsh-font-token dsh-font-tokenDragging' : 'dsh-font-token',
      // The whole chip is the drop target; the drag itself starts from the
      // arrow buttons, so a chip is never picked up by a stray text drag.
      onDragOver,
      onDrop,
    },
    _react.createElement('span', { className: 'dsh-font-tokenText' }, family),
    _react.createElement(
      'span',
      { className: 'dsh-font-tokenActions' },
      actions.map((action) =>
        _react.createElement(
          'button',
          {
            key: action.key,
            type: 'button',
            className: 'dsh-font-tokenButton dsh-font-tokenDrag',
            disabled: action.disabled,
            title: action.label,
            'aria-label': `${action.label}: ${family}`,
            draggable: true,
            onDragStart,
            onDragEnd,
            onClick: () => {
              onMove(index, action.to)
            },
          },
          action.glyph,
        ),
      ),
      _react.createElement(
        'button',
        {
          type: 'button',
          className: 'dsh-font-tokenButton dsh-font-tokenRemove',
          title: remove,
          'aria-label': `${remove}: ${family}`,
          onClick: () => {
            onRemove(index)
          },
        },
        '\u00d7',
      ),
    ),
  )
}

/**
 * A combobox over the discovered family catalogue.
 *
 * Reads the system font list through {@link discoverFamilies} and offers
 * filtered suggestions with keyboard navigation; picking one appends it to the
 * stack. Any value may still be typed and committed, because the catalogue is
 * never guaranteed complete.
 * @param props - _react props.
 * @returns the combobox element.
 */
function FamilyCombobox({ families, disabled, placeholder, add, addLabel }) {
  const [query, setQuery] = _react.useState('')
  const [open, setOpen] = _react.useState(false)
  const [active, setActive] = _react.useState(0)

  const { visible, typed, custom } = comboboxView(families, query, active)
  // `active` is clamped inside the view, so the highlight can never point past
  // the end of a catalogue that shrank under the cursor.
  const highlighted = Math.min(active, Math.max(visible.length - 1, 0))

  const commit = (family) => {
    if (family === '') return
    add(family)
    setQuery('')
    setOpen(false)
    setActive(0)
  }

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActive((current) => Math.min(current + 1, Math.max(visible.length - 1, 0)))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((current) => Math.max(current - 1, 0))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      commit(visible[highlighted] ?? typed)
      return
    }
    if (event.key === 'Escape') {
      setQuery('')
      setOpen(false)
    }
  }

  return _react.createElement(
    'div',
    { className: 'dsh-font-combo' },
    _react.createElement('input', {
      type: 'text',
      spellCheck: false,
      className: 'dsh-font-input',
      value: query,
      placeholder,
      disabled,
      role: 'combobox',
      'aria-expanded': open && visible.length > 0,
      'aria-autocomplete': 'list',
      'aria-label': addLabel,
      onFocus: () => {
        setOpen(true)
      },
      onBlur: () => {
        // Delayed so a click on a suggestion lands before the list closes.
        setTimeout(() => {
          setOpen(false)
        }, 150)
      },
      onChange: (event) => {
        setQuery(event.target.value)
        setOpen(true)
      },
      onKeyDown,
    }),
    open && visible.length > 0
      ? _react.createElement(
          'ul',
          { className: 'dsh-font-menu', role: 'listbox' },
          visible.map((family, index) =>
            _react.createElement(
              'li',
              {
                key: family,
                role: 'option',
                'aria-selected': index === highlighted,
                className:
                  index === highlighted
                    ? 'dsh-font-option dsh-font-optionActive'
                    : 'dsh-font-option',
                // `onMouseDown` beats the input's blur, so the pick is not lost.
                onMouseDown: (event) => {
                  event.preventDefault()
                  commit(family)
                },
                onMouseEnter: () => {
                  setActive(index)
                },
              },
              _react.createElement('span', { className: 'dsh-font-optionName' }, family),
            ),
          ),
          custom === undefined
            ? null
            : _react.createElement(
                'li',
                {
                  className: 'dsh-font-option dsh-font-optionCustom',
                  onMouseDown: (event) => {
                    event.preventDefault()
                    commit(custom)
                  },
                },
                `${addLabel}: "${custom}"`,
              ),
        )
      : null,
  )
}

/**
 * The family-stack editor: chips in priority order plus a combobox to add more.
 *
 * Order is significant in CSS — the first installed family wins — so the chips
 * are the value, and the underlying string is always re-derived from them.
 * @param props - _react props.
 * @returns the editor element.
 */
function FamilyStack({
  value,
  families,
  monospace,
  fallback,
  catalogStatus,
  add,
  addLabel,
  remove,
  moveEarlier,
  moveLater,
  genericWarning,
}) {
  const list = parseFamilyList(value)
  /**
   * The chip being dragged, or `-1`. Held in state so the chip can show it is
   * in flight; the drag itself is the browser's, driven by the events below.
   */
  const [dragIndex, setDragIndex] = _react.useState(-1)

  const setList = (next) => {
    const kept = next.filter((family) => family.trim() !== '')
    // An empty stack is not a valid CSS value, so fall back to the shipped
    // default rather than writing something the token cannot resolve.
    add(kept.length === 0 ? fallback : serializeFamilyList(kept))
  }

  /** Reorder, clamped. Arrows and drops both come through here. */
  const onMove = (from, to) => {
    const next = moveItem(list, from, to)
    if (next === list) return
    setList(next)
  }

  const endDrag = () => {
    setDragIndex(-1)
  }

  const onRemove = (index) => {
    setList(list.filter((_, position) => position !== index))
  }

  const onAdd = (family) => {
    setList([...list, family])
  }

  const hasGeneric = list.some((family) => GENERIC_FAMILIES.includes(family.toLowerCase()))

  return _react.createElement(
    'div',
    { className: 'dsh-font-field' },
    _react.createElement(
      'div',
      { className: 'dsh-font-stack' },
      list.length === 0
        ? _react.createElement('span', { className: 'dsh-font-stackEmpty' }, fallback)
        : list.map((family, index) =>
            _react.createElement(FamilyChip, {
              key: `${family}-${String(index)}`,
              family,
              index,
              count: list.length,
              onMove,
              onRemove,
              moveEarlier,
              moveLater,
              remove,
              dragging: dragIndex === index,
              onDragStart: (event) => {
                setDragIndex(index)
                // Firefox refuses to start a drag without data on the
                // transfer, and the chip's own index is all the drop needs.
                event.dataTransfer?.setData('text/plain', String(index))
                if (event.dataTransfer !== undefined && event.dataTransfer !== null) {
                  event.dataTransfer.effectAllowed = 'move'
                }
              },
              onDragEnd: endDrag,
              onDragOver: (event) => {
                // Without this the browser reports the drop as forbidden.
                if (dragIndex === -1) return
                event.preventDefault()
                if (event.dataTransfer !== undefined && event.dataTransfer !== null) {
                  event.dataTransfer.dropEffect = 'move'
                }
              },
              onDrop: (event) => {
                event.preventDefault()
                if (dragIndex === -1) return
                // Read the hovered chip's own geometry rather than tracking
                // positions during the drag: the DOM is the source of truth for
                // where each chip is, and this survives re-renders mid-drag.
                const rect =
                  typeof event.currentTarget?.getBoundingClientRect === 'function'
                    ? event.currentTarget.getBoundingClientRect()
                    : undefined
                const target = dropTargetIndex(rect, event.clientX, index)
                // A drop just past the dragged chip itself is a no-op; without
                // this the item would shift by one for no visible reason.
                onMove(dragIndex, target > dragIndex ? target - 1 : target)
                endDrag()
              },
            }),
          ),
    ),
    _react.createElement(FamilyCombobox, {
      families,
      placeholder: fallback,
      add: onAdd,
      addLabel,
    }),
    _react.createElement(
      'div',
      { className: 'dsh-font-meta' },
      _react.createElement(
        'span',
        { className: monospace === true ? 'dsh-font-hint dsh-font-code' : 'dsh-font-hint' },
        `font-family: ${serializeFamilyList(list)}`,
      ),
      _react.createElement('span', { className: 'dsh-font-hint' }, catalogStatus),
    ),
    hasGeneric ? null : _react.createElement('div', { className: 'dsh-font-warn' }, genericWarning),
  )
}

/**
 * A horizontal slider plus an exact stepper.
 * @param props - _react props.
 * @returns the control element.
 */
function SliderControl({ min, max, step, value, format, onChange, ariaLabel, increase, decrease }) {
  return _react.createElement(
    'div',
    { className: 'dsh-font-sliderRow' },
    _react.createElement('input', {
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
    _react.createElement(
      'div',
      { className: 'dsh-font-stepper' },
      _react.createElement(
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
        _react.createElement(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { size: 9 }),
      ),
      _react.createElement('span', { className: 'dsh-font-stepValue' }, format(value)),
      _react.createElement(
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
        _react.createElement(_deepseek_ai_dsh_client_ui_primitives.IconChevronUpOutline14, { size: 9 }),
      ),
    ),
  )
}

/**
 * A row of one-click family presets.
 * @param props - _react props.
 * @returns the preset strip.
 */
function PresetStrip({ presets, current, onPick }) {
  return _react.createElement(
    'div',
    { className: 'dsh-font-presets' },
    presets.map((preset) =>
      _react.createElement(
        'button',
        {
          key: preset.id,
          type: 'button',
          className: 'dsh-font-chip',
          'data-active': preset.value === current ? 'true' : 'false',
          onClick: () => {
            onPick(preset.value)
          },
        },
        preset.label,
      ),
    ),
  )
}

/**
 * The General-settings row: five controls over the `ui-font` namespace.
 * @param props - composed slot props (`t`, `useStore`, and the inject actions).
 * @returns the row element tree.
 */
function FontRow({ t, useStore, setField, reset }) {
  const uiFontFamily = useStore((s) => s.uiFontFamily)
  const codeFontFamily = useStore((s) => s.codeFontFamily)
  const uiFontScale = useStore((s) => s.uiFontScale)
  const contentFontSize = useStore((s) => s.contentFontSize)
  const codeFontSize = useStore((s) => s.codeFontSize)

  // Discovery runs once per session (the result is cached) and only when this
  // row is actually rendered, so the cost is never paid by a user who never
  // opens Settings.
  const [catalog, setCatalog] = _react.useState({ families: COMMON_FAMILIES, enumerated: false })
  _react.useEffect(() => {
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

  const catalogStatus =
    catalog.enumerated === true ? t('font.catalogEnumerated') : t('font.catalogProbed')

  return _react.createElement(
    'div',
    { className: 'dsh-font-row' },
    _react.createElement(
      'div',
      { className: 'dsh-font-head' },
      _react.createElement('div', { className: 'dsh-font-title' }, t('font.title')),
      _react.createElement('div', { className: 'dsh-font-desc' }, t('font.description')),
    ),
    _react.createElement(
      Field,
      { label: t('font.uiFamily'), hint: t('font.uiFamilyHint') },
      _react.createElement(FamilyStack, {
        value: uiFontFamily,
        families: catalog.families,
        fallback: DEFAULT_UI_FONT_FAMILY,
        catalogStatus,
        addLabel: t('font.add'),
        remove: t('font.remove'),
        moveEarlier: t('font.moveEarlier'),
        moveLater: t('font.moveLater'),
        genericWarning: t('font.genericWarning'),
        add: (value) => {
          setField(UI_FONT_FAMILY_FIELD, value)
        },
      }),
      _react.createElement(PresetStrip, {
        presets: UI_FAMILY_PRESETS,
        current: uiFontFamily,
        onPick: (value) => {
          setField(UI_FONT_FAMILY_FIELD, value)
        },
      }),
    ),
    _react.createElement(
      Field,
      { label: t('font.codeFamily'), hint: t('font.codeFamilyHint') },
      _react.createElement(FamilyStack, {
        value: codeFontFamily,
        families: catalog.families,
        monospace: true,
        fallback: DEFAULT_CODE_FONT_FAMILY,
        catalogStatus,
        addLabel: t('font.add'),
        remove: t('font.remove'),
        moveEarlier: t('font.moveEarlier'),
        moveLater: t('font.moveLater'),
        genericWarning: t('font.genericWarning'),
        add: (value) => {
          setField(CODE_FONT_FAMILY_FIELD, value)
        },
      }),
      _react.createElement(PresetStrip, {
        presets: CODE_FAMILY_PRESETS,
        current: codeFontFamily,
        onPick: (value) => {
          setField(CODE_FONT_FAMILY_FIELD, value)
        },
      }),
    ),
    _react.createElement(
      Field,
      {
        label: t('font.uiScale'),
        value: `${String(Math.round(uiFontScale * 100))}%`,
        hint: t('font.uiScaleHint'),
      },
      _react.createElement(SliderControl, {
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
    _react.createElement(
      Field,
      {
        label: t('font.contentSize'),
        value: `${String(contentFontSize)} ${t('font.unit')}`,
        hint: t('font.contentSizeHint'),
      },
      _react.createElement(SliderControl, {
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
    _react.createElement(
      Field,
      {
        label: t('font.codeSize'),
        value: `${String(codeFontSize)} ${t('font.unit')}`,
        hint: t('font.codeSizeHint'),
      },
      _react.createElement(SliderControl, {
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
    _react.createElement(
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
function apply(ctx) {
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
		exports.apply = apply;
		exports.inject = inject;
		exports.fontStyleSheet = fontStyleSheet;
		exports.applyFonts = applyFonts;
		exports.parseFamilyList = parseFamilyList;
		exports.serializeFamilyList = serializeFamilyList;
		exports.rankFamilyMatches = rankFamilyMatches;
		exports.comboboxView = comboboxView;
		exports.moveItem = moveItem;
		exports.dropTargetIndex = dropTargetIndex;
		exports.FamilyStack = FamilyStack;
		exports.FamilyChip = FamilyChip;
		return module.exports;
	}
});
