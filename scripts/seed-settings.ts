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
