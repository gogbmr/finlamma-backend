// Data-loss/rejection guard for the Task 6a coach-note-editor redesign -
// same reasoning as mentors/worlds: coach note templates have no jsonb
// content blob, every field is a fixed named column
// (src/server/report-card/repo.ts), so there's no "unknown key" to
// silently strip. This simulates the load -> submit path against all 4
// real templates currently in the dev DB (read-only query against
// `coach_note_templates`), through the exact schema the editor's resolver
// uses (reused directly from src/server/report-card/schemas.ts, never a
// copy).
//
// IMPORTANT, pre-existing finding (not introduced by this task, not
// fixed here): all 4 real rows' `id` values fail zod v4's strict
// z.string().uuid() check (invalid version/variant nibbles - e.g.
// "...-032e-..." where the 4th group must start with 8/9/a/b). Verified
// read-only: every OTHER table checked (mentors, worlds, questions,
// lessons - all real rows) has valid v4 ids; only coach_note_templates is
// affected, and all 4 of its rows are. The column itself is a normal
// `uuid(...).primaryKey().defaultRandom()` (src/db/schema/report_card.ts)
// - gen_random_uuid() always emits valid v4 UUIDs, so these 4 rows must
// have been inserted with an explicit, non-standard id by whatever script
// created them, not through the column's own default. Since
// CoachNoteTemplateIdSchema/UpdateCoachNoteTemplateSchema both validate
// `id` the same strict way, update/publish/unpublish on any of these 4
// templates already fails today, via the EXISTING (pre-this-task) admin
// actions too - this is a live bug, not something this redesign causes.
// Below, the id-preservation checks use a real, valid placeholder UUID
// instead of the row's own broken one (isolating what this test is
// actually about - category/template field preservation - from that
// separate, already-broken id), and a dedicated test documents the real
// ids' failure directly so a future fix (data migration regenerating
// them) has a regression check to flip green.
import { describe, expect, it } from "vitest";
import { CoachNoteTemplateIdSchema, UpdateCoachNoteTemplateSchema } from "@/server/report-card/schemas";

type Row = {
  id: string;
  category: "strength" | "gap" | "opportunity" | "habit";
  template: { en: string; hi: string; hx: string };
};

// Pasted verbatim from a read-only Supabase query against the live
// `coach_note_templates` table - all 4 real rows currently there (one per
// category). Their own `id` values are real but, per the finding above,
// do not pass strict UUID validation - see VALID_PLACEHOLDER_ID below.
const ROWS: Row[] = [
  {
    id: "c3ba72ca-075e-504c-032e-299b78bbcbc2",
    category: "strength",
    template: {
      en: "[PLACEHOLDER] Coach note template (strength): {{topic}} at {{pct}}%",
      hi: "[PLACEHOLDER] Coach note template (strength): {{topic}} at {{pct}}%",
      hx: "[PLACEHOLDER] Coach note template (strength): {{topic}} at {{pct}}%",
    },
  },
  {
    id: "fb357390-f98d-fa8c-7d08-e0cfed4ed0f4",
    category: "gap",
    template: {
      en: "[PLACEHOLDER] Coach note template (gap): {{topic}} at {{pct}}%",
      hi: "[PLACEHOLDER] Coach note template (gap): {{topic}} at {{pct}}%",
      hx: "[PLACEHOLDER] Coach note template (gap): {{topic}} at {{pct}}%",
    },
  },
  {
    id: "addb6a3d-b301-317f-70fe-279e942c27a8",
    category: "opportunity",
    template: {
      en: "[PLACEHOLDER] Coach note template (opportunity): {{topic}} at {{pct}}%",
      hi: "[PLACEHOLDER] Coach note template (opportunity): {{topic}} at {{pct}}%",
      hx: "[PLACEHOLDER] Coach note template (opportunity): {{topic}} at {{pct}}%",
    },
  },
  {
    id: "00eabc33-095f-fd00-667c-62d4bbbd58bd",
    category: "habit",
    template: {
      en: "[PLACEHOLDER] Coach note template (habit): {{topic}} at {{pct}}%",
      hi: "[PLACEHOLDER] Coach note template (habit): {{topic}} at {{pct}}%",
      hx: "[PLACEHOLDER] Coach note template (habit): {{topic}} at {{pct}}%",
    },
  },
];

const VALID_PLACEHOLDER_ID = "11111111-1111-4111-8111-111111111111";

describe("coach note editor form round-trip against real templates (no data loss)", () => {
  for (const row of ROWS) {
    it(`${row.category}: UpdateCoachNoteTemplateSchema preserves category/template unchanged`, () => {
      const parsed = UpdateCoachNoteTemplateSchema.parse({
        id: VALID_PLACEHOLDER_ID,
        category: row.category,
        template: row.template,
      });
      expect(parsed).toEqual({ id: VALID_PLACEHOLDER_ID, category: row.category, template: row.template });
    });
  }

  it("documents the real ids' pre-existing UUID-validation failure (not fixed here - see file header)", () => {
    for (const row of ROWS) {
      expect(() => CoachNoteTemplateIdSchema.parse({ id: row.id })).toThrow();
    }
  });
});
