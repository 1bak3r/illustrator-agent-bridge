import type { CartoonScene, PathPoint, SceneElement } from "../bridge/types.js";
import { searchCorpus } from "../semantic/search.js";
import type { SemanticItem, SemanticSearchResult } from "../semantic/types.js";
import { qaCartoonScene, recommendedExportFormats, type SceneQaReport } from "./sceneQa.js";

export interface ScientificConceptPlanOptions {
  width?: number;
  height?: number;
  title?: string;
  evidenceLimit?: number;
}

export interface ScientificConceptPlan {
  prompt: string;
  planner: "scientific-deterministic";
  conceptQueries: string[];
  evidence: SemanticSearchResult[];
  scene: CartoonScene;
  qa: SceneQaReport;
  recommendedExports: string[];
  notes: string[];
}

interface ScientificFeature {
  id: string;
  label: string;
  query: string;
  pattern: RegExp;
}

const FEATURES: ScientificFeature[] = [
  {
    id: "molecular-assembly",
    label: "molecular assembly",
    query: "molecular self assembly polymer supramolecular network monomer",
    pattern: /\b(molecular|molecule|polymer|monomer|supramolecular|assembly|self[- ]?assembly|network)\b/i
  },
  {
    id: "catalysis",
    label: "catalytic mechanism",
    query: "catalytic reaction cycle catalyst active site surface energy barrier",
    pattern: /\b(catalyst|catalytic|catalysis|reaction|active site|surface|enzyme)\b/i
  },
  {
    id: "membrane-transport",
    label: "membrane transport",
    query: "cell membrane transport bilayer protein channel gradient",
    pattern: /\b(cell|membrane|bilayer|protein|transport|gradient|channel)\b/i
  },
  {
    id: "electron-transfer",
    label: "electron transfer",
    query: "electron transfer charge flow redox donor acceptor energy",
    pattern: /\b(electron|charge|redox|oxidation|reduction|donor|acceptor|energy)\b/i
  },
  {
    id: "phase-separation",
    label: "phase separation",
    query: "phase separation droplet domain condensate interface",
    pattern: /\b(phase|droplet|domain|condensate|separation|interface)\b/i
  },
  {
    id: "biobased-cycle",
    label: "biobased material cycle",
    query: "sustainability biomass lignin soy feedstock polymer circular material",
    pattern: /\b(sustainability|biomass|biobased|bio-based|lignin|soy|feedstock|circular|renewable)\b/i
  }
];

export function planScientificConceptScene(
  prompt: string,
  corpus: SemanticItem[],
  options: ScientificConceptPlanOptions = {}
): ScientificConceptPlan {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new Error("Prompt is required to plan a scientific concept scene.");
  }

  const features = inferFeatures(trimmedPrompt);
  const conceptQueries = buildConceptQueries(trimmedPrompt, features);
  const evidence = collectEvidence(conceptQueries, corpus, options.evidenceLimit ?? 12);
  const scene = buildScientificScene(trimmedPrompt, features, evidence, options);
  const qa = qaCartoonScene(scene);

  return {
    prompt: trimmedPrompt,
    planner: "scientific-deterministic",
    conceptQueries,
    evidence,
    scene,
    qa,
    recommendedExports: recommendedExportFormats(scene),
    notes: [
      `Retrieved ${evidence.length} semantic evidence item(s) across ${conceptQueries.length} query angle(s).`,
      `Activated concept modules: ${features.map((feature) => feature.label).join(", ")}.`,
      "The scene is a deterministic first-pass scientific concept map; inspect exported artwork before publication use."
    ]
  };
}

function inferFeatures(prompt: string): ScientificFeature[] {
  const matched = FEATURES.filter((feature) => feature.pattern.test(prompt));
  if (matched.length > 0) {
    return matched.slice(0, 4);
  }

  return [FEATURES[0], FEATURES[2], FEATURES[3]];
}

function buildConceptQueries(prompt: string, features: ScientificFeature[]): string[] {
  return uniqueStrings([
    prompt,
    "scientific concept mechanism visual metaphor publication",
    "scientific concept figure legibility mechanism",
    ...features.map((feature) => feature.query)
  ]);
}

function collectEvidence(queries: string[], corpus: SemanticItem[], limit: number): SemanticSearchResult[] {
  const byId = new Map<string, SemanticSearchResult>();
  for (const query of queries) {
    for (const result of searchCorpus(query, corpus, { limit: 8 })) {
      const existing = byId.get(result.item.id);
      if (!existing || result.score > existing.score) {
        byId.set(result.item.id, result);
      }
    }
  }

  return [...byId.values()]
    .sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id))
    .slice(0, Math.max(1, Math.min(limit, 25)));
}

function buildScientificScene(
  prompt: string,
  features: ScientificFeature[],
  evidence: SemanticSearchResult[],
  options: ScientificConceptPlanOptions
): CartoonScene {
  const width = options.width ?? 960;
  const height = options.height ?? 640;
  const title = options.title ?? titleFromPrompt(prompt);
  const elements: SceneElement[] = [
    rect("background", 0, 0, width, height, "#F7FAFC", null, 0),
    rect("concept map header", 32, 28, width - 64, 78, "#FFFFFF", "#1F2937", 3),
    text("concept title", 54, 58, title, 24, "#111827"),
    text("semantic evidence summary", 54, 88, evidenceSummary(evidence), 15, "#475569"),
    ...contextMechanismOutcomeFrame(width, height),
    ...evidenceBadges(evidence, width)
  ];

  const moduleSlots = moduleLayout(features.length, width, height);
  features.forEach((feature, index) => {
    const slot = moduleSlots[index];
    if (!slot) {
      return;
    }

    elements.push(...drawModule(feature, slot.x, slot.y, slot.width, slot.height));
  });

  elements.push(
    ...systemFlowArrows(width, height),
    text("visual grammar note", 50, height - 42, "Semantic search -> concept modules -> validated Illustrator vectors", 16, "#334155")
  );

  return {
    document: {
      title,
      width,
      height,
      colorMode: "RGB"
    },
    elements
  };
}

function contextMechanismOutcomeFrame(width: number, height: number): SceneElement[] {
  const top = 132;
  const panelHeight = height - 214;
  const gap = 22;
  const panelWidth = Math.round((width - 100 - gap * 2) / 3);
  return [
    rect("context panel", 50, top, panelWidth, panelHeight, "#E0F2FE", "#0F172A", 3, 55),
    rect("mechanism panel", 50 + panelWidth + gap, top, panelWidth, panelHeight, "#ECFDF5", "#0F172A", 3, 55),
    rect("outcome panel", 50 + (panelWidth + gap) * 2, top, panelWidth, panelHeight, "#FEF3C7", "#0F172A", 3, 55),
    text("context", 70, top + 30, "context", 17, "#0F172A"),
    text("mechanism", 70 + panelWidth + gap, top + 30, "mechanism", 17, "#0F172A"),
    text("outcome", 70 + (panelWidth + gap) * 2, top + 30, "outcome", 17, "#0F172A")
  ];
}

function evidenceBadges(evidence: SemanticSearchResult[], width: number): SceneElement[] {
  const shown = evidence.slice(0, 4);
  const badgeWidth = Math.max(140, Math.floor((width - 100) / Math.max(1, shown.length)) - 10);
  return shown.flatMap((result, index) => {
    const x = 52 + index * (badgeWidth + 10);
    const label = result.item.title.length > 24 ? `${result.item.title.slice(0, 21)}...` : result.item.title;
    return [
      rect(`evidence badge ${index + 1}`, x, 112, badgeWidth, 30, "#FFFFFF", "#64748B", 2, 94),
      text(`evidence label ${index + 1}`, x + 10, 133, label, 14, "#334155")
    ];
  });
}

function moduleLayout(count: number, width: number, height: number): Array<{ x: number; y: number; width: number; height: number }> {
  const top = 178;
  const moduleHeight = Math.min(280, height - 260);
  if (count <= 1) {
    return [{ x: Math.round(width * 0.28), y: top, width: Math.round(width * 0.44), height: moduleHeight }];
  }

  const slotWidth = Math.round((width - 132) / count);
  return Array.from({ length: count }, (_, index) => ({
    x: 58 + index * slotWidth,
    y: top + (index % 2) * 28,
    width: slotWidth - 18,
    height: moduleHeight - (index % 2) * 28
  }));
}

function drawModule(feature: ScientificFeature, x: number, y: number, width: number, height: number): SceneElement[] {
  if (feature.id === "molecular-assembly") {
    return molecularAssemblyModule(x, y, width, height);
  }

  if (feature.id === "catalysis") {
    return catalysisModule(x, y, width, height);
  }

  if (feature.id === "membrane-transport") {
    return membraneModule(x, y, width, height);
  }

  if (feature.id === "electron-transfer") {
    return electronTransferModule(x, y, width, height);
  }

  if (feature.id === "phase-separation") {
    return phaseSeparationModule(x, y, width, height);
  }

  return biobasedCycleModule(x, y, width, height);
}

function molecularAssemblyModule(x: number, y: number, width: number, height: number): SceneElement[] {
  const cx = x + width / 2;
  const chainY = y + height * 0.52;
  return [
    text("molecular assembly label", x + 10, y + 24, "molecular assembly", 15, "#1E3A8A"),
    path("polymer curved backbone", [
      { x: x + 18, y: chainY, rightX: x + 70, rightY: y + 82, pointType: "smooth" },
      { x: cx, y: chainY - 16, leftX: cx - 60, leftY: chainY + 58, rightX: cx + 60, rightY: chainY - 86, pointType: "smooth" },
      { x: x + width - 18, y: chainY, leftX: x + width - 72, leftY: chainY + 70, pointType: "smooth" }
    ], null, "#2563EB", 6, false),
    ...nodeRow("assembly monomer", x + 32, chainY - 20, 5, 36, "#93C5FD", "#1E3A8A"),
    ...bondNetwork("ordered network", cx - 44, y + height - 96, "#A7F3D0", "#065F46")
  ];
}

function catalysisModule(x: number, y: number, width: number, height: number): SceneElement[] {
  const slabY = y + height * 0.58;
  return [
    text("catalysis label", x + 10, y + 24, "catalytic cycle", 15, "#7C2D12"),
    rect("catalyst surface", x + 20, slabY, width - 40, 32, "#94A3B8", "#1F2937", 3),
    ellipse("active site", x + width * 0.45, slabY - 22, 42, 42, "#F97316", "#7C2D12", 4),
    ellipse("reactant molecule a", x + 26, y + 86, 34, 34, "#BFDBFE", "#1E3A8A", 3),
    ellipse("reactant molecule b", x + 72, y + 116, 28, 28, "#FDE68A", "#92400E", 3),
    ...arrow("reactants bind arrow", x + 102, y + 118, x + width * 0.45, slabY - 2, "#1F2937"),
    ...arrow("product release arrow", x + width * 0.58, slabY - 2, x + width - 44, y + 94, "#1F2937"),
    ellipse("product molecule", x + width - 52, y + 78, 38, 38, "#86EFAC", "#166534", 3),
    path("lower energy path", [
      { x: x + 24, y: y + height - 42, rightX: x + 70, rightY: y + height - 104, pointType: "smooth" },
      { x: x + width * 0.52, y: y + height - 86, leftX: x + width * 0.32, leftY: y + height - 22, rightX: x + width * 0.72, rightY: y + height - 138, pointType: "smooth" },
      { x: x + width - 20, y: y + height - 48, leftX: x + width - 72, leftY: y + height - 106, pointType: "smooth" }
    ], null, "#DC2626", 4, false)
  ];
}

function membraneModule(x: number, y: number, width: number, height: number): SceneElement[] {
  const membraneY = y + height * 0.5;
  const lipids = Array.from({ length: 6 }, (_, index) => x + 22 + index * ((width - 44) / 5));
  return [
    text("membrane transport label", x + 10, y + 24, "selective transport", 15, "#065F46"),
    ...lipids.flatMap((lipidX, index) => [
      ellipse(`upper lipid head ${index + 1}`, lipidX, membraneY - 40, 20, 20, "#A7F3D0", "#065F46", 2),
      ellipse(`lower lipid head ${index + 1}`, lipidX, membraneY + 26, 20, 20, "#A7F3D0", "#065F46", 2),
      line(`lipid tail ${index + 1}a`, lipidX + 7, membraneY - 20, lipidX + 7, membraneY + 28, "#047857", 2),
      line(`lipid tail ${index + 1}b`, lipidX + 13, membraneY - 20, lipidX + 13, membraneY + 28, "#047857", 2)
    ]),
    rect("protein channel", x + width * 0.43, membraneY - 46, 38, 100, "#60A5FA", "#1E40AF", 4, 90),
    ...nodeRow("outside particle", x + 20, y + 70, 4, 34, "#FBBF24", "#92400E"),
    ...nodeRow("inside particle", x + width - 142, y + height - 68, 3, 34, "#FBBF24", "#92400E"),
    ...arrow("transport arrow", x + width * 0.5, y + 92, x + width * 0.5, y + height - 62, "#1D4ED8")
  ];
}

function electronTransferModule(x: number, y: number, width: number, height: number): SceneElement[] {
  const donorX = x + 28;
  const acceptorX = x + width - 76;
  const centerY = y + height * 0.47;
  return [
    text("electron transfer label", x + 10, y + 24, "charge flow", 15, "#581C87"),
    ellipse("electron donor", donorX, centerY - 28, 58, 58, "#DDD6FE", "#581C87", 4),
    ellipse("electron acceptor", acceptorX, centerY - 28, 58, 58, "#FBCFE8", "#9D174D", 4),
    text("donor label", donorX + 10, centerY + 8, "D", 22, "#581C87"),
    text("acceptor label", acceptorX + 10, centerY + 8, "A", 22, "#9D174D"),
    path("curved electron transfer arrow", [
      { x: donorX + 58, y: centerY, rightX: x + width * 0.42, rightY: y + 70, pointType: "smooth" },
      { x: acceptorX, y: centerY, leftX: x + width * 0.58, leftY: y + 62, pointType: "smooth" }
    ], null, "#7C3AED", 5, false),
    ellipse("electron dot one", x + width * 0.45, y + 82, 14, 14, "#FDE68A", "#92400E", 2),
    ellipse("electron dot two", x + width * 0.57, y + 74, 14, 14, "#FDE68A", "#92400E", 2),
    line("energy level donor", x + 34, y + height - 58, x + width * 0.42, y + height - 58, "#581C87", 3),
    line("energy level acceptor", x + width * 0.58, y + height - 88, x + width - 24, y + height - 88, "#9D174D", 3)
  ];
}

function phaseSeparationModule(x: number, y: number, width: number, height: number): SceneElement[] {
  return [
    text("phase separation label", x + 10, y + 24, "phase domains", 15, "#075985"),
    ellipse("dense phase droplet", x + width * 0.42, y + height * 0.34, width * 0.38, height * 0.38, "#BAE6FD", "#0369A1", 4, 72),
    ellipse("secondary condensate", x + width * 0.2, y + height * 0.58, width * 0.24, height * 0.24, "#A7F3D0", "#047857", 3, 70),
    ...nodeRow("outside dilute particle", x + 24, y + 78, 4, 32, "#E0E7FF", "#3730A3"),
    ...nodeRow("inside dense particle", x + width * 0.48, y + height * 0.48, 3, 28, "#38BDF8", "#075985"),
    path("phase boundary highlight", [
      { x: x + width * 0.42, y: y + height * 0.53, rightX: x + width * 0.55, rightY: y + height * 0.42, pointType: "smooth" },
      { x: x + width * 0.74, y: y + height * 0.48, leftX: x + width * 0.62, leftY: y + height * 0.66, rightX: x + width * 0.78, rightY: y + height * 0.26, pointType: "smooth" }
    ], null, "#0284C7", 4, false)
  ];
}

function biobasedCycleModule(x: number, y: number, width: number, height: number): SceneElement[] {
  const cx = x + width / 2;
  const cy = y + height / 2;
  return [
    text("biobased cycle label", x + 10, y + 24, "material cycle", 15, "#166534"),
    polygon("biomass leaf", [
      [x + 34, cy - 20],
      [x + 88, cy - 58],
      [x + 118, cy - 2],
      [x + 70, cy + 32]
    ], "#86EFAC", "#166534", 3),
    rect("functional material block", cx - 28, cy - 34, 58, 68, "#FDE68A", "#92400E", 3),
    ellipse("product use node", x + width - 84, cy - 26, 52, 52, "#BFDBFE", "#1E40AF", 3),
    path("circular material flow", [
      { x: x + 96, y: cy - 68, rightX: cx - 16, rightY: y + 44, pointType: "smooth" },
      { x: x + width - 76, y: cy - 54, leftX: cx + 44, leftY: y + 34, rightX: x + width - 28, rightY: cy + 18, pointType: "smooth" },
      { x: cx, y: cy + 88, leftX: x + width - 88, leftY: cy + 96, rightX: x + 106, rightY: cy + 96, pointType: "smooth" }
    ], null, "#16A34A", 5, false),
    ...arrow("processing arrow", x + 118, cy, cx - 32, cy, "#166534"),
    ...arrow("use arrow", cx + 34, cy, x + width - 86, cy, "#166534")
  ];
}

function systemFlowArrows(width: number, height: number): SceneElement[] {
  const y = Math.round(height * 0.52);
  return [
    ...arrow("context to mechanism arrow", Math.round(width * 0.32), y, Math.round(width * 0.39), y, "#0F172A"),
    ...arrow("mechanism to outcome arrow", Math.round(width * 0.63), y, Math.round(width * 0.7), y, "#0F172A")
  ];
}

function bondNetwork(name: string, x: number, y: number, fill: string, stroke: string): SceneElement[] {
  return [
    line(`${name} bond 1`, x + 18, y + 18, x + 60, y + 44, stroke, 3),
    line(`${name} bond 2`, x + 60, y + 44, x + 104, y + 22, stroke, 3),
    line(`${name} bond 3`, x + 60, y + 44, x + 90, y + 82, stroke, 3),
    ellipse(`${name} node 1`, x, y, 30, 30, fill, stroke, 3),
    ellipse(`${name} node 2`, x + 46, y + 30, 30, 30, fill, stroke, 3),
    ellipse(`${name} node 3`, x + 90, y + 8, 30, 30, fill, stroke, 3),
    ellipse(`${name} node 4`, x + 76, y + 68, 30, 30, fill, stroke, 3)
  ];
}

function nodeRow(name: string, x: number, y: number, count: number, gap: number, fill: string, stroke: string): SceneElement[] {
  return Array.from({ length: count }, (_, index) => ellipse(`${name} ${index + 1}`, x + index * gap, y, 22, 22, fill, stroke, 2));
}

function arrow(name: string, x1: number, y1: number, x2: number, y2: number, stroke: string): SceneElement[] {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 12;
  const left = {
    x: x2 - size * Math.cos(angle - Math.PI / 6),
    y: y2 - size * Math.sin(angle - Math.PI / 6)
  };
  const right = {
    x: x2 - size * Math.cos(angle + Math.PI / 6),
    y: y2 - size * Math.sin(angle + Math.PI / 6)
  };

  return [
    line(name, x1, y1, x2, y2, stroke, 4),
    polygon(`${name} head`, [
      [x2, y2],
      [left.x, left.y],
      [right.x, right.y]
    ], stroke, stroke, 1)
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
  return { type: "line", name, x, y, x2, y2, style: { fill: null, stroke, strokeWidth } };
}

function polygon(name: string, points: number[][], fill: string, stroke: string, strokeWidth: number, opacity = 100): SceneElement {
  return {
    type: "polygon",
    name,
    x: 0,
    y: 0,
    points: points.map(([pointX, pointY]) => ({ x: Math.round(pointX), y: Math.round(pointY) })),
    style: { fill, stroke, strokeWidth, opacity }
  };
}

function path(name: string, points: PathPoint[], fill: string | null, stroke: string, strokeWidth: number, closed: boolean, opacity = 100): SceneElement {
  return {
    type: "path",
    name,
    x: 0,
    y: 0,
    points: points.map((point) => ({
      ...point,
      x: Math.round(point.x),
      y: Math.round(point.y),
      leftX: point.leftX === undefined ? undefined : Math.round(point.leftX),
      leftY: point.leftY === undefined ? undefined : Math.round(point.leftY),
      rightX: point.rightX === undefined ? undefined : Math.round(point.rightX),
      rightY: point.rightY === undefined ? undefined : Math.round(point.rightY)
    })),
    closed,
    style: { fill, stroke, strokeWidth, opacity }
  };
}

function text(name: string, x: number, y: number, content: string, size: number, fill: string): SceneElement {
  return {
    type: "text",
    name,
    x: Math.round(x),
    y: Math.round(y),
    text: content,
    size,
    style: { fill, stroke: null, strokeWidth: 0 }
  };
}

function evidenceSummary(evidence: SemanticSearchResult[]): string {
  if (evidence.length === 0) {
    return "No local semantic evidence matched; using generic scientific concept grammar.";
  }

  return evidence
    .slice(0, 3)
    .map((result) => result.item.title)
    .join(" | ");
}

function titleFromPrompt(prompt: string): string {
  const cleaned = prompt.replace(/[^a-z0-9 -]+/gi, " ").trim().replace(/\s+/g, " ");
  const title = cleaned.length > 0 ? cleaned : "Scientific concept scene";
  return title.length > 88 ? `${title.slice(0, 85)}...` : title;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
