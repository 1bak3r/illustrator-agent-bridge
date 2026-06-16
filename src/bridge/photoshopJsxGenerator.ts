import type { GeneratedPhotoshopJob, PhotoshopCommand, PhotoshopProjectPassCommand, PhotoshopSvgProofCommand } from "./photoshopTypes.js";

export interface GeneratePhotoshopOptions {
  id: string;
  resultPath: string;
}

export function generatePhotoshopJsx(command: PhotoshopCommand, options: GeneratePhotoshopOptions): string {
  if (command.kind === "ping") {
    return generatePingJsx(command.message ?? "hello from illustrator-agent-bridge Photoshop leg", options);
  }

  if (command.kind === "svg_proof") {
    return generateSvgProofJsx(command, options);
  }

  return generateProjectPassJsx(command, options);
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

function generateProjectPassJsx(command: PhotoshopProjectPassCommand, options: GeneratePhotoshopOptions): string {
  const passName = command.passName ?? "Photoshop project pass";
  const prompt = command.prompt ?? "Illustrator and Photoshop collaborative project";
  const note =
    "Photoshop pass: layered raster working file, contrast/texture check, and SVG handoff for the next Illustrator pass.";

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
    "      throw new Error('Input SVG/project file does not exist: ' + inputFile.fsName);",
    "    }",
    `    var outputPngFile = new File(${jsonLiteral(command.outputPngPath)});`,
    `    var outputSvgFile = new File(${jsonLiteral(command.outputSvgPath)});`,
    `    var outputPsdFile = new File(${jsonLiteral(command.outputPsdPath)});`,
    `    var feedbackFile = new File(${jsonLiteral(command.feedbackPath)});`,
    "    ensureParent(outputPngFile);",
    "    ensureParent(outputSvgFile);",
    "    ensureParent(outputPsdFile);",
    "    ensureParent(feedbackFile);",
    "    doc = app.open(inputFile);",
    resizeStatement(command),
    "    var proofWidth = dimensionPixels(doc.width);",
    "    var proofHeight = dimensionPixels(doc.height);",
    "    var washLayer = doc.artLayers.add();",
    "    washLayer.name = 'Photoshop tonal pass';",
    "    var washColor = new SolidColor();",
    "    washColor.rgb.red = 246;",
    "    washColor.rgb.green = 248;",
    "    washColor.rgb.blue = 252;",
    "    doc.selection.select([[0, 0], [proofWidth, 0], [proofWidth, proofHeight], [0, proofHeight]]);",
    "    doc.selection.fill(washColor, ColorBlendMode.NORMAL, 100, false);",
    "    doc.selection.deselect();",
    "    washLayer.opacity = 10;",
    "    var noteLayer = doc.artLayers.add();",
    "    noteLayer.name = 'Photoshop project notes';",
    "    noteLayer.kind = LayerKind.TEXT;",
    `    noteLayer.textItem.contents = ${jsonLiteral(passName)} + '\\r' + ${jsonLiteral(note)};`,
    "    noteLayer.textItem.position = [24, 36];",
    "    noteLayer.textItem.size = 16;",
    "    var noteColor = new SolidColor();",
    "    noteColor.rgb.red = 24;",
    "    noteColor.rgb.green = 37;",
    "    noteColor.rgb.blue = 58;",
    "    noteLayer.textItem.color = noteColor;",
    "    var psdOptions = new PhotoshopSaveOptions();",
    "    psdOptions.layers = true;",
    "    doc.saveAs(outputPsdFile, psdOptions, true, Extension.LOWERCASE);",
    "    var pngOptions = new PNGSaveOptions();",
    "    doc.saveAs(outputPngFile, pngOptions, true, Extension.LOWERCASE);",
    `    var handoffTitle = ${jsonLiteral(passName)};`,
    `    var handoffNote = ${jsonLiteral(note)};`,
    "    var safeInnerWidth = Math.max(120, proofWidth - 64);",
    "    var svgText = '<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"' + proofWidth + '\" height=\"' + proofHeight + '\" viewBox=\"0 0 ' + proofWidth + ' ' + proofHeight + '\">';",
    "    svgText += '<rect x=\"0\" y=\"0\" width=\"' + proofWidth + '\" height=\"' + proofHeight + '\" fill=\"none\" stroke=\"#2563EB\" stroke-width=\"12\" opacity=\"0.45\"/>';",
    "    svgText += '<rect x=\"32\" y=\"32\" width=\"' + safeInnerWidth + '\" height=\"112\" fill=\"#EFF6FF\" stroke=\"#1D4ED8\" stroke-width=\"4\" opacity=\"0.88\"/>';",
    "    svgText += '<text x=\"56\" y=\"78\" font-size=\"30\" fill=\"#1E3A8A\" font-family=\"Arial, sans-serif\">' + xmlText(handoffTitle) + '</text>';",
    "    svgText += '<text x=\"56\" y=\"116\" font-size=\"20\" fill=\"#1E40AF\" font-family=\"Arial, sans-serif\">' + xmlText(handoffNote) + '</text>';",
    "    svgText += '<path d=\"M 56 168 C ' + Math.round(proofWidth * 0.33) + ' 116, ' + Math.round(proofWidth * 0.66) + ' 220, ' + (proofWidth - 56) + ' 168\" fill=\"none\" stroke=\"#2563EB\" stroke-width=\"8\" stroke-linecap=\"round\" opacity=\"0.5\"/>';",
    "    svgText += '<circle cx=\"56\" cy=\"168\" r=\"18\" fill=\"#DBEAFE\" stroke=\"#1D4ED8\" stroke-width=\"5\" opacity=\"0.92\"/>';",
    "    svgText += '<circle cx=\"' + (proofWidth - 56) + '\" cy=\"168\" r=\"18\" fill=\"#DBEAFE\" stroke=\"#1D4ED8\" stroke-width=\"5\" opacity=\"0.92\"/>';",
    "    svgText += '</svg>';",
    "    writeText(outputSvgFile.fsName, svgText);",
    "    var feedbackText = '{\"ok\":true,\"kind\":\"photoshop_project_pass\",\"prompt\":' + jsonString(" +
      jsonLiteral(prompt) +
      ") + ',\"passName\":' + jsonString(" +
      jsonLiteral(passName) +
      ") + ',\"inputPath\":" +
      jsonLiteral(command.inputPath) +
      ",\"outputPngPath\":" +
      jsonLiteral(command.outputPngPath) +
      ",\"outputSvgPath\":" +
      jsonLiteral(command.outputSvgPath) +
      ",\"outputPsdPath\":" +
      jsonLiteral(command.outputPsdPath) +
      ",\"width\":' + proofWidth + ',\"height\":' + proofHeight + ',\"recommendedIllustratorAction\":' + jsonString('Place the Photoshop SVG handoff as a named reference layer, keep the vector source editable, and export the final project SVG after the return pass.') + ',\"notes\":[' + jsonString(" +
      jsonLiteral(note) +
      ") + ']}';",
    "    writeText(feedbackFile.fsName, feedbackText);",
    "    doc.close(SaveOptions.DONOTSAVECHANGES);",
    "    doc = null;",
    "    app.displayDialogs = previousDialogs;",
    `    writeResult('{"ok":true,"jobId":${jsonLiteral(options.id)},"kind":"project_pass","inputPath":${jsonLiteral(command.inputPath)},"outputPngPath":${jsonLiteral(command.outputPngPath)},"outputSvgPath":${jsonLiteral(command.outputSvgPath)},"outputPsdPath":${jsonLiteral(command.outputPsdPath)},"feedbackPath":${jsonLiteral(command.feedbackPath)},"width":' + proofWidth + ',"height":' + proofHeight + ',"app":"Adobe Photoshop","version":' + jsonString(app.version) + '}');`,
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
    "  function xmlText(value) {",
    "    var text = String(value);",
    "    text = text.replace(/&/g, '&amp;');",
    "    text = text.replace(/</g, '&lt;');",
    "    text = text.replace(/>/g, '&gt;');",
    "    text = text.replace(/\"/g, '&quot;');",
    "    return text;",
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

function resizeStatement(command: PhotoshopSvgProofCommand | PhotoshopProjectPassCommand): string {
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
