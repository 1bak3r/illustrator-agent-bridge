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
    assert.ok(listed.tools.some((tool) => tool.name === "inspect_vector_shape_files"));
    assert.ok(listed.tools.some((tool) => tool.name === "detect_illustrator_desktop"));
    assert.ok(listed.tools.some((tool) => tool.name === "probe_illustrator_communication"));
    assert.ok(listed.tools.some((tool) => tool.name === "drive_illustrator_mouse"));
    assert.ok(listed.tools.some((tool) => tool.name === "prepare_cartoon_publication_workflow"));
    assert.ok(listed.tools.some((tool) => tool.name === "execute_cartoon_publication_workflow"));
    assert.ok(listed.tools.some((tool) => tool.name === "prepare_object_shape_workflow"));
    assert.ok(listed.tools.some((tool) => tool.name === "execute_object_shape_workflow"));
    assert.ok(listed.tools.some((tool) => tool.name === "plan_cartoon_scene_job"));
    assert.ok(listed.tools.some((tool) => tool.name === "plan_scientific_concept_scene_job"));
    assert.ok(listed.tools.some((tool) => tool.name === "plan_object_shape_scene_job"));
    assert.ok(listed.tools.some((tool) => tool.name === "guard_object_shape_scene"));
    assert.ok(listed.tools.some((tool) => tool.name === "bridge_create_ping_job"));
    assert.ok(listed.tools.some((tool) => tool.name === "bridge_create_cartoon_scene_job"));
    assert.ok(listed.tools.some((tool) => tool.name === "bridge_create_export_job"));
    assert.ok(listed.tools.some((tool) => tool.name === "bridge_launch_job"));
    assert.ok(listed.tools.some((tool) => tool.name === "bridge_run_job_via_com"));
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

    const svgPath = join(root, "mcp-cat.svg");
    await writeFile(svgPath, `<svg><ellipse id="cat-head"/><path id="cat-tail" d="M0 0 C5 5 8 8 10 0"/></svg>`, "utf8");
    const inspectVectorResult = await client.callTool({
      name: "inspect_vector_shape_files",
      arguments: {
        paths: [svgPath]
      }
    });
    const inspectVectorContent = inspectVectorResult.content as Array<{ type: string; text?: string }>;
    const inspectVectorBody = JSON.parse(inspectVectorContent[0]?.text ?? "");
    assert.equal(inspectVectorBody.ok, true);
    assert.equal(inspectVectorBody.items[0].kind, "shape_combination");
    assert.match(inspectVectorBody.items[0].text, /cat-tail/);

    const probeResult = await client.callTool({
      name: "probe_illustrator_communication",
      arguments: {
        root,
        platform: "macos",
        appPath: "Adobe Illustrator",
        dryRun: true
      }
    });
    const probeContent = probeResult.content as Array<{ type: string; text?: string }>;
    const probeBody = JSON.parse(probeContent[0]?.text ?? "");
    assert.equal(probeBody.ok, true);
    assert.equal(probeBody.launch.dryRun, true);

    const mouseResult = await client.callTool({
      name: "drive_illustrator_mouse",
      arguments: {
        platform: "wsl",
        action: "move",
        x: 0.5,
        y: 0.5,
        dryRun: true
      }
    });
    const mouseContent = mouseResult.content as Array<{ type: string; text?: string }>;
    const mouseBody = JSON.parse(mouseContent[0]?.text ?? "");
    assert.equal(mouseBody.ok, true);
    assert.equal(mouseBody.action, "dry-run");
    assert.match(mouseBody.stdout, /SetCursorPos/);

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

    const runComResult = await client.callTool({
      name: "bridge_run_job_via_com",
      arguments: {
        jobId: body.job.id,
        root,
        platform: "wsl",
        dryRun: true
      }
    });
    const runComContent = runComResult.content as Array<{ type: string; text?: string }>;
    const runComBody = JSON.parse(runComContent[0]?.text ?? "");
    assert.equal(runComBody.ok, true);
    assert.equal(runComBody.dryRun, true);
    assert.equal(runComBody.command.command, "powershell.exe");

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

    const scientificPlanResult = await client.callTool({
      name: "plan_scientific_concept_scene_job",
      arguments: {
        prompt: "polymer membrane electron transfer catalytic concept",
        root
      }
    });
    const scientificPlanContent = scientificPlanResult.content as Array<{ type: string; text?: string }>;
    const scientificPlanBody = JSON.parse(scientificPlanContent[0]?.text ?? "");
    assert.equal(scientificPlanBody.ok, true);
    assert.equal(scientificPlanBody.plan.qa.ok, true);
    assert.ok(scientificPlanBody.plan.evidence.length > 0);
    assert.match(scientificPlanBody.job.jobPath, /jobs\/.+\.jsx$/);

    const objectPlanResult = await client.callTool({
      name: "plan_object_shape_scene_job",
      arguments: {
        prompt: "full cat icon",
        root
      }
    });
    const objectPlanContent = objectPlanResult.content as Array<{ type: string; text?: string }>;
    const objectPlanBody = JSON.parse(objectPlanContent[0]?.text ?? "");
    assert.equal(objectPlanBody.ok, true);
    assert.equal(objectPlanBody.plan.target, "cat");
    assert.equal(objectPlanBody.plan.guard.ok, true);
    assert.match(objectPlanBody.job.jobPath, /jobs\/.+\.jsx$/);

    const guardResult = await client.callTool({
      name: "guard_object_shape_scene",
      arguments: {
        target: "cat",
        scene: objectPlanBody.plan.scene,
        prompt: "full cat icon"
      }
    });
    const guardContent = guardResult.content as Array<{ type: string; text?: string }>;
    const guardBody = JSON.parse(guardContent[0]?.text ?? "");
    assert.equal(guardBody.ok, true);
    assert.equal(guardBody.guard.nextPrompt, null);

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

    const objectWorkflowResult = await client.callTool({
      name: "prepare_object_shape_workflow",
      arguments: {
        prompt: "secure padlock icon",
        outputPath: "var/exports/mcp-object-lock.svg",
        format: "svg",
        maxGuardIterations: 3,
        root
      }
    });
    const objectWorkflowContent = objectWorkflowResult.content as Array<{ type: string; text?: string }>;
    const objectWorkflowBody = JSON.parse(objectWorkflowContent[0]?.text ?? "");
    assert.equal(objectWorkflowBody.ok, true);
    assert.equal(objectWorkflowBody.plan.target, "lock");
    assert.equal(objectWorkflowBody.plan.guard.ok, true);
    assert.equal(objectWorkflowBody.guardIterations.length, 1);
    assert.equal(objectWorkflowBody.guardIterations[0].guardOk, true);
    assert.equal(objectWorkflowBody.runbook.length, 5);

    const objectExecutionResult = await client.callTool({
      name: "execute_object_shape_workflow",
      arguments: {
        prompt: "simple house key icon",
        outputPath: "var/exports/mcp-object-key.png",
        format: "png",
        root,
        platform: "wsl",
        runMode: "com",
        maxGuardIterations: 3,
        dryRun: true
      }
    });
    const objectExecutionContent = objectExecutionResult.content as Array<{ type: string; text?: string }>;
    const objectExecutionBody = JSON.parse(objectExecutionContent[0]?.text ?? "");
    assert.equal(objectExecutionBody.ok, true);
    assert.equal(objectExecutionBody.runMode, "com");
    assert.equal(objectExecutionBody.workflow.plan.guard.ok, true);
    assert.equal(objectExecutionBody.workflow.guardIterations.length, 1);
    assert.equal(objectExecutionBody.workflow.guardIterations[0].guardOk, true);
    assert.equal(objectExecutionBody.sceneLaunch.command.command, "powershell.exe");

    const exportSvgPath = join(root, "figure.svg");
    await writeFile(exportSvgPath, `<svg width="720" height="480"><rect width="720" height="480"/></svg>`, "utf8");
    const qaResult = await client.callTool({
      name: "qa_export_artifact",
      arguments: {
        path: exportSvgPath,
        minBytes: 1,
        minNonBlankRatio: 0.001
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
