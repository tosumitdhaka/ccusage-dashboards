# Changelog

## v0.3.0 — TypeScript Foundation, Customizable Grid & Responsive UI

- **TypeScript Foundation:** Authoritative source migrated to strict TypeScript across client (`src/client/`) and Node backend/CLI (`src/node/`) with zero production runtime dependencies.
- **Persistent Header & Period Range:** Sticky navigation bar (`.topbar`) with backdrop blur and global Period date range selector (`Today`, `Last 7 Days` [default], `Last 14 Days`, `Last 30 Days`, `Last 90 Days`, `All Time`).
- **High-Density 12-Column Grid:** Snap-aligned 12-column desktop grid with compact 8px gutters, free-position header dragging, real-time drop ghost preview, and automated collision resolution.
- **8-Edge & Corner Resizing:** Interactive 8-zone resizing with live bounding outline preview and atomic commit on release.
- **Unified Layout Customization Toolbar:** In-place dashboard title editing, live toggleable widget chips (KPIs, Trend, Providers, Models, Cache, Notes, Sessions), layout lock/unlock, layout reset, and validated JSON export/import.
- **Per-Widget Granularity:** Granularity controls (`Daily`, `Weekly`, `Monthly`, `Hourly`) embedded directly in widget headers, independent of the global calendar range.
- **Instant Touch-Enabled Floating Tooltips:** Dynamic HTML tooltips on SVG trend charts with instant touch and hover tracking.
- **Accessible Mobile Navigation Drawer:** Responsive breakpoint (`<= 740px`) with mobile slide-out drawer navigation, dedicated toggle button, and touch-friendly vertical card stacking.
- **WCAG 2.1 AA Accessibility:** High-contrast palette (> 6.7:1), explicit `:focus-visible` focus indicators, accessible table semantics, and dialog backdrop dismissal.
- **Visibility-Aware Background Polling:** Smart telemetry polling pauses when browser tab is inactive (`document.hidden`) and resumes on focus.
- **Safe Iterative Reductions:** Iterative reduction routines eliminate V8 engine call stack limits on high-volume historical logs.
- **Custom Graph Builder:** Create up to four local, sandboxed line or ranked bar charts from `ccusage` report metrics.
- **Responsive Input & Cache Cards:** Adaptive card layouts expanding to four columns when wide and consolidating to two or one column when narrow.

## v0.2.1 — Reproducible npm release publication

- Publish the exact pre-validated `npm pack` archive instead of repacking the source during `npm publish`.
- Fail immediately on an existing npm version whose immutable tarball differs from the candidate.
- Fix GitHub Actions preflight error handling so registry verification failures cannot be ignored.
- No dashboard UI or usage-calculation changes from v0.2.0.

## v0.2.0 — Customizable dashboard

- Browser-local dashboard view with show/hide controls for all seven existing widgets and editable view title.
- Persist report period, provider/model, cost/token metric, line grouping and session graph metric.
- Validated, size-bounded JSON import/export; reset to defaults; never persist agent usage logs or secrets.
- Independent trend/provider/model/session chart controls in right-aligned Adjust menus; visible value labels and stable provider/model colors.
- Scroll-aware sidebar section highlights and dismissible unknown-pricing notices (estimated costs remain qualified).
- Windows/Linux package and schema/storage regressions; no drag/drop or resize yet.

## v0.1.1 — Restore published npm executable

- Fix the npm `bin` path so publish-time manifest normalization retains `ccusage-dashboards`.
- Add regression checks for npm dry-run publication and the generated executable shim in clean installations.
- The initial v0.1.0 publication omitted the executable declaration; use v0.1.1 after release.

## v0.1.0 — Standalone dashboard migration (release candidate)

- Independent project `tosumitdhaka/ccusage-dashboards`, without vendored upstream Rust/CLI source.
- npm/bunx executable packaging (`ccusage-dashboards`) with shipped web assets and CLI flags `--help`, `--version`, `--port` (available once published).
- Official `ccusage@20.0.26` npm dependency and a bounded, shell-free JSON CLI adapter.
- Preserved original AI Usage Observatory interface: totals, provider/model views, charts for tokens/cache/cost, sessions and observed hourly trends.
- Versioned widget registry and dashboard-config validator for future saved and custom layouts.
- Local-only access control, no upstream release workflow, independent release naming.
- Cross-platform Node unit/integration tests and official CLI JSON smoke test.
- Continued reuse of existing `~/.ccusage-dashboard/history/snapshots.json` observations.

Limitations: estimated API-equivalent costs can be incomplete for unpriced models; hourly series are observed deltas, not historical event times; official subscription quota remaining is unavailable.
