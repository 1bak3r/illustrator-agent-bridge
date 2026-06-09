import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { inspectExportArtifact } from "../src/qa/exportQa.js";
import { makeRgbaPng } from "./pngFixture.js";

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

test("inspectExportArtifact checks PNG nonblank pixels and content bounds", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-qa-png-content-"));
  const path = join(root, "figure.png");
  await writeFile(
    path,
    makeRgbaPng(20, 20, (x, y) => (x >= 6 && x < 14 && y >= 6 && y < 14 ? [0, 0, 0, 255] : [255, 255, 255, 255]))
  );

  const report = await inspectExportArtifact(path, { minBytes: 1, minWidth: 1, minHeight: 1, minNonBlankRatio: 0.01 });
  assert.equal(report.ok, true);
  assert.equal(report.format, "png");
  assert.equal(report.checks.some((check) => check.id === "png-nonblank-pixels" && check.status === "pass"), true);
  assert.deepEqual((report.details?.pixelAnalysis as { contentBounds?: unknown }).contentBounds, {
    x: 6,
    y: 6,
    width: 8,
    height: 8
  });
});

test("inspectExportArtifact fails blank PNG exports", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-qa-png-blank-"));
  const path = join(root, "blank.png");
  await writeFile(path, makeRgbaPng(20, 20, () => [255, 255, 255, 255]));

  const report = await inspectExportArtifact(path, { minBytes: 1, minWidth: 1, minHeight: 1 });
  assert.equal(report.ok, false);
  assert.equal(report.checks.some((check) => check.id === "png-nonblank-pixels" && check.status === "fail"), true);
});
