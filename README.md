# ccusage-dashboards

**Local-first usage dashboards for coding agents**, powered by the official [ccusage](https://github.com/ccusage/ccusage) npm CLI.

Monitor Claude Code, Codex, Antigravity and other supported sources using interactive, local-only token and cost visualizations. This project is **independent of upstream ccusage**: no Rust source, no fork release workflow, no private API integration.

## Install without cloning GitHub

For the **v0.2.0** release, once published to npm, run from outside the source checkout:

```powershell
npx --yes ccusage-dashboards@0.2.0
```

Or with Bun:

```powershell
bunx ccusage-dashboards@0.2.0
```

Both commands automatically install the dashboard and its official `ccusage` CLI dependency from npm into the package-manager cache, then launch the local web app. Open **http://127.0.0.1:4177**. Use `Ctrl+C` to stop.

**Important:** This source checkout targets v0.2.0. Until the separate npm publication finishes, the registry's `@latest` tag may still resolve to v0.1.1. Node.js 20+ is required even when starting through Bun because the executable uses a Node shebang.

For a persistent command:

```powershell
npm install --global ccusage-dashboards
ccusage-dashboards
ccusage-dashboards --port 4178
```

## Developer checkout

Requires Node.js 20+ with npm (Bun may manage dependencies as an alternative).

```powershell
git clone https://github.com/tosumitdhaka/ccusage-dashboards.git
cd ccusage-dashboards
npm ci
npm run dashboard
```

Or: `bun install` followed by `bun run dashboard`. No separate ccusage installation is necessary.

The dashboard calls the official ccusage CLI using its stable command-line JSON output, not an undocumented JS API. You can independently inspect that JSON with:

```powershell
bunx ccusage daily --sections daily,weekly,monthly,session --by-agent -j
```

## Dashboard features

- KPI totals: reported tokens, input, output, cache reads/writes, estimated API-equivalent cost.
- **Daily, weekly, monthly** charts with provider/model selection and total/provider/model line splits.
- Graph metric toggle between reported tokens, input, output, cache read/write and **estimated USD cost**.
- **Session token and cost charts**, top-model bars and provider comparisons.
- **Observed hourly deltas** stored locally and preserved across restarts. These are measured differences between reports, **not retroactive hourly event data**.
- **v0.2.0 customization:** Configure widget visibility, saved filters/view title, validated JSON import/export, independent graph settings in right-hand header menus, visible value labels, stable provider/model colors, and dismissible pricing warnings. Drag/drop and resizing remain future work.
- Native auto-refresh and conservative pricing warnings; no fabricated rates for `model_placeholder_*` IDs.

## Privacy and accuracy

The server binds to `127.0.0.1` only, rejects non-local Host headers, has a restrictive Content Security Policy and sends no token logs to a dashboard SaaS. By default **ccusage itself may retrieve public pricing catalogs** from LiteLLM/models.dev (disable with `CCUSAGE_OFFLINE=1`). The official npm package is downloaded during dependency installation.

Cost figures are **estimated API equivalents, not subscription charges**. Actual Codex/Claude subscription quotas or reset timers are not available in ccusage JSON. Missing model pricing may understate cost totals. Reports cover locally retained agent data only.

Historical observation snapshots use the original dashboard location: `~/.ccusage-dashboard/history/snapshots.json`. Stop the old fork dashboard before using this standalone app so both processes do not write to that same file.

## Configuration

```powershell
$env:PORT = "4178"             # Change local port
$env:CCUSAGE_OFFLINE = "1"     # Do not refresh public pricing catalogs
$env:CCUSAGE_BIN = "C:\tools\ccusage.exe" # Optional custom native CLI override
npm run dashboard
```

No global CLI install is necessary. For errors, first check `npm install`, Node.js version and network access for model pricing; see [migration and troubleshooting](docs/MIGRATION.md).

## Development

```bash
npm install
npm test
npm run check
```

CI tests Windows and Linux against Node 22, and executes the installed official CLI with an offline JSON smoke test.

The source UI is dependency-light vanilla JS/SVG to preserve the existing dashboard appearance. Current customization and planned future layouts are described in [custom dashboard architecture](docs/CUSTOMIZATION.md).

## Project status

**v0.2.0 source is merged and CI-verified.** npm publishing is a separate authenticated maintainer step; v0.1.1 was the preceding npm and GitHub release. Earlier dashboard development remains on [the original fork PR](https://github.com/tosumitdhaka/ccusage-web/pull/1) as historical source; releases will come from this standalone repository.

The official ccusage project is separately maintained and MIT licensed. This repository depends on its published package rather than vendoring its native code.

## Publishing

The npm distribution is assembled using the `bin` field in `package.json`.
The actual CLI executable is `bin/ccusage-dashboards.mjs`, and the npm
package contains all browser assets under `public/`. CI checks the tarball
file list on Windows and Ubuntu before publication.

Maintainers: see [npm publishing checklist](docs/PUBLISHING.md).
The v0.2.0 package provides the same `npx`/`bunx` executable after the npm version is published and visible in the registry.

## v0.2 customization

v0.2.0 adds browser-local customization.
Open **Customize** to select panels, edit the view name, reset preferences or import/export a JSON preset.
Selections and metric/provider/model/period filters are stored in your browser's localStorage for the dashboard origin.
This data contains no agent sessions, private logs, pricing catalog, or API keys.
A different port or browser has different preferences; import/export provides manual transfer.
After the v0.2.0 npm release, verify the exact version from a fresh terminal outside the checkout before relying on `@latest`.
