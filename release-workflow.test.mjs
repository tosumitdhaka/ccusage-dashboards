import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("OIDC release workflow publishes exactly the previously verified npm tarball", async () => {
  const wf=await readFile(new URL("./.github/workflows/npm-release.yml",import.meta.url),"utf8");
  assert.match(wf,/workflow_dispatch:/);
  assert.match(wf,/id-token: write/);
  assert.match(wf,/github\.ref == 'refs\/heads\/main'/);
  assert.ok(wf.includes('state="$(node scripts/verify-npm-release.mjs pre "$VERSION" release-archive.json)" || exit 1'));
  assert.ok(wf.includes('npm publish "./$archive" --access public'));
  assert.ok(!wf.includes('npm publish --access public\n'));
  assert.ok(!wf.includes('echo "state=$(node'));
  assert.ok(wf.includes("createHash(\"sha1\")"));
  assert.ok(wf.includes("/^ccusage-dashboards-[0-9]+[.][0-9]+[.][0-9]+[.]tgz$/"));
});
