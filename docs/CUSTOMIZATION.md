# Customizable dashboard architecture

The v0.1.0 application preserves the working charts and introduces a **versioned widget configuration contract**. The drag-and-drop dashboard editor is a **future milestone**, not part of this release.

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

This definition can already be validated as data, but **the UI cannot yet load/edit and persist custom views**. Do not claim custom layouts are functional in v0.1.

## Evolution path

1. **v0.2:** Saved views, show/hide widgets, configure model/provider/date/metric filters through the UI, local JSON import/export.
2. **v0.3:** Multiple dashboard presets, drag/drop grid, resize and dashboard duplication. Migrate versioned definitions without mutating usage logs.
3. **v0.4:** New widget types, provider-specific panels, task tags and optional GitHub issue/PR attribution (never inferred automatically).
4. **v0.5+:** Adapter contracts for other local usage tools and optionally richer timestamped events for accurate hourly charts.

Keep dashboard config separate from observed-hour snapshots and provider logs. Never store secrets in browser-exportable configuration. A future write API must validate origins, CSRF defenses, schema and path constraints; read-only local server is the v0.1 default.

## Accuracy policy

Model-level totalTokens can be a sum of available categories rather than the authoritative upstream total, and must be labeled as such. Unknown model prices must remain visibly unpriced. Subscription-quota percentages cannot be inferred from token volume.
