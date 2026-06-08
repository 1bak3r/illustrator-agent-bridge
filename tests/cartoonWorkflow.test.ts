import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { prepareCartoonWorkflow } from "../src/workflow/cartoonWorkflow.js";

test("prepareCartoonWorkflow creates scene and export jobs with an ordered runbook", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-workflow-"));
  const workflow = await prepareCartoonWorkflow({
    prompt: "cartoon lab scientist with flask",
    outputPath: "var/exports/test-figure.pdf",
    format: "pdf",
    root
  });

  assert.equal(workflow.ok, true);
  assert.equal(workflow.plan.qa.ok, true);
  assert.equal(workflow.runbook[0]?.jobId, workflow.sceneJob.id);
  assert.equal(workflow.runbook[2]?.jobId, workflow.exportJob.id);
  await access(workflow.sceneJob.jobPath);
  await access(workflow.exportJob.jobPath);
});
