import { readFile } from "node:fs/promises";

const previewPath = process.argv[2] ?? "package-preview.json";
const records = JSON.parse(await readFile(previewPath, "utf8"));
if (!Array.isArray(records) || records.length !== 1) throw new Error("Expected one npm tarball preview");
const item = records[0];
const names = new Set((item.files ?? []).map((f) => f.path));
const required = [
  "package.json",
  "bin/ccusage-dashboards.mjs",
  "server.mjs",
  "ccusage-adapter.mjs",
  "snapshots.mjs",
  "public/index.html",
  "public/dashboard.js",
  "public/styles.css",
  "public/analytics.mjs",
  "public/normalize.mjs",
  "public/widget-registry.mjs",
  "README.md"
];
for (const f of required) if (!names.has(f)) throw new Error("Missing npm tarball file: " + f);
if ([...names].some((f) => f.includes("test.mjs") || f.startsWith(".github/") || f.startsWith("node_modules/"))) {
  throw new Error("npm tarball accidentally includes tests, CI workflows or node_modules");
}
if (!item.size || item.size < 1000) throw new Error("Unexpectedly empty npm tarball");
console.log("Publishable npm tarball verified:", item.filename, names.size, "files");
