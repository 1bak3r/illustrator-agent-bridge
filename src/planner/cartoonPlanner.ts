import type { CartoonScene, SceneElement } from "../bridge/types.js";
import { searchCorpus } from "../semantic/search.js";
import type { SemanticItem, SemanticSearchResult } from "../semantic/types.js";
import { qaCartoonScene, recommendedExportFormats, type SceneQaReport } from "./sceneQa.js";

export interface CartoonPlanOptions {
  width?: number;
  height?: number;
  title?: string;
  evidenceLimit?: number;
}

export interface CartoonPlan {
  prompt: string;
  planner: "deterministic" | "openai";
  evidence: SemanticSearchResult[];
  scene: CartoonScene;
  qa: SceneQaReport;
  recommendedExports: string[];
  notes: string[];
}

export function planCartoonScene(prompt: string, corpus: SemanticItem[], options: CartoonPlanOptions = {}): CartoonPlan {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new Error("Prompt is required to plan a cartoon scene.");
  }

  const evidence = searchCorpus(trimmedPrompt, corpus, { limit: options.evidenceLimit ?? 6 });
  const scene = buildScene(trimmedPrompt, options);
  const qa = qaCartoonScene(scene);

  return {
    prompt: trimmedPrompt,
    planner: "deterministic",
    evidence,
    scene,
    qa,
    recommendedExports: recommendedExportFormats(scene),
    notes: [
      "This is a deterministic first-pass plan. A stronger LLM planner should revise the scene using retrieved evidence before final Illustrator execution.",
      "Run the generated JSX in Illustrator, export PDF/SVG, then inspect visual output before treating artwork as publication-ready."
    ]
  };
}

function buildScene(prompt: string, options: CartoonPlanOptions): CartoonScene {
  const width = options.width ?? 720;
  const height = options.height ?? 480;
  const lower = prompt.toLowerCase();
  const wantsLab = /\b(lab|laboratory|scientist|chemistry|flask|beaker)\b/.test(lower);
  const title = options.title ?? titleFromPrompt(prompt);

  return {
    document: {
      title,
      width,
      height,
      colorMode: "RGB"
    },
    elements: wantsLab ? labScene(width, height, prompt) : genericExplainerScene(width, height, prompt)
  };
}

function labScene(width: number, height: number, prompt: string): SceneElement[] {
  const scaleX = width / 720;
  const scaleY = height / 480;
  const scale = (value: number) => Math.round(value * Math.min(scaleX, scaleY));
  const x = (value: number) => Math.round(value * scaleX);
  const y = (value: number) => Math.round(value * scaleY);

  return [
    rect("background", 0, 0, width, height, "#F7F2E8", null, 0),
    ellipse("soft blue context window", x(452), y(55), scale(188), scale(128), "#B7D9E8", "#243845", 3),
    rect("workbench", x(78), y(328), x(564), scale(44), "#5E7485", "#243845", 3),
    ellipse("scientist head", x(186), y(106), scale(126), scale(126), "#F2C2A0", "#1D1B1B", 4),
    ellipse("left goggle lens", x(214), y(152), scale(30), scale(25), "#FFFFFF", "#1D1B1B", 3),
    ellipse("right goggle lens", x(258), y(152), scale(30), scale(25), "#FFFFFF", "#1D1B1B", 3),
    line("goggle bridge", x(244), y(165), x(258), y(165), "#1D1B1B", 3),
    polygon(
      "white lab coat",
      [
        [x(150), y(292)],
        [x(210), y(224)],
        [x(296), y(224)],
        [x(356), y(292)],
        [x(330), y(352)],
        [x(170), y(352)]
      ],
      "#FFFFFF",
      "#1D1B1B",
      4
    ),
    ellipse("round reaction flask", x(420), y(238), scale(96), scale(96), "#8DD6C8", "#1D1B1B", 4, 78),
    rect("flask neck", x(455), y(192), scale(26), scale(62), "#8DD6C8", "#1D1B1B", 4, 78),
    ellipse("reaction bubble one", x(506), y(156), scale(28), scale(28), "#F5D04C", "#1D1B1B", 3),
    ellipse("reaction bubble two", x(540), y(112), scale(42), scale(42), "#FF8A65", "#1D1B1B", 3),
    text("figure caption", x(104), y(412), captionFromPrompt(prompt), Math.max(16, scale(22)), "#243845")
  ];
}

function genericExplainerScene(width: number, height: number, prompt: string): SceneElement[] {
  return [
    rect("background", 0, 0, width, height, "#F7F2E8", null, 0),
    ellipse("central subject", Math.round(width * 0.32), Math.round(height * 0.18), 180, 150, "#8DD6C8", "#1D1B1B", 4),
    rect("supporting panel", Math.round(width * 0.54), Math.round(height * 0.22), 160, 110, "#FFFFFF", "#243845", 3),
    line("visual connection", Math.round(width * 0.46), Math.round(height * 0.38), Math.round(width * 0.56), Math.round(height * 0.36), "#1D1B1B", 3),
    text("figure caption", Math.round(width * 0.13), Math.round(height * 0.85), captionFromPrompt(prompt), 22, "#243845")
  ];
}

function rect(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  stroke: string | null,
  strokeWidth: number,
  opacity = 100
): SceneElement {
  return { type: "rect", name, x, y, width, height, style: { fill, stroke, strokeWidth, opacity } };
}

function ellipse(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  stroke: string,
  strokeWidth: number,
  opacity = 100
): SceneElement {
  return { type: "ellipse", name, x, y, width, height, style: { fill, stroke, strokeWidth, opacity } };
}

function line(name: string, x: number, y: number, x2: number, y2: number, stroke: string, strokeWidth: number): SceneElement {
  return { type: "line", name, x, y, x2, y2, style: { stroke, strokeWidth } };
}

function polygon(name: string, points: number[][], fill: string, stroke: string, strokeWidth: number): SceneElement {
  return {
    type: "polygon",
    name,
    x: 0,
    y: 0,
    points: points.map(([pointX, pointY]) => ({ x: pointX, y: pointY })),
    style: { fill, stroke, strokeWidth }
  };
}

function text(name: string, x: number, y: number, content: string, size: number, fill: string): SceneElement {
  return {
    type: "text",
    name,
    x,
    y,
    text: content,
    size,
    style: { fill, stroke: null }
  };
}

function titleFromPrompt(prompt: string): string {
  const cleaned = prompt.replace(/[^a-z0-9 ]+/gi, " ").trim().replace(/\s+/g, " ");
  const title = cleaned.length > 0 ? cleaned : "Agent planned cartoon";
  return title.length > 72 ? `${title.slice(0, 69)}...` : title;
}

function captionFromPrompt(prompt: string): string {
  const title = titleFromPrompt(prompt);
  return title.length > 48 ? `${title.slice(0, 45)}...` : title;
}
