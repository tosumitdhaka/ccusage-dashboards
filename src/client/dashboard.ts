// Strict TypeScript ESM dashboard controller. Public entry remains /dashboard.js.
import { buildView } from "./normalize.mjs";
import { METRIC_NAMES, DEFAULT_DASHBOARD, WIDGET_REGISTRY, validateDashboardConfig } from "./widget-registry.mjs";
import {
  MAX_DASHBOARD_JSON_LENGTH, readDashboardConfig, saveDashboardConfig,
  resetDashboardConfig, parseDashboardJSON, stringifyDashboardConfig
} from "./dashboard-config.mjs";
import { buildChart, buildObservedHourly, buildSessions, chartCatalog } from "./analytics.mjs";
import { colorForDimension, labelPointIndices } from "./chart-presentation.mjs";
import { GRID_COLUMNS, relocateGridWidget, snapToGrid, cacheRowsForWidth, visibleGridOrder, compactVisibleLayout, reflowGridAfterResize } from "./dashboard-layout.mjs";

const $ = (id: string): any => document.getElementById(id);
const state: any = { report: null, hourly: [], section: "daily", agent: "all", model: "all",
  breakdown: "total", metric: "totalTokens", sessionMetric: "totalTokens" };
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const hiddenTrendSeries = new Set<string>();
let dismissedPricingSignature: string|null = null;
function syncGraphControls() {
  const { trend, providers, models } = dashboardConfig.widgetSettings;
  $("trend-show-labels").checked = trend.showLabels;
  $("trend-series-limit").value = String(trend.maxSeries);
  $("provider-metric").value = providers.metric;
  $("provider-limit").value = String(providers.limit);
  $("model-metric").value = models.metric;
  $("model-limit").value = String(models.limit);
}
function updateGraphSettings(group, patch) {
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
  const anchors = [...document.querySelectorAll(".sidebar .nav-link")];
  const enabled = new Set(dashboardConfig.widgets);
  let current = "overview";
  for (const anchor of anchors) {
    const id = anchor.getAttribute("href").slice(1);
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
let dashboardConfig: any = validateDashboardConfig(DEFAULT_DASHBOARD);
let storageWarning = "";
// The initial widget arrangement renders before the asynchronous report loads.
// Initialize edit-session state first: activeLayout() reads layoutDraft.
let arranging=false;
let layoutDraft: any=null;
let movementFrame=0;
try { dashboardConfig = readDashboardConfig(window.localStorage); }
catch { storageWarning = "Saved dashboard preferences are unavailable; defaults are in use."; }
function applyFilterState(filters) {
  state.section = filters.period;
  state.agent = filters.provider;
  state.model = filters.model;
  state.metric = filters.metric;
  state.breakdown = filters.breakdown;
  state.sessionMetric = filters.sessionMetric;
  $("metric").value = state.metric;
  $("breakdown").value = state.breakdown;
  $("session-metric").value = state.sessionMetric;
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

function persistDashboardConfig(config) {
  dashboardConfig = validateDashboardConfig(config);
  storageWarning = "";
  try { saveDashboardConfig(window.localStorage, dashboardConfig); }
  catch { storageWarning = "Could not save to browser storage. This layout works until the page reloads."; }
  showWidgetSelection();
}
function persistFilters() { persistDashboardConfig(configWithCurrentFilters()); }
function replaceDashboardConfig(config, persist = true) {
  if (persist) persistDashboardConfig(config);
  else { dashboardConfig = validateDashboardConfig(config); showWidgetSelection(); }
  applyFilterState(dashboardConfig.filters);
  refreshArrangeTools();
  if (state.report) { updateSelectors(); render(); }
}
applyFilterState(dashboardConfig.filters);
showWidgetSelection();
const fmt = (n, metric = "totalTokens") => metric === "totalCost" ? money.format(n ?? 0) : compact.format(n ?? 0);
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
function empty(target, msg) { target.replaceChildren(el("p", "empty", msg)); }
function choices(select, names, allLabel, desired = select.value) {
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
function availableModels(report, agent) {
  if (agent === "all") return chartCatalog(report).models;
  const models = new Set();
  for (const period of ["daily", "weekly", "monthly"]) {
    for (const row of report[period] ?? []) {
      const source = (row.agents ?? []).find((s) => s.agent === agent);
      for (const model of source?.modelBreakdowns ?? []) if (model.modelName) models.add(model.modelName);
    }
  }
  for (const s of report.session ?? []) {
    if (s.agent === agent) for (const m of s.modelBreakdowns ?? []) if (m.modelName) models.add(m.modelName);
  }
  return [...models].sort();
}
function drawLineChart(data, metric, options={}) {
  const svg = $(options.svgId ?? "trend-chart");
  const legend = $(options.legendId ?? "trend-legend");
  const activeSection=options.period ?? state.section;
  const activeBreakdown=options.breakdown ?? state.breakdown;
  const invisible=options.hiddenSeries ?? hiddenTrendSeries;
  svg.replaceChildren(); legend.replaceChildren();
  // Match the actual CSS viewport. A fixed 920×264 viewBox letterboxed the
  // graph at desktop widths, wasting horizontal space around the plot.
  const W = Math.max(320, Math.round(svg.getBoundingClientRect().width || 920));
  const H = Math.max(300, Math.round(svg.getBoundingClientRect().height || 360));
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const L = 78, T = 40, R = 18, B = 48, PW = W - L - R, PH = H - T - B;
  const groupKind = activeBreakdown === "model" ? "model" : "provider";
  const settings = options.settings ?? dashboardConfig.widgetSettings.trend;
  const excluded=new Set(settings.hiddenDimensions ?? []);
  const shown = data.series.filter(s=>!excluded.has(s.name)).slice(0, settings.maxSeries);
  shown.forEach((s) => {
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
  const names = shown.filter((s) => !invisible.has(s.name)).map((s) => s.name);
  if (!names.length || !data.points.length) {
    const label = svgEl("text", { x: W / 2, y: H / 2, fill: "#92a0b8", "text-anchor": "middle", "font-size": 15 });
    label.textContent = activeSection === "hourly"
      ? "No observed hourly changes yet — two different snapshots are needed"
      : "No usage records for this selection";
    svg.append(label);
    return;
  }
  const maxValue = Math.max(1e-9, ...data.points.flatMap((p) => names.map((name) => p.values[name] ?? 0)));
  const ceiling = maxValue * 1.13;
  for (let i = 0; i <= 4; i++) {
    const y = T + PH * i / 4;
    svg.append(svgEl("line", { x1: L, y1: y, x2: W - R, y2: y, stroke: "#29384a", "stroke-dasharray": "4 5" }));
    const text = svgEl("text", { x: L - 9, y: y + 4, "text-anchor": "end", fill: "#8494a9", "font-size": 12 });
    text.textContent = fmt(ceiling * (1 - i / 4), metric); svg.append(text);
  }
  const coords = data.points.map((point, i) => ({
    ...point, x: L + (data.points.length === 1 ? PW / 2 : i * PW / (data.points.length - 1))
  }));
  const labelledPoints = new Set(labelPointIndices(coords.length, 12));
  for (const [index, name] of names.entries()) {
    const coordsSeries = coords.map((point) => ({
      ...point, y: T + PH * (1 - Math.max(0, point.values[name] ?? 0) / ceiling)
    }));
    const color = colorForDimension(name, groupKind);
    const path = coordsSeries.map((p, i) => (i ? "L" : "M") + p.x + " " + p.y).join(" ");
    svg.append(svgEl("path", { d: path, fill: "none", stroke: color,
      "stroke-width": 3, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    coordsSeries.forEach((p, pointIndex) => {
      const circle = svgEl("circle", { cx: p.x, cy: p.y, r: 3.8,
        fill: color, stroke: "#111927", "stroke-width": 1.5 });
      const title = svgEl("title");
      const label = activeSection === "hourly" ? p.label.replace("T", " ") : p.label;
      title.textContent = name + " • " + label + ": " + fmt(p.values[name], metric);
      circle.append(title); svg.append(circle);
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
  coords.forEach((p, i) => {
    if (i % step !== 0 && i !== coords.length - 1) return;
    const label = svgEl("text", { x: p.x, y: H - 15, "text-anchor": "middle", fill: "#8799ac", "font-size": 12 });
    label.textContent = activeSection === "hourly" ? p.label.slice(5, 13).replace("T", " ") : p.label;
    svg.append(label);
  });
}
function drawBars(id, entries, metric, emptyMessage, limit, kind, hiddenDimensions=[]) {
  const target = $(id);
  target.replaceChildren();
  const visible=entries.filter(entry=>!hiddenDimensions.includes(entry.name));
  if (!visible.length) { empty(target, emptyMessage); return; }
  const max = Math.max(1e-10, ...visible.map((e) => e.value));
  visible.slice(0, limit).forEach((item) => {
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
function drawSessionGraph(rows) {
  const target = $("session-bars");
  target.replaceChildren();
  if (!rows.length) { empty(target, "No sessions match these filters."); return; }
  const max = Math.max(1e-9, ...rows.map((r) => r.value));
  rows.forEach((r, i) => {
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
function drawSessionTable(rows) {
  const tbody = $("sessions-body"); tbody.replaceChildren();
  if (!rows.length) {
    const tr = el("tr"), td = el("td", "empty-cell", "No sessions match these filters.");
    td.colSpan = 5; tr.append(td); tbody.append(tr); return;
  }
  const costRows = buildSessions(state.report, { agent: state.agent, model: state.model, metric: "totalCost", limit: 30 });
  const costs = new Map(costRows.map((r) => [r.agent + "\0" + r.session, r.value]));
  for (const row of rows.slice(0, 10)) {
    const tr = el("tr");
    tr.append(
      el("td", "agent-cell", row.agent),
      el("td", "session-id", row.session),
      el("td", "numeric", fmt(row.value)),
      el("td", "numeric", state.reportHasCost ? fmt(costs.get(row.agent + "\0" + row.session) ?? 0, "totalCost") : "Unavailable"),
      el("td", "subtle", row.lastActivity ? new Date(row.lastActivity).toLocaleString() : "Unknown")
    ); tbody.append(tr);
  }
}
function updateSelectors() {
  const catalog = chartCatalog(state.report);
  state.agent = choices($("agent"), catalog.agents, "All providers", state.agent);
  state.model = choices($("model"), availableModels(state.report, state.agent), "All models", state.model);
}
function render() {
  if (!state.report) return;
  showWidgetSelection();
  $("metric").value = state.metric;
  $("breakdown").value = state.breakdown;
  $("session-metric").value = state.sessionMetric;
  syncGraphControls();
  const period = state.section === "hourly" ? "daily" : state.section;
  const view = buildView(state.report, { section: period, agent: state.agent });
  const current = { period, agent: state.agent, model: state.model };
  // Source and model totals are not necessarily additive to the upstream total.
  const metrics = ["totalTokens", "inputTokens", "outputTokens", "cacheReadTokens", "cacheCreationTokens"];
  const vals = Object.fromEntries(metrics.map((m) => [m, buildChart(state.report, { ...current, metric: m }).total]));
  const cost = buildChart(state.report, { ...current, metric: "totalCost" }).total;
  const hasCost = (state.report[period] ?? []).some((r) => typeof r.totalCost === "number");
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
  [...document.querySelectorAll('[data-widget="cache"] .token-grid>div')].forEach((node,index)=>{
    node.hidden=cacheHidden.has(["Input","Output","Cache reads","Cache writes"][index]);
  });
  const noteHidden=new Set(dashboardConfig.widgetSettings.guidance.hiddenDimensions);
  [...document.querySelectorAll('[data-widget="guidance"] .information>div')].forEach((node,index)=>{
    node.hidden=noteHidden.has(["Pricing estimates","Subscription quotas","Local reports"][index]);
  });
  const kpiHidden=new Set(dashboardConfig.widgetSettings.kpis.hiddenDimensions);
  [...document.querySelectorAll('[data-widget="kpis"] .kpi')].forEach((node,index)=>{
    node.hidden=kpiHidden.has(["Reported tokens","Fresh input","Generated output","API-equivalent cost"][index]);
  });
  $("trend-period").textContent = state.section.toUpperCase();
  $("chart-heading").textContent = (state.metric === "totalCost" ? "Estimated cost" : "Token consumption") + " over time";
  document.querySelectorAll(".period").forEach((button) => {
    const active = button.dataset.period === state.section;
    button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active));
  });
  const filters = { ...current, breakdown: state.breakdown, metric: state.metric };
  const chart = state.section === "hourly"
    ? buildObservedHourly(state.hourly, filters)
    : buildChart(state.report, filters);
  drawLineChart(chart, state.metric);
  const notes = [];
  if (state.section === "hourly") notes.push("Hourly is observed deltas between dashboard refreshes (UTC hour), not exact event-time usage. Starts only after two changed readings; gaps reflect missing observation periods. Price refreshes can alter observed cost deltas.");
  if (chart.isModelCategorySum || state.model !== "all" && state.metric === "totalTokens") notes.push("Per-model totals sum token categories and may differ from upstream reported totals.");
  if (chart.series.length > dashboardConfig.widgetSettings.trend.maxSeries) notes.push("Chart draws the top " + dashboardConfig.widgetSettings.trend.maxSeries + " series; increase the series limit or filter the view.");
  if (dashboardConfig.widgetSettings.trend.showLabels && chart.points.length > 12) notes.push("Value labels are sampled to avoid collisions; point tooltips retain every value.");
  if (state.metric === "totalCost") notes.push("API-equivalent estimated cost, not subscription billing. Unknown model prices can understate totals.");
  $("trend-note").textContent = notes.join(" ");
  $("chart-explainer").textContent = state.section === "hourly" ? "Changes observed by this running dashboard; UTC hours" : METRIC_NAMES[state.metric] + " by " + ({ daily: "day", weekly: "week", monthly: "month" }[state.section]);
  const providerSettings = dashboardConfig.widgetSettings.providers;
  const modelSettings = dashboardConfig.widgetSettings.models;
  const providerGraph = buildChart(state.report, { ...current, metric: providerSettings.metric, breakdown: "provider" });
  const modelGraph = buildChart(state.report, { ...current, metric: modelSettings.metric, breakdown: "model" });
  drawBars("provider-bars", providerGraph.series, providerSettings.metric, "No provider breakdown available.", providerSettings.limit, "provider", providerSettings.hiddenDimensions);
  drawBars("model-bars", modelGraph.series, modelSettings.metric, "No model breakdown available.", modelSettings.limit, "model", modelSettings.hiddenDimensions);
  $("provider-summary").textContent = "Ranked by " + METRIC_NAMES[providerSettings.metric].toLowerCase();
  $("model-summary").textContent = "Ranked by " + METRIC_NAMES[modelSettings.metric].toLowerCase();
  const sessions = buildSessions(state.report, { agent: state.agent, model: state.model, metric: state.sessionMetric });
  drawSessionGraph(sessions.filter(s=>!dashboardConfig.widgetSettings.sessions.hiddenDimensions.includes(s.agent)));
  drawSessionTable(buildSessions(state.report, { agent: state.agent, model: state.model, metric: "totalTokens", limit: 30 }).filter(s=>!dashboardConfig.widgetSettings.sessions.hiddenDimensions.includes(s.agent)).slice(0,10));
  renderCustomCharts();
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
    $("updated").textContent = "Updated " + new Date().toLocaleTimeString();
    render();
  } catch (error) {
    const notice = $("notice");
    notice.className = "notice error"; notice.hidden = false;
    notice.textContent = (error instanceof Error ? error.message : "Failed to load report") + " Inspect the dashboard server terminal.";
  } finally { button.disabled = false; button.textContent = "↻  Refresh data"; }
}
document.querySelectorAll(".period").forEach((button) => button.addEventListener("click", () => {
  state.section = button.dataset.period; persistFilters(); render();
}));
$("agent").addEventListener("change", () => { state.agent = $("agent").value; updateSelectors(); persistFilters(); render(); });
$("model").addEventListener("change", () => { state.model = $("model").value; persistFilters(); render(); });
$("metric").addEventListener("change", () => { state.metric = $("metric").value; persistFilters(); render(); });
$("breakdown").addEventListener("change", () => { state.breakdown = $("breakdown").value; persistFilters(); render(); });
$("session-metric").addEventListener("change", () => { state.sessionMetric = $("session-metric").value; persistFilters(); render(); });
$("trend-show-labels").addEventListener("change", () => updateGraphSettings("trend", { showLabels: $("trend-show-labels").checked }));
$("trend-series-limit").addEventListener("change", () => updateGraphSettings("trend", { maxSeries: Number($("trend-series-limit").value) }));
for (const group of ["providers", "models"]) {
  const prefix = group === "providers" ? "provider" : "model";
  $(prefix + "-metric").addEventListener("change", () => updateGraphSettings(group, { metric: $(prefix + "-metric").value }));
  $(prefix + "-limit").addEventListener("change", () => updateGraphSettings(group, { limit: Number($(prefix + "-limit").value) }));
}
window.addEventListener("scroll", scheduleNavigationUpdate, { passive: true });

function populateCustomizeDialog() {
  $("dashboard-title").value = dashboardConfig.title;
  $("config-status").textContent = storageWarning;
  const group = $("widget-options");
  group.replaceChildren();
  const options=[...Object.entries(WIDGET_REGISTRY),...dashboardConfig.charts.map(chart=>[chart.id,{title:chart.title}])];
  for (const [key, widget] of options) {
    const label = el("label", "widget-option");
    const input = el("input");
    input.type = "checkbox"; input.value = key;
    input.checked = dashboardConfig.widgets.includes(key);
    label.append(input, document.createTextNode(widget.title));
    group.append(label);
  }
}
$("customize").addEventListener("click", () => {
  populateCustomizeDialog();
  $("customize-dialog").showModal();
});
$("customize-cancel").addEventListener("click", () => $("customize-dialog").close());
$("customize-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const checked = new Set([...$("widget-options").querySelectorAll("input:checked")].map(input=>input.value));
    const widgets = [...dashboardConfig.widgets.filter(id=>checked.has(id)),
      ...[...checked].filter(id=>!dashboardConfig.widgets.includes(id))];
    const title = $("dashboard-title").value.trim();
    const sameVisibility=widgets.length===dashboardConfig.widgets.length&&
      widgets.every(id=>dashboardConfig.widgets.includes(id));
    const layout=sameVisibility?dashboardConfig.layout:layoutAfterVisibilityChange(widgets);
    persistDashboardConfig(configWithCurrentFilters({ ...dashboardConfig, title, widgets, layout }));
    $("customize-dialog").close();
    if (state.report) render();
  } catch (error) {
    $("config-status").textContent = error instanceof Error ? error.message : "Invalid dashboard preferences.";
  }
});
$("config-reset").addEventListener("click", () => {
  try {
    const defaults = resetDashboardConfig(window.localStorage);
    replaceDashboardConfig(defaults, false);
    storageWarning = "";
    populateCustomizeDialog();
  } catch (error) {
    $("config-status").textContent = error instanceof Error ? error.message : "Unable to reset preferences.";
  }
});
$("config-export").addEventListener("click", () => {
  try {
    const json = stringifyDashboardConfig(configWithCurrentFilters());
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = el("a");
    anchor.href = url; anchor.download = "ccusage-dashboard-view.json";
    document.body.append(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    $("config-status").textContent = "Exported view settings only; no usage reports or credentials.";
  } catch (error) { $("config-status").textContent = error.message; }
});
$("config-import-trigger").addEventListener("click", () => $("config-import").click());
$("config-import").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    if (file.size > MAX_DASHBOARD_JSON_LENGTH) throw new Error("Dashboard JSON exceeds 16 KiB.");
    const imported = parseDashboardJSON(await file.text());
    replaceDashboardConfig(imported);
    populateCustomizeDialog();
    $("config-status").textContent = storageWarning || "View imported. Filters and visible widgets updated.";
  } catch (error) {
    $("config-status").textContent = error instanceof Error ? error.message : "Unable to import dashboard JSON.";
  }
});

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
setInterval(load, 60_000);


const interactiveHeaderTarget=target=>target.closest("button,select,input,label,a,summary,.viz-menu-trigger,.viz-popover-menu");
function activeLayout(){return layoutDraft??dashboardConfig.layout;}
function currentPosition(id){return activeLayout().positions[id];}
function layoutAfterVisibilityChange(widgets){
  const positions=compactVisibleLayout(dashboardConfig.layout.positions,widgets,
    $("dashboard-grid").getBoundingClientRect().width);
  const widths={...dashboardConfig.layout.widths};
  if(positions.cache?.w===12)widths.cache="full";
  return {...dashboardConfig.layout,widths,positions};
}
function applyGridPreview(positions){
  const visual=visibleGridOrder(positions,dashboardConfig.widgets);
  for(const panel of $("dashboard-grid").querySelectorAll("[data-widget]")){
    const rect=positions[panel.dataset.widget];
    if(!rect)continue;
    panel.style.gridColumn=(rect.x+1)+" / span "+rect.w;
    panel.style.gridRow=(rect.y+1)+" / span "+rect.h;
    panel.style.order=String(visual.indexOf(panel.dataset.widget));
  }
}
function refreshArrangeTools(){
  const grid=$("dashboard-grid"),gridMode=getComputedStyle(grid).display==="grid";
  $("layout-help").hidden=!arranging||gridMode;
  grid.classList.toggle("is-arranging",arranging);
  $("layout-edit").textContent=arranging?"🔓 Layout Unlocked":"🔒 Layout Locked";
  $("layout-edit").disabled=arranging||!gridMode;
  $("layout-edit").title=arranging?"Save or cancel to finish editing.":
    gridMode?"Unlock to move and resize widgets.":"Grid editing requires a screen wider than 1100px.";
  $("layout-edit").setAttribute("aria-pressed",String(arranging));
  $("layout-edit").setAttribute("aria-label",arranging?
    "Layout unlocked. Save or cancel changes.":"Layout locked. Click to edit positions.");
  $("layout-save").hidden=!arranging;
  $("layout-cancel").hidden=!arranging;
  $("add-graph").disabled=arranging;
  $("customize").disabled=arranging;
  for(const panel of grid.querySelectorAll("[data-widget]")){
    const header=panel.querySelector(":scope > .section-header");
    if(header)header.draggable=false;
    for(const edge of panel.querySelectorAll(".layout-resize-edge")){
      edge.hidden=!arranging||!gridMode||panel.hidden;
      edge.tabIndex=arranging&&gridMode&&!panel.hidden?0:-1;
    }
  }
}
function saveGridPosition(id,rect,type="resize"){
  if(!arranging||!layoutDraft)return;
  const scroll=window.scrollY,previous=layoutDraft.positions;
  const positions=type==="resize"?
    reflowGridAfterResize(previous,id,rect,dashboardConfig.widgets):
    relocateGridWidget(previous,id,rect,dashboardConfig.widgets);
  const widths={...layoutDraft.widths,[id]:rect.w===12?"full":"half"};
  layoutDraft={...layoutDraft,widths,positions};
  showWidgetSelection();
  if(state.report)render();
  requestAnimationFrame(()=>window.scrollTo({top:scroll,behavior:"instant"}));
}
function beginLayoutEdit(){
  if(arranging)return;
  layoutDraft={widths:{...dashboardConfig.layout.widths},
    positions:Object.fromEntries(Object.entries(dashboardConfig.layout.positions)
      .map(([id,r])=>[id,{...r}]))};
  arranging=true;
  refreshArrangeTools();
}
function closeLayoutEdit(save){
  if(!arranging)return;
  if(movementFrame)cancelAnimationFrame(movementFrame);
  movementFrame=0;
  $("grid-drop-preview").hidden=true;
  const result=layoutDraft;
  layoutDraft=null;arranging=false;
  if(save&&result)persistDashboardConfig({...dashboardConfig,layout:result});
  else showWidgetSelection();
  refreshArrangeTools();
  if(state.report)render();
}
function installLayoutPanel(panel){
  if(panel.dataset.layoutInstalled==="true")return;
  panel.dataset.layoutInstalled="true";
  const id=panel.dataset.widget;
  const label=()=>WIDGET_REGISTRY[id]?.title??dashboardConfig.charts.find(c=>c.id===id)?.title??id;
  const header=panel.querySelector(":scope > .section-header");
  // One internal scrolling body per graph. Header and popover remain outside it.
  if(id!=="kpis"){
    const body=el("div","widget-scroll-body");
    for(const child of [...panel.children])if(child!==header)body.append(child);
    panel.append(body);
  }
  const dragSurface=header??(id==="kpis"?panel:null);
  if(dragSurface)dragSurface.addEventListener("pointerdown",event=>beginPanelDrag(event,dragSurface,panel,id));
  for(const direction of ["n","s","e","w","ne","nw","se","sw"]){
    const edge=el("span","layout-resize-edge edge-"+direction);
    edge.hidden=true;edge.tabIndex=-1;
    edge.setAttribute("role","button");
    edge.setAttribute("aria-label","Resize "+label()+" from "+direction+" edge");
    edge.title="Drag this border to resize "+label();
    panel.append(edge);
    edge.addEventListener("pointerdown",event=>beginEdgeResize(event,edge,panel,id,direction));
    edge.addEventListener("keydown",event=>{
      if(!arranging||!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.key))return;
      event.preventDefault();
      const before=currentPosition(id);
      const dx=event.key==="ArrowRight"?1:event.key==="ArrowLeft"?-1:0;
      const dy=event.key==="ArrowDown"?1:event.key==="ArrowUp"?-1:0;
      const next=resizeGridRectangle(before,id,direction,dx,dy);
      if(["x","y","w","h"].some(k=>before[k]!==next[k]))saveGridPosition(id,next);
    });
  }
}
function minimumWidgetRows(id){return id==="kpis"?5:id==="sessions"?10:id==="trend"?9:id==="cache"?6:id==="guidance"?5:6;}
function resizeGridRectangle(before,id,direction,dx,dy){
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
    const step=($("dashboard-grid").getBoundingClientRect().width+8)/GRID_COLUMNS;
    h=cacheRowsForWidth(step*w-8,step*before.w-8,h);
  }
  return {x,y,w,h};
}
function scheduleLayoutPreview(positions){
  if(movementFrame)cancelAnimationFrame(movementFrame);
  movementFrame=requestAnimationFrame(()=>{movementFrame=0;applyGridPreview(positions);});
}
function beginEdgeResize(event,edge,panel,id,direction){
  if(!arranging||event.button!==0||getComputedStyle($("dashboard-grid")).display!=="grid")return;
  event.preventDefault();event.stopPropagation();
  const before=currentPosition(id);if(!before)return;
  const original=activeLayout().positions;
  const step=($("dashboard-grid").getBoundingClientRect().width+8)/GRID_COLUMNS;
  const x0=event.clientX,y0=event.clientY;
  let next={...before};
  panel.classList.add("layout-resizing");
  edge.setPointerCapture(event.pointerId);
  const move=e=>{
    const candidate=resizeGridRectangle(before,id,direction,
      Math.round((e.clientX-x0)/step),Math.round((e.clientY-y0)/32));
    if(["x","y","w","h"].every(k=>candidate[k]===next[k]))return;
    try{
      const positions=reflowGridAfterResize(original,id,candidate,dashboardConfig.widgets);
      next=candidate;scheduleLayoutPreview(positions);
    }catch{/* Keep last valid rectangle when no cells are free. */}
  };
  const cleanup=e=>{
    edge.removeEventListener("pointermove",move);
    edge.removeEventListener("pointerup",finish);
    edge.removeEventListener("pointercancel",cancel);
    if(edge.hasPointerCapture(e.pointerId))edge.releasePointerCapture(e.pointerId);
    if(movementFrame)cancelAnimationFrame(movementFrame);
    movementFrame=0;panel.classList.remove("layout-resizing");
  };
  const finish=e=>{
    move(e);cleanup(e);
    if(["x","y","w","h"].some(k=>before[k]!==next[k]))saveGridPosition(id,next);
    else applyGridPreview(original);
  };
  const cancel=e=>{cleanup(e);applyGridPreview(original);};
  edge.addEventListener("pointermove",move);
  edge.addEventListener("pointerup",finish);
  edge.addEventListener("pointercancel",cancel);
}
function beginPanelDrag(event,surface,panel,id){
  if(!arranging||event.button!==0||interactiveHeaderTarget(event.target)||
    getComputedStyle($("dashboard-grid")).display!=="grid")return;
  const start=currentPosition(id);if(!start)return;
  event.preventDefault();
  const grid=$("dashboard-grid"),bounds=panel.getBoundingClientRect();
  const offset={x:event.clientX-bounds.left,y:event.clientY-bounds.top};
  const original=activeLayout().positions,x0=event.clientX,y0=event.clientY;
  const ghost=$("grid-drop-preview");
  let next={...start},moved=false;
  surface.setPointerCapture(event.pointerId);
  const move=e=>{
    if(!moved&&Math.hypot(e.clientX-x0,e.clientY-y0)<5)return;
    moved=true;
    const candidate=snapToGrid(e.clientX-offset.x,e.clientY-offset.y,
      grid.getBoundingClientRect(),start.w,start.h);
    if(["x","y","w","h"].every(k=>candidate[k]===next[k]))return;
    try{
      const positions=relocateGridWidget(original,id,candidate,dashboardConfig.widgets);
      next=candidate;
      panel.classList.add("layout-drag-source");
      ghost.hidden=false;
      ghost.style.gridColumn=(next.x+1)+" / span "+next.w;
      ghost.style.gridRow=(next.y+1)+" / span "+next.h;
      scheduleLayoutPreview(positions);
    }catch{/* Keep last valid position. */}
  };
  const cleanup=e=>{
    surface.removeEventListener("pointermove",move);
    surface.removeEventListener("pointerup",finish);
    surface.removeEventListener("pointercancel",cancel);
    if(surface.hasPointerCapture(e.pointerId))surface.releasePointerCapture(e.pointerId);
    if(movementFrame)cancelAnimationFrame(movementFrame);
    movementFrame=0;ghost.hidden=true;panel.classList.remove("layout-drag-source");
  };
  const finish=e=>{
    move(e);cleanup(e);
    if(["x","y"].some(k=>start[k]!==next[k]))saveGridPosition(id,next,"drag");
    else applyGridPreview(original);
  };
  const cancel=e=>{cleanup(e);applyGridPreview(original);};
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
  refreshArrangeTools();
}
installLayoutEditor();

const customHiddenSeries=new Map<string,Set<string>>();
function customChartUpdate(id,patch){
  const charts=dashboardConfig.charts.map(c=>c.id===id?{...c,...patch}:c);
  persistDashboardConfig({...dashboardConfig,charts});
  if(state.report)render();
}
function customSelect(id,label,field,options){
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
function createCustomPanel(chart){
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
  const configs=new Map(dashboardConfig.charts.map(c=>[c.id,c]));
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
      select.value=chart[select.dataset.customField];
  }
}
function renderCustomCharts(){
  for(const chart of dashboardConfig.charts){
    const data=buildChart(state.report,{period:chart.period,agent:state.agent,model:state.model,
      metric:chart.metric,breakdown:chart.breakdown});
    const bars=$("custom-bars-"+chart.id),plot=$("custom-svg-"+chart.id).parentElement,
      legend=$("custom-legend-"+chart.id);
    const isLine=chart.visual==="line";
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
  $("graph-form").addEventListener("submit",(event)=>{
    event.preventDefault();
    try{
      if(dashboardConfig.charts.length>=4)throw Error("Maximum four user-defined graphs.");
      let i=1;while(dashboardConfig.charts.some(c=>c.id==="custom-"+i))i++;
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
function dimensionsForGraph(id,group){
  if(!state.report)return group==="total"?["Total"]:[];
  const catalog=chartCatalog(state.report);
  if(id==="guidance")return ["Pricing estimates","Subscription quotas","Local reports"];
  if(id==="cache")return ["Input","Output","Cache reads","Cache writes"];
  if(id==="kpis")return ["Reported tokens","Fresh input","Generated output","API-equivalent cost"];
  if(id==="sessions"||id==="providers")return catalog.agents;
  if(id==="models")return catalog.models;
  return group==="total"?["Total"]:group==="model"?catalog.models:catalog.agents;
}
function settingsForGraph(id){
  if(id==="trend")return {metric:state.metric,breakdown:state.breakdown,
    maxSeries:dashboardConfig.widgetSettings.trend.maxSeries,
    showLabels:dashboardConfig.widgetSettings.trend.showLabels,
    hiddenDimensions:[...dashboardConfig.widgetSettings.trend.hiddenDimensions]};
  if(id==="providers"||id==="models")return {...dashboardConfig.widgetSettings[id]};
  if(id==="sessions")return {metric:state.sessionMetric,
    hiddenDimensions:[...dashboardConfig.widgetSettings.sessions.hiddenDimensions]};
  if(id==="cache"||id==="kpis"||id==="guidance")return {hiddenDimensions:[...dashboardConfig.widgetSettings[id].hiddenDimensions]};
  return {...dashboardConfig.charts.find(c=>c.id===id)};
}
function editorField(label,key,type,values=[]) {
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
function openVisualizationEditor(id){
  rememberViewport();
  const custom=dashboardConfig.charts.some(chart=>chart.id===id);
  editingVisualization={id,custom,draft:settingsForGraph(id)};
  $("visual-editor-heading").textContent="Edit "+(WIDGET_REGISTRY[id]?.title ??
    dashboardConfig.charts.find(c=>c.id===id)?.title??id);
  const fields=$("visual-editor-fields");
  fields.replaceChildren();
  const metricOptions=Object.entries(METRIC_NAMES),breakdownOptions=[
    ["total","Total"],["provider","Provider"],["model","Model"]
  ],periodOptions=[["daily","Daily"],["weekly","Weekly"],["monthly","Monthly"]];
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
function hideWidget(id){
  const previousScroll=window.scrollY;
  const next=dashboardConfig.widgets.filter(value=>value!==id);
  if(arranging){$("visual-editor-status").textContent="Save or cancel your layout edit before hiding widgets.";return;}
  if(!next.length){$("visual-editor-status").textContent="Keep at least one visible widget.";return;}
  persistDashboardConfig({...dashboardConfig,widgets:next,layout:layoutAfterVisibilityChange(next)});
  if(state.report)render();
  if($("visual-editor").open)$("visual-editor").close();
  refreshArrangeTools();
  requestAnimationFrame(()=>window.scrollTo({top:previousScroll,behavior:"instant"}));
}
function deleteCustomChart(id){
  if(arranging)return;
  const charts=dashboardConfig.charts.filter(chart=>chart.id!==id);
  const widgets=dashboardConfig.widgets.filter(widget=>widget!==id);
  if(!widgets.length)widgets.push("kpis");
  const widths={...dashboardConfig.layout.widths},positions={...dashboardConfig.layout.positions};
  delete widths[id];delete positions[id];customHiddenSeries.delete(id);
  const packed=compactVisibleLayout(positions,widgets,$("dashboard-grid").getBoundingClientRect().width);
  persistDashboardConfig({...dashboardConfig,charts,widgets,layout:{widths,positions:packed}});
  if(state.report)render();
  refreshArrangeTools();
}
function installVisualizationMenu(panel){
  if(panel.querySelector(".viz-menu-trigger"))return;
  const id=panel.dataset.widget;
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
  const add=(label,action,cls="")=>{
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
  menu.addEventListener("toggle",e=>trigger.setAttribute("aria-expanded",String(e.newState==="open")));
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
$("visual-editor-form").addEventListener("submit",event=>{
  event.preventDefault();
  const editor=editingVisualization;
  if(!editor)return;
  try{
    const draft=editor.draft,id=editor.id;
    if(editor.custom){
      const charts=dashboardConfig.charts.map(c=>c.id===id?{...c,...draft}:c);
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
