import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Registry errors or a conflicting immutable npm tarball must fail closed.
export async function registryState({ name, version, shasum, fetcher = fetch, attempts = 1,
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  if (name !== "ccusage-dashboards" || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version) ||
    !/^[a-f0-9]{40}$/.test(shasum) || !Number.isInteger(attempts) || attempts < 1) {
    throw new Error("Invalid package release identity");
  }
  for (let i=0; i<attempts; i++) {
    const result=await fetcher(`https://registry.npmjs.org/${name}/${version}`, {
      headers: {accept:"application/json"}, cache:"no-store", signal:AbortSignal.timeout(15000)
    });
    if (result.status===404) {
      if (i+1<attempts) { await pause(3000); continue; }
      return "absent";
    }
    if (!result.ok) throw new Error("npm registry HTTP "+result.status);
    const metadata=await result.json();
    if (metadata.name!==name || metadata.version!==version || metadata.dist?.shasum!==shasum)
      throw new Error("Published version conflicts with tested package archive");
    return "present";
  }
  throw new Error("Registry verification exhausted");
}
async function run() {
  const [mode,version,file]=process.argv.slice(2);
  if (!["pre","post"].includes(mode)||!version||!file) throw new Error("pre|post VERSION ARCHIVE_JSON required");
  const data=JSON.parse(await readFile(file,"utf8"));
  if (!Array.isArray(data)||data.length!==1||data[0]?.version!==version)
    throw new Error("Expected one matching packed npm archive");
  const state=await registryState({
    name:data[0].name,version,shasum:data[0].shasum,attempts:mode==="post"?10:1
  });
  if (mode==="post"&&state!=="present") throw new Error("Published version not visible on npm after retries");
  process.stdout.write(state+"\n");
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1])
  run().catch((err)=>{ console.error(err.message); process.exitCode=1; });
