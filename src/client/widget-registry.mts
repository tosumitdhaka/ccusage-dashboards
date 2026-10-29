// Strict TypeScript source for the validated, data-only dashboard schema.
import type { GridLayout } from "./dashboard-layout.mjs";
export type MetricName = "totalTokens"|"inputTokens"|"outputTokens"|"cacheReadTokens"|"cacheCreationTokens"|"totalCost";
export type PeriodRange = "today"|"7d"|"14d"|"30d"|"90d"|"all";
export type Granularity = "daily"|"weekly"|"monthly"|"hourly";
export type Period = "daily"|"weekly"|"monthly"|"hourly"|PeriodRange;
export interface CustomChart {
  id: string; title: string; visual: "line"|"bars"; metric: MetricName;
  breakdown: "total"|"provider"|"model"; period: "daily"|"weekly"|"monthly";
  hiddenDimensions: string[];
}
export interface DashboardFilters {
  period: PeriodRange|string; provider: string; model: string; metric: MetricName;
  breakdown: "total"|"provider"|"model"; sessionMetric: "totalTokens"|"totalCost"|"outputTokens";
}
export interface DashboardConfig {
  schemaVersion: number; id: string; title: string; widgets: string[];
  filters: DashboardFilters; widgetSettings: Record<string,Record<string,any>>;
  layout: GridLayout; charts: CustomChart[];
}
import { validateLayout } from "./dashboard-layout.mjs";
// Schema v1: data-only, validated dashboard presentation preferences.
export const SCHEMA_VERSION = 1;
export const METRIC_NAMES: Readonly<Record<string,string>> = Object.freeze({
  totalTokens: "Reported tokens",
  inputTokens: "Input tokens",
  outputTokens: "Output tokens",
  cacheReadTokens: "Cache reads",
  cacheCreationTokens: "Cache writes",
  totalCost: "Estimated API cost"
});
export const WIDGET_REGISTRY: Readonly<Record<string,{kind:string;title:string;supports:string[]}>> = Object.freeze({
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
    period: "7d", provider: "all", model: "all",
    metric: "totalTokens", breakdown: "total", sessionMetric: "totalTokens"
  },
  widgetSettings: {
    trend: { granularity: "daily", showLabels: true, maxSeries: 6, hiddenDimensions: [] },
    providers: { metric: "totalTokens", limit: 12, hiddenDimensions: [] },
    models: { metric: "totalTokens", limit: 12, hiddenDimensions: [] },
    sessions: { hiddenDimensions: [] },
    cache: { hiddenDimensions: [] },
    kpis: { hiddenDimensions: [] },
    guidance: { hiddenDimensions: [] }
  },
  layout: { widths: { kpis:"full", trend:"full", providers:"half", models:"half", cache:"half", guidance:"half", sessions:"full" } },
  charts: []
});
const FIELDS = new Set(["schemaVersion", "id", "title", "widgets", "filters", "widgetSettings", "layout", "charts"]);
const GRAPH_FIELDS: Readonly<Record<string,ReadonlySet<string>>> = Object.freeze({
  trend: new Set(["granularity", "showLabels", "maxSeries", "hiddenDimensions"]),
  providers: new Set(["metric", "limit", "hiddenDimensions"]),
  models: new Set(["metric", "limit", "hiddenDimensions"]),
  sessions: new Set(["hiddenDimensions"]),
  cache: new Set(["hiddenDimensions"]),
  kpis: new Set(["hiddenDimensions"]),
  guidance: new Set(["hiddenDimensions"])
});
function validateHiddenDimensions(values: unknown): string[] {
  if (values === undefined) return [];
  if (!Array.isArray(values) || values.length > 40 ||
      values.some(name => typeof name !== "string" || !name.trim() || name.length > 160 ||
        /[\u0000-\u001f\u007f]/.test(name)) ||
      new Set(values).size !== values.length) throw Error("Invalid hidden graph dimensions.");
  return [...values];
}
function validateWidgetSettings(settings: unknown): Record<string,Record<string,any>> {
  if (settings !== undefined && !isRecord(settings)) throw new Error("Invalid widget settings.");
  if (Object.keys(settings ?? {}).some((key) => !Object.hasOwn(GRAPH_FIELDS, key))) {
    throw new Error("Unknown graph setting group.");
  }
  const defaults: Record<string,any> = DEFAULT_DASHBOARD.widgetSettings;
  const resolved: Record<string,Record<string,any>> = {};
  for (const name of Object.keys(GRAPH_FIELDS)) {
    const value = (settings as Record<string,any>|undefined)?.[name];
    if (value !== undefined && !isRecord(value)) throw new Error("Invalid graph setting.");
    if (Object.keys(value ?? {}).some((key) => !GRAPH_FIELDS[name].has(key))) {
      throw new Error("Unknown graph setting.");
    }
    const options = { ...defaults[name], ...(value ?? {}) };
    options.hiddenDimensions = validateHiddenDimensions(options.hiddenDimensions);
    if (name === "trend") {
      if (options.granularity !== undefined && !["daily", "weekly", "monthly", "hourly"].includes(options.granularity)) {
        throw new Error("Invalid trend granularity.");
      }
      if (typeof options.showLabels !== "boolean") throw new Error("Invalid value labels setting.");
      if (![3, 6, 12].includes(options.maxSeries)) throw new Error("Invalid trend series limit.");
    } else if (!["sessions","cache","kpis","guidance"].includes(name)) {
      if (!Object.hasOwn(METRIC_NAMES, options.metric)) throw new Error("Invalid graph metric.");
      if (![5, 10, 12].includes(options.limit)) throw new Error("Invalid graph bar limit.");
    }
    resolved[name] = options;
  }
  return resolved;
}
const FILTERS = new Set(["period", "provider", "model", "metric", "breakdown", "sessionMetric"]);
const isRecord = (x: unknown): x is Record<string,any> => x !== null && typeof x === "object" && !Array.isArray(x);
function sourceName(name: string, value: unknown): string {
  if (typeof value !== "string" || !value.length || value.length > 160 ||
      value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("Invalid " + name + " filter.");
  }
  return value;
}

const CHART_FIELDS=new Set(["id","title","visual","metric","breakdown","period","hiddenDimensions"]);
export function validateCustomCharts(charts: unknown): CustomChart[]{
  if(charts===undefined)return [];
  if(!Array.isArray(charts)||charts.length>4)throw Error("Maximum four custom graphs.");
  const ids=new Set<string>();
  return charts.map((chart: unknown)=>{
    if(!isRecord(chart)||Object.keys(chart).some(k=>!CHART_FIELDS.has(k)))throw Error("Invalid custom graph definition.");
    if(typeof chart.id!=="string"||!/^custom-[a-z0-9-]{1,24}$/.test(chart.id)||ids.has(chart.id))
      throw Error("Invalid or duplicate graph ID.");
    ids.add(chart.id);
    if(typeof chart.title!=="string"||!chart.title.trim()||chart.title.length>80||
      /[\u0000-\u001f\u007f]/.test(chart.title))throw Error("Invalid graph title.");
    if(!["line","bars"].includes(chart.visual))throw Error("Unknown graph visualization.");
    if(!Object.hasOwn(METRIC_NAMES,chart.metric))throw Error("Unknown graph metric.");
    if(!["daily","weekly","monthly"].includes(chart.period))throw Error("Invalid graph period.");
    if(!["total","provider","model"].includes(chart.breakdown))throw Error("Invalid graph breakdown.");
    return {id:chart.id,title:chart.title,visual:chart.visual as CustomChart["visual"],metric:chart.metric as MetricName,
      period:chart.period as CustomChart["period"],breakdown:chart.breakdown as CustomChart["breakdown"],hiddenDimensions:validateHiddenDimensions(chart.hiddenDimensions)};
  });
}
export function validateDashboardConfig(config: unknown): DashboardConfig {
  if (!isRecord(config)) throw new Error("Dashboard definition must be an object.");
  if (Object.keys(config).some((key) => !FIELDS.has(key))) throw new Error("Unsupported dashboard field.");
  if (config.schemaVersion !== SCHEMA_VERSION) throw new Error("Unsupported dashboard schema version.");
  if (typeof config.id !== "string" || !/^[a-z0-9-]{1,48}$/.test(config.id)) throw new Error("Invalid dashboard ID.");
  const title = config.title === undefined ? config.id : config.title;
  if (typeof title !== "string" || !title.trim() || title.length > 80 ||
      /[\u0000-\u001f\u007f]/.test(title)) throw new Error("Invalid dashboard title.");
  const charts=validateCustomCharts(config.charts);
  const known=[...Object.keys(WIDGET_REGISTRY),...charts.map(chart=>chart.id)];
  if (!Array.isArray(config.widgets) || !config.widgets.length ||
      config.widgets.length > known.length) throw new Error("Dashboard needs registered widgets.");
  if (config.widgets.some(w=>typeof w!=="string"||!known.includes(w))) {
    throw new Error("Unknown widget type.");
  }
  if (new Set(config.widgets).size !== config.widgets.length) throw new Error("Duplicate widget IDs unsupported in schema v1.");
  if (config.filters !== undefined && !isRecord(config.filters)) throw new Error("Invalid dashboard filters.");
  if (Object.keys(config.filters ?? {}).some((key) => !FILTERS.has(key))) throw new Error("Unknown dashboard filter.");
  const filters = { ...DEFAULT_DASHBOARD.filters, ...(config.filters ?? {}) };
  const VALID_PERIODS = new Set(["today", "7d", "14d", "30d", "90d", "all", "daily", "weekly", "monthly", "hourly"]);
  if (!VALID_PERIODS.has(filters.period)) throw new Error("Invalid period filter.");
  if (!Object.hasOwn(METRIC_NAMES, filters.metric)) throw new Error("Invalid metric filter.");
  if (!["total", "provider", "model"].includes(filters.breakdown)) throw new Error("Invalid breakdown filter.");
  if (!["totalTokens", "totalCost", "outputTokens"].includes(filters.sessionMetric)) throw new Error("Invalid session metric.");
  sourceName("provider", filters.provider);
  sourceName("model", filters.model);
  return {
    schemaVersion: SCHEMA_VERSION, id: config.id, title,
    widgets: [...config.widgets], filters, widgetSettings: validateWidgetSettings(config.widgetSettings),
    layout: validateLayout(config.layout,known,config.widgets), charts
  };
}
