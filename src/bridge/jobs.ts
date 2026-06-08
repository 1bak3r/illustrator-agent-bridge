import { randomUUID } from "node:crypto";
import type { BridgeCommand, GeneratedJob } from "./types.js";
import { getGeneratedJobPaths, toIllustratorPath, writeGeneratedJob } from "./files.js";
import { generateJsx } from "./jsxGenerator.js";

export async function createGeneratedJob(command: BridgeCommand, root?: string): Promise<GeneratedJob> {
  const id = randomUUID();
  const { jobPath, resultPath } = await getGeneratedJobPaths(id, root);
  const illustratorJobPath = toIllustratorPath(jobPath);
  const illustratorResultPath = toIllustratorPath(resultPath);
  const jsx = generateJsx(command, { id, resultPath: illustratorResultPath });
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
