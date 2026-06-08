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
