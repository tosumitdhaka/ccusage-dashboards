# ccusage-dashboards

**Local-first usage dashboards for coding agents**, powered by the official [ccusage](https://github.com/ccusage/ccusage) npm CLI.

Monitor Claude Code, Codex, Antigravity and other supported sources using interactive, local-only token and cost visualizations. This project is **independent of upstream ccusage**: no Rust source, no fork release workflow, no private API integration.

## Quick start

Requires **Node.js 20+ with npm**, or Bun with its package installer.

```powershell
git clone https://github.com/tosumitdhaka/ccusage-dashboards.git
cd ccusage-dashboards
npm install
npm run dashboard
```

Open **http://127.0.0.1:4177**. Press `Ctrl+C` to stop. The command launches the dashboard and invokes ccusage automatically; **do not separately install or run ccusage**.

Bun is supported as a package manager and launcher:

```powershell
bun install
bun run dashboard
```

You can test ccusage directly with `bunx ccusage -j`, or request the full unified report used by this app:

```powershell
bunx ccusage daily --sections daily,weekly,monthly,session --by-agent -j
```

The installed `ccusage` version is pinned in `package.json` and managed as a normal application dependency. We invoke its public CLI as a subprocess; **ccusage does not currently expose a stable JavaScript report API**.

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

**v0.1.0 release candidate**, pending PR review, CI and merge. Earlier dashboard development remains on [the original fork PR](https://github.com/tosumitdhaka/ccusage-web/pull/1) as historical source; releases will come from this standalone repository.

The official ccusage project is separately maintained and MIT licensed. This repository depends on its published package rather than vendoring its native code.
