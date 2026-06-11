import test from "node:test";
import assert from "node:assert/strict";
import { searchCorpus } from "../src/semantic/search.js";
import type { SemanticItem } from "../src/semantic/types.js";

const corpus: SemanticItem[] = [
  {
    id: "a",
    kind: "object_semantics",
    title: "Round flask",
    text: "A flask has a round body, narrow neck, liquid fill, and bubbles.",
    tags: ["flask", "glassware"]
  },
  {
    id: "b",
    kind: "publication_requirement",
    title: "Readable labels",
    text: "Publication labels need strong contrast and large enough type.",
    tags: ["publication", "label"]
  },
  {
    id: "c",
    kind: "scientific_concept",
    title: "Electron transfer",
    text: "Electron transfer uses donor and acceptor sites with a charge flow arrow.",
    tags: ["electron", "redox", "charge"]
  },
  {
    id: "d",
    kind: "shape_recipe",
    title: "Full cat recipe",
    text: "A cat needs a head, ears, eyes, whiskers, a tail, and four paws.",
    tags: ["cat", "whiskers", "tail"]
  },
  {
    id: "e",
    kind: "shape_combination",
    title: "Shape combination: cat-icon.svg",
    text: "The SVG combines an ellipse head, triangular ears, whisker lines, and a curved tail path.",
    tags: ["shape", "combination", "cat", "ellipse", "line", "path"]
  },
  {
    id: "f",
    kind: "shape_combination",
    title: "Shape combination: lock-scene.json",
    text: "Spatial part relationships include lock outer shackle above lock body housing; lock keyhole round inside lock body housing.",
    tags: ["shape", "combination", "lock", "shackle", "keyhole", "rect", "path", "ellipse"]
  }
];

test("searchCorpus ranks object semantics for related visual queries", () => {
  const results = searchCorpus("cartoon chemistry glassware", corpus);

  assert.equal(results[0]?.item.id, "a");
  assert.ok(results[0]?.score ?? 0 > 0);
});

test("searchCorpus filters by kind", () => {
  const results = searchCorpus("publication labels", corpus, { kind: "publication_requirement" });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.item.id, "b");
});

test("searchCorpus retrieves scientific concepts with query expansion", () => {
  const results = searchCorpus("charge flow mechanism", corpus, { kind: "scientific_concept" });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.item.id, "c");
});

test("searchCorpus retrieves shape recipes by kind", () => {
  const results = searchCorpus("cat whisker tail", corpus, { kind: "shape_recipe" });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.item.id, "d");
});

test("searchCorpus retrieves learned shape combinations by kind", () => {
  const results = searchCorpus("cat svg ellipse whisker", corpus, { kind: "shape_combination" });

  assert.equal(results[0]?.item.id, "e");
  assert.ok(results[0]?.score ?? 0 > 0);
});

test("searchCorpus retrieves learned shape relationship evidence", () => {
  const results = searchCorpus("shackle above body keyhole inside lock", corpus, { kind: "shape_combination" });

  assert.equal(results[0]?.item.id, "f");
  assert.ok(results[0]?.score ?? 0 > 0);
});
