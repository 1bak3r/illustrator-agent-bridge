import type { CartoonScene, SceneElement } from "../bridge/types.js";

export interface SceneQaReport {
  ok: boolean;
  checks: SceneQaCheck[];
}

export interface SceneQaCheck {
  id: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

export function qaCartoonScene(scene: CartoonScene): SceneQaReport {
  const checks: SceneQaCheck[] = [
    checkDocumentSize(scene),
    checkNamedElements(scene),
    checkTextSize(scene),
    checkStrokeConsistency(scene),
    checkElementCount(scene)
  ];

  return {
    ok: checks.every((check) => check.status !== "fail"),
    checks
  };
}

function checkDocumentSize(scene: CartoonScene): SceneQaCheck {
  const width = scene.document?.width ?? 720;
  const height = scene.document?.height ?? 480;

  if (width < 360 || height < 240) {
    return {
      id: "document-size",
      status: "fail",
      message: "Document is too small for publication figure planning."
    };
  }

  return {
    id: "document-size",
    status: "pass",
    message: `Document size is ${width} x ${height} pt.`
  };
}

function checkNamedElements(scene: CartoonScene): SceneQaCheck {
  const unnamed = scene.elements.filter((element) => !element.name).length;

  if (unnamed > 0) {
    return {
      id: "named-elements",
      status: "warn",
      message: `${unnamed} element(s) are unnamed; named objects are easier for an agent to inspect and revise.`
    };
  }

  return {
    id: "named-elements",
    status: "pass",
    message: "All scene elements are named."
  };
}

function checkTextSize(scene: CartoonScene): SceneQaCheck {
  const textElements = scene.elements.filter((element) => element.type === "text");
  const smallText = textElements.filter((element) => (element.size ?? 18) < 14);

  if (smallText.length > 0) {
    return {
      id: "text-size",
      status: "fail",
      message: `${smallText.length} text element(s) are below 14 pt.`
    };
  }

  return {
    id: "text-size",
    status: "pass",
    message: textElements.length === 0 ? "Scene has no text labels." : "Text labels meet the minimum static size check."
  };
}

function checkStrokeConsistency(scene: CartoonScene): SceneQaCheck {
  const stroked = scene.elements
    .map((element) => element.style?.strokeWidth)
    .filter((width): width is number => typeof width === "number" && width > 0);

  if (stroked.length === 0) {
    return {
      id: "stroke-consistency",
      status: "warn",
      message: "No explicit stroke widths were found."
    };
  }

  const min = Math.min(...stroked);
  const max = Math.max(...stroked);

  if (max / min > 2.5) {
    return {
      id: "stroke-consistency",
      status: "warn",
      message: `Stroke widths vary from ${min} to ${max} pt; publication cartoons usually read better with a tighter range.`
    };
  }

  return {
    id: "stroke-consistency",
    status: "pass",
    message: `Stroke widths are consistent enough for a first-pass cartoon (${min}-${max} pt).`
  };
}

function checkElementCount(scene: CartoonScene): SceneQaCheck {
  if (scene.elements.length < 5) {
    return {
      id: "element-count",
      status: "warn",
      message: "Scene has very few elements; it may not communicate enough visual context."
    };
  }

  if (scene.elements.length > 80) {
    return {
      id: "element-count",
      status: "warn",
      message: "Scene has many elements; verify it remains legible at final size."
    };
  }

  return {
    id: "element-count",
    status: "pass",
    message: `Scene has ${scene.elements.length} elements.`
  };
}

export function recommendedExportFormats(scene: CartoonScene): string[] {
  const hasText = scene.elements.some((element: SceneElement) => element.type === "text");
  return hasText ? ["pdf", "svg", "png"] : ["svg", "pdf", "png"];
}
