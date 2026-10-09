import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = dirname(fileURLToPath(import.meta.url));
const COMMAND_ARGS = ["daily", "--sections", "daily,weekly,monthly,session", "--by-agent", "--json"];

export function reportArgs({ offline = process.env.CCUSAGE_OFFLINE === "1" } = {}) {
  return offline ? [...COMMAND_ARGS, "--offline"] : [...COMMAND_ARGS];
}

// The upstream package publishes a CLI, not a stable JS data API. Resolve its
// documented bin script as part of our installed, pinned npm dependency.
export function locateCli({ env = process.env, resolvePackage = require.resolve, node = process.execPath, args = reportArgs() } = {}) {
  if (env.CCUSAGE_BIN?.trim()) {
    const binary = resolve(env.CCUSAGE_BIN.trim());
    return { command: binary, args, cwd: ROOT };
  }
  let manifest;
  try {
    manifest = resolvePackage("ccusage/package.json");
  } catch {
    throw new Error("Official ccusage dependency missing. Run npm install (or bun install) in this repository.");
  }
  return { command: node, args: [join(dirname(manifest), "src", "cli.js"), ...args], cwd: ROOT };
}

export function collectUsage({ exec = execFile, env = process.env, args = reportArgs() } = {}) {
  const { command, args: commandArgs, cwd } = locateCli({ env, args });
  return new Promise((resolvePromise, reject) => {
    exec(command, commandArgs, {
      cwd, shell: false, windowsHide: true,
      timeout: 120_000, maxBuffer: 32 * 1024 * 1024,
      env: { ...env, LOG_LEVEL: "0" }
    }, (error, stdout, stderr) => {
      if (error) {
        console.error("[dashboard] Official ccusage CLI failed:", stderr?.trim() || error.message);
        reject(new Error("ccusage could not produce a report. Check the terminal and verify npm dependencies."));
        return;
      }
      try {
        const json = JSON.parse(stdout);
        if (!json || !Array.isArray(json.daily)) throw new Error("Unified daily report missing");
        resolvePromise(json);
      } catch {
        reject(new Error("Official ccusage returned unexpected JSON; check the pinned CLI version."));
      }
    });
  });
}
