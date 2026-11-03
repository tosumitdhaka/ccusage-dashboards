// Curated, data-only chart presets; every value is accepted by CustomChart validation.
export const GRAPH_PRESETS = Object.freeze([
    { id: "provider-tokens", title: "Tokens by provider", visual: "bars", metric: "totalTokens", breakdown: "provider", period: "daily" },
    { id: "model-cost", title: "Estimated cost by model", visual: "bars", metric: "totalCost", breakdown: "model", period: "daily" },
    { id: "cache-trend", title: "Cache reads over time", visual: "line", metric: "cacheReadTokens", breakdown: "total", period: "daily" },
    { id: "weekly-input", title: "Weekly input tokens", visual: "line", metric: "inputTokens", breakdown: "provider", period: "weekly" }
]);
export function getGraphPreset(id) {
    const preset = GRAPH_PRESETS.find(item => item.id === id);
    if (!preset)
        throw Error("Unknown graph preset.");
    return { ...preset };
}
