# Migration from ccusage-web fork

The previous implementation lived in the `apps/dashboard/` folder of `tosumitdhaka/ccusage-web`, which was a fork of the full upstream ccusage monorepo. This repository contains **only the dashboard**.

## Changes

- Dashboard code and unit tests moved to the repository root (`server.mjs`, `public/` and `*.test.mjs`).
- The official npm package `ccusage@20.0.26` now provides the CLI and platform-native optional dependencies.
- Removed `runtime.mjs` private npm bootstrap and all Rust/monorepo release machinery. Native binaries are managed by npm/Bun during `install`.
- Existing chart UI, read-only server endpoints, caching, privacy and observed-hour local history are preserved.
- Custom dashboard **schema/registry** is introduced; editing/persisting layouts through the browser is future work.

## Migrate existing Windows installation

Stop the old dashboard (Ctrl+C), then:

```powershell
git clone https://github.com/tosumitdhaka/ccusage-dashboards.git
cd ccusage-dashboards
npm install
npm run dashboard
```

Use `bun install` / `bun run dashboard` instead if you prefer Bun. Open http://127.0.0.1:4177.

The previously saved hourly history continues from `%USERPROFILE%\.ccusage-dashboard\history\snapshots.json`. The source coding-agent logs remain untouched.

## Troubleshooting

- **Missing official ccusage:** `npm install` or `bun install` in the new repository.
- **No JSON response:** Verify `node node_modules/ccusage/src/cli.js daily --by-agent -j --offline`.
- **No usage data:** Provider logs must exist locally; account web chats and cloud-only sessions are not imported.
- **Unpriced models:** `model_placeholder_m322` and `model_placeholder_m50` have unresolved model identities. Do not invent prices. Other new models may become priced after ccusage/pricing catalog updates.
- **Empty hourly view:** At least two changed observations are necessary; gaps while the server is not running cannot be reconstructed.
- **Port in use:** set `PORT` to another local port.
- **Refresh pricing disabled:** remove `CCUSAGE_OFFLINE=1`; online catalog lookups require network.
- **Multiple dashboards running:** stop the old process before using the same history file to avoid concurrent writes.

## Release policy

Use independent version tags like `dashboard-v0.1.0`, not upstream ccusage npm/CLI tags. Publish only after the PR passes platform tests and a Windows manual smoke test. Never run upstream tagpr/npm release pipelines in this repository.
