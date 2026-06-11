import test from "node:test";
import assert from "node:assert/strict";
import type { CartoonScene, SceneElement } from "../src/bridge/types.js";
import { planObjectShapeScene } from "../src/planner/objectShapePlanner.js";
import { guardObjectShapeScene } from "../src/qa/objectShapeGuard.js";
import type { SemanticItem } from "../src/semantic/types.js";

const corpus: SemanticItem[] = [
  {
    id: "shape.cat.full-body",
    kind: "shape_recipe",
    title: "Full cat vector recipe",
    text: "A full cat uses a body, head, triangular ears, eyes, nose, whiskers, tail, and four paws.",
    tags: ["cat", "ears", "whiskers", "tail", "paws"]
  },
  {
    id: "shape.lock.padlock",
    kind: "shape_recipe",
    title: "Padlock vector recipe",
    text: "A padlock uses a solid body, U-shaped shackle, pins, keyhole, and highlight.",
    tags: ["lock", "shackle", "keyhole"]
  },
  {
    id: "shape.key.house-key",
    kind: "shape_recipe",
    title: "House key vector recipe",
    text: "A key uses a bow, inner hole, shaft, shoulder, ridge, and several teeth.",
    tags: ["key", "bow", "shaft", "teeth"]
  },
  {
    id: "style.publication-cartoon-vector",
    kind: "style_reference",
    title: "Publication cartoon vector style",
    text: "Use named vector elements, bold outlines, and simple filled forms.",
    tags: ["vector", "outline"]
  },
  {
    id: "shapecombo.lock-reviewed-svg",
    kind: "shape_combination",
    title: "Shape combination: reviewed lock SVG",
    text: "Spatial part relationships include lock outer shackle above lock body housing; lock keyhole round inside lock body housing.",
    tags: ["shape", "combination", "lock", "padlock", "shackle", "keyhole", "body"]
  }
];

test("planObjectShapeScene builds guarded cat, lock, and key scenes", () => {
  for (const prompt of ["full cat icon", "secure padlock icon", "simple house key icon"]) {
    const plan = planObjectShapeScene(prompt, corpus);

    assert.equal(plan.planner, "object-shape-deterministic");
    assert.equal(plan.qa.ok, true);
    assert.equal(plan.guard.ok, true);
    assert.equal(plan.guard.nextPrompt, null);
    assert.ok(plan.evidence.some((result) => result.item.kind === "shape_recipe"));
    assert.ok(plan.scene.elements.length > 10);
    assert.ok(plan.recommendedExports.includes("svg"));
  }
});

test("planObjectShapeScene retrieves learned shape-combination evidence", () => {
  const plan = planObjectShapeScene("secure padlock icon", corpus);

  assert.ok(plan.evidence.some((result) => result.item.kind === "shape_combination" && result.item.id === "shapecombo.lock-reviewed-svg"));
  assert.ok(plan.evidence.some((result) => /keyhole round inside lock body/.test(result.item.text)));
});

test("object shape guard emits a next prompt for missing cat parts", () => {
  const incompleteCat: CartoonScene = {
    document: { width: 720, height: 520, colorMode: "RGB" },
    elements: [
      {
        type: "ellipse",
        name: "cat body torso",
        x: 250,
        y: 230,
        width: 220,
        height: 160,
        style: { fill: "#D9965B", stroke: "#111827", strokeWidth: 5 }
      },
      {
        type: "ellipse",
        name: "cat head",
        x: 220,
        y: 120,
        width: 170,
        height: 140,
        style: { fill: "#D9965B", stroke: "#111827", strokeWidth: 5 }
      }
    ]
  };

  const guard = guardObjectShapeScene("cat", incompleteCat, "make a full cat");

  assert.equal(guard.ok, false);
  assert.match(guard.nextPrompt ?? "", /ears/);
  assert.match(guard.nextPrompt ?? "", /whiskers/);
  assert.match(guard.nextPrompt ?? "", /tail/);
  assert.ok(guard.confidence > 0);
});

test("object shape guard rejects named cat parts with incoherent geometry", () => {
  const badCat: CartoonScene = {
    document: { width: 720, height: 520, colorMode: "RGB" },
    elements: [
      ellipse("cat body torso", 220, 120, 220, 150),
      ellipse("cat head", 230, 360, 160, 120),
      polygon("cat left ear", [[260, 470], [280, 510], [300, 470]]),
      polygon("cat right ear", [[320, 470], [340, 510], [360, 470]]),
      ellipse("cat left eye", 250, 390, 20, 20),
      ellipse("cat right eye", 330, 390, 20, 20),
      polygon("cat nose", [[300, 420], [320, 420], [310, 435]]),
      line("cat left whisker upper", 40, 40, 80, 42),
      line("cat left whisker middle", 40, 50, 80, 50),
      line("cat left whisker lower", 40, 60, 80, 58),
      line("cat right whisker upper", 640, 40, 680, 42),
      line("cat right whisker middle", 640, 50, 680, 50),
      line("cat right whisker lower", 640, 60, 680, 58),
      path("cat tail curved path", [{ x: 610, y: 440 }, { x: 680, y: 470 }]),
      ellipse("cat front left paw", 230, 40, 36, 20),
      ellipse("cat front right paw", 280, 40, 36, 20),
      ellipse("cat rear left paw", 330, 40, 36, 20),
      ellipse("cat rear right paw", 380, 40, 36, 20)
    ]
  };

  const guard = guardObjectShapeScene("cat", badCat, "make a full cat");

  assert.equal(guard.ok, false);
  assert.match(guard.nextPrompt ?? "", /cat-head-above-body/);
  assert.match(guard.nextPrompt ?? "", /cat-tail-attached/);
});

test("object shape guard rejects named lock parts with incoherent geometry", () => {
  const badLock: CartoonScene = {
    document: { width: 720, height: 520, colorMode: "RGB" },
    elements: [
      rect("lock body housing", 240, 180, 240, 180),
      path("lock outer shackle", [{ x: 90, y: 410 }, { x: 150, y: 460 }, { x: 210, y: 410 }]),
      ellipse("lock keyhole round", 560, 80, 36, 36),
      rect("lock keyhole slot", 570, 120, 12, 45),
      ellipse("lock pin left socket", 80, 80, 28, 28),
      ellipse("lock pin right socket", 620, 80, 28, 28),
      line("lock highlight shine", 540, 420, 640, 440)
    ]
  };

  const guard = guardObjectShapeScene("lock", badLock, "make a padlock");

  assert.equal(guard.ok, false);
  assert.match(guard.nextPrompt ?? "", /lock-shackle-above-body/);
  assert.match(guard.nextPrompt ?? "", /lock-keyhole-inside-body/);
});

test("object shape guard rejects named key parts with incoherent geometry", () => {
  const badKey: CartoonScene = {
    document: { width: 720, height: 520, colorMode: "RGB" },
    elements: [
      ellipse("key bow outer ring", 520, 220, 120, 120),
      ellipse("key hole inner ring", 80, 60, 42, 42),
      rect("key shaft blade", 220, 250, 220, 24),
      rect("key shoulder collar", 580, 380, 40, 70),
      rect("key tooth upper", 80, 220, 34, 28),
      rect("key tooth middle", 90, 260, 34, 28),
      rect("key tooth lower", 80, 300, 34, 28),
      line("key ridge center line", 500, 80, 640, 80)
    ]
  };

  const guard = guardObjectShapeScene("key", badKey, "make a house key");

  assert.equal(guard.ok, false);
  assert.match(guard.nextPrompt ?? "", /key-bow-left-of-shaft/);
  assert.match(guard.nextPrompt ?? "", /key-hole-inside-bow/);
});

test("object shape guard rejects scenes that rely on target text labels", () => {
  const labelCat: CartoonScene = {
    document: { width: 720, height: 520, colorMode: "RGB" },
    elements: [
      text("object label", 280, 250, "CAT", 96),
      ellipse("cat body torso", 250, 260, 200, 120),
      ellipse("cat head", 270, 160, 150, 110),
      polygon("cat left ear", [[285, 165], [305, 105], [330, 165]]),
      polygon("cat right ear", [[360, 165], [385, 105], [405, 165]]),
      ellipse("cat left eye", 305, 195, 20, 20),
      ellipse("cat right eye", 365, 195, 20, 20),
      polygon("cat nose", [[335, 225], [350, 225], [342, 236]]),
      line("cat left whisker upper", 330, 215, 250, 195),
      line("cat left whisker middle", 330, 225, 245, 225),
      line("cat left whisker lower", 330, 235, 250, 255),
      line("cat right whisker upper", 355, 215, 435, 195),
      line("cat right whisker middle", 355, 225, 440, 225),
      line("cat right whisker lower", 355, 235, 435, 255),
      path("cat tail curved path", [{ x: 440, y: 305 }, { x: 520, y: 245 }, { x: 500, y: 170 }]),
      ellipse("cat front left paw", 275, 365, 44, 24),
      ellipse("cat front right paw", 330, 365, 44, 24),
      ellipse("cat rear left paw", 385, 365, 44, 24),
      ellipse("cat rear right paw", 430, 365, 44, 24)
    ]
  };

  const guard = guardObjectShapeScene("cat", labelCat, "make a full cat");

  assert.equal(guard.ok, false);
  assert.match(guard.nextPrompt ?? "", /visual-not-text-label/);
});

test("object shape guard rejects valid parts that are too small to read visually", () => {
  const tinyKey: CartoonScene = {
    document: { width: 720, height: 520, colorMode: "RGB" },
    elements: [
      ellipse("key bow outer ring", 10, 10, 20, 20),
      ellipse("key hole inner ring", 16, 16, 8, 8),
      rect("key shaft blade", 30, 19, 60, 4),
      rect("key shoulder collar", 25, 16, 8, 10),
      rect("key tooth upper", 88, 17, 8, 4),
      rect("key tooth middle", 92, 21, 8, 4),
      rect("key tooth lower", 96, 25, 8, 4),
      line("key ridge center line", 34, 21, 82, 21)
    ]
  };

  const guard = guardObjectShapeScene("key", tinyKey, "make a house key");

  assert.equal(guard.ok, false);
  assert.match(guard.nextPrompt ?? "", /visual-footprint-readable/);
});

test("object shape guard ignores invisible named required parts", () => {
  const plan = planObjectShapeScene("secure padlock icon", corpus);
  const hiddenBodyScene: CartoonScene = {
    ...plan.scene,
    elements: hideMatching(plan.scene.elements, /\block body housing\b/i)
  };

  const guard = guardObjectShapeScene("lock", hiddenBodyScene, "make a padlock");
  const bodyCheck = guard.checks.find((check) => check.id === "body");

  assert.equal(guard.ok, false);
  assert.equal(bodyCheck?.status, "fail");
  assert.match(bodyCheck?.message ?? "", /visible solid lock body/);
});

test("object shape guard ignores zero-size named required parts", () => {
  const plan = planObjectShapeScene("simple house key icon", corpus);
  const collapsedTeethScene: CartoonScene = {
    ...plan.scene,
    elements: collapseMatching(plan.scene.elements, /\bkey tooth\b/i)
  };

  const guard = guardObjectShapeScene("key", collapsedTeethScene, "make a house key");
  const teethCheck = guard.checks.find((check) => check.id === "teeth");

  assert.equal(guard.ok, false);
  assert.equal(teethCheck?.status, "fail");
  assert.match(teethCheck?.message ?? "", /visible three distinct teeth/);
});

function rect(name: string, x: number, y: number, width: number, height: number) {
  return { type: "rect" as const, name, x, y, width, height, style: { fill: "#FFFFFF", stroke: "#111827", strokeWidth: 3 } };
}

function ellipse(name: string, x: number, y: number, width: number, height: number) {
  return { type: "ellipse" as const, name, x, y, width, height, style: { fill: "#FFFFFF", stroke: "#111827", strokeWidth: 3 } };
}

function line(name: string, x: number, y: number, x2: number, y2: number) {
  return { type: "line" as const, name, x, y, x2, y2, style: { fill: null, stroke: "#111827", strokeWidth: 3 } };
}

function polygon(name: string, points: number[][]) {
  return {
    type: "polygon" as const,
    name,
    x: 0,
    y: 0,
    points: points.map(([pointX, pointY]) => ({ x: pointX, y: pointY })),
    style: { fill: "#FFFFFF", stroke: "#111827", strokeWidth: 3 }
  };
}

function path(name: string, points: Array<{ x: number; y: number }>) {
  return {
    type: "path" as const,
    name,
    x: 0,
    y: 0,
    points,
    closed: false,
    style: { fill: null, stroke: "#111827", strokeWidth: 3 }
  };
}

function text(name: string, x: number, y: number, content: string, size: number) {
  return { type: "text" as const, name, x, y, text: content, size, style: { fill: "#111827" } };
}

function hideMatching(elements: SceneElement[], pattern: RegExp): SceneElement[] {
  return elements.map((element) => {
    if (!pattern.test(element.name ?? "")) {
      return element;
    }

    return { ...element, style: { ...(element.style ?? {}), opacity: 0 } } as SceneElement;
  });
}

function collapseMatching(elements: SceneElement[], pattern: RegExp): SceneElement[] {
  return elements.map((element) => {
    if (!pattern.test(element.name ?? "")) {
      return element;
    }

    if (element.type === "rect" || element.type === "ellipse") {
      return { ...element, width: 0, height: 0 } as SceneElement;
    }

    if (element.type === "line") {
      return { ...element, x2: element.x, y2: element.y } as SceneElement;
    }

    if (element.type === "polygon" || element.type === "path") {
      return { ...element, points: element.points.map(() => ({ x: element.x, y: element.y })) } as SceneElement;
    }

    return element;
  });
}
