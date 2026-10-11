# ccusage-dashboards

**Local-first usage dashboards for coding agents**, powered by the official [ccusage](https://github.com/ccusage/ccusage) npm CLI.

Monitor Claude Code, Codex, Antigravity and other supported sources using interactive, local-only token and cost visualizations. This project is **independent of upstream ccusage**: no Rust source, no fork release workflow, no private API integration.

## Install without cloning GitHub

For the latest **published stable package** (v0.2.1), run from outside the source checkout:

```powershell
npx --yes ccusage-dashboards@0.2.1
```

Or with Bun:

```powershell
bunx ccusage-dashboards@0.2.1
```

Both commands automatically install the dashboard and its official `ccusage` CLI dependency from npm into the package-manager cache, then launch the local web app. Open **http://127.0.0.1:4177**. Use `Ctrl+C` to stop.

**Important:** v0.3.0 is under development. The stable npm v0.2.1 package does not yet have drag-to-reorder, half/full widget sizes, or custom graph creation. Node.js 20+ is required even when starting through Bun because the executable uses a Node shebang.

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
- **v0.2.0 customization:** Configure widget visibility, saved filters/view title, validated JSON import/export, chart settings, visible value labels, stable colors, and dismissible pricing warnings. The new drag/drop and resizing preview is described below.
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

**v0.2.1 is the published stable release.** v0.3.0 grid editing and graph building remain in a development pull request until the browser acceptance gate passes. Earlier dashboard development remains on [the original fork PR](https://github.com/tosumitdhaka/ccusage-web/pull/1) as historical source; releases will come from this standalone repository.

The official ccusage project is separately maintained and MIT licensed. This repository depends on its published package rather than vendoring its native code.

## Publishing

The npm distribution is assembled using the `bin` field in `package.json`.
The actual CLI executable is `bin/ccusage-dashboards.mjs`, and the npm
package contains all browser assets under `public/`. CI checks the tarball
file list on Windows and Ubuntu before publication.

Maintainers: see [npm publishing checklist](docs/PUBLISHING.md).
The v0.2.1 package provides the same `npx`/`bunx` executable once the npm version is published and visible in the registry.

## v0.2 customization

v0.2.0 adds browser-local customization.
Open **Customize** to select panels, edit the view name, reset preferences or import/export a JSON preset.
Selections and metric/provider/model/period filters are stored in your browser's localStorage for the dashboard origin.
This data contains no agent sessions, private logs, pricing catalog, or API keys.
A different port or browser has different preferences; import/export provides manual transfer.
After the v0.2.1 npm release, verify the exact version from a fresh terminal outside the checkout before relying on `@latest`.

## v0.3 development preview (not yet on npm)

The v0.3 branch offers a compact, direct-control dashboard editor:
- Each chart's metric/period/group/series options appear directly in its header without an Adjust menu.
- **Input and cache** adapts between 1, 2 and 4 metric columns as its widget widens or narrows.
- **Layout Locked / Layout Unlocked** shows the actual arrangement state. When unlocked, drag by widget headers, resize from borders/corners with a smooth preview, or use slim ⌃/⌄ move controls. Most-used models uses one scrolling area.
- Use each visualization’s **⋮** options to edit graph settings or add/remove/hide dimensions. **New graph** creates up to four local ccusage-derived line/bar graphs with chosen period, metric and grouping. It does not execute arbitrary expressions or import unvalidated CSV; additional data adapters are future work.
- Existing v0.2 saved preferences load with default sizes and no custom graphs.

This work remains read-only toward source logs and stores only whitelisted graph definitions in browser-local configuration. It is **not yet published** as `@latest`.
