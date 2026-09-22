# dsh-font

English | [中文](README.zh.md)

## If dsh will not boot

The three lines you are looking at are these —

    Failed to load plugins
    web boot: 3 entries did not activate
    @citisen/dsh-font: pending (waiting for service: settingsScope)

An enabled plugin row that never activates is a failed boot, not a warning: dsh refuses
to finish starting rather than loading without the plugin. Three ways out, fastest
first, and **all three work while dsh cannot start**. This plugin's row in the profile is
`id: font`, for `name: '@citisen/dsh-font'`.

**1. Disable it — one entry in the profile's own patch layer**
(`$DSH_HOME/profiles/web/cordis.patch.yml`, applied after every bundle layer):

    - id: font
      disabled: true

No command, no network, nothing to install, and deleting those two lines brings the row
back. `dsh --profile web --dump-config` prints the composed tree — every row's id and
package name, whoever it belongs to — and marks this row `disabled: true` once the patch
takes effect; it loads no plugin, so it works while dsh cannot start.

**2. One boot only, changing nothing** — put the same two lines in a file of your own
and pass it as an overlay:

    dsh --profile web --patch ./no-font.yml web

**3. Remove it** — one command drops the dependency *and* the bundle layer
(`dsh.profile.bundles` is reconciled against what is installed). It forwards to pnpm in
the profile directory and never composes the profile, so it runs while dsh cannot start:

    dsh plugin --profile web remove @citisen/dsh-font

It needs `pnpm` on `PATH`; without it, delete the package name from
`dsh.profile.bundles` (and the matching `dependencies` entry) in
`$DSH_HOME/profiles/web/package.json` by hand.

**Or just get a working dsh now**: boot a clean profile from the shipped template, which
carries none of your bundles:

    dsh --profile rescue --from-default-profile web

## Compatibility

This build targets the dsh **0.1.5-rc.x** line — today's `latest` (`0.1.5-rc.2`) and
`next` (`0.1.5-rc.3`). dsh `0.1.7-alpha.1` replaced the Web client's settings API: the
`settingsScope` service this plugin binds is gone (its replacement is `configForms`), and
the Host's `settings.register()` went with it. On that release the Fonts row keeps
rendering the shipped defaults, but nothing is read or saved — and the reason is named in
the browser console and in the dsh log rather than left to guesswork.

Up to `0.2.1` this plugin waited for a service that release does not have, which is the
failed boot at the top of this file; from `0.2.2` it activates and reports the mismatch
instead. Either side of the line fixes it: pin dsh (`npx @deepseek-ai/dsh@0.1.5-rc.2 web`,
or `@next`), or install a build of this plugin that supports the new API.

**If `$DSH_HOME/settings.yaml.imported` exists, do not delete it.** dsh 0.1.7 imports the
old `settings.yaml` once and renames it, and any section it does not recognize — this
plugin's own `ui-font` section included — stays only in the renamed file. That file is the
last copy of those font choices.

Customize the DeepSeek Harness **Web GUI fonts** from Settings: the interface
and code font stacks (each with its weight) and three independent size axes.

This is a third-party [dsh](https://github.com/deepseek-ai/deepseek-harness)
profile bundle. It ships as one dual-face package: a Node half that owns a
durable settings namespace and a pre-paint style row, and a browser half that
paints the result and registers the Settings row.

Requires dsh `0.1.5-rc.1` or a later `0.1.5-rc.x`; it uses the `settings.general.item`
slot, the `settingsScope` service, and `ctx.theme.overrideTokens`, all of which
are present in the `latest` and `next` release channels.

## What it adds

A **Fonts** row in *Settings → General*, with five fields: two font queries and
three size axes.

| Field | Effect | Value |
| --- | --- | --- |
| Interface font | `--dsw-font-family` — all non-code UI text | a font query: families, optionally with a weight |
| Code font | `--ds-font-family-code` — code blocks, inline code, monospace | a font query |
| Interface text size | Scales every hard-coded UI text size | 75% – 150%, step 5% |
| Conversation text size | Message bodies, headings, and tables | 12 – 20 px |
| Code text size | Code blocks and inline code | 10 – 20 px |

Both font fields are **editors for a small font-query language**, not plain text
inputs: the whole stack is one piece of text you edit directly, with syntax
colouring, soft wrapping, and a completion list built from the fonts actually on
your machine. The weight is written *in* the query, next to the family it belongs
to, so changing a font and its weight is one edit in one place:

```
Geist Mono medium, "Zhuque Fangsong (technical preview)", monospace
└─────┬────┘ └──┬─┘
    family    weight
```

- **Order is the text's order.** The first family the browser can resolve wins,
  and reordering is an edit: cut and paste it, or put the caret in an entry and
  press <kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd>. There are no chips to drag.
- **The text belongs to you.** Nothing rewrites it: not quoting, not reordering,
  not tidying, and not refilling an empty box. A new font goes exactly where the
  caret is, because that is where you typed it — putting one in front of the
  stack is `Inter, ` typed by hand, or a pick from the completion list at the
  start of an entry.
- **The list knows your fonts.** It completes family names, the generic keywords,
  and — once a family is named — the weights *that family has*, read off its
  faces. Any name can still be typed by hand; the catalogue is never presented as
  complete.
- **The box is always the same monospace.** The painted layer and the real
  textarea share one box, and a textarea cannot style a substring, so the field
  uses one fixed system monospace at weight 400 with ligatures and kerning turned
  off — whatever font the query names. A face with ligatures (`->` in Fira Code)
  would draw one glyph in the layer and two in the field, and a synthesized
  weight would differ between them. The readout line under the field is rendered
  in the axis's own font, so the family you picked is still visible there.
- **The setting follows every keystroke.** The editor owns its own text, so there
  is nothing to submit: the query is parsed and written as you type, and the
  readout under the field moves with it. <kbd>Tab</kbd> (or a click) takes the
  highlighted completion, which is the one case where the text is replaced —
  because that is what picking a suggestion means. <kbd>Enter</kbd> takes it too,
  and otherwise leaves the text exactly as it stands.
- **A wrong query is marked, not fixed.** A family this machine does not have, a
  weight the family lacks, an unclosed quote, a stray word: each is reported
  under the field, in warning or error colour, and the text is left as typed. An
  empty box writes nothing at all and says so — the saved stack stays in use, and
  *Reset to defaults* is how you go back to the shipped one.

Every value is saved through the host settings document
(`$DSH_HOME/settings.yaml`, namespace `ui-font`), so settings survive a restart
and are shared by every browser pointed at the same host.

The *Interface text size* and *Conversation text size* axes are independent on
purpose: bumping the interface makes the surrounding chrome easier to read
without changing how much message text fits on screen, and vice versa.

### Choosing a weight: `Geist Mono medium`

CSS cannot put a weight in a `font-family` — `font-family: "Geist Mono" 500,
monospace` is simply an invalid declaration, and the whole stack would be
dropped. The query language therefore writes the weight as a word beside the
family, and the plugin reads the pair back into the two declarations that
actually apply:

```
Geist Mono medium, monospace   →   font-family: "Geist Mono", monospace
                               →   font-weight: 500
```

`Thin`, `ExtraLight`, `Light`, `Book`, `Regular`, `Medium`, `SemiBold`, `Bold`,
`ExtraBold`, `Black` and their usual aliases (`Hairline`, `DemiBold`,
`UltraBold`, …) are all recognized, case-insensitively. The weight belongs to the
axis rather than to one family, so it is honoured wherever it is written and
counted once; the canonical form puts it after the first family — the one in
effect.

The **shipped weight is implicit**: an axis at its factory 400 carries no word at
all, because a `regular` that appears after every family is noise nobody asked
for — and for the interface axis 400 literally means "no override". A word
appears exactly when a weight is chosen, and deleting it returns the axis to 400.
What the axis currently stands at is always stated in the line under the field
(`Interface weight: Regular 400 (shipped, not overridden)`), so nothing is hidden
by leaving the word out.

The weight is a closed list rather than a free number, because a `font-weight`
the chosen family does not have is *synthesized* by the browser, and offering
faux-bold as a normal choice is worse than not offering it. When the faces could
be read — the Local Font Access API reports them — the popup offers *that*
family's weights, and a weight the family lacks is called out below the field:

> Geist Mono has no 700 face on this machine (bold), so the browser will
> synthesize it

Deleting the word does not quietly reset anything: the axis keeps the weight it
was set to, the line under the field states it, and the word comes back the next
time the row is built from the stored values. To go back to the shipped weight,
pick its row from the list (`Regular 400`) — a pick is an instruction, so it sets
the value even though its text is just the family name.

One deliberate escape hatch: if what you type is itself a family on your machine,
the trailing word is read as part of the name. `Book Antiqua` and
`Franklin Gothic Medium` are real families, and applying a weight to them instead
of picking them would be silent misbehaviour. The price is that a name which is
genuinely both — a family literally called `Geist Mono Medium` — is also read as
a name. The catalogue decides, so the judgement uses the same font list the
completion list shows you. Quoting is the way out: `"Book Antiqua"` always means
the name, verbatim.

### The interface weight is opt-in

The code surface has no weight hierarchy to preserve, so its weight is simply the
one written in the query. The interface does have one: headings are 700, table
heads 500, body 400. Setting an interface weight therefore moves the base and
carries the heading steps with it, keeping each step's shipped distance from 400
instead of flattening them:

```css
/* --dsh-font-ui-weight: 500 */
html body { font-weight: 500 }
--dsh-font-markdown-base: 500 …          /* body text */
--dsh-font-markdown-h1: 800 …            /* 700 + (500 - 400) */
--dsh-font-markdown-table-head: 600 …    /* 500 + (500 - 400) */
```

Text that *inherits* its weight moves; a label or a button whose weight the
design system fixes keeps it, because its own rule still wins. And the shipped
400 emits **no rule at all**, so an untouched install paints exactly what the
design system paints.

### The query language

```
query  := entry ("," entry)*
entry  := family | weight
family := '"' … '"' | "'" … "'" | word (space word)*
weight := thin | extralight | light | book | regular | roman | medium |
          demibold | semibold | bold | extrabold | black | heavy | …
```

The grammar is the CSS `font-family` list plus the one thing the list cannot
carry. Only the LAST word of an unquoted entry may be a weight, and only when the
whole entry is not itself a catalogued family. A bare weight word (`medium`) sets
the axis weight without naming a family. Commas inside quotes are not separators,
so `"Foo, Bar"` is one family.

The reader is forgiving on purpose — this text is typed by hand, not generated —
so anything it cannot place is kept as written and reported under the field
instead of being dropped: an unclosed quote, a stray word after a quoted name, a
weight written twice, a family the machine does not list, a weight the family has
no face for. The field also names the family that is in effect, which is the
first one the browser can actually resolve.

### How the font list is discovered

Order matters in a CSS font stack — the first installed family wins — so the
editor is built around the text rather than around a picker.

Reading the real installed-font list needs the
[Local Font Access API](https://developer.mozilla.org/en-US/docs/Web/API/Local_Font_Access_API)
(`queryLocalFonts`), which is **Chromium-only, experimental, and
permission-gated**; MDN also notes browsers are not obliged to return the
complete list. So the catalogue is layered:

1. **`queryLocalFonts()`** when the browser offers it — the machine's own list,
   which needs no badge to explain itself. Its per-face `style` names (`Regular`,
   `SemiBold`, `Bold Italic`) are kept alongside the families, which is what lets
   the completion list offer a family's real weights and warn about one it lacks.
   The first use shows a permission prompt; declining falls back silently rather
   than erroring.
2. **Measurement probing** everywhere else — each candidate family is rendered
   off-screen and compared against a `monospace` baseline; a different width or
   height means it is installed. No permission needed, works in every browser.
   It only sees the curated probe list, so it under-reports by design and can say
   nothing about weights — which is the one case worth calling out, so the row
   then says so once, above the fields, and adds that any family can still be
   typed.
3. **Always** the curated catalogue plus the generic families, so a font that
   neither source found can still be typed.

The result is cached for the session, and discovery only runs when the row is
actually rendered — never at startup.

The editor also warns when a query has **no generic family at the end** (such as
`sans-serif`), because a missing font then falls back unpredictably. Quoting is
automatic: `Fira Code` is stored as `"Fira Code"`, and generic keywords are
deliberately left unquoted, so `"sans-serif"` can never be written by accident.

## Install

```sh
dsh plugin --profile web add @citisen/dsh-font
```

Straight from GitHub (identical package, no registry involved):

```sh
dsh plugin --profile web add github:citisen/dsh-font
```

Then restart the Web surface:

```sh
dsh --profile web
```

`dsh plugin` forwards to pnpm inside the profile directory and then reconciles
`dsh.profile.bundles`: because this package declares `dsh.bundle`, the install
appends it as a profile layer automatically. Nothing has to be hand-edited in
`cordis.patch.yml`.

Both paths are verified end to end on a fresh profile — the row reaches the
composed entry list and the browser roster resolves the client bundle. Confirm
it yourself with `node scripts/verify-profile.mjs <profile>` after installing.

### Installing from a local checkout

`dsh plugin --profile web add <path>` is unreliable on Windows when the profile
and the checkout are on **different drives** — pnpm resolves the cross-drive
directory link to a nonexistent path, and the reconciliation then concludes the
package declares no `dsh.bundle` and leaves it out of `bundles`. Link it
yourself instead:

```sh
cd "$DSH_HOME/profiles/web"
pnpm add "D:/path/to/dsh-font"          # writes the dependency
# then repair the link pnpm created, which points at
#   <profile>/D:/path/to/dsh-font  -- a path that does not exist
rm -rf node_modules/dsh-font
cmd /c mklink /J node_modules\dsh-font D:\path\to\dsh-font   # Windows
# and add "dsh-font" to dsh.profile.bundles in package.json by hand
```

Verify the result with `node scripts/verify-profile.mjs`; it fails loudly if the
row never made it into the composed entry list.

## How it works

Read this section before changing the code; the two halves solve different
problems and the split is deliberate.

### Why the families go through the theme service

The design system declares both families once, on `:root`:

```css
:root{--dsw-font-family:…;--ds-font-family-code:…}
```

Every typographic token in the UI resolves through `var(--dsw-font-family)`
(`--dsw-font-base-16`, `--dsw-font-xs-13`, the whole Markdown ladder, …), and
the shell's own `body` rule reads it too, so overriding those two variables
retargets the entire interface.

The obvious way to set them — a custom property on `documentElement` — does not
survive. `ui-layout`'s `ThemePresenter` owns `document.body.style` and, on every
theme change, **deletes every custom property it did not write** before
re-writing the active token set. A property set from outside disappears the
first time the user switches between light and dark.

So the browser half stacks the families onto the theme itself:

```js
ctx.theme.overrideTokens('dsh-font', {
  '--dsw-font-family': { light: uiFontFamily, dark: uiFontFamily },
  '--ds-font-family-code': { light: codeFontFamily, dark: codeFontFamily },
})
```

The override layer folds into the active snapshot, and the presenter then
republishes it — and keeps republishing it — on every palette change. The
`{ light, dark }` pair is mandatory: `overrideTokens` throws a teaching error on
a bare string, because a single value would go illegible on the other palette.

### Why the sizes are a stylesheet

There is **no** interface font-size variable in the design system. Each
component hard-codes one of 11, 12, 13, 14, 16, 20, or 24 px, and the
`--dsw-font-*` scale is a fixed ladder (`--dsw-font-xs-13` is 13px, full stop).
Code sizes are likewise baked into composite tokens.

So the plugin emits one utility class per shipped size:

```css
.dsh-font-size-14{font-size:calc(14px * var(--dsh-font-ui-scale,1)) !important}
```

and stamps the matching class onto each element, measuring its shipped size with
`getComputedStyle` while it carries no stamp. A `MutationObserver` re-stamps as
the interface mounts new nodes.

Stamping per element rather than using a universal rule is what keeps the two
size axes independent: a `html body *` override would inherit into the
conversation subtree and compound with the content size, and it would also
rewrite decorative sizes (the SVG labels inside file-type icons) that nobody
meant to scale. Measuring per element also means the plugin needs no knowledge
of any component's class names, so it survives a UI refactor.

### Where the conversation size is written

`--dsh-content-font-size` is an **inline** custom property on `body`, written by
`ui-layout` from the sibling `ui-theme` namespace (whose own Settings row offers
12–17 px). An inline declaration outranks a stylesheet regardless of
`!important`, so the plugin writes its value to exactly the same place:

```js
document.body.style.setProperty('--dsh-content-font-size', `${contentSize}px`)
```

The stylesheet then re-derives the whole Markdown ladder in absolute px from
that value. `ui-theme` still owns the variable and still writes it on every
theme change; the plugin re-asserts its own on every settings change. The row's
help text tells the user this control wins over the *Font size* row in
Appearance.

### Where the code weight is written

The design system has **no** weight token at all — every `font:` declaration in
the interface is a literal, and the code ladder is literally `400`. So the
weight cannot ride the family token the way a family does, and it is applied on
two levels:

```css
/* the three code tokens carry it in their font: shorthand … */
--dsw-font-markdown-code: var(--dsh-font-code-weight,400) var(--dsh-font-code-size,12px) / … ;

/* … and everything styled directly with the code family is matched structurally */
html body pre, html body code, html body [class*="code" i] {
  font-family: var(--ds-font-family-code) !important;
  font-weight: var(--dsh-font-code-weight,400) !important;
}
```

The second rule exists because most code in the interface never reads a token:
the tool I/O cards and the terminal output are styled with `font-family:
var(--ds-font-family-code)` and their own literal weight inside a component
stylesheet, so there is nothing to override but the element. The `!important` is
what outranks `font: 500 12px/18px …`. It is deliberately **not** a universal
rule: the surrounding labels keep the shipped hierarchy.

### Where the interface weight is written

The interface weight is opt-in, so the shipped `400` emits no rule at all and an
untouched install paints exactly what the design system paints. Anything else is
written on two levels:

```css
/* text that inherits its weight moves as a whole … */
html body { font-weight: 500 }

/* … while the Markdown ladder the plugin already owns is shifted by the same
   distance from the shipped 400, so headings keep their contrast */
--dsh-font-markdown-base: 500 …
--dsh-font-markdown-h1: 800 …            /* 700 + (500 - 400) */
--dsh-font-markdown-table-head: 600 …    /* 500 + (500 - 400) */
```

The ladder has to name the weight explicitly: a `font:` shorthand with no weight
component resets `font-weight` to `normal`, so `html body` alone would be
cancelled by the plugin's own tokens.

### Pre-paint

The Node half answers `webserver/index-inject` with an inline `<script>` that
installs the stylesheet and sets the family and weight variables before the shell
mounts, so the first frame is already in the user's fonts. It reads the same
`ui-font` settings section at render time, and falls back to the schema defaults
when the settings provider is absent.

## Development

```sh
npm run build     # src/client.js -> lib/client.js
npm run check     # the release gate: bundle in sync, host and client verified
npm run check:all # adds the profile-composition check (needs a local dsh)
npm run verify    # just the host and client verifiers
npm run watch     # rebuild on save, for dsh-client-hmr
```

`src/client.js` is the single source of truth for the browser half. It is
written as an ES module for readability, but DSH client bundles are **classic
scripts** that may only register a lazy CommonJS factory through
`window.__ModuleLoader__` — so `scripts/build-client.mjs` applies that envelope
and rewrites the static imports into `require` calls. It is deliberately narrow
and fails the build on anything it cannot rewrite, because a hand-rolled client
bundle has no bundler to catch a mistake.

The only modules a browser half may request from the shell are the nine it seeds
into its module table (`react`, `react/jsx-runtime`, `react-dom`,
`react-dom/client`, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-store`,
`@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/dsh-client-ui-primitives`,
`@deepseek-ai/dsh-client-ui-dockkit`). Anything else is compiled in instead: a
library through the `VENDORED` map, and this plugin's own `src/font-grammar.js`
through `LOCAL_MODULES`, which splices it into `src/client.js`'s scope so the two
share one set of constants. `dsh.client.external` is the other documented route,
but it needs a second client bundle, a second roster row, and a host that
cooperates; the host also silently ignores an entry whose supplier is not an
active plugin row. The build enforces which route each specifier takes.

`verify-profile.mjs` needs a dsh installation and an initialized profile, so it
**skips** (exit 0) when neither is present — a clean CI runner has no dsh. Set
`DSH_REQUIRE=1` to turn that skip into a failure.

To iterate on the browser half against a running host, run the watcher and let
`dsh-client-hmr` swap the plugin in — it stat-polls client bundles every 500 ms,
so a saved rebuild reaches the open page without a refresh:

```sh
# terminal 1
npm run watch

# terminal 2
dsh --profile web
```

A page refresh always picks up a newly composed graph, so the watcher is a
convenience rather than a requirement.

### Releasing

Releases are staged by GitHub Actions over npm trusted publishing and then
approved by a maintainer, so no `NPM_TOKEN` exists in this repository and none
should ever be added. [RELEASING.md](RELEASING.md) is the step-by-step runbook;
[PUBLISHING.md](PUBLISHING.md) covers the one-time npm setup and what the
arrangement does and does not protect against.

## Package layout

| Path | Role |
| --- | --- |
| `lib/index.js` | Host half: settings namespace, pre-paint injection. Loaded by the loader. |
| `lib/client.js` | Browser half, **generated** from `src/client.js`. Served at `/plugins/@citisen/dsh-font/client.js`. |
| `src/client.js` | Browser-half source. |
| `src/font-grammar.js` | The font-query grammar, as a `@citisen/litearea` grammar. Splices into `src/client.js`. |
| `cordis.patch.yml` | The profile layer this bundle contributes. |
| `scripts/` | Build and verification scripts. |
| `.github/workflows/stage.yml` | The CI half of the only publishing path. |
| `PUBLISHING.md` | Trusted-publishing setup, and what it does not protect against. |
| `RELEASING.md` | The runbook for shipping a change. |
| `package.json` | Declares `dsh.bundle` (profile layer) and `dsh.client` (browser roster entry). |

## Known limitations

- **Hard-coded sizes only.** The interface scale only moves text that a shipped
  stylesheet fixes in px. It deliberately leaves display-size text and decorative
  glyph sizes alone, so a scale of 150% is not a uniform 1.5× of the whole UI.
- **The conversation size overrides `ui-theme`'s font-size row.** Both write
  `--dsh-content-font-size`; last write wins, and this plugin always writes on a
  settings change. Use one or the other.
- **Fonts are not installed.** A family name is only used if the browser or OS
  can resolve it; the plugin does not bundle or download webfonts, so a typo
  falls back silently to the generic family at the end of the list.
- **Per-element stamping is proportional to the DOM.** The scale pass measures
  each element once and caches the result, and re-stamps on mutation, so it is
  bounded — but it is not free on a very large transcript.
- **The code weight is not a per-surface choice.** It applies to every code
  surface at once, and where it lands on `pre`, `code`, and any element with
  `code` in its class name — so a `font-weight` a component sets inside a code
  block (syntax highlighting, a bold diff line) is overridden too. The interface
  weight is the mirror image: only text that *inherits* its weight moves, and a
  label or button whose weight the design system fixes keeps it. A weight the
  family lacks is still synthesized by the browser; the closed list and the
  "no such face on this machine" warning only keep it out of reach.
- **The query language is a convention, not CSS.** It lives only in this row's
  two font fields; what is stored is still a valid CSS `font-family` list plus a
  numeric `font-weight`, so disabling the plugin leaves nothing behind. Whether a
  trailing word is a weight or part of the name is decided by the loaded
  catalogue, so a family whose real name ends in a weight word (`Book Antiqua`,
  `Franklin Gothic Medium`) is left intact only when that exact name was
  discovered — both are curated, so this normally holds, but a name outside the
  probe list can be split when the Local Font Access prompt is declined. Quoting
  settles it: `"Book Antiqua"` is always the name.
- **The heading shift is one formula, not a redesign.** Each step becomes
  `shipped + (interface weight - 400)`, clamped at 900 — so an interface weight
  of 900 flattens the ladder against that ceiling.
- **The box is not a copy of the setting.** What is stored is the plugin's
  serialization of the query (quoted, weight word after the first family); what
  the box shows is your text, kept verbatim for as long as the row lives. A
  reload rebuilds the box from the two stored values, so a weight word you
  deleted can reappear there, and it may be spelled differently from what you
  typed.
- **The settings row is English/Chinese only**, matching the shipped locale pair.

## License

MIT
