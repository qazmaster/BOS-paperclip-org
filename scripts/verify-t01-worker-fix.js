import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const file = readFileSync("plugin-bos-light/dist/worker.js", "utf8");

assert(
  !file.includes("target_division"),
  "worker.js must NOT contain snake_case 'target_division'"
);

assert(
  file.includes("targetDivision"),
  "worker.js must contain camelCase 'targetDivision'"
);

console.log("✅ verify-t01-worker-fix.js: all assertions passed");
process.exit(0);
