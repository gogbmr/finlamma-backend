# Finlamma API — Endpoint Reference

> Generated from `openapi/openapi.json` (version 0.1.0) on 2026-09-18.
> Do not edit by hand. Regenerate with the contract script.

REST API for the Finlamma mobile app (/api/v1) and the internal admin/relay endpoints.

## Contents

**System**

- `GET /api/v1/health` — Health check

**Webhooks**

- `POST /api/webhooks/clerk` — Clerk user webhook

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

## Webhooks

### `POST /api/webhooks/clerk`

**Clerk user webhook**

Called by Clerk (not the app or the mobile client) on user.created, user.updated and user.deleted to keep our users table in sync. Authenticated by an HMAC signature in the svix-id / svix-timestamp / svix-signature headers, verified against CLERK_WEBHOOK_SIGNING_SECRET - configured as a webhook endpoint in the Clerk dashboard, not by a user or staff session.

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
