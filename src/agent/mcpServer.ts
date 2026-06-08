import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";
import { createGeneratedJob } from "../bridge/jobs.js";
import { generatedJobSummary } from "../bridge/jsxGenerator.js";
import { normalizeScene } from "../bridge/validation.js";
import { callIllustratorTool, getIllustratorMcpConfig, listIllustratorTools } from "../mcp/illustratorClient.js";
import { planCartoonScene } from "../planner/cartoonPlanner.js";
import { loadDefaultCorpus, searchCorpus } from "../semantic/search.js";

const optionalRootSchema = z.string().min(1).optional();
const optionalUrlSchema = z.string().url().optional();
const optionalTokenSchema = z.string().min(1).optional();
const exportFormatSchema = z.enum(["pdf", "svg", "png", "jpg"]);
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
        root: optionalRootSchema
      }
    },
    async ({ prompt, width, height, title, root }) => {
      const corpus = await loadDefaultCorpus();
      const plan = planCartoonScene(prompt, corpus, { width, height, title });
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
                "plan_cartoon_scene_job",
                "illustrator_beta_list_tools",
                "illustrator_beta_call_tool",
                "bridge_create_ping_job",
                "bridge_create_cartoon_scene_job",
                "bridge_create_export_job"
              ],
              generatedJobContract: {
                runInIllustrator: "File > Scripts > Other Script",
                result: "Each generated JSX job writes a JSON result file.",
                export: "Export jobs require an active Illustrator document."
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
