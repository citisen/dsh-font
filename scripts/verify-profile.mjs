/**
 * End-to-end profile composition check.
 *
 * Loads the real `web` profile through dsh's own profile loader and asserts the
 * composed entry list contains this bundle's row. This is the check that
 * catches the failure modes a browser never explains: a bundle the loader
 * cannot resolve, a patch file with the wrong shape, or a row that never made
 * it into `dsh.profile.bundles`.
 *
 * Usage:
 *   node scripts/verify-profile.mjs [profile-name]
 */

import { pathToFileURL } from 'node:url'

const profileName = process.argv[2] ?? 'web'
const DSH_ROOT =
  process.env.DSH_CHECKOUT ??
  'C:/Users/Administrator/AppData/Local/npm-cache/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai'
const INSTALL_ANCHOR = `${DSH_ROOT}/dsh/package.json`

const { loadProfile } = await import(pathToFileURL(`${DSH_ROOT}/dsh-app-boot/lib/index.js`).href)

const profile = loadProfile('dsh', profileName, INSTALL_ANCHOR)

const layers = profile.layers.map((layer) => layer.packageName)
console.log(`verify-profile: profile "${profileName}" at ${profile.dir}`)
console.log(`verify-profile: layers = ${layers.join(' -> ')}`)

const index = layers.indexOf('dsh-font')
if (index === -1) {
  throw new Error(
    `verify-profile: "dsh-font" is not a profile layer. Add it to dsh.profile.bundles in ${profile.dir}`,
  )
}
if (index !== layers.length - 1) {
  console.warn(
    `verify-profile: warning — dsh-font is layer ${String(index)} of ${String(layers.length - 1)}; later layers override it`,
  )
}

const own = profile.layers[index]
console.log(`verify-profile: dsh-font patch = ${own.patchPath}`)
if (own.patches.length === 0) {
  throw new Error('verify-profile: the dsh-font patch layer contributed no entries')
}

// The composed entry list is what the loader will actually mount.
const { composeEntries } = await import(pathToFileURL(`${DSH_ROOT}/dsh-app-boot/lib/index.js`).href)
const warnings = []
const entries = composeEntries(
  [...profile.layers.map((layer) => layer.patches), profile.patches],
  (message) => warnings.push(message),
)
const row = entries.find((entry) => entry.id === 'font')
if (row === undefined) {
  throw new Error(
    `verify-profile: the composed entry list has no "font" row; got [${entries.map((entry) => entry.id).join(', ')}]`,
  )
}
if (row.name !== 'dsh-font') {
  throw new Error(`verify-profile: row "font" names "${String(row.name)}", expected "dsh-font"`)
}
if (row.disabled === true) {
  throw new Error('verify-profile: row "font" is disabled')
}
if (warnings.length > 0) {
  console.warn(`verify-profile: loader patch warnings: ${warnings.join('; ')}`)
}

console.log(`verify-profile: OK — ${String(entries.length)} composed entries, "font" -> ${row.name}`)

// ── the browser roster ──────────────────────────────────────────────────────
// `dsh-client-modules` composes the browser roster from the same loader entries
// by reading each package's `dsh.client` and `exports["./client"]`. Reproduce
// that resolution here, because a mistake in either field fails only in the
// browser, as a bare 404 on a combo URL.
const { readFileSync, statSync } = await import('node:fs')
const { createRequire } = await import('node:module')
const { dirname, join } = await import('node:path')

const profileDir = profile.dir
const require_ = createRequire(join(profileDir, 'package.json'))

let manifestPath
try {
  // Resolve the way the loader resolves the row: from the profile directory,
  // where pnpm materialized the dependency.
  manifestPath = require_.resolve('dsh-font/package.json')
} catch (error) {
  throw new Error(`verify-profile: cannot resolve dsh-font/package.json from ${profileDir}: ${String(error)}`)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const decl = manifest.dsh?.client
if (decl === undefined) throw new Error('verify-profile: dsh-font declares no dsh.client')
if (decl.platform !== 'web') {
  throw new Error(`verify-profile: dsh.client.platform is "${String(decl.platform)}", expected "web"`)
}

const clientExport = manifest.exports?.['./client']
const clientRelative =
  typeof clientExport === 'string' ? clientExport : clientExport?.default
if (typeof clientRelative !== 'string') {
  throw new Error('verify-profile: exports["./client"] must be a string or an object with a string default')
}
const clientPath = join(dirname(manifestPath), clientRelative)
try {
  statSync(clientPath)
} catch {
  throw new Error(
    `verify-profile: client bundle not found at ${clientPath} — run \`npm run build\` before launching`,
  )
}

// The bundle id must equal the package name the roster keys on.
const bundleSource = readFileSync(clientPath, 'utf8')
const declaredId = /__ModuleLoader__\.load\(\{\s*id:\s*"([^"]+)"/.exec(bundleSource)?.[1]
if (declaredId !== manifest.name) {
  throw new Error(
    `verify-profile: lib/client.js registers id "${String(declaredId)}" but the package is "${String(manifest.name)}"`,
  )
}

const inject = decl.inject ?? []
for (const dependency of inject) {
  if (dependency === manifest.name) {
    throw new Error('verify-profile: dsh.client.inject must not name the package itself')
  }
}

console.log(
  `verify-profile: OK — client roster entry id=${String(declaredId)} inject=[${inject.join(', ')}] immediately=${String(decl.immediately === true)}`,
)
console.log(`verify-profile: client bundle ${clientPath} (${String(bundleSource.length)} bytes)`)
