import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { getGeneratedJobPaths } from "./files.js";

export interface JobResult {
  ok: boolean;
  jobId?: string;
  kind?: string;
  error?: string;
  [key: string]: unknown;
}

export interface JobStatus {
  id: string;
  resultPath: string;
  exists: boolean;
  result?: JobResult;
}

export interface WaitForJobResultOptions {
  root?: string;
  timeoutMs?: number;
  intervalMs?: number;
}

export class JobResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobResultError";
  }
}

export function normalizeJobId(id: string): string {
  if (basename(id) !== id || !/^[0-9a-f-]{36}$/.test(id)) {
    throw new JobResultError("Invalid job id");
  }

  return id;
}

export async function readJobStatus(id: string, root?: string): Promise<JobStatus> {
  const normalizedId = normalizeJobId(id);
  const { resultPath } = await getGeneratedJobPaths(normalizedId, root);

  try {
    return {
      id: normalizedId,
      resultPath,
      exists: true,
      result: parseJobResult(await readFile(resultPath, "utf8"), normalizedId)
    };
  } catch (error) {
    if (isNotFound(error)) {
      return {
        id: normalizedId,
        resultPath,
        exists: false
      };
    }

    throw error;
  }
}

export async function waitForJobResult(id: string, options: WaitForJobResultOptions = {}): Promise<JobStatus> {
  const timeoutMs = Math.max(0, options.timeoutMs ?? 60_000);
  const intervalMs = Math.max(100, options.intervalMs ?? 500);
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const status = await readJobStatus(id, options.root);
    if (status.exists) {
      return status;
    }

    if (Date.now() >= deadline) {
      throw new JobResultError(`Timed out waiting for Illustrator job result: ${id}`);
    }

    await delay(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
  }
}

function parseJobResult(text: string, expectedJobId: string): JobResult {
  const value = JSON.parse(text) as unknown;

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new JobResultError("Job result must be a JSON object");
  }

  const result = value as JobResult;
  if (typeof result.ok !== "boolean") {
    throw new JobResultError("Job result must include boolean ok");
  }

  if (result.jobId !== undefined && result.jobId !== expectedJobId) {
    throw new JobResultError(`Job result id mismatch: expected ${expectedJobId}, got ${String(result.jobId)}`);
  }

  return result;
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
