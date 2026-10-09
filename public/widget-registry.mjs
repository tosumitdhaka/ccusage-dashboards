// Schema v1: declarative widget metadata rather than hard-coded dashboard
// definitions. A later layout editor can persist multiple widget instances,
// positions and filters without changing the ccusage JSON adapter.
export const SCHEMA_VERSION = 1;
export const METRIC_NAMES = Object.freeze({
  totalTokens: "Reported tokens",
  inputTokens: "Input tokens",
  outputTokens: "Output tokens",
  cacheReadTokens: "Cache reads",
  cacheCreationTokens: "Cache writes",
  totalCost: "Estimated API cost"
});
export const WIDGET_REGISTRY = Object.freeze({
  kpis: { kind: "stats", title: "Usage summary", supports: ["provider", "model", "period"] },
  trend: { kind: "line", title: "Usage over time", supports: ["provider", "model", "period", "metric", "breakdown"] },
  providers: { kind: "bars", title: "Provider distribution", supports: ["provider", "period", "metric"] },
  models: { kind: "bars", title: "Model distribution", supports: ["provider", "model", "period", "metric"] },
  cache: { kind: "stats", title: "Cache and input", supports: ["provider", "model", "period"] },
  guidance: { kind: "notes", title: "Data notes", supports: [] },
  sessions: { kind: "bars-table", title: "Session explorer", supports: ["provider", "model", "metric"] }
});
export const DEFAULT_DASHBOARD = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  id: "overview",
  title: "AI Usage Overview",
  widgets: ["kpis", "trend", "providers", "models", "cache", "guidance", "sessions"],
  filters: { period: "daily", provider: "all", model: "all", metric: "totalTokens", breakdown: "total" }
});

export function validateDashboardConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("Dashboard definition must be an object.");
  if (config.schemaVersion !== SCHEMA_VERSION) throw new Error("Unsupported dashboard schema version.");
  if (typeof config.id !== "string" || !/^[a-z0-9-]{1,48}$/.test(config.id)) throw new Error("Invalid dashboard ID.");
  if (!Array.isArray(config.widgets) || !config.widgets.length || config.widgets.length > 24) throw new Error("Dashboard needs 1–24 widgets.");
  if (config.widgets.some((w) => typeof w !== "string" || !(w in WIDGET_REGISTRY))) throw new Error("Unknown widget type.");
  if (new Set(config.widgets).size !== config.widgets.length) throw new Error("Duplicate widget IDs unsupported in schema v1.");
  return { schemaVersion: SCHEMA_VERSION, id: config.id, title: String(config.title ?? config.id).slice(0, 80),
    widgets: [...config.widgets],
    filters: { ...DEFAULT_DASHBOARD.filters, ...(config.filters ?? {}) } };
}
