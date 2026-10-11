import { buildView } from "./normalize.mjs";
import { METRIC_NAMES, DEFAULT_DASHBOARD, WIDGET_REGISTRY, validateDashboardConfig } from "./widget-registry.mjs";
import {
  MAX_DASHBOARD_JSON_LENGTH, readDashboardConfig, saveDashboardConfig,
  resetDashboardConfig, parseDashboardJSON, stringifyDashboardConfig
} from "./dashboard-config.mjs";
import { buildChart, buildObservedHourly, buildSessions, chartCatalog } from "./analytics.mjs";
import { colorForDimension, labelPointIndices } from "./chart-presentation.mjs";
import { GRID_COLUMNS, relocateGridWidget, snapToGrid } from "./dashboard-layout.mjs";

const $ = (id) => document.getElementById(id);
const state = { report: null, hourly: [], section: "daily", agent: "all", model: "all",
  breakdown: "total", metric: "totalTokens", sessionMetric: "totalTokens" };
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const hiddenTrendSeries = new Set();
let dismissedPricingSignature = null;
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
let dashboardConfig = validateDashboardConfig(DEFAULT_DASHBOARD);
let storageWarning = "";
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
  for(const panel of grid.querySelectorAll("[data-widget]")){
    const id=panel.dataset.widget;
    panel.hidden=!enabled.has(id);
    const rect=dashboardConfig.layout.positions[id];
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
function el(tag, cls = "", text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
function svgEl(tag, attrs = {}) {
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
    // Changing visibility must not reset the user's arranged widget positions.
    const widgets = [...dashboardConfig.widgets.filter(id=>checked.has(id)),
      ...[...checked].filter(id=>!dashboardConfig.widgets.includes(id))];
    const title = $("dashboard-title").value.trim();
    persistDashboardConfig(configWithCurrentFilters({ ...dashboardConfig, title, widgets }));
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
  if (!state.report) return;
  if (resizeFrame) cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; render(); updateActiveNavigation(); });
});
load();
setInterval(load, 60_000);



let arranging=false;
let activeDragId=null;
const interactiveHeaderTarget=target=>target.closest("button,select,input,label,a,summary,.viz-menu");
function currentPosition(id){return dashboardConfig.layout.positions[id];}
function refreshArrangeTools(){
  const grid=$("dashboard-grid");
  grid.classList.toggle("is-arranging",arranging);
  $("layout-edit").textContent=arranging?"🔒 Lock view":"🔓 Unlock layout";
  $("layout-edit").setAttribute("aria-pressed",String(arranging));
  $("layout-edit").setAttribute("aria-label",arranging?"Lock dashboard layout":"Unlock dashboard layout for editing");
  for(const panel of grid.querySelectorAll("[data-widget]")){
    const tools=panel.querySelector(".layout-tools");
    if(!tools)continue;
    tools.hidden=!arranging||panel.hidden;
    const header=panel.querySelector(":scope > .section-header");
    if(header)header.draggable=arranging;
    const handle=tools.querySelector(".layout-handle");
    if(handle)handle.draggable=arranging;
  }
}
function saveGridPosition(id,rect){
  const positions=relocateGridWidget(dashboardConfig.layout.positions,id,rect,dashboardConfig.widgets);
  persistDashboardConfig({...dashboardConfig,layout:{...dashboardConfig.layout,positions}});
  refreshArrangeTools();
  if(state.report)render();
}
function swapGridNeighbors(id,direction){
  const order=dashboardConfig.widgets;
  const index=order.indexOf(id),other=order[index+direction];
  if(index<0||!other)return;
  const left=currentPosition(id),right=currentPosition(other);
  let positions={...dashboardConfig.layout.positions};
  // When sizes differ, swap locations then displace any collisions predictably.
  positions=relocateGridWidget(positions,id,{...left,x:Math.min(right.x,GRID_COLUMNS-left.w),y:right.y},order);
  const reordered=[...order];[reordered[index],reordered[index+direction]]=[reordered[index+direction],reordered[index]];
  persistDashboardConfig({...dashboardConfig,widgets:reordered,layout:{...dashboardConfig.layout,positions}});
  if(state.report)render();
}
function toggleLock(){
  arranging=!arranging;
  refreshArrangeTools();
}
function installLayoutPanel(panel){
  if(panel.querySelector(".layout-tools"))return;
  const id=panel.dataset.widget;
  const label=()=>WIDGET_REGISTRY[id]?.title ?? dashboardConfig.charts.find(c=>c.id===id)?.title ?? id;
  const header=panel.querySelector(":scope > .section-header");
  const startDrag=event=>{
    if(!arranging || (event.currentTarget===header&&interactiveHeaderTarget(event.target))){
      event.preventDefault();return;
    }
    activeDragId=id;
    event.dataTransfer.effectAllowed="move";
    event.dataTransfer.setData("text/plain",id);
    panel.classList.add("layout-drag-source");
  };
  if(header)header.addEventListener("dragstart",startDrag);
  const tools=el("div","layout-tools");tools.hidden=true;
  const handle=el("span","layout-handle","⠿");handle.draggable=false;
  handle.title="Drag widget to any grid position";
  handle.setAttribute("aria-label","Drag "+label());
  handle.addEventListener("dragstart",startDrag);
  tools.append(handle);
  for(const [symbol,direction] of [["↑",-1],["↓",1]]){
    const button=el("button","layout-step",symbol);
    button.type="button";
    button.setAttribute("aria-label",(direction<0?"Move earlier: ":"Move later: ")+label());
    button.addEventListener("click",()=>swapGridNeighbors(id,direction));
    tools.append(button);
  }
  const help=el("span","layout-size-help","Drag corner ↘ to resize");
  tools.append(help);
  const resize=el("button","layout-resize","↘");
  resize.type="button";
  resize.title="Drag to resize widget along grid rows and columns";
  resize.setAttribute("aria-label","Resize "+label());
  tools.append(resize);
  panel.append(tools);
  resize.addEventListener("pointerdown",event=>{
    if(!arranging||event.button!==0)return;
    event.preventDefault();event.stopPropagation();
    const before=currentPosition(id);
    const grid=$("dashboard-grid"),widthStep=(grid.getBoundingClientRect().width+8)/GRID_COLUMNS;
    const initialX=event.clientX,initialY=event.clientY;
    let next={...before};
    resize.setPointerCapture(event.pointerId);
    const move=e=>{
      const w=Math.max(2,Math.min(GRID_COLUMNS-before.x,before.w+Math.round((e.clientX-initialX)/widthStep)));
      const h=Math.max(minimumWidgetRows(id),Math.min(48,before.h+Math.round((e.clientY-initialY)/32)));
      next={...before,w,h};
      panel.style.gridColumn=(next.x+1)+" / span "+next.w;
      panel.style.gridRow=(next.y+1)+" / span "+next.h;
    };
    const done=e=>{
      resize.removeEventListener("pointermove",move);
      resize.removeEventListener("pointerup",done);
      resize.removeEventListener("pointercancel",cancel);
      if(resize.hasPointerCapture(e.pointerId))resize.releasePointerCapture(e.pointerId);
      saveGridPosition(id,next);
    };
    const cancel=e=>{
      resize.removeEventListener("pointermove",move);
      resize.removeEventListener("pointerup",done);
      resize.removeEventListener("pointercancel",cancel);
      if(resize.hasPointerCapture(e.pointerId))resize.releasePointerCapture(e.pointerId);
      showWidgetSelection();
    };
    resize.addEventListener("pointermove",move);
    resize.addEventListener("pointerup",done);
    resize.addEventListener("pointercancel",cancel);
  });
  panel.addEventListener("dragend",()=>{
    activeDragId=null;
    panel.classList.remove("layout-drag-source");
    $("grid-drop-preview").hidden=true;
  });
}
function minimumWidgetRows(id){return id==="kpis"?4:id==="sessions"?10:id==="trend"?9:id==="cache"?6:id==="guidance"?5:6;}
function installLayoutEditor(){
  const grid=$("dashboard-grid");
  for(const panel of grid.querySelectorAll("[data-widget]")){
    installLayoutPanel(panel);
    installVisualizationMenu(panel);
  }
  // A single grid-level drop target supports empty cells, horizontal moves
  // and arbitrary grid positions, not just 'before/after' another panel.
  const preview=el("div","layout-drop-preview");
  preview.id="grid-drop-preview";preview.hidden=true;
  preview.setAttribute("aria-hidden","true");grid.append(preview);
  grid.addEventListener("dragover",event=>{
    if(!arranging||!activeDragId)return;
    event.preventDefault();
    event.dataTransfer.dropEffect="move";
    const r=currentPosition(activeDragId);
    const target=snapToGrid(event.clientX,event.clientY,grid.getBoundingClientRect(),r.w,r.h);
    preview.hidden=false;
    preview.style.gridColumn=(target.x+1)+" / span "+target.w;
    preview.style.gridRow=(target.y+1)+" / span "+target.h;
  });
  grid.addEventListener("drop",event=>{
    if(!arranging||!activeDragId)return;
    event.preventDefault();
    const id=activeDragId;
    activeDragId=null;preview.hidden=true;
    const r=currentPosition(id);
    saveGridPosition(id,snapToGrid(event.clientX,event.clientY,grid.getBoundingClientRect(),r.w,r.h));
  });
  grid.addEventListener("dragleave",event=>{
    if(!grid.contains(event.relatedTarget))preview.hidden=true;
  });
  $("layout-edit").addEventListener("click",toggleLock);
  refreshArrangeTools();
}
installLayoutEditor();

const customHiddenSeries=new Map();
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


let editingVisualization=null;
function dimensionsForGraph(id,group){
  if(!state.report)return group==="total"?["Total"]:[];
  const catalog=chartCatalog(state.report);
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
  $("visual-editor-dimensions").hidden=!["trend","providers","models","sessions"].includes(id)&&!custom;
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
  const next=dashboardConfig.widgets.filter(value=>value!==id);
  if(!next.length){$("visual-editor-status").textContent="Keep at least one visible widget.";return;}
  persistDashboardConfig({...dashboardConfig,widgets:next});
  if(state.report)render();
  if($("visual-editor").open)$("visual-editor").close();
  refreshArrangeTools();
}
function deleteCustomChart(id){
  const charts=dashboardConfig.charts.filter(chart=>chart.id!==id);
  const widgets=dashboardConfig.widgets.filter(widget=>widget!==id);
  if(!widgets.length)widgets.push("kpis");
  const widths={...dashboardConfig.layout.widths},positions={...dashboardConfig.layout.positions};
  delete widths[id];delete positions[id];customHiddenSeries.delete(id);
  persistDashboardConfig({...dashboardConfig,charts,widgets,layout:{widths,positions}});
  if(state.report)render();
  refreshArrangeTools();
}
function installVisualizationMenu(panel){
  if(panel.querySelector(":scope > .section-header .viz-menu"))return;
  const id=panel.dataset.widget;
  const header=panel.querySelector(":scope > .section-header");
  if(!header)return; // KPI collection has no individual visualization header
  const menu=el("details","viz-menu");
  const trigger=el("summary","viz-menu-trigger","⋮");
  trigger.title="Visualization options";
  trigger.setAttribute("aria-label","Options for "+(WIDGET_REGISTRY[id]?.title??id));
  const body=el("div","viz-menu-body");
  const edit=el("button","viz-menu-item","Edit visualization");
  edit.type="button";edit.addEventListener("click",()=>{menu.open=false;openVisualizationEditor(id);});
  const hide=el("button","viz-menu-item","Hide visualization");
  hide.type="button";hide.addEventListener("click",()=>{
    menu.open=false;editingVisualization={id};hideWidget(id);
  });
  body.append(edit,hide);
  if(id.startsWith("custom-")){
    const remove=el("button","viz-menu-item danger","Delete graph");
    remove.type="button";remove.addEventListener("click",()=>{menu.open=false;deleteCustomChart(id);});
    body.append(remove);
  }
  menu.append(trigger,body);
  header.append(menu);
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
