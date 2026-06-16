import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { executeAdobeProjectWorkflow, prepareAdobeProjectWorkflow } from "../src/workflow/adobeProjectWorkflow.js";

test("prepareAdobeProjectWorkflow creates an Illustrator-Photoshop-Illustrator project handoff", async () => {
  const root = await mkdtemp(join(tmpdir(), "adobe-project-prepare-"));
  const workflow = await prepareAdobeProjectWorkflow({
    prompt: "core shell emulsion polymerization scientific concept",
    outputPath: "var/exports/core-shell-final.svg",
    root,
    intent: "auto",
    proofWidth: 1400,
    proofHeight: 900,
    referenceOpacity: 45
  });

  assert.equal(workflow.ok, true);
  assert.equal(workflow.intent, "scientific");
  assert.match(workflow.outputPath, /core-shell-final\.svg$/);
  assert.match(workflow.sourceSvgPath, /core-shell-final\.illustrator-source\.svg$/);
  assert.match(workflow.photoshopReferencePngPath, /core-shell-final\.photoshop-reference\.png$/);
  assert.match(workflow.photoshopHandoffSvgPath, /core-shell-final\.photoshop-handoff\.svg$/);
  assert.match(workflow.photoshopWorkingPsdPath, /core-shell-final\.photoshop-working\.psd$/);
  assert.match(workflow.photoshopFeedbackPath, /core-shell-final\.photoshop-feedback\.json$/);
  assert.equal(workflow.handoff.sequence.length, 5);
  assert.equal(workflow.handoff.illustratorConsumes, workflow.photoshopHandoffSvgPath);
  assert.equal(workflow.runbook.length, 8);

  await access(workflow.sceneJob.jobPath);
  await access(workflow.sourceExportJob.jobPath);
  await access(workflow.photoshopProjectJob.jobPath);
  await access(workflow.illustratorReferenceJob.jobPath);
  await access(workflow.finalExportJob.jobPath);

  const photoshopJsx = await readFile(workflow.photoshopProjectJob.jobPath, "utf8");
  const illustratorReferenceJsx = await readFile(workflow.illustratorReferenceJob.jobPath, "utf8");
  assert.match(photoshopJsx, /"kind":"project_pass"/);
  assert.match(photoshopJsx, /PhotoshopSaveOptions/);
  assert.match(photoshopJsx, /photoshop-handoff\.svg/);
  assert.match(illustratorReferenceJsx, /"kind":"place_file_reference"/);
  assert.match(illustratorReferenceJsx, /photoshop-handoff\.svg/);
  assert.match(illustratorReferenceJsx, /placed\.opacity = 45/);
});

test("executeAdobeProjectWorkflow dry-runs the full app round-trip through COM", async () => {
  const root = await mkdtemp(join(tmpdir(), "adobe-project-execute-"));
  const execution = await executeAdobeProjectWorkflow({
    prompt: "cartoon lab scientist with flask",
    outputPath: "var/exports/lab-final.svg",
    root,
    intent: "cartoon",
    illustratorRunMode: "com",
    launchPlatform: "wsl",
    photoshopPlatform: "wsl",
    dryRun: true,
    maxReviewIterations: 3,
    visibleMouseProof: true,
    visibleMouseDurationMs: 900
  });

  assert.equal(execution.ok, true);
  assert.equal(execution.dryRun, true);
  assert.equal(execution.illustratorRunMode, "com");
  assert.equal(execution.photoshopRunMode, "com");
  assert.equal(execution.reviewIterations.length, 1);
  assert.equal(execution.workflow.runbook.length, 12);
  assert.equal(execution.workflow.handoff.sequence.length, 7);
  assert.match(execution.workflow.photoshopCommitJob?.jobPath ?? "", /jobs\/.+\.jsx$/);
  assert.equal(execution.sceneLaunch?.command.command, "powershell.exe");
  assert.equal(execution.sourceExportLaunch?.command.command, "powershell.exe");
  assert.equal(execution.photoshopProjectLaunch?.command.command, "powershell.exe");
  assert.equal(execution.photoshopCommitLaunch?.command.command, "powershell.exe");
  assert.equal(execution.illustratorReferenceLaunch?.command.command, "powershell.exe");
  assert.equal(execution.finalExportLaunch?.command.command, "powershell.exe");
  assert.match(execution.photoshopProjectLaunch?.next.resultContract ?? "", /Photoshop/);
  assert.match(execution.photoshopCommitLaunch?.next.resultContract ?? "", /Photoshop/);
  assert.equal(execution.visibleMouseProofs?.illustratorScene?.action, "dry-run");
  assert.equal(execution.visibleMouseProofs?.photoshopEdit?.target, "photoshop");
  assert.equal(execution.visibleMouseProofs?.photoshopEdit?.action, "dry-run");
  assert.equal(execution.visibleMouseProofs?.illustratorReturn?.target, "illustrator");
  assert.match(execution.visibleMouseProofs?.illustratorScene?.stdout ?? "", /SetCursorPos/);
  assert.match(execution.visibleMouseProofs?.photoshopEdit?.stdout ?? "", /Photoshop/);
  assert.equal(execution.photoshopFeedback, undefined);
});
