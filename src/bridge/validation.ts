import type {
  BridgeCommand,
  CartoonScene,
  ElementStyle,
  ExportFormat,
  PathPoint,
  Point,
  SceneDocument,
  SceneElement
} from "./types.js";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function normalizeCommand(input: unknown): BridgeCommand {
  const value = object(input, "command");
  const kind = stringValue(value.kind, "kind");

  if (kind === "ping") {
    return {
      kind,
      message: optionalString(value.message, "message", 500)
    };
  }

  if (kind === "cartoon_scene") {
    return {
      kind,
      scene: normalizeScene(value.scene)
    };
  }

  if (kind === "export") {
    return {
      kind,
      format: normalizeExportFormat(value.format),
      outputPath: stringValue(value.outputPath, "outputPath", 1000)
    };
  }

  throw new ValidationError(`Unsupported command kind: ${kind}`);
}

function normalizeExportFormat(input: unknown): ExportFormat {
  const format = stringValue(input, "format").toLowerCase();

  if (format !== "pdf" && format !== "svg" && format !== "png" && format !== "jpg") {
    throw new ValidationError("format must be pdf, svg, png, or jpg");
  }

  return format;
}

export function normalizeScene(input: unknown): CartoonScene {
  const value = object(input, "scene");
  const elementsValue = value.elements;

  if (!Array.isArray(elementsValue)) {
    throw new ValidationError("scene.elements must be an array");
  }

  if (elementsValue.length === 0) {
    throw new ValidationError("scene.elements must include at least one element");
  }

  if (elementsValue.length > 1000) {
    throw new ValidationError("scene.elements cannot include more than 1000 elements");
  }

  return {
    document: normalizeDocument(value.document),
    elements: elementsValue.map((element, index) => normalizeElement(element, `scene.elements[${index}]`))
  };
}

function normalizeDocument(input: unknown): SceneDocument {
  if (input === undefined) {
    return {};
  }

  const value = object(input, "scene.document");
  const colorMode = value.colorMode === undefined ? undefined : stringValue(value.colorMode, "scene.document.colorMode");

  if (colorMode !== undefined && colorMode !== "RGB" && colorMode !== "CMYK") {
    throw new ValidationError("scene.document.colorMode must be RGB or CMYK");
  }

  return {
    title: optionalString(value.title, "scene.document.title", 120),
    width: optionalPositiveNumber(value.width, "scene.document.width", 14400),
    height: optionalPositiveNumber(value.height, "scene.document.height", 14400),
    colorMode
  };
}

function normalizeElement(input: unknown, path: string): SceneElement {
  const value = object(input, path);
  const type = stringValue(value.type, `${path}.type`);
  const base = {
    name: optionalString(value.name, `${path}.name`, 120),
    x: finiteNumber(value.x, `${path}.x`),
    y: finiteNumber(value.y, `${path}.y`),
    style: normalizeStyle(value.style, `${path}.style`)
  };

  if (type === "rect" || type === "ellipse") {
    return {
      ...base,
      type,
      width: positiveNumber(value.width, `${path}.width`, 14400),
      height: positiveNumber(value.height, `${path}.height`, 14400)
    };
  }

  if (type === "text") {
    return {
      ...base,
      type,
      text: stringValue(value.text, `${path}.text`, 5000),
      size: optionalPositiveNumber(value.size, `${path}.size`, 1000),
      font: optionalString(value.font, `${path}.font`, 200)
    };
  }

  if (type === "line") {
    return {
      ...base,
      type,
      x2: finiteNumber(value.x2, `${path}.x2`),
      y2: finiteNumber(value.y2, `${path}.y2`)
    };
  }

  if (type === "polygon") {
    if (!Array.isArray(value.points)) {
      throw new ValidationError(`${path}.points must be an array`);
    }
    if (value.points.length < 3) {
      throw new ValidationError(`${path}.points must contain at least 3 points`);
    }
    if (value.points.length > 500) {
      throw new ValidationError(`${path}.points cannot contain more than 500 points`);
    }
    return {
      ...base,
      type,
      points: value.points.map((point, index) => normalizePoint(point, `${path}.points[${index}]`))
    };
  }

  if (type === "path") {
    if (!Array.isArray(value.points)) {
      throw new ValidationError(`${path}.points must be an array`);
    }
    const closed = value.closed === undefined ? undefined : booleanValue(value.closed, `${path}.closed`);
    const minimumPoints = closed === false ? 2 : 3;
    if (value.points.length < minimumPoints) {
      throw new ValidationError(`${path}.points must contain at least ${minimumPoints} points`);
    }
    if (value.points.length > 500) {
      throw new ValidationError(`${path}.points cannot contain more than 500 points`);
    }
    return {
      ...base,
      type,
      points: value.points.map((point, index) => normalizePathPoint(point, `${path}.points[${index}]`)),
      closed
    };
  }

  throw new ValidationError(`${path}.type is not supported: ${type}`);
}

function normalizePoint(input: unknown, path: string): Point {
  const value = object(input, path);
  return {
    x: finiteNumber(value.x, `${path}.x`),
    y: finiteNumber(value.y, `${path}.y`)
  };
}

function normalizePathPoint(input: unknown, path: string): PathPoint {
  const value = object(input, path);
  const pointType = value.pointType === undefined ? undefined : stringValue(value.pointType, `${path}.pointType`);
  if (pointType !== undefined && pointType !== "corner" && pointType !== "smooth") {
    throw new ValidationError(`${path}.pointType must be corner or smooth`);
  }

  return {
    x: finiteNumber(value.x, `${path}.x`),
    y: finiteNumber(value.y, `${path}.y`),
    leftX: optionalFiniteNumber(value.leftX, `${path}.leftX`),
    leftY: optionalFiniteNumber(value.leftY, `${path}.leftY`),
    rightX: optionalFiniteNumber(value.rightX, `${path}.rightX`),
    rightY: optionalFiniteNumber(value.rightY, `${path}.rightY`),
    pointType
  };
}

function normalizeStyle(input: unknown, path: string): ElementStyle {
  if (input === undefined) {
    return {};
  }

  const value = object(input, path);
  return {
    fill: optionalColor(value.fill, `${path}.fill`),
    stroke: optionalColor(value.stroke, `${path}.stroke`),
    strokeWidth: optionalNonNegativeNumber(value.strokeWidth, `${path}.strokeWidth`, 1000),
    opacity: optionalNumberRange(value.opacity, `${path}.opacity`, 0, 100)
  };
}

function object(input: unknown, path: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ValidationError(`${path} must be an object`);
  }

  return input as Record<string, unknown>;
}

function stringValue(input: unknown, path: string, maxLength = 200): string {
  if (typeof input !== "string") {
    throw new ValidationError(`${path} must be a string`);
  }

  if (input.length > maxLength) {
    throw new ValidationError(`${path} cannot exceed ${maxLength} characters`);
  }

  return input;
}

function optionalString(input: unknown, path: string, maxLength: number): string | undefined {
  if (input === undefined) {
    return undefined;
  }

  return stringValue(input, path, maxLength);
}

function finiteNumber(input: unknown, path: string): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    throw new ValidationError(`${path} must be a finite number`);
  }

  return input;
}

function optionalFiniteNumber(input: unknown, path: string): number | undefined {
  if (input === undefined) {
    return undefined;
  }

  return finiteNumber(input, path);
}

function booleanValue(input: unknown, path: string): boolean {
  if (typeof input !== "boolean") {
    throw new ValidationError(`${path} must be a boolean`);
  }

  return input;
}

function positiveNumber(input: unknown, path: string, max: number): number {
  const value = finiteNumber(input, path);
  if (value <= 0 || value > max) {
    throw new ValidationError(`${path} must be greater than 0 and no more than ${max}`);
  }

  return value;
}

function optionalPositiveNumber(input: unknown, path: string, max: number): number | undefined {
  if (input === undefined) {
    return undefined;
  }

  return positiveNumber(input, path, max);
}

function optionalNonNegativeNumber(input: unknown, path: string, max: number): number | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = finiteNumber(input, path);
  if (value < 0 || value > max) {
    throw new ValidationError(`${path} must be between 0 and ${max}`);
  }

  return value;
}

function optionalNumberRange(input: unknown, path: string, min: number, max: number): number | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = finiteNumber(input, path);
  if (value < min || value > max) {
    throw new ValidationError(`${path} must be between ${min} and ${max}`);
  }

  return value;
}

function optionalColor(input: unknown, path: string): string | null | undefined {
  if (input === undefined || input === null) {
    return input;
  }

  const value = stringValue(input, path, 7);
  if (!HEX_COLOR.test(value)) {
    throw new ValidationError(`${path} must be a #RRGGBB color or null`);
  }

  return value.toUpperCase();
}
