import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startBridgeServer } from "../src/bridge/server.js";

test("HTTP bridge creates a JSX job", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-bridge-"));
  const server = await startBridgeServer({ port: 0, root });

  try {
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);

    const response = await fetch(`${server.url}/v1/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "ping", message: "from test" })
    });

    assert.equal(response.status, 201);
    const body = (await response.json()) as {
      ok: boolean;
      job: { jobPath: string; resultPath: string };
    };
    assert.equal(body.ok, true);
    await access(body.job.jobPath);
    assert.match(body.job.resultPath, /results\/.+\.json$/);

    const status = await fetch(`${server.url}/v1/jobs/${body.job.jobPath.match(/([0-9a-f-]{36})\.jsx$/)?.[1]}/status`);
    assert.equal(status.status, 200);
    const statusBody = (await status.json()) as { ok: boolean; job: { exists: boolean } };
    assert.equal(statusBody.ok, true);
    assert.equal(statusBody.job.exists, false);
  } finally {
    await server.close();
  }
});

test("HTTP bridge prepares a cartoon workflow", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-bridge-workflow-"));
  const server = await startBridgeServer({ port: 0, root });

  try {
    const response = await fetch(`${server.url}/v1/workflows/cartoon`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "cartoon lab scientist with flask",
        outputPath: "var/exports/http-workflow.pdf",
        format: "pdf"
      })
    });

    assert.equal(response.status, 201);
    const body = (await response.json()) as {
      ok: boolean;
      sceneJob: { jobPath: string };
      exportJob: { jobPath: string };
      runbook: unknown[];
    };
    assert.equal(body.ok, true);
    assert.equal(body.runbook.length, 4);
    await access(body.sceneJob.jobPath);
    await access(body.exportJob.jobPath);
  } finally {
    await server.close();
  }
});
