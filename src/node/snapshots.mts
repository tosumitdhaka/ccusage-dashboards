// TypeScript source; local-only sampled snapshots remain read-only API data.
export interface Observation {timestamp:string;day:string;row:Record<string,any>}
export interface SnapshotStore {read():Promise<Observation[]>;append(report: Record<string,any>):Promise<void>}
// Local-only, append-on-change observation samples. This is not event-time
// telemetry: successive cumulative daily reports yield observed differences.
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";

const FIELDS = ["inputTokens", "outputTokens", "cacheCreationTokens", "cacheReadTokens", "totalTokens", "totalCost"];
const pick = (row: Record<string,any>): Record<string,any> => {
  const out: Record<string,any> = {};
  for (const key of FIELDS) if (typeof row?.[key] === "number" && Number.isFinite(row[key])) out[key] = row[key];
  if (Array.isArray(row?.modelBreakdowns)) {
    out.modelBreakdowns = row.modelBreakdowns.filter((m) => typeof m?.modelName === "string").map((m) => ({
      modelName: m.modelName,
      ...Object.fromEntries(FIELDS.slice(0, 4).filter((k) => Number.isFinite(m[k])).map((k) => [k, m[k]])),
      cost: typeof m.cost === "number" ? m.cost : 0,
      missingPricing: m.missingPricing === true
    }));
  }
  return out;
};

export function observation(report: Record<string,any>, at: string = new Date().toISOString()): Observation|null {
  const daily = Array.isArray(report?.daily) ? report.daily : [];
  const dated = daily.map((r) => ({ ...r, day: r?.period ?? r?.date })).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.day));
  if (!dated.length) return null;
  dated.sort((a, b) => a.day.localeCompare(b.day));
  const row = dated.at(-1);
  return {
    timestamp: at,
    day: row.day,
    row: {
      ...pick(row), agent: row.agent || "all",
      agents: Array.isArray(row.agents) ? row.agents.filter((a: any) => typeof a?.agent === "string").map((a: any) => ({ agent: a.agent, ...pick(a) })) : []
    }
  };
}

export function createSnapshotStore({ file = join(homedir(), ".ccusage-dashboard", "history", "snapshots.json"), max = 5000 }: {file?:string;max?:number} = {}): SnapshotStore {
  let cache: Observation[]|null = null;
  let pending: Promise<any> = Promise.resolve();
  async function load() {
    if (cache !== null) return cache;
    try {
      const parsed = JSON.parse(await readFile(file, "utf8"));
      cache = Array.isArray(parsed) ? parsed.filter((r) => typeof r?.timestamp === "string" && r.row) : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
      cache = [];
    }
    return cache;
  }
  return {
    async read() { await pending; return [...await load()]; },
    async append(report) {
      const entry = observation(report);
      if (!entry) return;
      const task = pending.then(async () => {
        const records = await load();
        const prev = records.at(-1);
        // No duplicate/no-op samples. A later identical state adds no usage.
        if (prev && prev.day === entry.day && JSON.stringify(prev.row) === JSON.stringify(entry.row)) return;
        const next = [...records, entry].slice(-max);
        await mkdir(join(file, ".."), { recursive: true });
        const temp = file + "." + process.pid + ".tmp";
        try {
          await writeFile(temp, JSON.stringify(next), { mode: 0o600 });
          await rename(temp, file);
        } catch (error) {
          await unlink(temp).catch(() => {});
          throw error;
        }
        cache = next;
      });
      pending = task.catch(() => {});
      return task;
    }
  };
}

export function createMemorySnapshotStore(): SnapshotStore {
  let records: Observation[] = [];
  return {
    async append(report) { const r = observation(report); if (r) records.push(r); },
    async read() { return records.slice(); }
  };
}
