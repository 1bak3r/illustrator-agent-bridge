import { randomUUID } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import type { BridgeCommand, GeneratedJob } from "./types.js";
import { getGeneratedJobPaths, toIllustratorPath, writeGeneratedJob } from "./files.js";
import { generateJsx } from "./jsxGenerator.js";

export async function createGeneratedJob(command: BridgeCommand, root?: string): Promise<GeneratedJob> {
  const id = randomUUID();
  const { jobPath, resultPath } = await getGeneratedJobPaths(id, root);
  const illustratorJobPath = toIllustratorPath(jobPath);
  const illustratorResultPath = toIllustratorPath(resultPath);
  const jsx = generateJsx(toHostCommand(command), { id, resultPath: illustratorResultPath });
  await writeGeneratedJob(jobPath, jsx);

  return {
    id,
    jobPath,
    resultPath,
    illustratorJobPath,
    illustratorResultPath,
    jsx
  };
}

function toHostCommand(command: BridgeCommand): BridgeCommand {
  if (command.kind !== "export") {
    return command;
  }

  const absoluteOutputPath = isAbsolute(command.outputPath) ? command.outputPath : resolve(process.cwd(), command.outputPath);

  return {
    ...command,
    outputPath: toIllustratorPath(absoluteOutputPath)
  };
}
