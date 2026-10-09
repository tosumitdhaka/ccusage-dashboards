import { spawn } from "node:child_process";
import { resolve } from "node:path";

const entry = resolve(".package-smoke", "node_modules", "ccusage-dashboards", "bin", "ccusage-dashboards.mjs");
const child = spawn(process.execPath, [entry, "--port", "0"], {
  shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, CCUSAGE_OFFLINE: "1" }
});
let stderr = "";
child.stderr.setEncoding("utf8");
child.stderr.on("data", (s) => { stderr += s; });

async function waitForUrl() {
  return new Promise((resolvePromise, reject) => {
    let stdout = "";
    const timer = setTimeout(() => reject(new Error("Installed npm package did not start within 30 seconds. " + stderr)), 30_000);
    const onExit = (code) => { clearTimeout(timer); reject(new Error("CLI exited before listening (" + code + "): " + stderr)); };
    child.once("exit", onExit);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const match = stdout.match(/AI Usage Observatory: (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) {
        clearTimeout(timer);
        child.removeListener("exit", onExit);
        resolvePromise(match[1]);
      }
    });
  });
}

try {
  const url = await waitForUrl();
  for (const asset of ["/", "/styles.css", "/dashboard.js", "/analytics.mjs", "/widget-registry.mjs"]) {
    const response = await fetch(url + asset);
    if (!response.ok) throw new Error("Packaged dashboard failed to serve " + asset + ": HTTP " + response.status);
    if (!(await response.text()).length) throw new Error("Empty browser asset: " + asset);
  }
  // This triggers the independently installed official ccusage npm dependency.
  const usage = await fetch(url + "/api/usage");
  if (!usage.ok) throw new Error("Packaged ccusage report failed: HTTP " + usage.status + "; " + await usage.text());
  const data = await usage.json();
  if (!Array.isArray(data.daily)) throw new Error("Packaged report was not ccusage unified JSON");
  console.log("Packaged npm installation smoke PASS:", url, "with", data.daily.length, "daily rows");
} finally {
  child.kill();
}
