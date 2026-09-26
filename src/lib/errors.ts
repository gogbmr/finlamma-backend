// Every error code the API can return, and the HTTP status it maps to.
// Codes are UPPER_SNAKE per docs/API_ENDPOINTS.md conventions. Add
// domain-specific codes (INSUFFICIENT_MARGIN, MARKET_CLOSED, WORLD_LOCKED, ...)
// here when the feature that raises them is actually built.
export const ErrorCode = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  IDEMPOTENCY_REPLAY: "IDEMPOTENCY_REPLAY",
  RATE_LIMITED: "RATE_LIMITED",
  INVALID_SIGNATURE: "INVALID_SIGNATURE",
  INTERNAL: "INTERNAL",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",

  // Parental consent (src/server/onboarding) - the app needs to branch on
  // these specifically (e.g. show a resend countdown vs. a "try tomorrow"
  // message), unlike the consent page's own errors which just render a
  // plain-English message and reuse NOT_FOUND/CONFLICT (see
  // src/app/consent/actions.ts).
  CONSENT_NOT_NEEDED: "CONSENT_NOT_NEEDED",
  PARENT_EMAIL_INVALID: "PARENT_EMAIL_INVALID",
  PARENT_EMAIL_LIMIT_REACHED: "PARENT_EMAIL_LIMIT_REACHED",
  RESEND_TOO_SOON: "RESEND_TOO_SOON",
  RESEND_LIMIT_REACHED: "RESEND_LIMIT_REACHED",
  // Distinct from the initial-consent FORBIDDEN case in requireFullAccess -
  // the app needs to tell "your parent hasn't consented yet at all" apart
  // from "your parent already consented once, but a legal document changed
  // and needs a fresh approval" so it can show the right screen.
  PARENT_REAPPROVAL_REQUIRED: "PARENT_REAPPROVAL_REQUIRED",

  // Story/Doubt Zone completion (src/server/lesson-progress) - the request
  // itself is fine and will succeed if simply retried once enough time has
  // passed, same "temporary, not a client mistake" shape as RESEND_TOO_SOON.
  LESSON_TOO_SOON: "LESSON_TOO_SOON",

  // Rewards (src/server/rewards) - the learner's V Money balance is below a
  // reward's price_vm at claim time.
  INSUFFICIENT_VMONEY: "INSUFFICIENT_VMONEY",

  // Trading (src/server/orders, Phase 4 Checkpoint 5, trading-rules skill) -
  // each names a distinct reason an order can't be placed/filled right now,
  // so the app can show the right message instead of a generic failure.
  // None of these persist a "rejected" order row (see docs/ARCHITECTURE.md
  // D41) - same as every other pre-condition failure in this codebase
  // (e.g. INSUFFICIENT_VMONEY), a clean thrown error with no DB write.
  MARKET_CLOSED: "MARKET_CLOSED",
  MARKET_HALTED: "MARKET_HALTED",
  SYMBOL_HALTED: "SYMBOL_HALTED",
  MARKET_PAUSED: "MARKET_PAUSED",
  PRICE_STALE: "PRICE_STALE",
  PRICE_UNAVAILABLE: "PRICE_UNAVAILABLE",
  INSUFFICIENT_MARGIN: "INSUFFICIENT_MARGIN",
  INSUFFICIENT_HOLDINGS: "INSUFFICIENT_HOLDINGS",

  // Mutual funds (src/server/fund-orders, Phase 4 Checkpoint 8,
  // docs/ARCHITECTURE.md D46) - a fund has no LIMIT/MARKET distinction or
  // market-hours gate the way a stock does, only a NAV that may or may not
  // be freshly available. Same "no persisted rejection" convention as the
  // stock codes above, for a manual order; a SIP-triggered attempt is the
  // one deliberate exception (D46) and does persist a "failed" row.
  NAV_UNAVAILABLE: "NAV_UNAVAILABLE",
  NAV_STALE: "NAV_STALE",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  IDEMPOTENCY_REPLAY: 409,
  RATE_LIMITED: 429,
  INVALID_SIGNATURE: 400,
  INTERNAL: 500,
  SERVICE_UNAVAILABLE: 503,

  CONSENT_NOT_NEEDED: 409,
  PARENT_EMAIL_INVALID: 400,
  PARENT_EMAIL_LIMIT_REACHED: 409,
  RESEND_TOO_SOON: 429,
  RESEND_LIMIT_REACHED: 429,
  PARENT_REAPPROVAL_REQUIRED: 403,
  LESSON_TOO_SOON: 429,
  INSUFFICIENT_VMONEY: 409,

  MARKET_CLOSED: 409,
  MARKET_HALTED: 409,
  SYMBOL_HALTED: 409,
  MARKET_PAUSED: 409,
  PRICE_STALE: 409,
  PRICE_UNAVAILABLE: 409,
  INSUFFICIENT_MARGIN: 409,
  INSUFFICIENT_HOLDINGS: 409,

  NAV_UNAVAILABLE: 409,
  NAV_STALE: 409,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}
