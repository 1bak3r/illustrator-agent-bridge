import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCommand, ValidationError } from "../src/bridge/validation.js";

test("normalizes a ping command", () => {
  assert.deepEqual(normalizeCommand({ kind: "ping", message: "hi" }), {
    kind: "ping",
    message: "hi"
  });
});

test("rejects invalid colors before JSX generation", () => {
  assert.throws(
    () =>
      normalizeCommand({
        kind: "cartoon_scene",
        scene: {
          elements: [
            {
              type: "rect",
              x: 0,
              y: 0,
              width: 10,
              height: 10,
              style: { fill: "red" }
            }
          ]
        }
      }),
    ValidationError
  );
});

test("normalizes export commands", () => {
  assert.deepEqual(
    normalizeCommand({
      kind: "export",
      format: "PDF",
      outputPath: "out/figure.pdf"
    }),
    {
      kind: "export",
      format: "pdf",
      outputPath: "out/figure.pdf"
    }
  );
});

test("normalizes curved path elements", () => {
  const command = normalizeCommand({
    kind: "cartoon_scene",
    scene: {
      elements: [
        {
          type: "path",
          name: "curve",
          x: 0,
          y: 0,
          closed: false,
          points: [
            { x: 0, y: 0, rightX: 20, rightY: 0, pointType: "smooth" },
            { x: 40, y: 40, leftX: 20, leftY: 40, pointType: "corner" }
          ],
          style: { fill: null, stroke: "#abcdef" }
        }
      ]
    }
  });

  assert.equal(command.kind, "cartoon_scene");
  if (command.kind !== "cartoon_scene") {
    throw new Error("expected cartoon_scene command");
  }
  assert.equal(command.scene.elements[0]?.type, "path");
  assert.equal(command.scene.elements[0]?.style?.fill, null);
  assert.equal(command.scene.elements[0]?.style?.stroke, "#ABCDEF");
});

test("rejects closed path elements with fewer than three points", () => {
  assert.throws(
    () =>
      normalizeCommand({
        kind: "cartoon_scene",
        scene: {
          elements: [
            {
              type: "path",
              x: 0,
              y: 0,
              points: [
                { x: 0, y: 0 },
                { x: 10, y: 10 }
              ]
            }
          ]
        }
      }),
    ValidationError
  );
});
