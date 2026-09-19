import { randomUUID } from "node:crypto";

// Generated, collision-proof test values. Never hardcode an email/clerk id
// in a test - a fixed value that hits a unique constraint (like a fixed
// email) is exactly what caused a false CONFLICT failure when two copies
// of the same test suite ran against a shared database at once.
export function uniqueEmail(label: string): string {
  return `${label}-${randomUUID()}@example.test`;
}

export function uniqueClerkUserId(label: string): string {
  return `${label}_${randomUUID()}`;
}
