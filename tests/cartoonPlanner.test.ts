import test from "node:test";
import assert from "node:assert/strict";
import { planCartoonScene } from "../src/planner/cartoonPlanner.js";
import type { SemanticItem } from "../src/semantic/types.js";

const corpus: SemanticItem[] = [
  {
    id: "object.round-flask.cartoon",
    kind: "object_semantics",
    title: "Round flask",
    text: "A round flask reads well with a narrow neck and bubbles.",
    tags: ["flask", "lab"]
  },
  {
    id: "style.publication-cartoon-vector",
    kind: "style_reference",
    title: "Publication vector cartoon",
    text: "Use consistent strokes, named layers, and high contrast.",
    tags: ["publication", "cartoon"]
  }
];

test("planCartoonScene retrieves evidence and produces a valid lab scene", () => {
  const plan = planCartoonScene("cartoon lab scientist with flask", corpus);

  assert.equal(plan.scene.document?.colorMode, "RGB");
  assert.ok(plan.evidence.some((result) => result.item.id === "object.round-flask.cartoon"));
  assert.ok(plan.scene.elements.some((element) => element.name === "round reaction flask"));
  assert.equal(plan.qa.ok, true);
  assert.ok(plan.recommendedExports.includes("pdf"));
});
