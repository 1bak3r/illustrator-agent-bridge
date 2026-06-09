import { isAbsolute, resolve } from "node:path";
import { launchJsxJob, type LaunchJobResult, type LaunchPlatform } from "../bridge/launcher.js";
import { waitForJobResult, type JobStatus } from "../bridge/results.js";
import type { ExportFormat } from "../bridge/types.js";
import { inspectExportArtifact, type ExportQaReport } from "../qa/exportQa.js";
import { prepareCartoonWorkflow, type CartoonWorkflow, type PrepareCartoonWorkflowOptions } from "./cartoonWorkflow.js";

export interface ExecuteCartoonWorkflowOptions extends PrepareCartoonWorkflowOptions {
  launchPlatform?: LaunchPlatform;
  appPath?: string;
  dryRun?: boolean;
  waitForResults?: boolean;
  timeoutMs?: number;
  intervalMs?: number;
  skipQa?: boolean;
  minBytes?: number;
  minWidth?: number;
  minHeight?: number;
}

export interface CartoonWorkflowExecution {
  ok: boolean;
  dryRun: boolean;
  workflow: CartoonWorkflow;
  sceneLaunch: LaunchJobResult;
  sceneResult?: JobStatus;
  exportLaunch?: LaunchJobResult;
  exportResult?: JobStatus;
  exportQa?: ExportQaReport;
  next: string[];
}

export async function executeCartoonWorkflow(options: ExecuteCartoonWorkflowOptions): Promise<CartoonWorkflowExecution> {
  const dryRun = options.dryRun ?? false;
  const waitForResults = !dryRun && (options.waitForResults ?? true);
  const workflow = await prepareCartoonWorkflow(options);
  const sceneLaunch = await launchJsxJob(workflow.sceneJob.jobPath, {
    platform: options.launchPlatform,
    appPath: options.appPath,
    dryRun,
    root: options.root
  });

  if (!sceneLaunch.ok) {
    return {
      ok: false,
      dryRun,
      workflow,
      sceneLaunch,
      next: ["Fix the scene launch failure before launching export."]
    };
  }

  const sceneResult = waitForResults
    ? await waitForJobResult(workflow.sceneJob.id, {
        root: options.root,
        timeoutMs: options.timeoutMs,
        intervalMs: options.intervalMs
      })
    : undefined;

  if (sceneResult?.result?.ok === false) {
    return {
      ok: false,
      dryRun,
      workflow,
      sceneLaunch,
      sceneResult,
      next: ["Fix the scene job failure before launching export."]
    };
  }

  const exportLaunch = await launchJsxJob(workflow.exportJob.jobPath, {
    platform: options.launchPlatform,
    appPath: options.appPath,
    dryRun,
    root: options.root
  });

  if (!exportLaunch.ok) {
    return {
      ok: false,
      dryRun,
      workflow,
      sceneLaunch,
      sceneResult,
      exportLaunch,
      next: ["Fix the export launch failure before waiting for export output."]
    };
  }

  const exportResult = waitForResults
    ? await waitForJobResult(workflow.exportJob.id, {
        root: options.root,
        timeoutMs: options.timeoutMs,
        intervalMs: options.intervalMs
      })
    : undefined;

  if (exportResult?.result?.ok === false) {
    return {
      ok: false,
      dryRun,
      workflow,
      sceneLaunch,
      sceneResult,
      exportLaunch,
      exportResult,
      next: ["Fix the export job failure before running artifact QA."]
    };
  }

  const exportQa =
    waitForResults && !options.skipQa
      ? await inspectExportArtifact(resolveOutputArtifactPath(options.outputPath), {
          format: workflowExportFormat(options.format),
          minBytes: options.minBytes,
          minWidth: options.minWidth,
          minHeight: options.minHeight
        })
      : undefined;

  return {
    ok: sceneLaunch.ok && exportLaunch.ok && (sceneResult?.result?.ok ?? true) && (exportResult?.result?.ok ?? true) && (exportQa?.ok ?? true),
    dryRun,
    workflow,
    sceneLaunch,
    sceneResult,
    exportLaunch,
    exportResult,
    exportQa,
    next: nextSteps(dryRun, waitForResults, Boolean(options.skipQa), sceneLaunch, exportLaunch)
  };
}

function workflowExportFormat(format: ExportFormat | undefined): ExportFormat {
  return format ?? "pdf";
}

function resolveOutputArtifactPath(outputPath: string): string {
  return isAbsolute(outputPath) ? outputPath : resolve(process.cwd(), outputPath);
}

function nextSteps(
  dryRun: boolean,
  waitForResults: boolean,
  skipQa: boolean,
  sceneLaunch: LaunchJobResult,
  exportLaunch: LaunchJobResult
): string[] {
  if (dryRun) {
    return [
      "Run the same workflow without dryRun after Illustrator is open.",
      sceneLaunch.next.waitForResult,
      exportLaunch.next.waitForResult
    ];
  }

  if (!waitForResults) {
    return [sceneLaunch.next.waitForResult, exportLaunch.next.waitForResult];
  }

  return skipQa ? ["Run qa:export on the exported artifact before publication use."] : ["Review exported artwork visually before publication use."];
}
