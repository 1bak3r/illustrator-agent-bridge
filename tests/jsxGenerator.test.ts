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

test("generates curved path vector elements for a complex scene", () => {
  const jsx = generateJsx(
    {
      kind: "cartoon_scene",
      scene: {
        document: { title: "Path Smoke", width: 200, height: 200 },
        elements: [
          {
            type: "path",
            name: "curved ribbon",
            x: 0,
            y: 0,
            closed: false,
            points: [
              { x: 10, y: 80, rightX: 40, rightY: 20, pointType: "smooth" },
              { x: 100, y: 80, leftX: 70, leftY: 140, rightX: 130, rightY: 20, pointType: "smooth" },
              { x: 190, y: 80, leftX: 160, leftY: 140, pointType: "smooth" }
            ],
            style: { fill: null, stroke: "#2667FF", strokeWidth: 8 }
          }
        ]
      }
    },
    { id: "job-path", resultPath: "/tmp/illustrator-agent/result.json" }
  );

  assert.match(jsx, /"curved ribbon"/);
  assert.match(jsx, /pathItems\.add/);
  assert.match(jsx, /leftDirection = \[70, docHeight - 140\]/);
  assert.match(jsx, /rightDirection = \[40, docHeight - 20\]/);
  assert.match(jsx, /PointType\.SMOOTH/);
  assert.match(jsx, /item0\.closed = false/);
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
