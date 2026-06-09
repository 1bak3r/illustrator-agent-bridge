import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";
import { getGeneratedJobPaths } from "../bridge/files.js";
import { createGeneratedJob } from "../bridge/jobs.js";
import { generatedJobSummary } from "../bridge/jsxGenerator.js";
import { launchJsxJob } from "../bridge/launcher.js";
import { normalizeJobId, readJobStatus, waitForJobResult } from "../bridge/results.js";
import { normalizeScene } from "../bridge/validation.js";
import { callIllustratorTool, getIllustratorMcpConfig, listIllustratorTools } from "../mcp/illustratorClient.js";
import { planCartoonSceneWithMode } from "../planner/plannerRouter.js";
import { inspectExportArtifact } from "../qa/exportQa.js";
import { loadDefaultCorpus, searchCorpus } from "../semantic/search.js";
import { executeCartoonWorkflow } from "../workflow/cartoonExecutor.js";
import { prepareCartoonWorkflow } from "../workflow/cartoonWorkflow.js";

const optionalRootSchema = z.string().min(1).optional();
const optionalUrlSchema = z.string().url().optional();
const optionalTokenSchema = z.string().min(1).optional();
const exportFormatSchema = z.enum(["pdf", "svg", "png", "jpg"]);
const launchPlatformSchema = z.enum(["auto", "macos", "windows", "wsl", "linux"]).optional();
const plannerModeSchema = z.enum(["deterministic", "auto", "openai"]).optional();
const semanticKindSchema = z
  .enum(["object_semantics", "style_reference", "publication_requirement", "document_state", "illustrator_capability"])
  .optional();

export function createAgentMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "illustrator-agent-bridge",
      version: "0.1.0"
    },
    {
      instructions:
        "Use these tools to communicate with Adobe Illustrator through either Illustrator Beta MCP or generated ExtendScript jobs. " +
        "Prefer Illustrator Beta MCP when configured. Use generated JSX jobs when direct MCP is unavailable."
    }
  );

  server.registerTool(
    "semantic_search_visual_knowledge",
    {
      title: "Search Visual Semantics",
      description:
        "Search local visual/object/style/publication knowledge before planning Illustrator artwork. Use this before creating scene jobs.",
      inputSchema: {
        query: z.string().min(1).max(1000),
        limit: z.number().int().min(1).max(25).optional(),
        kind: semanticKindSchema
      }
    },
    async ({ query, limit, kind }) => {
      const corpus = await loadDefaultCorpus();
      const results = searchCorpus(query, corpus, { limit, kind });
      return jsonToolResult({
        ok: true,
        query,
        resultCount: results.length,
        results
      });
    }
  );

  server.registerTool(
    "qa_export_artifact",
    {
      title: "QA Exported Illustrator Artifact",
      description:
        "Inspect an exported Illustrator artifact for publication workflow gates: file size, format signature, dimensions, SVG/PDF structure, and PNG nonblank pixels.",
      inputSchema: {
        path: z.string().min(1).max(1000),
        format: exportFormatSchema.optional(),
        minBytes: z.number().int().min(0).optional(),
        minWidth: z.number().int().min(1).optional(),
        minHeight: z.number().int().min(1).optional(),
        minNonBlankRatio: z.number().min(0).max(1).optional()
      }
    },
    async ({ path, format, minBytes, minWidth, minHeight, minNonBlankRatio }) => {
      const report = await inspectExportArtifact(path, { format, minBytes, minWidth, minHeight, minNonBlankRatio });
      return jsonToolResult({
        ok: report.ok,
        report
      });
    }
  );

  server.registerTool(
    "prepare_cartoon_publication_workflow",
    {
      title: "Prepare Cartoon Publication Workflow",
      description:
        "Prepare a complete fallback workflow: semantic plan, scene JSX job, export JSX job, and runbook for executing those jobs in Illustrator.",
      inputSchema: {
        prompt: z.string().min(1).max(1000),
        outputPath: z.string().min(1).max(1000),
        format: exportFormatSchema.optional(),
        width: z.number().int().min(360).max(14400).optional(),
        height: z.number().int().min(240).max(14400).optional(),
        title: z.string().min(1).max(120).optional(),
        planner: plannerModeSchema,
        model: z.string().min(1).max(120).optional(),
        root: optionalRootSchema
      }
    },
    async ({ prompt, outputPath, format, width, height, title, planner, model, root }) => {
      const workflow = await prepareCartoonWorkflow({
        prompt,
        outputPath,
        format,
        width,
        height,
        title,
        plannerMode: planner,
        openAiModel: model,
        root
      });
      return jsonToolResult(workflow);
    }
  );

  server.registerTool(
    "execute_cartoon_publication_workflow",
    {
      title: "Execute Cartoon Publication Workflow",
      description:
        "Prepare a semantic cartoon workflow, launch scene/export JSX jobs in order, optionally wait for Illustrator result JSON, and run export artifact QA.",
      inputSchema: {
        prompt: z.string().min(1).max(1000),
        outputPath: z.string().min(1).max(1000),
        format: exportFormatSchema.optional(),
        width: z.number().int().min(360).max(14400).optional(),
        height: z.number().int().min(240).max(14400).optional(),
        title: z.string().min(1).max(120).optional(),
        planner: plannerModeSchema,
        model: z.string().min(1).max(120).optional(),
        platform: launchPlatformSchema,
        appPath: z.string().min(1).max(1000).optional(),
        dryRun: z.boolean().optional(),
        waitForResults: z.boolean().optional(),
        timeoutMs: z.number().int().min(0).max(600_000).optional(),
        intervalMs: z.number().int().min(100).max(60_000).optional(),
        skipQa: z.boolean().optional(),
        minBytes: z.number().int().min(0).optional(),
        minWidth: z.number().int().min(1).optional(),
        minHeight: z.number().int().min(1).optional(),
        minNonBlankRatio: z.number().min(0).max(1).optional(),
        root: optionalRootSchema
      }
    },
    async ({
      prompt,
      outputPath,
      format,
      width,
      height,
      title,
      planner,
      model,
      platform: launchPlatform,
      appPath,
      dryRun,
      waitForResults,
      timeoutMs,
      intervalMs,
      skipQa,
      minBytes,
      minWidth,
      minHeight,
      minNonBlankRatio,
      root
    }) => {
      const execution = await executeCartoonWorkflow({
        prompt,
        outputPath,
        format,
        width,
        height,
        title,
        plannerMode: planner,
        openAiModel: model,
        launchPlatform,
        appPath,
        dryRun,
        waitForResults,
        timeoutMs,
        intervalMs,
        skipQa,
        minBytes,
        minWidth,
        minHeight,
        minNonBlankRatio,
        root
      });
      return jsonToolResult(execution);
    }
  );

  server.registerTool(
    "plan_cartoon_scene_job",
    {
      title: "Plan Cartoon Scene and Create JSX Job",
      description:
        "Use local semantic search to plan a first-pass publication-style cartoon scene from a natural-language prompt, QA the scene, and create a JSX job.",
      inputSchema: {
        prompt: z.string().min(1).max(1000),
        width: z.number().int().min(360).max(14400).optional(),
        height: z.number().int().min(240).max(14400).optional(),
        title: z.string().min(1).max(120).optional(),
        planner: plannerModeSchema,
        model: z.string().min(1).max(120).optional(),
        root: optionalRootSchema
      }
    },
    async ({ prompt, width, height, title, planner, model, root }) => {
      const corpus = await loadDefaultCorpus();
      const plan = await planCartoonSceneWithMode(prompt, corpus, { width, height, title, plannerMode: planner, openAiModel: model });
      const job = await createGeneratedJob({ kind: "cartoon_scene", scene: plan.scene }, root);
      return jsonToolResult({
        ok: true,
        plan,
        job: generatedJobSummary(job),
        run: runInstructions(job)
      });
    }
  );

  server.registerTool(
    "bridge_launch_job",
    {
      title: "Launch Illustrator JSX Job",
      description:
        "Ask the host OS to open a generated JSX job in Illustrator or the registered JSX file association, then wait for the job result.",
      inputSchema: {
        jobId: z.string().min(1),
        platform: launchPlatformSchema,
        appPath: z.string().min(1).max(1000).optional(),
        dryRun: z.boolean().optional(),
        root: optionalRootSchema
      }
    },
    async ({ jobId, platform, appPath, dryRun, root }) => {
      const { jobPath } = await getGeneratedJobPaths(normalizeJobId(jobId), root);
      const result = await launchJsxJob(jobPath, { platform, appPath, dryRun, root });
      return jsonToolResult(result);
    }
  );

  server.registerTool(
    "bridge_get_job_status",
    {
      title: "Get Illustrator Job Status",
      description: "Check whether a generated Illustrator JSX job has written its result JSON.",
      inputSchema: {
        jobId: z.string().min(1),
        root: optionalRootSchema
      }
    },
    async ({ jobId, root }) => {
      const status = await readJobStatus(jobId, root);
      return jsonToolResult({
        ok: true,
        job: status
      });
    }
  );

  server.registerTool(
    "bridge_wait_for_job_result",
    {
      title: "Wait for Illustrator Job Result",
      description:
        "Poll for a generated Illustrator JSX job result JSON. Use after an agent or human has run the JSX in Illustrator.",
      inputSchema: {
        jobId: z.string().min(1),
        timeoutMs: z.number().int().min(0).max(600_000).optional(),
        intervalMs: z.number().int().min(100).max(60_000).optional(),
        root: optionalRootSchema
      }
    },
    async ({ jobId, timeoutMs, intervalMs, root }) => {
      const status = await waitForJobResult(jobId, { timeoutMs, intervalMs, root });
      return jsonToolResult({
        ok: true,
        job: status
      });
    }
  );

  server.registerTool(
    "bridge_create_ping_job",
    {
      title: "Create Illustrator Ping JSX Job",
      description:
        "Create a self-contained Illustrator ExtendScript ping job. Run the returned script path in Illustrator with File > Scripts > Other Script, then inspect the returned result path.",
      inputSchema: {
        message: z.string().max(500).optional(),
        root: optionalRootSchema
      }
    },
    async ({ message, root }) => {
      const job = await createGeneratedJob({ kind: "ping", message }, root);
      return jsonToolResult({
        ok: true,
        job: generatedJobSummary(job),
        run: runInstructions(job)
      });
    }
  );

  server.registerTool(
    "bridge_create_cartoon_scene_job",
    {
      title: "Create Illustrator Cartoon Scene JSX Job",
      description:
        "Validate a structured cartoon scene and create an Illustrator ExtendScript job that draws named vector elements and writes a JSON result file.",
      inputSchema: {
        scene: z.unknown(),
        root: optionalRootSchema
      }
    },
    async ({ scene, root }) => {
      const normalizedScene = normalizeScene(scene);
      const job = await createGeneratedJob({ kind: "cartoon_scene", scene: normalizedScene }, root);
      return jsonToolResult({
        ok: true,
        job: generatedJobSummary(job),
        run: runInstructions(job)
      });
    }
  );

  server.registerTool(
    "bridge_create_export_job",
    {
      title: "Create Illustrator Export JSX Job",
      description:
        "Create a JSX job that exports the active Illustrator document to PDF, SVG, PNG, or JPG. Run it after a document exists in Illustrator.",
      inputSchema: {
        format: exportFormatSchema,
        outputPath: z.string().min(1).max(1000),
        root: optionalRootSchema
      }
    },
    async ({ format, outputPath, root }) => {
      const job = await createGeneratedJob({ kind: "export", format, outputPath }, root);
      return jsonToolResult({
        ok: true,
        job: generatedJobSummary(job),
        run: runInstructions(job)
      });
    }
  );

  server.registerTool(
    "illustrator_beta_list_tools",
    {
      title: "List Illustrator Beta MCP Tools",
      description:
        "Connect to Illustrator Beta's built-in MCP server and list the tools exposed by Adobe. Requires ILLUSTRATOR_MCP_URL and usually ILLUSTRATOR_MCP_TOKEN unless passed as arguments.",
      inputSchema: {
        url: optionalUrlSchema,
        token: optionalTokenSchema
      }
    },
    async ({ url, token }) => {
      const config = getIllustratorMcpConfig({ url, token });
      const tools = await listIllustratorTools(config);
      return jsonToolResult({
        ok: true,
        toolCount: tools.length,
        tools
      });
    }
  );

  server.registerTool(
    "illustrator_beta_call_tool",
    {
      title: "Call Illustrator Beta MCP Tool",
      description:
        "Proxy a call to an Illustrator Beta MCP tool. Use only after listing tools and matching the tool's input schema.",
      inputSchema: {
        name: z.string().min(1),
        arguments: z.record(z.string(), z.unknown()).optional(),
        url: optionalUrlSchema,
        token: optionalTokenSchema
      }
    },
    async ({ name, arguments: toolArguments, url, token }) => {
      const config = getIllustratorMcpConfig({ url, token });
      const result = await callIllustratorTool(config, name, toolArguments ?? {});
      return jsonToolResult({
        ok: true,
        result
      });
    }
  );

  server.registerResource(
    "bridge_capabilities",
    "illustrator-agent://capabilities",
    {
      title: "Illustrator Agent Bridge Capabilities",
      description: "Current local bridge capabilities and recommended tool order.",
      mimeType: "application/json"
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              preferredPath: "Illustrator Beta MCP when configured; generated JSX fallback otherwise.",
              tools: [
                "semantic_search_visual_knowledge",
                "prepare_cartoon_publication_workflow",
                "execute_cartoon_publication_workflow",
                "plan_cartoon_scene_job",
                "illustrator_beta_list_tools",
                "illustrator_beta_call_tool",
                "bridge_create_ping_job",
                "bridge_create_cartoon_scene_job",
                "bridge_create_export_job",
                "bridge_launch_job",
                "bridge_get_job_status",
                "bridge_wait_for_job_result",
                "qa_export_artifact"
              ],
              generatedJobContract: {
                runInIllustrator: "File > Scripts > Other Script",
                launchFromDesktop: "bridge_launch_job opens a generated JSX through the host OS when file association or app selection is configured.",
                result: "Each generated JSX job writes a JSON result file.",
                export: "Export jobs require an active Illustrator document.",
                qa: "Run qa_export_artifact after an export job writes ok=true; PNG exports include nonblank pixel analysis."
              }
            },
            null,
            2
          )
        }
      ]
    })
  );

  return server;
}

export async function startAgentMcpStdioServer(): Promise<void> {
  const server = createAgentMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function jsonToolResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

function runInstructions(job: { illustratorJobPath: string; resultPath: string; illustratorResultPath: string }) {
  return {
    illustratorMenu: "File > Scripts > Other Script",
    scriptPath: job.illustratorJobPath,
    resultPath: job.resultPath,
    illustratorResultPath: job.illustratorResultPath
  };
}
