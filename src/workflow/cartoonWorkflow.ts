import { isAbsolute, resolve } from "node:path";
import { createGeneratedJob } from "../bridge/jobs.js";
import { generatedJobSummary } from "../bridge/jsxGenerator.js";
import type { ExportFormat, GeneratedJob } from "../bridge/types.js";
import { planCartoonScene, type CartoonPlan } from "../planner/cartoonPlanner.js";
import { loadDefaultCorpus } from "../semantic/search.js";

export interface PrepareCartoonWorkflowOptions {
  prompt: string;
  outputPath: string;
  format?: ExportFormat;
  root?: string;
  width?: number;
  height?: number;
  title?: string;
  corpusPath?: string;
}

export interface CartoonWorkflow {
  ok: true;
  prompt: string;
  plan: CartoonPlan;
  sceneJob: ReturnType<typeof generatedJobSummary>;
  exportJob: ReturnType<typeof generatedJobSummary>;
  runbook: WorkflowStep[];
}

export interface WorkflowStep {
  step: number;
  action: string;
  jobId?: string;
  scriptPath?: string;
  resultPath?: string;
  expected?: string;
}

export async function prepareCartoonWorkflow(options: PrepareCartoonWorkflowOptions): Promise<CartoonWorkflow> {
  const format = options.format ?? "pdf";
  const corpus = await loadDefaultCorpus(options.corpusPath);
  const plan = planCartoonScene(options.prompt, corpus, {
    width: options.width,
    height: options.height,
    title: options.title
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
    prompt: plan.prompt,
    plan,
    sceneJob: generatedJobSummary(sceneJob),
    exportJob: generatedJobSummary(exportJob),
    runbook: buildRunbook(sceneJob, exportJob, format)
  };
}

function buildRunbook(sceneJob: GeneratedJob, exportJob: GeneratedJob, format: ExportFormat): WorkflowStep[] {
  return [
    {
      step: 1,
      action: "Launch scene JSX with job:launch or bridge_launch_job, or run it manually in Illustrator using File > Scripts > Other Script.",
      jobId: sceneJob.id,
      scriptPath: sceneJob.illustratorJobPath,
      resultPath: sceneJob.resultPath,
      expected: "Scene job result JSON exists with ok=true and kind=cartoon_scene."
    },
    {
      step: 2,
      action: "Wait for the scene job result before running export.",
      jobId: sceneJob.id,
      resultPath: sceneJob.resultPath,
      expected: "Use job:wait or bridge_wait_for_job_result."
    },
    {
      step: 3,
      action: `Launch export JSX with job:launch or bridge_launch_job to export the active document as ${format.toUpperCase()}, or run it manually in Illustrator.`,
      jobId: exportJob.id,
      scriptPath: exportJob.illustratorJobPath,
      resultPath: exportJob.resultPath,
      expected: "Export job result JSON exists with ok=true and kind=export."
    },
    {
      step: 4,
      action: "Inspect the exported artwork before calling it publication-ready.",
      expected: "Confirm nonblank export, correct framing, readable text, and no object overlap."
    }
  ];
}

function resolveOutputPath(outputPath: string): string {
  return isAbsolute(outputPath) ? outputPath : resolve(process.cwd(), outputPath);
}
