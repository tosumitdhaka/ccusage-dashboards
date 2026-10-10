import { buildView } from "./normalize.mjs";
import { METRIC_NAMES, DEFAULT_DASHBOARD, WIDGET_REGISTRY, validateDashboardConfig } from "./widget-registry.mjs";
import {
  MAX_DASHBOARD_JSON_LENGTH, readDashboardConfig, saveDashboardConfig,
  resetDashboardConfig, parseDashboardJSON, stringifyDashboardConfig
} from "./dashboard-config.mjs";
import { buildChart, buildObservedHourly, buildSessions, chartCatalog } from "./analytics.mjs";
import { colorForDimension, labelPointIndices } from "./chart-presentation.mjs";

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
  const enabled = new Set(dashboardConfig.widgets);
  document.querySelectorAll("[data-widget]").forEach((node) => {
    node.hidden = !enabled.has(node.dataset.widget);
  });
  document.querySelectorAll("[data-widget-group]").forEach((group) => {
    group.hidden = [...group.querySelectorAll("[data-widget]")].every((node) => node.hidden);
  });
  $("view-name").textContent = dashboardConfig.title;
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
function drawLineChart(data, metric) {
  const svg = $("trend-chart");
  const legend = $("trend-legend");
  svg.replaceChildren(); legend.replaceChildren();
  // Match the actual CSS viewport. A fixed 920×264 viewBox letterboxed the
  // graph at desktop widths, wasting horizontal space around the plot.
  const W = Math.max(320, Math.round(svg.getBoundingClientRect().width || 920));
  const H = Math.max(300, Math.round(svg.getBoundingClientRect().height || 360));
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const L = 78, T = 40, R = 18, B = 48, PW = W - L - R, PH = H - T - B;
  const groupKind = data.breakdown === "model" ? "model" : "provider";
  const settings = dashboardConfig.widgetSettings.trend;
  const shown = data.series.slice(0, settings.maxSeries);
  shown.forEach((s) => {
    const key = el("button", "legend-item legend-toggle");
    key.type = "button";
    const enabled = !hiddenTrendSeries.has(s.name);
    key.setAttribute("aria-pressed", String(enabled));
    key.setAttribute("aria-label", (enabled ? "Hide " : "Show ") + s.name + " series");
    if (!enabled) key.classList.add("muted");
    const marker = el("span", "legend-swatch");
    marker.style.background = colorForDimension(s.name, groupKind);
    key.append(marker, document.createTextNode(s.name));
    key.addEventListener("click", () => {
      if (hiddenTrendSeries.has(s.name)) hiddenTrendSeries.delete(s.name);
      else hiddenTrendSeries.add(s.name);
      render();
    });
    legend.append(key);
  });
  const names = shown.filter((s) => !hiddenTrendSeries.has(s.name)).map((s) => s.name);
  if (!names.length || !data.points.length) {
    const label = svgEl("text", { x: W / 2, y: H / 2, fill: "#92a0b8", "text-anchor": "middle", "font-size": 15 });
    label.textContent = state.section === "hourly"
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
      const label = state.section === "hourly" ? p.label.replace("T", " ") : p.label;
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
    label.textContent = state.section === "hourly" ? p.label.slice(5, 13).replace("T", " ") : p.label;
    svg.append(label);
  });
}
function drawBars(id, entries, metric, emptyMessage, limit, kind) {
  const target = $(id);
  target.replaceChildren();
  if (!entries.length) { empty(target, emptyMessage); return; }
  const max = Math.max(1e-10, ...entries.map((e) => e.value));
  entries.slice(0, limit).forEach((item) => {
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
  drawBars("provider-bars", providerGraph.series, providerSettings.metric, "No provider breakdown available.", providerSettings.limit, "provider");
  drawBars("model-bars", modelGraph.series, modelSettings.metric, "No model breakdown available.", modelSettings.limit, "model");
  $("provider-summary").textContent = "Ranked by " + METRIC_NAMES[providerSettings.metric].toLowerCase();
  $("model-summary").textContent = "Ranked by " + METRIC_NAMES[modelSettings.metric].toLowerCase();
  const sessions = buildSessions(state.report, { agent: state.agent, model: state.model, metric: state.sessionMetric });
  drawSessionGraph(sessions);
  drawSessionTable(buildSessions(state.report, { agent: state.agent, model: state.model, metric: "totalTokens", limit: 10 }));
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
  for (const [key, widget] of Object.entries(WIDGET_REGISTRY)) {
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
    const widgets = [...$("widget-options").querySelectorAll("input:checked")].map((input) => input.value);
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
