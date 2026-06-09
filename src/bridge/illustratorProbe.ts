import { readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runJsxViaIllustratorCom } from "./comAutomation.js";
import { confirmIllustratorDialog, type ConfirmIllustratorDialogResult } from "./dialogAutomation.js";
import { toIllustratorPath, type IllustratorHostPlatform } from "./files.js";
import { createGeneratedJob } from "./jobs.js";
import { generatedJobSummary } from "./jsxGenerator.js";
import { launchJsxJob, resolveLaunchPlatform, type LaunchJobResult, type LaunchPlatform } from "./launcher.js";
import { waitForJobResult, type JobStatus } from "./results.js";

export interface IllustratorProbeOptions {
  platform?: LaunchPlatform;
  method?: IllustratorProbeMethod;
  appPath?: string;
  root?: string;
  dryRun?: boolean;
  waitForResult?: boolean;
  timeoutMs?: number;
  intervalMs?: number;
  autoConfirmDialog?: boolean;
  dialogTimeoutMs?: number;
  drawCircle?: boolean;
}

export interface IllustratorAppCandidate {
  name: string;
  appPath: string;
  platform: Exclude<LaunchPlatform, "auto">;
  exists: boolean;
  source: string;
}

export type IllustratorProbeMethod = "auto" | "desktop" | "com";

export interface IllustratorProbeResult {
  ok: boolean;
  communicationConfirmed: boolean;
  platform: Exclude<LaunchPlatform, "auto">;
  method: Exclude<IllustratorProbeMethod, "auto">;
  appPath?: string;
  candidates: IllustratorAppCandidate[];
  job: ReturnType<typeof generatedJobSummary>;
  launch: LaunchJobResult;
  dialogConfirmation?: ConfirmIllustratorDialogResult;
  result?: JobStatus;
  waitError?: string;
  next: string[];
}

export async function detectIllustratorApps(platform?: LaunchPlatform): Promise<IllustratorAppCandidate[]> {
  const resolvedPlatform = resolveLaunchPlatform(platform);

  if (resolvedPlatform === "macos") {
    return detectMacIllustratorApps();
  }

  if (resolvedPlatform === "windows" || resolvedPlatform === "wsl") {
    return detectWindowsIllustratorApps(resolvedPlatform);
  }

  return [];
}

export async function probeIllustratorCommunication(options: IllustratorProbeOptions = {}): Promise<IllustratorProbeResult> {
  const platform = resolveLaunchPlatform(options.platform);
  const method = resolveProbeMethod(options.method, platform);
  const candidates = await detectIllustratorApps(platform);
  const appPath = options.appPath ?? candidates.find((candidate) => candidate.exists)?.appPath;
  const job = await createGeneratedJob(probeCommand(Boolean(options.drawCircle)), options.root, { hostPlatform: hostPlatformForJob(platform) });
  const launch =
    method === "com"
      ? await runJsxViaIllustratorCom(job.jobPath, {
          platform,
          dryRun: options.dryRun,
          root: options.root
        })
      : await launchJsxJob(job.jobPath, {
          platform,
          appPath,
          dryRun: options.dryRun,
          root: options.root
        });
  const dialogConfirmation =
    launch.ok && method === "desktop" && options.autoConfirmDialog
      ? await confirmIllustratorDialog({
          platform,
          dryRun: options.dryRun,
          timeoutMs: options.dialogTimeoutMs
        })
      : undefined;
  let result: JobStatus | undefined;
  let waitError: string | undefined;
  if (launch.ok && options.waitForResult && !options.dryRun) {
    try {
      result = await waitForJobResult(job.id, {
        root: options.root,
        timeoutMs: options.timeoutMs,
        intervalMs: options.intervalMs
      });
    } catch (error) {
      waitError = error instanceof Error ? error.message : String(error);
    }
  }
  const communicationConfirmed = Boolean(result?.exists && result.result?.ok === true);

  return {
    ok: options.waitForResult && !options.dryRun ? communicationConfirmed : launch.ok,
    communicationConfirmed,
    platform,
    method,
    appPath,
    candidates,
    job: generatedJobSummary(job),
    launch,
    dialogConfirmation,
    result,
    waitError,
    next: nextSteps({
      dryRun: Boolean(options.dryRun),
      waitForResult: Boolean(options.waitForResult),
      communicationConfirmed,
      method,
      autoConfirmDialog: Boolean(options.autoConfirmDialog),
      drawCircle: Boolean(options.drawCircle),
      launch
    })
  };
}

function resolveProbeMethod(method: IllustratorProbeMethod | undefined, platform: Exclude<LaunchPlatform, "auto">): Exclude<IllustratorProbeMethod, "auto"> {
  const selected = method ?? "auto";
  if (selected === "desktop" || selected === "com") {
    return selected;
  }

  return platform === "windows" || platform === "wsl" ? "com" : "desktop";
}

function probeCommand(drawCircle: boolean) {
  if (!drawCircle) {
    return {
      kind: "ping" as const,
      message: `illustrator-agent-bridge communication probe ${new Date().toISOString()}`
    };
  }

  return {
    kind: "cartoon_scene" as const,
    scene: {
      document: {
        title: "Illustrator Bridge Circle Probe",
        width: 360,
        height: 240,
        colorMode: "RGB" as const
      },
      elements: [
        {
          type: "ellipse" as const,
          name: "communication proof circle",
          x: 110,
          y: 50,
          width: 140,
          height: 140,
          style: {
            fill: "#8DD6C8",
            stroke: "#1D1B1B",
            strokeWidth: 5,
            opacity: 100
          }
        }
      ]
    }
  };
}

function hostPlatformForJob(platform: Exclude<LaunchPlatform, "auto">): IllustratorHostPlatform {
  return platform === "wsl" ? "wsl" : platform;
}

async function detectMacIllustratorApps(): Promise<IllustratorAppCandidate[]> {
  const applications = "/Applications";
  const candidates: IllustratorAppCandidate[] = [];

  try {
    const entries = await readdir(applications);
    for (const entry of entries) {
      if (!/^Adobe Illustrator/i.test(entry)) {
        continue;
      }

      const appPath = join(applications, entry, "Adobe Illustrator.app");
      candidates.push({
        name: entry,
        appPath,
        platform: "macos",
        exists: await isExistingPath(appPath),
        source: applications
      });
    }
  } catch {
    // Missing /Applications is normal on non-macOS test hosts.
  }

  candidates.push({
    name: "Adobe Illustrator",
    appPath: "Adobe Illustrator",
    platform: "macos",
    exists: false,
    source: "default app name"
  });
  return uniqueCandidates(candidates);
}

async function detectWindowsIllustratorApps(platform: "windows" | "wsl"): Promise<IllustratorAppCandidate[]> {
  const roots = platform === "wsl" ? ["/mnt/c/Program Files/Adobe", "/mnt/c/Program Files (x86)/Adobe"] : ["C:/Program Files/Adobe", "C:/Program Files (x86)/Adobe"];
  const candidates: IllustratorAppCandidate[] = [];

  for (const root of roots) {
    try {
      const entries = await readdir(root);
      for (const entry of entries) {
        if (!/^Adobe Illustrator/i.test(entry)) {
          continue;
        }

        const localExe = join(root, entry, "Support Files", "Contents", "Windows", "Illustrator.exe");
        candidates.push({
          name: entry,
          appPath: platform === "wsl" ? toIllustratorPath(localExe, "windows") : localExe.replace(/\\/g, "/"),
          platform,
          exists: await isExistingPath(localExe),
          source: root
        });
      }
    } catch {
      // Missing Adobe install roots are expected on systems without Illustrator.
    }
  }

  return uniqueCandidates(candidates);
}

async function isExistingPath(path: string): Promise<boolean> {
  try {
    const pathStat = await stat(path);
    return pathStat.isFile() || pathStat.isDirectory();
  } catch {
    return existsSync(path);
  }
}

function uniqueCandidates(candidates: IllustratorAppCandidate[]): IllustratorAppCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.platform}:${candidate.appPath}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function nextSteps(options: {
  dryRun: boolean;
  waitForResult: boolean;
  communicationConfirmed: boolean;
  method: Exclude<IllustratorProbeMethod, "auto">;
  autoConfirmDialog: boolean;
  drawCircle: boolean;
  launch: LaunchJobResult;
}): string[] {
  if (options.dryRun) {
    return [
      options.method === "com" ? "Run the probe without dryRun to execute the JSX through Illustrator COM automation." : "Run the probe without dryRun to open Illustrator through the host desktop.",
      options.launch.next.waitForResult
    ];
  }

  if (options.communicationConfirmed) {
    return [
      options.drawCircle
        ? "Illustrator wrote the circle probe result JSON. Local bridge communication and circle drawing are confirmed."
        : "Illustrator wrote the probe result JSON. Local bridge communication is confirmed."
    ];
  }

  if (options.waitForResult) {
    return [
      "Illustrator did not write the probe result before the timeout.",
      options.autoConfirmDialog
        ? "If Illustrator opened, inspect any remaining Adobe prompt; auto-confirm did not produce a result yet."
        : options.method === "com"
          ? "COM execution returned but Illustrator did not write the result JSON; inspect the JSX result path and Illustrator scripting errors."
          : "If Illustrator opened, approve any script warning or rerun with auto-confirm enabled, then confirm it can access the bridge result path.",
      options.launch.next.waitForResult
    ];
  }

  return [
    options.method === "com"
      ? "If Illustrator opened, wait for COM script execution to finish."
      : options.autoConfirmDialog
      ? "If Illustrator opened, wait for any auto-confirmed script to finish."
      : "If Illustrator opened, approve any script warning or rerun with auto-confirm enabled.",
    options.launch.next.waitForResult,
    "The result JSON with ok=true is the communication proof."
  ];
}
