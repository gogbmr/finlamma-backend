# Finlamma — Mobile Integration Guide

This is for whoever builds `finlamma-app` (the Expo/React Native mobile client) and has never
seen this backend before. It covers everything the generated API spec can't: *how* to talk to
the backend, not the per-endpoint request/response shape of each call.

**For per-endpoint detail** (every route, method, auth requirement, parameters, request body,
every response code with a JSON example): `docs/API_ENDPOINTS.md`, generated from
`/api/openapi.json` (currently `v1.4.0`). Download the contract over HTTP and generate a typed
client from it rather than hand-copying examples from that file — see `docs/ARCHITECTURE.md`'s
"Three separate projects" section for the `pnpm api:sync`-style workflow. This document never
repeats a request/response shape that file already has; it links to the relevant endpoint by
path instead.

Everything here describes the backend as it exists today, three separate repos
(`finlamma-backend`, `finlamma-market-relay`, `finlamma-app`), no monorepo, no shared code -
they only ever talk over the network (`docs/ARCHITECTURE.md`'s architecture diagram).

---

## 1. Authentication

### Which Clerk application

There are **two separate Clerk applications** (`docs/ARCHITECTURE.md` decision D2a) - this is the
single most important thing to get right, because mixing them up produces confusing,
hard-to-debug auth failures:

- The **STAFF** Clerk app backs the admin dashboard (`/admin`). It's bound to
  `clerkMiddleware()`/`auth()`/`<ClerkProvider>` via `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`/
  `CLERK_SECRET_KEY`, and is the only Clerk instance that ever manages a session cookie on the
  backend's own domain. **The mobile app never touches this one.**
- The **CONSUMER** Clerk app backs every real learner account. Its keys
  (`CONSUMER_CLERK_PUBLISHABLE_KEY`/`CONSUMER_CLERK_SECRET_KEY`) are what the app's Clerk Expo SDK
  is configured against. This is the one your Expo publishable key must point at.

The backend verifies the app's requests independently of the STAFF app's cookie-based session
entirely - `src/lib/auth.ts`'s `requireUser(req)` calls `@clerk/backend`'s
`authenticateRequest()` directly against the CONSUMER app's keys, reading only the
`Authorization` header. There is no shared session, no shared cookie, and no code path where a
staff sign-in and a learner sign-in could cross over.

### How a request is authenticated

Every `/api/v1/*` app-facing endpoint (everything except `/api/v1/health`, `/api/v1/legal/{type}`
and the relay-only `/api/v1/relay/config`) expects:

```
Authorization: Bearer <Clerk session token>
```

Get this token from the Clerk Expo SDK (`@clerk/clerk-expo`'s `useAuth().getToken()` or
equivalent) **immediately before each request**, not cached long-term by your own code - the SDK
already handles refreshing the short-lived session token under the hood, and calling `getToken()`
fresh each time is what lets it do that silently. Clerk's own Expo quickstart is the source of
truth for exact current setup code (`ClerkProvider`, a `tokenCache` for persisting the refresh
token across app restarts, etc.) - that's SDK-version-specific and belongs in Clerk's own docs,
not duplicated here.

### What happens on token expiry / invalid token

`requireUser` returns `401 UNAUTHENTICATED` (standard error envelope, see §4) in every one of
these cases, with no way to distinguish them from the response alone (deliberate - see
`src/lib/auth.ts`'s own comment on not leaking which failure mode occurred):
- the Bearer token is missing, malformed, or expired
- the token is valid but belongs to a Clerk user the backend has never seen a webhook for yet
  (no matching `users` row)
- the matching `users` row has been deleted (`deletedAt` set)

**On any `401`, the correct app behavior is: get a fresh token from the Clerk SDK and retry once;
if that still fails, treat the session as truly signed out and route to sign-in.** Don't
special-case "expired" vs. "never had an account" - the backend deliberately doesn't tell you
which one it is.

### How the `users` row is created

You never create it directly. Signing up through the Clerk Expo SDK fires a `user.created`
webhook from Clerk to the backend (`POST /api/webhooks/clerk`, HMAC-verified via svix), which is
what inserts the `users` row keyed on `clerkUserId`. This happens asynchronously, generally
within a second or two of sign-up completing - if your very first authenticated API call
immediately after sign-up gets `401 UNAUTHENTICATED` with "No account found for this session",
retry briefly rather than treating it as a hard failure; it almost always means the webhook just
hasn't landed yet.

---

## 2. Onboarding flow

In order, with the exact endpoint for each step (full request/response shapes in
`docs/API_ENDPOINTS.md`):

1. **Sign up** via the Clerk Expo SDK. This alone creates the Clerk identity and (via webhook)
   the `users` row, but the account has **no date of birth yet** - every feature endpoint beyond
   onboarding/Settings/legal is blocked until step 2 completes (see §3).

2. **Collect date of birth**: `POST /api/v1/me/date-of-birth`. **This can only be called once,
   ever** - a second call always fails with `409 CONFLICT` ("contact support to correct it"), so
   don't let the app silently retry this on every launch; call it once, store the fact that
   you've called it, and treat a `409` here as "already set," not an error to surface. The
   response tells you `isMinor` and `requiresParentConsent` - this is the branch point.

   - **Adult** (`isMinor: false`): no consent step. Skip straight to step 4.
   - **Minor** (`isMinor: true`): continue to step 3.

3. **Minor branch - request parental consent**: `POST /api/v1/me/parent-consent/request` with the
   parent's name and email. This:
   - emails the parent a magic link (valid 7 days, single-use)
   - returns `{ status: "pending", parentEmail }` immediately - **the app does not wait for the
     parent to act**
   - can be resent (same endpoint) subject to a 60-second cooldown and a daily cap - `429
     RESEND_TOO_SOON` / `429 RESEND_LIMIT_REACHED` are both retryable later, not client bugs

   **What the app shows while consent is pending**: nothing feature-related works yet (see §3) -
   show a waiting screen ("We've emailed your parent - ask them to check their inbox") and poll
   `GET /api/v1/me/legal-status` (or re-attempt the gated call you actually need) periodically, or
   simply let the learner close the app and come back later. There is no push notification or
   websocket event for "your parent just consented" today - polling on next app open/foreground
   is the only signal.

   The parent acts entirely **outside the app**, on a public web page the backend serves
   (`/consent/...`), not an API call your app makes. Nothing in the app needs to render that step.

4. **Full access**: once (a) date of birth is set, (b) a minor's parent has consented, and (c) the
   current Terms/Privacy/Risk-disclosure have been accepted (`POST /api/v1/me/legal/accept` - see
   `docs/API_ENDPOINTS.md` for the exact body), every other endpoint opens up.

5. **Onboarding-complete flag**: `POST /api/v1/me/onboarding-complete` is unrelated to the gate
   above - it's purely "has this learner seen the World Home mentor-intro modal," never blocks or
   is blocked by anything. It's idempotent (safe to call more than once; it just returns the
   original timestamp), so call it once, right after the intro modal finishes, with no need to
   guard against double-calling it.

---

## 3. The limited-access gate

`requireFullAccess` (`src/server/onboarding/service.ts`) is the single gate nearly every
feature endpoint calls server-side, right after `requireUser`. It throws:

- **`403 FORBIDDEN`**, "Complete onboarding before using this feature" - no date of birth set yet.
- **`403 FORBIDDEN`**, "Parental consent is required before using this feature" - a minor whose
  consent isn't `consented` yet (still `pending`, or `refused`/`withdrawn`).
- **`403 FORBIDDEN`**, "Accept the current Terms, Privacy and Risk-disclosure before using this
  feature" - current legal docs not yet accepted (any account, not just minors).
- **`403 PARENT_REAPPROVAL_REQUIRED`** - a distinct code, not a plain `FORBIDDEN` - for a minor
  who **already has full consent**, but a legal document changed materially since and needs a
  fresh parent approval. The app must treat this differently from the first bullet above: show
  "your parent needs to re-approve the updated Terms/Privacy" rather than the original onboarding
  flow, and call `POST /api/v1/me/legal/reapproval/resend` to resend that specific email (same
  cooldown/cap shape as parent-consent resend).

**Endpoints that work before full access completes** (confirmed directly against every route
file, not inferred) - exactly: `GET /api/v1/health`, `GET /api/v1/legal/{type}`, `GET/PATCH
/api/v1/me`, `POST /api/v1/me/date-of-birth`, `GET /api/v1/me/legal-status`, `POST
/api/v1/me/legal/accept`, `POST /api/v1/me/legal/reapproval/resend`, `POST
/api/v1/me/parent-consent/request`, `GET /api/v1/me/entitlements`, `POST
/api/v1/me/onboarding-complete`. That's the entire onboarding/Settings/legal surface
(`docs/ROADMAP.md`'s "limited feature access" scope) - **everything else** (worlds, lessons,
mentors, trading, Arena, news, Doubt Zone, rewards, wallet, stats, notifications, ...) is gated.
Build the app so the onboarding/limited-access screens are a genuinely separate navigation stack
the learner can't route around - a `403`/`PARENT_REAPPROVAL_REQUIRED` from a gated endpoint is
the server-side backstop, not the primary UX.

---

## 4. Error handling

### The envelope

Every error response, from every endpoint, has this exact shape:

```json
{ "error": { "code": "UPPER_SNAKE_CODE", "message": "human-readable text", "details": {} } }
```

`details` is only present sometimes (e.g. Zod validation failures put the field-level issues
there). `message` is meant to be readable but is **not** meant to be shown to the learner
verbatim for every code - for a handful of codes (below) the app should show its own copy,
because the server's message doesn't know the UI context.

### Codes the app must handle specifically

The full, authoritative list with HTTP status is `src/lib/errors.ts` (also described per-endpoint
in `docs/API_ENDPOINTS.md`); these are the ones that need distinct app behavior, not just a
generic "something went wrong" toast:

| Code | Status | Retryable? | App behavior |
|---|---|---|---|
| `RATE_LIMITED` | 429 | Yes, after a delay | Generic rate limits exist on lesson/Pulse-Check steps, reward claims, trade/SIP placement, Doubt Zone messages. Back off and retry; never surface raw "rate limited" text - show a soft "slow down a little" message. |
| `RESEND_TOO_SOON` / `RESEND_LIMIT_REACHED` | 429 | Yes (after cooldown / next day) | Consent/reapproval resend only. Show a countdown or "try again tomorrow," not an error state. |
| `LESSON_TOO_SOON` / `NEWS_READ_TOO_SOON` | 429 | Yes, shortly | The request will succeed if simply retried once real time has passed (anti-farming, not a mistake) - don't show this as a failure at all if you can avoid it (e.g. just disable the button briefly). |
| `IDEMPOTENCY_REPLAY` | 409 | **No - this is a real client bug** | You reused an `Idempotency-Key` for a request with different parameters than the original. Never auto-retry; this means your own idempotency-key generation is wrong. |
| `PRICE_STALE` / `PRICE_UNAVAILABLE` | 409 | Yes, shortly | Trading only. Show "price unavailable right now, try again" - these are expected during low-liquidity moments or a relay hiccup, not exceptional. |
| `NAV_STALE` / `NAV_UNAVAILABLE` | 409 | Yes, later | Fund orders only - a fund's NAV hasn't refreshed yet (ingested once daily). Not retryable "shortly" the way prices are; show "try again later today." |
| `MARKET_CLOSED` / `MARKET_HALTED` / `SYMBOL_HALTED` / `MARKET_PAUSED` | 409 | No, until hours/halt change | Show the specific reason, not a generic failure - the app should also proactively disable the trade button using `GET /api/v1/trade/market-status` rather than relying on this error as the primary signal. |
| `COMPETITION_ENTRY_CLOSED` / `COMPETITION_MAX_TRADES_REACHED` | 409 | No | Monthly Competition only - entry window closed (first half of the competition's window only) or the per-entry trade cap (currently 10) was hit. Show the specific reason; don't let the UI suggest "just try again." |
| `INSUFFICIENT_MARGIN` / `INSUFFICIENT_HOLDINGS` / `INSUFFICIENT_VMONEY` | 409 | No, until balance changes | Show the real reason (not enough V Money / not enough shares to sell) - never silently round the requested amount down. |
| `PARENT_REAPPROVAL_REQUIRED` | 403 | After parent acts | See §3 - distinct screen from the first-time consent flow. |
| `VALIDATION_FAILED` | 400 | No - client bug | `details` has Zod's field-level errors - useful in development, but don't ship raw field-path strings to end users. |
| `CONFLICT` | 409 | Depends on context | e.g. date-of-birth already set (treat as success, see §2), a reward already claimed, etc. - read the message. |

Everything else (`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `INTERNAL`, `SERVICE_UNAVAILABLE`,
`INVALID_SIGNATURE`) behaves the way its HTTP status suggests and needs no special casing beyond
standard "sign out and back in" / "show a generic error" / "retry later" handling.

### General rule

**Never pattern-match on `error.message` text.** Only `error.code` is a stable contract - the
message string can change without a version bump (`openapi/CHANGELOG.md` only tracks
schema/endpoint changes, not copy).

---

## 5. Rules the server enforces — respect them, don't re-implement or fight them

These are real, tested server-side invariants (`docs/ARCHITECTURE.md` decisions D21/D22/D24/D41/
D46, the `trading-rules`/`money-ledger` skills). The app's job is to make its UI match what the
server will actually do, not to duplicate the enforcement client-side (which would just be a
second, driftable copy of the same rule) or to work around it (which will simply fail server-side
every time).

- **Quiz/Pulse-Check answers are server-timed.** `servedAt` is stamped when the server hands out
  the question, and elapsed time for scoring/timeout is always `now - servedAt` computed
  server-side (with a small, fixed network-latency grace period) - never a client-reported
  duration. Don't try to send your own elapsed-time value; it's ignored. Do start your own local
  timer UI immediately on receiving the `serve` response, so the on-screen countdown matches what
  the server is actually timing against.
- **One answer per question per attempt, idempotent.** Resubmitting an already-answered step
  returns the exact original graded result - safe to retry a `submit` call on a flaky connection
  without double-submitting or getting a different outcome.
- **A hotfixed question never changes what an in-flight attempt is graded against.** The server
  snapshots the exact question content at serve time and grades against that snapshot forever,
  even if staff fix a typo in the live question a second later. You'll never see a quiz answer
  graded "wrong" because content changed mid-attempt.
- **Every order (and fund order, and SIP creation) needs a unique `Idempotency-Key` header.**
  Generate a fresh UUID per *user-initiated* action (e.g. once per tap of "Buy"), not per HTTP
  retry - reusing the same key for a retry of the exact same request is the whole point (returns
  the original result instead of double-filling); reusing it for a *different* request is a bug
  (`IDEMPOTENCY_REPLAY`, see §4).
- **Answers are never sent to the client before grading.** A quiz/Pulse-Check question's payload
  never includes the correct answer - don't expect to pre-fetch and locally validate; always
  round-trip to the `answer` endpoint.
- **Whole shares only, no fractional stock.** `qty` on a stock order is a plain positive integer -
  there's no fractional-share concept for instruments (mutual funds are the opposite: always
  fractional, tracked in thousandths of a unit, never whole numbers). Don't let the UI suggest a
  partial share is ever possible for a stock.
- **Trading unlocks by world position, not XP or level.** A learner can place their first trade
  only once they've passed the Boss Quiz of the first N published worlds in order (N =
  `tradingUnlockAfterWorldPosition`, admin-editable, currently 3) - not a level threshold, not a
  specific named world (so this moves automatically if worlds are reordered). Don't infer this
  from level/XP or hardcode a world name - `GET /api/v1/trade/market-status` returns
  `tradingUnlocked` and `worldsToGo` precomputed for exactly this purpose (it's also what backs
  the market-status pill and the order pad's lock/progress message generally), so gate the trade
  UI on that field directly rather than re-deriving it.
- **Daily/period caps exist in several places** and are enforced server-side regardless of what
  the UI shows: Pulse Check VM is capped per day (`dailyCapReached` on the attempt result),
  consent/reapproval resends are capped per day, and the Monthly Competition caps total trades per
  entry (currently 10) and requires a minimum qualifying-trade count (currently 5) before an entry
  is even eligible for ranking - don't assume "I can always place one more trade" inside a
  competition.
- **Rejections never create a persisted row** (orders, fund orders except a SIP's own unattended
  failure, reward claims, cheers). A rejected attempt is just an error response - there's no
  "pending/rejected" order status to poll for; either the call succeeded (you'll see the created
  resource) or it threw (handle the error code).

---

## 6. Realtime / polling

There is **no websocket or push channel from this backend to the app** for anything other than
Expo push notifications (see below). Two genuinely different "live data" paths exist and they
are not interchangeable:

- **Live trade-execution prices**: the app connects **directly** to `finlamma-market-relay` (a
  separate always-on service, separate repo) over **Socket.IO**, authenticated with the same
  Clerk token, for the live tick stream used while an order is open on a trade screen. This
  backend is not in that path at all except as the ultimate destination once an order is actually
  placed (which reads the same Redis price key the relay writes, server-side, at fill time - see
  §8 for the Redis key contract). The relay's own contract is documented in its own
  `docs/API_ENDPOINTS.md`, kept in the app as `docs/RELAY_API.md` per
  `docs/ARCHITECTURE.md` - this document only covers the `finlamma-backend` REST API, not the
  relay's Socket.IO protocol.
- **Display quotes/candles** (the instrument list, stock detail screen, charts, when you're *not*
  mid-order): `GET /api/v1/trade/instruments`, `/trade/instruments/{symbol}`,
  `/trade/instruments/{symbol}/candles` - these are this backend's own REST endpoints, backed by
  a short-TTL Redis cache in front of the market-data vendor (never hit the vendor directly per
  request). Poll these at a normal "pull to refresh" / screen-focus cadence (a few seconds to
  tens of seconds) - they're deliberately a separate, slower-refreshing path from the relay's live
  tick stream, and trying to poll them sub-second just hits the same cached value repeatedly.
- **Market status** (`GET /api/v1/trade/market-status`): cheap, poll whenever the trade screen is
  focused and before enabling the Buy/Sell buttons, rather than relying solely on an order
  attempt's error response to discover the market is closed/halted.
- **Notifications**: no push-on-arrival signal to the app beyond actual Expo push notifications
  (device-level, arrive even when the app is backgrounded). Inside the app, poll `GET
  /api/v1/me/notifications/unread-count` on foreground/resume and at a modest interval while
  foregrounded (e.g. on a timer of a minute or so, or simply on navigation to the notifications
  tab) - there's no reason to poll aggressively since nothing server-side pushes a faster signal.
- **Push notifications** are opt-in device tokens registered via `POST /api/v1/me/push-token`
  (Expo push tokens) - see §8 for what's mocked vs. real today.

---

## 7. The three languages

Every content field that's ever staff-authored or learner-facing copy (lesson/question text,
mentor bios, world titles, badge/reward names, news stories, notification text, ...) is returned
as a **full object with all three languages**, never a single pre-selected string and never
filtered by a query parameter:

```json
{ "title": { "en": "...", "hi": "...", "hx": "..." } }
```

- `en` - English
- `hi` - Hindi (Devanagari script)
- `hx` - Hinglish (Hindi meaning, Roman/Latin script - matches how the prototype's "Hinglish"
  toggle actually works)

**The app picks which one to display**, based on the learner's own `users.language` preference
(`GET/PATCH /api/v1/me`, one of `en`/`hi`/`hx`, defaults to `hx`) - there is no server-side
`?lang=` filtering anywhere in this API; every response always carries the full trilingual object
and the client-side rendering layer is the single place that picks a leaf. This means switching
the in-app language preference is purely a local re-render - it never needs a different API call
or response shape, since the data for all three was already there.

A field that's plain system/reference data with no translation concept (an instrument's trading
symbol, a Clerk id, a UUID, a timestamp, a numeric amount) is never wrapped this way - only look
for the `{en, hi, hx}` shape on fields `docs/API_ENDPOINTS.md` documents as localized text.

---

## 8. What's mocked today

Build against these as if they were the real thing - the response **shapes** are final and
stable; only the underlying data source will change later, as a one-file swap behind an adapter
(`docs/ARCHITECTURE.md` decisions D38/D39, D50, D65), never an API contract change:

- **Market data** (quotes/candles, `/trade/instruments/*`): a mock provider, not yet connected to
  a real vendor (Twelve Data is the likely candidate, pending a cost confirmation -
  `docs/ARCHITECTURE.md` D38). **Prices you see today are fixture data, not real NSE prices** -
  don't be confused by a stock's price looking static or implausible; this is expected and will
  change to real ticks with no app-side changes needed.
- **News** (`/news/feed`, `/news/{id}`, Pulse Check source stories): a mock provider
  (`docs/ARCHITECTURE.md` D50) - no news vendor is currently licensed for this app's actual use
  case (ingest → AI-rewrite → display in a paid, minors-facing app), so every story visible today
  is fixture/seed content, not live news. Same one-file-swap plan once a vendor confirms terms in
  writing.
- **Push notifications** (`POST /me/push-token`, the notification endpoints generally): behind a
  provider adapter defaulting to a mock unless Expo push credentials are actually configured
  server-side (`docs/ARCHITECTURE.md` D65) - registering a token and triggering notification-
  worthy events works end-to-end against the mock, but no real device push will arrive until a
  real Expo account is wired up. Don't treat "no push arrived in testing" as an app bug by
  default - check whether the backend environment has real push credentials configured first.
- **Doubt Zone's live AI mentor**: this one is real (`@anthropic-ai/sdk`, not mocked) but every
  reply is explicitly a draft-safety-gated output, never personal investment advice by design
  (CLAUDE.md rule 11) - a flagged message (self-harm, abuse, or a classifier outage) gets a fixed,
  non-model-generated redirect message instead of a live reply; that's expected behavior, not an
  error.
- **The seed/placeholder content layer**: most lessons, badges, rewards, news stories, etc. you'll
  encounter in local/preview development right now are dev-seed placeholders, visibly prefixed
  `[PLACEHOLDER]` in every text field (`docs/STATUS.md`'s dev-seed entries) - don't build any
  app-side logic that depends on specific placeholder copy; it will be replaced by real content
  before launch with no shape change.

Nothing above requires the app to special-case "mock mode" - the point of the adapter pattern is
that the app never knows or needs to know which one is behind the response.

---

## 9. Pagination, sorting, and other cross-cutting conventions

- **Base path**: `/api/v1`. Resources are plural, kebab-case where multi-word
  (`/api/v1/doubt-zone/threads`).
- **Success envelope**: `{ "data": T }` for a single resource (`200`, or `201` for a create).
  **List envelope**: `{ "data": T[], "nextCursor": string | null }` - `nextCursor` is an opaque,
  base64url-encoded token; never construct or decode it yourself, just pass whatever you were
  given back as `?cursor=` on the next request. `nextCursor: null` means you've reached the end.
- **List query params**: `?cursor=` (omit for the first page) and `?limit=` (default 20, max 100 -
  a limit above 100 is silently clamped, not rejected).
- **IDs** are strings (UUIDs) everywhere except a handful of fixed string keys (e.g. a mentor's
  `key`, a legal document `type`) that `docs/API_ENDPOINTS.md` calls out explicitly per endpoint.
- **Dates/times**: ISO 8601 UTC strings (`2026-01-01T00:00:00.000Z`) for timestamps. A few fields
  are plain calendar-date strings with no time component (`YYYY-MM-DD` - date of birth, a streak's
  last-active date, a SIP's day-of-month) - `docs/API_ENDPOINTS.md`'s per-field description says
  which is which; don't assume every date-like field is a full timestamp.
- **Money**: always integers, never floats, in two different units depending on the field -
  V Money amounts are whole V Money units; everything priced (stock/fund prices, order fill
  prices, wallet amounts in a few specific fields `docs/API_ENDPOINTS.md` marks explicitly) is in
  **paise** (1 rupee = 100 paise). The app is responsible for all display formatting (₹ symbol,
  decimal placement, V Money iconography) - the server never sends a pre-formatted string.
- **JSON field casing**: camelCase, always - including inside nested/localized objects.
- **Breaking changes never happen silently.** A breaking API change ships as a new field or a new
  route, never a changed meaning for an existing one, and is called out in
  `openapi/CHANGELOG.md`. Pin against a specific contract version if you need to detect a
  server upgrade that affects you; don't assume every deploy is backward compatible by
  inspection alone, check the changelog.
- **Admin-only and relay-only endpoints appear in the same OpenAPI document** (for completeness,
  per `CLAUDE.md`) but are never meant for the app: anything under the admin dashboard's own
  surface, the Clerk/RevenueCat webhook endpoints, and `/api/v1/relay/config`. If an endpoint's
  OpenAPI tag is `Relay` or its description says "admin only" / "staff only," it's not part of
  this integration.
