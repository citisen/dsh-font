# Publishing

`@citisen/dsh-font` is published **only** from GitHub Actions, using npm
[trusted publishing](https://docs.npmjs.com/trusted-publishers). There is no
`NPM_TOKEN` in this repository and there must never be one.

## Why this is safer than a token

A publish token is a bearer secret: anything that can read it can publish to
the package forever, from anywhere, until someone notices and rotates it. It
also generally has to bypass 2FA to be usable by a machine, so it removes the
one control that would otherwise stop an attacker.

Trusted publishing replaces the secret with a **short-lived OIDC identity**
that GitHub mints per workflow run and npm exchanges for a publish grant. There
is nothing to steal, nothing to leak in a log, and nothing to rotate. The grant
is scoped to this repository, this workflow file, and — if you configure it —
this environment, so it cannot be replayed from another repo or a laptop.

npm also attaches a signed provenance attestation automatically, which lets
anyone verify that the published tarball was built from this commit by this
workflow.

## What it does not protect against

Be precise about the threat model, because the gap is easy to miss:

- **It does not stop someone who can push to this repo.** If they can commit to
  a branch the publish workflow runs from, they can run the workflow and
  publish. Trusted publishing moves the trust boundary from "whoever holds the
  token" to "whoever can push" — which is only an improvement if pushing is
  actually harder than holding a token.
  **Enable branch protection on `main`** (require PRs, require review, no force
  pushes) and prefer a protected `npm-publish` environment with required
  reviewers.
- **It does not by itself revoke existing tokens.** If a bypass-2FA automation
  token exists for this account, it can still publish. Removing those is a
  separate step below, and skipping it leaves the old door open.
- **A compromised GitHub account or a malicious dependency in this repo's CI**
  can still misuse the grant. Keep the workflow's dependency surface small and
  pin third-party actions to commit SHAs if you add any.

## One-time setup

### 1. Configure the trusted publisher on npm

Open <https://www.npmjs.com/package/@citisen/dsh-font/access> → **Trusted
Publishers** → *Add a trusted publisher* → **GitHub Actions**, and enter exactly:

| Field | Value |
| --- | --- |
| Organization or user | `citisen` |
| Repository | `dsh-font` |
| Workflow filename | `publish.yml` |
| Environment | `npm-publish` |
| Allowed actions | `npm publish` |

The filename is matched literally and must live at
`.github/workflows/publish.yml`. **Renaming or moving that file stops
publishing** until you update this setting. The environment field must match
the `environment:` key in the workflow; leave both empty/unset if you would
rather not gate releases on reviewer approval.

### 2. Make the publish workflow the only path

On the same page, set **Publishing access** to *Require two-factor
authentication and disallow tokens*.

Then delete every access token that could publish this package:

1. <https://www.npmjs.com/settings/~/tokens> — revoke any **Automation** or
   **Granular** token with publish rights. Check specifically for tokens with
   *bypass 2FA* enabled; those defeat the point.
2. Remove the `//registry.npmjs.org/:_authToken=...` line from `~/.npmrc` on
   every machine that has one, once you no longer intend to publish by hand.
   (The CI workflow already refuses to run if it finds an `.npmrc` or an
   `NODE_AUTH_TOKEN`/`NPM_TOKEN`, so a stray credential fails the release
   rather than silently taking precedence.)

Control that the reduction is real: after revoking, `npm publish` from a local
machine must fail. If it still succeeds, a credential is still live.

### 3. Optionally gate releases on a reviewer

Create an environment named `npm-publish` in *Settings → Environments* and add
required reviewers. The workflow already references it, so no edit is needed.

## Cutting a release

```sh
# on main, with branch protection satisfied
npm version patch --no-git-tag-version   # or minor / major
git commit -am "Release v0.1.1"
git tag v0.1.1
git push --follow-tags
```

Then **Actions → Publish to npm → Run workflow**, choose the dist-tag, and type
the version to confirm.

The workflow refuses to run when:

- the typed confirmation does not match `package.json`
- `npm run check` fails — `lib/client.js` does not match `src/client.js`, or the
  envelope, stylesheet, settings row, or host half is broken
- the version is already on the registry
- you asked for `latest` without a `v<version>` tag pointing at exactly the
  commit being released

## Local publishing

Still possible, and it still runs `npm run check` first via `prepublishOnly`.
It requires an interactive `npm publish` with your 2FA one-time password, which
is the point — there is no token to make it unattended.

## Verifying a published release

```sh
npm view @citisen/dsh-font --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);const v=j['dist-tags'].latest;console.log(v, j.versions[v].dist.integrity);console.log(j.versions[v].dist.attestations)})"
```

For an end-to-end check, install into a scratch profile and run the composition
verifier against that profile:

```sh
dsh plugin --profile scratch add @citisen/dsh-font
node scripts/verify-profile.mjs scratch
```

Note that both halves of a *published* artifact should be verified, not just
composed — the profile verifier proves the loader sees the row, and pointing
`verify-host.mjs` / `verify-client.mjs` at the installed `lib/index.js` and
`lib/client.js` proves the shipped code actually runs. A `files` entry missing
from `package.json` is invisible locally and fatal remotely.
