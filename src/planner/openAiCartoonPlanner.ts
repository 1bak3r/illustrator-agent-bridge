import { normalizeScene } from "../bridge/validation.js";
import { searchCorpus } from "../semantic/search.js";
import type { SemanticItem, SemanticSearchResult } from "../semantic/types.js";
import { qaCartoonScene, recommendedExportFormats } from "./sceneQa.js";
import type { CartoonPlan, CartoonPlanOptions } from "./cartoonPlanner.js";

export type PlannerMode = "deterministic" | "auto" | "openai";

export interface OpenAiCartoonPlannerOptions extends CartoonPlanOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export class OpenAiPlannerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAiPlannerError";
  }
}

const DEFAULT_MODEL = "gpt-5.5";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export function hasOpenAiPlannerConfig(options: Pick<OpenAiCartoonPlannerOptions, "apiKey"> = {}): boolean {
  return Boolean(options.apiKey ?? process.env.OPENAI_API_KEY);
}

export async function planCartoonSceneWithOpenAI(
  prompt: string,
  corpus: SemanticItem[],
  options: OpenAiCartoonPlannerOptions = {}
): Promise<CartoonPlan> {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new OpenAiPlannerError("Prompt is required to plan a cartoon scene.");
  }

  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new OpenAiPlannerError("Set OPENAI_API_KEY to use the OpenAI cartoon planner.");
  }

  const width = options.width ?? 720;
  const height = options.height ?? 480;
  const evidence = searchCorpus(trimmedPrompt, corpus, { limit: options.evidenceLimit ?? 6 });
  const requestBody = buildResponseRequest(trimmedPrompt, evidence, {
    width,
    height,
    title: options.title,
    model: options.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL
  });
  const response = await callResponsesApi(requestBody, {
    apiKey,
    baseUrl: options.baseUrl ?? process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL,
    timeoutMs: options.timeoutMs,
    fetch: options.fetch
  });
  const payload = parsePlannerPayload(extractOutputText(response));
  const scene = normalizeScene(stripSchemaNulls(payload.scene));
  const qa = qaCartoonScene(scene);

  return {
    prompt: trimmedPrompt,
    planner: "openai",
    evidence,
    scene,
    qa,
    recommendedExports: recommendedExportFormats(scene),
    notes: [
      ...payload.notes,
      `OpenAI planner model: ${String(response.model ?? requestBody.model)}.`,
      "The LLM scene was validated against the bridge scene contract before JSX generation."
    ]
  };
}

function buildResponseRequest(
  prompt: string,
  evidence: SemanticSearchResult[],
  options: { width: number; height: number; title?: string; model: string }
): Record<string, unknown> {
  return {
    model: options.model,
    store: false,
    reasoning: { effort: "low" },
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "illustrator_cartoon_scene_plan",
        strict: true,
        schema: plannerResponseSchema()
      }
    },
    instructions:
      "Create a publication-style vector cartoon scene for Adobe Illustrator. Use the provided semantic evidence. " +
      "Return only the structured scene. Use the top-left coordinate system with dimensions in points. " +
      "Keep the scene simple, readable, named, high contrast, and made only from supported element types.",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify(
              {
                prompt,
                document: {
                  title: options.title ?? titleFromPrompt(prompt),
                  width: options.width,
                  height: options.height,
                  colorMode: "RGB"
                },
                evidence: evidence.map((result) => ({
                  id: result.item.id,
                  kind: result.item.kind,
                  title: result.item.title,
                  text: result.item.text,
                  tags: result.item.tags ?? []
                })),
                constraints: [
                  "Include a background element.",
                  "Use 5 to 30 total elements.",
                  "Use named elements.",
                  "Use fill colors as #RRGGBB or null.",
                  "Use stroke colors as #RRGGBB or null.",
                  "For fields not used by an element type, output null."
                ]
              },
              null,
              2
            )
          }
        ]
      }
    ]
  };
}

async function callResponsesApi(
  body: Record<string, unknown>,
  options: { apiKey: string; baseUrl: string; timeoutMs?: number; fetch?: typeof fetch }
): Promise<Record<string, unknown>> {
  const fetchImpl = options.fetch ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000);

  try {
    const response = await fetchImpl(`${options.baseUrl.replace(/\/+$/, "")}/responses`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();

    if (!response.ok) {
      throw new OpenAiPlannerError(`OpenAI Responses API failed with ${response.status}: ${text.slice(0, 1000)}`);
    }

    return JSON.parse(text) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof OpenAiPlannerError) {
      throw error;
    }

    throw new OpenAiPlannerError(`OpenAI planner request failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

function extractOutputText(response: Record<string, unknown>): string {
  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  const output = response.output;
  if (!Array.isArray(output)) {
    throw new OpenAiPlannerError("OpenAI response did not include output items.");
  }

  const parts: string[] = [];
  for (const item of output) {
    if (!isObject(item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (!isObject(content)) {
        continue;
      }

      if (content.type === "refusal" && typeof content.refusal === "string") {
        throw new OpenAiPlannerError(`OpenAI planner refused the request: ${content.refusal}`);
      }

      if (content.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }

  if (parts.length === 0) {
    throw new OpenAiPlannerError("OpenAI response did not include output_text.");
  }

  return parts.join("");
}

function parsePlannerPayload(text: string): { scene: unknown; notes: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    throw new OpenAiPlannerError(`OpenAI planner output was not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!isObject(parsed)) {
    throw new OpenAiPlannerError("OpenAI planner output must be a JSON object.");
  }

  const notes = Array.isArray(parsed.notes) ? parsed.notes.filter((note): note is string => typeof note === "string") : [];
  return {
    scene: parsed.scene,
    notes
  };
}

function stripSchemaNulls(value: unknown, path: string[] = []): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => stripSchemaNulls(item, [...path, String(index)]));
  }

  if (!isObject(value)) {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (child === null && !(path.at(-1) === "style" && (key === "fill" || key === "stroke"))) {
      continue;
    }

    output[key] = stripSchemaNulls(child, [...path, key]);
  }

  return output;
}

function plannerResponseSchema(): Record<string, unknown> {
  const nullableNumber = ["number", "null"];
  const nullableString = ["string", "null"];

  return {
    type: "object",
    additionalProperties: false,
    required: ["scene", "notes"],
    properties: {
      scene: {
        type: "object",
        additionalProperties: false,
        required: ["document", "elements"],
        properties: {
          document: {
            type: "object",
            additionalProperties: false,
            required: ["title", "width", "height", "colorMode"],
            properties: {
              title: { type: "string" },
              width: { type: "number" },
              height: { type: "number" },
              colorMode: { type: "string", enum: ["RGB", "CMYK"] }
            }
          },
          elements: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["type", "name", "x", "y", "width", "height", "x2", "y2", "text", "size", "font", "points", "style"],
              properties: {
                type: { type: "string", enum: ["rect", "ellipse", "line", "polygon", "text"] },
                name: { type: "string" },
                x: { type: "number" },
                y: { type: "number" },
                width: { type: nullableNumber },
                height: { type: nullableNumber },
                x2: { type: nullableNumber },
                y2: { type: nullableNumber },
                text: { type: nullableString },
                size: { type: nullableNumber },
                font: { type: nullableString },
                points: {
                  anyOf: [
                    {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["x", "y"],
                        properties: {
                          x: { type: "number" },
                          y: { type: "number" }
                        }
                      }
                    },
                    { type: "null" }
                  ]
                },
                style: {
                  type: "object",
                  additionalProperties: false,
                  required: ["fill", "stroke", "strokeWidth", "opacity"],
                  properties: {
                    fill: { type: ["string", "null"] },
                    stroke: { type: ["string", "null"] },
                    strokeWidth: { type: nullableNumber },
                    opacity: { type: nullableNumber }
                  }
                }
              }
            }
          }
        }
      },
      notes: {
        type: "array",
        items: { type: "string" }
      }
    }
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function titleFromPrompt(prompt: string): string {
  const cleaned = prompt.replace(/[^a-z0-9 ]+/gi, " ").trim().replace(/\s+/g, " ");
  const title = cleaned.length > 0 ? cleaned : "Agent planned cartoon";
  return title.length > 72 ? `${title.slice(0, 69)}...` : title;
}
