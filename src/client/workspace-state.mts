export type WorkspacePeriod = "today" | "7d" | "14d" | "30d" | "90d" | "all";
export type WorkspaceDensity = "comfortable" | "compact";

export interface WorkspaceFilters {
  period: WorkspacePeriod;
  providers: string[];
  models: string[];
  agents: string[];
  sessions: string[];
  metric: string;
}

export interface WorkspaceState {
  filters: WorkspaceFilters;
  density: WorkspaceDensity;
  selection: string | null;
}

export interface WorkspaceStatePatch {
  filters?: Partial<WorkspaceFilters>;
  density?: WorkspaceDensity;
  selection?: string | null;
}

export interface WorkspaceMutationMeta {
  source: string;
}

export type WorkspaceListener = (
  state: WorkspaceState,
  previous: WorkspaceState,
  meta: WorkspaceMutationMeta
) => void;

export interface WorkspaceStore {
  getState(): WorkspaceState;
  hydrate(patch: WorkspaceStatePatch, source?: string): boolean;
  setFilters(patch: Partial<WorkspaceFilters>, source?: string): boolean;
  setDensity(density: WorkspaceDensity, source?: string): boolean;
  setSelection(selection: string | null, source?: string): boolean;
  clearEntityFilters(source?: string): boolean;
  subscribe(listener: WorkspaceListener): () => void;
}

const PERIODS = new Set<WorkspacePeriod>(["today", "7d", "14d", "30d", "90d", "all"]);

const DEFAULT_STATE: WorkspaceState = {
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

function uniqueStrings(values: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(values)) return [...fallback];
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim()))];
}

function normalizeState(input: WorkspaceStatePatch, previous: WorkspaceState = DEFAULT_STATE): WorkspaceState {
  const filters = input.filters ?? {};
  const period = filters.period && PERIODS.has(filters.period) ? filters.period : previous.filters.period;
  const density = input.density === "compact" || input.density === "comfortable" ? input.density : previous.density;
  const providers = uniqueStrings(filters.providers, previous.filters.providers);
  const models = uniqueStrings(filters.models, previous.filters.models);
  const agents = uniqueStrings(filters.agents, previous.filters.agents);
  const sessions = uniqueStrings(filters.sessions, previous.filters.sessions);
  // Phase 2 only supports one provider/model; reject non-functional filters.
  if (providers.length > 1 || models.length > 1 || agents.length || sessions.length) {
      throw new RangeError("Unsupported workspace filter combination");
  }
  return {
    filters: {
      period,
      providers,
      models,
      agents,
      sessions,
      metric: typeof filters.metric === "string" && filters.metric ? filters.metric : previous.filters.metric
    },
    density,
    selection: input.selection === undefined ? previous.selection : input.selection
  };
}

function sameState(a: WorkspaceState, b: WorkspaceState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function createWorkspaceStore(initial: WorkspaceStatePatch = {}): WorkspaceStore {
  let current = normalizeState(initial);
  const listeners = new Set<WorkspaceListener>();

  const mutate = (patch: WorkspaceStatePatch, source: string): boolean => {
    const previous = current;
    const next = normalizeState(patch, previous);
    if (sameState(previous, next)) return false;
    current = next;
    const meta = { source };
    for (const listener of listeners) listener(current, previous, meta);
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
