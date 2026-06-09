import test from "node:test";
import assert from "node:assert/strict";
import { toIllustratorPath } from "../src/bridge/files.js";

test("converts WSL Windows mount paths to Illustrator-friendly Windows paths", () => {
  assert.equal(
    toIllustratorPath("/mnt/c/Users/example/IllustratorAgentBridge/var/results/job.json"),
    "C:/Users/example/IllustratorAgentBridge/var/results/job.json"
  );
});

test("converts WSL Linux paths to UNC paths for Windows Illustrator", () => {
  const previousDistro = process.env.WSL_DISTRO_NAME;
  process.env.WSL_DISTRO_NAME = "Ubuntu";
  try {
    assert.equal(toIllustratorPath("/home/example/result.json", "wsl"), "//wsl.localhost/Ubuntu/home/example/result.json");
  } finally {
    if (previousDistro === undefined) {
      delete process.env.WSL_DISTRO_NAME;
    } else {
      process.env.WSL_DISTRO_NAME = previousDistro;
    }
  }
});

test("leaves non-Windows paths normalized for Linux Illustrator hosts", () => {
  assert.equal(toIllustratorPath("/home/example/result.json", "linux"), "/home/example/result.json");
});
