# Publishing `ccusage-dashboards` to npm

This project has its own npm package and the official `ccusage` CLI as a pinned
runtime dependency. Publishing to the npm registry is a **separate maintainer
action**: a GitHub commit/release alone does not make `npx` or `bunx` work.

## Pre-publication checks

1. Confirm ownership/availability of the desired npm package name
   `ccusage-dashboards` (or select an owner-scoped alternative and update
   the bin name/README if the unscoped name is unavailable).
2. Verify a license appropriate for your intended distribution and complete
   any desired security review of the public package.
3. Merge the approved PR to `main` after CI passes and verify the exact
   resulting commit. Do not publish a draft PR directly.
4. Using the release checkout, run:

   ```powershell
   npm ci
   npm run check
   npm test
   npm pack --dry-run --json > package-preview.json
   node scripts/assert-package.mjs package-preview.json
   ```

5. Check the official `ccusage` dependency version is still available on npm
   and its JSON contract matches the dashboard parser.
6. Confirm package contents include `bin/ccusage-dashboards.mjs`,
   `server.mjs`, `ccusage-adapter.mjs`, `snapshots.mjs` and `public/`.
   No agent logs, test fixtures, credentials or `node_modules` belong in
   the tarball.

## Manual release publication (v0.2.0)

Sign into npm with an account authorized to publish the package (npm now
requires appropriate authentication/two-factor policies). From the tested
`main` checkout:

```powershell
npm login
npm publish --access public
```

Do **not** provide npm credentials to the dashboard, add tokens to this repo,
or run `npm publish` automatically on every push. For future automated
releases prefer npm Trusted Publishing with GitHub Actions OIDC, configured
explicitly in npm, with a manual approval/dispatch release workflow.

After the registry confirms publication, first verify `npm view ccusage-dashboards@0.2.0 bin --json`, then test from outside the checkout (the user-facing experience):

```powershell
Push-Location $env:TEMP
npx --yes ccusage-dashboards@0.2.0 --version
npx --yes ccusage-dashboards@0.2.0 --help
Pop-Location
```

Then test `bunx ccusage-dashboards@0.2.0` (Node.js 20+ currently required
because the binary's shebang points to `node`). Verify the browser opens
`http://127.0.0.1:4177` manually and the CLI reads local usage correctly.

Create the independent GitHub Release tag `dashboard-v0.2.0` targeting the
verified merged commit only after publication and post-publish checks succeed.

## Future releases

Bump `package.json` and `package-lock.json` together. Publish each npm
version only once. Pinning the upstream `ccusage` dependency avoids silently
changing its JSON schema; update the pin only after Windows/Linux compatibility
tests and real source-log smoke checks.

## Security and privacy

The package runs a loopback-only HTTP server and reads local agent usage. It
does not require API keys or a cloud account. By default the official
`ccusage` dependency may refresh public pricing metadata. Unpriced internal
model IDs remain visibly unpriced rather than assigned fabricated prices.

## Automated npm/GitHub releases (Trusted Publishing)

The dedicated `.github/workflows/npm-release.yml` is triggered with **Run workflow**
on the `main` branch (not on every push or pull request). Enter the exact
`package.json` version and the tested 40-character `main` commit SHA.

Configure a one-time npm Trusted Publisher from your npm package's **Settings →
Trusted publishing → GitHub Actions**. Use GitHub owner **`tosumitdhaka`**,
repository **`ccusage-dashboards`**, workflow filename **`npm-release.yml`**,
and **no environment**. Explicitly enable permission for **`npm publish`**
(not just `npm stage publish`). Save the trusted publisher. The workflow must
already exist on `main` before you configure npm's setting.

The workflow uses GitHub-hosted Node.js 24, npm 11.5.1+, `id-token: write`,
no npm token and no release dependency cache. It checks the exact main commit,
package and lockfile versions, builds and tests, validates the CLI tarball,
publishes only if the npm version is absent, and fails closed if an existing
version has a different tarball hash. After registry verification, it creates
an exact-SHA GitHub Release `dashboard-vX.Y.Z`. Interrupted runs can resume
only when the published tarball hash matches the tested source.

`npm whoami` in a local shell does not verify OIDC permissions. This workflow
never needs `NPM_TOKEN` or your npm password. Configure publisher identity on
npmjs.com itself (the GitHub connection cannot edit npm package settings).
