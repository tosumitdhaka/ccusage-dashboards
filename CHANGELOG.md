# Changelog

## v0.2.0 — Customizable dashboard (development; not published)

- Browser-local dashboard view with show/hide controls for all seven existing widgets and editable view title.
- Persist report period, provider/model, cost/token metric, line grouping and session graph metric.
- Validated, size-bounded JSON import/export; reset to defaults; never persist agent usage logs or secrets.
- New schema/storage regressions; no drag/drop or resize yet.

## v0.1.1 — Restore published npm executable (proposed)

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
