import { isAbsolute, resolve } from "node:path";
import { createGeneratedJob } from "../bridge/jobs.js";
import { generatedJobSummary } from "../bridge/jsxGenerator.js";
import type { ExportFormat, GeneratedJob } from "../bridge/types.js";
import { planObjectShapeScene, type ObjectShapePlan, type ObjectShapePlanOptions } from "../planner/objectShapePlanner.js";
import type { ObjectShapeTarget } from "../qa/objectShapeGuard.js";
import { loadDefaultCorpus } from "../semantic/search.js";
import type { SemanticItem } from "../semantic/types.js";
import type { WorkflowStep } from "./cartoonWorkflow.js";

export type ObjectShapePlanFunction = (prompt: string, corpus: SemanticItem[], options?: ObjectShapePlanOptions) => ObjectShapePlan;

export interface PrepareObjectShapeWorkflowOptions {
  prompt: string;
  outputPath: string;
  format?: ExportFormat;
  root?: string;
  width?: number;
  height?: number;
  title?: string;
  corpusPath?: string;
  evidenceLimit?: number;
  maxGuardIterations?: number;
  planScene?: ObjectShapePlanFunction;
}

export interface ObjectShapeGuardIteration {
  attempt: number;
  prompt: string;
  target: ObjectShapeTarget;
  guardOk: boolean;
  confidence: number;
  issues: string[];
  nextPrompt: string | null;
  nextGoalPrompt: string | null;
}

export interface ObjectShapePlanRefinement {
  plan: ObjectShapePlan;
  guardIterations: ObjectShapeGuardIteration[];
}

export interface ObjectShapeWorkflow {
  ok: true;
  originalPrompt: string;
  prompt: string;
  plan: ObjectShapePlan;
  guardIterations: ObjectShapeGuardIteration[];
  sceneJob: ReturnType<typeof generatedJobSummary>;
  exportJob: ReturnType<typeof generatedJobSummary>;
  runbook: WorkflowStep[];
}

export async function prepareObjectShapeWorkflow(options: PrepareObjectShapeWorkflowOptions): Promise<ObjectShapeWorkflow> {
  const format = options.format ?? "png";
  const corpus = await loadDefaultCorpus(options.corpusPath);
  const { plan, guardIterations } = refineObjectShapePlan(options.prompt, corpus, {
    width: options.width,
    height: options.height,
    title: options.title,
    evidenceLimit: options.evidenceLimit,
    maxGuardIterations: options.maxGuardIterations,
    planScene: options.planScene
  });
  const sceneJob = await createGeneratedJob({ kind: "cartoon_scene", scene: plan.scene }, options.root);
  const exportJob = await createGeneratedJob(
    {
      kind: "export",
      format,
      outputPath: resolveOutputPath(options.outputPath)
    },
    options.root
  );

  return {
    ok: true,
    originalPrompt: options.prompt.trim(),
    prompt: plan.prompt,
    plan,
    guardIterations,
    sceneJob: generatedJobSummary(sceneJob),
    exportJob: generatedJobSummary(exportJob),
    runbook: buildRunbook(sceneJob, exportJob, format, guardIterations)
  };
}

export function refineObjectShapePlan(
  prompt: string,
  corpus: SemanticItem[],
  options: ObjectShapePlanOptions & {
    maxGuardIterations?: number;
    planScene?: ObjectShapePlanFunction;
  } = {}
): ObjectShapePlanRefinement {
  const maxGuardIterations = normalizeMaxGuardIterations(options.maxGuardIterations);
  const planScene = options.planScene ?? planObjectShapeScene;
  const planOptions: ObjectShapePlanOptions = {
    width: options.width,
    height: options.height,
    title: options.title,
    evidenceLimit: options.evidenceLimit
  };
  let currentPrompt = prompt;
  let plan: ObjectShapePlan | undefined;
  const guardIterations: ObjectShapeGuardIteration[] = [];

  for (let attempt = 1; attempt <= maxGuardIterations; attempt += 1) {
    plan = planScene(currentPrompt, corpus, planOptions);
    guardIterations.push({
      attempt,
      prompt: plan.prompt,
      target: plan.target,
      guardOk: plan.guard.ok,
      confidence: plan.guard.confidence,
      issues: [...plan.guard.issues],
      nextPrompt: plan.guard.nextPrompt,
      nextGoalPrompt: plan.guard.nextGoalPrompt
    });

    if (plan.guard.ok || !plan.guard.nextGoalPrompt || attempt === maxGuardIterations) {
      break;
    }

    currentPrompt = plan.guard.nextGoalPrompt;
  }

  if (!plan) {
    throw new Error("Object shape planner did not produce a plan.");
  }

  return { plan, guardIterations };
}

function buildRunbook(sceneJob: GeneratedJob, exportJob: GeneratedJob, format: ExportFormat, guardIterations: ObjectShapeGuardIteration[]): WorkflowStep[] {
  return [
    {
      step: 1,
      action: `Confirm plan.guard.ok is true after ${guardIterations.length} guard iteration(s). If false, reprompt with plan.guard.nextGoalPrompt before running Illustrator.`,
      jobId: sceneJob.id,
      scriptPath: sceneJob.illustratorJobPath,
      resultPath: sceneJob.resultPath,
      expected: "Object guard passes structural and geometric checks."
    },
    {
      step: 2,
      action: "Run the scene JSX with job:run-com / bridge_run_job_via_com on Windows or WSL, or job:launch / bridge_launch_job on other hosts.",
      jobId: sceneJob.id,
      scriptPath: sceneJob.illustratorJobPath,
      resultPath: sceneJob.resultPath,
      expected: "Scene job result JSON exists with ok=true and kind=cartoon_scene."
    },
    {
      step: 3,
      action: "Wait for the scene job result before exporting.",
      jobId: sceneJob.id,
      resultPath: sceneJob.resultPath,
      expected: "Use job:wait or bridge_wait_for_job_result."
    },
    {
      step: 4,
      action: `Run the export JSX to export the active object scene as ${format.toUpperCase()}.`,
      jobId: exportJob.id,
      scriptPath: exportJob.illustratorJobPath,
      resultPath: exportJob.resultPath,
      expected: "Export job result JSON exists with ok=true and kind=export."
    },
    {
      step: 5,
      action: "Inspect export QA and visual output before treating the object as final.",
      expected: "Confirm nonblank export, correct framing, and recognizable object silhouette."
    }
  ];
}

function resolveOutputPath(outputPath: string): string {
  return isAbsolute(outputPath) ? outputPath : resolve(process.cwd(), outputPath);
}

function normalizeMaxGuardIterations(input: number | undefined): number {
  if (input === undefined) {
    return 1;
  }

  if (!Number.isFinite(input)) {
    return 1;
  }

  return Math.max(1, Math.min(Math.floor(input), 10));
}
