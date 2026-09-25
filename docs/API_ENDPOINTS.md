# Finlamma API — Endpoint Reference

> Generated from `openapi/openapi.json` (version 0.3.0) on 2026-09-25.
> Do not edit by hand. Regenerate with the contract script.

REST API for the Finlamma mobile app (/api/v1) and the internal admin/relay endpoints.

## Contents

**System**

- `GET /api/v1/health` — Health check

**Users**

- `GET /api/v1/me` — Get my profile
- `PATCH /api/v1/me` — Update my preferences
- `DELETE /api/v1/me` — Delete my account

**Legal**

- `GET /api/v1/legal/{type}` — Get a published legal document
- `GET /api/v1/me/legal-status` — Get my legal-document acceptance status
- `POST /api/v1/me/legal/accept` — Accept the currently published legal documents
- `POST /api/v1/me/legal/reapproval/resend` — Resend pending parent re-approval email(s)

**Onboarding**

- `PATCH /api/v1/me/date-of-birth` — Set my date of birth (once)
- `PATCH /api/v1/me/onboarding-complete` — Mark onboarding's mentor-intro modal as seen
- `POST /api/v1/me/parent-consent/request` — Request parental consent

**Learning**

- `GET /api/v1/mentors` — List published mentors
- `GET /api/v1/mentors/{key}` — Get a published mentor
- `GET /api/v1/worlds` — List published worlds
- `GET /api/v1/worlds/{id}/lessons` — List a world's published lessons
- `GET /api/v1/lessons/{id}` — Get a published lesson
- `POST /api/v1/lessons/{id}/serve` — Serve a Story or Doubt Zone lesson (starts its completion timer)
- `POST /api/v1/lessons/{id}/complete` — Complete a Story or Doubt Zone lesson (credits XP/V Money)
- `POST /api/v1/lessons/{id}/steps/{n}/serve` — Serve the next graded step of a lesson (starts or resumes an attempt)
- `POST /api/v1/lessons/{id}/steps/{n}/answer` — Submit an answer for the current step and grade it
- `GET /api/v1/me/current-lesson` — Get my current/resume lesson
- `GET /api/v1/me/stats/streak` — Get my streak stats (World Home header STREAK tile, WH-02)
- `GET /api/v1/me/stats/xp` — Get my XP stats (World Home header XP tile, WH-04)
- `GET /api/v1/me/stats/vmoney` — Get my V Money stats (World Home header V MONEY tile, WH-03)
- `GET /api/v1/me/profile/overview` — Get my profile overview (Profile screen ID card + quick stats, PR-01/02/05/06/07/08)
- `GET /api/v1/me/certificates` — List my certificates (PR-10/PR-36)
- `GET /api/v1/me/certificates/{worldId}` — Get my certificate for a world (PR-36)
- `GET /api/v1/me/certificates/{worldId}/pdf` — Get a signed download URL for my certificate PDF (PR-37/PR-38)
- `POST /api/v1/me/session-time` — Report a finished session's duration (World Home gap #5)
- `GET /api/v1/me/daily-goals` — Get today's daily goal progress (PR-09)
- `GET /api/v1/me/badges` — List my badges, unlocked and locked (PR-16/17/18/19/20)
- `GET /api/v1/me/rewards` — List my rewards catalog (PR-21/22/23)
- `POST /api/v1/me/rewards/{id}/claim` — Claim a reward (PR-22)
- `GET /api/v1/me/wallet` — Get my wallet summary (PR-21)
- `GET /api/v1/me/wallet/history` — Get my V Money ledger history (PR-24)
- `GET /api/v1/me/report-card` — My weekly report card (PR-30/31/32/33)

**Trade**

- `GET /api/v1/trade/instruments` — List tradeable instruments with live quotes (Explore mode, TR-02/08)
- `GET /api/v1/trade/instruments/{symbol}` — Get one instrument's detail with a live quote (TR-15/17/19/20)
- `GET /api/v1/trade/instruments/{symbol}/candles` — Get candlestick history for an instrument (TR-05/16)

**Webhooks**

- `POST /api/webhooks/clerk` — Clerk user webhook (consumer app)
- `POST /api/webhooks/clerk-staff` — Clerk user webhook (staff app)

## System

### `GET /api/v1/health`

**Health check**

Confirms the API is running and can reach the database. Used by uptime monitors.

**Auth:** none

**Responses**

- **200** — Service is healthy

```json
{
  "data": {
    "status": "ok",
    "database": "ok",
    "migrations": "ok",
    "clerkKeys": "ok",
    "legalDocuments": "ok",
    "version": "2d303f6",
    "consentPiiHmacKey": "ok",
    "storage": "ok",
    "redis": "ok",
    "worldsMissingBossQuiz": [],
    "tradingUnlockWorldMissing": false,
    "inngest": "ok",
    "timestamp": "2026-01-01T00:00:00.000Z"
  }
}
```

- **503** — Database is unreachable

```json
{
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Database is unreachable"
  }
}
```


---

## Users

### `GET /api/v1/me`

**Get my profile**

Returns the signed-in user's own profile.

**Auth:** bearerAuth

**Responses**

- **200** — The caller's profile

```json
{
  "data": {
    "id": "b3b6c6f0-8f2a-4b8b-9f0a-2b8b8b8b8b8b",
    "firstName": "Chirag",
    "lastInitial": "B",
    "email": "chirag@example.com",
    "phone": "+919876543210",
    "language": "en",
    "theme": "dark",
    "bio": "Saving up for my first SIP!",
    "preferences": {
      "sound": true,
      "haptics": true,
      "dataSaver": false
    }
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```


---

### `PATCH /api/v1/me`

**Update my preferences**

Updates language, theme, bio and/or sound/haptics/data-saver preferences - the only profile fields this API owns. Name, email and phone are Clerk-owned identity fields, changed through the app's account settings and synced in automatically by the Clerk webhook. `preferences` is replaced whole, not deep-merged.

**Auth:** bearerAuth

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `language` | string (en, hi, hx) | no | en (English), hi (Hindi) or hx (Hinglish). |
| `theme` | string (dark, light) | no |  |
| `bio` | string or null | no | Free-text, self-editable, private to the owner - never shown to any other learner. |
| `preferences` | object | no |  |
| `preferences.sound` | boolean | yes | In-app sound effects on/off. |
| `preferences.haptics` | boolean | yes | Haptic feedback on/off. |
| `preferences.dataSaver` | boolean | yes | Serves lower-resolution lesson videos when on. |

```json
{
  "language": "en",
  "theme": "dark",
  "bio": "Saving up for my first SIP!",
  "preferences": {
    "sound": true,
    "haptics": true,
    "dataSaver": false
  }
}
```

**Responses**

- **200** — Updated profile

```json
{
  "data": {
    "id": "b3b6c6f0-8f2a-4b8b-9f0a-2b8b8b8b8b8b",
    "firstName": "Chirag",
    "lastInitial": "B",
    "email": "chirag@example.com",
    "phone": "+919876543210",
    "language": "en",
    "theme": "dark",
    "bio": "Saving up for my first SIP!",
    "preferences": {
      "sound": true,
      "haptics": true,
      "dataSaver": false
    }
  }
}
```

- **400** — Validation failed (e.g. neither field provided)

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed",
    "details": {
      "_errors": [
        "Provide at least one of language, theme, bio or preferences"
      ]
    }
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```


---

### `DELETE /api/v1/me`

**Delete my account**

Permanently deletes the Clerk identity and anonymizes the DB row in place (email, phone and name are cleared; ledger/trading/leaderboard history is kept for integrity). Cannot be undone.

**Auth:** bearerAuth

**Responses**

- **200** — Account deleted

```json
{
  "data": {
    "deleted": true
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **503** — Could not delete the account right now - retry

```json
{
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Could not delete account right now"
  }
}
```


---

## Legal

### `GET /api/v1/legal/{type}`

**Get a published legal document**

Public - no authentication required, since a user needs to be able to read the Terms before signing up. Returns the currently published version of the Terms, Privacy or Risk-disclosure document.

**Auth:** none

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `type` | path | string (terms, privacy, risk_disclosure) | yes | terms, privacy or risk_disclosure. |

**Responses**

- **200** — The currently published document

```json
{
  "data": {
    "type": "terms",
    "version": 1,
    "content": {
      "en": "[DRAFT PLACEHOLDER - pending legal review] Terms of use...",
      "hi": "[DRAFT PLACEHOLDER - pending legal review] उपयोग की शर्तें...",
      "hx": "[DRAFT PLACEHOLDER - pending legal review] Terms of use..."
    },
    "publishedAt": "2026-01-01T00:00:00.000Z",
    "isPlaceholder": true
  }
}
```

- **404** — No published version of this document type yet

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "No published terms document yet"
  }
}
```


---

### `GET /api/v1/me/legal-status`

**Get my legal-document acceptance status**

Whether the signed-in user has accepted the currently published Terms/Privacy/Risk-disclosure themselves. For a minor, full access also requires the parent's own consent (see the parent-consent endpoints), not just this - this endpoint only covers legal-document acceptance.

**Auth:** bearerAuth

**Responses**

- **200** — Acceptance status per currently published document

```json
{
  "data": {
    "documents": [
      {
        "type": "terms",
        "currentVersion": 1,
        "accepted": true,
        "acceptedAt": "2026-01-01T00:00:00.000Z",
        "requiresParentReapproval": false,
        "parentApproved": true
      }
    ],
    "allAccepted": true,
    "allParentApproved": true
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```


---

### `POST /api/v1/me/legal/accept`

**Accept the currently published legal documents**

Records the signed-in user's own acceptance of every currently published Terms/Privacy/Risk-disclosure version not already accepted. Used both by an adult accepting for themselves and by a minor's own required in-app acceptance, done once after their parent has separately consented.

**Auth:** bearerAuth

**Responses**

- **200** — Newly accepted document types (empty if everything was already accepted)

```json
{
  "data": {
    "accepted": [
      "terms"
    ]
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```


---

### `POST /api/v1/me/legal/reapproval/resend`

**Resend pending parent re-approval email(s)**

For a minor whose parent already consented once, but a later material legal-document change now needs a fresh parent re-approval (see requiresParentReapproval on GET /api/v1/me/legal-status): resends the re-approval email(s), each with a fresh 7-day single-use link and a rotated withdraw link. Subject to the same 60s cooldown and daily cap as the original consent-request resend flow.

**Auth:** bearerAuth

**Responses**

- **200** — Re-approval email(s) resent

```json
{
  "data": {
    "resent": 1
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **409** — There's no pending re-approval for this account

```json
{
  "error": {
    "code": "CONSENT_NOT_NEEDED",
    "message": "There's no pending re-approval for this account"
  }
}
```

- **429** — Resend cooldown or daily cap reached

```json
{
  "error": {
    "code": "RESEND_TOO_SOON",
    "message": "Please wait a bit before requesting another email",
    "details": {
      "retryAfterSeconds": 42
    }
  }
}
```


---

## Onboarding

### `PATCH /api/v1/me/date-of-birth`

**Set my date of birth (once)**

Collected once at onboarding - determines whether the account needs parental consent. Can only be set once through this endpoint; a second call fails with CONFLICT. Only staff can correct a mistake after that, with a logged reason.

**Auth:** bearerAuth

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `dateOfBirth` | string | yes | YYYY-MM-DD. Can be set exactly once through this endpoint - contact support to correct a mistake after that. |

```json
{
  "dateOfBirth": "2012-05-14"
}
```

**Responses**

- **200** — Date of birth recorded

```json
{
  "data": {
    "dateOfBirth": "2012-05-14",
    "isMinor": true,
    "requiresParentConsent": true
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **409** — Date of birth is already set

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Date of birth is already set - contact support to correct it"
  }
}
```


---

### `PATCH /api/v1/me/onboarding-complete`

**Mark onboarding's mentor-intro modal as seen**

Idempotent, unlike /me/date-of-birth - a repeat call is a harmless no-op that returns the original timestamp. Not a requireFullAccess gate; purely a 'have they seen it' flag for World Home's first-open mentor-intro modal (WH-11).

**Auth:** bearerAuth

**Responses**

- **200** — Onboarding marked complete (or already was)

```json
{
  "data": {
    "onboardingCompletedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```


---

### `POST /api/v1/me/parent-consent/request`

**Request parental consent**

For an under-18 account: emails the given parent/guardian a magic link to a public consent page. Opening that link does nothing by itself - only the parent's own 'I consent' action there records anything. Safe to call again to resend (subject to a 60s cooldown and a daily cap, both per account and per parent email) or to change the parent's details before they've acted.

**Auth:** bearerAuth

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `parentName` | string | yes |  |
| `parentEmail` | string | yes |  |

```json
{
  "parentName": "Priya Sharma",
  "parentEmail": "priya.sharma@example.com"
}
```

**Responses**

- **200** — Consent email sent (or queued)

```json
{
  "data": {
    "status": "pending",
    "parentEmail": "priya.sharma@example.com"
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **409** — Consent isn't needed (no date of birth yet, account is 18+, already consented), the parent email equals the account's own email, or that parent email is already linked to the maximum number of accounts

```json
{
  "error": {
    "code": "CONSENT_NOT_NEEDED",
    "message": "Set your date of birth first"
  }
}
```

- **429** — Resend cooldown or daily cap reached

```json
{
  "error": {
    "code": "RESEND_TOO_SOON",
    "message": "Please wait a bit before requesting another email",
    "details": {
      "retryAfterSeconds": 42
    }
  }
}
```


---

## Learning

### `GET /api/v1/mentors`

**List published mentors**

The published Lamma mentors, ordered by their display order - staff decide how many exist. Which world(s) a mentor covers is set per world (worlds.mentorId), not returned here.

**Auth:** bearerAuth

**Responses**

- **200** — Published mentors, ordered

```json
{
  "data": [
    {
      "key": "baby",
      "order": 1,
      "name": {
        "en": "Baby Lamma",
        "hi": "बेबी लामा",
        "hx": "Baby Lamma"
      },
      "bio": {
        "en": "The very first mentor - asks lots of questions, never judges.",
        "hi": "पहला मेंटर - बहुत सवाल पूछता है, कभी जज नहीं करता।",
        "hx": "Sabse pehla mentor - dher saara sawaal poochta hai, kabhi judge nahi karta."
      },
      "artUrl": "https://example.com"
    }
  ]
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```


---

### `GET /api/v1/mentors/{key}`

**Get a published mentor**

A single mentor stage by its stable key (e.g. "baby"). 404 if not published.

**Auth:** bearerAuth

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `key` | path | string | yes | Stable slug identifying this mentor. |

**Responses**

- **200** — The published mentor

```json
{
  "data": {
    "key": "baby",
    "order": 1,
    "name": {
      "en": "Baby Lamma",
      "hi": "बेबी लामा",
      "hx": "Baby Lamma"
    },
    "bio": {
      "en": "The very first mentor - asks lots of questions, never judges.",
      "hi": "पहला मेंटर - बहुत सवाल पूछता है, कभी जज नहीं करता।",
      "hx": "Sabse pehla mentor - dher saara sawaal poochta hai, kabhi judge nahi karta."
    },
    "artUrl": "https://example.com"
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```

- **404** — No published mentor with this key

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "No published mentor with key \"baby\""
  }
}
```


---

### `GET /api/v1/worlds`

**List published worlds**

The published worlds, ordered - staff decide how many exist, no fixed count. Each world's `locked` field reflects this signed-in user's own progress - sequential unlock only (clearing the previous world's Boss Quiz), never an XP/level gate. The first world is always unlocked.

**Auth:** bearerAuth

**Responses**

- **200** — Published worlds, ordered

```json
{
  "data": [
    {
      "order": 1,
      "title": {
        "en": "Money World",
        "hi": "मनी वर्ल्ड",
        "hx": "Money World"
      },
      "tagline": {
        "en": "From barter to UPI — the whole story of money",
        "hi": "बार्टर से UPI तक — पैसे की पूरी कहानी",
        "hx": "Barter se UPI tak — paise ki poori kahani"
      },
      "theme": "#7C3AED",
      "displayXpTarget": 5,
      "artUrl": "https://example.com",
      "mentorKey": "baby",
      "locked": false
    }
  ]
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```


---

### `GET /api/v1/worlds/{id}/lessons`

**List a world's published lessons**

The journey-map node list for one world (WH-12): id, chapter, step, kind, title, blurb - no `content`, which is only needed once a specific lesson is actually opened (see GET /api/v1/lessons/{id}). Per-user node state (done/current/next/locked) is added once lesson_progress exists (Checkpoint 5) - for now this is the world's lesson list only, ordered by chapter then step.

**Auth:** bearerAuth

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string | yes |  |

**Responses**

- **200** — The world's published lessons, ordered

```json
{
  "data": [
    {
      "id": "00000000-0000-0000-0000-000000000000",
      "chapter": 1,
      "step": 1,
      "kind": "video",
      "title": {
        "en": "string",
        "hi": "string",
        "hx": "string"
      },
      "blurb": {
        "en": "string",
        "hi": "string",
        "hx": "string"
      }
    }
  ]
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```


---

### `GET /api/v1/lessons/{id}`

**Get a published lesson**

Full content for a single published lesson - what the Lesson Flow engine renders. Never includes a question's correct answer, only a reference id (see docs/DATA_MODEL.md's single-source-of-truth rule for questions, Checkpoint 5).

**Auth:** bearerAuth

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string | yes |  |

**Responses**

- **200** — The published lesson

```json
{
  "data": {
    "id": "00000000-0000-0000-0000-000000000000",
    "worldId": "00000000-0000-0000-0000-000000000000",
    "chapter": 1,
    "step": 1,
    "kind": "video",
    "title": {
      "en": "string",
      "hi": "string",
      "hx": "string"
    },
    "blurb": {
      "en": "string",
      "hi": "string",
      "hx": "string"
    },
    "content": {
      "lengthSeconds": 0,
      "scenes": [],
      "cues": []
    }
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```

- **404** — No published lesson with this id

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "No published lesson with this id"
  }
}
```


---

### `POST /api/v1/lessons/{id}/serve`

**Serve a Story or Doubt Zone lesson (starts its completion timer)**

For Story and Doubt Zone lessons only - these have no graded questions (docs/ARCHITECTURE.md D23), so unlike a Video/Quiz/Role Play/Boss Quiz lesson there is no POST .../steps/{n}/serve to call instead. The returned `startedAt` is server-stamped and never trusted from the client - POST /lessons/{id}/complete measures elapsed time from it, not from anything the app reports. Idempotent: re-serving an already-served (or already-completed) lesson returns the exact original startedAt, never a new one.

**Auth:** bearerAuth

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string | yes |  |

**Responses**

- **200** — The lesson's current progress, with its server-stamped startedAt

```json
{
  "data": {
    "lessonId": "00000000-0000-0000-0000-000000000000",
    "status": "in_progress",
    "startedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

- **400** — This lesson isn't a Story or Doubt Zone kind - use the graded-step endpoints instead

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "\"quiz\" lessons use POST /lessons/{id}/steps/{n}/serve, not this endpoint"
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```

- **404** — No published lesson with this id

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "No published lesson with this id"
  }
}
```

- **429** — Too many requests - slow down and try again shortly

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests - slow down and try again shortly"
  }
}
```


---

### `POST /api/v1/lessons/{id}/complete`

**Complete a Story or Doubt Zone lesson (credits XP/V Money)**

For Story and Doubt Zone lessons only (see POST .../serve). Requires the lesson to have been served first, and at least the kind's own admin-editable minimum time (settings_kv.lesson_flow_scoring.storyMinCompletionSeconds / doubtZoneMinCompletionSeconds) to have elapsed since that server-stamped serve time - never a client-reported duration (docs/ARCHITECTURE.md D21's server-timed reasoning applies here too). Credits at most once per user per lesson (docs/ECONOMY.md decision 4, D26): completing an already-completed lesson is an idempotent no-op, `credited: false`, never a second credit.

**Auth:** bearerAuth

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string | yes |  |

**Responses**

- **200** — The lesson is now completed

```json
{
  "data": {
    "lessonId": "00000000-0000-0000-0000-000000000000",
    "status": "completed",
    "completedAt": "2026-01-01T00:00:00.000Z",
    "credited": true
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```

- **404** — No published lesson with this id

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "No published lesson with this id"
  }
}
```

- **409** — Not served yet - call POST /lessons/{id}/serve first

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Not served yet - call POST /lessons/{id}/serve first"
  }
}
```

- **429** — Either too many requests, or not enough time has elapsed since serve yet (LESSON_TOO_SOON) - both mean: wait, then retry the exact same request

```json
{
  "error": {
    "code": "LESSON_TOO_SOON",
    "message": "Spend a bit more time here before completing (150s minimum, 40s so far)",
    "details": {
      "minSeconds": 150,
      "secondsElapsed": 40
    }
  }
}
```


---

### `POST /api/v1/lessons/{id}/steps/{n}/serve`

**Serve the next graded step of a lesson (starts or resumes an attempt)**

Server-timed (docs/ARCHITECTURE.md D21): the returned `servedAt` is what this step's timer runs from, and is never trusted from the client on submit. Only the current, next-in-sequence step can be served - no skipping ahead. Starts a new attempt on step 1 if none is in progress, or resumes an already-served-but-unanswered step idempotently. Never includes this question's correct answer or explanation - see POST .../answer.

**Auth:** bearerAuth

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string | yes |  |
| `n` | path | integer | yes |  |

**Responses**

- **200** — The step to render

```json
{
  "data": {
    "attemptId": "00000000-0000-0000-0000-000000000000",
    "stepIndex": 1,
    "totalSteps": 5,
    "questionId": "00000000-0000-0000-0000-000000000000",
    "format": "single_select",
    "prompt": {
      "en": "string",
      "hi": "string",
      "hx": "string"
    },
    "payload": {},
    "timerSeconds": 12,
    "servedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```

- **404** — No published lesson with this id, or its question is no longer available

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "No published lesson with this id"
  }
}
```

- **409** — Not the current step (no skip-ahead), or the step is already answered

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Not the current step - answer earlier steps first"
  }
}
```

- **429** — Too many requests - slow down and try again shortly

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests - slow down and try again shortly"
  }
}
```


---

### `POST /api/v1/lessons/{id}/steps/{n}/answer`

**Submit an answer for the current step and grade it**

Server-graded and server-timed - the submitted answer is checked against the question's real answer server-side, and the elapsed time used for the speed bonus/timeout is measured from this step's serve time, never a client-reported value (docs/ARCHITECTURE.md D21). Idempotent: submitting again for an already-answered step returns the exact original graded result unchanged, no re-scoring. This is the ONLY response that reveals this question's correct answer and explanation - never for any other step. No `Idempotency-Key` header is needed (unlike trading orders): the (attempt, step) pair already is the natural idempotency key, since only one attempt is ever in progress per (user, lesson) and only one unanswered row can exist per step.

**Auth:** bearerAuth

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string | yes |  |
| `n` | path | integer | yes |  |

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `answer` | object | no | Shape depends on the question's format - see the matching *AnswerSchema in src/server/questions/schemas.ts (e.g. { correctIndex } for single_select). |

```json
{
  "answer": null
}
```

**Responses**

- **200** — The graded result for this step

```json
{
  "data": {
    "attemptId": "00000000-0000-0000-0000-000000000000",
    "stepIndex": 0,
    "totalSteps": 0,
    "isCorrect": true,
    "timedOut": true,
    "correctAnswer": null,
    "explanation": {
      "en": "string",
      "hi": "string",
      "hx": "string"
    },
    "xpAwardedPreview": 0,
    "speedBonusAwarded": true,
    "feverActive": true,
    "comboAfter": 0,
    "isAttemptComplete": true,
    "totalXpPreview": 0
  }
}
```

- **400** — The submitted answer doesn't match this question's format shape

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Invalid answer for a \"single_select\" question: answer.correctIndex: Required"
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```

- **404** — No published lesson with this id, or the question no longer exists

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "No published lesson with this id"
  }
}
```

- **409** — No active attempt, or this step hasn't been served yet

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "This step hasn't been served yet"
  }
}
```

- **429** — Too many requests - slow down and try again shortly

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests - slow down and try again shortly"
  }
}
```


---

### `GET /api/v1/me/current-lesson`

**Get my current/resume lesson**

Powers World Home's Resume banner (WH-06). **Placeholder until Checkpoint 5's lesson_progress table exists**: always returns chapter 1, step 1 of the lowest-order published world, regardless of what the caller has actually done - not yet progress-aware. The response shape is the real contract (identical to GET /api/v1/lessons/{id}); only the selection logic upgrades once real progress tracking ships.

**Auth:** bearerAuth

**Responses**

- **200** — The caller's current lesson (see description for today's placeholder logic)

```json
{
  "data": {
    "id": "00000000-0000-0000-0000-000000000000",
    "worldId": "00000000-0000-0000-0000-000000000000",
    "chapter": 1,
    "step": 1,
    "kind": "video",
    "title": {
      "en": "string",
      "hi": "string",
      "hx": "string"
    },
    "blurb": {
      "en": "string",
      "hi": "string",
      "hx": "string"
    },
    "content": {
      "lengthSeconds": 0,
      "scenes": [],
      "cues": []
    }
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```

- **404** — No published worlds or lessons yet

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "No published worlds yet"
  }
}
```


---

### `GET /api/v1/me/stats/streak`

**Get my streak stats (World Home header STREAK tile, WH-02)**

Current/longest streak and freezes left, for both independent habit loops - `learning` (lesson completions, docs/ECONOMY.md decision 5) and `pulseCheck` (News' Pulse Check, Phase 5 - always 0/0/full freezes until that phase ships the events that trigger it). Day boundaries are computed server-side in IST (Asia/Kolkata) from the server's own clock - never a client-reported date or timezone.

**Auth:** bearerAuth

**Responses**

- **200** — The caller's streak stats

```json
{
  "data": {
    "learning": {
      "current": 4,
      "longest": 11,
      "freezesLeft": 2
    },
    "pulseCheck": {
      "current": 4,
      "longest": 11,
      "freezesLeft": 2
    }
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```


---

### `GET /api/v1/me/stats/xp`

**Get my XP stats (World Home header XP tile, WH-04)**

Total XP, current level and XP progress to the next level, plus XP earned in the trailing 7 days. Level is always derived from total XP using the admin-editable level curve (settings_kv) - it is never stored. Percentile rank is omitted until Phase 6 ships Arena's weekly leaderboard snapshot to read it from (docs/FEATURE_MAP.md PR-03).

**Auth:** bearerAuth

**Responses**

- **200** — The caller's XP stats

```json
{
  "data": {
    "level": 3,
    "totalXp": 1000,
    "xpIntoLevel": 300,
    "xpToNextLevel": 200,
    "weeklyXp": 180
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```


---

### `GET /api/v1/me/stats/vmoney`

**Get my V Money stats (World Home header V MONEY tile, WH-03)**

Balance and V Money earned/spent in the trailing 7 days. Balance is always summed live from vmoney_ledger (CLAUDE.md rule 2) - it is never a stored column. There is no spend path yet in this phase (trading is Phase 4+), so weeklySpent is currently always 0 - it starts reflecting real spends automatically once one exists, no API change needed. "Earned from trade" (also part of WH-03) is omitted entirely until trading exists.

**Auth:** bearerAuth

**Responses**

- **200** — The caller's V Money stats

```json
{
  "data": {
    "balancePaise": 21000,
    "weeklyEarnedPaise": 9000,
    "weeklySpentPaise": 0
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```


---

### `GET /api/v1/me/profile/overview`

**Get my profile overview (Profile screen ID card + quick stats, PR-01/02/05/06/07/08)**

Kid-safe identity (first name + last initial only - never a full name or photo, CLAUDE.md rule 10), joined date, level, XP progress to the next level, the rank title the caller's current level currently qualifies for (admin-editable rank_titles table, or null if none applies yet), the learning streak, lesson-completion progress, quiz accuracy and a 7-day activity dot calendar. Percentile rank is omitted until Phase 6 ships Arena's weekly leaderboard snapshot (docs/FEATURE_MAP.md PR-03) - before that, only self-progress is shown.

**Auth:** bearerAuth

**Responses**

- **200** — The caller's profile overview

```json
{
  "data": {
    "firstName": "Aarav",
    "lastInitial": "S",
    "joinedAt": "2026-01-05T09:12:00.000Z",
    "level": 3,
    "totalXp": 1000,
    "xpIntoLevel": 300,
    "xpToNextLevel": 200,
    "rankTitle": {
      "en": "string",
      "hi": "string",
      "hx": "string"
    },
    "streak": {
      "current": 4,
      "longest": 12,
      "freezesLeft": 2
    },
    "lessons": {
      "completed": 18,
      "total": 40,
      "pct": 45
    },
    "quizAccuracyPct": 82,
    "activityDotCalendar": [
      {
        "date": "2026-09-17",
        "active": true
      }
    ]
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```


---

### `GET /api/v1/me/certificates`

**List my certificates (PR-10/PR-36)**

Every world the caller has completed (passed that world's Boss Quiz), newest first. Each certificate's xpEarned/accuracyPct is a snapshot from the moment it was issued, never recomputed later.

**Auth:** bearerAuth

**Responses**

- **200** — The caller's certificates

```json
{
  "data": [
    {
      "worldId": "b3b6c6f0-8f2a-4b8b-9f0a-2b8b8b8b8b8b",
      "worldTitle": {
        "en": "string",
        "hi": "string",
        "hx": "string"
      },
      "code": "FL-MW-2026-000001",
      "xpEarned": 1250,
      "accuracyPct": 88,
      "issuedAt": "2026-04-17T12:00:00.000Z"
    }
  ]
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```


---

### `GET /api/v1/me/certificates/{worldId}`

**Get my certificate for a world (PR-36)**

The caller's certificate for a specific world, if they've earned one.

**Auth:** bearerAuth

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `worldId` | path | string | yes |  |

**Responses**

- **200** — The caller's certificate for this world

```json
{
  "data": {
    "worldId": "b3b6c6f0-8f2a-4b8b-9f0a-2b8b8b8b8b8b",
    "worldTitle": {
      "en": "string",
      "hi": "string",
      "hx": "string"
    },
    "code": "FL-MW-2026-000001",
    "xpEarned": 1250,
    "accuracyPct": 88,
    "issuedAt": "2026-04-17T12:00:00.000Z"
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```

- **404** — No certificate for this world yet

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "No certificate for this world yet"
  }
}
```


---

### `GET /api/v1/me/certificates/{worldId}/pdf`

**Get a signed download URL for my certificate PDF (PR-37/PR-38)**

Renders the PDF on first request (server-side, no headless browser) and uploads it to storage; every later call returns a fresh signed URL to the same file. The app downloads or shares this URL directly - Finlamma never sends it anywhere on the learner's behalf.

**Auth:** bearerAuth

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `worldId` | path | string | yes |  |

**Responses**

- **200** — A short-lived signed URL to the certificate PDF

```json
{
  "data": {
    "url": "https://xxx.supabase.co/storage/v1/s3/finlamma/certificates/..."
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```

- **404** — No certificate for this world yet

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "No certificate for this world yet"
  }
}
```

- **503** — Storage is not configured

```json
{
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Storage is not configured"
  }
}
```


---

### `POST /api/v1/me/session-time`

**Report a finished session's duration (World Home gap #5)**

Sent once when a session (a lesson/screen, not a heartbeat) ends - adds to today's (IST) running total, feeding the daily goal meter's study-minutes target and the weekly report card's watch-speed sub-metric. Not reward-bearing (no XP/VM derives from this), so this is a client-reported, best-effort signal, capped at 1 hour per call.

**Auth:** bearerAuth

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `seconds` | integer | yes | Duration of one finished session (a lesson/screen, not a heartbeat) - sent once when the session ends, capped at 1 hour per call. |

```json
{
  "seconds": 240
}
```

**Responses**

- **200** — Updated running total for today

```json
{
  "data": {
    "todaySeconds": 1140
  }
}
```

- **400** — seconds out of range

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "seconds must be between 1 and 3600"
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```


---

### `GET /api/v1/me/daily-goals`

**Get today's daily goal progress (PR-09)**

Today's (IST) progress on every currently-active daily goal, admin-configured via settings_kv (target and on/off per type - see docs/PRODUCT_SPEC.md §2). Never awards XP or V Money - a pure progress display over rewards the underlying activity already paid.

**Auth:** bearerAuth

**Responses**

- **200** — Today's active goals with progress

```json
{
  "data": [
    {
      "type": "study_minutes",
      "target": 20,
      "current": 12,
      "completed": false
    }
  ]
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```


---

### `GET /api/v1/me/badges`

**List my badges, unlocked and locked (PR-16/17/18/19/20)**

Every published badge with the caller's own progress and unlock state. A locked badge shows real progress toward its threshold (e.g. "7/10"), not just 0, so the app can render progress rings for badges not yet earned.

**Auth:** bearerAuth

**Responses**

- **200** — The caller's badges

```json
{
  "data": [
    {
      "id": "00000000-0000-0000-0000-000000000000",
      "name": {
        "en": "string",
        "hi": "string",
        "hx": "string"
      },
      "description": {
        "en": "string",
        "hi": "string",
        "hx": "string"
      },
      "category": "learning",
      "vmReward": 100,
      "iconKey": "string",
      "target": 10,
      "progress": 7,
      "unlocked": true,
      "unlockedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```


---

### `GET /api/v1/me/rewards`

**List my rewards catalog (PR-21/22/23)**

Every published reward with a fixed, admin-set price and whether the caller has already claimed it - a reward can be claimed at most once per learner.

**Auth:** bearerAuth

**Responses**

- **200** — The reward catalog

```json
{
  "data": [
    {
      "id": "00000000-0000-0000-0000-000000000000",
      "name": {
        "en": "string",
        "hi": "string",
        "hx": "string"
      },
      "description": {
        "en": "string",
        "hi": "string",
        "hx": "string"
      },
      "category": "finlamma",
      "priceVm": 500,
      "iconKey": "string",
      "claimed": true
    }
  ]
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```


---

### `POST /api/v1/me/rewards/{id}/claim`

**Claim a reward (PR-22)**

Debits the reward's price_vm from the caller's balance and records the claim. A reward can be claimed at most once per learner - calling this again on an already-claimed reward is an idempotent replay (alreadyClaimed: true, no second debit), never a second charge. Balance can never go negative: the debit runs inside a locked transaction, so two concurrent claims for the same learner can never both succeed if only one can be afforded.

**Auth:** bearerAuth

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string | yes |  |

**Responses**

- **200** — Claimed (or already claimed)

```json
{
  "data": {
    "rewardId": "00000000-0000-0000-0000-000000000000",
    "pricePaid": 0,
    "alreadyClaimed": true,
    "claimedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```

- **404** — No published reward with this id

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "No published reward with this id"
  }
}
```

- **409** — Insufficient V Money balance

```json
{
  "error": {
    "code": "INSUFFICIENT_VMONEY",
    "message": "Not enough V Money - this costs 500, you have 200"
  }
}
```

- **429** — Too many claim attempts, or the rate limiter couldn't be reached (fails closed)

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many claim attempts - slow down and try again shortly"
  }
}
```


---

### `GET /api/v1/me/wallet`

**Get my wallet summary (PR-21)**

V Money balance (always summed live from the ledger, never a stored balance), V Money earned this IST calendar month, and an earn-source breakdown - only sourceTypes with a real earning this month appear in the breakdown.

**Auth:** bearerAuth

**Responses**

- **200** — The caller's wallet summary

```json
{
  "data": {
    "balancePaise": 125000,
    "earnedThisMonthPaise": 30000,
    "earnedBySource": [
      {
        "sourceType": "lesson_completion",
        "amountPaise": 30000
      }
    ]
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```


---

### `GET /api/v1/me/wallet/history`

**Get my V Money ledger history (PR-24)**

The caller's full earn/spend ledger, newest first, cursor-paginated.

**Auth:** bearerAuth

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `limit` | query | string | no |  |
| `cursor` | query | string | no |  |

**Responses**

- **200** — A page of the caller's ledger history

```json
{
  "data": [
    {
      "id": "00000000-0000-0000-0000-000000000000",
      "amountPaise": -50000,
      "sourceType": "reward_claim",
      "reason": "Reward claimed",
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "nextCursor": "string"
}
```

- **400** — Invalid limit or cursor

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Invalid cursor"
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```


---

### `GET /api/v1/me/report-card`

**My weekly report card (PR-30/31/32/33)**

The current IST week's efficiency snapshot (null until the first Monday after signup has run), an 8-week efficiency-score trend, and whether it's currently shared with a verified parent (docs/ARCHITECTURE.md D33). Coach notes are progress-only and never comparative.

**Auth:** bearerAuth

**Responses**

- **200** — The caller's report card

```json
{
  "data": {
    "current": {
      "weekStartDate": "2026-09-21",
      "efficiencyScore": 0,
      "subMetrics": {
        "retention": 0,
        "watchSpeed": 0,
        "quizAccuracy": 0,
        "consistency": 0
      },
      "moduleBreakdown": [
        {
          "worldId": "00000000-0000-0000-0000-000000000000",
          "worldTitle": "string",
          "lessonsCompleted": 0,
          "minutesSpent": 0,
          "accuracyPct": 0,
          "grade": "S"
        }
      ],
      "topicMastery": [
        {
          "topic": "string",
          "accuracyPct": 0
        }
      ],
      "coachNotes": [
        {
          "category": "strength",
          "text": {
            "en": "string",
            "hi": "string",
            "hx": "string"
          }
        }
      ]
    },
    "trend": [
      {
        "weekStartDate": "string",
        "efficiencyScore": 0
      }
    ],
    "sharedWithParent": {
      "maskedEmail": "j***@gmail.com",
      "weeklyEmailOn": true
    }
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```


---

## Trade

### `GET /api/v1/trade/instruments`

**List tradeable instruments with live quotes (Explore mode, TR-02/08)**

Every active instrument with its live quote merged in. Visible regardless of the learner's trading-unlock progress (explore mode, PRODUCT_SPEC.md §4) - only placing an order is gated. `quote` is null when the market-data vendor has no data for a symbol right now; the app should show the instrument's own last-known display fields, never a synthetic price (no volatility control, ever).

**Auth:** bearerAuth

**Responses**

- **200** — Active instruments with live quotes

```json
{
  "data": [
    {
      "symbol": "RELIANCE",
      "exchange": "NSE",
      "name": "Reliance Industries Ltd",
      "sector": "Oil, Gas & Conglomerate",
      "tags": [
        "NIFTY 50",
        "Large cap"
      ],
      "lotSize": 1,
      "halted": true,
      "quote": {
        "pricePaise": 284510,
        "changePaise": 1250,
        "changePercent": 0.44,
        "openPaise": 283000,
        "highPaise": 285200,
        "lowPaise": 282500,
        "previousClosePaise": 283260,
        "volume": 5231400,
        "asOf": "2026-01-01T00:00:00.000Z"
      }
    }
  ],
  "disclaimer": "Prices and charts are real NSE market data, used for virtual practice only. Trades here use V Money, never real rupees. Nothing on this screen is investment advice."
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```


---

### `GET /api/v1/trade/instruments/{symbol}`

**Get one instrument's detail with a live quote (TR-15/17/19/20)**

Instrument fundamentals (sector, about, tip, market cap, P/E), a live quote, and the trading disclaimer. `about`/`tip` are admin-curated, educational-only copy - never a buy/sell signal (CLAUDE.md, docs/ROADMAP.md's pre-launch legal-review checklist item).

**Auth:** bearerAuth

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `symbol` | path | string | yes |  |

**Responses**

- **200** — The instrument's detail

```json
{
  "data": {
    "symbol": "RELIANCE",
    "exchange": "NSE",
    "name": "Reliance Industries Ltd",
    "sector": "Oil, Gas & Conglomerate",
    "tags": [
      "NIFTY 50",
      "Large cap"
    ],
    "lotSize": 1,
    "halted": true,
    "quote": {
      "pricePaise": 284510,
      "changePaise": 1250,
      "changePercent": 0.44,
      "openPaise": 283000,
      "highPaise": 285200,
      "lowPaise": 282500,
      "previousClosePaise": 283260,
      "volume": 5231400,
      "asOf": "2026-01-01T00:00:00.000Z"
    },
    "about": {
      "en": "string",
      "hi": "string",
      "hx": "string"
    },
    "tip": {
      "en": "string",
      "hi": "string",
      "hx": "string"
    },
    "mcap": 1925000000000,
    "pe": 24.3
  },
  "disclaimer": "Prices and charts are real NSE market data, used for virtual practice only. Trades here use V Money, never real rupees. Nothing on this screen is investment advice."
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```

- **404** — No active instrument with this symbol

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "No instrument with this symbol"
  }
}
```


---

### `GET /api/v1/trade/instruments/{symbol}/candles`

**Get candlestick history for an instrument (TR-05/16)**

OHLCV candles for one of the app's fixed chart timeframes (1D/1W/1M/3M/1Y).

**Auth:** bearerAuth

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `symbol` | path | string | yes |  |
| `tf` | query | string (1D, 1W, 1M, 3M, 1Y) | no | Chart timeframe. |

**Responses**

- **200** — OHLCV candles, oldest first

```json
{
  "data": [
    {
      "timestamp": "2026-01-01T00:00:00.000Z",
      "openPaise": 0,
      "highPaise": 0,
      "lowPaise": 0,
      "closePaise": 0,
      "volume": 0
    }
  ],
  "disclaimer": "Prices and charts are real NSE market data, used for virtual practice only. Trades here use V Money, never real rupees. Nothing on this screen is investment advice."
}
```

- **400** — Invalid timeframe

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Invalid tf - must be one of 1D, 1W, 1M, 3M, 1Y"
  }
}
```

- **401** — Not signed in

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in required"
  }
}
```

- **403** — Onboarding, parental consent or legal acceptance is incomplete

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Complete onboarding before using this feature"
  }
}
```

- **404** — No active instrument with this symbol

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "No instrument with this symbol"
  }
}
```


---

## Webhooks

### `POST /api/webhooks/clerk`

**Clerk user webhook (consumer app)**

Called by Clerk (not the app or the mobile client) on user.created, user.updated and user.deleted to keep our users table in sync. This is the CONSUMER Clerk application's webhook (see docs/ARCHITECTURE.md decision D2a) - the STAFF app has its own separate webhook at /api/webhooks/clerk-staff. Authenticated by an HMAC signature in the svix-id / svix-timestamp / svix-signature headers, verified against CLERK_WEBHOOK_SIGNING_SECRET - configured as a webhook endpoint in the Clerk dashboard, not by a user or staff session.

**Auth:** none

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `svix-id` | header | string | yes | Unique id of this webhook delivery |
| `svix-timestamp` | header | string | yes | Unix timestamp the webhook was sent |
| `svix-signature` | header | string | yes | HMAC signature(s) of the request body |

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string | yes |  |
| `data` | object | yes |  |

```json
{
  "type": "user.created",
  "data": {}
}
```

**Responses**

- **200** — Event processed (or a type we don't act on)

```json
{
  "data": {
    "received": true
  }
}
```

- **400** — Missing/invalid svix signature

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found",
    "details": {}
  }
}
```

- **503** — Webhook signing secret not configured

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found",
    "details": {}
  }
}
```


---

### `POST /api/webhooks/clerk-staff`

**Clerk user webhook (staff app)**

Called by Clerk on user.created and user.deleted for the STAFF Clerk application (see docs/ARCHITECTURE.md decision D2a) - the consumer app's webhook at /api/webhooks/clerk is separate. On user.created, completes a pending staff invite (see src/server/staff/service.ts inviteStaffMember()): if the new user's public metadata carries the role id the invitation was created with, a staff_members row is created for them. On user.deleted, deactivates their staff_members row if they had one, so deleting a staff Clerk identity directly in the Clerk dashboard also revokes admin access here. Authenticated by an HMAC signature in the svix-id / svix-timestamp / svix-signature headers, verified against STAFF_CLERK_WEBHOOK_SIGNING_SECRET - configured as a webhook endpoint in the Clerk dashboard, not by a user or staff session.

**Auth:** none

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `svix-id` | header | string | yes | Unique id of this webhook delivery |
| `svix-timestamp` | header | string | yes | Unix timestamp the webhook was sent |
| `svix-signature` | header | string | yes | HMAC signature(s) of the request body |

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string | yes |  |
| `data` | object | yes |  |

```json
{
  "type": "user.created",
  "data": {}
}
```

**Responses**

- **200** — Event processed (or a type we don't act on)

```json
{
  "data": {
    "received": true
  }
}
```

- **400** — Missing/invalid svix signature

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found",
    "details": {}
  }
}
```

- **503** — Webhook signing secret not configured

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found",
    "details": {}
  }
}
```


---
