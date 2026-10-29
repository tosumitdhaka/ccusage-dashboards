// Strict TypeScript ESM dashboard controller. Public entry remains /dashboard.js.
import { buildView } from "./normalize.mjs";
import { METRIC_NAMES, DEFAULT_DASHBOARD, WIDGET_REGISTRY, validateDashboardConfig, type DashboardConfig } from "./widget-registry.mjs";
import {
  MAX_DASHBOARD_JSON_LENGTH, readDashboardConfig, saveDashboardConfig,
  resetDashboardConfig, parseDashboardJSON, stringifyDashboardConfig
} from "./dashboard-config.mjs";
import { buildChart, buildObservedHourly, buildSessions, chartCatalog } from "./analytics.mjs";
import { colorForDimension, labelPointIndices } from "./chart-presentation.mjs";
import type { GridRect, GridPositions, GridLayout } from "./dashboard-layout.mjs";
import { GRID_COLUMNS, GRID_MAX_ROW, GRID_GAP_PX, GRID_ROW_STEP_PX, relocateGridWidget, snapToGrid, cacheRowsForWidth, visibleGridOrder, compactVisibleLayout, reflowGridAfterResize } from "./dashboard-layout.mjs";

const $ = (id: string): any => document.getElementById(id);
interface DashboardState {
  report: any; hourly: any[]; reportHasCost?: boolean;
  section: string; agent: string; model: string; breakdown: string;
  metric: string; sessionMetric: string;
}
const state: DashboardState = { report: null, hourly: [], section: "30d", agent: "all", model: "all",
  breakdown: "total", metric: "totalTokens", sessionMetric: "totalTokens" };
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const hiddenTrendSeries = new Set<string>();
let dismissedPricingSignature: string|null = null;
function syncGraphControls() {
  const { trend, providers, models } = dashboardConfig.widgetSettings;
  const trendGranularity = $("trend-granularity") as HTMLSelectElement | null;
  if (trendGranularity) trendGranularity.value = trend.granularity || "daily";
  const trendLabels = $("trend-show-labels") as HTMLInputElement | null;
  if (trendLabels) trendLabels.checked = trend.showLabels;
  const trendLimit = $("trend-series-limit") as HTMLSelectElement | null;
  if (trendLimit) trendLimit.value = String(trend.maxSeries);
  const providerMetric = $("provider-metric") as HTMLSelectElement | null;
  if (providerMetric) providerMetric.value = providers.metric;
  const providerLimit = $("provider-limit") as HTMLSelectElement | null;
  if (providerLimit) providerLimit.value = String(providers.limit);
  const modelMetric = $("model-metric") as HTMLSelectElement | null;
  if (modelMetric) modelMetric.value = models.metric;
  const modelLimit = $("model-limit") as HTMLSelectElement | null;
  if (modelLimit) modelLimit.value = String(models.limit);
}
function updateGraphSettings(group: string, patch: Record<string, any>) {
  persistDashboardConfig({
    ...dashboardConfig,
    widgetSettings: {
      ...dashboardConfig.widgetSettings,
      [group]: { ...dashboardConfig.widgetSettings[group], ...patch }
    }
  });
  render();
}
function updateActiveNavigation() {
  const anchors = [...document.querySelectorAll<HTMLElement>(".sidebar .nav-link")];
  const enabled = new Set(dashboardConfig.widgets);
  let current = "overview";
  for (const anchor of anchors) {
    const id = (anchor.getAttribute("href") ?? "").slice(1);
    const target = $(id);
    const visible = id === "overview" || enabled.has(id);
    anchor.hidden = !visible;
    if (visible && target && target.getBoundingClientRect().top <= 175) current = id;
  }
  for (const anchor of anchors) {
    const active = anchor.getAttribute("href") === "#" + current;
    anchor.classList.toggle("active", active);
    if (active) anchor.setAttribute("aria-current", "location");
    else anchor.removeAttribute("aria-current");
  }
}
function scheduleNavigationUpdate() {
  if (navigationFrame) return;
  navigationFrame = requestAnimationFrame(() => { navigationFrame = 0; updateActiveNavigation(); });
}
let navigationFrame = 0;
// Customization holds only presentation settings in browser-local storage.
let dashboardConfig: DashboardConfig = validateDashboardConfig(DEFAULT_DASHBOARD);
let storageWarning = "";
// The initial widget arrangement renders before the asynchronous report loads.
// Initialize edit-session state first: activeLayout() reads layoutDraft.
let arranging=false;
let layoutDraft: GridLayout|null=null;
let layoutDraftWidgets: string[]|null=null;
let layoutDraftTitle: string|null=null;
let activeLayoutGesture=false;
let movementFrame=0;
try { dashboardConfig = readDashboardConfig(window.localStorage); }
catch { storageWarning = "Saved dashboard preferences are unavailable; defaults are in use."; }
function applyFilterState(filters: any) {
  state.section = filters.period || "30d";
  state.agent = filters.provider || "all";
  state.model = filters.model || "all";
  state.metric = filters.metric || "totalTokens";
  state.breakdown = filters.breakdown || "total";
  state.sessionMetric = filters.sessionMetric || "totalTokens";
  const metricEl = $("metric") as HTMLSelectElement | null;
  if (metricEl) metricEl.value = state.metric;
  const breakdownEl = $("breakdown") as HTMLSelectElement | null;
  if (breakdownEl) breakdownEl.value = state.breakdown;
  const sessionMetricEl = $("session-metric") as HTMLSelectElement | null;
  if (sessionMetricEl) sessionMetricEl.value = state.sessionMetric;
  const headerPeriod = $("header-period") as HTMLSelectElement | null;
  if (headerPeriod) headerPeriod.value = state.section;
  syncGraphControls();
}
function configWithCurrentFilters(config = dashboardConfig) {
  return validateDashboardConfig({ ...config, filters: {
    period: state.section, provider: state.agent, model: state.model,
    metric: state.metric, breakdown: state.breakdown, sessionMetric: state.sessionMetric
  } });
}
function showWidgetSelection() {
  syncCustomChartNodes();
  const enabled=new Set(dashboardConfig.widgets);
  const grid=$("dashboard-grid");
  const positions=activeLayout().positions;
  const ordered=visibleGridOrder(positions,Object.keys(positions));
  for(const panel of grid.querySelectorAll("[data-widget]")){
    const id=panel.dataset.widget;
    panel.hidden=!enabled.has(id);
    panel.style.order=String(ordered.indexOf(id));
    const rect=positions[id];
    if(!rect)continue;
    panel.style.gridColumn=(rect.x+1)+" / span "+rect.w;
    panel.style.gridRow=(rect.y+1)+" / span "+rect.h;
    panel.dataset.width=rect.w===12?"full":"half";
    panel.style.setProperty("--grid-rows",String(rect.h));
  }
  $("view-name").textContent=dashboardConfig.title;
  updateActiveNavigation();
}

function persistDashboardConfig(config: any) {
  dashboardConfig = validateDashboardConfig(config);
  storageWarning = "";
  try { saveDashboardConfig(window.localStorage, dashboardConfig); }
  catch { storageWarning = "Could not save to browser storage. This layout works until the page reloads."; }
  showWidgetSelection();
}
function persistFilters() { persistDashboardConfig(configWithCurrentFilters()); }
function replaceDashboardConfig(config: any, persist = true) {
  if (persist) persistDashboardConfig(config);
  else { dashboardConfig = validateDashboardConfig(config); showWidgetSelection(); }
  applyFilterState(dashboardConfig.filters);
  refreshArrangeTools();
  if (state.report) { updateSelectors(); render(); }
}
applyFilterState(dashboardConfig.filters);
showWidgetSelection();
const fmt = (n: any, metric = "totalTokens") => metric === "totalCost" ? money.format(n ?? 0) : compact.format(n ?? 0);
function el(tag: string, cls: string = "", text?: string): any {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
function svgEl(tag: string, attrs: Record<string,any> = {}): any {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}
function empty(target: any, msg: string) { target.replaceChildren(el("p", "empty", msg)); }
function choices(select: HTMLSelectElement, names: string[], allLabel: string, desired = select.value) {
  const selected = desired;
  select.replaceChildren();
  for (const name of ["all", ...names]) {
    const option = el("option", "", name === "all" ? allLabel : name);
    option.value = name;
    select.append(option);
  }
  select.value = ["all", ...names].includes(selected) ? selected : "all";
  return select.value;
}
function availableModels(report: any, agent: string) {
  if (agent === "all") return chartCatalog(report).models;
  const models = new Set<string>();
  for (const period of ["daily", "weekly", "monthly"]) {
    for (const row of report[period] ?? []) {
      const source = (row.agents ?? []).find((s: any) => s.agent === agent);
      for (const model of source?.modelBreakdowns ?? []) if (model.modelName) models.add(model.modelName);
    }
  }
  for (const s of report.session ?? []) {
    if (s.agent === agent) for (const m of s.modelBreakdowns ?? []) if (m.modelName) models.add(m.modelName);
  }
  return [...models].sort();
}
function showChartTooltip(event: MouseEvent | PointerEvent, name: string, dateLabel: string, value: number, color: string, metric: string) {
  let tooltip = $("chart-tooltip");
  if (!tooltip) {
    tooltip = el("div", "chart-tooltip");
    tooltip.id = "chart-tooltip";
    document.body.append(tooltip);
  }
  tooltip.replaceChildren();
  const header = el("div", "chart-tooltip-header", dateLabel);
  const body = el("div", "chart-tooltip-body");
  const swatch = el("span", "chart-tooltip-swatch");
  swatch.style.background = color;
  const nameSpan = el("span", "", name + ": ");
  const valSpan = el("span", "chart-tooltip-value", fmt(value, metric));
  body.append(swatch, nameSpan, valSpan);
  tooltip.hidden = false;
  tooltip.removeAttribute("hidden");
  tooltip.setAttribute("aria-hidden", "false");
  positionChartTooltip(event.clientX, event.clientY);
}
function positionChartTooltip(x: number, y: number) {
  const tooltip = $("chart-tooltip");
  if (!tooltip || tooltip.hidden) return;
  const clampedX = Math.max(70, Math.min(window.innerWidth - 70, x));
  tooltip.style.left = `${clampedX}px`;
  if (y < 60) {
    tooltip.style.top = `${y + 14}px`;
    tooltip.style.transform = "translateX(-50%)";
  } else {
    tooltip.style.top = `${y - 12}px`;
    tooltip.style.transform = "translate(-50%, -100%)";
  }
}
function hideChartTooltip() {
  const tooltip = $("chart-tooltip");
  if (!tooltip) return;
  tooltip.hidden = true;
  tooltip.setAttribute("hidden", "");
  tooltip.setAttribute("aria-hidden", "true");
}
function drawLineChart(data: any, metric: string, options: any = {}) {
  const svg = $(options.svgId ?? "trend-chart");
  const legend = $(options.legendId ?? "trend-legend");
  const activeSection=options.period ?? state.section;
  const activeBreakdown=options.breakdown ?? state.breakdown;
  const invisible=options.hiddenSeries ?? hiddenTrendSeries;
  svg.replaceChildren(); legend.replaceChildren(); svg.addEventListener("pointerleave", hideChartTooltip);
  // Match the actual CSS viewport. A fixed 920×264 viewBox letterboxed the
  // graph at desktop widths, wasting horizontal space around the plot.
  const W = Math.max(320, Math.round(svg.getBoundingClientRect().width || 920));
  const H = Math.max(300, Math.round(svg.getBoundingClientRect().height || 360));
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const L = 78, T = 40, R = 18, B = 48, PW = W - L - R, PH = H - T - B;
  const groupKind = activeBreakdown === "model" ? "model" : "provider";
  const settings = options.settings ?? dashboardConfig.widgetSettings.trend;
  const excluded=new Set(settings.hiddenDimensions ?? []);
  const shown = data.series.filter((s: any)=>!excluded.has(s.name)).slice(0, settings.maxSeries);
  shown.forEach((s: any) => {
    const key = el("button", "legend-item legend-toggle");
    key.type = "button";
    const enabled = !invisible.has(s.name);
    key.setAttribute("aria-pressed", String(enabled));
    key.setAttribute("aria-label", (enabled ? "Hide " : "Show ") + s.name + " series");
    if (!enabled) key.classList.add("muted");
    const marker = el("span", "legend-swatch");
    marker.style.background = colorForDimension(s.name, groupKind);
    key.append(marker, document.createTextNode(s.name));
    key.addEventListener("click", () => {
      if (invisible.has(s.name)) invisible.delete(s.name);
      else invisible.add(s.name);
      if(options.redraw) options.redraw(); else render();
    });
    legend.append(key);
  });
  const names = shown.filter((s: any) => !invisible.has(s.name)).map((s: any) => s.name);
  if (!names.length || !data.points.length) {
    const label = svgEl("text", { x: W / 2, y: H / 2, fill: "#92a0b8", "text-anchor": "middle", "font-size": 15 });
    label.textContent = activeSection === "hourly"
      ? "No observed hourly changes yet — two different snapshots are needed"
      : "No usage records for this selection";
    svg.append(label);
    return;
  }
  let maxValue = 1e-9;
  for (const p of data.points) {
    for (const name of names) {
      const val = p.values[name] ?? 0;
      if (val > maxValue) maxValue = val;
    }
  }
  const ceiling = maxValue * 1.13;
  for (let i = 0; i <= 4; i++) {
    const y = T + PH * i / 4;
    svg.append(svgEl("line", { x1: L, y1: y, x2: W - R, y2: y, stroke: "#29384a", "stroke-dasharray": "4 5" }));
    const text = svgEl("text", { x: L - 9, y: y + 4, "text-anchor": "end", fill: "#8494a9", "font-size": 12 });
    text.textContent = fmt(ceiling * (1 - i / 4), metric); svg.append(text);
  }
  const coords = data.points.map((point: any, i: number) => ({
    ...point, x: L + (data.points.length === 1 ? PW / 2 : i * PW / (data.points.length - 1))
  }));
  const labelledPoints = new Set(labelPointIndices(coords.length, 12));
  for (const [index, name] of names.entries()) {
    const coordsSeries = coords.map((point: any) => ({
      ...point, y: T + PH * (1 - Math.max(0, point.values[name] ?? 0) / ceiling)
    }));
    const color = colorForDimension(name, groupKind);
    const path = coordsSeries.map((p: any, i: number) => (i ? "L" : "M") + p.x + " " + p.y).join(" ");
    svg.append(svgEl("path", { d: path, fill: "none", stroke: color,
      "stroke-width": 3, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    coordsSeries.forEach((p: any, pointIndex: number) => {
      const circle = svgEl("circle", { cx: p.x, cy: p.y, r: 3.8,
        fill: color, stroke: "#111927", "stroke-width": 1.5 });
      const title = svgEl("title");
      const label = activeSection === "hourly" ? p.label.replace("T", " ") : p.label;
      title.textContent = name + " • " + label + ": " + fmt(p.values[name], metric);
      circle.style.cursor = "pointer";
      circle.append(title);
      circle.addEventListener("pointerenter", (e: PointerEvent) => {
        circle.setAttribute("r", "5.5");
        showChartTooltip(e, name, label, p.values[name] ?? 0, color, metric);
      });
      circle.addEventListener("pointermove", (e: PointerEvent) => {
        positionChartTooltip(e.clientX, e.clientY);
      });
      circle.addEventListener("pointerleave", () => {
        circle.setAttribute("r", "3.8");
        hideChartTooltip();
      });
      svg.append(circle);
      if (settings.showLabels && labelledPoints.has(pointIndex)) {
        const text = svgEl("text", {
          x: p.x, y: Math.max(12, p.y - 10 - 14 * (index % 2)),
          fill: color, "font-size": 11,
          "text-anchor": pointIndex === 0 ? "start" : pointIndex === coords.length - 1 ? "end" : "middle",
          "paint-order": "stroke", stroke: "#101827", "stroke-width": 3
        });
        text.textContent = fmt(p.values[name], metric);
        svg.append(text);
      }
    });
  }
  const step = Math.max(1, Math.ceil(coords.length / Math.max(2, Math.floor(PW / 120))));
  coords.forEach((p: any, i: number) => {
    if (i % step !== 0 && i !== coords.length - 1) return;
    const label = svgEl("text", { x: p.x, y: H - 15, "text-anchor": "middle", fill: "#8799ac", "font-size": 12 });
    label.textContent = activeSection === "hourly" ? p.label.slice(5, 13).replace("T", " ") : p.label;
    svg.append(label);
  });
}
function drawBars(id: string, entries: any[], metric: string, emptyMessage: string, limit: number, kind: string, hiddenDimensions: string[]=[]) {
  const target = $(id);
  target.replaceChildren();
  const visible=entries.filter((entry: any)=>!hiddenDimensions.includes(entry.name));
  if (!visible.length) { empty(target, emptyMessage); return; }
  let max = 1e-10;
  for (const e of visible) {
    if (e.value > max) max = e.value;
  }
  visible.slice(0, limit).forEach((item: any) => {
    const group = el("div", "bar-row");
    const label = el("div", "bar-labels");
    const name = el("span", "bar-name", item.name);
    name.title = item.name;
    label.append(name, el("span", "bar-value", fmt(item.value, metric)));
    const track = el("div", "bar-track");
    const fill = el("div", "bar-fill");
    fill.style.width = Math.min(100, item.value / max * 100) + "%";
    fill.style.background = colorForDimension(item.name, kind);
    track.append(fill); group.append(label, track); target.append(group);
  });
}
function drawSessionGraph(rows: any[]) {
  const target = $("session-bars");
  target.replaceChildren();
  if (!rows.length) { empty(target, "No sessions match these filters."); return; }
  let max = 1e-9;
  for (const r of rows) {
    if (r.value > max) max = r.value;
  }
  rows.forEach((r: any, i: number) => {
    const wrapper = el("div", "session-row");
    wrapper.title = r.agent + " / " + r.session + ": " + fmt(r.value, state.sessionMetric);
    const heading = el("span", "session-title", r.label);
    const track = el("div", "bar-track");
    const fill = el("div", "bar-fill");
    fill.style.background = colorForDimension(r.agent, "provider");
    fill.style.width = Math.max(0, r.value / max * 100) + "%";
    track.append(fill);
    wrapper.append(heading, track, el("span", "session-value", fmt(r.value, state.sessionMetric)));
    target.append(wrapper);
  });
}
function drawSessionTable(rows: any[]) {
  const tbody = $("sessions-body"); tbody.replaceChildren();
  if (!rows.length) {
    const tr = el("tr"), td = el("td", "empty-cell", "No sessions match these filters.");
    td.colSpan = 5; tr.append(td); tbody.append(tr); return;
  }
  const costs = new Map<string, number>();
  for (const s of (state.report?.session ?? [])) {
    if (state.agent !== "all" && s.agent !== state.agent) continue;
    const sessionKey = (s.agent ?? "unknown") + "\0" + String(s.period ?? s.date ?? s.session ?? "");
    let cost = 0;
    if (state.model === "all") {
      const c = typeof s.totalCost === "number" ? s.totalCost : s.cost;
      cost = typeof c === "number" && Number.isFinite(c) && c >= 0 ? c : 0;
    } else {
      const bds = Array.isArray(s.modelBreakdowns) ? s.modelBreakdowns : [];
      for (const m of bds) {
        if (m?.modelName === state.model) {
          const c = typeof m.cost === "number" ? m.cost : m.totalCost;
          if (typeof c === "number" && Number.isFinite(c) && c >= 0) cost += c;
        }
      }
    }
    costs.set(sessionKey, cost);
  }
  for (const row of rows.slice(0, 10)) {
    const key = (row.agent ?? "unknown") + "\0" + String(row.session ?? "");
    const sessionCost = typeof row.totalCost === "number" ? row.totalCost :
      (typeof row.cost === "number" ? row.cost : costs.get(key) ?? 0);
    const tr = el("tr");
    tr.append(
      el("td", "agent-cell", row.agent),
      el("td", "session-id", row.session),
      el("td", "numeric", fmt(row.value)),
      el("td", "numeric", state.reportHasCost ? fmt(sessionCost, "totalCost") : "Unavailable"),
      el("td", "subtle", row.lastActivity ? new Date(row.lastActivity).toLocaleString() : "Unknown")
    ); tbody.append(tr);
  }
}
function filterReportByPeriod(rawReport: any, period: string): any {
  if (!rawReport || typeof rawReport !== "object") return rawReport;
  if (!period || period === "all") return rawReport;
  const days = period === "7d" ? 7 : period === "14d" ? 14 : period === "30d" ? 30 : period === "90d" ? 90 : 30;

  let refTime = Date.now();
  if (Array.isArray(rawReport.daily) && rawReport.daily.length > 0) {
    const dates = rawReport.daily
      .map((r: any) => r.period ?? r.date)
      .filter((d: any) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d))
      .map((d: string) => new Date(d + "T23:59:59Z").getTime())
      .filter((t: number) => !isNaN(t));
    if (dates.length > 0) {
      const maxDate = Math.max(...dates);
      if (refTime - maxDate > 14 * 86400 * 1000) {
        refTime = maxDate;
      }
    }
  }

  const cutoffTime = refTime - days * 24 * 60 * 60 * 1000;

  const filterDailyRow = (r: any) => {
    const dStr = r.period ?? r.date;
    if (typeof dStr !== "string") return true;
    const t = new Date(dStr + (dStr.length === 10 ? "T12:00:00Z" : "")).getTime();
    return isNaN(t) || t >= cutoffTime;
  };

  const filterWeeklyRow = (r: any) => {
    const p = r.period ?? r.week ?? r.date;
    if (typeof p !== "string") return true;
    const weekMatch = p.match(/^(\d{4})-W(\d{1,2})$/);
    if (weekMatch) {
      const year = parseInt(weekMatch[1], 10);
      const week = parseInt(weekMatch[2], 10);
      const weekEnd = new Date(Date.UTC(year, 0, 1 + week * 7)).getTime();
      return weekEnd >= cutoffTime;
    }
    const t = new Date(p + (p.length === 10 ? "T12:00:00Z" : "")).getTime();
    return isNaN(t) || t >= cutoffTime;
  };

  const filterMonthlyRow = (r: any) => {
    const p = r.period ?? r.month ?? r.date;
    if (typeof p !== "string") return true;
    const mMatch = p.match(/^(\d{4})-(\d{2})$/);
    if (mMatch) {
      const year = parseInt(mMatch[1], 10);
      const month = parseInt(mMatch[2], 10);
      const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59)).getTime();
      return monthEnd >= cutoffTime;
    }
    const t = new Date(p).getTime();
    return isNaN(t) || t >= cutoffTime;
  };

  const filterSessionRow = (s: any) => {
    const act = s.metadata?.lastActivity ?? s.lastActivity ?? s.period ?? s.date;
    if (typeof act !== "string") return true;
    const t = new Date(act).getTime();
    return isNaN(t) || t >= cutoffTime;
  };

  return {
    ...rawReport,
    daily: Array.isArray(rawReport.daily) ? rawReport.daily.filter(filterDailyRow) : rawReport.daily,
    weekly: Array.isArray(rawReport.weekly) ? rawReport.weekly.filter(filterWeeklyRow) : rawReport.weekly,
    monthly: Array.isArray(rawReport.monthly) ? rawReport.monthly.filter(filterMonthlyRow) : rawReport.monthly,
    session: Array.isArray(rawReport.session) ? rawReport.session.filter(filterSessionRow) : rawReport.session,
  };
}

function filterHourlyByPeriod(snapshots: any[], period: string): any[] {
  if (!Array.isArray(snapshots) || !period || period === "all") return snapshots;
  const days = period === "7d" ? 7 : period === "14d" ? 14 : period === "30d" ? 30 : period === "90d" ? 90 : 30;
  let refTime = Date.now();
  const times = snapshots
    .map((s) => typeof s?.timestamp === "string" ? new Date(s.timestamp).getTime() : NaN)
    .filter((t) => !isNaN(t));
  if (times.length > 0) {
    const maxTime = Math.max(...times);
    if (refTime - maxTime > 14 * 86400 * 1000) refTime = maxTime;
  }
  const cutoffTime = refTime - days * 24 * 60 * 60 * 1000;
  return snapshots.filter((s) => {
    const t = typeof s?.timestamp === "string" ? new Date(s.timestamp).getTime() : NaN;
    return isNaN(t) || t >= cutoffTime;
  });
}

function updateSelectors() {
  const catalog = chartCatalog(state.report);
  const agentEl = $("agent") as HTMLSelectElement | null;
  if (agentEl) state.agent = choices(agentEl, catalog.agents, "All providers", state.agent);
  else state.agent = "all";
  const modelEl = $("model") as HTMLSelectElement | null;
  if (modelEl) state.model = choices(modelEl, availableModels(state.report, state.agent), "All models", state.model);
  else state.model = "all";
}
function render() {
  if (!state.report) return;
  showWidgetSelection();
  const metricEl = $("metric") as HTMLSelectElement | null;
  if (metricEl) metricEl.value = state.metric;
  const breakdownEl = $("breakdown") as HTMLSelectElement | null;
  if (breakdownEl) breakdownEl.value = state.breakdown;
  const sessionMetricEl = $("session-metric") as HTMLSelectElement | null;
  if (sessionMetricEl) sessionMetricEl.value = state.sessionMetric;
  syncGraphControls();

  const activePeriod = state.section || "30d";
  const filteredReport = filterReportByPeriod(state.report, activePeriod);
  const filteredHourly = filterHourlyByPeriod(state.hourly, activePeriod);

  const trendGranularity = dashboardConfig.widgetSettings.trend?.granularity || "daily";
  const trendPeriodKey = trendGranularity === "hourly" ? "daily" : trendGranularity;

  const view = buildView(filteredReport, { section: "daily", agent: state.agent });
  const current = { period: "daily", agent: state.agent, model: state.model };
  // Source and model totals are not necessarily additive to the upstream total.
  const metrics = ["totalTokens", "inputTokens", "outputTokens", "cacheReadTokens", "cacheCreationTokens"];
  const vals = Object.fromEntries(metrics.map((m) => [m, buildChart(filteredReport, { ...current, metric: m }).total]));
  const cost = buildChart(filteredReport, { ...current, metric: "totalCost" }).total;
  const hasCost = (filteredReport.daily ?? []).some((r: any) => typeof r.totalCost === "number");
  state.reportHasCost = hasCost;
  $("stat-tokens").textContent = fmt(vals.totalTokens);
  $("stat-input").textContent = fmt(vals.inputTokens);
  $("stat-output").textContent = fmt(vals.outputTokens);
  $("stat-cost").textContent = hasCost ? fmt(cost, "totalCost") : "Unavailable";
  $("break-input").textContent = fmt(vals.inputTokens);
  $("break-output").textContent = fmt(vals.outputTokens);
  $("break-cache").textContent = fmt(vals.cacheReadTokens);
  $("break-write").textContent = fmt(vals.cacheCreationTokens);
  const cacheHidden=new Set(dashboardConfig.widgetSettings.cache.hiddenDimensions);
  [...document.querySelectorAll<HTMLElement>('[data-widget="cache"] .token-grid>div')].forEach((node,index)=>{
    node.hidden=cacheHidden.has(["Input","Output","Cache reads","Cache writes"][index]);
  });
  const noteHidden=new Set(dashboardConfig.widgetSettings.guidance.hiddenDimensions);
  [...document.querySelectorAll<HTMLElement>('[data-widget="guidance"] .information>div')].forEach((node,index)=>{
    node.hidden=noteHidden.has(["Pricing estimates","Subscription quotas","Local reports"][index]);
  });
  const kpiHidden=new Set(dashboardConfig.widgetSettings.kpis.hiddenDimensions);
  [...document.querySelectorAll<HTMLElement>('[data-widget="kpis"] .kpi')].forEach((node,index)=>{
    node.hidden=kpiHidden.has(["Reported tokens","Fresh input","Generated output","API-equivalent cost"][index]);
  });
  const trendChip = $("trend-period");
  if (trendChip) trendChip.textContent = trendGranularity.toUpperCase();
  const headerPeriod = $("header-period") as HTMLSelectElement | null;
  if (headerPeriod) headerPeriod.value = activePeriod;
  $("chart-heading").textContent = (state.metric === "totalCost" ? "Estimated cost" : "Token consumption") + " over time";
  document.querySelectorAll<HTMLElement>(".period").forEach((button) => {
    const active = button.dataset.period === state.section;
    button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active));
  });
  const filters = { ...current, period: trendPeriodKey, breakdown: state.breakdown, metric: state.metric };
  const chart = trendGranularity === "hourly"
    ? buildObservedHourly(filteredHourly, filters)
    : buildChart(filteredReport, filters);
  drawLineChart(chart, state.metric);
  const notes = [];
  if (trendGranularity === "hourly") notes.push("Hourly is observed deltas between dashboard refreshes (UTC hour), not exact event-time usage. Starts only after two changed readings; gaps reflect missing observation periods. Price refreshes can alter observed cost deltas.");
  if (("isModelCategorySum" in chart && chart.isModelCategorySum) || state.model !== "all" && state.metric === "totalTokens") notes.push("Per-model totals sum token categories and may differ from upstream reported totals.");
  if (chart.series.length > dashboardConfig.widgetSettings.trend.maxSeries) notes.push("Chart draws the top " + dashboardConfig.widgetSettings.trend.maxSeries + " series; increase the series limit or filter the view.");
  if (dashboardConfig.widgetSettings.trend.showLabels && chart.points.length > 12) notes.push("Value labels are sampled to avoid collisions; point tooltips retain every value.");
  if (state.metric === "totalCost") notes.push("API-equivalent estimated cost, not subscription billing. Unknown model prices can understate totals.");
  $("trend-note").textContent = notes.join(" ");
  $("chart-explainer").textContent = trendGranularity === "hourly" ? "Changes observed by this running dashboard; UTC hours" : METRIC_NAMES[state.metric] + " by " + ( ({ daily: "day", weekly: "week", monthly: "month" } as Record<string, string>)[trendGranularity] || "period");
  const providerSettings = dashboardConfig.widgetSettings.providers;
  const modelSettings = dashboardConfig.widgetSettings.models;
  const providerGraph = buildChart(filteredReport, { ...current, period: "daily", metric: providerSettings.metric, breakdown: "provider" });
  const modelGraph = buildChart(filteredReport, { ...current, period: "daily", metric: modelSettings.metric, breakdown: "model" });
  drawBars("provider-bars", providerGraph.series, providerSettings.metric, "No provider breakdown available.", providerSettings.limit, "provider", providerSettings.hiddenDimensions);
  drawBars("model-bars", modelGraph.series, modelSettings.metric, "No model breakdown available.", modelSettings.limit, "model", modelSettings.hiddenDimensions);
  $("provider-summary").textContent = "Ranked by " + METRIC_NAMES[providerSettings.metric].toLowerCase();
  $("model-summary").textContent = "Ranked by " + METRIC_NAMES[modelSettings.metric].toLowerCase();
  const sessions = buildSessions(filteredReport, { agent: state.agent, model: state.model, metric: state.sessionMetric });
  drawSessionGraph(sessions.filter((s: any)=>!dashboardConfig.widgetSettings.sessions.hiddenDimensions.includes(s.agent)));
  drawSessionTable(buildSessions(filteredReport, { agent: state.agent, model: state.model, metric: "totalTokens", limit: 30 }).filter((s: any)=>!dashboardConfig.widgetSettings.sessions.hiddenDimensions.includes(s.agent)).slice(0,10));
  renderCustomCharts(filteredReport, filteredHourly);
  const warnings = state.model === "all" ? view.missingPricing : view.missingPricing.filter((m) => m === state.model);
  const notice = $("notice");
  if (warnings.length) {
    const signature = JSON.stringify([...warnings].sort());
    const placeholders = warnings.filter((m) => /^model_placeholder_/.test(m));
    const named = warnings.filter((m) => !/^model_placeholder_/.test(m));
    const message = [];
    if (named.length) message.push("Pricing unavailable for: " + named.join(", ") + ".");
    if (placeholders.length) message.push("Unidentified internal model IDs: " + placeholders.join(", ") + ".");
    const text = el("span", "", message.join(" ") + " Estimated API-equivalent costs may be understated; no substitute model prices are assumed.");
    const close = el("button", "notice-dismiss", "Dismiss");
    close.type = "button";
    close.setAttribute("aria-label", "Dismiss pricing warning");
    close.addEventListener("click", () => { dismissedPricingSignature = signature; notice.hidden = true; });
    notice.replaceChildren(text, close);
    notice.className = "notice warning";
    notice.hidden = signature === dismissedPricingSignature;
  } else { dismissedPricingSignature = null; notice.hidden = true; }
}
let lastLoadedAt = 0;
async function load() {
  const button = $("refresh");
  button.disabled = true; button.textContent = "↻  Updating…";
  try {
    const response = await fetch("/api/usage", { cache: "no-store" });
    const report = await response.json();
    if (!response.ok) throw new Error(report.error || "Usage unavailable");
    state.report = report;
    try {
      const observations = await fetch("/api/hourly", { cache: "no-store" });
      if (observations.ok) state.hourly = (await observations.json()).observations ?? [];
    } catch { /* Daily/weekly reporting remains usable if hourly history is unavailable. */ }
    updateSelectors();
    lastLoadedAt = Date.now();
    $("updated").textContent = "Updated " + new Date().toLocaleTimeString();
    render();
  } catch (error) {
    const notice = $("notice");
    notice.className = "notice error"; notice.hidden = false;
    notice.textContent = (error instanceof Error ? error.message : "Failed to load report") + " Inspect the dashboard server terminal.";
  } finally { button.disabled = false; button.textContent = "↻  Refresh data"; }
}
const headerPeriod = $("header-period") as HTMLSelectElement | null;
if (headerPeriod) {
  headerPeriod.addEventListener("change", () => {
    state.section = headerPeriod.value;
    persistFilters();
    render();
  });
}
document.querySelectorAll<HTMLElement>(".period").forEach((button) => button.addEventListener("click", () => {
  state.section = button.dataset.period ?? "30d";
  const headerPeriod = $("header-period") as HTMLSelectElement | null;
  if (headerPeriod) headerPeriod.value = state.section;
  persistFilters(); render();
}));
const agentEl = $("agent") as HTMLSelectElement | null;
if (agentEl) agentEl.addEventListener("change", () => { state.agent = agentEl.value; updateSelectors(); persistFilters(); render(); });
const modelEl = $("model") as HTMLSelectElement | null;
if (modelEl) modelEl.addEventListener("change", () => { state.model = modelEl.value; persistFilters(); render(); });
const metricEl = $("metric") as HTMLSelectElement | null;
if (metricEl) metricEl.addEventListener("change", () => { state.metric = metricEl.value; persistFilters(); render(); });
const breakdownEl = $("breakdown") as HTMLSelectElement | null;
if (breakdownEl) breakdownEl.addEventListener("change", () => { state.breakdown = breakdownEl.value; persistFilters(); render(); });
const sessionMetricEl = $("session-metric") as HTMLSelectElement | null;
if (sessionMetricEl) sessionMetricEl.addEventListener("change", () => { state.sessionMetric = sessionMetricEl.value; persistFilters(); render(); });
const trendGranularitySelect = $("trend-granularity") as HTMLSelectElement | null;
if (trendGranularitySelect) {
  trendGranularitySelect.addEventListener("change", () => {
    updateGraphSettings("trend", { granularity: trendGranularitySelect.value });
  });
}
const trendShowLabels = $("trend-show-labels") as HTMLInputElement | null;
if (trendShowLabels) trendShowLabels.addEventListener("change", () => updateGraphSettings("trend", { showLabels: trendShowLabels.checked }));
const trendSeriesLimit = $("trend-series-limit") as HTMLSelectElement | null;
if (trendSeriesLimit) trendSeriesLimit.addEventListener("change", () => updateGraphSettings("trend", { maxSeries: Number(trendSeriesLimit.value) }));
for (const group of ["providers", "models"]) {
  const prefix = group === "providers" ? "provider" : "model";
  const mSelect = $(prefix + "-metric") as HTMLSelectElement | null;
  if (mSelect) mSelect.addEventListener("change", () => updateGraphSettings(group, { metric: mSelect.value }));
  const lSelect = $(prefix + "-limit") as HTMLSelectElement | null;
  if (lSelect) lSelect.addEventListener("change", () => updateGraphSettings(group, { limit: Number(lSelect.value) }));
}
window.addEventListener("scroll", scheduleNavigationUpdate, { passive: true });
window.addEventListener("scroll", hideChartTooltip, { passive: true });

for (const dialog of document.querySelectorAll<HTMLDialogElement>("dialog")) {
  dialog.addEventListener("click", (event) => {
    const rect = dialog.getBoundingClientRect();
    const isOutside = (
      event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom
    );
    if (isOutside) {
      dialog.close();
    }
  });
}

const navToggle = $("mobile-nav-toggle");
const sidebar = document.querySelector<HTMLElement>(".sidebar");
if (navToggle && sidebar) {
  navToggle.addEventListener("click", () => {
    const isOpen = sidebar.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });
  for (const link of sidebar.querySelectorAll<HTMLAnchorElement>(".nav-link")) {
    link.addEventListener("click", () => {
      if (sidebar.classList.contains("is-open")) {
        sidebar.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });
  }
}

function populateCustomizeDialog() {
  const dashTitle = $("dashboard-title") as HTMLInputElement | null;
  if (dashTitle) dashTitle.value = dashboardConfig.title;
  const cfgStatus = $("config-status");
  if (cfgStatus) cfgStatus.textContent = storageWarning;
  const group = $("widget-options");
  if (group) {
    group.replaceChildren();
    const options=[...Object.entries(WIDGET_REGISTRY),...dashboardConfig.charts.map((chart: any)=>[chart.id,{title:chart.title}])];
    for (const [key, widget] of options) {
      const label = el("label", "widget-option");
      const input = el("input");
      input.type = "checkbox"; input.value = key;
      input.checked = dashboardConfig.widgets.includes(key);
      label.append(input, document.createTextNode(widget.title));
      group.append(label);
    }
  }
}
const customizeBtn = $("customize");
if (customizeBtn) {
  customizeBtn.addEventListener("click", () => {
    populateCustomizeDialog();
    const dialog = $("customize-dialog") as HTMLDialogElement | null;
    if (dialog && typeof dialog.showModal === "function") dialog.showModal();
  });
}
const customizeCancel = $("customize-cancel");
if (customizeCancel) {
  customizeCancel.addEventListener("click", () => {
    const dialog = $("customize-dialog") as HTMLDialogElement | null;
    if (dialog && typeof dialog.close === "function") dialog.close();
  });
}
const customizeForm = $("customize-form");
if (customizeForm) {
  customizeForm.addEventListener("submit", (event: any) => {
    event.preventDefault();
    try {
      const optionsEl = $("widget-options");
      const checked = optionsEl ? new Set([...optionsEl.querySelectorAll("input:checked")].map((input: any)=>input.value)) : new Set(dashboardConfig.widgets);
      const widgets = [...dashboardConfig.widgets.filter((id: string)=>checked.has(id)),
        ...[...checked].filter(id=>!dashboardConfig.widgets.includes(id))];
      const titleInput = $("dashboard-title") as HTMLInputElement | null;
      const title = (titleInput ? titleInput.value : dashboardConfig.title).trim();
      const sameVisibility=widgets.length===dashboardConfig.widgets.length&&
        widgets.every(id=>dashboardConfig.widgets.includes(id));
      const layout=sameVisibility?dashboardConfig.layout:layoutAfterVisibilityChange(widgets);
      persistDashboardConfig(configWithCurrentFilters({ ...dashboardConfig, title, widgets, layout }));
      const dialog = $("customize-dialog") as HTMLDialogElement | null;
      if (dialog && typeof dialog.close === "function") dialog.close();
      if (state.report) render();
    } catch (error) {
      const statusEl = $("config-status");
      if (statusEl) statusEl.textContent = error instanceof Error ? error.message : "Invalid dashboard preferences.";
    }
  });
}
const configReset = $("config-reset");
if (configReset) {
  configReset.addEventListener("click", () => {
    try {
      const defaults = resetDashboardConfig(window.localStorage);
      replaceDashboardConfig(defaults, false);
      storageWarning = "";
      populateCustomizeDialog();
    } catch (error) {
      const statusEl = $("config-status");
      if (statusEl) statusEl.textContent = error instanceof Error ? error.message : "Unable to reset preferences.";
    }
  });
}
const configExport = $("config-export");
if (configExport) {
  configExport.addEventListener("click", () => {
    try {
      const json = stringifyDashboardConfig(configWithCurrentFilters());
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = el("a");
      anchor.href = url; anchor.download = "ccusage-dashboard-view.json";
      document.body.append(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      const statusEl = $("config-status");
      if (statusEl) statusEl.textContent = "Exported view settings only; no usage reports or credentials.";
    } catch (error) { const statusEl = $("config-status"); if (statusEl) statusEl.textContent = error instanceof Error ? error.message : String(error); }
  });
}
const configImportTrigger = $("config-import-trigger");
const configImportInput = $("config-import") as HTMLInputElement | null;
if (configImportTrigger && configImportInput) {
  configImportTrigger.addEventListener("click", () => configImportInput.click());
}
if (configImportInput) {
  configImportInput.addEventListener("change", async (event: any) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > MAX_DASHBOARD_JSON_LENGTH) throw new Error("Dashboard JSON exceeds 16 KiB.");
      const imported = parseDashboardJSON(await file.text());
      replaceDashboardConfig(imported);
      populateCustomizeDialog();
      const statusEl = $("config-status");
      if (statusEl) statusEl.textContent = storageWarning || "View imported. Filters and visible widgets updated.";
    } catch (error) {
      const statusEl = $("config-status");
      if (statusEl) statusEl.textContent = error instanceof Error ? error.message : "Unable to import dashboard JSON.";
    }
  });
}

$("refresh").addEventListener("click", load);
// A viewport resize changes both SVG dimensions and label spacing. Recompute
// the plot when the browser resizes rather than stretching the old coordinates.
let resizeFrame = 0;
window.addEventListener("resize", () => {
  refreshArrangeTools();
  if (!state.report) return;
  if (resizeFrame) cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; render(); updateActiveNavigation(); });
});
load();
const AUTO_REFRESH_INTERVAL_MS = 60_000;
setInterval(() => {
  if (document.visibilityState === "hidden") return;
  load();
}, AUTO_REFRESH_INTERVAL_MS);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && Date.now() - lastLoadedAt >= AUTO_REFRESH_INTERVAL_MS) {
    load();
  }
});


const interactiveHeaderTarget=(target: any)=>target.closest("button,select,input,label,a,summary,.viz-menu-trigger,.viz-popover-menu");
function activeLayout(){return layoutDraft??dashboardConfig.layout;}
function currentPosition(id: string){return activeLayout().positions[id];}
function layoutAfterVisibilityChange(widgets: any){
  const positions=compactVisibleLayout(dashboardConfig.layout.positions,widgets,
    $("dashboard-grid").getBoundingClientRect().width);
  const widths={...dashboardConfig.layout.widths};
  if(positions.cache?.w===12)widths.cache="full";
  return {...dashboardConfig.layout,widths,positions};
}
function applyGridPreview(positions: GridPositions){
  const visual=visibleGridOrder(positions,dashboardConfig.widgets);
  for(const panel of $("dashboard-grid").querySelectorAll("[data-widget]")){
    const rect=positions[panel.dataset.widget];
    if(!rect)continue;
    const column=(rect.x+1)+" / span "+rect.w;
    const row=(rect.y+1)+" / span "+rect.h;
    const order=String(visual.indexOf(panel.dataset.widget));
    // Avoid rewriting unchanged grid properties during every animation frame.
    if(panel.style.gridColumn!==column)panel.style.gridColumn=column;
    if(panel.style.gridRow!==row)panel.style.gridRow=row;
    if(panel.style.order!==order)panel.style.order=order;
    const width=rect.w===12?"full":"half";
    if(panel.dataset.width!==width)panel.dataset.width=width;
  }
}
function refreshArrangeTools(){
  const grid=$("dashboard-grid"),gridMode=getComputedStyle(grid).display==="grid";
  $("layout-help").hidden=!arranging||gridMode;
  grid.classList.toggle("is-arranging",arranging);
  $("layout-edit").textContent=arranging?"🔓 Layout Unlocked":"🔒 Edit Layout";
  $("layout-edit").disabled=arranging||!gridMode;
  $("layout-edit").hidden=arranging;
  $("layout-edit").title=arranging?"Save or cancel to finish editing.":
    gridMode?"Unlock to move and resize widgets.":"Grid editing requires a screen wider than 1100px.";
  $("layout-edit").setAttribute("aria-pressed",String(arranging));
  $("layout-edit").setAttribute("aria-label",arranging?
    "Layout unlocked. Save or cancel changes.":"Layout locked. Click to edit positions.");
  $("layout-save").hidden=!arranging;
  $("layout-save").textContent="✓ Save Layout";
  $("layout-save").title="Save widget positions to local storage";
  $("layout-cancel").hidden=!arranging;
  $("layout-cancel").textContent="✕ Cancel";
  $("layout-cancel").title="Discard layout changes and restore saved positions";
  $("add-graph").disabled=arranging;
  if ($("customize")) $("customize").disabled=false;
  const toolbar=$("layout-toolbar");
  if(toolbar)toolbar.hidden=!arranging;
  for(const panel of grid.querySelectorAll("[data-widget]")){
    const header=panel.querySelector(":scope > .section-header") as HTMLElement | null;
    if(header)header.draggable=false;
    for(const edge of panel.querySelectorAll(".layout-resize-edge")){
      edge.hidden=!arranging||!gridMode||panel.hidden;
      edge.tabIndex=arranging&&gridMode&&!panel.hidden?0:-1;
    }
  }
}
function saveGridPosition(id: string,rect: GridRect,type="resize"){
  if(!arranging||!layoutDraft)return;
  const scroll=window.scrollY,previous=layoutDraft.positions;
  const positions=type==="resize"?
    reflowGridAfterResize(previous,id,rect,dashboardConfig.widgets):
    relocateGridWidget(previous,id,rect,dashboardConfig.widgets);
  const widths: GridLayout["widths"]={...layoutDraft.widths,[id]:rect.w===12?"full":"half"};
  layoutDraft={...layoutDraft,widths,positions};
  applyGridPreview(positions);
  // Moving a card changes no chart dimensions. Only redraw a resized plot,
  // after the browser has committed the new geometry, instead of rebuilding
  // every KPI, list, SVG and table on every pointer release.
  if(type==="resize"&&state.report&&(id==="trend"||id.startsWith("custom-"))){
    requestAnimationFrame(()=>{
      if(!arranging||!state.report)return;
      if(id==="trend"){
        const activePeriod = state.section || "30d";
        const filteredReport = filterReportByPeriod(state.report, activePeriod);
        const filteredHourly = filterHourlyByPeriod(state.hourly, activePeriod);
        const trendGranularity = dashboardConfig.widgetSettings.trend?.granularity || "daily";
        const periodKey = trendGranularity === "hourly" ? "daily" : trendGranularity;
        const filters={period: periodKey,agent:state.agent,model:state.model,
          breakdown:state.breakdown,metric:state.metric};
        const chart=trendGranularity==="hourly"?
          buildObservedHourly(filteredHourly,filters):buildChart(filteredReport,filters);
        drawLineChart(chart,state.metric);
      }else renderCustomCharts();
    });
  }
  // Preserve the viewer's scroll position without animating the viewport.
  if(Math.abs(window.scrollY-scroll)>1)window.scrollTo({top:scroll,behavior:"instant"});
}
function populateLayoutToolbar(){
  const titleInput=$("layout-title-input") as HTMLInputElement|null;
  if(titleInput)titleInput.value=layoutDraftTitle??dashboardConfig.title;
  const chipsContainer=$("layout-widget-chips");
  if(!chipsContainer)return;
  chipsContainer.replaceChildren();
  const activeSet=new Set(layoutDraftWidgets??dashboardConfig.widgets);
  const options=[...Object.entries(WIDGET_REGISTRY),...dashboardConfig.charts.map((c: any)=>[c.id,{title:c.title}])];
  for(const [key,widget] of options){
    const chip=el("label","layout-widget-chip"+(activeSet.has(key)?" is-active":""));
    const cb=el("input");
    cb.type="checkbox";
    cb.value=key;
    cb.checked=activeSet.has(key);
    cb.addEventListener("change",()=>toggleLayoutWidget(key,cb.checked));
    chip.append(cb,document.createTextNode(widget.title));
    chipsContainer.append(chip);
  }
}
function toggleLayoutWidget(id: string,enable: boolean){
  if(!arranging||!layoutDraft)return;
  let widgets=[...(layoutDraftWidgets??dashboardConfig.widgets)];
  if(enable){
    if(!widgets.includes(id))widgets.push(id);
  }else{
    if(widgets.length<=1){populateLayoutToolbar();return;}
    widgets=widgets.filter(w=>w!==id);
  }
  layoutDraftWidgets=widgets;
  const gridWidth=$("dashboard-grid").getBoundingClientRect().width||1200;
  const packed=compactVisibleLayout(layoutDraft.positions,widgets,gridWidth);
  layoutDraft.positions=packed;
  applyGridPreview(packed);
  for(const panel of $("dashboard-grid").querySelectorAll("[data-widget]")){
    const wid=panel.dataset.widget;
    panel.hidden=!widgets.includes(wid);
  }
  populateLayoutToolbar();
}
function beginLayoutEdit(){
  if(arranging)return;
  layoutDraft={widths:{...dashboardConfig.layout.widths},
    positions:Object.fromEntries(Object.entries(dashboardConfig.layout.positions)
      .map(([id,r])=>[id,{...r}]))};
  layoutDraftWidgets=[...dashboardConfig.widgets];
  layoutDraftTitle=dashboardConfig.title;
  arranging=true;
  populateLayoutToolbar();
  refreshArrangeTools();
}
function closeLayoutEdit(save: boolean){
  if(!arranging)return;
  if(movementFrame)cancelAnimationFrame(movementFrame);
  movementFrame=0;
  hideFloatingGridTarget();
  const result=layoutDraft;
  const nextWidgets=layoutDraftWidgets;
  const nextTitle=layoutDraftTitle;
  layoutDraft=null;
  layoutDraftWidgets=null;
  layoutDraftTitle=null;
  arranging=false;
  if(save&&result){
    const title=(nextTitle&&nextTitle.trim())?nextTitle.trim():dashboardConfig.title;
    const widgets=nextWidgets??dashboardConfig.widgets;
    persistDashboardConfig({...dashboardConfig,title,widgets,layout:result});
  }else{
    showWidgetSelection();
  }
  refreshArrangeTools();
  if(state.report)render();
}
function installLayoutPanel(panel: HTMLElement){
  if(panel.dataset.layoutInstalled==="true")return;
  panel.dataset.layoutInstalled="true";
  const id=panel.dataset.widget;
  if(!id)return;
  const label=()=>WIDGET_REGISTRY[id]?.title??dashboardConfig.charts.find((c: any)=>c.id===id)?.title??id;
  const header=panel.querySelector<HTMLElement>(":scope > .section-header");
  // One internal scrolling body per graph. Header and popover remain outside it.
  if(id!=="kpis"){
    const body=el("div","widget-scroll-body");
    body.tabIndex=0;
    body.setAttribute("aria-label",label()+" content");
    for(const child of [...panel.children])if(child!==header)body.append(child);
    panel.append(body);
  }
  const dragSurface=header??(id==="kpis"?panel:null);
  if(dragSurface)dragSurface.addEventListener("pointerdown",(event: any)=>beginPanelDrag(event,dragSurface,panel,id));
  for(const direction of ["n","s","e","w","ne","nw","se","sw"]){
    const edge=el("span","layout-resize-edge edge-"+direction);
    edge.hidden=true;edge.tabIndex=-1;
    edge.setAttribute("role","button");
    edge.setAttribute("aria-label","Resize "+label()+" from "+direction+" edge");
    edge.title="Drag this border to resize "+label();
    panel.append(edge);
    edge.addEventListener("pointerdown",(event: any)=>beginEdgeResize(event,edge,panel,id,direction));
    edge.addEventListener("keydown",(event: any)=>{
      if(!arranging||!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.key))return;
      event.preventDefault();
      const before=currentPosition(id);
      const dx=event.key==="ArrowRight"?1:event.key==="ArrowLeft"?-1:0;
      const dy=event.key==="ArrowDown"?1:event.key==="ArrowUp"?-1:0;
      const next=resizeGridRectangle(before,id,direction,dx,dy);
      if(["x","y","w","h"].some(k=>before[k as keyof GridRect]!==next[k as keyof GridRect]))saveGridPosition(id,next);
    });
  }
}
function minimumWidgetRows(id: string){return id==="kpis"?5:id==="sessions"?10:id==="trend"?9:id==="cache"?6:id==="guidance"?5:6;}
function resizeGridRectangle(before: GridRect,id: string,direction: string,dx: number,dy: number,columnStep?: number){
  let {x,y,w,h}=before;
  const minW=2,minH=minimumWidgetRows(id);
  if(direction.includes("e"))w=Math.max(minW,Math.min(GRID_COLUMNS-x,w+dx));
  if(direction.includes("w")){const right=x+w;x=Math.max(0,Math.min(right-minW,x+dx));w=right-x;}
  if(direction.includes("s"))h=Math.max(minH,Math.min(48,h+dy));
  if(direction.includes("n")){const bottom=y+h;y=Math.max(0,Math.min(bottom-minH,y+dy));h=bottom-y;
    if(h>48){y=bottom-48;h=48;}
  }
  if(id==="kpis"){x=0;w=GRID_COLUMNS;}
  if(id==="cache"&&dx!==0&&dy===0){
    const step=columnStep??($("dashboard-grid").getBoundingClientRect().width+8)/GRID_COLUMNS;
    h=cacheRowsForWidth(step*w-8,step*before.w-8,h);
  }
  return {x,y,w,h};
}
/** Batch pointer coordinates and collision resolution to one animation frame.
 * A final pointerup flush processes the last coordinates synchronously so a
 * quick drag/resize never drops its final position. */
function createPointerFrame(update: (clientX:number,clientY:number)=>void){
  let frame=0,latestX=0,latestY=0;
  return {
    move(e: PointerEvent){
      latestX=e.clientX;latestY=e.clientY;
      if(!frame)frame=requestAnimationFrame(()=>{
        frame=0;update(latestX,latestY);
      });
    },
    finish(e: PointerEvent){
      if(frame)cancelAnimationFrame(frame);
      frame=0;update(e.clientX,e.clientY);
    },
    cancel(){
      if(frame)cancelAnimationFrame(frame);
      frame=0;
    }
  };
}
// A floating preview does not participate in CSS grid placement, so neither
// scroll anchoring nor peer relayout can amplify a pointer gesture.
function showFloatingGridTarget(rect: GridRect,stepX:number,valid=true){
  const preview=$("grid-drop-preview");
  const sizeX=Math.max(12,rect.w*stepX-GRID_GAP_PX);
  const sizeY=Math.max(16,rect.h*GRID_ROW_STEP_PX-GRID_GAP_PX);
  preview.hidden=false;
  preview.classList.toggle("layout-invalid-target",!valid);
  preview.style.width=sizeX+"px";
  preview.style.height=sizeY+"px";
  preview.style.transform="translate3d("+(rect.x*stepX)+"px,"+(rect.y*GRID_ROW_STEP_PX)+"px,0)";
}
function hideFloatingGridTarget(){
  const preview=$("grid-drop-preview");
  preview.hidden=true;
  preview.style.transform="";
  preview.classList.remove("layout-invalid-target");
}
function beginEdgeResize(event: PointerEvent,edge: HTMLElement,panel: HTMLElement,id: string,direction: string){
  if(!arranging||event.button!==0||getComputedStyle($("dashboard-grid")).display!=="grid")return;
  event.preventDefault();event.stopPropagation();
  const before=currentPosition(id);if(!before)return;
  const stepX=($("dashboard-grid").getBoundingClientRect().width+8)/GRID_COLUMNS;
  const x0=event.clientX,y0=event.clientY;
  let next={...before};
  panel.classList.add("layout-resizing");
  activeLayoutGesture=true;
  edge.setPointerCapture(event.pointerId);
  const update=(x:number,y:number)=>{
    const candidate=resizeGridRectangle(before,id,direction,
      Math.round((x-x0)/stepX),Math.round((y-y0)/32),stepX);
    if(["x","y","w","h"].every(k=>candidate[k as keyof GridRect]===next[k as keyof GridRect]))return;
    next=candidate;
    showFloatingGridTarget(next,stepX);
  };
  const pointer=createPointerFrame(update);
  const move=(e: PointerEvent)=>{
    if(e.pointerId===event.pointerId)pointer.move(e);
  };
  const cleanup=(e: PointerEvent)=>{
    pointer.cancel();
    edge.removeEventListener("pointermove",move);
    edge.removeEventListener("pointerup",finish);
    edge.removeEventListener("pointercancel",cancel);
    if(edge.hasPointerCapture(e.pointerId))edge.releasePointerCapture(e.pointerId);
    panel.classList.remove("layout-resizing");
    activeLayoutGesture=false;
    hideFloatingGridTarget();
  };
  const finish=(e: PointerEvent)=>{
    if(e.pointerId!==event.pointerId)return;
    pointer.finish(e);cleanup(e);
    if(["x","y","w","h"].some(k=>before[k as keyof GridRect]!==next[k as keyof GridRect])){
      try{saveGridPosition(id,next);}catch{applyGridPreview(activeLayout().positions);}
    }
  };
  const cancel=(e: PointerEvent)=>{
    if(e.pointerId!==event.pointerId)return;
    cleanup(e);
  };
  edge.addEventListener("pointermove",move);
  edge.addEventListener("pointerup",finish);
  edge.addEventListener("pointercancel",cancel);
}
const DRAG_SENSITIVITY=0.45;
function beginPanelDrag(event: PointerEvent,surface: HTMLElement,panel: HTMLElement,id: string){
  if(!arranging||event.button!==0||interactiveHeaderTarget(event.target)||
    getComputedStyle($("dashboard-grid")).display!=="grid")return;
  const start=currentPosition(id);if(!start)return;
  event.preventDefault();
  const stepX=($("dashboard-grid").getBoundingClientRect().width+8)/GRID_COLUMNS;
  const x0=event.clientX,y0=event.clientY;
  let next={...start},moved=false;
  activeLayoutGesture=true;
  surface.setPointerCapture(event.pointerId);
  const update=(x:number,y:number)=>{
    // Reduce drag gain so accidental trackpad/mouse motion cannot jump several
    // rows or columns. The floating card and drop position share this gain.
    const dx=(x-x0)*DRAG_SENSITIVITY,dy=(y-y0)*DRAG_SENSITIVITY;
    if(!moved&&Math.hypot(x-x0,y-y0)<6)return;
    moved=true;
    // One cell of pointer travel changes one grid cell. This remains stable
    // even when the dragged item was previously moved by the user.
    const candidate={...start,
      x:Math.max(0,Math.min(GRID_COLUMNS-start.w,start.x+Math.round(dx/stepX))),
      y:Math.max(0,Math.min(GRID_MAX_ROW-start.h,start.y+Math.round(dy/32)))};
    panel.classList.add("layout-drag-source");
    panel.style.transform="translate3d("+dx+"px,"+dy+"px,0)";
    if(candidate.x===next.x&&candidate.y===next.y)return;
    next=candidate;
    showFloatingGridTarget(next,stepX);
  };
  const pointer=createPointerFrame(update);
  const move=(e: PointerEvent)=>{
    if(e.pointerId===event.pointerId)pointer.move(e);
  };
  const cleanup=(e: PointerEvent)=>{
    pointer.cancel();
    surface.removeEventListener("pointermove",move);
    surface.removeEventListener("pointerup",finish);
    surface.removeEventListener("pointercancel",cancel);
    if(surface.hasPointerCapture(e.pointerId))surface.releasePointerCapture(e.pointerId);
    panel.style.transform="";
    panel.classList.remove("layout-drag-source");
    activeLayoutGesture=false;
    hideFloatingGridTarget();
  };
  const finish=(e: PointerEvent)=>{
    if(e.pointerId!==event.pointerId)return;
    pointer.finish(e);
    if(next.x!==start.x||next.y!==start.y){
      try{saveGridPosition(id,next,"drag");}catch{applyGridPreview(activeLayout().positions);}
    }
    cleanup(e);
  };
  const cancel=(e: PointerEvent)=>{
    if(e.pointerId!==event.pointerId)return;
    cleanup(e);
  };
  surface.addEventListener("pointermove",move);
  surface.addEventListener("pointerup",finish);
  surface.addEventListener("pointercancel",cancel);
}
function installLayoutEditor(){
  const grid=$("dashboard-grid");
  for(const panel of grid.querySelectorAll("[data-widget]")){
    installLayoutPanel(panel);
    installVisualizationMenu(panel);
  }
  const preview=el("div","layout-drop-preview");
  preview.id="grid-drop-preview";preview.hidden=true;
  preview.setAttribute("aria-hidden","true");grid.append(preview);
  $("layout-edit").addEventListener("click",beginLayoutEdit);
  $("layout-save").addEventListener("click",()=>closeLayoutEdit(true));
  $("layout-cancel").addEventListener("click",()=>closeLayoutEdit(false));
  const toolbarSave=$("layout-toolbar-save");
  if(toolbarSave)toolbarSave.addEventListener("click",()=>closeLayoutEdit(true));
  const toolbarCancel=$("layout-toolbar-cancel");
  if(toolbarCancel)toolbarCancel.addEventListener("click",()=>closeLayoutEdit(false));
  const toolbarReset=$("layout-toolbar-reset");
  if(toolbarReset){
    toolbarReset.addEventListener("click",()=>{
      const defaults = resetDashboardConfig(window.localStorage);
      layoutDraft = {
        widths: { ...defaults.layout.widths },
        positions: Object.fromEntries(Object.entries(defaults.layout.positions).map(([id, r]) => [id, { ...r }]))
      };
      layoutDraftWidgets = [...defaults.widgets];
      layoutDraftTitle = defaults.title;
      populateLayoutToolbar();
      applyGridPreview(layoutDraft.positions);
      for (const panel of $("dashboard-grid").querySelectorAll("[data-widget]")) {
        const wid = panel.dataset.widget;
        panel.hidden = !layoutDraftWidgets.includes(wid);
      }
      const statusEl = $("config-status");
      if (statusEl) statusEl.textContent = "Layout and widgets reset to default settings.";
    });
  }
  const titleInput=$("layout-title-input") as HTMLInputElement|null;
  if(titleInput)titleInput.addEventListener("input",()=>{layoutDraftTitle=titleInput.value;});
  const quickAdd=$("layout-quick-add");
  if(quickAdd)quickAdd.addEventListener("click",()=>{
    rememberViewport();
    $("graph-status").textContent="";
    $("graph-dialog").showModal();
  });
  const toolbarSettings=$("layout-toolbar-settings");
  if(toolbarSettings)toolbarSettings.addEventListener("click",()=>{
    populateCustomizeDialog();
    $("customize-dialog").showModal();
  });
  const customizeEditLayout=$("customize-edit-layout");
  if(customizeEditLayout)customizeEditLayout.addEventListener("click",()=>{
    $("customize-dialog").close();
    beginLayoutEdit();
  });
  // All vertical wheel input over widget content belongs to the document.
  // Internal scrollbars remain available for viewing long lists and plots.
  grid.addEventListener("wheel",(event: WheelEvent)=>{
    if(!event.cancelable||event.defaultPrevented||event.ctrlKey||event.metaKey||
      event.shiftKey||event.deltaY===0||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
    const node=event.target;
    if(!(node instanceof Element)||
      node.closest("select,input,textarea,[role=dialog],.viz-popover-menu"))return;
    const body=node.closest<HTMLElement>(".widget-scroll-body");
    if(!body||!grid.contains(body))return;
    event.preventDefault();
    if(activeLayoutGesture)return; // do not move the page during a held drag
    const page=document.scrollingElement;
    if(!page)return;
    const scale=event.deltaMode===1?16:event.deltaMode===2?window.innerHeight:1;
    // Root CSS uses scroll-behavior:auto so this is immediate, not animated.
    page.scrollTop+=event.deltaY*scale;
  },{passive:false,capture:true});
  refreshArrangeTools();
}
installLayoutEditor();

const customHiddenSeries=new Map<string,Set<string>>();
function customChartUpdate(id: string,patch: Record<string, any>){
  const charts=dashboardConfig.charts.map((c: any)=>c.id===id?{...c,...patch}:c);
  persistDashboardConfig({...dashboardConfig,charts});
  if(state.report)render();
}
function customSelect(id: string,label: string,field: string,options: Array<[string | number, string]>){
  const wrap=el("label","custom-graph-field");
  wrap.append(document.createTextNode(label+" "));
  const select=el("select");
  select.dataset.customField=field;
  for(const [value,text] of options){
    const opt=el("option","",text);opt.value=value;select.append(opt);
  }
  select.addEventListener("change",()=>customChartUpdate(id,{[field]:select.value}));
  wrap.append(select);return wrap;
}
function createCustomPanel(chart: any){
  const card=el("section","panel custom-chart-card");
  card.id=chart.id;card.dataset.widget=chart.id;
  const header=el("div","section-header chart-section-header");
  const intro=el("div");
  intro.append(el("div","section-kicker","CUSTOM / GRAPH"),el("h2","custom-title",chart.title),
    el("p","custom-subtitle","From locally reported ccusage data"));
  const controls=el("div","chart-header-controls");
  controls.append(
    customSelect(chart.id,"View","visual",[["line","Line"],["bars","Bars"]]),
    customSelect(chart.id,"Metric","metric",Object.entries(METRIC_NAMES)),
    customSelect(chart.id,"Group","breakdown",[["total","Total"],["provider","Provider"],["model","Model"]]),
    customSelect(chart.id,"Period","period",[["daily","Daily"],["weekly","Weekly"],["monthly","Monthly"]])
  );
  header.append(intro,controls);
  const bars=el("div","bars custom-bars");bars.id="custom-bars-"+chart.id;
  const plot=el("div","chart-container custom-line");
  const svg=svgEl("svg",{role:"img","aria-label":chart.title+" over time"});
  svg.id="custom-svg-"+chart.id;
  plot.append(svg);
  const legend=el("div","legend custom-legend");legend.id="custom-legend-"+chart.id;
  const note=el("p","footnote custom-note");note.id="custom-note-"+chart.id;
  card.append(header,bars,plot,legend,note);
  return card;
}
function syncCustomChartNodes(){
  const grid=$("dashboard-grid");
  const configs=new Map(dashboardConfig.charts.map((c: any)=>[c.id,c]));
  for(const card of grid.querySelectorAll(".custom-chart-card"))
    if(!configs.has(card.dataset.widget))card.remove();
  for(const chart of dashboardConfig.charts){
    let card=$(chart.id);
    if(!card){
      card=createCustomPanel(chart);
      grid.append(card);
      installLayoutPanel(card);
    }
    installVisualizationMenu(card);
    card.querySelector(".custom-title").textContent=chart.title;
    for(const select of card.querySelectorAll("[data-custom-field]"))
      select.value=chart[select.dataset.customField as keyof typeof chart];
  }
}
function renderCustomCharts(report = filterReportByPeriod(state.report, state.section || "30d"), hourly = filterHourlyByPeriod(state.hourly, state.section || "30d")){
  if (!report) return;
  for(const chart of dashboardConfig.charts){
    const data=buildChart(report,{period:chart.period,agent:state.agent,model:state.model,
      metric:chart.metric,breakdown:chart.breakdown});
    const bars=$("custom-bars-"+chart.id),plot=$("custom-svg-"+chart.id).parentElement,
      legend=$("custom-legend-"+chart.id);
    const isLine=chart.visual==="line";
    const panel=$(chart.id);
    if(panel)panel.dataset.chartVisual=chart.visual;
    bars.hidden=isLine;plot.hidden=!isLine;legend.hidden=!isLine;
    if(isLine){
      if(!customHiddenSeries.has(chart.id))customHiddenSeries.set(chart.id,new Set());
      drawLineChart(data,chart.metric,{svgId:"custom-svg-"+chart.id,
        legendId:"custom-legend-"+chart.id,period:chart.period,breakdown:chart.breakdown,
        hiddenSeries:customHiddenSeries.get(chart.id),
        settings:{showLabels:false,maxSeries:6,hiddenDimensions:chart.hiddenDimensions},redraw:renderCustomCharts});
    }else{
      drawBars(bars.id,data.series,chart.metric,"No chart data for these filters.",10,
        chart.breakdown==="model"?"model":"provider",chart.hiddenDimensions);
    }
    const issues=[];
    if(data.isModelCategorySum)issues.push("Model totals sum reported categories; they may differ from upstream totals.");
    if(chart.metric==="totalCost")issues.push("API-equivalent estimated cost, not subscription billing; unknown prices may understate totals.");
    if(chart.breakdown==="total"&&!isLine)issues.push("Total uses one aggregated bar.");
    $("custom-note-"+chart.id).textContent=issues.join(" ");
  }
}
function setupCustomGraphBuilder(){
  $("add-graph").addEventListener("click",()=>{
    rememberViewport();
    $("graph-status").textContent="";
    $("graph-dialog").showModal();
  });
  $("graph-cancel").addEventListener("click",()=>$("graph-dialog").close());
  $("graph-form").addEventListener("submit",(event: any)=>{
    event.preventDefault();
    try{
      if(dashboardConfig.charts.length>=4)throw Error("Maximum four user-defined graphs.");
      let i=1;while(dashboardConfig.charts.some((c: any)=>c.id==="custom-"+i))i++;
      const chart={
        id:"custom-"+i,title:$("graph-title").value.trim(),
        visual:$("graph-visual").value,metric:$("graph-metric").value,
        breakdown:$("graph-group").value,period:$("graph-period").value
      };
      persistDashboardConfig({...dashboardConfig,
        charts:[...dashboardConfig.charts,chart],
        widgets:[...dashboardConfig.widgets,chart.id],
        layout:{widths:{...dashboardConfig.layout.widths,[chart.id]:"half"},
          positions:{...dashboardConfig.layout.positions}}
      });
      if(state.report)render();
      refreshArrangeTools();
      $("graph-dialog").close();
    }catch(error){
      $("graph-status").textContent=error instanceof Error?error.message:"Invalid graph settings.";
    }
  });
}
setupCustomGraphBuilder();


let editingVisualization: any=null;
function dimensionsForGraph(id: string,group: string){
  if(!state.report)return group==="total"?["Total"]:[];
  const catalog=chartCatalog(state.report);
  if(id==="guidance")return ["Pricing estimates","Subscription quotas","Local reports"];
  if(id==="cache")return ["Input","Output","Cache reads","Cache writes"];
  if(id==="kpis")return ["Reported tokens","Fresh input","Generated output","API-equivalent cost"];
  if(id==="sessions"||id==="providers")return catalog.agents;
  if(id==="models")return catalog.models;
  return group==="total"?["Total"]:group==="model"?catalog.models:catalog.agents;
}
function settingsForGraph(id: string){
  if(id==="trend")return {metric:state.metric,breakdown:state.breakdown,
    maxSeries:dashboardConfig.widgetSettings.trend.maxSeries,
    showLabels:dashboardConfig.widgetSettings.trend.showLabels,
    hiddenDimensions:[...dashboardConfig.widgetSettings.trend.hiddenDimensions]};
  if(id==="providers"||id==="models")return {...dashboardConfig.widgetSettings[id]};
  if(id==="sessions")return {metric:state.sessionMetric,
    hiddenDimensions:[...dashboardConfig.widgetSettings.sessions.hiddenDimensions]};
  if(id==="cache"||id==="kpis"||id==="guidance")return {hiddenDimensions:[...dashboardConfig.widgetSettings[id].hiddenDimensions]};
  return {...dashboardConfig.charts.find((c: any)=>c.id===id)};
}
function editorField(label: string,key: string,type: string,values: Array<[string | number,string]> =[]) {
  const wrapper=el("label","visual-editor-field");
  wrapper.append(el("span","",label));
  if(type==="checkbox"){
    const checkbox=el("input");checkbox.type="checkbox";checkbox.checked=Boolean(editingVisualization.draft[key]);
    checkbox.addEventListener("change",()=>{editingVisualization.draft[key]=checkbox.checked;});
    wrapper.append(checkbox);
  }else{
    const select=type==="text"?el("input"):el("select");
    if(type==="text"){select.value=editingVisualization.draft[key];select.maxLength=80;select.required=true;}
    else for(const [value,title] of values){
      const opt=el("option","",title);opt.value=String(value);select.append(opt);
    }
    if(type!=="text")select.value=String(editingVisualization.draft[key]);
    select.addEventListener(type==="text"?"input":"change",()=>{
      editingVisualization.draft[key]=type==="number"?Number(select.value):select.value;
      if(key==="breakdown")refreshDimensionChoices();
    });
    wrapper.append(select);
  }
  return wrapper;
}
function refreshDimensionChoices(){
  const current=editingVisualization;
  const region=$("visual-dimension-options");
  region.replaceChildren();
  const candidates=[...new Set([...dimensionsForGraph(current.id,current.draft.breakdown??"provider"),
    ...(current.draft.hiddenDimensions??[])])].slice(0,40);
  if(!candidates.length){
    region.append(el("p","empty","Load the local usage report to select available dimensions."));
    return;
  }
  const hidden=new Set(current.draft.hiddenDimensions??[]);
  for(const name of candidates){
    const wrapper=el("label","visual-dimension");
    const input=el("input");input.type="checkbox";input.checked=!hidden.has(name);
    input.value=name;
    input.addEventListener("change",()=>{
      if(input.checked)hidden.delete(name);else hidden.add(name);
      current.draft.hiddenDimensions=[...hidden];
    });
    wrapper.append(input,document.createTextNode(name));
    region.append(wrapper);
  }
}
function openVisualizationEditor(id: string){
  rememberViewport();
  const custom=dashboardConfig.charts.some((chart: any)=>chart.id===id);
  editingVisualization={id,custom,draft:settingsForGraph(id)};
  $("visual-editor-heading").textContent="Edit "+(WIDGET_REGISTRY[id]?.title ??
    dashboardConfig.charts.find((c: any)=>c.id===id)?.title??id);
  const fields=$("visual-editor-fields");
  fields.replaceChildren();
  const metricOptions=Object.entries(METRIC_NAMES),breakdownOptions: Array<[string, string]> = [
    ["total","Total"],["provider","Provider"],["model","Model"]
  ],periodOptions: Array<[string, string]> = [["daily","Daily"],["weekly","Weekly"],["monthly","Monthly"]];
  if(custom){
    fields.append(editorField("Graph title","title","text"),
      editorField("Chart type","visual","select",[["line","Line"],["bars","Bars"]]),
      editorField("Metric","metric","select",metricOptions),
      editorField("Group by","breakdown","select",breakdownOptions),
      editorField("Time grouping","period","select",periodOptions));
  }else if(id==="trend"){
    fields.append(editorField("Metric","metric","select",metricOptions),
      editorField("Group by","breakdown","select",breakdownOptions),
      editorField("Maximum lines","maxSeries","number",[[3,"3"],[6,"6"],[12,"12"]]),
      editorField("Point labels","showLabels","checkbox"));
  }else if(id==="providers"||id==="models"){
    fields.append(editorField("Metric","metric","select",metricOptions),
      editorField("Maximum bars","limit","number",[[5,"5"],[10,"10"],[12,"12"]]));
  }else if(id==="sessions"){
    fields.append(editorField("Session metric","metric","select",[
      ["totalTokens","Tokens"],["totalCost","Estimated API cost"],["outputTokens","Output tokens"]]));
  }
  $("visual-editor-dimensions").hidden=!["trend","providers","models","sessions","cache","kpis","guidance"].includes(id)&&!custom;
  if(!$("visual-editor-dimensions").hidden)refreshDimensionChoices();
  else fields.append(el("p","empty","This panel has no series dimensions. Unlock layout to move or resize it."));
  $("visual-editor-status").textContent="";
  $("visual-editor").showModal();
}
let dashboardViewportAnchor=0;
function rememberViewport(){dashboardViewportAnchor=window.scrollY;}
function restoreViewport(){
  const offset=dashboardViewportAnchor;
  requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:offset,behavior:"instant"})));
}
$("graph-dialog").addEventListener("close",restoreViewport);
$("visual-editor").addEventListener("close",restoreViewport);
function hideWidget(id: string){
  const previousScroll=window.scrollY;
  const next=dashboardConfig.widgets.filter((value: any)=>value!==id);
  if(arranging){$("visual-editor-status").textContent="Save or cancel your layout edit before hiding widgets.";return;}
  if(!next.length){$("visual-editor-status").textContent="Keep at least one visible widget.";return;}
  persistDashboardConfig({...dashboardConfig,widgets:next,layout:layoutAfterVisibilityChange(next)});
  if(state.report)render();
  if($("visual-editor").open)$("visual-editor").close();
  refreshArrangeTools();
  requestAnimationFrame(()=>window.scrollTo({top:previousScroll,behavior:"instant"}));
}
function deleteCustomChart(id: string){
  if(arranging)return;
  const charts=dashboardConfig.charts.filter((chart: any)=>chart.id!==id);
  const widgets=dashboardConfig.widgets.filter((widget: any)=>widget!==id);
  if(!widgets.length)widgets.push("kpis");
  const widths={...dashboardConfig.layout.widths},positions={...dashboardConfig.layout.positions};
  delete widths[id];delete positions[id];customHiddenSeries.delete(id);
  const packed=compactVisibleLayout(positions,widgets,$("dashboard-grid").getBoundingClientRect().width);
  persistDashboardConfig({...dashboardConfig,charts,widgets,layout:{widths,positions:packed}});
  if(state.report)render();
  refreshArrangeTools();
}
function installVisualizationMenu(panel: HTMLElement){
  if(panel.querySelector(".viz-menu-trigger"))return;
  const id=panel.dataset.widget;
  if(!id)return;
  const header=panel.querySelector(":scope > .section-header")??(id==="kpis"?panel:null);
  if(!header)return;
  const trigger=el("button","viz-menu-trigger","⋮");
  trigger.type="button";
  trigger.title="Visualization options";
  trigger.setAttribute("aria-label","Options for "+(WIDGET_REGISTRY[id]?.title??id));
  trigger.setAttribute("aria-haspopup","menu");
  trigger.setAttribute("aria-expanded","false");
  const menu=el("div","viz-menu-body viz-popover-menu");
  menu.popover="auto";
  menu.id="viz-popover-"+id;
  trigger.setAttribute("aria-controls",menu.id);
  const add=(label: string,action: () => void,cls="")=>{
    const button=el("button","viz-menu-item"+(cls?" "+cls:""),label);
    button.type="button";
    button.addEventListener("click",()=>{
      if(menu.matches(":popover-open"))menu.hidePopover();
      action();
    });
    menu.append(button);
  };
  add("Edit visualization",()=>openVisualizationEditor(id));
  add("Hide visualization",()=>{
    editingVisualization={id};
    hideWidget(id);
  });
  if(id.startsWith("custom-"))add("Delete graph",()=>deleteCustomChart(id),"danger");
  menu.addEventListener("toggle",(e: any)=>trigger.setAttribute("aria-expanded",String(e.newState==="open")));
  trigger.addEventListener("click",()=>{
    if(menu.matches(":popover-open")){menu.hidePopover();return;}
    const rect=trigger.getBoundingClientRect();
    // Native popover paints in the top layer, outside clipped graph viewports.
    const width=210;
    const left=Math.max(8,Math.min(window.innerWidth-width-8,rect.right-width));
    const top=Math.max(8,Math.min(window.innerHeight-160,rect.bottom+7));
    menu.style.left=left+"px";
    menu.style.top=top+"px";
    menu.showPopover();
  });
  header.append(trigger,menu);
}
$("visual-editor-close").addEventListener("click",()=>$("visual-editor").close());
$("visual-editor-hide").addEventListener("click",()=>{
  if(editingVisualization)hideWidget(editingVisualization.id);
});
$("visual-editor-form").addEventListener("submit",(event: any)=>{
  event.preventDefault();
  const editor=editingVisualization;
  if(!editor)return;
  try{
    const draft=editor.draft,id=editor.id;
    if(editor.custom){
      const charts=dashboardConfig.charts.map((c: any)=>c.id===id?{...c,...draft}:c);
      persistDashboardConfig({...dashboardConfig,charts});
    }else if(id==="trend"){
      state.metric=draft.metric;state.breakdown=draft.breakdown;
      persistDashboardConfig(configWithCurrentFilters({...dashboardConfig,widgetSettings:{
        ...dashboardConfig.widgetSettings,trend:{
          showLabels:draft.showLabels,maxSeries:draft.maxSeries,hiddenDimensions:draft.hiddenDimensions
        }}}));
    }else if(id==="providers"||id==="models"){
      persistDashboardConfig({...dashboardConfig,widgetSettings:{
        ...dashboardConfig.widgetSettings,[id]:draft}});
    }else if(id==="cache"||id==="kpis"||id==="guidance"){
      persistDashboardConfig({...dashboardConfig,widgetSettings:{
        ...dashboardConfig.widgetSettings,[id]:{hiddenDimensions:draft.hiddenDimensions}}});
    }else if(id==="sessions"){
      state.sessionMetric=draft.metric;
      persistDashboardConfig(configWithCurrentFilters({...dashboardConfig,widgetSettings:{
        ...dashboardConfig.widgetSettings,sessions:{hiddenDimensions:draft.hiddenDimensions}}}));
    }
    if(state.report)render();
    $("visual-editor").close();
  }catch(error){
    $("visual-editor-status").textContent=error instanceof Error?error.message:"Invalid visualization.";
  }
});
