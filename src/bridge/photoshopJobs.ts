import { randomUUID } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { getGeneratedJobPaths, toAdobeHostPath, writeGeneratedJob, type AdobeHostPlatform } from "./files.js";
import { generatePhotoshopJsx } from "./photoshopJsxGenerator.js";
import type { GeneratedPhotoshopJob, PhotoshopCommand } from "./photoshopTypes.js";

export interface CreateGeneratedPhotoshopJobOptions {
  hostPlatform?: AdobeHostPlatform;
}

export async function createGeneratedPhotoshopJob(
  command: PhotoshopCommand,
  root?: string,
  options: CreateGeneratedPhotoshopJobOptions = {}
): Promise<GeneratedPhotoshopJob> {
  const id = randomUUID();
  const { jobPath, resultPath } = await getGeneratedJobPaths(id, root);
  const photoshopJobPath = toAdobeHostPath(jobPath, options.hostPlatform);
  const photoshopResultPath = toAdobeHostPath(resultPath, options.hostPlatform);
  const jsx = generatePhotoshopJsx(toHostCommand(command, options.hostPlatform), { id, resultPath: photoshopResultPath });
  await writeGeneratedJob(jobPath, jsx);

  return {
    id,
    jobPath,
    resultPath,
    photoshopJobPath,
    photoshopResultPath,
    jsx
  };
}

function toHostCommand(command: PhotoshopCommand, hostPlatform?: AdobeHostPlatform): PhotoshopCommand {
  if (command.kind !== "svg_proof") {
    return command;
  }

  return {
    ...command,
    inputPath: toAdobeHostPath(resolvePath(command.inputPath), hostPlatform),
    outputPath: toAdobeHostPath(resolvePath(command.outputPath), hostPlatform)
  };
}

function resolvePath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}
