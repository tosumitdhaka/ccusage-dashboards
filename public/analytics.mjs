// Chart data is derived from the unified --by-agent ccusage report.
// A model's "category volume" is the sum of its reported token categories;
// it is NOT necessarily the same as a provider's upstream totalTokens.
const METRICS = ["totalTokens", "inputTokens", "outputTokens", "cacheCreationTokens", "cacheReadTokens", "totalCost"];
const TOKENS = METRICS.filter((x) => x !== "totalCost");
const safe = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
const metrics = () => Object.fromEntries(METRICS.map((k) => [k, 0]));
const add = (a, b) => { for (const k of METRICS) a[k] += safe(b?.[k]); return a; };
const modelMetrics = (m) => {
  const row = metrics();
  for (const k of TOKENS.filter((x) => x !== "totalTokens")) row[k] = safe(m?.[k]);
  row.totalTokens = row.inputTokens + row.outputTokens + row.cacheCreationTokens + row.cacheReadTokens;
  row.totalCost = safe(m?.cost);
  return row;
};
const breakdowns = (row) => Array.isArray(row?.modelBreakdowns) ? row.modelBreakdowns.filter((m) => typeof m?.modelName === "string") : [];
const providers = (row) => Array.isArray(row?.agents) ? row.agents.filter((p) => typeof p?.agent === "string") : row?.agent && row.agent !== "all" ? [row] : [];
const periodOf = (row) => row?.period ?? row?.date ?? row?.month ?? row?.week ?? "";
const put = (map, key, data) => add(map.get(key) ?? (map.set(key, metrics()), map.get(key)), data);
const modelRows = (row, model) => {
  const matching = breakdowns(row).filter((x) => model === "all" || x.modelName === model);
  return matching.map((m) => ({ name: m.modelName, ...modelMetrics(m), missingPricing: m.missingPricing === true }));
};
const scopedRows = (row, agent) => {
  if (agent !== "all") return providers(row).filter((p) => p.agent === agent);
  return providers(row);
};
function scopeValue(row, { agent, model }) {
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
function groupValues(row, { agent, model, breakdown }) {
  const map = new Map();
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

export function chartCatalog(report) {
  if (!report || !Array.isArray(report.daily)) throw new Error("ccusage unified JSON requires daily array");
  const agents = new Set(), models = new Set();
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

export function buildChart(report, {
  period = "daily", agent = "all", model = "all",
  breakdown = "total", metric = "totalTokens"
} = {}) {
  if (!["daily", "weekly", "monthly"].includes(period)) throw new Error("Unsupported period");
  if (!["total", "provider", "model"].includes(breakdown)) throw new Error("Unsupported breakdown");
  if (!METRICS.includes(metric)) throw new Error("Unsupported metric");
  const buckets = new Map();
  const sums = new Map();
  for (const row of report?.[period] ?? []) {
    const key = periodOf(row);
    if (typeof key !== "string" || !key) continue;
    if (!buckets.has(key)) buckets.set(key, new Map());
    for (const [name, value] of groupValues(row, { agent, model, breakdown })) {
      put(buckets.get(key), name, value);
      put(sums, name, value);
    }
  }
  const keys = [...sums].sort((a, b) => b[1][metric] - a[1][metric]).map(([name]) => name);
  return {
    metric, period, model, agent, breakdown,
    isModelCategorySum: model !== "all" && metric === "totalTokens" ||
      breakdown === "model" && metric === "totalTokens",
    series: keys.map((name) => ({ name, value: sums.get(name)[metric] })),
    points: [...buckets].sort(([a], [b]) => a.localeCompare(b))
      .map(([label, groups]) => ({
        label, values: Object.fromEntries(keys.map((name) => [name, groups.get(name)?.[metric] ?? 0]))
      })),
    total: keys.reduce((sum, name) => sum + sums.get(name)[metric], 0)
  };
}

export function buildSessions(report, { agent = "all", model = "all", metric = "totalTokens", limit = 12 } = {}) {
  if (!METRICS.includes(metric)) throw new Error("Unsupported session metric");
  const list = (report?.session ?? []).flatMap((row) => {
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
  return list.sort((a, b) => b.value - a.value).slice(0, Math.max(1, Math.min(30, limit)));
}

// An hourly chart needs timestamped event records, which the unified report
// does not contain. These are *observed increments* between successful polls;
// attribution is to observation time, never asserted as event occurrence time.
export function buildObservedHourly(snapshots, filters = {}) {
  const metric = filters.metric ?? "totalTokens";
  const series = new Map();
  const buckets = new Map();
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
      buckets.get(hour).set(name, (buckets.get(hour).get(name) ?? 0) + delta);
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
    total: keys.reduce((s, name) => s + series.get(name), 0)
  };
}
