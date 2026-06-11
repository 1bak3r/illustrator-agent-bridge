import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { prepareObjectShapeWorkflow } from "../src/workflow/objectWorkflow.js";
import { planObjectShapeScene } from "../src/planner/objectShapePlanner.js";

test("prepareObjectShapeWorkflow creates guarded object scene and export jobs", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-object-workflow-"));
  const workflow = await prepareObjectShapeWorkflow({
    prompt: "full cat icon",
    outputPath: "var/exports/object-cat.png",
    format: "png",
    root
  });

  assert.equal(workflow.ok, true);
  assert.equal(workflow.plan.target, "cat");
  assert.equal(workflow.plan.guard.ok, true);
  assert.equal(workflow.runbook[0]?.expected, "Object guard passes structural and geometric checks.");
  assert.equal(workflow.runbook[1]?.jobId, workflow.sceneJob.id);
  assert.equal(workflow.runbook[3]?.jobId, workflow.exportJob.id);
  await access(workflow.sceneJob.jobPath);
  await access(workflow.exportJob.jobPath);
});

test("prepareObjectShapeWorkflow can reprompt until the object guard passes", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-object-workflow-refine-"));
  const prompts: string[] = [];
  const workflow = await prepareObjectShapeWorkflow({
    prompt: "full cat icon",
    outputPath: "var/exports/object-cat.png",
    format: "png",
    root,
    maxGuardIterations: 3,
    planScene: (prompt, corpus, options) => {
      prompts.push(prompt);
      const plan = planObjectShapeScene(prompt, corpus, options);
      if (prompts.length === 1) {
        return {
          ...plan,
          guard: {
            ...plan.guard,
            ok: false,
            confidence: 0.5,
            issues: ["Cat eyes and nose must sit inside the head."],
            nextPrompt: "repair cat face geometry",
            nextGoalPrompt: "full cat icon with cat face repaired inside the head"
          }
        };
      }

      return plan;
    }
  });

  assert.deepEqual(prompts, ["full cat icon", "full cat icon with cat face repaired inside the head"]);
  assert.equal(workflow.originalPrompt, "full cat icon");
  assert.equal(workflow.prompt, "full cat icon with cat face repaired inside the head");
  assert.equal(workflow.plan.guard.ok, true);
  assert.equal(workflow.guardIterations.length, 2);
  assert.equal(workflow.guardIterations[0]?.guardOk, false);
  assert.equal(workflow.guardIterations[0]?.nextGoalPrompt, "full cat icon with cat face repaired inside the head");
  assert.equal(workflow.guardIterations[1]?.guardOk, true);
  assert.match(workflow.runbook[0]?.action ?? "", /2 guard iteration/);
  await access(workflow.sceneJob.jobPath);
  await access(workflow.exportJob.jobPath);
});
