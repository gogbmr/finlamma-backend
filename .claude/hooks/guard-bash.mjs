#!/usr/bin/env node
// PreToolUse hook (matcher: Bash). Blocks destructive or secret-leaking shell commands.
// Exit code 2 = block the command and show the reason to Claude.
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const cmd = (input.tool_input?.command ?? "").toString();

const rules = [
  [/\brm\s+-[a-z]*r[a-z]*f?\s+(\/|~|\.\s*$|\*)/i, "Recursive delete of a root, home or whole-project path"],
  [/\bgit\s+push\b.*(--force|-f\b)/i, "Force push"],
  [/\bgit\s+reset\s+--hard\b/i, "git reset --hard discards work"],
  [/\bgit\s+clean\s+-[a-z]*f/i, "git clean deletes untracked files"],
  [/\bdrizzle-kit\s+(drop|push)\b/i, "drizzle-kit drop/push bypasses reviewed migrations; use generate + migrate"],
  [/\bsupabase\s+db\s+reset\b/i, "Database reset"],
  [/\b(DROP\s+(TABLE|SCHEMA|DATABASE)|TRUNCATE)\b/i, "Destructive SQL"],
  [/\b(cat|less|more|head|tail|type)\s+[^|;&]*\.env(\.(local|production|development))?\b/i, "Reading secret env files"],
  [/\b(curl|wget)\b[^|]*\|\s*(sh|bash)\b/i, "Piping remote scripts into a shell"],
  [/\beas\s+(submit|update)\b.*--(auto|non-interactive)/i, "Unattended store submit/OTA publish"],
];

for (const [re, why] of rules) {
  if (re.test(cmd)) {
    process.stderr.write(
      `Blocked by project hook: ${why}.\nCommand: ${cmd}\nIf this is truly needed, explain why and ask the user to run it themselves.`
    );
    process.exit(2);
  }
}
process.exit(0);
