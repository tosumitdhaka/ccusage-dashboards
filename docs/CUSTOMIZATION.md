# Customizable dashboard architecture

The v0.2.0 development branch introduces a working, browser-local **Customize dashboard** dialog.
Choose visible widgets, rename the view, preserve provider/model/metric/time filters, and import/export a validated JSON configuration.
Grid drag/drop, resizing and multiple saved named views are still future work.

## Current building blocks

- `public/widget-registry.mjs`: lists supported widgets (`kpis`, `trend`, `providers`, `models`, `cache`, `guidance`, `sessions`) and the filters each can accept.
- `METRIC_NAMES`: canonical metrics and labels (`totalTokens`, input/output/cache, `totalCost`).
- `DEFAULT_DASHBOARD`: schema v1 preset defining ID, title, widgets and default filters.
- `validateDashboardConfig`: rejects unsupported schema versions, unknown widget types, duplicates and invalid IDs.
- `public/analytics.mjs`: reusable pure functions for source/model trends, sessions and observed-hour deltas.
- `ccusage-adapter.mjs`: single boundary for external CLI JSON, independently updatable from the UI.

Example **future** dashboard definition:

```json
{
  "schemaVersion": 1,
  "id": "cost-review",
  "title": "Cost review",
  "widgets": ["kpis", "trend", "models", "sessions"],
  "filters": {
    "period": "weekly",
    "provider": "codex",
    "model": "all",
    "metric": "totalCost",
    "breakdown": "model"
  }
}
```

The app now loads and saves **one active view** using browser `localStorage` for `http://127.0.0.1:4177`.
Use the **Customize** button to show or hide registered widgets, rename the view, reset defaults, or export/import JSON.
Changes to the period, provider, model, metric, line breakdown and session metric are saved automatically.
Only the validated configuration is stored/exported; neither agent logs nor hourly snapshots are included.
Configurations never cross browsers, origin ports or devices automatically. Import accepts up to 16 KiB.
Invalid import leaves the existing view untouched. If storage is unavailable, changes are only in memory.

## Evolution path

1. **v0.2:** One locally saved active view, show/hide widgets, saved filters, validated JSON import/export. Multiple named saved views remain an additional v0.2 follow-up.
2. **v0.3:** Multiple dashboard presets, drag/drop grid, resize and dashboard duplication. Migrate versioned definitions without mutating usage logs.
3. **v0.4:** New widget types, provider-specific panels, task tags and optional GitHub issue/PR attribution (never inferred automatically).
4. **v0.5+:** Adapter contracts for other local usage tools and optionally richer timestamped events for accurate hourly charts.

Keep dashboard config separate from observed-hour snapshots and provider logs. Never store secrets in browser-exportable configuration. A future write API must validate origins, CSRF defenses, schema and path constraints; read-only local server is the v0.1 default.

## Accuracy policy

Model-level totalTokens can be a sum of available categories rather than the authoritative upstream total, and must be labeled as such. Unknown model prices must remain visibly unpriced. Subscription-quota percentages cannot be inferred from token volume.

## v0.2 refinement — Chart settings and warning dismissal

- The **Dismiss** control closes the current unknown-pricing notice in the active tab. If missing-model IDs change, the notice reappears. The underlying unknown-price caveat is never treated as zero or persisted as a fictional cost.
- The sidebar marks your current section as you scroll; hidden widgets are removed from sidebar navigation.
- **Show values** places sampled numeric labels on the trend's points. Turn it off for a cleaner chart. The legend buttons can temporarily hide/show individual series; tooltip titles still provide every point value.
- Dimension colors are deterministic: a provider such as `codex` has the same color across provider bars, sessions and trend lines, regardless of token/cost metric.
- Chart options are independent: trend metric and breakdown, trend series limit and visible values; provider bars metric and count; model bars metric and count; session graph metric.
- Graph preferences are included in the validated dashboard JSON and local browser storage. Older v0.2 JSON (without widgetSettings) loads with defaults.

## Graph header adjustments (v0.2)

Each graph has an **⚙ Adjust** control in its header, aligned to the right.
Use it to open the graph's own settings: trend graph metric, line split, series limit
and visible point values; provider/model bar metrics and visible counts; session bar
metric. Settings apply immediately and persist in the browser's active view.
The controls use native expandable buttons for keyboard accessibility and remain
available on narrow screens. They are independent of the global **Customize** dialog.
