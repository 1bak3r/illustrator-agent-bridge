import test from "node:test";
import assert from "node:assert/strict";
import { toIllustratorPath } from "../src/bridge/files.js";

test("converts WSL Windows mount paths to Illustrator-friendly Windows paths", () => {
  assert.equal(
    toIllustratorPath("/mnt/c/Users/example/IllustratorAgentBridge/var/results/job.json"),
    "C:/Users/example/IllustratorAgentBridge/var/results/job.json"
  );
});

test("leaves non-Windows paths normalized", () => {
  assert.equal(toIllustratorPath("/home/example/result.json"), "/home/example/result.json");
});
