import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { probeIllustratorCommunication } from "../src/bridge/illustratorProbe.js";

test("probeIllustratorCommunication defaults to COM dry-run on WSL", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-probe-"));
  const result = await probeIllustratorCommunication({
    root,
    platform: "wsl",
    appPath: "C:/Program Files/Adobe/Adobe Illustrator 2025/Support Files/Contents/Windows/Illustrator.exe",
    dryRun: true
  });

  assert.equal(result.ok, true);
  assert.equal(result.communicationConfirmed, false);
  assert.equal(result.platform, "wsl");
  assert.equal(result.method, "com");
  assert.equal(result.launch.dryRun, true);
  assert.equal(result.launch.command.command, "powershell.exe");
  assert.match(result.job.jobPath, /jobs\/.+\.jsx$/);

  const jsx = await readFile(result.job.jobPath, "utf8");
  assert.match(jsx, /illustrator-agent-bridge communication probe/);
  assert.match(jsx, /\/\/wsl\.localhost\/.+\/results\//);
});

test("probeIllustratorCommunication can create a circle drawing probe for desktop launch", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-circle-probe-"));
  const result = await probeIllustratorCommunication({
    root,
    platform: "wsl",
    method: "desktop",
    appPath: "C:/Program Files/Adobe/Adobe Illustrator 2025/Support Files/Contents/Windows/Illustrator.exe",
    dryRun: true,
    drawCircle: true,
    autoConfirmDialog: true
  });

  assert.equal(result.ok, true);
  assert.equal(result.method, "desktop");
  assert.equal(result.dialogConfirmation?.action, "dry-run");
  assert.equal(result.launch.command.command, "powershell.exe");

  const jsx = await readFile(result.job.jobPath, "utf8");
  assert.match(jsx, /app\.documents\.add\(DocumentColorSpace\.RGB, 360, 240\)/);
  assert.match(jsx, /layer\.pathItems\.ellipse/);
  assert.match(jsx, /communication proof circle/);
});
