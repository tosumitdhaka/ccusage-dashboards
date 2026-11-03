import { workspaceStore } from "./workspace-state.mjs";
const customPeriods = new Set(["14d", "all"]);
function first(values) {
    return values[0] ?? "all";
}
export function bindWorkspaceFilterController(store = workspaceStore) {
    const periodButtons = [...document.querySelectorAll(".workspace-period[data-period]")];
    const customPeriod = document.getElementById("header-period");
    const provider = document.getElementById("agent");
    const model = document.getElementById("model");
    const workspaceMetric = document.getElementById("workspace-metric");
    const trendMetric = document.getElementById("metric");
    const density = document.getElementById("workspace-density");
    const filterToggle = document.getElementById("workspace-filter-toggle");
    const filterPanel = document.getElementById("workspace-filter-panel");
    const filterCount = document.getElementById("workspace-filter-count");
    const activeBar = document.getElementById("active-filter-bar");
    const chips = document.getElementById("active-filter-chips");
    const clear = document.getElementById("clear-workspace-filters");
    const sidebarCollapse = document.getElementById("sidebar-collapse");
    const sidebar = document.getElementById("workspace-sidebar");
    const disposers = [];
    const listen = (target, type, handler) => {
        if (!target)
            return;
        target.addEventListener(type, handler);
        disposers.push(() => target.removeEventListener(type, handler));
    };
    const render = () => {
        const state = store.getState();
        const { filters } = state;
        document.documentElement.dataset.density = state.density;
        for (const button of periodButtons) {
            const active = button.dataset.period === filters.period;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
        }
        if (customPeriod)
            customPeriod.value = customPeriods.has(filters.period) ? filters.period : "";
        if (provider && [...provider.options].some((option) => option.value === first(filters.providers)))
            provider.value = first(filters.providers);
        if (model && [...model.options].some((option) => option.value === first(filters.models)))
            model.value = first(filters.models);
        if (workspaceMetric)
            workspaceMetric.value = filters.metric;
        if (trendMetric)
            trendMetric.value = filters.metric;
        if (density)
            density.value = state.density;
        const activeEntities = [
            ...filters.providers.map((value) => ({ kind: "providers", value })),
            ...filters.models.map((value) => ({ kind: "models", value })),
            ...filters.agents.map((value) => ({ kind: "agents", value })),
            ...filters.sessions.map((value) => ({ kind: "sessions", value }))
        ];
        if (filterCount) {
            filterCount.textContent = String(activeEntities.length);
            filterCount.hidden = activeEntities.length === 0;
        }
        if (chips) {
            chips.replaceChildren();
            for (const item of activeEntities) {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "filter-chip";
                button.textContent = item.value + " ×";
                button.setAttribute("aria-label", "Remove filter " + item.value);
                button.addEventListener("click", () => {
                    const current = store.getState().filters[item.kind];
                    store.setFilters({ [item.kind]: current.filter((value) => value !== item.value) }, "filter-chip");
                });
                chips.append(button);
            }
        }
        if (activeBar)
            activeBar.hidden = activeEntities.length === 0;
        if (clear)
            clear.hidden = activeEntities.length === 0;
    };
    for (const button of periodButtons) {
        listen(button, "click", () => {
            const period = button.dataset.period;
            if (period)
                store.setFilters({ period }, "period-segment");
        });
    }
    listen(customPeriod, "change", () => {
        const period = customPeriod?.value;
        if (period)
            store.setFilters({ period }, "period-custom");
    });
    listen(provider, "change", () => {
        store.setFilters({ providers: provider?.value && provider.value !== "all" ? [provider.value] : [] }, "provider-filter");
    });
    listen(model, "change", () => {
        store.setFilters({ models: model?.value && model.value !== "all" ? [model.value] : [] }, "model-filter");
    });
    listen(workspaceMetric, "change", () => {
        if (workspaceMetric?.value)
            store.setFilters({ metric: workspaceMetric.value }, "workspace-metric");
    });
    listen(trendMetric, "change", () => {
        if (trendMetric?.value)
            store.setFilters({ metric: trendMetric.value }, "trend-metric");
    });
    listen(density, "change", () => {
        store.setDensity(density?.value === "compact" ? "compact" : "comfortable", "density-control");
    });
    listen(filterToggle, "click", () => {
        if (!filterPanel || !filterToggle)
            return;
        const nextHidden = !filterPanel.hidden;
        filterPanel.hidden = nextHidden;
        filterToggle.setAttribute("aria-expanded", String(!nextHidden));
    });
    listen(clear, "click", () => store.clearEntityFilters("clear-filters"));
    listen(sidebarCollapse, "click", () => {
        if (!sidebar || !sidebarCollapse)
            return;
        const collapsed = sidebar.classList.toggle("is-collapsed");
        document.documentElement.dataset.sidebar = collapsed ? "collapsed" : "expanded";
        sidebarCollapse.setAttribute("aria-pressed", String(collapsed));
        sidebarCollapse.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
        sidebarCollapse.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
    });
    const unsubscribe = store.subscribe(render);
    disposers.push(unsubscribe);
    render();
    return {
        render,
        destroy() {
            for (const dispose of disposers.splice(0))
                dispose();
        }
    };
}
