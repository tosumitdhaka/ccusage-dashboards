// Strictly typed normalization boundary for upstream ccusage unified JSON.
type ReportRow = Record<string, any>;
type Totals = Record<string,number>;
type SessionSummary = {agent:string;session:string;totalTokens:number;totalCost:number;models:string[];lastActivity:string|null};
export interface UsageView {
  section:string;agent:string;providers:string[];totals:Totals;hasCost:boolean;
  trend:Array<{period:string}&Totals>;
  providerTotals:Array<{name:string}&Totals>;
  models:Array<{modelName:string;missingPricing:boolean}&Totals>;
  missingPricing:string[];sessions:SessionSummary[];
}
// Pure, browser-and-Node compatible normalization of ccusage's unified JSON.
// Daily, weekly, and monthly are distinct aggregations: never sum sections together.
const FIELDS: string[] = ["inputTokens", "outputTokens", "cacheCreationTokens", "cacheReadTokens", "totalTokens", "totalCost"];
const TOKEN_FIELDS = FIELDS.slice(0, 5);

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function emptyTotals(): Totals {
  return Object.fromEntries(FIELDS.map((key) => [key, 0]));
}

function accumulate(target: Totals, row: ReportRow): void {
  for (const key of FIELDS) target[key] += number(row?.[key]);
}

function periodLabel(row: ReportRow, section: string): string {
  const raw = row?.period ?? row?.date ?? row?.month ?? row?.week;
  return typeof raw === "string" ? raw : "";
}

function agentRows(row: ReportRow): ReportRow[] {
  if (Array.isArray(row?.agents)) return row.agents.filter((a) => a && typeof a.agent === "string");
  return row?.agent && row.agent !== "all" ? [row] : [];
}

function pickRow(row: ReportRow, agent: string): ReportRow|undefined {
  if (agent === "all") return row;
  return agentRows(row).find((item) => item.agent === agent);
}

export function buildView(report: ReportRow, { section = "daily", agent = "all" }: {section?:string;agent?:string} = {}): UsageView {
  if (!report || typeof report !== "object" || !Array.isArray(report.daily)) {
    throw new Error("Expected ccusage unified JSON containing a daily array.");
  }
  if (!["daily", "weekly", "monthly"].includes(section)) {
    throw new Error("Unsupported reporting period.");
  }
  const rows = Array.isArray(report[section]) ? report[section] : [];
  const providers = new Set<string>();
  for (const r of report.daily) for (const a of agentRows(r)) providers.add(a.agent);
  for (const s of Array.isArray(report.session) ? report.session : []) {
    if (typeof s?.agent === "string" && s.agent !== "all") providers.add(s.agent);
  }

  const totals = emptyTotals();
  const trend: Array<{period:string}&Totals> = [];
  const providerMap = new Map<string,Totals>();
  const modelMap = new Map<string, {modelName:string;missingPricing:boolean}&Totals>();
  const missingPricing = new Set<string>();

  for (const row of rows) {
    const chosen = pickRow(row, agent);
    const label = periodLabel(row, section);
    if (!chosen || !label) continue;
    accumulate(totals, chosen);
    trend.push({ period: label, ...Object.fromEntries(FIELDS.map((key) => [key, number(chosen[key])])) } as {period:string}&Totals);

    // An aggregate row's per-agent records are authoritative for attribution.
    for (const p of agentRows(row)) {
      if (agent !== "all" && p.agent !== agent) continue;
      if (!providerMap.has(p.agent)) providerMap.set(p.agent, emptyTotals());
      accumulate(providerMap.get(p.agent)!, p);
    }

    const breakdowns = Array.isArray(chosen.modelBreakdowns) ? chosen.modelBreakdowns : [];
    for (const item of breakdowns) {
      if (!item || typeof item.modelName !== "string" || !item.modelName) continue;
      if (!modelMap.has(item.modelName)) modelMap.set(item.modelName, { modelName: item.modelName, ...emptyTotals(), missingPricing: false });
      const entry = modelMap.get(item.modelName)!;
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
      models: Array.isArray(s.modelsUsed) ? s.modelsUsed.filter((m: unknown) => typeof m === "string") : [],
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
    hasCost: rows.some((r) => pickRow(r, agent) && typeof pickRow(r, agent)?.totalCost === "number"),
    trend,
    providerTotals: Array.from(providerMap, ([name, value]) => ({ name, ...value } as {name:string}&Totals)).sort((a, b) => b.totalTokens - a.totalTokens),
    models: Array.from(modelMap.values()).sort((a, b) => b.outputTokens - a.outputTokens).slice(0, 10),
    missingPricing: Array.from(missingPricing).sort(),
    sessions
  };
}
