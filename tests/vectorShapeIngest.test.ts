import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectVectorShapeFiles, mergeShapeCombinationItems } from "../src/semantic/vectorShapeIngest.js";

test("inspectVectorShapeFiles extracts searchable shape combinations from SVG", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-vector-ingest-"));
  const sourceDir = join(root, "Bioseparations", "figures");
  await mkdir(sourceDir, { recursive: true });
  const svgPath = join(sourceDir, "cat-icon.svg");
  await writeFile(
    svgPath,
    `<svg viewBox="0 0 120 80">
      <title>Cat with whiskers</title>
      <ellipse id="cat-head" fill="#d9965b" stroke="#111827" cx="50" cy="30" rx="20" ry="16"/>
      <polygon id="cat-left-ear" points="30,20 38,2 45,20"/>
      <path id="cat-tail" d="M70 52 C92 30 90 10 72 8"/>
      <line id="cat-left-whisker" x1="42" y1="34" x2="10" y2="28"/>
    </svg>`,
    "utf8"
  );

  const profiles = await inspectVectorShapeFiles([svgPath]);

  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].sourceKind, "svg");
  assert.equal(profiles[0].item.kind, "shape_combination");
  assert.ok(profiles[0].item.tags?.includes("cat"));
  assert.match(profiles[0].item.text, /ellipse/);
  assert.match(profiles[0].item.text, /Bioseparations \/ figures/);
  assert.match(profiles[0].item.text, /cat-tail/);
  assert.ok(profiles[0].relations.includes("cat-left-ear above cat-head"));
  assert.match(profiles[0].item.text, /cat-left-ear above cat-head/);
});

test("mergeShapeCombinationItems writes a searchable corpus JSON", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-vector-corpus-"));
  const scenePath = join(root, "lock-scene.json");
  const outputPath = join(root, "semantic-corpus.json");
  await writeFile(
    scenePath,
    JSON.stringify({
      document: { width: 720, height: 520 },
      elements: [
        { type: "rect", name: "lock body housing", x: 240, y: 220, width: 240, height: 180 },
        {
          type: "path",
          name: "lock outer shackle",
          x: 0,
          y: 0,
          points: [
            { x: 290, y: 220 },
            { x: 290, y: 120 },
            { x: 430, y: 120 },
            { x: 430, y: 220 }
          ],
          closed: false
        },
        { type: "ellipse", name: "lock keyhole round", x: 342, y: 286, width: 36, height: 36 }
      ]
    }),
    "utf8"
  );

  const profiles = await inspectVectorShapeFiles([scenePath]);
  const merge = await mergeShapeCombinationItems(
    profiles.map((profile) => profile.item),
    { outputCorpusPath: outputPath }
  );
  const written = JSON.parse(await readFile(outputPath, "utf8")) as Array<{ kind: string; text: string }>;

  assert.equal(merge.learnedItemCount, 1);
  assert.equal(written.length, 1);
  assert.equal(written[0].kind, "shape_combination");
  assert.match(written[0].text, /lock outer shackle/);
  assert.match(written[0].text, /lock keyhole round inside lock body housing/);
  assert.match(written[0].text, /lock outer shackle above lock body housing/);
  assert.ok(profiles[0].relations.includes("lock keyhole round inside lock body housing"));
});

test("inspectVectorShapeFiles preserves source context from staged Drive filenames", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-vector-drive-context-"));
  const sourceDir = join(root, "staged-vector-context");
  await mkdir(sourceDir, { recursive: true });
  const aiPath = join(sourceDir, "I_13yjq3_My_Drive_SABER_Chemical_Pitch_Assets_single_use_plastic_vector.ai");
  await writeFile(
    aiPath,
    `%!PS-Adobe-3.0
%%Title: single use plastic vector
100 100 40 20 re
110 110 m
125 120 l
140 110 l
f
S
`,
    "utf8"
  );

  const profiles = await inspectVectorShapeFiles([aiPath]);

  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].sourceKind, "illustrator_ai");
  assert.match(profiles[0].item.text, /SABER Chemical/);
  assert.match(profiles[0].item.text, /Pitch Assets/);
  assert.ok(profiles[0].item.tags?.includes("saber"));
  assert.ok(profiles[0].item.tags?.includes("plastic"));
});
