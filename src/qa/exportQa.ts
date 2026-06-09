import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { analyzePngPixels, PngDecodeError } from "./pngPixels.js";

export type ExportFormat = "pdf" | "svg" | "png" | "jpg";

export interface ExportQaOptions {
  format?: ExportFormat;
  minBytes?: number;
  minWidth?: number;
  minHeight?: number;
  minNonBlankRatio?: number;
}

export interface ExportQaReport {
  ok: boolean;
  path: string;
  format: ExportFormat | "unknown";
  bytes: number;
  dimensions?: {
    width: number;
    height: number;
  };
  checks: ExportQaCheck[];
  details?: Record<string, unknown>;
}

export interface ExportQaCheck {
  id: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

export class ExportQaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportQaError";
  }
}

export async function inspectExportArtifact(path: string, options: ExportQaOptions = {}): Promise<ExportQaReport> {
  const fileStat = await stat(path);
  if (!fileStat.isFile()) {
    throw new ExportQaError(`Export artifact is not a file: ${path}`);
  }

  const buffer = await readFile(path);
  const format = options.format ?? detectFormat(path, buffer);
  const checks: ExportQaCheck[] = [];
  const minBytes = options.minBytes ?? 100;
  const dimensions = readDimensions(format, buffer);
  const details = readDetails(format, buffer) ?? {};

  checks.push(
    fileStat.size >= minBytes
      ? pass("file-size", `File size is ${fileStat.size} bytes.`)
      : fail("file-size", `File size is ${fileStat.size} bytes; expected at least ${minBytes}.`)
  );

  checks.push(format === "unknown" ? fail("format", "Could not detect export format.") : pass("format", `Detected ${format.toUpperCase()} export.`));

  if (dimensions) {
    const minWidth = options.minWidth ?? 100;
    const minHeight = options.minHeight ?? 100;
    checks.push(
      dimensions.width >= minWidth && dimensions.height >= minHeight
        ? pass("dimensions", `Dimensions are ${dimensions.width} x ${dimensions.height}.`)
        : fail("dimensions", `Dimensions are ${dimensions.width} x ${dimensions.height}; expected at least ${minWidth} x ${minHeight}.`)
    );
  } else if (format === "svg" || format === "png" || format === "jpg") {
    checks.push(warn("dimensions", "Could not determine export dimensions."));
  }

  if (format === "svg") {
    const vectorCount = Number(details.vectorElementCount ?? 0);
    checks.push(
      vectorCount > 0
        ? pass("svg-vector-elements", `SVG contains ${vectorCount} vector/text element(s).`)
        : fail("svg-vector-elements", "SVG does not contain recognizable vector/text elements.")
    );
  }

  if (format === "pdf") {
    const pageCount = Number(details.pageCount ?? 0);
    checks.push(pageCount > 0 ? pass("pdf-pages", `PDF appears to contain ${pageCount} page object(s).`) : warn("pdf-pages", "Could not count PDF pages."));
  }

  if (format === "png") {
    addPngPixelChecks(buffer, checks, details, options);
  }

  return {
    ok: checks.every((check) => check.status !== "fail"),
    path,
    format,
    bytes: fileStat.size,
    dimensions,
    checks,
    details
  };
}

function addPngPixelChecks(buffer: Buffer, checks: ExportQaCheck[], details: Record<string, unknown>, options: ExportQaOptions): void {
  const minNonBlankRatio = options.minNonBlankRatio ?? 0.001;
  if (!Number.isFinite(minNonBlankRatio) || minNonBlankRatio < 0 || minNonBlankRatio > 1) {
    throw new ExportQaError("minNonBlankRatio must be between 0 and 1");
  }

  try {
    const analysis = analyzePngPixels(buffer);
    details.pixelAnalysis = analysis;

    checks.push(
      analysis.nonBackgroundRatio >= minNonBlankRatio
        ? pass("png-nonblank-pixels", `PNG non-background content covers ${(analysis.nonBackgroundRatio * 100).toFixed(2)}% of pixels.`)
        : fail(
            "png-nonblank-pixels",
            `PNG appears blank: non-background content covers ${(analysis.nonBackgroundRatio * 100).toFixed(2)}% of pixels; expected at least ${(
              minNonBlankRatio * 100
            ).toFixed(2)}%.`
          )
    );

    if (analysis.contentBounds) {
      checks.push(
        analysis.touchesCanvasEdge
          ? warn("png-content-framing", "PNG content touches a canvas edge; inspect exported framing before publication use.")
          : pass("png-content-framing", "PNG content is inset from the canvas edge.")
      );
    }
  } catch (error) {
    checks.push(
      error instanceof PngDecodeError
        ? warn("png-pixel-analysis", `Could not inspect PNG pixels: ${error.message}.`)
        : warn("png-pixel-analysis", `Could not inspect PNG pixels: ${error instanceof Error ? error.message : String(error)}.`)
    );
  }
}

function detectFormat(path: string, buffer: Buffer): ExportFormat | "unknown" {
  const extension = extname(path).toLowerCase();

  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "pdf";
  }

  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return "jpg";
  }

  const sample = buffer.subarray(0, 512).toString("utf8").toLowerCase();
  if (extension === ".svg" || sample.includes("<svg")) {
    return "svg";
  }

  if (extension === ".pdf") {
    return "pdf";
  }

  if (extension === ".png") {
    return "png";
  }

  if (extension === ".jpg" || extension === ".jpeg") {
    return "jpg";
  }

  return "unknown";
}

function readDimensions(format: ExportFormat | "unknown", buffer: Buffer): { width: number; height: number } | undefined {
  if (format === "svg") {
    return readSvgDimensions(buffer.toString("utf8"));
  }

  if (format === "png") {
    return readPngDimensions(buffer);
  }

  if (format === "jpg") {
    return readJpegDimensions(buffer);
  }

  return undefined;
}

function readDetails(format: ExportFormat | "unknown", buffer: Buffer): Record<string, unknown> | undefined {
  if (format === "svg") {
    const text = buffer.toString("utf8");
    return {
      vectorElementCount: countMatches(text, /<(path|rect|circle|ellipse|polygon|polyline|line|text|image)\b/gi),
      hasText: /<text\b/i.test(text)
    };
  }

  if (format === "pdf") {
    const text = buffer.toString("latin1");
    return {
      pageCount: countMatches(text, /\/Type\s*\/Page\b/g)
    };
  }

  return undefined;
}

function readSvgDimensions(text: string): { width: number; height: number } | undefined {
  const svgTag = text.match(/<svg\b[^>]*>/i)?.[0];
  if (!svgTag) {
    return undefined;
  }

  const width = numericAttribute(svgTag, "width");
  const height = numericAttribute(svgTag, "height");
  if (width !== undefined && height !== undefined) {
    return { width, height };
  }

  const viewBox = svgTag.match(/\bviewBox=["']([^"']+)["']/i)?.[1];
  const parts = viewBox?.trim().split(/[\s,]+/).map(Number);
  if (parts?.length === 4 && parts.every(Number.isFinite)) {
    return {
      width: parts[2],
      height: parts[3]
    };
  }

  return undefined;
}

function numericAttribute(text: string, name: string): number | undefined {
  const match = text.match(new RegExp(`\\b${name}=["']([0-9.]+)(?:px|pt|in|cm|mm)?["']`, "i"));
  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function readPngDimensions(buffer: Buffer): { width: number; height: number } | undefined {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return undefined;
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function readJpegDimensions(buffer: Buffer): { width: number; height: number } | undefined {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return undefined;
  }

  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7)
      };
    }

    offset += 2 + length;
  }

  return undefined;
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

function pass(id: string, message: string): ExportQaCheck {
  return { id, status: "pass", message };
}

function warn(id: string, message: string): ExportQaCheck {
  return { id, status: "warn", message };
}

function fail(id: string, message: string): ExportQaCheck {
  return { id, status: "fail", message };
}
