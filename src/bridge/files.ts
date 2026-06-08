import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

export interface BridgeDirs {
  root: string;
  jobs: string;
  results: string;
}

export function resolveBridgeRoot(root?: string): string {
  const configured = root ?? process.env.ILLUSTRATOR_AGENT_BRIDGE_ROOT ?? "./var";
  return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
}

export async function ensureBridgeDirs(root?: string): Promise<BridgeDirs> {
  const bridgeRoot = resolveBridgeRoot(root);
  const jobs = join(bridgeRoot, "jobs");
  const results = join(bridgeRoot, "results");

  await mkdir(jobs, { recursive: true });
  await mkdir(results, { recursive: true });

  return { root: bridgeRoot, jobs, results };
}

export async function getGeneratedJobPaths(id: string, root?: string): Promise<{ jobPath: string; resultPath: string }> {
  const dirs = await ensureBridgeDirs(root);

  return {
    jobPath: join(dirs.jobs, `${id}.jsx`),
    resultPath: join(dirs.results, `${id}.json`)
  };
}

export async function writeGeneratedJob(jobPath: string, jsx: string): Promise<void> {
  await writeFile(jobPath, jsx, "utf8");
}

export function toIllustratorPath(localPath: string, hostPlatform = process.env.ILLUSTRATOR_HOST_PLATFORM ?? "auto"): string {
  const normalized = localPath.replace(/\\/g, "/");
  const windowsMount = normalized.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);

  if ((hostPlatform === "auto" || hostPlatform === "windows") && windowsMount) {
    return `${windowsMount[1].toUpperCase()}:/${windowsMount[2]}`;
  }

  return normalized;
}
