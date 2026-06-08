import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { createGeneratedJob } from "./jobs.js";
import { resolveBridgeRoot } from "./files.js";
import { generatedJobSummary } from "./jsxGenerator.js";
import { normalizeCommand, ValidationError } from "./validation.js";

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

  if (method === "GET" && url.pathname.startsWith("/v1/jobs/") && url.pathname.endsWith("/result")) {
    const parts = url.pathname.split("/");
    const id = parts[3];
    if (basename(id) !== id || !/^[0-9a-f-]{36}$/.test(id)) {
      throw new ValidationError("Invalid job id");
    }

    const resultPath = `${root}/results/${id}.json`;
    const result = await readFile(resultPath, "utf8");
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(result);
    return;
  }

  writeJson(response, 404, { ok: false, error: "Not found" });
}

async function readJson(request: IncomingMessage): Promise<unknown> {
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

  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) {
    throw new ValidationError("Request body is required");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
}

function statusForError(error: unknown): number {
  if (error instanceof ValidationError) {
    return 400;
  }

  return 500;
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}
