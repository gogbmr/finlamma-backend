#!/usr/bin/env node
// Runs automatically after `pnpm test` (package.json's `posttest`) - reads
// the JSON report `test` just wrote (tests/.last-run.json, via vitest's
// --reporter=json --outputFile.json) and fails the overall `pnpm test`
// invocation if the real test count dropped below tests/min-count.json's
// floor. Exists because a Write call once silently overwrote an existing
// test file (see docs/STATUS.md, Phase 3a) - the suite still reported
// "passing" afterward since nothing else checks for a minimum count, so
// the regression wasn't visible from the test run alone. Bump
// tests/min-count.json deliberately, in the same commit, whenever tests are
// intentionally removed or consolidated.
import { readFileSync } from "node:fs";

const RESULT_PATH = "tests/.last-run.json";
const FLOOR_PATH = "tests/min-count.json";

function readJson(path, whatFor) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.error(`check-test-count: could not read ${path} (${whatFor}): ${err.message}`);
    process.exit(1);
  }
}

const result = readJson(RESULT_PATH, "vitest's JSON report");
const floor = readJson(FLOOR_PATH, "the committed test-count floor");

const actual = result.numTotalTests;
if (typeof actual !== "number") {
  console.error(`check-test-count: ${RESULT_PATH} has no numeric numTotalTests - vitest's JSON reporter shape may have changed`);
  process.exit(1);
}

if (actual < floor.minTestCount) {
  console.error(
    `check-test-count: FAILED - only ${actual} tests ran, below the floor of ${floor.minTestCount} ` +
      `in ${FLOOR_PATH}.\n` +
      "If this is a real, deliberate test removal, update tests/min-count.json in the SAME commit " +
      "and explain why in the commit message. If it's not deliberate, a test file was probably " +
      "overwritten or deleted by mistake - check `git status`/`git diff` for *.test.ts files before " +
      "assuming this is fine.",
  );
  process.exit(1);
}

console.log(`check-test-count: OK (${actual} tests, floor ${floor.minTestCount})`);
