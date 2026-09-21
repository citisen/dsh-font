/**
 * Build `lib/client.js` from `src/client.js`.
 *
 * DSH client bundles are classic scripts, not ES modules: the browser shell
 * loads them with a plain `<script>` element and they may only register a lazy
 * CJS factory with `window.__ModuleLoader__`. This script applies that envelope
 * and rewrites the template's static ESM imports into the factory's CommonJS
 * `require` form.
 *
 * The transformation is deliberately narrow — it supports exactly the import
 * shapes the template uses — because a hand-rolled client bundle has no
 * bundler to catch a mistake. Any unsupported syntax fails the build loudly.
 *
 * Usage:
 *   node scripts/build-client.mjs           # write lib/client.js
 *   node scripts/build-client.mjs --watch   # rebuild on save (for dsh-client-hmr)
 *   node scripts/build-client.mjs --check   # fail if lib/client.js is stale
 */

import { readFileSync, watch, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = join(root, 'src', 'client.js')
const outputPath = join(root, 'lib', 'client.js')

/**
 * The bundle id the shell's module table keys on. It must equal the package
 * name: `dsh-client-modules` resolves a roster row by the loader entry name and
 * matches it against the id the bundle registers. Read from package.json rather
 * than duplicated here, so a rename cannot desynchronize the two.
 */
const PACKAGE_NAME = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name

/**
 * The names the envelope exports from the compiled factory. The first entry is
 * what the loader consumes; the rest exist so the verifier can unit-test the
 * pure builders without re-parsing the source.
 */
const ENVELOPE_EXPORTS = [
  'apply',
  'inject',
  'fontStyleSheet',
  'applyFonts',
  'parseFamilyList',
  'serializeFamilyList',
  'normalizeWeight',
  'weightWord',
  'faceWeights',
  'GENERIC_FAMILIES',
  'COMMON_FAMILIES',
  'emphasisWeight',
  'parseFontQuery',
  'serializeFontQuery',
  'asQuery',
  'storedQuery',
  'applyFontQuery',
  'moveFontQueryEntry',
  'reorderFontQueryEntry',
  'describeDiagnostic',
  'diagnosticKind',
  'dshFontQueryGrammar',
  'FontQueryEditor',
]

/**
 * Third-party modules compiled INTO the bundle, by specifier.
 *
 * DSH's shell seeds a fixed module table, so a plugin may only `import` a
 * platform singleton. The documented route for anything else is
 * `dsh.client.external` plus a second client bundle the plugin ships — which
 * means another `<script>`, another roster row, and a host that has to cooperate
 * in loading it. The host also ignores an `external` entry whose supplier is not
 * an active plugin row, so the mistake surfaces only at runtime in the browser.
 *
 * A single-file bundle is easier to trust, so the editor engine is compiled in
 * instead. Its built ESM is self-contained — no imports of its own — which makes
 * inlining it a matter of stripping the one `export` statement at the end and
 * handing the names back. The cost is real and worth stating: this bundle grows
 * by the engine's whole compiled size, and the engine's own test suite and
 * browser harness are what cover its behaviour from here on.
 *
 * ONE entry, and that is the point. The engine is generic — it ships no syntax at
 * all — so there is no second module to inline: this plugin's own language lives
 * in `src/font-grammar.js` (see {@link LOCAL_MODULES}).
 *
 * The dependency is a devDependency, because the code it contributes is copied
 * in here and is not resolved from `node_modules` at runtime — not on the host,
 * and not in the browser.
 */
const VENDORED = new Map([['@citisen/litearea', 'dist/index.js']])

/**
 * This plugin's own modules compiled INTO the bundle, by the relative specifier
 * the template imports them with.
 *
 * The font-query grammar describes this plugin's language, so it belongs to this
 * plugin and not to the editor engine — a library that shipped every consumer's
 * grammar would force every consumer to bundle every language. It is still
 * compiled in rather than loaded, and with no bundler that means splicing the
 * module's own source in ABOVE the template.
 *
 * Splicing rather than wrapping is what keeps the module's names at the top
 * level: `ENVELOPE_EXPORTS` re-exports them, and `stripExports` strips the
 * module's `export` keywords with the template's, so a declaration in either file
 * can be named there. The module therefore shares the template's scope, which is
 * deliberate — it reads the parser's constants and helpers in that scope instead
 * of restating them, and that is what stops the two from drifting.
 */
const LOCAL_MODULES = new Map([['./font-grammar.js', 'src/font-grammar.js']])


/** The trailing `export { … }` a bundled ESM module ends with. */
const EXPORT_BLOCK = /\nexport \{([\s\S]*?)\};?\s*$/

/**
 * `import [default][, { named }] from 'spec'`, with no nested braces.
 * Matches the whole line so no stray `import` survives the rewrite.
 */
const IMPORT_PATTERN =
  /^import\s+(?:(?<default>[A-Za-z_$][\w$]*)\s*,\s*)?(?:\{\s*(?<named>[^{}]*?)\s*\})?\s*from\s*'(?<spec>[^']+)'\s*$/gm

/**
 * The only specifiers the shell seeds into the browser module table. Anything
 * else has to be declared in `dsh.client.external` and shipped as its own
 * graph row; a mistake would otherwise surface only at runtime in the browser.
 */
const PLATFORM_SINGLETONS = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])

/**
 * Turn one specifier into the alias the compiled bundle binds it to, matching
 * the naming convention DSH's own bundles are emitted with.
 * @param spec - module specifier, e.g. `react/jsx-runtime`.
 * @returns the bound identifier.
 */
function aliasFor(spec) {
  return `_${spec.replace(/^@/, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/_+$/, '')}`
}

/**
 * The declaration that compiles one vendored module into the envelope.
 *
 * The module is wrapped in its own function scope so its top-level names cannot
 * collide with the template's, and its body is left exactly as published — not
 * re-indented — so a reader debugging the bundle sees what the package actually
 * shipped.
 * @param spec - the specifier the template imported.
 * @param file - the built file, relative to that package's root.
 * @returns the declaration line.
 * @throws {Error} when the package is not installed or its output is not
 *   inlinable.
 */
function vendorDeclaration(spec, file) {
  const packageDir = spec.startsWith('@')
    ? spec.split('/').slice(0, 2).join('/')
    : (spec.split('/')[0] ?? spec)
  const path = join(root, 'node_modules', packageDir, file)
  let source
  try {
    source = readFileSync(path, 'utf8')
  } catch {
    throw new Error(
      `build-client: ${spec} is not installed (${path} is missing); run \`npm install\``,
    )
  }
  // A source map reference would point at a map the bundle has no relationship
  // with. Every one is removed rather than the last: the built file carries the
  // comment twice, which is a quirk of the bundler's output, and a strip that
  // assumed one occurrence left the other sitting between the module and its
  // `export`.
  const withoutMap = source.replace(/(?:\r?\n)?\/\/# sourceMappingURL=.*/g, '').trimEnd()
  const block = EXPORT_BLOCK.exec(withoutMap)
  if (block === null) {
    throw new Error(
      `build-client: ${spec} does not end in a single \`export { … }\` statement, so it cannot be compiled in`,
    )
  }
  const bindings = (block[1] ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
    .map((entry) => {
      // `local as exported`, or a name that is already both.
      const parts = entry.split(/\s+as\s+/)
      const local = parts[0] ?? ''
      const exported = parts[1] ?? local
      return `${exported}: ${local}`
    })
  if (bindings.length === 0) {
    throw new Error(`build-client: ${spec} exports nothing`)
  }
  return `\t\tlet ${aliasFor(spec)} = (function () {\n${withoutMap.slice(0, block.index).trimEnd()}\n\t\treturn { ${bindings.join(', ')} };\n\t\t})();\n`
}

/**
 * Splice this plugin's own modules in above the template.
 *
 * Only the modules the template actually asks for are read, so an unused entry
 * costs nothing and an import left dangling is caught by {@link rewriteImports}
 * rather than silently ignored. Each module is spliced in whole, at its own
 * indentation and with its `export` keywords intact: `stripExports` removes
 * those for the whole compiled body, which is what lets {@link ENVELOPE_EXPORTS}
 * name a declaration made in either file.
 * @param template - the template source.
 * @returns the template, with the requested modules above it.
 * @throws {Error} when a requested module is missing or exports nothing.
 */
function inlineLocalModules(template) {
  const parts = []
  for (const [spec, file] of LOCAL_MODULES) {
    if (!template.includes(`from '${spec}'`)) continue
    const path = join(root, file)
    let source
    try {
      source = readFileSync(path, 'utf8')
    } catch {
      throw new Error(`build-client: ${spec} is missing (${path} is missing); the import site in src/client.js names it`)
    }
    if (!/^export /m.test(source)) {
      throw new Error(`build-client: ${spec} exports nothing for the envelope to re-export`)
    }
    parts.push(source.trimEnd())
  }
  if (parts.length === 0) return template
  return `${parts.join('\n\n')}\n\n${template}`
}

/**
 * Rewrite every static import into a `let <alias> = require('<spec>')`
 * binding, exactly as the shipped bundles are emitted.
 * @param source - the template source.
 * @returns the transformed source and the specifiers it requests.
 */
function rewriteImports(source) {
  const requested = []
  const namedBindings = []
  const defaultBindings = []
  let matched = 0

  const body = source.replace(IMPORT_PATTERN, (...args) => {
    const groups = args.at(-1)
    const { default: defaultName, named, spec } = groups
    matched += 1

    // A module of this plugin's own is spliced in ABOVE, so its declarations are
    // already in this scope and must survive `qualifyImports` untouched: nothing
    // is registered as a binding here, and the import site becomes a note.
    if (LOCAL_MODULES.has(spec)) return `\t\t// ${spec} is compiled in above`

    requested.push(spec)

    const generated = aliasFor(spec)
    // A default import binds the alias itself (`let _react = require("react")`
    // is the whole module object); a named one reaches through a property read.
    // Both are resolved to the alias so the emitted body never mentions the
    // original local name.
    if (defaultName !== undefined) {
      if (!/^[A-Za-z_$][\w$]*$/.test(defaultName)) {
        throw new Error(`build-client: unsupported default import name "${defaultName}"`)
      }
      defaultBindings.push([spec, defaultName])
    }
    for (const entry of (named ?? '').split(',')) {
      const trimmed = entry.trim()
      if (trimmed === '') continue
      if (!/^[A-Za-z_$][\w$]*$/.test(trimmed)) {
        throw new Error(
          `build-client: unsupported named import "${trimmed}" from "${spec}" — write the local name identical to the exported name`,
        )
      }
      namedBindings.push([spec, trimmed])
    }
    // A compiled-in module declares its alias in the prelude instead of asking
    // the module table for it, so the import site becomes a note rather than a
    // `require`.
    if (VENDORED.has(spec)) return `\t\t// ${spec} is compiled in above`
    return `\t\tlet ${generated} = require(${JSON.stringify(spec)});`
  })

  if (matched === 0) throw new Error('build-client: no static imports found in src/client.js')
  return { body, requested, namedBindings, defaultBindings }
}

/**
 * Resolve every imported identifier to its `require` alias, matching how DSH's
 * own bundles consume the module table. The replacement is anchored so it can
 * never touch an already-qualified access, a string, or a property name.
 * @param body - source whose imports have been rewritten.
 * @param bindings - the `rewriteImports` binding lists.
 * @returns the rewritten source.
 */
function qualifyImports(body, { namedBindings, defaultBindings }) {
  let out = body
  const seen = new Set()
  const replaceIdentifier = (name, replacement) => {
    if (seen.has(name)) return
    seen.add(name)
    const pattern = new RegExp(`(?<![.\\w$'"\`])${name}(?=[\\s(.,;)\\]}])`, 'g')
    out = out.replace(pattern, replacement)
  }
  for (const [spec, name] of defaultBindings) replaceIdentifier(name, aliasFor(spec))
  for (const [spec, name] of namedBindings) replaceIdentifier(name, `${aliasFor(spec)}.${name}`)
  return out
}

/**
 * The plugin-identity declaration the template carries. The build substitutes
 * the real package name, which is the value the theme registry pins an override
 * layer to and the roster keys a bundle on. Keeping it single-sourced in
 * package.json means a rename cannot desynchronize the bundle id, the theme
 * layer, and the loader row.
 */
const IDENTITY_PATTERN = /\/\* dsh:plugin-id \*\/\s*(['"])[^'"]*\1/

/**
 * Substitute the template's identity declaration with the real package name.
 * @param body - source after import rewriting.
 * @returns the source with the single declaration substituted.
 * @throws {Error} when the declaration is missing or repeated.
 */
function substituteIdentity(body) {
  const matches = body.match(new RegExp(IDENTITY_PATTERN.source, 'g')) ?? []
  if (matches.length !== 1) {
    throw new Error(
      `build-client: src/client.js must contain exactly one /* dsh:plugin-id */ identity declaration (found ${String(matches.length)})`,
    )
  }
  return body.replace(IDENTITY_PATTERN, JSON.stringify(PACKAGE_NAME))
}

/**
 * Strip the template's `export` keywords. The envelope re-exports
 * {@link ENVELOPE_EXPORTS} from the factory, so each of those only has to be a
 * top-level declaration — exporting it is optional and is removed either way.
 * @param body - transformed template source.
 * @returns source without declaration exports.
 */
function stripExports(body) {
  for (const name of ENVELOPE_EXPORTS) {
    const declaration = new RegExp(
      `^(?:export )?(?:const|let|var|function|class) ${name}\\b`,
      'm',
    )
    if (!declaration.test(body)) {
      throw new Error(
        `build-client: src/client.js must declare \`${name}\` at the top level for the envelope to re-export`,
      )
    }
  }
  const stripped = body.replace(/^export (const|let|var|function|class) /gm, '$1 ')
  if (/^\s*export\s/m.test(stripped)) {
    throw new Error(
      'build-client: src/client.js contains an export form the build cannot strip (only top-level declarations may be exported)',
    )
  }
  return stripped
}

/**
 * Wrap the transformed source in the DSH client-bundle envelope.
 * @param body - transformed, export-stripped template source.
 * @param prelude - the compiled-in module declarations, if any.
 * @returns the complete bundle text.
 */
function wrap(body, prelude = '') {
  const exports = ENVELOPE_EXPORTS.map((name) => `\t\texports.${name} = ${name};`).join('\n')
  return `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(PACKAGE_NAME)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${prelude}${body.trimEnd()}
${exports}
\t\treturn module.exports;
\t}
});
`
}

/**
 * Compile the template into the complete bundle text.
 * @returns the bundle and the specifiers it requests.
 * @throws {Error} on any import shape the transformation cannot express.
 */
function compile() {
  const template = readFileSync(sourcePath, 'utf8')
  const { body, requested, namedBindings, defaultBindings } = rewriteImports(
    inlineLocalModules(template),
  )

  for (const spec of requested) {
    if (PLATFORM_SINGLETONS.has(spec) || VENDORED.has(spec)) continue
    throw new Error(
      `build-client: src/client.js imports "${spec}", which is not a platform singleton; declare it in dsh.client.external and ship it as its own client bundle, or compile it in via VENDORED`,
    )
  }

  const prelude = [...VENDORED]
    .filter(([spec]) => requested.includes(spec))
    .map(([spec, file]) => vendorDeclaration(spec, file))
    .join('')

  return {
    bundle: wrap(
      substituteIdentity(qualifyImports(stripExports(body), { namedBindings, defaultBindings })),
      prelude,
    ),
    requested,
  }
}

/** Compile and write, reporting what changed. @returns whether the file changed. */
function build() {
  const { bundle, requested } = compile()
  let existing
  try {
    existing = readFileSync(outputPath, 'utf8')
  } catch {
    existing = undefined
  }
  if (existing === bundle) {
    console.log('build-client: lib/client.js already up to date')
    return false
  }
  writeFileSync(outputPath, bundle, 'utf8')
  console.log(
    `build-client: wrote lib/client.js (${String(bundle.length)} bytes, requires ${[...new Set(requested)].join(', ')})`,
  )
  return true
}

if (process.argv.includes('--check')) {
  let existing
  try {
    existing = readFileSync(outputPath, 'utf8')
  } catch {
    console.error('build-client: lib/client.js is missing; run `node scripts/build-client.mjs`')
    process.exit(1)
  }
  if (existing !== compile().bundle) {
    console.error('build-client: lib/client.js is stale; run `node scripts/build-client.mjs`')
    process.exit(1)
  }
  console.log('build-client: lib/client.js is up to date')
} else if (process.argv.includes('--watch')) {
  build()
  console.log('build-client: watching src/client.js (Ctrl-C to stop)')
  let timer
  watch(sourcePath, () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      try {
        build()
      } catch (error) {
        // Keep watching: a syntax error mid-edit must not kill the watcher.
        console.error(String(error instanceof Error ? error.message : error))
      }
    }, 50)
  })
} else {
  build()
}
