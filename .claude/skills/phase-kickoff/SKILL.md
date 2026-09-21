---
name: phase-kickoff
description: Start the next roadmap phase — read the docs, find the next unticked items, and produce a step-by-step plan before writing code.
disable-model-invocation: true
argument-hint: "[phase number, optional]"
---

## Current roadmap
!`cat docs/ROADMAP.md`

## Recent work
!`git log --oneline -15 2>/dev/null || echo "no commits yet"`

## Task
1. Pick the phase: $ARGUMENTS if given, otherwise the first phase with unticked items.
2. **Create and switch to this phase's branch, before reading further or touching any code.**
   One branch per phase, merged into `main` only after `/phase-audit` — see `docs/STATUS.md`'s
   2026-09-20 process-fix entry for why this is non-negotiable (`main` auto-deploys to
   production on push). Concretely:
   - `git branch --list 'phase-<N>-*'` (and `git branch -r --list 'origin/phase-<N>-*'`) — if a
     branch for this phase already exists (resuming earlier work), `git switch` to it. Don't
     create a duplicate.
   - Otherwise, from an up-to-date `main`: `git switch main && git pull && git checkout -b
     phase-<N>-<short-name>` (name pattern matches existing branches, e.g. `phase-2a-consent`,
     `phase-2b-content`), then `git push -u origin phase-<N>-<short-name>`.
   - `.claude/hooks/guard-bash.mjs` will also block a `git commit` while on `main` or a `git push`
     targeting `main` as defense-in-depth, but don't rely on that catching it — do this step
     first, every time, so it never comes up.
3. Read the sections of `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md` and `docs/DATA_MODEL.md` relevant to it.
4. **Read `docs/FEATURE_MAP.md` and pull every row whose Phase column matches this phase** (a row
   may list more than one phase, e.g. "2/3" — include it if this phase is one of them). This is
   the ground truth for what the prototype actually needs; PRODUCT_SPEC/ROADMAP are summaries and
   may miss a row. List every matching row ID and its one-line Feature description in the plan, so
   nothing gets silently dropped. If a row's Status says "Cut (decided)" or "Deferred to v2" /
   "Prototype-only, not to be built" / "N/A", skip it — it's intentionally out of scope, not a
   miss. If a row's Tables/API column still says `MISSING` or reads like an open question rather
   than a decision, stop and ask the user before planning around a guess.
5. Inspect the existing code so the plan builds on what exists.
6. Write a plan: ordered small tasks (each finishable and testable in one sitting), the tables
   and endpoints involved, libraries to add, env variables the user must supply, and open
   questions. Mark anything that needs a decision from the user. Reference FEATURE_MAP row IDs
   next to the task(s) that implement them.
7. Stop and wait for the user to approve the plan before coding. Then do one task at a time,
   commit after each, and tick `docs/ROADMAP.md` when an item is fully done.
