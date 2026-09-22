// Seeds the reward_rules catalog with docs/ECONOMY.md's decided starting
// values (decision 3: the prototype's XP unchanged, VM at 3x the
// prototype's values). Idempotent by activityKind - never overwrites
// defaultXp/defaultVm/active on conflict, same reasoning as
// seed-settings.ts: once staff have tuned a rule away from the default,
// this script running again must not silently reset it. Run via
// `pnpm seed:reward-rules`.
import "../envConfig";
import { db } from "../src/db/client";
import { rewardRules } from "../src/db/schema";

const REWARD_RULES = [
  { activityKind: "video", defaultXp: 20, defaultVm: 30 },
  { activityKind: "story", defaultXp: 30, defaultVm: 45 },
  { activityKind: "ai_chat", defaultXp: 25, defaultVm: 60 },
  { activityKind: "role_play", defaultXp: 40, defaultVm: 75 },
  { activityKind: "quiz", defaultXp: 50, defaultVm: 90 },
  { activityKind: "boss_quiz", defaultXp: 120, defaultVm: 300 },
] as const;

async function seed() {
  for (const rule of REWARD_RULES) {
    await db
      .insert(rewardRules)
      .values({ ...rule, active: true })
      .onConflictDoNothing({ target: rewardRules.activityKind });
  }
  console.log(
    `Seeded ${REWARD_RULES.length} reward rule(s) (existing rows, if any, were left untouched).`,
  );
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
