import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { inspectExportArtifact } from "../src/qa/exportQa.js";

test("inspectExportArtifact passes a structured SVG export", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-qa-svg-"));
  const path = join(root, "figure.svg");
  await writeFile(
    path,
    `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480"><rect x="0" y="0" width="720" height="480"/><text x="20" y="40">Label</text></svg>`,
    "utf8"
  );

  const report = await inspectExportArtifact(path);
  assert.equal(report.ok, true);
  assert.equal(report.format, "svg");
  assert.deepEqual(report.dimensions, { width: 720, height: 480 });
  assert.equal(report.details?.hasText, true);
});

test("inspectExportArtifact reads PNG dimensions from IHDR", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-qa-png-"));
  const path = join(root, "figure.png");
  const png = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
  png.writeUInt32BE(13, 8);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(640, 16);
  png.writeUInt32BE(360, 20);
  await writeFile(path, png);

  const report = await inspectExportArtifact(path, { minBytes: 1 });
  assert.equal(report.format, "png");
  assert.deepEqual(report.dimensions, { width: 640, height: 360 });
});
