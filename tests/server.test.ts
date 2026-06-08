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
  } finally {
    await server.close();
  }
});
