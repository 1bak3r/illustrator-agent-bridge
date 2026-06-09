import test from "node:test";
import assert from "node:assert/strict";
import { access, chmod, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { executeCartoonWorkflow } from "../src/workflow/cartoonExecutor.js";

test("executeCartoonWorkflow dry-runs scene and export launches", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-executor-dry-"));
  const execution = await executeCartoonWorkflow({
    prompt: "cartoon lab scientist with flask",
    outputPath: "var/exports/executor-dry.svg",
    format: "svg",
    root,
    launchPlatform: "macos",
    dryRun: true
  });

  assert.equal(execution.ok, true);
  assert.equal(execution.dryRun, true);
  assert.equal(execution.sceneLaunch.dryRun, true);
  assert.equal(execution.exportLaunch?.dryRun, true);
  assert.equal(execution.sceneResult, undefined);
  assert.equal(execution.exportResult, undefined);
  await access(execution.workflow.sceneJob.jobPath);
  await access(execution.workflow.exportJob.jobPath);
});

test("executeCartoonWorkflow can launch and wait through a local shim", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-executor-"));
  const launcherPath = join(root, "fake-illustrator-launcher.sh");
  await writeFile(
    launcherPath,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "script_path=\"$1\"",
      "job_id=\"$(basename \"$script_path\" .jsx)\"",
      "bridge_root=\"$(dirname \"$(dirname \"$script_path\")\")\"",
      "mkdir -p \"$bridge_root/results\"",
      "printf '{\"ok\":true,\"jobId\":\"%s\",\"kind\":\"fake\"}\\n' \"$job_id\" > \"$bridge_root/results/$job_id.json\"",
      ""
    ].join("\n"),
    "utf8"
  );
  await chmod(launcherPath, 0o755);

  const execution = await executeCartoonWorkflow({
    prompt: "cartoon lab scientist with flask",
    outputPath: "var/exports/executor.svg",
    format: "svg",
    root,
    launchPlatform: "linux",
    appPath: launcherPath,
    waitForResults: true,
    timeoutMs: 2_000,
    intervalMs: 100,
    skipQa: true
  });

  assert.equal(execution.ok, true);
  assert.equal(execution.dryRun, false);
  assert.equal(execution.sceneResult?.result?.ok, true);
  assert.equal(execution.exportResult?.result?.ok, true);
  assert.equal(execution.exportQa, undefined);
});
