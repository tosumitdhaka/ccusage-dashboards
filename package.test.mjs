import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArguments } from "./bin/ccusage-dashboards.mjs";

const pkg = JSON.parse(await readFile(new URL("./package.json", import.meta.url)));

test("publishable npm package includes CLI, server and all browser assets", () => {
  assert.equal(pkg.private, undefined);
  assert.equal(pkg.name, "ccusage-dashboards");
  assert.equal(pkg.version, "0.1.1");
  assert.equal(pkg.bin["ccusage-dashboards"], "bin/ccusage-dashboards.mjs");
  for (const name of ["bin/", "public/", "server.mjs", "ccusage-adapter.mjs", "snapshots.mjs"]) {
    assert.ok(pkg.files.includes(name), "Missing package asset: " + name);
  }
  assert.equal(pkg.dependencies.ccusage, "20.0.26");
  assert.equal(pkg.publishConfig.access, "public");
});

test("published command supports documented options and safe port validation", () => {
  assert.deepEqual(parseArguments([], {}), { operation: "start", port: 4177 });
  assert.deepEqual(parseArguments(["--port", "0"], {}), { operation: "start", port: 0 });
  assert.deepEqual(parseArguments(["--port=5500"], {}), { operation: "start", port: 5500 });
  assert.deepEqual(parseArguments(["--version"], {}), { operation: "version", port: 4177 });
  assert.deepEqual(parseArguments(["-h"], {}), { operation: "help", port: 4177 });
  assert.equal(parseArguments([], { PORT: "4199" }).port, 4199);
  assert.throws(() => parseArguments(["--port=65536"]), /Port must/);
  assert.throws(() => parseArguments(["--port"]), /expects an integer/);
  assert.throws(() => parseArguments(["--unknown"]), /Unknown argument/);
});

test("npm bin can execute version and help directly with Node", () => {
  const path = new URL("./bin/ccusage-dashboards.mjs", import.meta.url);
  const version = spawnSync(process.execPath, [fileURLToPath(path), "--version"], { encoding: "utf8", windowsHide: true });
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), pkg.version);
  const help = spawnSync(process.execPath, [fileURLToPath(path), "--help"], { encoding: "utf8", windowsHide: true });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /ccusage-dashboards/);
});
