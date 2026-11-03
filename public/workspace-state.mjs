const PERIODS = new Set(["today", "7d", "14d", "30d", "90d", "all"]);
const DEFAULT_STATE = {
    filters: {
        period: "7d",
        providers: [],
        models: [],
        agents: [],
        sessions: [],
        metric: "totalTokens"
    },
    density: "comfortable",
    selection: null
};
function uniqueStrings(values, fallback = []) {
    if (!Array.isArray(values))
        return [...fallback];
    return [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0)
            .map((value) => value.trim()))];
}
function normalizeState(input, previous = DEFAULT_STATE) {
    const filters = input.filters ?? {};
    const period = filters.period && PERIODS.has(filters.period) ? filters.period : previous.filters.period;
    const density = input.density === "compact" || input.density === "comfortable" ? input.density : previous.density;
    return {
        filters: {
            period,
            providers: uniqueStrings(filters.providers, previous.filters.providers),
            models: uniqueStrings(filters.models, previous.filters.models),
            agents: uniqueStrings(filters.agents, previous.filters.agents),
            sessions: uniqueStrings(filters.sessions, previous.filters.sessions),
            metric: typeof filters.metric === "string" && filters.metric ? filters.metric : previous.filters.metric
        },
        density,
        selection: input.selection === undefined ? previous.selection : input.selection
    };
}
function sameState(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}
export function createWorkspaceStore(initial = {}) {
    let current = normalizeState(initial);
    const listeners = new Set();
    const mutate = (patch, source) => {
        const previous = current;
        const next = normalizeState(patch, previous);
        if (sameState(previous, next))
            return false;
        current = next;
        const meta = { source };
        for (const listener of listeners)
            listener(current, previous, meta);
        return true;
    };
    return {
        getState: () => current,
        hydrate: (patch, source = "hydrate") => mutate(patch, source),
        setFilters: (patch, source = "workspace") => mutate({ filters: patch }, source),
        setDensity: (density, source = "workspace") => mutate({ density }, source),
        setSelection: (selection, source = "workspace") => mutate({ selection }, source),
        clearEntityFilters: (source = "workspace") => mutate({
            filters: { providers: [], models: [], agents: [], sessions: [] }
        }, source),
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    };
}
export const workspaceStore = createWorkspaceStore();
