import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
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
    assert.ok(listed.tools.some((tool) => tool.name === "plan_cartoon_scene_job"));
    assert.ok(listed.tools.some((tool) => tool.name === "bridge_create_ping_job"));
    assert.ok(listed.tools.some((tool) => tool.name === "bridge_create_cartoon_scene_job"));
    assert.ok(listed.tools.some((tool) => tool.name === "bridge_create_export_job"));
    assert.ok(listed.tools.some((tool) => tool.name === "bridge_get_job_status"));
    assert.ok(listed.tools.some((tool) => tool.name === "bridge_wait_for_job_result"));

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
  } finally {
    await client.close();
    await server.close();
  }
});
