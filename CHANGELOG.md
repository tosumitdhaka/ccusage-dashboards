# Changelog

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
