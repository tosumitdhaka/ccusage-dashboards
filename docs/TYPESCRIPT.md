# TypeScript application migration

All maintained application and release-tooling modules are authored in
TypeScript and compiled to the existing JavaScript runtime paths. Users
install and run ordinary JavaScript; neither the published CLI nor the
localhost UI requires TypeScript to be present at runtime.

## Authoritative source

| TypeScript source | Emitted JavaScript |
| --- | --- |
| `src/client/dashboard.ts` | `public/dashboard.js` |
| `src/client/dashboard-layout.mts` | `public/dashboard-layout.mjs` |
| `src/client/chart-presentation.mts` | `public/chart-presentation.mjs` |
| `src/client/widget-registry.mts` | `public/widget-registry.mjs` |
| `src/client/dashboard-config.mts` | `public/dashboard-config.mjs` |
| `src/client/normalize.mts` | `public/normalize.mjs` |
| `src/client/analytics.mts` | `public/analytics.mjs` |
| `src/node/server.mts` | `server.mjs` |
| `src/node/ccusage-adapter.mts` | `ccusage-adapter.mjs` |
| `src/node/snapshots.mts` | `snapshots.mjs` |
| `src/node/bin/ccusage-dashboards.mts` | `bin/ccusage-dashboards.mjs` |
| `src/node/scripts/*.mts` | `scripts/*.mjs` |

Edit the TypeScript files, **not** the generated JavaScript. The existing
`.test.mjs` files remain Node's dependency-free native test runner tests.
TypeScript and `@types/node` are pinned **devDependencies only**.

## Development commands

```sh
npm ci
npm run typecheck
npm run build
npm run check
npm test
npm run dashboard
```

`npm run build:client` compiles the browser modules. `npm run build:node`
compiles server, CLI and packaging helpers. `npm run check` typechecks,
compiles, and validates syntax. `prepack` invokes `npm run build`
automatically so publishing never packages stale browser or Node code.
CI rejects commits when any of the fourteen generated JavaScript files
disagree with a fresh compiler build. Release smoke tests validate the
installed npm binary and official ccusage adapter.

## Type-safety posture

**Every production TypeScript compiler configuration now has `strict: true`
and `noEmitOnError: true`**, including `tsconfig.dashboard.json`.
Implicit `any` parameters and nullable/invalid indexing now fail the build.
The controller has typed pointer events, grid positions and edit parameters;
some dynamic DOM/report boundaries still use explicit `any` values. Strict
compiler enforcement is complete, but those permissive boundary types
remain opportunities for further type refinement. No `@ts-nocheck` or
blanket exception is used.

## Compatibility contract

- Preserve the localhost-only server, Host validation and restrictive CSP.
- Preserve `/dashboard.js`, all browser `.mjs` URLs and published CLI name.
- Preserve the dashboard storage key and versioned JSON schema.
- Keep report data and snapshots on the local machine; no telemetry.
- Preserve installed package behavior, offline mode and tests.
- Draft PR #11 remains dependent on stabilizing/merging UI PR #10.
- Manual browser acceptance remains required: CSS layout, drag/resize,
  scrollbars, Save/Cancel and actual local ccusage reports.
