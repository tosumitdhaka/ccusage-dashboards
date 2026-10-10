// Schema v1: data-only, validated dashboard presentation preferences.
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
  filters: {
    period: "daily", provider: "all", model: "all",
    metric: "totalTokens", breakdown: "total", sessionMetric: "totalTokens"
  },
  widgetSettings: {
    trend: { showLabels: true, maxSeries: 6 },
    providers: { metric: "totalTokens", limit: 12 },
    models: { metric: "totalTokens", limit: 12 }
  }
});
const FIELDS = new Set(["schemaVersion", "id", "title", "widgets", "filters", "widgetSettings"]);
const GRAPH_FIELDS = Object.freeze({
  trend: new Set(["showLabels", "maxSeries"]),
  providers: new Set(["metric", "limit"]),
  models: new Set(["metric", "limit"])
});
function validateWidgetSettings(settings) {
  if (settings !== undefined && !isRecord(settings)) throw new Error("Invalid widget settings.");
  if (Object.keys(settings ?? {}).some((key) => !Object.hasOwn(GRAPH_FIELDS, key))) {
    throw new Error("Unknown graph setting group.");
  }
  const defaults = DEFAULT_DASHBOARD.widgetSettings;
  const resolved = {};
  for (const name of Object.keys(GRAPH_FIELDS)) {
    const value = settings?.[name];
    if (value !== undefined && !isRecord(value)) throw new Error("Invalid graph setting.");
    if (Object.keys(value ?? {}).some((key) => !GRAPH_FIELDS[name].has(key))) {
      throw new Error("Unknown graph setting.");
    }
    const options = { ...defaults[name], ...(value ?? {}) };
    if (name === "trend") {
      if (typeof options.showLabels !== "boolean") throw new Error("Invalid value labels setting.");
      if (![3, 6, 12].includes(options.maxSeries)) throw new Error("Invalid trend series limit.");
    } else {
      if (!Object.hasOwn(METRIC_NAMES, options.metric)) throw new Error("Invalid graph metric.");
      if (![5, 10, 12].includes(options.limit)) throw new Error("Invalid graph bar limit.");
    }
    resolved[name] = options;
  }
  return resolved;
}
const FILTERS = new Set(["period", "provider", "model", "metric", "breakdown", "sessionMetric"]);
const isRecord = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
function sourceName(name, value) {
  if (typeof value !== "string" || !value.length || value.length > 160 ||
      value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("Invalid " + name + " filter.");
  }
  return value;
}
export function validateDashboardConfig(config) {
  if (!isRecord(config)) throw new Error("Dashboard definition must be an object.");
  if (Object.keys(config).some((key) => !FIELDS.has(key))) throw new Error("Unsupported dashboard field.");
  if (config.schemaVersion !== SCHEMA_VERSION) throw new Error("Unsupported dashboard schema version.");
  if (typeof config.id !== "string" || !/^[a-z0-9-]{1,48}$/.test(config.id)) throw new Error("Invalid dashboard ID.");
  const title = config.title === undefined ? config.id : config.title;
  if (typeof title !== "string" || !title.trim() || title.length > 80 ||
      /[\u0000-\u001f\u007f]/.test(title)) throw new Error("Invalid dashboard title.");
  if (!Array.isArray(config.widgets) || !config.widgets.length ||
      config.widgets.length > Object.keys(WIDGET_REGISTRY).length) throw new Error("Dashboard needs registered widgets.");
  if (config.widgets.some((w) => typeof w !== "string" || !Object.hasOwn(WIDGET_REGISTRY, w))) {
    throw new Error("Unknown widget type.");
  }
  if (new Set(config.widgets).size !== config.widgets.length) throw new Error("Duplicate widget IDs unsupported in schema v1.");
  if (config.filters !== undefined && !isRecord(config.filters)) throw new Error("Invalid dashboard filters.");
  if (Object.keys(config.filters ?? {}).some((key) => !FILTERS.has(key))) throw new Error("Unknown dashboard filter.");
  const filters = { ...DEFAULT_DASHBOARD.filters, ...(config.filters ?? {}) };
  if (!["daily", "weekly", "monthly", "hourly"].includes(filters.period)) throw new Error("Invalid period filter.");
  if (!Object.hasOwn(METRIC_NAMES, filters.metric)) throw new Error("Invalid metric filter.");
  if (!["total", "provider", "model"].includes(filters.breakdown)) throw new Error("Invalid breakdown filter.");
  if (!["totalTokens", "totalCost", "outputTokens"].includes(filters.sessionMetric)) throw new Error("Invalid session metric.");
  sourceName("provider", filters.provider);
  sourceName("model", filters.model);
  return {
    schemaVersion: SCHEMA_VERSION, id: config.id, title,
    widgets: [...config.widgets], filters, widgetSettings: validateWidgetSettings(config.widgetSettings)
  };
}
