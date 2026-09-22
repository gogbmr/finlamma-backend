#!/usr/bin/env node
// PreToolUse hook (matcher: Bash). Blocks destructive or secret-leaking shell commands.
// Exit code 2 = block the command and show the reason to Claude.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const cmd = (input.tool_input?.command ?? "").toString();
// This script always runs from the main checkout (settings.json invokes it via
// "$CLAUDE_PROJECT_DIR/.claude/hooks/guard-bash.mjs"), but the git command it's
// guarding may run in a *worktree* - a separate checkout of the same repo on a
// different branch (see docs/phase-kickoff's one-worktree-per-phase workflow).
// CLAUDE_PROJECT_DIR is always the main checkout's path, so branch-checking
// against it would report the main checkout's branch regardless of where the
// actual command runs - wrongly blocking a commit made from a phase worktree
// (which is correctly on a phase branch, not main) and, conversely, would
// silently *fail* to block a commit that changes into the main checkout and
// commits there. input.cwd is the directory Claude's shell actually invoked
// this command from, so that's what must be checked - CLAUDE_PROJECT_DIR is
// only a fallback for when it's missing.
const projectDir = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();

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
//
// This also has to be *directory*-aware, not just branch-aware: this
// script always runs from the main checkout (settings.json invokes it via
// "$CLAUDE_PROJECT_DIR/.claude/hooks/guard-bash.mjs"), but the git command
// it's guarding may run in a git worktree - a separate checkout of the same
// repo, on a different branch, at a different path (see /phase-kickoff's
// one-worktree-per-phase workflow). `projectDir` (above) is Claude's actual
// invocation directory for this command when available, which correctly
// tells a worktree apart from the main checkout - but a compound command can
// still change directory *after* that, via `cd <dir>`/`pushd <dir>` or a git
// `-C <dir>` flag, before ever reaching `commit`/`push`. Both are tracked
// below (`currentDir` for cd/pushd, `invocation.cDir` for a `-C` on that one
// invocation) so the branch check always reflects where the git command will
// actually run, not just where the whole compound command started.
function resolveDir(base, target) {
  if (!target) return base;
  const t = target.replace(/^["']|["']$/g, "");
  if (t === "-" || t.startsWith("~")) return base; // can't resolve "previous dir" or home reliably - leave as-is
  if (/^[a-zA-Z]:[\\/]/.test(t) || t.startsWith("/")) return t; // absolute: Windows drive or POSIX
  return `${base.replace(/[\\/]+$/, "")}/${t}`;
}

function branchOf(dir) {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: dir,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return null; // not a git repo, or HEAD unresolvable (e.g. no commits yet) - nothing to guard
  }
}

// Crude, not a real shell parser: splits on &&, ;, ||, | and newlines (a
// multi-statement script written across several lines, with no explicit &&
// between them, is still multiple subcommands - Claude commonly writes
// commands this way). A subcommand after a pipe can't affect directory/
// branch state, but keeping the split simple is safer than trying to be
// clever about which separators "count". Good enough to track cd/branch
// switches within one compound command; anything that defeats this (command
// substitution, a script file, etc.) still hits the plain string-match
// rules above for the genuinely destructive cases, and ultimately "ask the
// user to run it themselves" is always the backstop.
function splitSubcommands(fullCmd) {
  return fullCmd
    .split(/&&|\|\||;|\||\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// A quoted argument (which may itself contain spaces - this repo's own path
// has one) or a single bare token.
const ARG = `("[^"]*"|'[^']*'|\\S+)`;

// Parses a `git` invocation's leading global options (only `-C <dir>` is
// given real meaning, since it's the one that changes *where* the command
// runs; every other global option/flag is just skipped over) down to the
// subcommand verb. Returns null for anything that isn't a commit/push/
// checkout/switch invocation - including one hidden behind a global option
// the original version of this check couldn't see past at all (that gap is
// exactly why `git -C <dir> commit` used to slip through undetected).
function parseGitInvocation(subcmd) {
  if (!/^git\b/i.test(subcmd)) return null;
  let rest = subcmd.slice(3).trim();
  let cDir = null;
  for (;;) {
    const cMatch = rest.match(new RegExp(`^-C\\s+${ARG}\\s*`));
    if (cMatch) {
      cDir = cMatch[1];
      rest = rest.slice(cMatch[0].length);
      continue;
    }
    const otherFlag = rest.match(new RegExp(`^(?:-c\\s+${ARG}|--\\S+|-\\S+)\\s*`, "i"));
    if (otherFlag) {
      rest = rest.slice(otherFlag[0].length);
      continue;
    }
    break;
  }
  const verbMatch = rest.match(/^(commit|push|checkout|switch)\b/i);
  if (!verbMatch) return null;
  return { verb: verbMatch[1].toLowerCase(), cDir, rest: rest.slice(verbMatch[0].length) };
}

// `git checkout <branch>` / `git switch <branch>` (with or without -b/-B to
// create it) changes the branch every subcommand after it will run against,
// in the directory it ran in. `git checkout -b foo` and `git checkout -`
// (previous branch) are deliberately not resolved beyond "some non-main
// branch" / left alone - this only needs to reliably catch landing ON main,
// not perfectly track every branch name.
function branchSwitchTarget(rest) {
  const m = rest.trim().match(/^(?:-[bB]\s+)?(\S+)/);
  if (!m) return null;
  const name = m[1].replace(/^["']|["']$/g, "");
  if (name === "-" || name.startsWith("-")) return null;
  return name;
}

// `rest` is everything after the "push" verb (still includes the remote,
// flags and the refspec, in whatever order git allows - `-u`/`--set-upstream`
// etc. can come before OR after the remote). Filtering out every flag token
// first, then reading positionally (tokens[0] = remote, tokens[1] = refspec)
// is what makes `git push -u origin main` and `git push --set-upstream origin
// main` resolve correctly - the earlier version assumed the remote was
// always the very first token, which broke the moment a flag came first.
function pushTarget(rest, branchAtThisPoint) {
  const tokens = rest.split(/\s+/).filter((t) => t && !t.startsWith("-"));
  const refspec = tokens[1]; // tokens[0] is the remote, if given
  if (!refspec) return branchAtThisPoint; // no refspec given - git pushes the current branch
  const target = refspec.includes(":") ? refspec.split(":")[1] : refspec;
  // Normalise so "+main" (force-push refspec marker) and "refs/heads/main"
  // (fully-qualified ref) are both recognised as "main", the same as a bare
  // "main" would be.
  return target.replace(/^\+/, "").replace(/^refs\/heads\//, "");
}

if (
  /\bgit\s+(?:-C\s+(?:"[^"]*"|'[^']*'|\S+)\s+|-c\s+(?:"[^"]*"|'[^']*'|\S+)\s+|--\S+\s+|-\S+\s+)*(commit|push|checkout|switch)\b/i.test(
    cmd,
  )
) {
  let currentDir = projectDir;
  let branchOverride = null;

  for (const subcmd of splitSubcommands(cmd)) {
    const cdMatch = subcmd.match(new RegExp(`^(?:cd|pushd)\\s+${ARG}`, "i"));
    if (cdMatch) {
      currentDir = resolveDir(currentDir, cdMatch[1]);
      branchOverride = null; // a new directory has its own, unrelated branch state
      continue;
    }

    const invocation = parseGitInvocation(subcmd);
    if (!invocation) continue;
    const effectiveDir = invocation.cDir ? resolveDir(currentDir, invocation.cDir) : currentDir;
    const branch = invocation.cDir ? branchOf(effectiveDir) : (branchOverride ?? branchOf(effectiveDir));

    if (invocation.verb === "commit" && branch === "main") {
      process.stderr.write(
        "Blocked by project hook: committing directly to main.\n" +
          `Command: ${cmd}\n` +
          "One branch per phase, merged only after /phase-audit - main auto-deploys to production. " +
          "Create/switch to the phase branch first (git checkout -b phase-N-<name>). " +
          "If the user explicitly wants a commit on main, they need to run it themselves.",
      );
      process.exit(2);
    }

    // Force pushes are already unconditionally blocked by the `rules` loop
    // above (any --force/-f, to any branch) before we ever get here - this
    // check only needs to catch a *non-force* push landing on main.
    if (invocation.verb === "push" && !/(--force|-f\b)/i.test(subcmd)) {
      if (pushTarget(invocation.rest, branch) === "main") {
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

    if ((invocation.verb === "checkout" || invocation.verb === "switch") && !invocation.cDir) {
      const target = branchSwitchTarget(invocation.rest);
      if (target) branchOverride = target;
    }
  }
}

process.exit(0);