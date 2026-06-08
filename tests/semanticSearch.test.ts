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
