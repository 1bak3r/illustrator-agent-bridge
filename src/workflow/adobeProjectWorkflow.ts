import { readFile } from "node:fs/promises";
import { extname, isAbsolute, resolve } from "node:path";
import { runJsxViaIllustratorCom } from "../bridge/comAutomation.js";
import { createGeneratedJob } from "../bridge/jobs.js";
import { generatedJobSummary } from "../bridge/jsxGenerator.js";
import { launchJsxJob, resolveLaunchPlatform, type LaunchJobResult, type LaunchPlatform } from "../bridge/launcher.js";
import { runJsxViaPhotoshopCom } from "../bridge/photoshopComAutomation.js";
import { createGeneratedPhotoshopJob } from "../bridge/photoshopJobs.js";
import { generatedPhotoshopJobSummary } from "../bridge/photoshopJsxGenerator.js";
import { waitForJobResult, type JobStatus } from "../bridge/results.js";
import type { GeneratedJob } from "../bridge/types.js";
import type { ObjectShapePlan } from "../planner/objectShapePlanner.js";
import { reviewArtworkQuality, type ArtworkReviewReport } from "../qa/artworkReviewGuard.js";
import { inspectExportArtifact, type ExportQaReport } from "../qa/exportQa.js";
import { loadDefaultCorpus } from "../semantic/search.js";
import type {
  AdobeArtworkIntent,
  AdobeArtworkPlan,
  AdobeSvgProofRunMode,
  PrepareAdobeSvgProofWorkflowOptions
} from "./adobeSvgProofWorkflow.js";
import { planAdobeArtworkScene, shouldReviseArtworkFromReview } from "./adobeSvgProofWorkflow.js";

export interface PrepareAdobeProjectWorkflowOptions extends PrepareAdobeSvgProofWorkflowOptions {
  sourceSvgPath?: string;
  photoshopReferencePngPath?: string;
  photoshopHandoffSvgPath?: string;
  photoshopWorkingPsdPath?: string;
  photoshopFeedbackPath?: string;
  referenceOpacity?: number;
  embedReference?: boolean;
}

export interface AdobeProjectWorkflow {
  ok: true;
  prompt: string;
  intent: Exclude<AdobeArtworkIntent, "auto">;
  outputPath: string;
  sourceSvgPath: string;
  photoshopReferencePngPath: string;
  photoshopHandoffSvgPath: string;
  photoshopWorkingPsdPath: string;
  photoshopFeedbackPath: string;
  plan: AdobeArtworkPlan;
  sceneJob: ReturnType<typeof generatedJobSummary>;
  sourceExportJob: ReturnType<typeof generatedJobSummary>;
  photoshopProjectJob: ReturnType<typeof generatedPhotoshopJobSummary>;
  illustratorReferenceJob: ReturnType<typeof generatedJobSummary>;
  finalExportJob: ReturnType<typeof generatedJobSummary>;
  handoff: AdobeProjectHandoff;
  runbook: AdobeProjectWorkflowStep[];
}

export interface AdobeProjectHandoff {
  sourceOfTruth: "illustrator-vector-document";
  sequence: string[];
  photoshopArtifacts: {
    referencePngPath: string;
    handoffSvgPath: string;
    workingPsdPath: string;
    feedbackPath: string;
  };
  illustratorConsumes: string;
}

export interface AdobeProjectWorkflowStep {
  step: number;
  app: "Illustrator" | "Photoshop" | "Bridge";
  action: string;
  jobId?: string;
  scriptPath?: string;
  resultPath?: string;
  expected?: string;
}

export interface ExecuteAdobeProjectWorkflowOptions extends PrepareAdobeProjectWorkflowOptions {
  launchPlatform?: LaunchPlatform;
  appPath?: string;
  illustratorRunMode?: AdobeSvgProofRunMode;
  photoshopPlatform?: LaunchPlatform;
  dryRun?: boolean;
  waitForResults?: boolean;
  timeoutMs?: number;
  intervalMs?: number;
  skipQa?: boolean;
  skipArtworkReview?: boolean;
  minBytes?: number;
  minWidth?: number;
  minHeight?: number;
  minNonBlankRatio?: number;
  proofMinWidth?: number;
  proofMinHeight?: number;
  proofMinNonBlankRatio?: number;
  maxReviewIterations?: number;
}

export interface AdobeProjectReviewIteration {
  attempt: number;
  prompt: string;
  workflowPrompt: string;
  intent: Exclude<AdobeArtworkIntent, "auto">;
  ok: boolean;
  sourceExportQaOk?: boolean;
  photoshopReferenceQaOk?: boolean;
  photoshopHandoffQaOk?: boolean;
  finalExportQaOk?: boolean;
  artworkReviewOk?: boolean;
  nextGoalPrompt: string | null;
}

export interface AdobeProjectWorkflowExecution {
  ok: boolean;
  dryRun: boolean;
  illustratorRunMode: AdobeSvgProofRunMode;
  photoshopRunMode: "com";
  workflow: AdobeProjectWorkflow;
  sceneLaunch?: LaunchJobResult;
  sceneResult?: JobStatus;
  sourceExportLaunch?: LaunchJobResult;
  sourceExportResult?: JobStatus;
  sourceExportQa?: ExportQaReport;
  photoshopProjectLaunch?: LaunchJobResult;
  photoshopProjectResult?: JobStatus;
  photoshopReferenceQa?: ExportQaReport;
  photoshopHandoffQa?: ExportQaReport;
  photoshopFeedback?: Record<string, unknown>;
  illustratorReferenceLaunch?: LaunchJobResult;
  illustratorReferenceResult?: JobStatus;
  finalExportLaunch?: LaunchJobResult;
  finalExportResult?: JobStatus;
  finalExportQa?: ExportQaReport;
  artworkReview?: ArtworkReviewReport;
  reviewIterations: AdobeProjectReviewIteration[];
  next: string[];
}

export async function prepareAdobeProjectWorkflow(options: PrepareAdobeProjectWorkflowOptions): Promise<AdobeProjectWorkflow> {
  const outputPath = resolveOutputPath(options.outputPath);
  const sourceSvgPath = resolveOutputPath(options.sourceSvgPath ?? defaultSiblingPath(outputPath, ".illustrator-source.svg"));
  const photoshopReferencePngPath = resolveOutputPath(
    options.photoshopReferencePngPath ?? defaultSiblingPath(outputPath, ".photoshop-reference.png")
  );
  const photoshopHandoffSvgPath = resolveOutputPath(options.photoshopHandoffSvgPath ?? defaultSiblingPath(outputPath, ".photoshop-handoff.svg"));
  const photoshopWorkingPsdPath = resolveOutputPath(options.photoshopWorkingPsdPath ?? defaultSiblingPath(outputPath, ".photoshop-working.psd"));
  const photoshopFeedbackPath = resolveOutputPath(options.photoshopFeedbackPath ?? defaultSiblingPath(outputPath, ".photoshop-feedback.json"));
  const corpus = await loadDefaultCorpus(options.corpusPath);
  const planned = await planAdobeArtworkScene(options.prompt, corpus, options);
  const documentWidth = planned.scene.document?.width ?? options.width ?? 720;
  const documentHeight = planned.scene.document?.height ?? options.height ?? 480;

  const sceneJob = await createGeneratedJob({ kind: "cartoon_scene", scene: planned.scene }, options.root);
  const sourceExportJob = await createGeneratedJob(
    {
      kind: "export",
      format: "svg",
      outputPath: sourceSvgPath
    },
    options.root
  );
  const photoshopProjectJob = await createGeneratedPhotoshopJob(
    {
      kind: "project_pass",
      inputPath: sourceSvgPath,
      outputPngPath: photoshopReferencePngPath,
      outputSvgPath: photoshopHandoffSvgPath,
      outputPsdPath: photoshopWorkingPsdPath,
      feedbackPath: photoshopFeedbackPath,
      prompt: planned.plan.prompt,
      passName: "Photoshop project pass",
      width: options.proofWidth,
      height: options.proofHeight,
      resolution: options.proofResolution
    },
    options.root
  );
  const illustratorReferenceJob = await createGeneratedJob(
    {
      kind: "place_file_reference",
      inputPath: photoshopHandoffSvgPath,
      layerName: "Photoshop SVG handoff",
      name: "photoshop-svg-handoff",
      x: 0,
      y: 0,
      width: documentWidth,
      height: documentHeight,
      opacity: options.referenceOpacity ?? 35,
      locked: true,
      embed: options.embedReference ?? false
    },
    options.root
  );
  const finalExportJob = await createGeneratedJob(
    {
      kind: "export",
      format: "svg",
      outputPath
    },
    options.root
  );

  return {
    ok: true,
    prompt: planned.plan.prompt,
    intent: planned.intent,
    outputPath,
    sourceSvgPath,
    photoshopReferencePngPath,
    photoshopHandoffSvgPath,
    photoshopWorkingPsdPath,
    photoshopFeedbackPath,
    plan: planned.plan,
    sceneJob: generatedJobSummary(sceneJob),
    sourceExportJob: generatedJobSummary(sourceExportJob),
    photoshopProjectJob: generatedPhotoshopJobSummary(photoshopProjectJob),
    illustratorReferenceJob: generatedJobSummary(illustratorReferenceJob),
    finalExportJob: generatedJobSummary(finalExportJob),
    handoff: {
      sourceOfTruth: "illustrator-vector-document",
      sequence: [
        "Illustrator creates editable vector scene",
        "Illustrator exports source SVG",
        "Photoshop opens SVG and saves layered PSD, PNG preview, and SVG handoff",
        "Illustrator places Photoshop SVG handoff as a named reference layer",
        "Illustrator exports final project SVG"
      ],
      photoshopArtifacts: {
        referencePngPath: photoshopReferencePngPath,
        handoffSvgPath: photoshopHandoffSvgPath,
        workingPsdPath: photoshopWorkingPsdPath,
        feedbackPath: photoshopFeedbackPath
      },
      illustratorConsumes: photoshopHandoffSvgPath
    },
    runbook: buildRunbook(sceneJob, sourceExportJob, photoshopProjectJob, illustratorReferenceJob, finalExportJob, {
      outputPath,
      sourceSvgPath,
      photoshopReferencePngPath,
      photoshopHandoffSvgPath,
      photoshopWorkingPsdPath,
      photoshopFeedbackPath
    })
  };
}

export async function executeAdobeProjectWorkflow(options: ExecuteAdobeProjectWorkflowOptions): Promise<AdobeProjectWorkflowExecution> {
  const maxReviewIterations = normalizeMaxReviewIterations(options.maxReviewIterations);
  const reviewIterations: AdobeProjectReviewIteration[] = [];
  let currentPrompt = options.prompt;
  let finalExecution: AdobeProjectWorkflowExecution | undefined;

  for (let attempt = 1; attempt <= maxReviewIterations; attempt += 1) {
    const execution = await executeAdobeProjectWorkflowAttempt({ ...options, prompt: currentPrompt });
    const nextGoalPrompt = execution.artworkReview?.nextGoalPrompt ?? null;
    reviewIterations.push(reviewIteration(attempt, currentPrompt, execution, nextGoalPrompt));
    finalExecution = execution;

    if (!shouldRunReviewIteration(execution, nextGoalPrompt, attempt, maxReviewIterations)) {
      break;
    }

    currentPrompt = nextGoalPrompt;
  }

  if (!finalExecution) {
    throw new Error("Adobe project workflow did not execute any review iteration.");
  }

  return {
    ...finalExecution,
    reviewIterations,
    next: finalNextSteps(finalExecution.next, reviewIterations)
  };
}

async function executeAdobeProjectWorkflowAttempt(options: ExecuteAdobeProjectWorkflowOptions): Promise<AdobeProjectWorkflowExecution> {
  const dryRun = options.dryRun ?? false;
  const illustratorRunMode = options.illustratorRunMode ?? "launch";
  const waitForResults = !dryRun && (options.waitForResults ?? true);
  const workflow = await prepareAdobeProjectWorkflow(options);

  if (isObjectPlan(workflow.plan) && !workflow.plan.guard.ok) {
    return {
      ok: false,
      dryRun,
      illustratorRunMode,
      photoshopRunMode: "com",
      workflow,
      reviewIterations: [],
      next: [workflow.plan.guard.nextGoalPrompt ?? "Revise the object scene until the shape guard passes before launching Illustrator."]
    };
  }

  const sceneLaunch = await runIllustratorWorkflowJob(workflow.sceneJob.jobPath, illustratorRunMode, options);
  if (!sceneLaunch.ok) {
    return failure({ dryRun, illustratorRunMode, workflow, sceneLaunch }, "Fix the Illustrator scene launch failure before exporting the source SVG.");
  }

  const sceneResult = waitForResults ? await waitForJob(workflow.sceneJob.id, options) : undefined;
  if (sceneResult?.result?.ok === false) {
    return failure(
      { dryRun, illustratorRunMode, workflow, sceneLaunch, sceneResult },
      "Fix the Illustrator scene job failure before exporting the source SVG."
    );
  }

  const sourceExportLaunch = await runIllustratorWorkflowJob(workflow.sourceExportJob.jobPath, illustratorRunMode, options);
  if (!sourceExportLaunch.ok) {
    return failure(
      { dryRun, illustratorRunMode, workflow, sceneLaunch, sceneResult, sourceExportLaunch },
      "Fix the Illustrator source SVG export launch failure before starting the Photoshop project pass."
    );
  }

  const sourceExportResult = waitForResults ? await waitForJob(workflow.sourceExportJob.id, options) : undefined;
  if (sourceExportResult?.result?.ok === false) {
    return failure(
      { dryRun, illustratorRunMode, workflow, sceneLaunch, sceneResult, sourceExportLaunch, sourceExportResult },
      "Fix the Illustrator source SVG export job failure before starting the Photoshop project pass."
    );
  }

  const sourceExportQa =
    waitForResults && !options.skipQa
      ? await inspectExportArtifact(workflow.sourceSvgPath, {
          format: "svg",
          minBytes: options.minBytes
        })
      : undefined;
  if (sourceExportQa && !sourceExportQa.ok) {
    return failure(
      { dryRun, illustratorRunMode, workflow, sceneLaunch, sceneResult, sourceExportLaunch, sourceExportResult, sourceExportQa },
      "Fix the Illustrator source SVG QA failure before starting the Photoshop project pass."
    );
  }

  const photoshopProjectLaunch = await runJsxViaPhotoshopCom(workflow.photoshopProjectJob.jobPath, {
    platform: resolveLaunchPlatform(options.photoshopPlatform ?? options.launchPlatform),
    dryRun,
    root: options.root
  });
  if (!photoshopProjectLaunch.ok) {
    return failure(
      {
        dryRun,
        illustratorRunMode,
        workflow,
        sceneLaunch,
        sceneResult,
        sourceExportLaunch,
        sourceExportResult,
        sourceExportQa,
        photoshopProjectLaunch
      },
      "Fix the Photoshop project-pass launch failure before returning the artwork to Illustrator."
    );
  }

  const photoshopProjectResult = waitForResults ? await waitForJob(workflow.photoshopProjectJob.id, options) : undefined;
  if (photoshopProjectResult?.result?.ok === false) {
    return failure(
      {
        dryRun,
        illustratorRunMode,
        workflow,
        sceneLaunch,
        sceneResult,
        sourceExportLaunch,
        sourceExportResult,
        sourceExportQa,
        photoshopProjectLaunch,
        photoshopProjectResult
      },
      "Fix the Photoshop project-pass job failure before returning the artwork to Illustrator."
    );
  }

  const photoshopReferenceQa =
    waitForResults && !options.skipQa
      ? await inspectExportArtifact(workflow.photoshopReferencePngPath, {
          format: "png",
          minBytes: options.minBytes,
          minWidth: options.proofMinWidth ?? options.minWidth,
          minHeight: options.proofMinHeight ?? options.minHeight,
          minNonBlankRatio: options.proofMinNonBlankRatio ?? options.minNonBlankRatio
        })
      : undefined;
  if (photoshopReferenceQa && !photoshopReferenceQa.ok) {
    return failure(
      {
        dryRun,
        illustratorRunMode,
        workflow,
        sceneLaunch,
        sceneResult,
        sourceExportLaunch,
        sourceExportResult,
        sourceExportQa,
        photoshopProjectLaunch,
        photoshopProjectResult,
        photoshopReferenceQa
      },
      "Fix the Photoshop PNG preview QA failure before placing the Photoshop SVG handoff back into Illustrator."
    );
  }

  const photoshopHandoffQa =
    waitForResults && !options.skipQa
      ? await inspectExportArtifact(workflow.photoshopHandoffSvgPath, {
          format: "svg",
          minBytes: options.minBytes
        })
      : undefined;
  if (photoshopHandoffQa && !photoshopHandoffQa.ok) {
    return failure(
      {
        dryRun,
        illustratorRunMode,
        workflow,
        sceneLaunch,
        sceneResult,
        sourceExportLaunch,
        sourceExportResult,
        sourceExportQa,
        photoshopProjectLaunch,
        photoshopProjectResult,
        photoshopReferenceQa,
        photoshopHandoffQa
      },
      "Fix the Photoshop SVG handoff QA failure before placing it back into Illustrator."
    );
  }

  const photoshopFeedback = waitForResults ? await readJsonArtifact(workflow.photoshopFeedbackPath) : undefined;

  const illustratorReferenceLaunch = await runIllustratorWorkflowJob(workflow.illustratorReferenceJob.jobPath, illustratorRunMode, options);
  if (!illustratorReferenceLaunch.ok) {
    return failure(
      {
        dryRun,
        illustratorRunMode,
        workflow,
        sceneLaunch,
        sceneResult,
        sourceExportLaunch,
        sourceExportResult,
        sourceExportQa,
        photoshopProjectLaunch,
        photoshopProjectResult,
        photoshopReferenceQa,
        photoshopHandoffQa,
        photoshopFeedback,
        illustratorReferenceLaunch
      },
      "Fix the Illustrator reference placement launch failure before final export."
    );
  }

  const illustratorReferenceResult = waitForResults ? await waitForJob(workflow.illustratorReferenceJob.id, options) : undefined;
  if (illustratorReferenceResult?.result?.ok === false) {
    return failure(
      {
        dryRun,
        illustratorRunMode,
        workflow,
        sceneLaunch,
        sceneResult,
        sourceExportLaunch,
        sourceExportResult,
        sourceExportQa,
        photoshopProjectLaunch,
        photoshopProjectResult,
        photoshopReferenceQa,
        photoshopHandoffQa,
        photoshopFeedback,
        illustratorReferenceLaunch,
        illustratorReferenceResult
      },
      "Fix the Illustrator reference placement job failure before final export."
    );
  }

  const finalExportLaunch = await runIllustratorWorkflowJob(workflow.finalExportJob.jobPath, illustratorRunMode, options);
  if (!finalExportLaunch.ok) {
    return failure(
      {
        dryRun,
        illustratorRunMode,
        workflow,
        sceneLaunch,
        sceneResult,
        sourceExportLaunch,
        sourceExportResult,
        sourceExportQa,
        photoshopProjectLaunch,
        photoshopProjectResult,
        photoshopReferenceQa,
        photoshopHandoffQa,
        photoshopFeedback,
        illustratorReferenceLaunch,
        illustratorReferenceResult,
        finalExportLaunch
      },
      "Fix the Illustrator final SVG export launch failure."
    );
  }

  const finalExportResult = waitForResults ? await waitForJob(workflow.finalExportJob.id, options) : undefined;
  if (finalExportResult?.result?.ok === false) {
    return failure(
      {
        dryRun,
        illustratorRunMode,
        workflow,
        sceneLaunch,
        sceneResult,
        sourceExportLaunch,
        sourceExportResult,
        sourceExportQa,
        photoshopProjectLaunch,
        photoshopProjectResult,
        photoshopReferenceQa,
        photoshopHandoffQa,
        photoshopFeedback,
        illustratorReferenceLaunch,
        illustratorReferenceResult,
        finalExportLaunch,
        finalExportResult
      },
      "Fix the Illustrator final SVG export job failure."
    );
  }

  const finalExportQa =
    waitForResults && !options.skipQa
      ? await inspectExportArtifact(workflow.outputPath, {
          format: "svg",
          minBytes: options.minBytes
        })
      : undefined;
  const artworkReview =
    waitForResults && !options.skipQa && !options.skipArtworkReview
      ? reviewArtworkQuality({
          prompt: workflow.prompt,
          scene: workflow.plan.scene,
          exportQa: photoshopReferenceQa ?? finalExportQa,
          target: isObjectPlan(workflow.plan) ? workflow.plan.target : undefined
        })
      : undefined;
  const artworkReviewClean = artworkReview ? artworkReview.ok && !shouldReviseArtworkFromReview(artworkReview) : true;

  return {
    ok:
      sceneLaunch.ok &&
      sourceExportLaunch.ok &&
      photoshopProjectLaunch.ok &&
      illustratorReferenceLaunch.ok &&
      finalExportLaunch.ok &&
      (sceneResult?.result?.ok ?? true) &&
      (sourceExportResult?.result?.ok ?? true) &&
      (photoshopProjectResult?.result?.ok ?? true) &&
      (illustratorReferenceResult?.result?.ok ?? true) &&
      (finalExportResult?.result?.ok ?? true) &&
      (sourceExportQa?.ok ?? true) &&
      (photoshopReferenceQa?.ok ?? true) &&
      (photoshopHandoffQa?.ok ?? true) &&
      (finalExportQa?.ok ?? true) &&
      artworkReviewClean,
    dryRun,
    illustratorRunMode,
    photoshopRunMode: "com",
    workflow,
    sceneLaunch,
    sceneResult,
    sourceExportLaunch,
    sourceExportResult,
    sourceExportQa,
    photoshopProjectLaunch,
    photoshopProjectResult,
    photoshopReferenceQa,
    photoshopHandoffQa,
    photoshopFeedback,
    illustratorReferenceLaunch,
    illustratorReferenceResult,
    finalExportLaunch,
    finalExportResult,
    finalExportQa,
    artworkReview,
    reviewIterations: [],
    next: nextSteps(dryRun, waitForResults, Boolean(options.skipQa), {
      sceneLaunch,
      sourceExportLaunch,
      photoshopProjectLaunch,
      illustratorReferenceLaunch,
      finalExportLaunch,
      artworkReview
    })
  };
}

function failure(
  fields: Partial<AdobeProjectWorkflowExecution> &
    Pick<AdobeProjectWorkflowExecution, "dryRun" | "illustratorRunMode" | "workflow">,
  message: string
): AdobeProjectWorkflowExecution {
  return {
    ok: false,
    photoshopRunMode: "com",
    reviewIterations: [],
    next: [message],
    ...fields
  };
}

async function runIllustratorWorkflowJob(
  jobPath: string,
  runMode: AdobeSvgProofRunMode,
  options: ExecuteAdobeProjectWorkflowOptions
): Promise<LaunchJobResult> {
  if (runMode === "com") {
    return runJsxViaIllustratorCom(jobPath, {
      platform: resolveLaunchPlatform(options.launchPlatform),
      dryRun: options.dryRun,
      root: options.root
    });
  }

  return launchJsxJob(jobPath, {
    platform: options.launchPlatform,
    appPath: options.appPath,
    dryRun: options.dryRun,
    root: options.root
  });
}

async function waitForJob(jobId: string, options: ExecuteAdobeProjectWorkflowOptions): Promise<JobStatus> {
  return waitForJobResult(jobId, {
    root: options.root,
    timeoutMs: options.timeoutMs,
    intervalMs: options.intervalMs
  });
}

function buildRunbook(
  sceneJob: GeneratedJob,
  sourceExportJob: GeneratedJob,
  photoshopProjectJob: {
    id: string;
    jobPath: string;
    resultPath: string;
    photoshopJobPath: string;
    photoshopResultPath: string;
  },
  illustratorReferenceJob: GeneratedJob,
  finalExportJob: GeneratedJob,
  paths: {
    outputPath: string;
    sourceSvgPath: string;
    photoshopReferencePngPath: string;
    photoshopHandoffSvgPath: string;
    photoshopWorkingPsdPath: string;
    photoshopFeedbackPath: string;
  }
): AdobeProjectWorkflowStep[] {
  return [
    {
      step: 1,
      app: "Illustrator",
      action: "Run the Illustrator scene JSX to create the editable vector document.",
      jobId: sceneJob.id,
      scriptPath: sceneJob.illustratorJobPath,
      resultPath: sceneJob.resultPath,
      expected: "Scene job result JSON exists with ok=true and kind=cartoon_scene."
    },
    {
      step: 2,
      app: "Illustrator",
      action: `Export the current Illustrator document as source SVG at ${paths.sourceSvgPath}.`,
      jobId: sourceExportJob.id,
      scriptPath: sourceExportJob.illustratorJobPath,
      resultPath: sourceExportJob.resultPath,
      expected: "Source SVG export result JSON exists with ok=true and kind=export."
    },
    {
      step: 3,
      app: "Bridge",
      action: "Run source SVG QA before handing the artwork to Photoshop.",
      expected: "Source SVG exists and is non-empty."
    },
    {
      step: 4,
      app: "Photoshop",
      action: `Open the source SVG, create a layered project pass at ${paths.photoshopWorkingPsdPath}, write PNG preview ${paths.photoshopReferencePngPath}, write SVG handoff ${paths.photoshopHandoffSvgPath}, and write feedback JSON ${paths.photoshopFeedbackPath}.`,
      jobId: photoshopProjectJob.id,
      scriptPath: photoshopProjectJob.photoshopJobPath,
      resultPath: photoshopProjectJob.resultPath,
      expected: "Photoshop project-pass result JSON exists with ok=true and kind=project_pass."
    },
    {
      step: 5,
      app: "Bridge",
      action: "Run PNG QA on the Photoshop preview, verify the Photoshop SVG handoff, and read Photoshop feedback JSON.",
      expected: "Photoshop PNG exists, SVG handoff exists, and feedback JSON is available for the next Illustrator pass."
    },
    {
      step: 6,
      app: "Illustrator",
      action: "Place the Photoshop SVG handoff back into the active Illustrator document as a named reference layer.",
      jobId: illustratorReferenceJob.id,
      scriptPath: illustratorReferenceJob.illustratorJobPath,
      resultPath: illustratorReferenceJob.resultPath,
      expected: "Illustrator placement result JSON exists with ok=true and kind=place_file_reference."
    },
    {
      step: 7,
      app: "Illustrator",
      action: `Export the final collaborative project SVG at ${paths.outputPath}.`,
      jobId: finalExportJob.id,
      scriptPath: finalExportJob.illustratorJobPath,
      resultPath: finalExportJob.resultPath,
      expected: "Final export result JSON exists with ok=true and kind=export."
    },
    {
      step: 8,
      app: "Bridge",
      action: "Run final SVG QA plus artwork review; feed review.nextGoalPrompt into the next full Illustrator-Photoshop-Illustrator round-trip if needed.",
      expected: "The final output has both editable Illustrator vector content and a Photoshop-generated project reference pass."
    }
  ];
}

function nextSteps(
  dryRun: boolean,
  waitForResults: boolean,
  skipQa: boolean,
  launches: {
    sceneLaunch: LaunchJobResult;
    sourceExportLaunch: LaunchJobResult;
    photoshopProjectLaunch: LaunchJobResult;
    illustratorReferenceLaunch: LaunchJobResult;
    finalExportLaunch: LaunchJobResult;
    artworkReview?: ArtworkReviewReport;
  }
): string[] {
  if (dryRun) {
    return [
      "Run the same Adobe project workflow without dryRun after Illustrator and Photoshop are available.",
      launches.sceneLaunch.next.waitForResult,
      launches.sourceExportLaunch.next.waitForResult,
      launches.photoshopProjectLaunch.next.waitForResult,
      launches.illustratorReferenceLaunch.next.waitForResult,
      launches.finalExportLaunch.next.waitForResult
    ];
  }

  if (!waitForResults) {
    return [
      launches.sceneLaunch.next.waitForResult,
      launches.sourceExportLaunch.next.waitForResult,
      launches.photoshopProjectLaunch.next.waitForResult,
      launches.illustratorReferenceLaunch.next.waitForResult,
      launches.finalExportLaunch.next.waitForResult
    ];
  }

  if (launches.artworkReview && shouldReviseArtworkFromReview(launches.artworkReview)) {
    return [launches.artworkReview.nextGoalPrompt];
  }

  return skipQa
    ? ["Run QA on the source SVG, Photoshop SVG handoff, Photoshop reference PNG, and final SVG before accepting the collaborative project."]
    : ["Use the final SVG as the collaborative Illustrator project output and keep the Photoshop SVG/PSD/PNG artifacts with it as the return project pass."];
}

function reviewIteration(
  attempt: number,
  prompt: string,
  execution: AdobeProjectWorkflowExecution,
  nextGoalPrompt: string | null
): AdobeProjectReviewIteration {
  return {
    attempt,
    prompt,
    workflowPrompt: execution.workflow.prompt,
    intent: execution.workflow.intent,
    ok: execution.ok,
    sourceExportQaOk: execution.sourceExportQa?.ok,
    photoshopReferenceQaOk: execution.photoshopReferenceQa?.ok,
    photoshopHandoffQaOk: execution.photoshopHandoffQa?.ok,
    finalExportQaOk: execution.finalExportQa?.ok,
    artworkReviewOk: execution.artworkReview?.ok,
    nextGoalPrompt
  };
}

function shouldRunReviewIteration(
  execution: AdobeProjectWorkflowExecution,
  nextGoalPrompt: string | null,
  attempt: number,
  maxReviewIterations: number
): nextGoalPrompt is string {
  return Boolean(
    attempt < maxReviewIterations &&
      execution.artworkReview &&
      shouldReviseArtworkFromReview(execution.artworkReview) &&
      nextGoalPrompt &&
      nextGoalPrompt.trim().length > 0
  );
}

function finalNextSteps(next: string[], reviewIterations: AdobeProjectReviewIteration[]): string[] {
  if (reviewIterations.length <= 1) {
    return next;
  }

  const last = reviewIterations[reviewIterations.length - 1];
  const summary = last?.ok
    ? `Adobe project review passed after ${reviewIterations.length} round-trip iteration(s).`
    : `Adobe project review stopped after ${reviewIterations.length} round-trip iteration(s); use the latest nextGoalPrompt for another full Illustrator-Photoshop-Illustrator pass.`;

  return [summary, ...next];
}

function isObjectPlan(plan: AdobeArtworkPlan): plan is ObjectShapePlan {
  return "guard" in plan && "target" in plan;
}

function normalizeMaxReviewIterations(value: number | undefined): number {
  if (value === undefined) {
    return 1;
  }

  if (!Number.isInteger(value) || value < 1 || value > 10) {
    throw new Error("maxReviewIterations must be an integer from 1 to 10.");
  }

  return value;
}

async function readJsonArtifact(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
    if (code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function resolveOutputPath(outputPath: string): string {
  return isAbsolute(outputPath) ? outputPath : resolve(process.cwd(), outputPath);
}

function defaultSiblingPath(outputPath: string, suffix: string): string {
  const extension = extname(outputPath);
  if (!extension) {
    return `${outputPath}${suffix}`;
  }

  return `${outputPath.slice(0, -extension.length)}${suffix}`;
}
