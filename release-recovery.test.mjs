import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("recovery workflow is manually triggered and cannot re-publish npm",async()=>{
  const f=await readFile(new URL("./.github/workflows/finalize-npm-release.yml",import.meta.url),"utf8");
  assert.match(f,/workflow_dispatch:/);
  assert.ok(!f.includes("id-token: write"));
  assert.ok(!f.includes("npm publish "));
  assert.match(f,/github.ref == 'refs\/heads\/main'/);
  assert.ok(f.includes('ref: ${{ inputs.published_source_sha }}'));
  assert.ok(f.includes('node scripts/verify-npm-release.mjs post "$VERSION" release-source/release-archive.json'));
  assert.ok(f.includes('gh release create "$tag"'));
});
test("normal publishing workflow retains bounded post-verification and no push publish",async()=>{
  const f=await readFile(new URL("./.github/workflows/npm-release.yml",import.meta.url),"utf8");
  const verify=await readFile(new URL("./scripts/verify-npm-release.mjs",import.meta.url),"utf8");
  assert.match(f,/workflow_dispatch:/);
  assert.ok(!f.includes("on: push"));
  assert.ok(f.includes('npm publish "./$archive" --access public'));
  assert.ok(verify.includes('attempts:mode==="post"?121:1'));
});
