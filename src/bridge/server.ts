import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createGeneratedJob } from "./jobs.js";
import { getGeneratedJobPaths, resolveBridgeRoot } from "./files.js";
import { generatedJobSummary } from "./jsxGenerator.js";
import { LaunchJobError, launchJsxJob, type LaunchPlatform } from "./launcher.js";
import { JobResultError, normalizeJobId, readJobStatus } from "./results.js";
import { normalizeCommand, ValidationError } from "./validation.js";
import { ExportQaError, inspectExportArtifact } from "../qa/exportQa.js";
import { prepareCartoonWorkflow } from "../workflow/cartoonWorkflow.js";

export interface ServerOptions {
  host?: string;
  port?: number;
  root?: string;
}

export async function startBridgeServer(options: ServerOptions = {}): Promise<{ close: () => Promise<void>; url: string }> {
  const host = options.host ?? "127.0.0.1";
  const requestedPort = options.port ?? 4317;
  const root = resolveBridgeRoot(options.root);

  const server = createServer(async (request, response) => {
    try {
      await routeRequest(request, response, root);
    } catch (error) {
      writeJson(response, statusForError(error), {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : requestedPort;

  return {
    url: `http://${host}:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
}

async function routeRequest(request: IncomingMessage, response: ServerResponse, root: string): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");

  if (method === "GET" && url.pathname === "/health") {
    writeJson(response, 200, { ok: true, root });
    return;
  }

  if (method === "POST" && url.pathname === "/v1/jobs") {
    const body = await readJson(request);
    const command = normalizeCommand(body);
    const job = await createGeneratedJob(command, root);
    writeJson(response, 201, {
      ok: true,
      job: generatedJobSummary(job),
      run: {
        illustratorMenu: "File > Scripts > Other Script",
        scriptPath: job.illustratorJobPath,
        resultPath: job.resultPath,
        illustratorResultPath: job.illustratorResultPath
      }
    });
    return;
  }

  if (method === "POST" && url.pathname.startsWith("/v1/jobs/") && url.pathname.endsWith("/launch")) {
    const id = normalizeJobId(url.pathname.split("/")[3] ?? "");
    const body = objectBody(await readOptionalJson(request));
    const { jobPath } = await getGeneratedJobPaths(id, root);
    const result = await launchJsxJob(jobPath, {
      platform: optionalLaunchPlatform(body.platform),
      appPath: optionalStringBodyValue(body.appPath, "appPath"),
      dryRun: optionalBooleanBodyValue(body.dryRun, "dryRun"),
      root
    });

    writeJson(response, 200, result);
    return;
  }

  if (method === "POST" && url.pathname === "/v1/workflows/cartoon") {
    const body = objectBody(await readJson(request));
    const prompt = stringBodyValue(body.prompt, "prompt");
    const outputPath = stringBodyValue(body.outputPath, "outputPath");
    const workflow = await prepareCartoonWorkflow({
      prompt,
      outputPath,
      format: optionalExportFormat(body.format),
      width: optionalNumberBodyValue(body.width, "width"),
      height: optionalNumberBodyValue(body.height, "height"),
      title: optionalStringBodyValue(body.title, "title"),
      root
    });
    writeJson(response, 201, workflow);
    return;
  }

  if (method === "POST" && url.pathname === "/v1/qa/export") {
    const body = objectBody(await readJson(request));
    const report = await inspectExportArtifact(stringBodyValue(body.path, "path"), {
      format: optionalExportFormat(body.format),
      minBytes: optionalNumberBodyValue(body.minBytes, "minBytes"),
      minWidth: optionalNumberBodyValue(body.minWidth, "minWidth"),
      minHeight: optionalNumberBodyValue(body.minHeight, "minHeight")
    });
    writeJson(response, 200, { ok: report.ok, report });
    return;
  }

  if (method === "GET" && url.pathname.startsWith("/v1/jobs/") && url.pathname.endsWith("/status")) {
    const id = url.pathname.split("/")[3];
    const status = await readJobStatus(id, root);
    writeJson(response, 200, {
      ok: true,
      job: status
    });
    return;
  }

  if (method === "GET" && url.pathname.startsWith("/v1/jobs/") && url.pathname.endsWith("/result")) {
    const id = url.pathname.split("/")[3];
    const status = await readJobStatus(id, root);
    if (!status.exists) {
      writeJson(response, 404, {
        ok: false,
        error: "Job result not found",
        job: status
      });
      return;
    }

    writeJson(response, 200, status.result);
    return;
  }

  writeJson(response, 404, { ok: false, error: "Not found" });
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const text = await readBodyText(request);
  if (!text.trim()) {
    throw new ValidationError("Request body is required");
  }

  return parseJson(text);
}

async function readOptionalJson(request: IncomingMessage): Promise<unknown> {
  const text = await readBodyText(request);
  if (!text.trim()) {
    return {};
  }

  return parseJson(text);
}

async function readBodyText(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let length = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;

    if (length > 1024 * 1024) {
      throw new ValidationError("Request body cannot exceed 1 MiB");
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
}

function statusForError(error: unknown): number {
  if (error instanceof ValidationError || error instanceof JobResultError || error instanceof ExportQaError || error instanceof LaunchJobError) {
    return 400;
  }

  return 500;
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}

function objectBody(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ValidationError("Request body must be a JSON object");
  }

  return input as Record<string, unknown>;
}

function stringBodyValue(input: unknown, name: string): string {
  if (typeof input !== "string" || input.length === 0) {
    throw new ValidationError(`${name} must be a non-empty string`);
  }

  return input;
}

function optionalStringBodyValue(input: unknown, name: string): string | undefined {
  if (input === undefined) {
    return undefined;
  }

  return stringBodyValue(input, name);
}

function optionalNumberBodyValue(input: unknown, name: string): number | undefined {
  if (input === undefined) {
    return undefined;
  }

  if (typeof input !== "number" || !Number.isFinite(input)) {
    throw new ValidationError(`${name} must be a finite number`);
  }

  return input;
}

function optionalBooleanBodyValue(input: unknown, name: string): boolean | undefined {
  if (input === undefined) {
    return undefined;
  }

  if (typeof input !== "boolean") {
    throw new ValidationError(`${name} must be a boolean`);
  }

  return input;
}

function optionalExportFormat(input: unknown): "pdf" | "svg" | "png" | "jpg" | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = stringBodyValue(input, "format").toLowerCase();
  if (value !== "pdf" && value !== "svg" && value !== "png" && value !== "jpg") {
    throw new ValidationError("format must be pdf, svg, png, or jpg");
  }

  return value;
}

function optionalLaunchPlatform(input: unknown): LaunchPlatform | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = stringBodyValue(input, "platform").toLowerCase();
  if (value !== "auto" && value !== "macos" && value !== "windows" && value !== "wsl" && value !== "linux") {
    throw new ValidationError("platform must be auto, macos, windows, wsl, or linux");
  }

  return value;
}
