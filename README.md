# ccusage-dashboards

[![npm version](https://img.shields.io/npm/v/ccusage-dashboards.svg)](https://www.npmjs.com/package/ccusage-dashboards)
[![license](https://img.shields.io/github/license/tosumitdhaka/ccusage-dashboards.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue.svg)](docs/TYPESCRIPT.md)

**Local-first usage dashboards for coding agents**, powered by the official [ccusage](https://github.com/ccusage/ccusage) npm CLI.

Monitor Claude Code, Codex, Antigravity, and other supported sources using interactive, local-only token and cost visualizations. This project is **independent of upstream ccusage**: no Rust source, no fork release workflow, no private API integration.

## Quick start (without cloning GitHub)

Run the latest release (**v0.3.0**) directly from outside any source checkout:

```powershell
npx --yes ccusage-dashboards@0.3.0
```

Or with Bun:

```powershell
bunx ccusage-dashboards@0.3.0
```

Both commands automatically install the dashboard and its official `ccusage` CLI dependency from npm into your package manager cache, then launch the local web app. Open **http://127.0.0.1:4177**. Use `Ctrl+C` to stop.

> [!NOTE]
> Node.js 20+ is required even when starting through Bun because the executable shim uses a Node shebang.

For a persistent global installation:

```powershell
npm install --global ccusage-dashboards@0.3.0
ccusage-dashboards
ccusage-dashboards --port 4178
```

## Developer checkout

Requires Node.js 20+ with npm (or Bun as a package manager).

```powershell
git clone https://github.com/tosumitdhaka/ccusage-dashboards.git
cd ccusage-dashboards
npm ci
npm start        # or npm run dashboard
```

The dashboard communicates with the official `ccusage` CLI strictly through stable command-line JSON output, never undocumented internal JS APIs:

```powershell
bunx ccusage daily --sections daily,weekly,monthly,session --by-agent -j
```

## Features in v0.3.0

- **Full TypeScript Foundation & Zero Runtime Overhead:**
  - Modern, type-safe codebase authored in strict TypeScript across client modules (`src/client/`), server, CLI, and build scripts (`src/node/`).
  - Zero production runtime dependencies beyond the official `ccusage` CLI.
  - Shipped as precompiled, standard ESM JavaScript for instant startup without runtime compilation or bundlers.
  - Local-first, privacy-focused architecture keeping all telemetry and snapshots on your machine.
- **Persistent Sticky Header & Period Range Selector:**
  - Sticky top navigation bar (`.topbar`) featuring backdrop blur (`backdrop-filter: blur(12px)`), subtle border, and live status indicator.
  - Global **Period Date Range** selector with synchronized filtering across all visualizations:
    * `Today`
    * `Last 7 Days` (**default**)
    * `Last 14 Days`
    * `Last 30 Days`
    * `Last 90 Days`
    * `All Time`
  - Inline navigation anchors for quick section jumping and mobile drawer toggle.
- **High-Density 12-Column Collision Grid:**
  - Snap-aligned 12-column grid layout with compact 8px gutters (`GRID_GAP_PX = 8`) maximizing information density.
  - Header drag-and-drop reordering with real-time drop ghost preview.
  - Automated collision resolution that pushes displaced cards downward cleanly without overlapping.
  - Accessible keyboard reordering via `⌃` (Move up) and `⌄` (Move down) controls.
- **8-Edge & Corner Resizing:**
  - Interactive 8-zone resizing: grab any border edge (top, bottom, left, right) or any corner grip.
  - Floating snap outline tracks bounding geometry in real time without triggering expensive SVG re-renders during pointer moves.
  - Atomic layout commit on pointer release (`pointerup`).
- **Unified Layout Customization Toolbar:**
  - Streamlined `#layout-toolbar` integrating all view preferences into one surface.
  - In-place dashboard view renaming with live local storage persistence.
  - Live toggleable widget chips (KPIs, Trend, Providers, Models, Cache, Data Notes, Sessions) to show or hide panels on the fly.
  - Layout lock/unlock toggle (`🔒 Layout Locked` / `🔓 Layout Unlocked`) showing the true grid state.
  - One-click layout reset to restore default card placements.
  - Validated JSON configuration export and import (up to 16 KiB, schema-validated, strictly excludes private usage logs or tokens).
- **Per-Widget Granularity Selection:**
  - Granularity controls (`Daily`, `Weekly`, `Monthly`, `Hourly`) located directly within widget headers (e.g. Trend chart and custom graphs).
  - Clean inline dropdowns revealed on hover or focus (`:hover` / `:focus-within`), eliminating redundant global filter bars and preserving chart canvas height.
- **Instant Touch-Enabled HTML Floating Tooltips:**
  - Dynamic HTML floating tooltips on SVG trend charts with instant touch and hover tracking.
  - Formatted breakdown of token categories (Input, Output, Cache Reads/Writes) or estimated USD costs for each data point without clipping.
- **Accessible Mobile Navigation Drawer:**
  - Responsive breakpoint (`<= 740px`) automatically converts the 12-column grid into a clean, single-column vertical stack.
  - Accessible slide-out navigation drawer with dedicated hamburger toggle button (`#menu-toggle`).
  - Desktop-only drag handles gracefully hide on touch screens while retaining accessible arrow reordering.
- **WCAG 2.1 AA Accessibility & High Contrast:**
  - High-contrast color palette exceeding 6.7:1 contrast ratios across text, icons, borders, and charts.
  - Prominent `:focus-visible` focus rings for keyboard navigation.
  - Semantic HTML markup with accessible landmark regions, table header scopes, and ARIA labels.
  - Native dialog dismissal on backdrop click or `Escape` key.
- **Page Visibility-Aware Background Telemetry Polling:**
  - Automatic polling suspension when the dashboard browser tab is hidden or backgrounded (`document.hidden`).
  - Instant resumption when focus returns, conserving CPU cycles, network requests, and battery life.
- **Safe Iterative Reductions:**
  - Memory-safe iterative reduction algorithms replacing recursive or array-spread patterns (e.g. `Math.max(...items)`).
  - Eliminates V8 engine call stack limits (`RangeError: Maximum call stack size exceeded`) when processing long-running or high-volume agent history logs.
- **Custom Graph Builder:**
  - Build up to four custom line or ranked bar charts from local `ccusage` report metrics.
  - Select period, metric (tokens/cache/cost), and grouping (total, provider, model).
  - Strictly sandboxed data-only schema: no arbitrary code execution or unvalidated CSV imports.
- **Comprehensive Observability & Local Snapshots:**
  - KPI summary totals: reported tokens, input, output, cache reads/writes, and estimated API-equivalent cost.
  - Most-used models ranked bar list with unified single-region scrolling.
  - Input and cache breakdown cards adapting automatically between 1, 2, and 4 columns.
  - Session token and cost breakdown table.
  - Observed hourly deltas preserved across restarts (`~/.ccusage-dashboard/history/snapshots.json`).

## Privacy and accuracy

- **Local-only binding:** The server binds exclusively to `127.0.0.1`, validates incoming `Host` headers, and enforces a strict Content Security Policy (CSP).
- **No telemetry / SaaS:** No token logs, session details, or usage telemetry are sent to remote services.
- **Qualified cost estimates:** Cost figures are **estimated API equivalents, not subscription charges**. Actual Codex/Claude subscription quotas or reset timers are not available in ccusage JSON.
- **Honest unpriced models:** Unpriced internal model IDs remain visibly unpriced rather than assigned fabricated zero rates.
- **Offline mode:** By default, `ccusage` may refresh public pricing catalogs from LiteLLM/models.dev. Set `CCUSAGE_OFFLINE=1` to disable catalog network requests.
- **Local snapshot storage:** Historical observations are saved locally to `~/.ccusage-dashboard/history/snapshots.json`.

## Configuration

Configure the dashboard using standard environment variables:

```powershell
$env:PORT = "4178"             # Custom local port (default: 4177)
$env:CCUSAGE_OFFLINE = "1"     # Disable public pricing catalog network fetches
$env:CCUSAGE_BIN = "C:\tools\ccusage.exe" # Custom native ccusage binary override
npm run dashboard
```

For troubleshooting and common migration patterns, see [migration and troubleshooting](docs/MIGRATION.md).

## Development and verification

Authoritative source code is written in TypeScript in `src/client/` and `src/node/` and compiled to standard JavaScript:

```bash
npm ci
npm run typecheck    # Validate TypeScript types across client and node
npm run build        # Compile client and node TypeScript
npm run check        # Full check: typecheck, build, and node --check on all entrypoints
npm test             # Execute 114 native Node unit and integration tests
npm run packcheck    # Dry-run npm pack to verify publishable archive manifest
```

| TypeScript source | Emitted JavaScript | Role |
| --- | --- | --- |
| `src/client/dashboard.ts` | `public/dashboard.js` | Browser controller & UI orchestration |
| `src/client/dashboard-layout.mts` | `public/dashboard-layout.mjs` | Grid math, collision detection & drag/resize |
| `src/client/chart-presentation.mts` | `public/chart-presentation.mjs` | SVG rendering & chart tooltips |
| `src/client/widget-registry.mts` | `public/widget-registry.mjs` | Widget specifications & schema validation |
| `src/client/dashboard-config.mts` | `public/dashboard-config.mjs` | Local storage persistence & migration |
| `src/client/normalize.mts` | `public/normalize.mjs` | CLI JSON report normalization |
| `src/client/analytics.mts` | `public/analytics.mjs` | Metric aggregation & hourly delta tracking |
| `src/node/server.mts` | `server.mjs` | Loopback HTTP server & static asset host |
| `src/node/ccusage-adapter.mts` | `ccusage-adapter.mjs` | Bounded child process execution for ccusage CLI |
| `src/node/snapshots.mts` | `snapshots.mjs` | Hourly snapshot persistence engine |
| `src/node/bin/ccusage-dashboards.mts` | `bin/ccusage-dashboards.mjs` | Published CLI binary entrypoint |

For further details, refer to:
- [Custom Dashboard Architecture](docs/CUSTOMIZATION.md)
- [TypeScript Application Migration](docs/TYPESCRIPT.md)
- [npm Publishing Guide](docs/PUBLISHING.md)
- [Migration from Fork](docs/MIGRATION.md)

## Project status

**v0.3.0** is the release candidate on the `refactor/typescript-foundation` branch, featuring full TypeScript architecture, high-density 12-column grid customization, responsive mobile navigation, WCAG 2.1 AA accessibility, and zero production runtime dependencies.

The official `ccusage` project is separately maintained and MIT licensed. This repository depends on its published npm package rather than vendoring native source.

## Publishing

The npm package distribution is defined by `package.json` with entrypoint `bin/ccusage-dashboards.mjs`. Shipped files include the server, adapter, snapshot engine, and compiled `public/` web assets. CI verifies the tarball file list and checksums before publication.

Maintainers: see the [npm publishing checklist](docs/PUBLISHING.md).
