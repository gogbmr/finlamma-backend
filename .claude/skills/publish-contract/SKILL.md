---
name: publish-contract
description: Regenerate and publish the OpenAPI contract that finlamma-app consumes. Use after any API change or at the end of a phase.
disable-model-invocation: true
---

1. Run `pnpm typecheck && pnpm test`. Stop if anything fails.
2. Run `pnpm contract` to regenerate `openapi/openapi.json` and `docs/API_ENDPOINTS.md`.
   Check that every route under `src/app/api` appears in `docs/API_ENDPOINTS.md`; list any
   missing ones and register them before continuing.
3. Diff it: `git diff --stat openapi/openapi.json` and summarise added, changed and removed
   operations. If anything was removed or changed incompatibly, stop and tell the user.
4. Bump `info.version` in the generator config (minor for additions, major for breaking).
5. Append a dated entry to `openapi/CHANGELOG.md` listing the changes in plain English.
6. Commit `openapi/` and `docs/API_ENDPOINTS.md`: `chore(contract): publish API vX.Y.Z`.
7. Remind the user: deploy (or run `pnpm dev`) so `GET /api/openapi.json` serves the new
   version, then run `pnpm api:sync` in finlamma-app (it downloads the contract over HTTP).
