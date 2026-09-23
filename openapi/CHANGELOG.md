# API Changelog

Plain-English record of what changed in `openapi/openapi.json`, published via `/publish-contract`.

## 2026-09-23 — v0.2.0

Minor bump: purely additive, 6 new operations, nothing removed or changed on any endpoint that
was already in v0.1.0. Covers Phase 3a (progress economy: rate limiting, the XP/V Money ledger,
Story/Doubt Zone completion, streaks, stat endpoints).

**Story/Doubt Zone completion (Checkpoint 3)**
- `POST /api/v1/lessons/{id}/serve` — starts the server-stamped timer for a Story/Doubt Zone
  lesson (the two lesson kinds with no graded quiz steps).
- `POST /api/v1/lessons/{id}/complete` — completes it once the admin-configured minimum time has
  genuinely elapsed since `serve` (server-enforced, not a client-reported duration).

**Stats (Checkpoint 4/5, World Home header tiles + Profile Overview)**
- `GET /api/v1/me/stats/streak` — current/longest streak and freezes left, for both the
  `learning` and `pulseCheck` habit loops.
- `GET /api/v1/me/stats/xp` — total XP, level, XP progress to the next level, and XP earned in
  the trailing 7 days. Level is always computed from total XP on the fly, never stored.
- `GET /api/v1/me/stats/vmoney` — V Money balance (summed live from the ledger, never a stored
  balance), plus V Money earned/spent in the trailing 7 days.
- `GET /api/v1/me/profile/overview` — the Profile screen's ID card: kid-safe name (first name +
  last initial only — never a photo or full name), joined date, level, XP progress, and the
  learner's current rank title (from a new admin-editable rank-title ladder). Percentile/rank is
  intentionally left out of all three stat endpoints above — that's Phase 6 (Arena's leaderboard),
  not this phase.

All four `stats`/`profile` endpoints require a signed-in, fully onboarded user and only ever
return the caller's own data — there is no way to pass another user's id to any of them.

Not yet in the contract: everything from `docs/ROADMAP.md` Phase 3b onward (badges, rewards,
certificates, weekly report card) and Phase 4+ (trading, Arena, news).

## 2026-09-22 — v0.1.0 (initial publish)

First formal publish of the contract — no prior version was ever published through this process,
so this establishes the `0.1.0` baseline rather than describing a bump. Covers everything built
through Phase 1, Phase 2a (onboarding, parental consent, legal documents) and Phase 2b (learning
content: mentors, worlds, lessons, quizzes).

**Identity, account & onboarding**
- `GET /api/v1/me`, `PATCH /api/v1/me`, `DELETE /api/v1/me` — profile, update, account deletion.
- `PATCH /api/v1/me/date-of-birth` — set-once, determines under-18 status.
- `PATCH /api/v1/me/onboarding-complete` — marks the first-open mentor-intro modal as seen.

**Legal documents & parental consent**
- `GET /api/v1/legal/{type}` — published Terms/Privacy/Risk-disclosure text.
- `GET /api/v1/me/legal-status` — this user's acceptance status per document.
- `POST /api/v1/me/legal/accept` — record self-acceptance.
- `POST /api/v1/me/legal/reapproval/resend` — resend a parent re-approval link after a legal
  document changes.
- `POST /api/v1/me/parent-consent/request` — start the parental consent flow for a minor.

**Learning content**
- `GET /api/v1/mentors`, `GET /api/v1/mentors/{key}` — published Lamma mentors.
- `GET /api/v1/worlds` — published worlds, ordered, with this user's own sequential unlock state.
- `GET /api/v1/worlds/{id}/lessons` — a world's lesson list.
- `GET /api/v1/lessons/{id}` — lesson detail.
- `GET /api/v1/me/current-lesson` — resume-banner pointer to the learner's in-progress lesson.
- `POST /api/v1/lessons/{id}/steps/{n}/serve` — serve the next quiz step (server-stamped timer
  start).
- `POST /api/v1/lessons/{id}/steps/{n}/answer` — submit and server-grade an answer (server-timed,
  idempotent, no answer/explanation leak before grading).

**System**
- `GET /api/v1/health` — service health, migration drift, legal-document and content-completeness
  warnings.
- `POST /api/webhooks/clerk`, `POST /api/webhooks/clerk-staff` — Clerk identity sync (consumer and
  staff apps), signature-verified.

Not yet in the contract: worlds/mentors/lessons/questions admin CRUD (Server Actions, not REST
per `docs/ARCHITECTURE.md` D16, so intentionally outside this contract) and everything in
`docs/ROADMAP.md` Phase 3 onward (XP/V Money, trading, Arena, news).
