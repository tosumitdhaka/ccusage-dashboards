#!/usr/bin/env node
// Published npm/bunx command. The dashboard and official ccusage native CLI
// are bundled through the package's regular npm dependencies.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startDashboardServer } from "../server.mjs";

function help() {
  process.stdout.write([
    "ccusage-dashboards — local coding-agent usage dashboard",
    "",
    "Usage: ccusage-dashboards [--port PORT] [--help] [--version]",
    "",
    "Options:",
    "  --port PORT    Local HTTP port (default: 4177; PORT env is also supported)",
    "  -h, --help     Show this help",
    "  -v, --version  Show dashboard package version",
    "",
    "Runs locally at http://127.0.0.1:4177; press Ctrl+C to stop.",
    "Reads local agent usage via the official ccusage dependency.",
    "Set CCUSAGE_OFFLINE=1 to disable pricing-catalog refresh.",
    ""
  ].join("\n"));
}

export function parseArguments(args, env = process.env) {
  let port = env.PORT === undefined ? 4177 : Number(env.PORT);
  let operation = "start";
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "-h" || arg === "--help") { operation = "help"; continue; }
    if (arg === "-v" || arg === "--version") { operation = "version"; continue; }
    if (arg === "--port" || arg.startsWith("--port=")) {
      const value = arg === "--port" ? args[++index] : arg.slice("--port=".length);
      if (value === undefined || value.trim() === "") throw new Error("--port expects an integer between 0 and 65535.");
      port = Number(value);
      continue;
    }
    throw new Error("Unknown argument: " + arg + ". Run --help for options.");
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Port must be an integer between 0 and 65535.");
  return { operation, port };
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const parsed = parseArguments(args, env);
  if (parsed.operation === "help") { help(); return; }
  if (parsed.operation === "version") {
    const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    process.stdout.write(pkg.version + "\n");
    return;
  }
  const server = await startDashboardServer({ port: parsed.port });
  const { port } = server.address();
  console.log("AI Usage Observatory: http://127.0.0.1:" + port);
  console.log("Official ccusage npm dependency is installed alongside the dashboard.");
  console.log("Press Ctrl+C to stop.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("[ccusage-dashboards]", error?.message ?? String(error));
    process.exitCode = 1;
  });
}
