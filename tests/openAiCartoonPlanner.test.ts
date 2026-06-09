import test from "node:test";
import assert from "node:assert/strict";
import { planCartoonSceneWithOpenAI, OpenAiPlannerError } from "../src/planner/openAiCartoonPlanner.js";
import type { SemanticItem } from "../src/semantic/types.js";

const corpus: SemanticItem[] = [
  {
    id: "object.round-flask.cartoon",
    kind: "object_semantics",
    title: "Round flask",
    text: "A round flask reads well with a narrow neck, liquid in the lower half, and bubbles.",
    tags: ["flask", "lab"]
  },
  {
    id: "style.publication-cartoon-vector",
    kind: "style_reference",
    title: "Publication vector cartoon",
    text: "Use consistent strokes, named layers, high contrast, and large simple forms.",
    tags: ["publication", "cartoon"]
  }
];

test("planCartoonSceneWithOpenAI requests structured scene output and validates the result", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const responsePayload = {
    model: "gpt-test",
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              scene: {
                document: {
                  title: "LLM planned lab scene",
                  width: 720,
                  height: 480,
                  colorMode: "RGB"
                },
                elements: [
                  element("rect", "background", 0, 0, { width: 720, height: 480, fill: "#FFFFFF", stroke: null, strokeWidth: 0 }),
                  element("ellipse", "scientist head", 180, 100, { width: 120, height: 120, fill: "#F2C2A0", stroke: "#111111" }),
                  element("rect", "lab coat", 170, 235, { width: 140, height: 120, fill: "#F7F7F7", stroke: "#111111" }),
                  element("ellipse", "flask body", 420, 245, { width: 95, height: 95, fill: "#8DD6C8", stroke: "#111111" }),
                  element("text", "caption", 96, 410, { text: "cartoon lab scientist with flask", size: 22, fill: "#243845", stroke: null })
                ]
              },
              notes: ["Used retrieved flask and publication style evidence."]
            })
          }
        ]
      }
    ]
  };

  const fetchImpl: typeof fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify(responsePayload), { status: 200, headers: { "content-type": "application/json" } });
  };

  const plan = await planCartoonSceneWithOpenAI("cartoon lab scientist with flask", corpus, {
    apiKey: "test-key",
    model: "gpt-test",
    fetch: fetchImpl
  });

  assert.equal(plan.planner, "openai");
  assert.equal(plan.qa.ok, true);
  assert.equal(plan.scene.elements.some((item) => item.name === "flask body"), true);
  assert.equal((requestBody?.text as { format?: { type?: string; strict?: boolean } }).format?.type, "json_schema");
  assert.equal((requestBody?.text as { format?: { strict?: boolean } }).format?.strict, true);
  assert.match(JSON.stringify(requestBody), /object.round-flask.cartoon/);
});

test("planCartoonSceneWithOpenAI requires an API key", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    await assert.rejects(() => planCartoonSceneWithOpenAI("cartoon lab scientist", corpus), OpenAiPlannerError);
  } finally {
    if (previousKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousKey;
    }
  }
});

function element(
  type: "rect" | "ellipse" | "text",
  name: string,
  x: number,
  y: number,
  options: { width?: number; height?: number; text?: string; size?: number; fill: string; stroke: string | null; strokeWidth?: number }
) {
  return {
    type,
    name,
    x,
    y,
    width: options.width ?? null,
    height: options.height ?? null,
    x2: null,
    y2: null,
    text: options.text ?? null,
    size: options.size ?? null,
    font: null,
    points: null,
    style: {
      fill: options.fill,
      stroke: options.stroke,
      strokeWidth: options.strokeWidth ?? 4,
      opacity: 100
    }
  };
}
