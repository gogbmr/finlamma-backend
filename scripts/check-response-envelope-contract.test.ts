// Guards against the exact gap this batch fixed: a route's registered
// OpenAPI response schema (what docs/API_ENDPOINTS.md documents, and what
// the app was built against) silently diverging from what the handler
// actually returns at runtime - see scripts/check-response-envelope-contract.ts
// for the scan itself and its documented heuristics/limitations.
import { describe, expect, it } from "vitest";
import { findEnvelopeContractFindings } from "./check-response-envelope-contract";

describe("every src/app/api/v1 route's response envelope matches its documented schema", () => {
  it("has no un-suppressed finding", () => {
    const findings = findEnvelopeContractFindings();
    const formatted = findings.map((f) => `${f.method} ${f.path} (${f.file}) - ${f.reason}`);

    expect(formatted).toEqual([]);
  });
});
