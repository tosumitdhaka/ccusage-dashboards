import { DEFAULT_DASHBOARD, validateDashboardConfig } from "./widget-registry.mjs";

// Browser-only dashboard preferences. Never stores report data, session IDs or credentials.
export const DASHBOARD_STORAGE_KEY = "ccusage-dashboards:dashboard:v1";
export const MAX_DASHBOARD_JSON_LENGTH = 16_384;

export function parseDashboardJSON(raw) {
  if (typeof raw !== "string" || raw.length > MAX_DASHBOARD_JSON_LENGTH) {
    throw new Error("Dashboard JSON must be text smaller than 16 KiB.");
  }
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error("Invalid dashboard JSON."); }
  return validateDashboardConfig(parsed);
}
export function stringifyDashboardConfig(config) {
  const json = JSON.stringify(validateDashboardConfig(config), null, 2) + "\n";
  if (json.length > MAX_DASHBOARD_JSON_LENGTH) throw new Error("Dashboard JSON too large.");
  return json;
}
export function readDashboardConfig(storage) {
  const raw = storage.getItem(DASHBOARD_STORAGE_KEY);
  return raw === null ? validateDashboardConfig(DEFAULT_DASHBOARD) : parseDashboardJSON(raw);
}
export function saveDashboardConfig(storage, config) {
  const json = stringifyDashboardConfig(config);
  storage.setItem(DASHBOARD_STORAGE_KEY, json);
  return parseDashboardJSON(json);
}
export function resetDashboardConfig(storage) {
  storage.removeItem(DASHBOARD_STORAGE_KEY);
  return validateDashboardConfig(DEFAULT_DASHBOARD);
}
