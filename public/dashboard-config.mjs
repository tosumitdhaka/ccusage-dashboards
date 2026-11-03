import { DEFAULT_DASHBOARD, validateDashboardConfig } from "./widget-registry.mjs";
// Only local presentation settings are persisted, never usage reports or credentials.
// Legacy v1 is read without mutation; the next explicit Save writes an atomic v4 envelope.
export const LEGACY_DASHBOARD_STORAGE_KEY = "ccusage-dashboards:dashboard:v1";
export const DASHBOARD_STORAGE_KEY = "ccusage-dashboards:dashboard:v4";
export const MAX_DASHBOARD_JSON_LENGTH = 16_384;
export const PERSISTED_DASHBOARD_VERSION = 4;
function boundedJSON(raw) {
    if (typeof raw !== "string" || raw.length > MAX_DASHBOARD_JSON_LENGTH) {
        throw new Error("Dashboard JSON must be text smaller than 16 KiB.");
    }
    try {
        return JSON.parse(raw);
    }
    catch {
        throw new Error("Invalid dashboard JSON.");
    }
}
export function parseDashboardJSON(raw) {
    return validateDashboardConfig(boundedJSON(raw));
}
export function stringifyDashboardConfig(config) {
    const json = JSON.stringify(validateDashboardConfig(config), null, 2) + "\n";
    if (json.length > MAX_DASHBOARD_JSON_LENGTH)
        throw new Error("Dashboard JSON too large.");
    return json;
}
export function parsePersistedDashboardV4(raw) {
    const parsed = boundedJSON(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw Error("Invalid persisted dashboard.");
    const envelope = parsed;
    if (Object.keys(envelope).length !== 2 || envelope.schemaVersion !== PERSISTED_DASHBOARD_VERSION ||
        !Object.hasOwn(envelope, "dashboard"))
        throw Error("Unsupported persisted dashboard version or fields.");
    return validateDashboardConfig(envelope.dashboard);
}
export function stringifyPersistedDashboardV4(config) {
    const envelope = {
        schemaVersion: 4,
        dashboard: validateDashboardConfig(config)
    };
    const json = JSON.stringify(envelope);
    if (json.length > MAX_DASHBOARD_JSON_LENGTH)
        throw Error("Dashboard JSON too large.");
    return json;
}
export function readDashboardConfig(storage) {
    const current = storage.getItem(DASHBOARD_STORAGE_KEY);
    if (current !== null)
        return parsePersistedDashboardV4(current);
    const legacy = storage.getItem(LEGACY_DASHBOARD_STORAGE_KEY);
    return legacy === null ? validateDashboardConfig(DEFAULT_DASHBOARD) : parseDashboardJSON(legacy);
}
export function saveDashboardConfig(storage, config) {
    const json = stringifyPersistedDashboardV4(config);
    // A single key update is atomic; never partially publish the v4 envelope.
    storage.setItem(DASHBOARD_STORAGE_KEY, json);
    return parsePersistedDashboardV4(json);
}
export function resetDashboardConfig(storage) {
    storage.removeItem(DASHBOARD_STORAGE_KEY);
    storage.removeItem(LEGACY_DASHBOARD_STORAGE_KEY);
    return validateDashboardConfig(DEFAULT_DASHBOARD);
}
