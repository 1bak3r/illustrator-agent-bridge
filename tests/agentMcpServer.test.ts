import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAgentMcpServer } from "../src/agent/mcpServer.js";

test("agent MCP server exposes and calls bridge job tools", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-mcp-"));
  const server = createAgentMcpServer();
  const client = new Client({ name: "test-client", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  try {
    const listed = await client.listTools();
    assert.ok(listed.tools.some((tool) => tool.name === "semantic_search_visual_knowledge"));
    assert.ok(listed.tools.some((tool) => tool.name === "prepare_cartoon_publication_workflow"));
    assert.ok(listed.tools.some((tool) => tool.name === "execute_cartoon_publication_workflow"));
    assert.ok(listed.tools.some((tool) => tool.name === "plan_cartoon_scene_job"));
    assert.ok(listed.tools.some((tool) => tool.name === "bridge_create_ping_job"));
    assert.ok(listed.tools.some((tool) => tool.name === "bridge_create_cartoon_scene_job"));
    assert.ok(listed.tools.some((tool) => tool.name === "bridge_create_export_job"));
    assert.ok(listed.tools.some((tool) => tool.name === "bridge_launch_job"));
    assert.ok(listed.tools.some((tool) => tool.name === "bridge_get_job_status"));
    assert.ok(listed.tools.some((tool) => tool.name === "bridge_wait_for_job_result"));
    assert.ok(listed.tools.some((tool) => tool.name === "qa_export_artifact"));

    const searchResult = await client.callTool({
      name: "semantic_search_visual_knowledge",
      arguments: {
        query: "cartoon lab flask",
        limit: 2
      }
    });
    const searchContent = searchResult.content as Array<{ type: string; text?: string }>;
    const searchBody = JSON.parse(searchContent[0]?.text ?? "");
    assert.equal(searchBody.ok, true);
    assert.equal(searchBody.results[0].item.kind, "object_semantics");

    const result = await client.callTool({
      name: "bridge_create_ping_job",
      arguments: {
        message: "from mcp test",
        root
      }
    });

    assert.equal(result.isError, undefined);
    const content = result.content as Array<{ type: string; text?: string }>;
    assert.equal(content[0]?.type, "text");
    const body = JSON.parse(content[0]?.text ?? "");
    assert.equal(body.ok, true);
    assert.match(body.job.jobPath, /jobs\/.+\.jsx$/);

    const launchResult = await client.callTool({
      name: "bridge_launch_job",
      arguments: {
        jobId: body.job.id,
        root,
        platform: "macos",
        dryRun: true
      }
    });
    const launchContent = launchResult.content as Array<{ type: string; text?: string }>;
    const launchBody = JSON.parse(launchContent[0]?.text ?? "");
    assert.equal(launchBody.ok, true);
    assert.equal(launchBody.dryRun, true);
    assert.equal(launchBody.command.command, "open");

    const planResult = await client.callTool({
      name: "plan_cartoon_scene_job",
      arguments: {
        prompt: "cartoon lab scientist with flask",
        root
      }
    });
    const planContent = planResult.content as Array<{ type: string; text?: string }>;
    const planBody = JSON.parse(planContent[0]?.text ?? "");
    assert.equal(planBody.ok, true);
    assert.equal(planBody.plan.qa.ok, true);
    assert.match(planBody.job.jobPath, /jobs\/.+\.jsx$/);

    const workflowResult = await client.callTool({
      name: "prepare_cartoon_publication_workflow",
      arguments: {
        prompt: "cartoon lab scientist with flask",
        outputPath: "var/exports/mcp-workflow.pdf",
        root
      }
    });
    const workflowContent = workflowResult.content as Array<{ type: string; text?: string }>;
    const workflowBody = JSON.parse(workflowContent[0]?.text ?? "");
    assert.equal(workflowBody.ok, true);
    assert.equal(workflowBody.runbook.length, 4);

    const executionResult = await client.callTool({
      name: "execute_cartoon_publication_workflow",
      arguments: {
        prompt: "cartoon lab scientist with flask",
        outputPath: "var/exports/mcp-execute.svg",
        format: "svg",
        root,
        platform: "macos",
        dryRun: true
      }
    });
    const executionContent = executionResult.content as Array<{ type: string; text?: string }>;
    const executionBody = JSON.parse(executionContent[0]?.text ?? "");
    assert.equal(executionBody.ok, true);
    assert.equal(executionBody.dryRun, true);
    assert.equal(executionBody.sceneLaunch.dryRun, true);

    const svgPath = join(root, "figure.svg");
    await writeFile(svgPath, `<svg width="720" height="480"><rect width="720" height="480"/></svg>`, "utf8");
    const qaResult = await client.callTool({
      name: "qa_export_artifact",
      arguments: {
        path: svgPath,
        minBytes: 1
      }
    });
    const qaContent = qaResult.content as Array<{ type: string; text?: string }>;
    const qaBody = JSON.parse(qaContent[0]?.text ?? "");
    assert.equal(qaBody.ok, true);
  } finally {
    await client.close();
    await server.close();
  }
});
