import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
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
      job: { id: string; jobPath: string; resultPath: string };
    };
    assert.equal(body.ok, true);
    await access(body.job.jobPath);
    assert.match(body.job.resultPath, /results\/.+\.json$/);

    const launch = await fetch(`${server.url}/v1/jobs/${body.job.id}/launch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dryRun: true, platform: "macos", appPath: "Adobe Illustrator" })
    });
    assert.equal(launch.status, 200);
    const launchBody = (await launch.json()) as { ok: boolean; dryRun: boolean; command: { command: string } };
    assert.equal(launchBody.ok, true);
    assert.equal(launchBody.dryRun, true);
    assert.equal(launchBody.command.command, "open");

    const status = await fetch(`${server.url}/v1/jobs/${body.job.id}/status`);
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

test("HTTP bridge executes a cartoon workflow dry-run", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-bridge-execute-"));
  const server = await startBridgeServer({ port: 0, root });

  try {
    const response = await fetch(`${server.url}/v1/workflows/cartoon/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "cartoon lab scientist with flask",
        outputPath: "var/exports/http-execute.svg",
        format: "svg",
        platform: "macos",
        dryRun: true
      })
    });

    assert.equal(response.status, 201);
    const body = (await response.json()) as {
      ok: boolean;
      dryRun: boolean;
      sceneLaunch: { dryRun: boolean };
      exportLaunch: { dryRun: boolean };
    };
    assert.equal(body.ok, true);
    assert.equal(body.dryRun, true);
    assert.equal(body.sceneLaunch.dryRun, true);
    assert.equal(body.exportLaunch.dryRun, true);
  } finally {
    await server.close();
  }
});

test("HTTP bridge QA checks an exported SVG", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-bridge-qa-"));
  const server = await startBridgeServer({ port: 0, root });
  const svgPath = join(root, "exports", "figure.svg");

  try {
    await mkdir(join(root, "exports"), { recursive: true });
    await writeFile(svgPath, `<svg width="720" height="480"><rect width="720" height="480"/></svg>`, "utf8");
    const response = await fetch(`${server.url}/v1/qa/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: svgPath, minBytes: 1 })
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok: boolean; report: { format: string } };
    assert.equal(body.ok, true);
    assert.equal(body.report.format, "svg");
  } finally {
    await server.close();
  }
});
