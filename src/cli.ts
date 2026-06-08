#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createGeneratedJob } from "./bridge/jobs.js";
import { generatedJobSummary } from "./bridge/jsxGenerator.js";
import { startBridgeServer } from "./bridge/server.js";
import { normalizeCommand, normalizeScene, ValidationError } from "./bridge/validation.js";
import { callIllustratorTool, getIllustratorMcpConfig, listIllustratorTools, McpConfigError } from "./mcp/illustratorClient.js";

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;

  switch (command) {
    case "mcp:list-tools":
      await listTools(rest);
      return;
    case "mcp:call":
      await callTool(rest);
      return;
    case "jsx:ping":
      await makePing(rest);
      return;
    case "jsx:cartoon":
      await makeCartoon(rest);
      return;
    case "serve":
      await serve(rest);
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

interface ParsedOptions {
  positionals: string[];
  values: Map<string, string>;
}

function parseOptions(args: string[]): ParsedOptions {
  const positionals: string[] = [];
  const values = new Map<string, string>();

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
      throw new ValidationError(`Option --${key} requires a value`);
    }

    values.set(key, next);
    index += 1;
  }

  return { positionals, values };
}

function optionValue(options: ParsedOptions, key: string): string | undefined {
  return options.values.get(key);
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
  jsx:ping [--message TEXT] [--root DIR]
  jsx:cartoon [SCENE_JSON_PATH] [--root DIR]
  serve [--host 127.0.0.1] [--port 4317] [--root DIR]

Environment:
  ILLUSTRATOR_MCP_URL       Illustrator Beta MCP URL, for example http://localhost:18412/v1/mcp
  ILLUSTRATOR_MCP_TOKEN     Bearer key copied from Illustrator Beta MCP & Tools
  ILLUSTRATOR_AGENT_BRIDGE_ROOT  Generated job/result root, default ./var
`);
}

main(process.argv.slice(2)).catch((error) => {
  const expected = error instanceof ValidationError || error instanceof McpConfigError;
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = expected ? 2 : 1;
});
