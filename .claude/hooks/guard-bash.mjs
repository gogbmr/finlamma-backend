#!/usr/bin/env node
// PreToolUse hook (matcher: Bash). Blocks destructive or secret-leaking shell commands.
// Exit code 2 = block the command and show the reason to Claude.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const cmd = (input.tool_input?.command ?? "").toString();
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

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

// One branch per phase, merged only after /phase-audit (docs/STATUS.md,
// 2026-09-20 process-fix entry): work happens on a phase branch, never
// directly on main, since main auto-deploys to production on push. This
// can't be satisfied by adding "main" to the rules array above, because it
// needs the *current branch*, not just the command text - and "current" has
// to account for a `git checkout main && git commit ...` compound command
// switching branches earlier in the same invocation this hook only sees
// once, before any of it has actually run (confirmed by hand: an earlier
// version of this hook that only checked the branch *before* the command
// ran let exactly that compound form slip a commit onto main).
function branchAtStart() {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: projectDir,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return null; // not a git repo, or HEAD unresolvable (e.g. no commits yet) - nothing to guard
  }
}

// Crude, not a real shell parser: splits on &&, ;, || and | (a subcommand
// after a pipe can't affect branch state, but keeping the split simple is
// safer than trying to be clever about which separators "count"). Good
// enough to track branch switches within one compound command; anything
// that defeats this (command substitution, a script file, etc.) still hits
// the plain string-match rules above for the genuinely destructive cases,
// and ultimately "ask the user to run it themselves" is always the backstop.
function splitSubcommands(fullCmd) {
  return fullCmd
    .split(/&&|\|\||;|\|/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// A `git checkout <branch>` / `git switch <branch>` (with or without -b/-B
// to create it) changes the branch every subcommand after it will run
// against. `git checkout -b foo` and `git checkout -` (previous branch) are
// deliberately not resolved beyond "some non-main branch" / left alone -
// this only needs to reliably catch landing ON main, not perfectly track
// every branch name.
function branchSwitchTarget(subcmd) {
  const m = subcmd.match(/^git\s+(?:checkout|switch)\s+(?:-[bB]\s+)?(\S+)/i);
  if (!m) return null;
  const name = m[1].replace(/^["']|["']$/g, "");
  if (name === "-" || name.startsWith("-")) return null; // "-" (previous branch) or another flag, not a name we can resolve
  return name;
}

function pushTarget(subcmd, branchAtThisPoint) {
  const afterPush = subcmd.slice(subcmd.search(/\bgit\s+push\b/i)).replace(/^git\s+push\b/i, "");
  const tokens = afterPush.split(/\s+/).filter((t) => t && !t.startsWith("-"));
  const refspec = tokens[1]; // tokens[0], if present, is the remote
  if (!refspec) return branchAtThisPoint; // no refspec given - git pushes the current branch
  return refspec.includes(":") ? refspec.split(":")[1] : refspec;
}

if (/\bgit\s+(commit|push|checkout|switch)\b/i.test(cmd)) {
  let branch = branchAtStart();

  for (const subcmd of splitSubcommands(cmd)) {
    if (/^git\s+commit\b/i.test(subcmd) && branch === "main") {
      process.stderr.write(
        "Blocked by project hook: committing directly to main.\n" +
          `Command: ${cmd}\n` +
          "One branch per phase, merged only after /phase-audit - main auto-deploys to production. " +
          "Create/switch to the phase branch first (git checkout -b phase-N-<name>). " +
          "If the user explicitly wants a commit on main, they need to run it themselves.",
      );
      process.exit(2);
    }

    if (/^git\s+push\b/i.test(subcmd) && !/(--force|-f\b)/i.test(subcmd)) {
      if (pushTarget(subcmd, branch) === "main") {
        process.stderr.write(
          "Blocked by project hook: pushing to main.\n" +
            `Command: ${cmd}\n` +
            "main auto-deploys to production - pushes there need the user's explicit, in-the-moment " +
            "approval, not just an 'ask' permission click. If the user explicitly wants this pushed " +
            "to main right now, they need to run it themselves.",
        );
        process.exit(2);
      }
    }

    const switchTarget = branchSwitchTarget(subcmd);
    if (switchTarget) branch = switchTarget;
  }
}

process.exit(0);
