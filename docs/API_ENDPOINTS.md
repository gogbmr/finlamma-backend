# Finlamma API — Endpoint Reference

> Generated from `openapi/openapi.json` (version 0.1.0) on 2026-09-20.
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
- `POST /api/v1/me/parent-consent/request` — Request parental consent

**Learning**

- `GET /api/v1/mentors` — List published mentors
- `GET /api/v1/mentors/{key}` — Get a published mentor

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

The mentor evolution stages (Baby/Father/Grandpa Lamma), each covering a fixed range of worlds, ordered by their display order. Only published mentors are returned.

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
      "worldRangeStart": 1,
      "worldRangeEnd": 3,
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
    "worldRangeStart": 1,
    "worldRangeEnd": 3,
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
