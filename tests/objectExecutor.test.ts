import test from "node:test";
import assert from "node:assert/strict";
import { access, chmod, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { executeObjectShapeWorkflow } from "../src/workflow/objectExecutor.js";

test("executeObjectShapeWorkflow dry-runs object scene and export launches", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-object-executor-dry-"));
  const execution = await executeObjectShapeWorkflow({
    prompt: "secure padlock icon",
    outputPath: "var/exports/object-lock.svg",
    format: "svg",
    root,
    launchPlatform: "macos",
    dryRun: true
  });

  assert.equal(execution.ok, true);
  assert.equal(execution.dryRun, true);
  assert.equal(execution.workflow.plan.target, "lock");
  assert.equal(execution.workflow.plan.guard.ok, true);
  assert.equal(execution.sceneLaunch?.dryRun, true);
  assert.equal(execution.exportLaunch?.dryRun, true);
  assert.equal(execution.sceneResult, undefined);
  assert.equal(execution.exportResult, undefined);
  await access(execution.workflow.sceneJob.jobPath);
  await access(execution.workflow.exportJob.jobPath);
});

test("executeObjectShapeWorkflow can dry-run COM mode for WSL", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-object-executor-com-"));
  const execution = await executeObjectShapeWorkflow({
    prompt: "simple house key icon",
    outputPath: "var/exports/object-key.png",
    format: "png",
    root,
    launchPlatform: "wsl",
    runMode: "com",
    dryRun: true
  });

  assert.equal(execution.ok, true);
  assert.equal(execution.runMode, "com");
  assert.equal(execution.sceneLaunch?.command.command, "powershell.exe");
  assert.equal(execution.exportLaunch?.command.command, "powershell.exe");
});

test("executeObjectShapeWorkflow can launch and wait through a local shim", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-object-executor-"));
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

  const execution = await executeObjectShapeWorkflow({
    prompt: "full cat icon",
    outputPath: "var/exports/object-cat.svg",
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
