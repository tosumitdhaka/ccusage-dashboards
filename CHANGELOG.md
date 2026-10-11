# Changelog

## v0.3.0 — Layout and custom graphs (development, unreleased)

- Inline graph header filters instead of extra Adjust-menu clicks.
- Compact 2-column cache metrics even when the notes panel is hidden.
- Responsive unified grid: drag-to-reorder, accessible Earlier/Later buttons, half/full widget widths, and browser-local persistence.
- Create up to four validated line/bar graphs from existing local ccusage metrics; no imported-code execution or CSV parsing.
- Older dashboard exports migrate to default layout and empty custom graphs.

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
