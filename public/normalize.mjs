// Pure, browser-and-Node compatible normalization of ccusage's unified JSON.
// Daily, weekly, and monthly are distinct aggregations: never sum sections together.
const FIELDS = ["inputTokens", "outputTokens", "cacheCreationTokens", "cacheReadTokens", "totalTokens", "totalCost"];
const TOKEN_FIELDS = FIELDS.slice(0, 5);

function number(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function emptyTotals() {
  return Object.fromEntries(FIELDS.map((key) => [key, 0]));
}

function accumulate(target, row) {
  for (const key of FIELDS) target[key] += number(row?.[key]);
}

function periodLabel(row, section) {
  const raw = row?.period ?? row?.date ?? row?.month ?? row?.week;
  return typeof raw === "string" ? raw : "";
}

function agentRows(row) {
  if (Array.isArray(row?.agents)) return row.agents.filter((a) => a && typeof a.agent === "string");
  return row?.agent && row.agent !== "all" ? [row] : [];
}

function pickRow(row, agent) {
  if (agent === "all") return row;
  return agentRows(row).find((item) => item.agent === agent);
}

export function buildView(report, { section = "daily", agent = "all" } = {}) {
  if (!report || typeof report !== "object" || !Array.isArray(report.daily)) {
    throw new Error("Expected ccusage unified JSON containing a daily array.");
  }
  if (!["daily", "weekly", "monthly"].includes(section)) {
    throw new Error("Unsupported reporting period.");
  }
  const rows = Array.isArray(report[section]) ? report[section] : [];
  const providers = new Set();
  for (const r of report.daily) for (const a of agentRows(r)) providers.add(a.agent);
  for (const s of Array.isArray(report.session) ? report.session : []) {
    if (typeof s?.agent === "string" && s.agent !== "all") providers.add(s.agent);
  }

  const totals = emptyTotals();
  const trend = [];
  const providerMap = new Map();
  const modelMap = new Map();
  const missingPricing = new Set();

  for (const row of rows) {
    const chosen = pickRow(row, agent);
    const label = periodLabel(row, section);
    if (!chosen || !label) continue;
    accumulate(totals, chosen);
    trend.push({ period: label, ...Object.fromEntries(FIELDS.map((key) => [key, number(chosen[key])])) });

    // An aggregate row's per-agent records are authoritative for attribution.
    for (const p of agentRows(row)) {
      if (agent !== "all" && p.agent !== agent) continue;
      if (!providerMap.has(p.agent)) providerMap.set(p.agent, emptyTotals());
      accumulate(providerMap.get(p.agent), p);
    }

    const breakdowns = Array.isArray(chosen.modelBreakdowns) ? chosen.modelBreakdowns : [];
    for (const item of breakdowns) {
      if (!item || typeof item.modelName !== "string" || !item.modelName) continue;
      if (!modelMap.has(item.modelName)) modelMap.set(item.modelName, { modelName: item.modelName, ...emptyTotals(), missingPricing: false });
      const entry = modelMap.get(item.modelName);
      for (const key of TOKEN_FIELDS) entry[key] += number(item[key]);
      entry.totalCost += number(item.cost);
      if (item.missingPricing === true) {
        entry.missingPricing = true;
        missingPricing.add(item.modelName);
      }
    }
  }

  // Totals can differ from sums of displayed token categories for some sources.
  // Preserve upstream totalTokens without recomputing it from cache fields.
  trend.sort((a, b) => a.period.localeCompare(b.period));
  const sessions = (Array.isArray(report.session) ? report.session : [])
    .filter((s) => s && (agent === "all" || s.agent === agent))
    .map((s) => ({
      agent: typeof s.agent === "string" ? s.agent : "unknown",
      session: String(s.period ?? s.session ?? ""),
      totalTokens: number(s.totalTokens),
      totalCost: number(s.totalCost),
      models: Array.isArray(s.modelsUsed) ? s.modelsUsed.filter((m) => typeof m === "string") : [],
      lastActivity: typeof s.metadata?.lastActivity === "string" ? s.metadata.lastActivity : null
    }))
    .sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""))
    .slice(0, 8);

  if (agent === "all" && Array.isArray(report.totals?.unpricedModels)) {
    for (const name of report.totals.unpricedModels) if (typeof name === "string") missingPricing.add(name);
  }

  return {
    section, agent,
    providers: Array.from(providers).sort(),
    totals,
    hasCost: rows.some((r) => pickRow(r, agent) && typeof pickRow(r, agent).totalCost === "number"),
    trend,
    providerTotals: Array.from(providerMap, ([name, value]) => ({ name, ...value })).sort((a, b) => b.totalTokens - a.totalTokens),
    models: Array.from(modelMap.values()).sort((a, b) => b.outputTokens - a.outputTokens).slice(0, 10),
    missingPricing: Array.from(missingPricing).sort(),
    sessions
  };
}
