import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DEFAULT_DASHBOARD, validateDashboardConfig } from "../public/widget-registry.mjs";

test("header-period includes today option, defaults to 7d selected, and validates schema", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const tsRegistry = await readFile(new URL("../src/client/widget-registry.mts", import.meta.url), "utf8");
  const jsRegistry = await readFile(new URL("../public/widget-registry.mjs", import.meta.url), "utf8");

  // Verify .topbar has #header-period select
  const topbarMatch = html.match(/<header class="topbar">([\s\S]*?)<\/header>/);
  assert.ok(topbarMatch, "Expected .topbar header in public/index.html");
  const topbarHtml = topbarMatch[1];

  assert.ok(topbarHtml.includes('id="header-period"'), "Missing #header-period in .topbar");

  // Verify option order: 'today' should be the first option, and '7d' should be selected default
  const selectMatch = topbarHtml.match(/<select id="header-period"[^>]*>([\s\S]*?)<\/select>/);
  assert.ok(selectMatch, "Expected #header-period select in topbar HTML");
  const optionsHtml = selectMatch[1];

  const options = [...optionsHtml.matchAll(/<option\s+value="([^"]+)"([^>]*)>([^<]+)<\/option>/g)].map((m) => ({
    value: m[1],
    attrs: m[2],
    label: m[3]
  }));

  assert.ok(options.length >= 6, "Expected at least 6 period options (today, 7d, 14d, 30d, 90d, all)");
  assert.equal(options[0].value, "today", "First option must be value='today'");
  assert.equal(options[0].label, "Today", "First option label must be 'Today'");

  // 7d must be selected
  assert.equal(options[1].value, "7d", "Second option must be value='7d'");
  assert.ok(options[1].attrs.includes("selected"), "Option 7d must have 'selected' attribute as the default");

  // 30d must not be selected
  const opt30d = options.find((o) => o.value === "30d");
  assert.ok(opt30d, "Option 30d must exist");
  assert.ok(!opt30d.attrs.includes("selected"), "Option 30d must not have 'selected' attribute");

  // Verify DEFAULT_DASHBOARD filters default
  assert.equal(DEFAULT_DASHBOARD.filters.period, "7d", "DEFAULT_DASHBOARD.filters.period must default to '7d'");

  // Verify PeriodRange type includes 'today' in TypeScript source
  assert.match(tsRegistry, /export type PeriodRange\s*=\s*"today"/, "PeriodRange in widget-registry.mts must include 'today'");

  // Verify validateDashboardConfig accepts 'today'
  const configWithToday = validateDashboardConfig({
    ...DEFAULT_DASHBOARD,
    filters: { ...DEFAULT_DASHBOARD.filters, period: "today" }
  });
  assert.equal(configWithToday.filters.period, "today", "validateDashboardConfig should accept 'today'");

  // Verify validateDashboardConfig accepts '7d'
  const configWith7d = validateDashboardConfig({
    ...DEFAULT_DASHBOARD,
    filters: { ...DEFAULT_DASHBOARD.filters, period: "7d" }
  });
  assert.equal(configWith7d.filters.period, "7d", "validateDashboardConfig should accept '7d'");

  // Verify invalid period continues to be rejected
  assert.throws(
    () => validateDashboardConfig({ ...DEFAULT_DASHBOARD, filters: { ...DEFAULT_DASHBOARD.filters, period: "tomorrow" } }),
    /period/
  );
});

test("filterReportByPeriod correctly filters for today and 7d", async () => {
  const ts = await readFile(new URL("../src/client/dashboard.ts", import.meta.url), "utf8");
  const js = await readFile(new URL("../public/dashboard.js", import.meta.url), "utf8");

  // Extract functions from compiled public/dashboard.js for live behavioral verification
  const fnReportStr = js.slice(js.indexOf("function filterReportByPeriod("), js.indexOf("function filterHourlyByPeriod("));
  const filterReportByPeriod = new Function(`${fnReportStr}; return filterReportByPeriod;`)();

  const fnHourlyStr = js.slice(js.indexOf("function filterHourlyByPeriod("), js.indexOf("function updateSelectors("));
  const filterHourlyByPeriod = new Function(`${fnHourlyStr}; return filterHourlyByPeriod;`)();

  const mockReport = {
    daily: [
      { date: "2026-10-15", totalTokens: 100 },
      { date: "2026-10-24", totalTokens: 200 },
      { date: "2026-10-28", totalTokens: 300 },
      { date: "2026-10-29", totalTokens: 400 }
    ],
    weekly: [
      { period: "2026-W42", totalTokens: 100 },
      { period: "2026-W44", totalTokens: 700 }
    ],
    session: [
      { date: "2026-10-15T08:00:00Z", totalTokens: 100 },
      { date: "2026-10-24T12:00:00Z", totalTokens: 200 },
      { date: "2026-10-28T16:00:00Z", totalTokens: 300 },
      { date: "2026-10-29T10:00:00Z", totalTokens: 400 }
    ]
  };

  // Test "today" filter on mockReport (latest date is 2026-10-29)
  const todayResult = filterReportByPeriod(mockReport, "today");
  assert.equal(todayResult.daily.length, 1, "Today daily results must contain exactly 1 day");
  assert.equal(todayResult.daily[0].date, "2026-10-29", "Today daily must match the latest date in dataset");
  assert.equal(todayResult.session.length, 1, "Today session results must contain only sessions from today");
  assert.ok(todayResult.session[0].date.startsWith("2026-10-29"), "Session date must match target today date");

  // Test "7d" filter on mockReport
  const sevenDayResult = filterReportByPeriod(mockReport, "7d");
  const sevenDayDates = sevenDayResult.daily.map((d) => d.date);
  assert.ok(!sevenDayDates.includes("2026-10-15"), "7d filter must exclude dates older than 7 days");
  assert.ok(sevenDayDates.includes("2026-10-24"), "7d filter must include 2026-10-24 (within 7 days of 2026-10-29)");
  assert.ok(sevenDayDates.includes("2026-10-28"), "7d filter must include 2026-10-28");
  assert.ok(sevenDayDates.includes("2026-10-29"), "7d filter must include 2026-10-29");

  // Test filterHourlyByPeriod
  const mockSnapshots = [
    { timestamp: "2026-10-15T10:00:00Z", tokens: 50 },
    { timestamp: "2026-10-28T14:00:00Z", tokens: 150 },
    { timestamp: "2026-10-29T08:00:00Z", tokens: 200 },
    { timestamp: "2026-10-29T12:00:00Z", tokens: 250 }
  ];

  const todayHourly = filterHourlyByPeriod(mockSnapshots, "today");
  assert.equal(todayHourly.length, 2, "Today hourly snapshots must only include entries from the current day");
  for (const s of todayHourly) {
    assert.ok(s.timestamp.startsWith("2026-10-29"), "Snapshot timestamp must start with 2026-10-29");
  }

  const sevenDayHourly = filterHourlyByPeriod(mockSnapshots, "7d");
  assert.equal(sevenDayHourly.length, 3, "7d hourly snapshots must include entries from 2026-10-28 and 2026-10-29");

  // Verify static patterns and 7d default fallbacks in both TS and JS
  for (const [name, code] of [["dashboard.ts", ts], ["dashboard.js", js]]) {
    assert.match(code, /period\s*===\s*["']today["']/, `${name} must check period === "today"`);
    assert.match(code, /state\.section\s*=\s*(?:filters\.period\s*\|\|\s*["']7d["']|["']7d["'])/, `${name} must default state.section to 7d`);
    assert.match(code, /activePeriod\s*=\s*state\.section\s*\|\|\s*["']7d["']/, `${name} must fallback activePeriod to 7d`);
  }
});

test("trend-period chip is absent from public/index.html and safely guarded in client code", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const ts = await readFile(new URL("../src/client/dashboard.ts", import.meta.url), "utf8");
  const js = await readFile(new URL("../public/dashboard.js", import.meta.url), "utf8");

  // Trend card must not contain #trend-period chip
  assert.ok(!html.includes('id="trend-period"'), "Redundant #trend-period chip must be removed from public/index.html");
  assert.ok(!html.includes('trend-period'), "trend-period must not appear in public/index.html");

  // Ensure trend card header contains chart controls cleanly without duplicate chip
  const trendMatch = html.match(/<section[^>]*id="trend"[^>]*>([\s\S]*?)<\/section>/);
  assert.ok(trendMatch, "Expected #trend card section in public/index.html");
  const trendHtml = trendMatch[1];
  assert.ok(!trendHtml.includes("DAILY"), "Redundant [ DAILY ] text chip must not be in #trend header");

  // References in dashboard.ts and public/dashboard.js must guard against null
  for (const [name, code] of [["dashboard.ts", ts], ["dashboard.js", js]]) {
    assert.match(code, /const trendChip\s*=\s*\$\(["']trend-period["']\);/, `${name} looks up trendChip`);
    assert.match(code, /if\s*\(\s*trendChip\s*\)\s*trendChip\.textContent/, `${name} must safely guard trendChip before setting textContent`);
  }
});

test("viz-menu-trigger rules enforce opacity: 0 by default and opacity: 1 on :hover / :focus-within", async () => {
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

  // Default hidden state: opacity: 0 and pointer-events: none
  assert.match(
    css,
    /\.dashboard-grid>\[data-widget\] \.viz-menu-trigger,\s*\.dashboard-grid>\.panel \.viz-menu-trigger,\s*\.dashboard-grid>\.wide-card \.viz-menu-trigger\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/,
    "Expected .viz-menu-trigger default hidden rule with opacity: 0 and pointer-events: none"
  );

  // Hover and focus-within state: opacity: 1 and pointer-events: auto
  assert.match(
    css,
    /\.dashboard-grid>\[data-widget\]:hover \.viz-menu-trigger[\s\S]*?opacity:\s*1;[^}]*pointer-events:\s*auto;/,
    "Expected .viz-menu-trigger hover / focus-within / aria-expanded rule with opacity: 1 and pointer-events: auto"
  );

  // Transition smoothing for opacity
  assert.match(
    css,
    /transition:\s*opacity 130ms ease;/,
    "Expected smooth opacity transition on .viz-menu-trigger"
  );

  // Accessibility: devices without hover capability maintain visibility
  assert.match(
    css,
    /@media\s*\(\s*hover:\s*none\s*\)\s*\{[\s\S]*?\.viz-menu-trigger[\s\S]*?opacity:\s*1/,
    "Expected @media (hover: none) rule to ensure accessibility on touch devices"
  );
});
