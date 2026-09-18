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
2. Read the sections of `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md` and `docs/DATA_MODEL.md` relevant to it.
3. Inspect the existing code so the plan builds on what exists.
4. Write a plan: ordered small tasks (each finishable and testable in one sitting), the tables
   and endpoints involved, libraries to add, env variables the user must supply, and open
   questions. Mark anything that needs a decision from the user.
5. Stop and wait for the user to approve the plan before coding. Then do one task at a time,
   commit after each, and tick `docs/ROADMAP.md` when an item is fully done.
