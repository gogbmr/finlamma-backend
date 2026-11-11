// Seeds the settings_kv defaults the parental-consent flow reads via
// getSettingNumber() (src/lib/settings.ts) - see docs/DATA_MODEL.md's
// Compliance section. Without these rows, the flow already works (falls
// back to the same numbers hardcoded in src/server/onboarding/service.ts),
// so this script only matters once a staff member wants to actually tune
// them away from the defaults. Idempotent - upserts by key. Run via
// `pnpm seed:settings`.
import "../envConfig";
import { db } from "../src/db/client";
import { settingsKv } from "../src/db/schema";
import {
  ARENA_LEAGUE_WEEKLY_VM_CAP_KEY,
  ARENA_MIN_LEADERBOARD_POOL_SIZE_KEY,
  ARENA_PROMOTE_VM_REWARD_KEY,
  ARENA_SAFE_VM_REWARD_KEY,
  CHEER_DAILY_XP_CAP_KEY,
  CHEER_WEEKLY_SENDER_RECEIVER_CAP_KEY,
  CHEER_XP_AMOUNT_KEY,
  DEFAULT_ARENA_LEAGUE_WEEKLY_VM_CAP,
  DEFAULT_ARENA_MIN_LEADERBOARD_POOL_SIZE,
  DEFAULT_ARENA_PROMOTE_VM_REWARD,
  DEFAULT_ARENA_SAFE_VM_REWARD,
  DEFAULT_CHEER_DAILY_XP_CAP,
  DEFAULT_CHEER_WEEKLY_SENDER_RECEIVER_CAP,
  DEFAULT_CHEER_XP_AMOUNT,
} from "../src/server/arena/service";
import {
  COMPETITION_ENTRY_WINDOW_PCT_KEY,
  COMPETITION_MAX_TRADES_KEY,
  COMPETITION_MIN_QUALIFYING_TRADES_KEY,
  DEFAULT_COMPETITION_ENTRY_WINDOW_PCT,
  DEFAULT_COMPETITION_MAX_TRADES,
  DEFAULT_COMPETITION_MIN_QUALIFYING_TRADES,
} from "../src/server/competitions/service";
import { DAILY_GOALS_SETTINGS_KEY, DEFAULT_DAILY_GOALS } from "../src/server/daily-goals/schemas";
import {
  DEFAULT_DOUBT_ZONE_ENABLED,
  DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS,
  DOUBT_ZONE_ENABLED_KEY,
  DOUBT_ZONE_SAFETY_SETTINGS_KEY,
} from "../src/server/doubt-zone/schemas";
import {
  DEFAULT_VM_ISSUANCE_MULTIPLIER,
  VM_ISSUANCE_MULTIPLIER_SETTINGS_KEY,
} from "../src/server/economy/schemas";
import { DEFAULT_LEVEL_CURVE_SETTINGS, LEVEL_CURVE_SETTINGS_KEY } from "../src/server/leveling/schemas";
import { ADS_SETTINGS_KEY, DEFAULT_ADS_SETTINGS } from "../src/server/monetisation/schemas";
import {
  DEFAULT_NEWS_QUIZ_GENERATOR_SETTINGS,
  NEWS_QUIZ_GENERATOR_SETTINGS_KEY,
} from "../src/server/news/schemas";
import {
  DEFAULT_NOTIFICATIONS_SETTINGS,
  NOTIFICATIONS_SETTINGS_KEY,
} from "../src/server/notifications/schemas";
import { DEFAULT_RISK_THRESHOLDS, RISK_THRESHOLDS_SETTINGS_KEY } from "../src/server/ops/schemas";
import {
  DEFAULT_PULSE_CHECK_SCORING,
  PULSE_CHECK_SCORING_SETTINGS_KEY,
} from "../src/server/pulse-check/schemas";
import { DEFAULT_LESSON_FLOW_SCORING } from "../src/server/settings/schemas";
import { DEFAULT_STREAKS_SETTINGS, STREAKS_SETTINGS_KEY } from "../src/server/streaks/schemas";

const SETTINGS = [
  {
    key: "parent_email_max_children",
    value: 5,
    description:
      "Max number of Finlamma accounts one parent/guardian email can be linked to, before " +
      "further parent-consent requests to that email are refused.",
  },
  {
    key: "consent_resend_daily_cap",
    value: 5,
    description:
      "Max parent-consent request emails sent per day, enforced independently per account and " +
      "per parent email.",
  },
  {
    key: "lesson_flow_scoring",
    value: DEFAULT_LESSON_FLOW_SCORING,
    description:
      "Lesson Flow scoring constants (speed bonus, combo, fever mode, base XP per quiz kind) - " +
      "see docs/PRODUCT_SPEC.md §1. Editable only by super_admin (settings.manage), logged.",
  },
  {
    key: VM_ISSUANCE_MULTIPLIER_SETTINGS_KEY,
    value: DEFAULT_VM_ISSUANCE_MULTIPLIER,
    description:
      "Global V Money issuance multiplier - scales every reward_rules VM award at credit time, " +
      "without touching the seeded reward_rules values. See docs/PRODUCT_SPEC.md §2. Editable " +
      "only by super_admin (economy.manage), logged.",
  },
  {
    key: STREAKS_SETTINGS_KEY,
    value: DEFAULT_STREAKS_SETTINGS,
    description:
      "Streak freeze allowance per IST calendar month. See docs/ARCHITECTURE.md D30. Editable " +
      "only by super_admin (settings.manage), logged.",
  },
  {
    key: DAILY_GOALS_SETTINGS_KEY,
    value: DEFAULT_DAILY_GOALS,
    description:
      "Daily goal meter (PR-09): which goal types are active and their targets. Evaluators live " +
      "in code (src/server/daily-goals/evaluators.ts) - this only controls which of them run. " +
      "Editable only by super_admin (settings.manage), logged.",
  },
  {
    key: DOUBT_ZONE_SAFETY_SETTINGS_KEY,
    value: DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS,
    description:
      "Doubt Zone AI safety settings: crisis helpline redirect text, advice-language fallback, " +
      "thread disclosure copy, safety-classifier sensitivity, and daily message caps. The seeded " +
      "helpline copy is a DRAFT pending founder + qualified-person review (docs/ROADMAP.md " +
      "pre-launch checklist) - do not treat it as launch-ready. See docs/ARCHITECTURE.md's Phase " +
      "7 kickoff decisions. Editable only by super_admin (settings.manage), logged.",
  },
  {
    key: NOTIFICATIONS_SETTINGS_KEY,
    value: DEFAULT_NOTIFICATIONS_SETTINGS,
    description:
      "Notification defaults: quiet hours window (kid-safe - no push overnight unless a learner " +
      "overrides it) and feed retention days (WH-20). Editable only by super_admin " +
      "(settings.manage), logged.",
  },
  {
    key: ADS_SETTINGS_KEY,
    value: DEFAULT_ADS_SETTINGS,
    description:
      "Phase 8: which world position (1-based, sequential-clear) a learner must pass before " +
      "ads start showing, for a non-ad-free account. See docs/ROADMAP.md Phase 8.",
  },
  // --- Everything below: audited 2026-11-11 while chasing the notification-prefs
  // quietHours bug report. These keys already have a code-level fallback at
  // every call site (getSettingNumber/getSettingJson with a DEFAULT_* second
  // argument), so there was never a functional gap - this just makes them
  // visible/tunable from /admin/settings without a code deploy, matching the
  // ads_config precedent above. Values below are IDENTICAL to each one's
  // existing code fallback - no behavior change.
  {
    key: LEVEL_CURVE_SETTINGS_KEY,
    value: DEFAULT_LEVEL_CURVE_SETTINGS,
    description:
      "XP-to-level curve (baseXp, stepXp) - level is always derived from total XP via this " +
      "curve, never stored. See docs/ARCHITECTURE.md D32. Editable only by super_admin " +
      "(settings.manage), logged.",
  },
  {
    key: NEWS_QUIZ_GENERATOR_SETTINGS_KEY,
    value: DEFAULT_NEWS_QUIZ_GENERATOR_SETTINGS,
    description:
      "Daily news-quiz generator: question count, per-question timer, base VM per question, " +
      "and which question formats are eligible (today: only the one format the app can render " +
      "interactively). Editable only by super_admin (settings.manage), logged.",
  },
  {
    key: RISK_THRESHOLDS_SETTINGS_KEY,
    value: DEFAULT_RISK_THRESHOLDS,
    description:
      "Ops risk-flag thresholds (NEW/WATCH/OK) shown on the staff Ops console: new-account " +
      "age, position concentration %, and daily order count. Editable only by super_admin " +
      "(settings.manage), logged.",
  },
  {
    key: PULSE_CHECK_SCORING_SETTINGS_KEY,
    value: DEFAULT_PULSE_CHECK_SCORING,
    description:
      "Pulse Check scoring constants (speed bonus, combo bonus, all-correct bonus, daily VM " +
      "cap). Editable only by super_admin (settings.manage), logged.",
  },
  {
    key: DOUBT_ZONE_ENABLED_KEY,
    value: DEFAULT_DOUBT_ZONE_ENABLED,
    description:
      "Doubt Zone feature on/off switch, independent of the safety-classifier settings above. " +
      "Defaults to false (disabled) - seeded here at that same off default, so the switch is " +
      "visible in /admin/settings without changing today's behavior. Editable only by " +
      "super_admin (settings.manage), logged.",
  },
  {
    key: ARENA_MIN_LEADERBOARD_POOL_SIZE_KEY,
    value: DEFAULT_ARENA_MIN_LEADERBOARD_POOL_SIZE,
    description:
      "Arena: minimum pool size before a league's leaderboard is considered populated enough " +
      "to settle. Editable only by super_admin (settings.manage), logged.",
  },
  {
    key: CHEER_XP_AMOUNT_KEY,
    value: DEFAULT_CHEER_XP_AMOUNT,
    description:
      "Arena: XP a learner receives per cheer (AR-12). Editable only by super_admin " +
      "(settings.manage), logged.",
  },
  {
    key: CHEER_DAILY_XP_CAP_KEY,
    value: DEFAULT_CHEER_DAILY_XP_CAP,
    description:
      "Arena: cap on a receiver's total cheer-XP income per IST day. Editable only by " +
      "super_admin (settings.manage), logged.",
  },
  {
    key: CHEER_WEEKLY_SENDER_RECEIVER_CAP_KEY,
    value: DEFAULT_CHEER_WEEKLY_SENDER_RECEIVER_CAP,
    description:
      "Arena: cap on cheer-XP from one sender/receiver pair per week (docs/ARCHITECTURE.md " +
      "D56). Editable only by super_admin (settings.manage), logged.",
  },
  {
    key: ARENA_PROMOTE_VM_REWARD_KEY,
    value: DEFAULT_ARENA_PROMOTE_VM_REWARD,
    description:
      "Arena league settlement: VM reward for a promotion (prototype-sourced value, " +
      "unchanged). Editable only by super_admin (settings.manage), logged.",
  },
  {
    key: ARENA_SAFE_VM_REWARD_KEY,
    value: DEFAULT_ARENA_SAFE_VM_REWARD,
    description:
      "Arena league settlement: VM reward for staying safe zone (docs/ARCHITECTURE.md D55 - " +
      "deliberately 0, departs from the prototype's 150). Editable only by super_admin " +
      "(settings.manage), logged.",
  },
  {
    key: ARENA_LEAGUE_WEEKLY_VM_CAP_KEY,
    value: DEFAULT_ARENA_LEAGUE_WEEKLY_VM_CAP,
    description:
      "Arena league settlement: max VM a single league payout can award in a week. Editable " +
      "only by super_admin (settings.manage), logged.",
  },
  {
    key: COMPETITION_MIN_QUALIFYING_TRADES_KEY,
    value: DEFAULT_COMPETITION_MIN_QUALIFYING_TRADES,
    description:
      "Monthly single-stock Competition: minimum trades to qualify for the final standings. " +
      "Editable only by super_admin (settings.manage), logged.",
  },
  {
    key: COMPETITION_MAX_TRADES_KEY,
    value: DEFAULT_COMPETITION_MAX_TRADES,
    description:
      "Monthly single-stock Competition: maximum trades allowed per entry. Editable only by " +
      "super_admin (settings.manage), logged.",
  },
  {
    key: COMPETITION_ENTRY_WINDOW_PCT_KEY,
    value: DEFAULT_COMPETITION_ENTRY_WINDOW_PCT,
    description:
      "Monthly single-stock Competition: entry window as a % of the competition period. " +
      "Editable only by super_admin (settings.manage), logged.",
  },
  // Deliberately NOT seeded: ARENA_CREST_BADGE_ID_KEY ("arena_crest_badge_id"). Unlike every
  // other key here, this one has no DEFAULT_* fallback constant at all - it's null until an
  // admin actually creates the crest badge in the badge editor and points this at its real id
  // (src/server/arena/service.ts's own comment on the constant). Seeding any value here would
  // be wrong, not just unnecessary - there's no "default" badge id that would be correct.
] as const;

async function seed() {
  for (const setting of SETTINGS) {
    await db
      .insert(settingsKv)
      .values(setting)
      .onConflictDoUpdate({
        target: settingsKv.key,
        set: { description: setting.description },
        // Deliberately never overwrites `value` on conflict - once a
        // staff member has tuned a setting away from the default, this
        // script running again (e.g. against a fresh environment) must
        // not silently reset it.
      });
  }
  console.log(`Seeded ${SETTINGS.length} setting(s) (existing values, if any, were left untouched).`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
