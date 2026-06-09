#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { startAgentMcpStdioServer } from "./agent/mcpServer.js";
import { getGeneratedJobPaths } from "./bridge/files.js";
import { createGeneratedJob } from "./bridge/jobs.js";
import { generatedJobSummary } from "./bridge/jsxGenerator.js";
import { LaunchJobError, launchJsxJob, type LaunchPlatform } from "./bridge/launcher.js";
import { JobResultError, normalizeJobId, readJobStatus, waitForJobResult } from "./bridge/results.js";
import { startBridgeServer } from "./bridge/server.js";
import { normalizeCommand, normalizeScene, ValidationError } from "./bridge/validation.js";
import { callIllustratorTool, getIllustratorMcpConfig, listIllustratorTools, McpConfigError } from "./mcp/illustratorClient.js";
import { planCartoonScene } from "./planner/cartoonPlanner.js";
import { ExportQaError, inspectExportArtifact } from "./qa/exportQa.js";
import { loadDefaultCorpus, searchCorpus } from "./semantic/search.js";
import { executeCartoonWorkflow } from "./workflow/cartoonExecutor.js";
import { prepareCartoonWorkflow } from "./workflow/cartoonWorkflow.js";

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;

  switch (command) {
    case "mcp:list-tools":
      await listTools(rest);
      return;
    case "mcp:call":
      await callTool(rest);
      return;
    case "mcp:serve":
      await startAgentMcpStdioServer();
      return;
    case "jsx:ping":
      await makePing(rest);
      return;
    case "jsx:cartoon":
      await makeCartoon(rest);
      return;
    case "jsx:export":
      await makeExport(rest);
      return;
    case "plan:cartoon":
      await planCartoon(rest);
      return;
    case "workflow:cartoon":
      await workflowCartoon(rest);
      return;
    case "workflow:execute-cartoon":
      await workflowExecuteCartoon(rest);
      return;
    case "job:status":
      await jobStatus(rest);
      return;
    case "job:wait":
      await jobWait(rest);
      return;
    case "job:launch":
      await jobLaunch(rest);
      return;
    case "qa:export":
      await qaExport(rest);
      return;
    case "serve":
      await serve(rest);
      return;
    case "semantic:search":
      await semanticSearch(rest);
      return;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      return;
    default:
      throw new ValidationError(`Unknown command: ${command}`);
  }
}

async function listTools(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const config = getIllustratorMcpConfig({
    url: optionValue(options, "url"),
    token: optionValue(options, "token")
  });
  const tools = await listIllustratorTools(config);

  console.log(JSON.stringify({ ok: true, toolCount: tools.length, tools }, null, 2));
}

async function callTool(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const positional = options.positionals;
  const toolName = positional[0];

  if (!toolName) {
    throw new ValidationError("mcp:call requires a tool name");
  }

  const toolArgs = positional[1] ? await readJsonArg(positional[1]) : {};
  const config = getIllustratorMcpConfig({
    url: optionValue(options, "url"),
    token: optionValue(options, "token")
  });
  const result = await callIllustratorTool(config, toolName, objectArg(toolArgs));

  console.log(JSON.stringify({ ok: true, result }, null, 2));
}

async function makePing(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const message = optionValue(options, "message") ?? "hello from illustrator-agent-bridge";
  const job = await createGeneratedJob({ kind: "ping", message }, optionValue(options, "root"));
  console.log(JSON.stringify({ ok: true, job: generatedJobSummary(job) }, null, 2));
}

async function makeCartoon(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const scenePath = options.positionals[0] ?? "examples/cartoon-scene.json";
  const scene = normalizeScene(await readJsonFile(scenePath));
  const job = await createGeneratedJob({ kind: "cartoon_scene", scene }, optionValue(options, "root"));

  console.log(JSON.stringify({ ok: true, job: generatedJobSummary(job) }, null, 2));
}

async function makeExport(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const format = optionValue(options, "format") ?? "pdf";
  const outputPath = optionValue(options, "output");

  if (!outputPath) {
    throw new ValidationError("jsx:export requires --output PATH");
  }

  const command = normalizeCommand({
    kind: "export",
    format,
    outputPath
  });
  const job = await createGeneratedJob(command, optionValue(options, "root"));

  console.log(JSON.stringify({ ok: true, job: generatedJobSummary(job) }, null, 2));
}

async function serve(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const port = optionValue(options, "port") ? Number(optionValue(options, "port")) : undefined;
  const host = optionValue(options, "host");
  const root = optionValue(options, "root");
  const server = await startBridgeServer({ port, host, root });

  console.log(JSON.stringify({ ok: true, url: server.url }, null, 2));
  await new Promise<void>((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
  await server.close();
}

async function semanticSearch(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const query = options.positionals.join(" ");

  if (!query) {
    throw new ValidationError("semantic:search requires a query");
  }

  const limit = optionValue(options, "limit") ? Number(optionValue(options, "limit")) : undefined;
  const corpus = await loadDefaultCorpus(optionValue(options, "corpus"));
  const results = searchCorpus(query, corpus, { limit });

  console.log(JSON.stringify({ ok: true, query, resultCount: results.length, results }, null, 2));
}

async function jobStatus(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const id = options.positionals[0];

  if (!id) {
    throw new ValidationError("job:status requires a job id");
  }

  const status = await readJobStatus(id, optionValue(options, "root"));
  console.log(JSON.stringify({ ok: true, job: status }, null, 2));
}

async function jobWait(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const id = options.positionals[0];

  if (!id) {
    throw new ValidationError("job:wait requires a job id");
  }

  const status = await waitForJobResult(id, {
    root: optionValue(options, "root"),
    timeoutMs: optionValue(options, "timeout-ms") ? Number(optionValue(options, "timeout-ms")) : undefined,
    intervalMs: optionValue(options, "interval-ms") ? Number(optionValue(options, "interval-ms")) : undefined
  });
  console.log(JSON.stringify({ ok: true, job: status }, null, 2));
}

async function jobLaunch(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const id = options.positionals[0];

  if (!id) {
    throw new ValidationError("job:launch requires a job id");
  }

  const { jobPath } = await getGeneratedJobPaths(normalizeJobId(id), optionValue(options, "root"));
  const result = await launchJsxJob(jobPath, {
    platform: optionalLaunchPlatform(optionValue(options, "platform")),
    appPath: optionValue(options, "app"),
    dryRun: flagValue(options, "dry-run"),
    root: optionValue(options, "root")
  });
  console.log(JSON.stringify(result, null, 2));
}

async function qaExport(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const path = options.positionals[0];

  if (!path) {
    throw new ValidationError("qa:export requires an export artifact path");
  }

  const report = await inspectExportArtifact(path, {
    format: optionalExportFormat(optionValue(options, "format")),
    minBytes: optionValue(options, "min-bytes") ? Number(optionValue(options, "min-bytes")) : undefined,
    minWidth: optionValue(options, "min-width") ? Number(optionValue(options, "min-width")) : undefined,
    minHeight: optionValue(options, "min-height") ? Number(optionValue(options, "min-height")) : undefined,
    minNonBlankRatio: optionValue(options, "min-nonblank-ratio") ? Number(optionValue(options, "min-nonblank-ratio")) : undefined
  });
  console.log(JSON.stringify({ ok: report.ok, report }, null, 2));
}

async function planCartoon(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const prompt = options.positionals.join(" ");

  if (!prompt) {
    throw new ValidationError("plan:cartoon requires a prompt");
  }

  const corpus = await loadDefaultCorpus(optionValue(options, "corpus"));
  const plan = planCartoonScene(prompt, corpus, {
    title: optionValue(options, "title"),
    width: optionValue(options, "width") ? Number(optionValue(options, "width")) : undefined,
    height: optionValue(options, "height") ? Number(optionValue(options, "height")) : undefined
  });
  const job = await createGeneratedJob({ kind: "cartoon_scene", scene: plan.scene }, optionValue(options, "root"));

  console.log(
    JSON.stringify(
      {
        ok: true,
        plan,
        job: generatedJobSummary(job)
      },
      null,
      2
    )
  );
}

async function workflowCartoon(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const prompt = options.positionals.join(" ");
  const outputPath = optionValue(options, "output");

  if (!prompt) {
    throw new ValidationError("workflow:cartoon requires a prompt");
  }

  if (!outputPath) {
    throw new ValidationError("workflow:cartoon requires --output PATH");
  }

  const workflow = await prepareCartoonWorkflow({
    prompt,
    outputPath,
    format: optionalExportFormat(optionValue(options, "format")),
    root: optionValue(options, "root"),
    corpusPath: optionValue(options, "corpus"),
    title: optionValue(options, "title"),
    width: optionValue(options, "width") ? Number(optionValue(options, "width")) : undefined,
    height: optionValue(options, "height") ? Number(optionValue(options, "height")) : undefined
  });

  console.log(JSON.stringify(workflow, null, 2));
}

async function workflowExecuteCartoon(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const prompt = options.positionals.join(" ");
  const outputPath = optionValue(options, "output");
  const dryRun = flagValue(options, "dry-run");

  if (!prompt) {
    throw new ValidationError("workflow:execute-cartoon requires a prompt");
  }

  if (!outputPath) {
    throw new ValidationError("workflow:execute-cartoon requires --output PATH");
  }

  const execution = await executeCartoonWorkflow({
    prompt,
    outputPath,
    format: optionalExportFormat(optionValue(options, "format")),
    root: optionValue(options, "root"),
    corpusPath: optionValue(options, "corpus"),
    title: optionValue(options, "title"),
    width: optionValue(options, "width") ? Number(optionValue(options, "width")) : undefined,
    height: optionValue(options, "height") ? Number(optionValue(options, "height")) : undefined,
    launchPlatform: optionalLaunchPlatform(optionValue(options, "platform")),
    appPath: optionValue(options, "app"),
    dryRun,
    waitForResults: dryRun ? false : !flagValue(options, "no-wait"),
    timeoutMs: optionValue(options, "timeout-ms") ? Number(optionValue(options, "timeout-ms")) : undefined,
    intervalMs: optionValue(options, "interval-ms") ? Number(optionValue(options, "interval-ms")) : undefined,
    skipQa: flagValue(options, "skip-qa"),
    minBytes: optionValue(options, "min-bytes") ? Number(optionValue(options, "min-bytes")) : undefined,
    minWidth: optionValue(options, "min-width") ? Number(optionValue(options, "min-width")) : undefined,
    minHeight: optionValue(options, "min-height") ? Number(optionValue(options, "min-height")) : undefined,
    minNonBlankRatio: optionValue(options, "min-nonblank-ratio") ? Number(optionValue(options, "min-nonblank-ratio")) : undefined
  });

  console.log(JSON.stringify(execution, null, 2));
}

interface ParsedOptions {
  positionals: string[];
  values: Map<string, string>;
  flags: Set<string>;
}

const flagOptions = new Set(["dry-run", "no-wait", "skip-qa"]);

function parseOptions(args: string[]): ParsedOptions {
  const positionals: string[] = [];
  const values = new Map<string, string>();
  const flags = new Set<string>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const next = args[index + 1];

    if (!key) {
      throw new ValidationError("Empty option name");
    }

    if (next === undefined || next.startsWith("--")) {
      if (flagOptions.has(key)) {
        flags.add(key);
        continue;
      }

      throw new ValidationError(`Option --${key} requires a value`);
    }

    values.set(key, next);
    index += 1;
  }

  return { positionals, values, flags };
}

function optionValue(options: ParsedOptions, key: string): string | undefined {
  return options.values.get(key);
}

function flagValue(options: ParsedOptions, key: string): boolean {
  const value = options.values.get(key);
  if (value !== undefined) {
    const normalized = value.toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }

    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }

    throw new ValidationError(`Option --${key} must be true or false`);
  }

  return options.flags.has(key);
}

async function readJsonArg(value: string): Promise<unknown> {
  if (value.trim().startsWith("{")) {
    return JSON.parse(value);
  }

  return readJsonFile(value);
}

async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function objectArg(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError("Tool arguments must be a JSON object");
  }

  return value as Record<string, unknown>;
}

function printHelp(): void {
  console.log(`illustrator-agent-bridge

Commands:
  mcp:list-tools [--url URL] [--token TOKEN]
  mcp:call TOOL [JSON_OR_PATH] [--url URL] [--token TOKEN]
  mcp:serve
  jsx:ping [--message TEXT] [--root DIR]
  jsx:cartoon [SCENE_JSON_PATH] [--root DIR]
  jsx:export --output PATH [--format pdf|svg|png|jpg] [--root DIR]
  plan:cartoon PROMPT [--width N] [--height N] [--title TEXT] [--root DIR] [--corpus PATH]
  workflow:cartoon PROMPT --output PATH [--format pdf|svg|png|jpg] [--root DIR] [--corpus PATH]
  workflow:execute-cartoon PROMPT --output PATH [--format pdf|svg|png|jpg] [--dry-run] [--no-wait] [--skip-qa] [--platform auto|macos|windows|wsl|linux] [--app PATH_OR_NAME] [--root DIR] [--corpus PATH] [--min-nonblank-ratio N]
  job:status JOB_ID [--root DIR]
  job:wait JOB_ID [--timeout-ms N] [--interval-ms N] [--root DIR]
  job:launch JOB_ID [--platform auto|macos|windows|wsl|linux] [--app PATH_OR_NAME] [--dry-run] [--root DIR]
  qa:export PATH [--format pdf|svg|png|jpg] [--min-bytes N] [--min-width N] [--min-height N] [--min-nonblank-ratio N]
  serve [--host 127.0.0.1] [--port 4317] [--root DIR]
  semantic:search QUERY [--limit N] [--corpus PATH]

Environment:
  ILLUSTRATOR_MCP_URL       Illustrator Beta MCP URL, for example http://localhost:18412/v1/mcp
  ILLUSTRATOR_MCP_TOKEN     Bearer key copied from Illustrator Beta MCP & Tools
  ILLUSTRATOR_AGENT_BRIDGE_ROOT  Generated job/result root, default ./var
  ILLUSTRATOR_SEMANTIC_CORPUS    Semantic corpus JSON path, default ./data/semantic-corpus.json
`);
}

main(process.argv.slice(2)).catch((error) => {
  const expected =
    error instanceof ValidationError ||
    error instanceof McpConfigError ||
    error instanceof JobResultError ||
    error instanceof ExportQaError ||
    error instanceof LaunchJobError;
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = expected ? 2 : 1;
});

function optionalExportFormat(input: string | undefined): "pdf" | "svg" | "png" | "jpg" | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = input.toLowerCase();
  if (value !== "pdf" && value !== "svg" && value !== "png" && value !== "jpg") {
    throw new ValidationError("format must be pdf, svg, png, or jpg");
  }

  return value;
}

function optionalLaunchPlatform(input: string | undefined): LaunchPlatform | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = input.toLowerCase();
  if (value !== "auto" && value !== "macos" && value !== "windows" && value !== "wsl" && value !== "linux") {
    throw new ValidationError("platform must be auto, macos, windows, wsl, or linux");
  }

  return value;
}
