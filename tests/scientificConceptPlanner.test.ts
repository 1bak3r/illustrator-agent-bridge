import test from "node:test";
import assert from "node:assert/strict";
import { planScientificConceptScene } from "../src/planner/scientificConceptPlanner.js";
import type { SemanticItem } from "../src/semantic/types.js";

const corpus: SemanticItem[] = [
  {
    id: "concept.molecular-self-assembly",
    kind: "scientific_concept",
    title: "Molecular self-assembly",
    text: "Small monomers organize into ordered polymer networks.",
    tags: ["molecular", "assembly", "polymer", "network"]
  },
  {
    id: "concept.catalytic-reaction-cycle",
    kind: "scientific_concept",
    title: "Catalytic reaction cycle",
    text: "A catalyst active site binds reactants and releases products with a lower energy barrier.",
    tags: ["catalyst", "reaction", "active-site", "energy"]
  },
  {
    id: "concept.cell-membrane-transport",
    kind: "scientific_concept",
    title: "Cell membrane transport",
    text: "A bilayer membrane with a protein channel controls particle movement down a gradient.",
    tags: ["membrane", "transport", "protein", "gradient"]
  },
  {
    id: "metaphor.abstract-mechanism-to-map",
    kind: "visual_metaphor",
    title: "Abstract mechanism as a map",
    text: "Use context, mechanism, and outcome panels connected by arrows.",
    tags: ["concept", "mechanism", "map"]
  },
  {
    id: "requirement.scientific-concept-legibility",
    kind: "publication_requirement",
    title: "Scientific concept figure legibility",
    text: "Separate context, mechanism, and outcome, and keep arrows consistent.",
    tags: ["scientific", "concept", "publication"]
  }
];

test("planScientificConceptScene retrieves semantic evidence and builds a complex validated scene", () => {
  const plan = planScientificConceptScene("polymer catalyst membrane electron transfer concept", corpus);

  assert.equal(plan.planner, "scientific-deterministic");
  assert.equal(plan.qa.ok, true);
  assert.ok(plan.conceptQueries.length >= 4);
  assert.ok(plan.evidence.some((result) => result.item.kind === "scientific_concept"));
  assert.ok(plan.evidence.some((result) => result.item.kind === "visual_metaphor"));
  assert.ok(plan.scene.elements.some((element) => element.type === "path"));
  assert.ok(plan.scene.elements.some((element) => element.name?.includes("catalyst surface")));
  assert.ok(plan.scene.elements.some((element) => element.name?.includes("protein channel")));
  assert.ok(plan.scene.elements.length > 30);
  assert.ok(plan.recommendedExports.includes("svg"));
});
