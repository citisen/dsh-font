# dsh-font

English | [中文](README.zh.md)

Customize the DeepSeek Harness **Web GUI fonts** from Settings: the interface
font family, the code font family, and three independent size axes.

This is a third-party [dsh](https://github.com/deepseek-ai/deepseek-harness)
profile bundle. It ships as one dual-face package: a Node half that owns a
durable settings namespace and a pre-paint style row, and a browser half that
paints the result and registers the Settings row.

Requires dsh `0.1.5-rc.1` or a later `0.1.5-rc.x`; it uses the `settings.general.item`
slot, the `settingsScope` service, and `ctx.theme.overrideTokens`, all of which
are present in the `latest` and `next` release channels.

## What it adds

A **Fonts** row in *Settings → General*, with five controls:

| Control | Effect | Range |
| --- | --- | --- |
| Interface font | `--dsw-font-family` — all non-code UI text | any CSS `font-family` list |
| Code font | `--ds-font-family-code` — code blocks, inline code, monospace | any CSS `font-family` list |
| Interface text size | Scales every hard-coded UI text size | 75% – 150%, step 5% |
| Conversation text size | Message bodies, headings, and tables | 12 – 20 px |
| Code text size | Code blocks and inline code | 10 – 20 px |

Both family fields accept free text and offer one-click presets. Every value is
saved through the host settings document (`$DSH_HOME/settings.yaml`,
namespace `ui-font`), so settings survive a restart and are shared by every
browser pointed at the same host.

The *Interface text size* and *Conversation text size* axes are independent on
purpose: bumping the interface makes the surrounding chrome easier to read
without changing how much message text fits on screen, and vice versa.

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

### Pre-paint

The Node half answers `webserver/index-inject` with an inline `<script>` that
installs the stylesheet and sets the two family variables before the shell
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

The only modules a browser half may request are the nine the shell seeds into
its module table (`react`, `react/jsx-runtime`, `react-dom`,
`react-dom/client`, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-store`,
`@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/dsh-client-ui-primitives`,
`@deepseek-ai/dsh-client-ui-dockkit`); anything else must be declared in
`dsh.client.external` and shipped as its own graph row. The build enforces this.

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
should ever be added. See [PUBLISHING.md](PUBLISHING.md) for the one-time npm
setup, what this does and does not protect against, and the release steps.

## Package layout

| Path | Role |
| --- | --- |
| `lib/index.js` | Host half: settings namespace, pre-paint injection. Loaded by the loader. |
| `lib/client.js` | Browser half, **generated** from `src/client.js`. Served at `/plugins/@citisen/dsh-font/client.js`. |
| `src/client.js` | Browser-half source. |
| `cordis.patch.yml` | The profile layer this bundle contributes. |
| `scripts/` | Build and verification scripts. |
| `.github/workflows/stage.yml` | The CI half of the only publishing path. |
| `PUBLISHING.md` | Release and trusted-publishing setup. |
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
- **The settings row is English/Chinese only**, matching the shipped locale pair.

## License

MIT
