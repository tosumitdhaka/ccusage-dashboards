// Strongly typed analytical outputs with permissive upstream row boundaries.
type Row = Record<string,any>;
type Metrics = Record<string,number>;
type ChartRow = {name:string;value:number};
type ChartPoint = {label:string;values:Record<string,number>};
export interface ChartResult {
 metric:string;period:string;model:string;agent:string;breakdown:string;
 isModelCategorySum:boolean;series:ChartRow[];points:ChartPoint[];total:number;
}
// Chart data is derived from the unified --by-agent ccusage report.
// A model's "category volume" is the sum of its reported token categories;
// it is NOT necessarily the same as a provider's upstream totalTokens.
const METRICS = ["totalTokens", "inputTokens", "outputTokens", "cacheCreationTokens", "cacheReadTokens", "totalCost"];
const TOKENS = METRICS.filter((x) => x !== "totalCost");
const safe = (n: unknown): number => typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
const metrics = (): Metrics => Object.fromEntries(METRICS.map((k) => [k, 0]));
const add = (a: Metrics, b: Row|null|undefined): Metrics => { for (const k of METRICS) a[k] += safe(b?.[k]); return a; };
const modelMetrics = (m: Row): Metrics => {
  const row = metrics();
  for (const k of TOKENS.filter((x) => x !== "totalTokens")) row[k] = safe(m?.[k]);
  row.totalTokens = row.inputTokens + row.outputTokens + row.cacheCreationTokens + row.cacheReadTokens;
  row.totalCost = safe(m?.cost);
  return row;
};
const breakdowns = (row: Row): Row[] => Array.isArray(row?.modelBreakdowns) ? row.modelBreakdowns.filter((m) => typeof m?.modelName === "string") : [];
const providers = (row: Row): Row[] => Array.isArray(row?.agents) ? row.agents.filter((p) => typeof p?.agent === "string") : row?.agent && row.agent !== "all" ? [row] : [];
const periodOf = (row: Row): string => row?.period ?? row?.date ?? row?.month ?? row?.week ?? "";
const put = (map: Map<string,Metrics>, key: string, data: Row): Metrics => {const current=map.get(key)??metrics();map.set(key,current);return add(current,data);};
const modelRows = (row: Row, model: string): Row[] => {
  const matching = breakdowns(row).filter((x) => model === "all" || x.modelName === model);
  return matching.map((m) => ({ name: m.modelName, ...modelMetrics(m), missingPricing: m.missingPricing === true }));
};
const scopedRows = (row: Row, agent: string): Row[] => {
  if (agent !== "all") return providers(row).filter((p) => p.agent === agent);
  return providers(row);
};
function scopeValue(row: Row, { agent, model }: {agent:string;model:string}): Row|null {
  if (model === "all") {
    if (agent === "all") return row && row.agent !== "all" ? row : row;
    return scopedRows(row, agent)[0] ?? null;
  }
  const sources = agent === "all" ? (providers(row).length ? providers(row) : [row]) : scopedRows(row, agent);
  const out = metrics();
  let found = false;
  for (const source of sources) for (const m of modelRows(source, model)) { add(out, m); found = true; }
  return found ? out : null;
}
function groupValues(row: Row, { agent, model, breakdown }: {agent:string;model:string;breakdown:string}): Map<string,Metrics> {
  const map = new Map<string,Metrics>();
  if (breakdown === "total") {
    const v = scopeValue(row, { agent, model });
    if (v) put(map, "Total", v);
  } else if (breakdown === "provider") {
    for (const p of scopedRows(row, agent)) {
      if (model === "all") put(map, p.agent, p);
      else for (const m of modelRows(p, model)) put(map, p.agent, m);
    }
  } else if (breakdown === "model") {
    const srcs = agent === "all" ? (providers(row).length ? providers(row) : [row]) : scopedRows(row, agent);
    for (const src of srcs) for (const m of modelRows(src, model)) put(map, m.name, m);
  }
  return map;
}

export function chartCatalog(report: Row): {agents:string[];models:string[]} {
  if (!report || !Array.isArray(report.daily)) throw new Error("ccusage unified JSON requires daily array");
  const agents = new Set<string>(), models = new Set<string>();
  for (const section of ["daily", "weekly", "monthly"]) for (const row of report[section] ?? []) {
    for (const p of providers(row)) {
      agents.add(p.agent);
      for (const m of breakdowns(p)) models.add(m.modelName);
    }
    for (const m of breakdowns(row)) models.add(m.modelName);
  }
  for (const s of report.session ?? []) {
    if (typeof s.agent === "string") agents.add(s.agent);
    for (const m of breakdowns(s)) models.add(m.modelName);
  }
  return { agents: [...agents].sort(), models: [...models].sort() };
}

export function buildChart(report: Row, {
  period = "daily", agent = "all", model = "all",
  breakdown = "total", metric = "totalTokens"
}: {period?:string;agent?:string;model?:string;breakdown?:string;metric?:string} = {}): ChartResult {
  if (!["daily", "weekly", "monthly"].includes(period)) throw new Error("Unsupported period");
  if (!["total", "provider", "model"].includes(breakdown)) throw new Error("Unsupported breakdown");
  if (!METRICS.includes(metric)) throw new Error("Unsupported metric");
  const buckets = new Map<string,Map<string,Metrics>>();
  const sums = new Map<string,Metrics>();
  for (const row of report?.[period] ?? []) {
    const key = periodOf(row);
    if (typeof key !== "string" || !key) continue;
    if (!buckets.has(key)) buckets.set(key, new Map());
    for (const [name, value] of groupValues(row, { agent, model, breakdown })) {
      put(buckets.get(key)!, name, value);
      put(sums, name, value);
    }
  }
  const keys = [...sums].sort((a, b) => b[1][metric] - a[1][metric]).map(([name]) => name);
  return {
    metric, period, model, agent, breakdown,
    isModelCategorySum: model !== "all" && metric === "totalTokens" ||
      breakdown === "model" && metric === "totalTokens",
    series: keys.map((name) => ({ name, value: sums.get(name)![metric] })),
    points: [...buckets].sort(([a], [b]) => a.localeCompare(b))
      .map(([label, groups]) => ({
        label, values: Object.fromEntries(keys.map((name) => [name, groups.get(name)?.[metric] ?? 0]))
      })),
    total: keys.reduce((sum, name) => sum + sums.get(name)![metric], 0)
  };
}

export type ComparisonPolarity = "neutral" | "higher-is-better" | "lower-is-better";
export type ComparisonSentiment = "neutral" | "positive" | "negative";
export type ComparisonDirection = "up" | "down" | "flat";

export interface MetricDelta {
  current: number;
  previous: number;
  absolute: number;
  ratio: number | null;
  direction: ComparisonDirection;
  sentiment: ComparisonSentiment;
}

export interface PeriodComparison {
  available: boolean;
  label: string;
  days: number | null;
  currentDays: number;
  previousDays: number;
  coverage: "complete" | "partial" | "none";
  current: Metrics;
  previous: Metrics;
  currentRange: { start: string; end: string } | null;
  previousRange: { start: string; end: string } | null;
}

const DAY_MS = 86_400_000;

function comparisonDays(period: string): number | null {
  if (period === "today") return 1;
  if (period === "7d") return 7;
  if (period === "14d") return 14;
  if (period === "30d") return 30;
  if (period === "90d") return 90;
  return null;
}

function dateDay(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const timestamp = Date.parse(value.slice(0, 10) + "T00:00:00Z");
  return Number.isFinite(timestamp) ? Math.floor(timestamp / DAY_MS) : null;
}

function dayLabel(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function totalsForDailyRows(rows: Row[], agent: string, model: string): Metrics {
  const total = metrics();
  for (const row of rows) {
    const scoped = scopeValue(row, { agent, model });
    if (scoped) add(total, scoped);
  }
  return total;
}

export function buildPeriodComparison(report: Row, {
  period = "7d", agent = "all", model = "all"
}: { period?: string; agent?: string; model?: string } = {}): PeriodComparison {
  const days = comparisonDays(period);
  const empty = metrics();
  const label = days === 1 ? "vs previous day" : days ? `vs previous ${days} days` : "No previous-period comparison";
  if (!days || !Array.isArray(report?.daily)) {
    return {
      available: false, label, days, currentDays: 0, previousDays: 0, coverage: "none",
      current: { ...empty }, previous: { ...empty },
      currentRange: null, previousRange: null
    };
  }

  const dated = report.daily.flatMap((row: Row) => {
    const day = dateDay(periodOf(row));
    return day === null ? [] : [{ row, day }];
  });
  if (!dated.length) {
    return {
      available: false, label, days, currentDays: 0, previousDays: 0, coverage: "none",
      current: { ...empty }, previous: { ...empty },
      currentRange: null, previousRange: null
    };
  }

  const anchor = Math.max(...dated.map(({ day }: { day: number }) => day));
  const currentStart = anchor - days + 1;
  const previousEnd = currentStart - 1;
  const previousStart = previousEnd - days + 1;
  const currentRows = dated.filter(({ day }: { day: number }) => day >= currentStart && day <= anchor)
    .map(({ row }: { row: Row }) => row);
  const previousRows = dated.filter(({ day }: { day: number }) => day >= previousStart && day <= previousEnd)
    .map(({ row }: { row: Row }) => row);

  const currentDays = new Set(dated.filter(({ day }: { day: number }) => day >= currentStart && day <= anchor).map(({ day }: { day: number }) => day)).size;
  const previousDays = new Set(dated.filter(({ day }: { day: number }) => day >= previousStart && day <= previousEnd).map(({ day }: { day: number }) => day)).size;
  // Absence of daily rows is not proof of zero-usage days.
  const available = currentDays === days && previousDays === days;
  const coverage = available ? "complete" : currentDays || previousDays ? "partial" : "none";
  return {
    available, currentDays, previousDays, coverage,
    label,
    days,
    current: totalsForDailyRows(currentRows, agent, model),
    previous: totalsForDailyRows(previousRows, agent, model),
    currentRange: { start: dayLabel(currentStart), end: dayLabel(anchor) },
    previousRange: { start: dayLabel(previousStart), end: dayLabel(previousEnd) }
  };
}

export function metricDelta(
  currentValue: unknown,
  previousValue: unknown,
  polarity: ComparisonPolarity = "neutral"
): MetricDelta {
  const current = safe(currentValue);
  const previous = safe(previousValue);
  const absolute = current - previous;
  const epsilon = 1e-12;
  const direction: ComparisonDirection = Math.abs(absolute) <= epsilon ? "flat" : absolute > 0 ? "up" : "down";
  const ratio = previous > 0 ? absolute / previous : current === 0 ? 0 : null;
  let sentiment: ComparisonSentiment = "neutral";
  if (direction !== "flat" && polarity !== "neutral") {
    const improvement = polarity === "higher-is-better" ? direction === "up" : direction === "down";
    sentiment = improvement ? "positive" : "negative";
  }
  return { current, previous, absolute, ratio, direction, sentiment };
}

export function buildSessions(report: Row, { agent = "all", model = "all", metric = "totalTokens", limit = 12 }: {agent?:string;model?:string;metric?:string;limit?:number} = {}) {
  if (!METRICS.includes(metric)) throw new Error("Unsupported session metric");
  const list = (report?.session ?? [] as Row[]).flatMap((row: Row) => {
    if (agent !== "all" && row.agent !== agent) return [];
    const val = model === "all" ? row : scopeValue(row, { agent: row.agent, model });
    if (!val) return [];
    const value = metric === "totalTokens" && model !== "all" ? modelMetrics(
      breakdowns(row).find((m) => m.modelName === model) ?? {}
    ).totalTokens : safe(val[metric]);
    const session = String(periodOf(row));
    return [{
      session, agent: String(row.agent ?? "unknown"), value,
      lastActivity: row.metadata?.lastActivity ?? row.lastActivity ?? null,
      label: (row.agent ?? "agent") + " · " + (session.length > 18 ? session.slice(0, 9) + "…" + session.slice(-6) : session)
    }];
  });
  return list.sort((a: any, b: any) => b.value - a.value).slice(0, Math.max(1, Math.min(30, limit)));
}

// An hourly chart needs timestamped event records, which the unified report
// does not contain. These are *observed increments* between successful polls;
// attribution is to observation time, never asserted as event occurrence time.
export function buildObservedHourly(snapshots: Row[], filters: {agent?:string;model?:string;metric?:string;breakdown?:string} = {}) {
  const metric = filters.metric ?? "totalTokens";
  const series = new Map<string,number>();
  const buckets = new Map<string,Map<string,number>>();
  let observations = 0;
  for (let i = 1; i < (snapshots?.length ?? 0); i++) {
    const previous = snapshots[i - 1], current = snapshots[i];
    if (!previous || !current || previous.day !== current.day || !previous.row || !current.row) continue;
    const before = groupValues(previous.row, { agent: filters.agent ?? "all", model: filters.model ?? "all", breakdown: filters.breakdown ?? "total" });
    const after = groupValues(current.row, { agent: filters.agent ?? "all", model: filters.model ?? "all", breakdown: filters.breakdown ?? "total" });
    const date = new Date(current.timestamp);
    if (!Number.isFinite(date.getTime())) continue;
    const hour = current.timestamp.slice(0, 13) + ":00Z"; // UTC observation hour
    if (!buckets.has(hour)) buckets.set(hour, new Map());
    for (const [name, value] of after) {
      const old = before.get(name);
      if (!old) continue; // new model/provider: no earlier baseline
      const delta = Math.max(0, safe(value[metric]) - safe(old[metric]));
      if (delta === 0) continue;
      buckets.get(hour)!.set(name, (buckets.get(hour)!.get(name) ?? 0) + delta);
      series.set(name, (series.get(name) ?? 0) + delta);
    }
    observations++;
  }
  const keys = [...series].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  return {
    metric, observed: true, observations,
    series: keys.map((name) => ({ name, value: series.get(name) })),
    points: [...buckets].sort(([a], [b]) => a.localeCompare(b))
      .map(([label, data]) => ({ label, values: Object.fromEntries(keys.map((name) => [name, data.get(name) ?? 0])) })),
    total: keys.reduce((s, name) => s + series.get(name)!, 0)
  };
}
