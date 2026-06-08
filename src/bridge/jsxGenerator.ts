import type { BridgeCommand, CartoonScene, ElementStyle, ExportCommand, GeneratedJob, SceneElement } from "./types.js";

const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT = 480;

export interface GenerateOptions {
  id: string;
  resultPath: string;
}

export function generateJsx(command: BridgeCommand, options: GenerateOptions): string {
  if (command.kind === "ping") {
    return generatePingJsx(command.message ?? "hello from illustrator-agent-bridge", options);
  }

  if (command.kind === "cartoon_scene") {
    return generateCartoonSceneJsx(command.scene, options);
  }

  return generateExportJsx(command, options);
}

function generatePingJsx(message: string, options: GenerateOptions): string {
  return [
    "#target illustrator",
    "(function () {",
    runtimeFunctions(options),
    "  try {",
    `    writeResult('{"ok":true,"jobId":${jsonLiteral(options.id)},"kind":"ping","message":' + jsonString(${jsonLiteral(message)}) + ',"app":"Adobe Illustrator","version":' + jsonString(app.version) + '}');`,
    "  } catch (e) {",
    "    writeFailure(e);",
    "    throw e;",
    "  }",
    "}());",
    ""
  ].join("\n");
}

function generateCartoonSceneJsx(scene: CartoonScene, options: GenerateOptions): string {
  const document = scene.document ?? {};
  const width = document.width ?? DEFAULT_WIDTH;
  const height = document.height ?? DEFAULT_HEIGHT;
  const colorMode = document.colorMode ?? "RGB";
  const title = document.title ?? "Illustrator Agent Scene";

  const lines = [
    "#target illustrator",
    "(function () {",
    runtimeFunctions(options),
    "  try {",
    `    var doc = app.documents.add(DocumentColorSpace.${colorMode}, ${numberLiteral(width)}, ${numberLiteral(height)});`,
    "    doc.rulerUnits = RulerUnits.Points;",
    "    var layer = doc.activeLayer;",
    `    layer.name = ${jsonLiteral(`Agent Bridge - ${title}`)};`,
    `    var docHeight = ${numberLiteral(height)};`,
    ...scene.elements.map((element, index) => drawElement(element, index)),
    "    app.redraw();",
    `    writeResult('{"ok":true,"jobId":${jsonLiteral(options.id)},"kind":"cartoon_scene","documentName":' + jsonString(doc.name) + ',"elementCount":${scene.elements.length},"app":"Adobe Illustrator","version":' + jsonString(app.version) + '}');`,
    "  } catch (e) {",
    "    writeFailure(e);",
    "    throw e;",
    "  }",
    "}());",
    ""
  ];

  return lines.join("\n");
}

function generateExportJsx(command: ExportCommand, options: GenerateOptions): string {
  return [
    "#target illustrator",
    "(function () {",
    runtimeFunctions(options),
    "  try {",
    "    if (app.documents.length === 0) {",
    "      throw new Error('No active Illustrator document to export.');",
    "    }",
    "    var doc = app.activeDocument;",
    `    var outputFile = new File(${jsonLiteral(command.outputPath)});`,
    "    ensureParent(outputFile);",
    exportStatement(command),
    "    app.redraw();",
    `    writeResult('{"ok":true,"jobId":${jsonLiteral(options.id)},"kind":"export","format":${jsonLiteral(command.format)},"outputPath":${jsonLiteral(command.outputPath)},"documentName":' + jsonString(doc.name) + ',"app":"Adobe Illustrator","version":' + jsonString(app.version) + '}');`,
    "  } catch (e) {",
    "    writeFailure(e);",
    "    throw e;",
    "  }",
    "}());",
    ""
  ].join("\n");
}

function runtimeFunctions(options: GenerateOptions): string {
  return [
    `  var resultPath = ${jsonLiteral(options.resultPath)};`,
    "  function ensureParent(file) {",
    "    if (file.parent && !file.parent.exists) {",
    "      file.parent.create();",
    "    }",
    "  }",
    "  function writeText(path, text) {",
    "    var file = new File(path);",
    "    ensureParent(file);",
    "    file.encoding = 'UTF-8';",
    "    file.open('w');",
    "    file.write(text);",
    "    file.close();",
    "  }",
    "  function writeResult(text) {",
    "    writeText(resultPath, text);",
    "  }",
    "  function jsonString(value) {",
    "    var text = String(value);",
    "    text = text.replace(/\\\\/g, '\\\\\\\\');",
    "    text = text.replace(/\"/g, '\\\\\"');",
    "    text = text.replace(/\\r/g, '\\\\r');",
    "    text = text.replace(/\\n/g, '\\\\n');",
    "    text = text.replace(/\\t/g, '\\\\t');",
    "    return '\"' + text + '\"';",
    "  }",
    "  function writeFailure(error) {",
    `    writeResult('{"ok":false,"jobId":${jsonLiteral(options.id)},"error":' + jsonString(error && error.toString ? error.toString() : error) + '}');`,
    "  }",
    "  function rgb(hex) {",
    "    var color = new RGBColor();",
    "    color.red = parseInt(hex.substring(1, 3), 16);",
    "    color.green = parseInt(hex.substring(3, 5), 16);",
    "    color.blue = parseInt(hex.substring(5, 7), 16);",
    "    return color;",
    "  }",
    "  function applyPathStyle(item, fill, stroke, strokeWidth, opacity) {",
    "    if (fill === null) {",
    "      item.filled = false;",
    "    } else {",
    "      item.filled = true;",
    "      item.fillColor = rgb(fill);",
    "    }",
    "    if (stroke === null) {",
    "      item.stroked = false;",
    "    } else {",
    "      item.stroked = true;",
    "      item.strokeColor = rgb(stroke);",
    "      item.strokeWidth = strokeWidth;",
    "    }",
    "    item.opacity = opacity;",
    "  }"
  ].join("\n");
}

function drawElement(element: SceneElement, index: number): string {
  const name = element.name ?? `${element.type}_${index + 1}`;
  const style = withStyleDefaults(element.style);

  if (element.type === "rect") {
    return [
      `    var item${index} = layer.pathItems.rectangle(docHeight - ${numberLiteral(element.y)}, ${numberLiteral(element.x)}, ${numberLiteral(element.width)}, ${numberLiteral(element.height)});`,
      `    item${index}.name = ${jsonLiteral(name)};`,
      styleLine(index, style)
    ].join("\n");
  }

  if (element.type === "ellipse") {
    return [
      `    var item${index} = layer.pathItems.ellipse(docHeight - ${numberLiteral(element.y)}, ${numberLiteral(element.x)}, ${numberLiteral(element.width)}, ${numberLiteral(element.height)});`,
      `    item${index}.name = ${jsonLiteral(name)};`,
      styleLine(index, style)
    ].join("\n");
  }

  if (element.type === "line") {
    const stroke = style.stroke ?? "#111111";
    return [
      `    var item${index} = layer.pathItems.add();`,
      `    item${index}.name = ${jsonLiteral(name)};`,
      `    item${index}.setEntirePath([[${numberLiteral(element.x)}, docHeight - ${numberLiteral(element.y)}], [${numberLiteral(element.x2)}, docHeight - ${numberLiteral(element.y2)}]]);`,
      `    applyPathStyle(item${index}, null, ${jsonLiteral(stroke)}, ${numberLiteral(style.strokeWidth)}, ${numberLiteral(style.opacity)});`
    ].join("\n");
  }

  if (element.type === "polygon") {
    const points = element.points
      .map((point) => `[${numberLiteral(point.x)}, docHeight - ${numberLiteral(point.y)}]`)
      .join(", ");
    return [
      `    var item${index} = layer.pathItems.add();`,
      `    item${index}.name = ${jsonLiteral(name)};`,
      `    item${index}.setEntirePath([${points}]);`,
      `    item${index}.closed = true;`,
      styleLine(index, style)
    ].join("\n");
  }

  const fill = style.fill ?? "#111111";
  return [
    `    var item${index} = layer.textFrames.add();`,
    `    item${index}.name = ${jsonLiteral(name)};`,
    `    item${index}.contents = ${jsonLiteral(element.text)};`,
    `    item${index}.left = ${numberLiteral(element.x)};`,
    `    item${index}.top = docHeight - ${numberLiteral(element.y)};`,
    `    item${index}.textRange.characterAttributes.size = ${numberLiteral(element.size ?? 18)};`,
    `    item${index}.textRange.characterAttributes.fillColor = rgb(${jsonLiteral(fill)});`,
    `    item${index}.opacity = ${numberLiteral(style.opacity)};`,
    element.font ? `    try { item${index}.textRange.characterAttributes.textFont = app.textFonts.getByName(${jsonLiteral(element.font)}); } catch (fontError) {}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function exportStatement(command: ExportCommand): string {
  if (command.format === "pdf") {
    return [
      "    var pdfOptions = new PDFSaveOptions();",
      "    pdfOptions.preserveEditability = true;",
      "    doc.saveAs(outputFile, pdfOptions);"
    ].join("\n");
  }

  if (command.format === "svg") {
    return [
      "    var svgOptions = new ExportOptionsSVG();",
      "    svgOptions.embedRasterImages = true;",
      "    doc.exportFile(outputFile, ExportType.SVG, svgOptions);"
    ].join("\n");
  }

  if (command.format === "png") {
    return [
      "    var pngOptions = new ExportOptionsPNG24();",
      "    pngOptions.antiAliasing = true;",
      "    pngOptions.transparency = true;",
      "    pngOptions.artBoardClipping = true;",
      "    doc.exportFile(outputFile, ExportType.PNG24, pngOptions);"
    ].join("\n");
  }

  return [
    "    var jpgOptions = new ExportOptionsJPEG();",
    "    jpgOptions.antiAliasing = true;",
    "    jpgOptions.qualitySetting = 90;",
    "    jpgOptions.artBoardClipping = true;",
    "    doc.exportFile(outputFile, ExportType.JPEG, jpgOptions);"
  ].join("\n");
}

function withStyleDefaults(style: ElementStyle | undefined): Required<ElementStyle> {
  return {
    fill: style?.fill === undefined ? "#FFFFFF" : style.fill,
    stroke: style?.stroke === undefined ? "#111111" : style.stroke,
    strokeWidth: style?.strokeWidth ?? 2,
    opacity: style?.opacity ?? 100
  };
}

function styleLine(index: number, style: Required<ElementStyle>): string {
  return `    applyPathStyle(item${index}, ${nullableString(style.fill)}, ${nullableString(style.stroke)}, ${numberLiteral(style.strokeWidth)}, ${numberLiteral(style.opacity)});`;
}

function nullableString(value: string | null): string {
  return value === null ? "null" : jsonLiteral(value);
}

function jsonLiteral(value: string): string {
  return JSON.stringify(value);
}

function numberLiteral(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot emit non-finite number: ${value}`);
  }

  return String(value);
}

export function generatedJobSummary(job: GeneratedJob): Record<string, string> {
  return {
    id: job.id,
    jobPath: job.jobPath,
    resultPath: job.resultPath,
    illustratorJobPath: job.illustratorJobPath,
    illustratorResultPath: job.illustratorResultPath
  };
}
