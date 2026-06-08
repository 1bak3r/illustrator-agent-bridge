import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getGeneratedJobPaths } from "../src/bridge/files.js";
import { readJobStatus, waitForJobResult } from "../src/bridge/results.js";

test("readJobStatus reports missing and completed result files", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-results-"));
  const id = "11111111-1111-4111-8111-111111111111";
  const missing = await readJobStatus(id, root);

  assert.equal(missing.exists, false);

  const { resultPath } = await getGeneratedJobPaths(id, root);
  await writeFile(resultPath, JSON.stringify({ ok: true, jobId: id, kind: "ping" }), "utf8");

  const status = await readJobStatus(id, root);
  assert.equal(status.exists, true);
  assert.equal(status.result?.ok, true);
  assert.equal(status.result?.kind, "ping");
});

test("waitForJobResult returns an existing result", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-wait-"));
  const id = "22222222-2222-4222-8222-222222222222";
  const { resultPath } = await getGeneratedJobPaths(id, root);
  await writeFile(resultPath, JSON.stringify({ ok: true, jobId: id, kind: "cartoon_scene" }), "utf8");

  const status = await waitForJobResult(id, { root, timeoutMs: 1000 });
  assert.equal(status.result?.kind, "cartoon_scene");
});
