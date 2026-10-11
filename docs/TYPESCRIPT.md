# TypeScript migration

The dashboard's browser-side code is being migrated incrementally. Public
`.mjs` module paths remain stable, and the localhost server and published
`ccusage-dashboards` executable keep running compiled JavaScript. TypeScript
is only a development dependency; installing the published package does not
require the TypeScript compiler, Vite or React.

## Migrated modules (first two stages)
- `src/client/dashboard-layout.mts` compiles to `public/dashboard-layout.mjs`.
- `src/client/chart-presentation.mts` compiles to `public/chart-presentation.mjs`.
- `src/client/widget-registry.mts` compiles to `public/widget-registry.mjs`.
- `src/client/dashboard-config.mts` compiles to `public/dashboard-config.mjs`.

All four modules are checked under TypeScript strict mode. The other existing
`public` JavaScript modules retain their interfaces until migrated in
subsequent reviewed commits. Generated browser modules are kept in Git so
running the repository does not require an initial build. `npm pack`
and `npm publish` regenerate the modules via `prepack` to keep the
shipped package current with its TypeScript sources.

## Development
```sh
npm ci
npm run typecheck
npm run build:client
npm run check
npm test
npm run dashboard
```

TypeScript source of a migrated module is authoritative; edit `src/client`,
not the corresponding output in `public`. CI compiles before exercising the
Node/browser-compatible ESM unit tests, server tests, packaging smoke checks,
and official ccusage CLI integration.

## Compatibility gates
- No change to dashboard localStorage key or JSON schema.
- No change to the served URLs, CSP, or browser JavaScript import paths.
- No change to npm package binary entry point or runtime dependencies.
- Preserve offline, localhost-only, read-only processing.
- Next: migrate normalization, analytics, dashboard controller,
  and optionally Node backend in separately reviewed steps.
- Browser-based interaction acceptance is still required before a release.
