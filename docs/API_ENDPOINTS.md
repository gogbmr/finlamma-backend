# Finlamma API — Endpoint Reference

> Generated from `openapi/openapi.json` (version 0.1.0) on 2026-09-23.
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
    "theme": "dark"
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

Updates language and/or theme - the only profile fields this API owns. Name, email and phone are Clerk-owned identity fields, changed through the app's account settings and synced in automatically by the Clerk webhook.

**Auth:** bearerAuth

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `language` | string (en, hi, hx) | no | en (English), hi (Hindi) or hx (Hinglish). |
| `theme` | string (dark, light) | no |  |

```json
{
  "language": "en",
  "theme": "dark"
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
    "theme": "dark"
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
        "Provide at least one of language or theme"
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
