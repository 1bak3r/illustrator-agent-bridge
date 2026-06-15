import type { GeneratedPhotoshopJob, PhotoshopCommand, PhotoshopSvgProofCommand } from "./photoshopTypes.js";

export interface GeneratePhotoshopOptions {
  id: string;
  resultPath: string;
}

export function generatePhotoshopJsx(command: PhotoshopCommand, options: GeneratePhotoshopOptions): string {
  if (command.kind === "ping") {
    return generatePingJsx(command.message ?? "hello from illustrator-agent-bridge Photoshop leg", options);
  }

  return generateSvgProofJsx(command, options);
}

export function generatedPhotoshopJobSummary(job: GeneratedPhotoshopJob) {
  return {
    id: job.id,
    jobPath: job.jobPath,
    resultPath: job.resultPath,
    photoshopJobPath: job.photoshopJobPath,
    photoshopResultPath: job.photoshopResultPath
  };
}

function generatePingJsx(message: string, options: GeneratePhotoshopOptions): string {
  return [
    "#target photoshop",
    "(function () {",
    runtimeFunctions(options),
    "  try {",
    `    writeResult('{"ok":true,"jobId":${jsonLiteral(options.id)},"kind":"ping","message":' + jsonString(${jsonLiteral(message)}) + ',"app":"Adobe Photoshop","version":' + jsonString(app.version) + '}');`,
    "  } catch (e) {",
    "    writeFailure(e);",
    "    throw e;",
    "  }",
    "}());",
    ""
  ].join("\n");
}

function generateSvgProofJsx(command: PhotoshopSvgProofCommand, options: GeneratePhotoshopOptions): string {
  return [
    "#target photoshop",
    "(function () {",
    runtimeFunctions(options),
    "  var previousDialogs = null;",
    "  var doc = null;",
    "  try {",
    "    previousDialogs = app.displayDialogs;",
    "    app.displayDialogs = DialogModes.NO;",
    `    var inputFile = new File(${jsonLiteral(command.inputPath)});`,
    "    if (!inputFile.exists) {",
    "      throw new Error('Input SVG/proof file does not exist: ' + inputFile.fsName);",
    "    }",
    `    var outputFile = new File(${jsonLiteral(command.outputPath)});`,
    "    ensureParent(outputFile);",
    "    doc = app.open(inputFile);",
    resizeStatement(command),
    "    var proofWidth = dimensionPixels(doc.width);",
    "    var proofHeight = dimensionPixels(doc.height);",
    "    var pngOptions = new PNGSaveOptions();",
    "    doc.saveAs(outputFile, pngOptions, true, Extension.LOWERCASE);",
    "    doc.close(SaveOptions.DONOTSAVECHANGES);",
    "    doc = null;",
    "    app.displayDialogs = previousDialogs;",
    `    writeResult('{"ok":true,"jobId":${jsonLiteral(options.id)},"kind":"svg_proof","inputPath":${jsonLiteral(command.inputPath)},"outputPath":${jsonLiteral(command.outputPath)},"width":' + proofWidth + ',"height":' + proofHeight + ',"app":"Adobe Photoshop","version":' + jsonString(app.version) + '}');`,
    "  } catch (e) {",
    "    try { if (doc !== null) { doc.close(SaveOptions.DONOTSAVECHANGES); } } catch (closeError) {}",
    "    try { if (previousDialogs !== null) { app.displayDialogs = previousDialogs; } } catch (dialogError) {}",
    "    writeFailure(e);",
    "    throw e;",
    "  }",
    "}());",
    ""
  ].join("\n");
}

function runtimeFunctions(options: GeneratePhotoshopOptions): string {
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
    "  function dimensionPixels(value) {",
    "    try {",
    "      return Math.round(value.as('px'));",
    "    } catch (e) {",
    "      return Math.round(Number(value));",
    "    }",
    "  }",
    "  function writeFailure(error) {",
    `    writeResult('{"ok":false,"jobId":${jsonLiteral(options.id)},"error":' + jsonString(error && error.toString ? error.toString() : error) + '}');`,
    "  }"
  ].join("\n");
}

function resizeStatement(command: PhotoshopSvgProofCommand): string {
  if (command.width === undefined && command.height === undefined && command.resolution === undefined) {
    return "    // Keep Photoshop's native SVG rasterization size for proofing.";
  }

  const width = command.width === undefined ? "null" : `UnitValue(${numberLiteral(command.width)}, 'px')`;
  const height = command.height === undefined ? "null" : `UnitValue(${numberLiteral(command.height)}, 'px')`;
  const resolution = command.resolution === undefined ? "null" : numberLiteral(command.resolution);

  return `    doc.resizeImage(${width}, ${height}, ${resolution}, ResampleMethod.BICUBIC);`;
}

function jsonLiteral(value: string): string {
  return JSON.stringify(value);
}

function numberLiteral(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid number for Photoshop JSX generation: ${value}`);
  }

  return String(Math.round(value * 1000) / 1000);
}
