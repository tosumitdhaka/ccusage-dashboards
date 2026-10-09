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
