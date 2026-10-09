# ccusage-dashboards

**Local-first usage dashboards for coding agents**, powered by the official [ccusage](https://github.com/ccusage/ccusage) npm CLI.

Monitor Claude Code, Codex, Antigravity and other supported sources using interactive, local-only token and cost visualizations. This project is **independent of upstream ccusage**: no Rust source, no fork release workflow, no private API integration.

## Install without cloning GitHub

Once this package is **published to npm**, simply run:

```powershell
npx ccusage-dashboards@latest
```

Or with Bun:

```powershell
bunx ccusage-dashboards@latest
```

Both commands automatically install the dashboard and its official `ccusage` CLI dependency from npm into the package-manager cache, then launch the local web app. Open **http://127.0.0.1:4177**. Use `Ctrl+C` to stop.

**Important:** The npm package is a release candidate, **not yet published**. These `npx`/`bunx` commands will work only after the maintainer publishes `ccusage-dashboards` to npm. The public GitHub repository and PR alone do not create a registry package. Node.js 20+ must currently be installed even when starting through Bun, because the executable uses a Node shebang.

For a persistent command after publication:

```powershell
npm install --global ccusage-dashboards
ccusage-dashboards
ccusage-dashboards --port 4178
```

## Developer checkout (works before npm publication)

Requires Node.js 20+ with npm (Bun may manage dependencies as an alternative).

```powershell
git clone -b feat/standalone-dashboard-migration https://github.com/tosumitdhaka/ccusage-dashboards.git
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
- **Future customization foundation:** versioned dashboard configuration, widget registry and supported metric registry. A full drag/drop editor is planned, not yet shipped.
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

The source UI is dependency-light vanilla JS/SVG to preserve the existing dashboard appearance. Future layout customization is described in [custom dashboard architecture](docs/CUSTOMIZATION.md).

## Project status

**v0.1.0 npm packaging release candidate**, pending PR review, CI, npm registry publication and merge. Earlier dashboard development remains on [the original fork PR](https://github.com/tosumitdhaka/ccusage-web/pull/1) as historical source; releases will come from this standalone repository.

The official ccusage project is separately maintained and MIT licensed. This repository depends on its published package rather than vendoring its native code.

## Publishing

The npm distribution is assembled using the `bin` field in `package.json`.
The actual CLI executable is `bin/ccusage-dashboards.mjs`, and the npm
package contains all browser assets under `public/`. CI checks the tarball
file list on Windows and Ubuntu before publication.

Maintainers: see [npm publishing checklist](docs/PUBLISHING.md).
The app is **not available through npx/bunx until publication succeeds**.
