window.__ModuleLoader__.load({
	id: "dsh-font",
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
/** Id of the single stylesheet this plugin owns. */
const FONT_STYLE_ID = 'dsh-font/variables'
/** Plugin id, used as the theme override layer source and the CSS tag owner. */
const PLUGIN_ID = 'dsh-font'

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
    tag.dataset.plugin = PLUGIN_ID
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
].join('')

/** Install the row chrome stylesheet for the plugin's lifetime. */
function installRowStyles(ctx) {
  if (typeof document === 'undefined') return
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = PLUGIN_ID
    tag.dataset.pluginCss = `${PLUGIN_ID}/row.css`
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

/**
 * A commit-on-blur/Enter text input that always reflects the durable value
 * once the user stops editing.
 * @param props - _react props.
 * @returns the input element.
 */
function FamilyInput({ value, placeholder, onCommit, monospace }) {
  const [draft, setDraft] = _react.useState(value)
  const editing = _react.useRef(false)

  _react.useEffect(() => {
    if (!editing.current) setDraft(value)
  }, [value])

  const commit = _react.useCallback(() => {
    editing.current = false
    const next = draft.trim()
    if (next === '') {
      setDraft(value)
      return
    }
    if (next !== value) onCommit(next)
  }, [draft, onCommit, value])

  return _react.createElement('input', {
    type: 'text',
    spellCheck: false,
    className: monospace === true ? 'dsh-font-input dsh-font-code' : 'dsh-font-input',
    value: draft,
    placeholder,
    onChange: (event) => {
      editing.current = true
      setDraft(event.target.value)
    },
    onBlur: commit,
    onKeyDown: (event) => {
      if (event.key === 'Enter') event.currentTarget.blur()
      if (event.key === 'Escape') {
        editing.current = false
        setDraft(value)
        event.currentTarget.blur()
      }
    },
  })
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
      _react.createElement(FamilyInput, {
        value: uiFontFamily,
        placeholder: DEFAULT_UI_FONT_FAMILY,
        onCommit: (value) => {
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
      _react.createElement(FamilyInput, {
        value: codeFontFamily,
        placeholder: DEFAULT_CODE_FONT_FAMILY,
        monospace: true,
        onCommit: (value) => {
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
		return module.exports;
	}
});
