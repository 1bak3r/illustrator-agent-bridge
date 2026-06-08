import test from "node:test";
import assert from "node:assert/strict";
import { generateJsx } from "../src/bridge/jsxGenerator.js";

test("generates an Illustrator-targeted ping JSX job with a result path", () => {
  const jsx = generateJsx(
    { kind: "ping", message: "quote \" and slash \\" },
    { id: "job-1", resultPath: "/tmp/illustrator-agent/result.json" }
  );

  assert.match(jsx, /#target illustrator/);
  assert.match(jsx, /writeResult/);
  assert.match(jsx, /result\.json/);
  assert.match(jsx, /quote \\\" and slash/);
});

test("generates named vector elements for a cartoon scene", () => {
  const jsx = generateJsx(
    {
      kind: "cartoon_scene",
      scene: {
        document: { title: "Smoke", width: 100, height: 100 },
        elements: [
          {
            type: "ellipse",
            name: "head",
            x: 10,
            y: 15,
            width: 30,
            height: 30,
            style: { fill: "#FFFFFF", stroke: "#111111" }
          }
        ]
      }
    },
    { id: "job-2", resultPath: "/tmp/illustrator-agent/result.json" }
  );

  assert.match(jsx, /app\.documents\.add\(DocumentColorSpace\.RGB, 100, 100\)/);
  assert.match(jsx, /layer\.pathItems\.ellipse/);
  assert.match(jsx, /"head"/);
});

test("generates an Illustrator export JSX job", () => {
  const jsx = generateJsx(
    {
      kind: "export",
      format: "pdf",
      outputPath: "C:/Users/example/out/figure.pdf"
    },
    { id: "job-3", resultPath: "C:/Users/example/out/result.json" }
  );

  assert.match(jsx, /PDFSaveOptions/);
  assert.match(jsx, /doc\.saveAs\(outputFile, pdfOptions\)/);
  assert.match(jsx, /figure\.pdf/);
});
