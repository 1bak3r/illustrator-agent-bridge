import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLaunchCommand, LaunchJobError, launchJsxJob, toWindowsPathFromWsl } from "../src/bridge/launcher.js";

test("launcher builds a macOS Illustrator dry-run command", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-launch-"));
  const jobId = "11111111-1111-4111-8111-111111111111";
  const scriptPath = join(root, `${jobId}.jsx`);
  await writeFile(scriptPath, "#target illustrator\n", "utf8");

  const result = await launchJsxJob(scriptPath, {
    platform: "macos",
    appPath: "Adobe Illustrator",
    dryRun: true
  });

  assert.equal(result.ok, true);
  assert.equal(result.launched, false);
  assert.equal(result.dryRun, true);
  assert.equal(result.command.command, "open");
  assert.deepEqual(result.command.args, ["-a", "Adobe Illustrator", scriptPath]);
  assert.match(result.next.waitForResult, new RegExp(jobId));

  const rooted = await launchJsxJob(scriptPath, {
    platform: "macos",
    dryRun: true,
    root
  });
  assert.match(rooted.next.waitForResult, /--root /);
});

test("launcher builds Windows PowerShell command with an explicit app", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-launch-windows-"));
  const scriptPath = join(root, "22222222-2222-4222-8222-222222222222.jsx");
  await writeFile(scriptPath, "#target illustrator\n", "utf8");

  const command = buildLaunchCommand(scriptPath, {
    platform: "windows",
    appPath: "C:/Program Files/Adobe/Illustrator's/App.exe"
  });

  assert.equal(command.command, "powershell.exe");
  assert.equal(command.args[0], "-NoProfile");
  assert.match(command.args[4] ?? "", /Start-Process -FilePath 'C:\/Program Files\/Adobe\/Illustrator''s\/App\.exe'/);
  assert.match(command.args[4] ?? "", /-ArgumentList '.+22222222-2222-4222-8222-222222222222\.jsx'/);
});

test("launcher converts WSL paths for the Windows host", () => {
  assert.equal(toWindowsPathFromWsl("/mnt/c/Users/example/job.jsx"), "C:/Users/example/job.jsx");

  const previousDistro = process.env.WSL_DISTRO_NAME;
  process.env.WSL_DISTRO_NAME = "Ubuntu";
  try {
    assert.equal(toWindowsPathFromWsl("/home/example/job.jsx"), "\\\\wsl.localhost\\Ubuntu\\home\\example\\job.jsx");
  } finally {
    if (previousDistro === undefined) {
      delete process.env.WSL_DISTRO_NAME;
    } else {
      process.env.WSL_DISTRO_NAME = previousDistro;
    }
  }
});

test("launcher rejects missing JSX scripts", () => {
  assert.throws(() => buildLaunchCommand("/tmp/missing-illustrator-agent-job.jsx", { platform: "macos" }), LaunchJobError);
});
