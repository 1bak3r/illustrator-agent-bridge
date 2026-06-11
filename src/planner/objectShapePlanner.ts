import type { CartoonScene, PathPoint, SceneElement } from "../bridge/types.js";
import { guardObjectShapeScene, type ObjectShapeGuardReport, type ObjectShapeTarget } from "../qa/objectShapeGuard.js";
import { searchCorpus } from "../semantic/search.js";
import type { SemanticItem, SemanticSearchResult } from "../semantic/types.js";
import { qaCartoonScene, recommendedExportFormats, type SceneQaReport } from "./sceneQa.js";

export { type ObjectShapeTarget } from "../qa/objectShapeGuard.js";

export class ObjectShapePlannerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObjectShapePlannerError";
  }
}

export interface ObjectShapePlanOptions {
  width?: number;
  height?: number;
  title?: string;
  evidenceLimit?: number;
}

export interface ObjectShapePlan {
  prompt: string;
  planner: "object-shape-deterministic";
  target: ObjectShapeTarget;
  semanticQueries: string[];
  evidence: SemanticSearchResult[];
  scene: CartoonScene;
  qa: SceneQaReport;
  guard: ObjectShapeGuardReport;
  recommendedExports: string[];
  notes: string[];
}

export function planObjectShapeScene(prompt: string, corpus: SemanticItem[], options: ObjectShapePlanOptions = {}): ObjectShapePlan {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new ObjectShapePlannerError("Prompt is required to plan an object shape scene.");
  }

  const target = inferObjectShapeTarget(trimmedPrompt);
  const semanticQueries = buildSemanticQueries(target, trimmedPrompt);
  const evidence = collectEvidence(semanticQueries, corpus, target, options.evidenceLimit ?? 10);
  const scene = buildObjectScene(target, trimmedPrompt, options);
  const qa = qaCartoonScene(scene);
  const guard = guardObjectShapeScene(target, scene, trimmedPrompt);

  return {
    prompt: trimmedPrompt,
    planner: "object-shape-deterministic",
    target,
    semanticQueries,
    evidence,
    scene,
    qa,
    guard,
    recommendedExports: recommendedExportFormats(scene),
    notes: [
      `Retrieved ${evidence.length} semantic evidence item(s) for ${target} shape grammar.`,
      guard.ok
        ? `The local shape guard found the required ${target} parts.`
        : `The local shape guard found issues; feed guard.nextPrompt into the next planning iteration.`,
      "This guard checks named vector structure. Exported artwork should still be inspected visually before publication use."
    ]
  };
}

export function inferObjectShapeTarget(prompt: string): ObjectShapeTarget {
  const normalized = prompt.toLowerCase();

  if (/\b(cat|kitten|feline)\b/.test(normalized)) {
    return "cat";
  }

  if (/\b(lock|padlock)\b/.test(normalized)) {
    return "lock";
  }

  if (/\b(key|keys|house[- ]?key)\b/.test(normalized)) {
    return "key";
  }

  throw new ObjectShapePlannerError("Supported object shape targets are cat, lock, and key.");
}

export function parseObjectShapeTarget(input: string): ObjectShapeTarget {
  const value = input.trim().toLowerCase();
  if (value === "cat" || value === "lock" || value === "key") {
    return value;
  }

  throw new ObjectShapePlannerError("target must be cat, lock, or key");
}

function buildSemanticQueries(target: ObjectShapeTarget, prompt: string): string[] {
  const recipeQuery: Record<ObjectShapeTarget, string> = {
    cat: "cat full body vector recipe head ears eyes nose whiskers tail paws",
    lock: "padlock vector recipe shackle body keyhole pins highlight",
    key: "key vector recipe bow ring hole shaft shoulder teeth ridge"
  };

  return uniqueStrings([prompt, recipeQuery[target], `${target} recognizable silhouette required parts`, "publication vector readability outline"]);
}

function collectEvidence(queries: string[], corpus: SemanticItem[], target: ObjectShapeTarget, limit: number): SemanticSearchResult[] {
  const byId = new Map<string, SemanticSearchResult>();

  for (const query of queries) {
    const results = [
      ...searchCorpus(query, corpus, { limit: 8, kind: "shape_recipe" }).filter((result) => recipeMatchesTarget(result.item, target)),
      ...searchCorpus(query, corpus, { limit: 8, kind: "shape_combination" }).filter((result) => itemMatchesTarget(result.item, target)),
      ...searchCorpus(query, corpus, { limit: 8, kind: "object_semantics" }).filter((result) => itemMatchesTarget(result.item, target)),
      ...searchCorpus(query, corpus, { limit: 8, kind: "style_reference" }),
      ...searchCorpus(query, corpus, { limit: 8, kind: "publication_requirement" })
    ];

    for (const result of results) {
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

function recipeMatchesTarget(item: SemanticItem, target: ObjectShapeTarget): boolean {
  return itemMatchesTarget(item, target);
}

function itemMatchesTarget(item: SemanticItem, target: ObjectShapeTarget): boolean {
  const tags = new Set((item.tags ?? []).map((tag) => tag.toLowerCase()));
  if (tags.has(target)) {
    return true;
  }

  if (target === "lock" && tags.has("padlock")) {
    return true;
  }

  if (target === "key" && (tags.has("house-key") || tags.has("keys"))) {
    return true;
  }

  if (target === "cat" && tags.has("feline")) {
    return true;
  }

  return item.id.toLowerCase().includes(`.${target}.`) || item.title.toLowerCase().includes(target);
}

function buildObjectScene(target: ObjectShapeTarget, prompt: string, options: ObjectShapePlanOptions): CartoonScene {
  const width = options.width ?? 720;
  const height = options.height ?? 520;
  const title = options.title ?? titleFromPrompt(prompt);
  const elements = target === "cat" ? catScene(width, height) : target === "lock" ? lockScene(width, height) : keyScene(width, height);

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

function catScene(width: number, height: number): SceneElement[] {
  const sx = width / 720;
  const sy = height / 520;
  const x = (value: number) => Math.round(value * sx);
  const y = (value: number) => Math.round(value * sy);
  const s = (value: number) => Math.round(value * Math.min(sx, sy));

  return [
    rect("background", 0, 0, width, height, "#F8FAFC", null, 0),
    ellipse("cat ground shadow", x(168), y(408), s(390), s(42), "#CBD5E1", null, 0, 65),
    path(
      "cat tail curved path",
      [
        { x: x(448), y: y(284), rightX: x(598), rightY: y(198), pointType: "smooth" },
        {
          x: x(576),
          y: y(108),
          leftX: x(640),
          leftY: y(228),
          rightX: x(520),
          rightY: y(34),
          pointType: "smooth"
        },
        { x: x(466), y: y(108), leftX: x(536), leftY: y(74), pointType: "smooth" }
      ],
      null,
      "#B77745",
      s(22),
      false
    ),
    ellipse("cat body torso", x(244), y(230), s(238), s(166), "#D9965B", "#111827", s(5)),
    ellipse("cat belly patch", x(298), y(266), s(120), s(104), "#F4C994", "#7C4A2D", s(3), 86),
    rect("cat front left leg", x(294), y(348), s(34), s(78), "#D9965B", "#111827", s(4)),
    rect("cat front right leg", x(354), y(348), s(34), s(78), "#D9965B", "#111827", s(4)),
    rect("cat rear left leg", x(248), y(338), s(34), s(78), "#C9824E", "#111827", s(4)),
    rect("cat rear right leg", x(416), y(338), s(34), s(78), "#C9824E", "#111827", s(4)),
    ellipse("cat front left paw", x(278), y(408), s(62), s(32), "#F4C994", "#111827", s(4)),
    ellipse("cat front right paw", x(340), y(408), s(62), s(32), "#F4C994", "#111827", s(4)),
    ellipse("cat rear left paw", x(232), y(402), s(62), s(34), "#E7A76A", "#111827", s(4)),
    ellipse("cat rear right paw", x(400), y(402), s(62), s(34), "#E7A76A", "#111827", s(4)),
    ellipse("cat head", x(220), y(118), s(178), s(148), "#D9965B", "#111827", s(5)),
    polygon(
      "cat left ear",
      [
        [x(236), y(130)],
        [x(264), y(48)],
        [x(306), y(128)]
      ],
      "#D9965B",
      "#111827",
      s(5)
    ),
    polygon(
      "cat right ear",
      [
        [x(318), y(128)],
        [x(364), y(48)],
        [x(388), y(132)]
      ],
      "#D9965B",
      "#111827",
      s(5)
    ),
    polygon(
      "cat left inner ear",
      [
        [x(258), y(118)],
        [x(268), y(78)],
        [x(288), y(118)]
      ],
      "#F3A6A6",
      "#7C4A2D",
      s(2)
    ),
    polygon(
      "cat right inner ear",
      [
        [x(336), y(118)],
        [x(360), y(78)],
        [x(370), y(118)]
      ],
      "#F3A6A6",
      "#7C4A2D",
      s(2)
    ),
    ellipse("cat left eye", x(260), y(166), s(30), s(34), "#FFFFFF", "#111827", s(3)),
    ellipse("cat right eye", x(328), y(166), s(30), s(34), "#FFFFFF", "#111827", s(3)),
    ellipse("cat left pupil", x(272), y(176), s(10), s(18), "#111827", "#111827", s(1)),
    ellipse("cat right pupil", x(340), y(176), s(10), s(18), "#111827", "#111827", s(1)),
    polygon(
      "cat nose",
      [
        [x(306), y(204)],
        [x(326), y(204)],
        [x(316), y(218)]
      ],
      "#E85D75",
      "#111827",
      s(2)
    ),
    path(
      "cat mouth left curve",
      [
        { x: x(316), y: y(218), rightX: x(304), rightY: y(236), pointType: "smooth" },
        { x: x(292), y: y(226), leftX: x(306), leftY: y(242), pointType: "smooth" }
      ],
      null,
      "#111827",
      s(3),
      false
    ),
    path(
      "cat mouth right curve",
      [
        { x: x(316), y: y(218), rightX: x(328), rightY: y(236), pointType: "smooth" },
        { x: x(340), y: y(226), leftX: x(326), leftY: y(242), pointType: "smooth" }
      ],
      null,
      "#111827",
      s(3),
      false
    ),
    line("cat left whisker upper", x(292), y(202), x(208), y(178), "#111827", s(3)),
    line("cat left whisker middle", x(292), y(214), x(204), y(214), "#111827", s(3)),
    line("cat left whisker lower", x(292), y(226), x(212), y(250), "#111827", s(3)),
    line("cat right whisker upper", x(340), y(202), x(424), y(178), "#111827", s(3)),
    line("cat right whisker middle", x(340), y(214), x(428), y(214), "#111827", s(3)),
    line("cat right whisker lower", x(340), y(226), x(420), y(250), "#111827", s(3)),
    line("cat body stripe one", x(314), y(250), x(300), y(286), "#7C4A2D", s(4)),
    line("cat body stripe two", x(358), y(246), x(370), y(284), "#7C4A2D", s(4)),
    line("cat forehead stripe", x(316), y(132), x(316), y(154), "#7C4A2D", s(4))
  ];
}

function lockScene(width: number, height: number): SceneElement[] {
  const sx = width / 720;
  const sy = height / 520;
  const x = (value: number) => Math.round(value * sx);
  const y = (value: number) => Math.round(value * sy);
  const s = (value: number) => Math.round(value * Math.min(sx, sy));

  return [
    rect("background", 0, 0, width, height, "#F8FAFC", null, 0),
    ellipse("lock ground shadow", x(198), y(430), s(324), s(40), "#CBD5E1", null, 0, 60),
    path(
      "lock outer shackle",
      [
        { x: x(274), y: y(236), rightX: x(270), rightY: y(154), pointType: "smooth" },
        { x: x(360), y: y(92), leftX: x(274), leftY: y(102), rightX: x(446), rightY: y(102), pointType: "smooth" },
        { x: x(446), y: y(236), leftX: x(450), leftY: y(154), pointType: "smooth" }
      ],
      null,
      "#111827",
      s(22),
      false
    ),
    path(
      "lock inner shackle highlight",
      [
        { x: x(292), y: y(232), rightX: x(292), rightY: y(158), pointType: "smooth" },
        { x: x(360), y: y(116), leftX: x(300), leftY: y(118), rightX: x(420), rightY: y(118), pointType: "smooth" },
        { x: x(428), y: y(232), leftX: x(428), leftY: y(158), pointType: "smooth" }
      ],
      null,
      "#E5E7EB",
      s(7),
      false
    ),
    rect("lock body housing", x(230), y(220), s(260), s(198), "#FBBF24", "#111827", s(6)),
    rect("lock body top edge", x(242), y(220), s(236), s(34), "#FDE68A", "#111827", s(3)),
    ellipse("lock pin left socket", x(260), y(204), s(40), s(40), "#D97706", "#111827", s(4)),
    ellipse("lock pin right socket", x(420), y(204), s(40), s(40), "#D97706", "#111827", s(4)),
    rect("lock latch left pin", x(274), y(224), s(12), s(30), "#92400E", "#111827", s(2)),
    rect("lock latch right pin", x(434), y(224), s(12), s(30), "#92400E", "#111827", s(2)),
    ellipse("lock keyhole round", x(338), y(286), s(44), s(44), "#111827", "#111827", s(1)),
    rect("lock keyhole slot", x(352), y(320), s(16), s(52), "#111827", "#111827", s(1)),
    path(
      "lock highlight shine",
      [
        { x: x(270), y: y(258), rightX: x(330), rightY: y(242), pointType: "smooth" },
        { x: x(420), y: y(260), leftX: x(350), leftY: y(232), pointType: "smooth" }
      ],
      null,
      "#FEF3C7",
      s(8),
      false,
      82
    ),
    line("lock body edge shadow", x(472), y(250), x(472), y(390), "#92400E", s(5))
  ];
}

function keyScene(width: number, height: number): SceneElement[] {
  const sx = width / 720;
  const sy = height / 520;
  const x = (value: number) => Math.round(value * sx);
  const y = (value: number) => Math.round(value * sy);
  const s = (value: number) => Math.round(value * Math.min(sx, sy));

  return [
    rect("background", 0, 0, width, height, "#F8FAFC", null, 0),
    ellipse("key ground shadow", x(86), y(346), s(520), s(42), "#CBD5E1", null, 0, 60),
    ellipse("key bow outer ring", x(88), y(198), s(144), s(144), "#FBBF24", "#111827", s(6)),
    ellipse("key hole inner ring", x(132), y(242), s(56), s(56), "#F8FAFC", "#111827", s(5)),
    rect("key shoulder collar", x(218), y(246), s(44), s(72), "#FBBF24", "#111827", s(5)),
    rect("key shaft blade", x(250), y(270), s(284), s(28), "#FBBF24", "#111827", s(5)),
    line("key ridge center line", x(270), y(284), x(516), y(284), "#92400E", s(4)),
    rect("key bit block", x(510), y(252), s(62), s(64), "#FBBF24", "#111827", s(5)),
    rect("key tooth upper", x(548), y(232), s(46), s(34), "#FBBF24", "#111827", s(5)),
    rect("key tooth middle", x(572), y(270), s(48), s(28), "#FBBF24", "#111827", s(5)),
    rect("key tooth lower", x(536), y(302), s(38), s(36), "#FBBF24", "#111827", s(5)),
    rect("key tooth end", x(604), y(268), s(34), s(30), "#FBBF24", "#111827", s(5)),
    rect("key groove cutout upper", x(516), y(252), s(26), s(16), "#F8FAFC", "#111827", s(3)),
    rect("key groove cutout lower", x(580), y(316), s(30), s(18), "#F8FAFC", "#111827", s(3)),
    path(
      "key bow shine",
      [
        { x: x(116), y: y(234), rightX: x(134), rightY: y(208), pointType: "smooth" },
        { x: x(176), y: y(218), leftX: x(142), leftY: y(204), pointType: "smooth" }
      ],
      null,
      "#FEF3C7",
      s(8),
      false,
      82
    )
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
  stroke: string | null,
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

function path(
  name: string,
  points: PathPoint[],
  fill: string | null,
  stroke: string,
  strokeWidth: number,
  closed: boolean,
  opacity = 100
): SceneElement {
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

function titleFromPrompt(prompt: string): string {
  const cleaned = prompt.replace(/[^a-z0-9 -]+/gi, " ").trim().replace(/\s+/g, " ");
  const title = cleaned.length > 0 ? cleaned : "Object shape scene";
  return title.length > 88 ? `${title.slice(0, 85)}...` : title;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
