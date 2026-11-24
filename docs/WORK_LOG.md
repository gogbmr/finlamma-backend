# Work log

Running log of browser-testing-driven changes (see CLAUDE.md's "working mode" section).
One entry per request: date, what was asked (short), files changed, status.

## 2026-11-19 — Lessons admin page: view/edit/delete icons, dropdown filters, delete capability added

**Asked:** Mirror the Worlds page redesign on `/admin/lessons` - remove the inline edit-below-table
form, add a View/Edit/Delete icon column, convert the world/status/kind filters (chip-link rows)
to dropdown selects with an "All worlds" option, move "+ New lesson" to its own page, polish the
view/edit UI. Lessons had no delete capability at all before this - added one (draft-only, mirrors
Worlds' permission/trust-bar pattern), confirmed with the founder first since it touches
`src/server/lessons/service.ts`/`repo.ts`.

**Files changed:**
- `src/server/lessons/repo.ts`, `service.ts` (+tests) — new `deleteLesson`/`deleteLessonRow`, draft-only
- `src/app/admin/(dashboard)/lessons/actions.ts` (+tests) — new `deleteLessonAction` (requires `lesson.publish`)
- `src/app/admin/(dashboard)/lessons/page.tsx` (+tests) — table-only list, "All worlds" aggregation
- `src/app/admin/(dashboard)/lessons/lessons-table.tsx` (+tests) — Actions column, optional World column
- `src/app/admin/(dashboard)/lessons/lessons-filter-bar.tsx` (new) — World/Status/Kind dropdowns
- `src/app/admin/(dashboard)/lessons/lesson-editor.tsx` — removed inline-form wrapper, exported `NewLessonForm`/`LessonForm`, SectionCard icons
- `src/app/admin/(dashboard)/lessons/lesson-view.tsx` (new), `find-lesson.ts` (new, +tests)
- `src/app/admin/(dashboard)/lessons/[id]/page.tsx`, `[id]/edit/page.tsx`, `new/page.tsx` (new, +tests)

**Verified:** `pnpm typecheck`/`lint` clean (same pre-existing baseline), full `pnpm test` - 280
files / 2952 tests passing, `pnpm build` clean (all 4 new routes show up as dynamic, same as every
other admin page).

**Status:** done, not yet committed - waiting for your browser check and "push".

## 2026-11-19 — Questions admin page: same treatment (view/edit/delete icons, dropdown filters, delete capability added)

**Asked:** Do the same for `/admin/questions`. Format/Topic were already dropdown selects there
(only Status was still a link-chip row) - converted Status too for full consistency, removed the
inline edit-below-table form (+ its on-demand `QuestionDetailLoader` fetch, no longer needed now
that the view/edit pages fetch the full record directly server-side via the existing
`getQuestionDetailForAdmin`), added the Actions column, moved "+ New question" to its own page.
Questions had no delete capability either - added one (draft-only, same shape as Lessons), but
flagged a real difference first: lesson *content* holds question ids as jsonb (not a real FK), so
a draft question could in theory be referenced by a still-draft lesson with no DB-level block.
Founder's call: accept that as a rare, recoverable edge case rather than add a cross-domain
reference check - same simple draft-only rule as Lessons.

**Files changed:**
- `src/server/questions/repo.ts`, `service.ts` (+tests) — new `deleteQuestion`/`deleteQuestionRow`, draft-only
- `src/app/admin/(dashboard)/questions/actions.ts` (+tests) — new `deleteQuestionAction` (requires `question.publish`)
- `src/app/admin/(dashboard)/questions/page.tsx` (+tests) — table-only list, "+ New question" moved to header
- `src/app/admin/(dashboard)/questions/questions-table.tsx` (+tests) — Actions column, Status now a dropdown too
- `src/app/admin/(dashboard)/questions/question-editor.tsx` — removed inline-form wrapper + `QuestionDetailLoader`, exported `NewQuestionForm`/`QuestionForm`, SectionCard icons on the generic sections
- `src/app/admin/(dashboard)/questions/question-view.tsx` (new)
- `src/app/admin/(dashboard)/questions/[id]/page.tsx`, `[id]/edit/page.tsx`, `new/page.tsx` (new, +tests)

**Verified:** `pnpm typecheck`/`lint` clean (same pre-existing baseline), full `pnpm test` - 285
files / 2978 tests passing, `pnpm build` clean (all 4 new routes show up as dynamic, same as every
other admin page).

**Status:** done, not yet committed - waiting for your browser check and "push".

## 2026-11-19 — Mentors admin page: same treatment, plus a real cross-domain delete-safety check

**Asked:** Do the same for `/admin/mentors`. Removed the inline edit-below-table form, added the
Actions column, moved "+ New mentor" to its own page (Status stayed a link-chip row, same as
Worlds - this request didn't ask for the dropdown conversion Lessons/Questions got). Mentors had
no delete capability either, but this one is structurally different from Lessons/Questions:
`worlds.mentorId` is a real, mandatory FK (`NOT NULL`, `onDelete: "restrict"`), not a soft jsonb
reference - every world has exactly one mentor regardless of either row's status, so deleting a
mentor needed the same "block while it still has children" check `worlds/service.ts`'s own
`deleteWorld` already uses for lessons, just from the other side of the relationship. Flagged this
before touching `worlds/repo.ts` (a different domain); founder confirmed.

**Files changed:**
- `src/server/worlds/repo.ts` (+tests) — new `listWorldsByMentorId` (any status, unlike the existing published-only version)
- `src/server/mentors/repo.ts`, `service.ts` (+tests) — new `deleteMentor`/`deleteMentorRow`, draft-only + checks `listWorldsByMentorId` first
- `src/app/admin/(dashboard)/mentors/actions.ts` (+tests) — new `deleteMentorAction` (requires `mentor.publish`)
- `src/app/admin/(dashboard)/mentors/page.tsx` (+tests) — table-only list, "+ New mentor" moved to header
- `src/app/admin/(dashboard)/mentors/mentors-table.tsx` (+tests) — Actions column (Status stays a link-chip row)
- `src/app/admin/(dashboard)/mentors/mentor-editor.tsx` — removed inline-form wrapper, exported `NewMentorForm`/`MentorForm`, SectionCard icons
- `src/app/admin/(dashboard)/mentors/mentor-view.tsx` (new)
- `src/app/admin/(dashboard)/mentors/[id]/page.tsx`, `[id]/edit/page.tsx`, `new/page.tsx` (new, +tests)

**Verified:** `pnpm typecheck`/`lint` clean (same pre-existing baseline), full `pnpm test` - 290
files / 3006 tests passing, `pnpm build` clean (all 4 new routes show up as dynamic, same as every
other admin page).

**Status:** done, not yet committed - waiting for your browser check and "push".

## 2026-11-19 to 2026-11-23 — Staff/Roles permissions rework: HR fields, admin Roles page, full resource.op permission scheme

**Asked:** In `/admin/staff`, add a staff roles table admins can create roles from, HR columns
(gender, email, contact no, address, photo) visible/editable in the Staff table, and a full
view/create/edit/delete permission matrix per admin section, assignable to a role and then to a
user. Update related docs. Confirmed up front via a plan + questions: full view/create/edit/delete
rework (not the smaller "keep 28 keys + add assignment UI" option), self-service + `staff.edit`
admin both allowed to edit profile fields, email stored (denormalized Clerk-invite copy, not
fetched live).

**What this actually meant, once scoped:** replacing the old 28 coarse `resource.manage`/
`resource.publish`-style keys with a uniform `resource.op` scheme (~60 keys, 20 resources) across
**every** admin domain - not just Staff - since "view" had never been its own permission before
(implicitly granted by holding either old key for that domain). `resource.delete` for the six
two-tier content domains (world/lesson/question/mentor/news/coach_note) is deliberately the exact
old `.publish` trust bundle, not row deletion, so no role's real access changed, only the names -
see `docs/ARCHITECTURE.md` D81 for the full reasoning, including a self-caught correction (folding
publish into `edit` would have widened `content_uploader`-style roles' access).

**Files changed (by domain, same shape each time: `actions.ts`/`page.tsx`/component props renamed
`canManage`/`canPublish` → `canCreate`/`canEdit`/`canDelete`, explicit `resource.view` page gate
added where it was previously implicit, `+tests`):** worlds, lessons, questions, mentors, news,
coach-notes, badges, rewards, competitions, instruments, legal, settings, ops, consent, doubt-zone
— plus:
- `src/db/schema/staff.ts` (+migration `0058_nosy_kingpin.sql`, applied) — `staff_members` gains
  `email`, `gender` (new `staff_gender` enum), `phone`, `address`, `photo_key`, all nullable
- `src/server/staff/schemas.ts`, `repo.ts`, `service.ts` (+tests) — `updateStaffProfile`,
  `uploadStaffPhoto` (self-or-`staff.edit`), role CRUD (`createRole`/`updateRole`/`deleteRole`,
  blocked while staff still hold it), `setRolePermissions` (full-replace, with the same
  admin-lockout guard `setStaffMemberActive`/`changeStaffMemberRole` already had - now also
  checked when editing a role's permissions directly), `getRolesPageData`
- `src/app/admin/(dashboard)/staff/actions.ts`, `page.tsx`, `staff-table.tsx` (+
  `staff-profile-panel.tsx`, new) — email column, self-or-permission "Profile" panel
  (gender/phone/address/photo, inline below the table) alongside the existing role-Select/
  activate-deactivate controls, all three now `staff.edit`/`staff.delete`-gated
- `src/app/admin/(dashboard)/roles/page.tsx`, `roles-editor.tsx` (new) — list/create/edit/delete
  roles, permission matrix (plain checkboxes, no new UI dependency added)
- `src/components/admin/admin-nav.tsx`, `src/lib/admin/nav-visibility.ts` — new "Roles" nav item,
  every `AdminNavVisibility` flag now checks the resource's own `.view` key directly
- `scripts/seed-roles.ts` — rewritten for the new 60-key scheme; old keys/grants deliberately left
  in place (cleanup tracked in `docs/ROADMAP.md`, after this reaches `main`)
- `src/app/api/webhooks/clerk-staff/route.ts` — extracts the invite's verified email from the
  `user.created` payload, passed through to `completeStaffInviteFromClerkEvent`
- Docs: `docs/ARCHITECTURE.md` (D81), `docs/DATA_MODEL.md`, `docs/PRODUCT_SPEC.md`,
  `docs/ROADMAP.md` (cleanup follow-up) — all updated; `pnpm contract` re-run (two Doubt Zone
  endpoint descriptions referenced the renamed `doubt_zone.moderate` key in their text)

**Security-auditor pass (run before considering this done, per CLAUDE.md's standing rule for
anything touching permissions):** no Critical/High findings, no authorization hole, no IDOR, and
the old→new `ROLE_PERMISSIONS` mapping verified to widen nobody's access. Two real findings, both
fixed:
- **Medium** - the admin-lockout guard (blocks deactivating/demoting the last staff member who can
  administer staff) read-then-wrote with no lock, so two concurrent privileged actions each
  targeting a different staff member/role could both read "still enough active holders" before
  either write committed, leaving zero. Fixed with a transaction-scoped Postgres advisory lock
  (`withPermissionLocks`, `src/server/staff/repo.ts`) wrapping the check-and-write in
  `setStaffMemberActive`/`changeStaffMemberRole`/`setRolePermissions` - every repo call inside now
  takes an optional `txDb` so the whole sequence runs inside one transaction. New integration tests
  in `repo.test.ts` cover the lock/transaction mechanics (PGlite is single-connection, so a true
  concurrent-race test isn't possible there - the mechanism itself is standard Postgres).
- **Low** - the same guard didn't cover `roles.edit`/`roles.create`/`roles.delete` (only
  `staff.edit`/`staff.delete`). Fixed by adding them to the same guarded `STAFF_ADMIN_PERMISSIONS`
  list.
- **Low, not fixed (pre-existing pattern, not a regression)** - `uploadStaffPhoto` buffers the
  whole file into memory before checking the 2MB cap, same as the existing mentor/world art
  upload paths. Noted, not addressed now.

**Verified (after the fix):** `pnpm typecheck`/`lint` clean, full `pnpm test` - 291 files / 3049
tests passing (test-count floor check OK), `pnpm build` clean (`/admin/roles` shows up as a new
dynamic route).

**Status:** done, not yet committed - waiting for your browser check and "push".

## 2026-11-19 — News Desk: scope clarified first - View page only, no edit/delete (neither existed, neither fits)

**Asked:** Do the same for `/admin/news`. Flagged before starting that News Desk doesn't have the
same shape as Worlds/Lessons/Questions/Mentors: the pipeline table already edits inline via
dropdown Selects (status/topic/quality-grade override) - the thing Lessons/Questions asked to
convert *to*. Clicking a headline just expanded a placeholder row saying a real content editor is
a deliberate future follow-up, not built yet. There's no create flow (stories come from an
ingestion job) and no delete (and delete would be murkier here anyway - a story has real Pulse
Check quiz data tied to it). Founder's call: just replace the row-expand placeholder with a real
read-only View page showing the story's full drafted content (headline/summary/body/jargon in all
3 languages, impact, source link, quality grade + override, featured flag, publish info) - no edit
form, no delete, inline Selects keep working exactly as before.

**Files changed:**
- `src/server/news/admin-queries.ts` — new `getStoryDetailForAdmin` (thin re-export of the existing, unmodified `repo.ts` `getStoryById`, same shape as Questions' own `getQuestionDetailForAdmin`)
- `src/app/admin/(dashboard)/news/pipeline-table.tsx` — removed the click-to-expand placeholder row, added a View icon per row
- `src/app/admin/(dashboard)/news/news-view.tsx` (new), `[id]/page.tsx` (new, +tests)

**Verified:** `pnpm typecheck`/`lint` clean (same pre-existing baseline), full `pnpm test` - 291
files / 3010 tests passing, `pnpm build` clean (the new route shows up as dynamic, same as every
other admin page).

**Status:** done, not yet committed - waiting for your browser check and "push".

## 2026-11-24 — Admin glassmorphism redesign, Phase 1: shell (sidebar/top bar) + responsive nav

**Asked:** Redesign the admin UI with a modern glassmorphism style (Finlamma's own palette only),
fully responsive. Phase 1 scope: the admin shell (sidebar + top bar + page background) and the
`/admin` landing/Analytics dashboard, using the `frontend-design` skill. Page content itself
(worlds/lessons/analytics/etc.) already got a liquid-glass treatment in an earlier session - this
phase extends the same system to the shell, which was deliberately left untouched before, and adds
real responsiveness (icon-only rail collapse on desktop, a slide-in drawer below `lg`) that didn't
exist before either. One new package approved: `@radix-ui/react-dialog` (same Radix family as the
existing `react-alert-dialog`), used to build a small shadcn-style `Sheet` for the drawer so its
focus trap/Esc/overlay/scroll-lock didn't need hand-rolling.

**Files changed:**
- `src/app/globals.css` — additive only: new `.admin-glass-panel`/`.admin-glass-panel-subtle`/
  `.admin-glass-chrome` classes (same recipe already live via `glass.tsx`, now real CSS classes
  so they can carry `prefers-reduced-transparency`/no-`backdrop-filter`-support fallbacks, which
  Tailwind v4 has no built-in variant for) - no existing token or rule touched.
- `src/components/admin/glass.tsx` — `GLASS_PANEL`/`GLASS_PANEL_SUBTLE` now point at the new CSS
  classes instead of inline Tailwind utility strings (every already-converted admin page picks up
  the fallbacks automatically, no per-page change); added `GLASS_CHROME`/`glassChrome()` for the
  shell.
- `src/components/admin/sheet.tsx` (new) — shadcn-style Sheet on `@radix-ui/react-dialog`,
  admin-scoped (not `src/components/ui/`); hand-written slide/fade transitions keyed off Radix's
  `data-state` (no `tailwindcss-animate` plugin is installed).
- `src/components/admin/mobile-nav-drawer.tsx` (new) — the nav drawer (hamburger trigger + Sheet),
  closes on navigation via React's render-time "reset state on prop change" pattern (not a
  `useEffect`, to avoid the same cascading-render lint rule `admin-nav.tsx`'s own comments
  reference) - this was caught and fixed after a first attempt tripped that exact rule.
- `src/components/admin/admin-nav.tsx` — desktop icon-only rail collapse, own localStorage key
  (`finlamma-admin-nav-rail-collapsed`), same hydration-safe `useSyncExternalStore` pattern as the
  existing per-group collapse (fixed server snapshot, cached client snapshot); CSS-only
  hover/focus tooltips on rail items (no tooltip primitive existed, none was approved to add);
  `AdminNavStrip` (the old horizontal mobile strip) removed, replaced by the drawer reusing
  `AdminSidebar` itself (`allowRailCollapse={false}` there, so the drawer always shows full labels
  regardless of the desktop rail preference, and the active item's group is always force-expanded
  the same way it already was on desktop).
- `src/app/admin/(dashboard)/layout.tsx` — sidebar/top bar now `GLASS_CHROME`; header + the
  trading-halt banner wrapped in one `sticky top-0 z-30` unit (so their combined height is always
  what content scrolls under, no hardcoded offset to keep in sync); hamburger button
  (`aria-label="Open navigation menu"`) wired to the new drawer; admin-wide Inter font class now
  applied at the shell root too (previously only inside each page's own content wrapper).
- `package.json`/`pnpm-lock.yaml` — added `@radix-ui/react-dialog` (approved).

**Not touched:** `src/components/ui/*` (shared with the parent-facing `/consent/*` pages and the
homepage - confirmed by grep before starting, zero files there in the diff), nav visibility/
permission logic (purely visual), any existing `globals.css` rule or token.

**Verified:** `pnpm typecheck` clean; `pnpm lint` at the same pre-existing baseline (1 unrelated
error, 14 warnings) - one new error did appear mid-way (`set-state-in-effect` on the drawer's
close-on-navigate logic) and was fixed before finishing, not left for later; `pnpm vitest run`
scoped to `src/app/admin/(dashboard)` + `src/components/admin` (51 files / 364 tests) and the full
suite (291 files / 3049 tests, `check-test-count` floor OK); `pnpm build` clean.

**Status:** done, not yet committed - waiting for your browser check.

## 2026-11-24 — Admin glassmorphism redesign, Phase 2a: tables, page header, empty/skeleton states

**Asked:** Continue straight through Phase 2 without stopping for a browser check between groups
(changed from the earlier per-group-approval plan). Group a: `data-table.tsx`, `page-header.tsx`,
`empty-state.tsx`, `page-error.tsx`, `page-skeleton.tsx`.

**Files changed:**
- `src/components/admin/data-table.tsx` — pager Prev/Next and sort-header links get bigger tap
  targets (`px-2 py-1` → `px-3 py-2`-equivalent padding); pager row and search form wrap on narrow
  screens; search input goes full-width below `sm`. The "horizontal scroll for wide tables on
  mobile" ask turned out to already be satisfied by `src/components/ui/table.tsx`'s own
  `overflow-x-auto` wrapper - confirmed by reading it, no change needed/made there.
- `src/components/admin/page-header.tsx` — icon chip now uses the shared `GlassIconChip`.
- `src/components/admin/glass.tsx` — `GlassIconChip` gets an optional `iconClassName` prop
  (defaults to the existing `h-4 w-4`) so `page-header`'s noticeably bigger chip (`h-10 w-10`) can
  keep its original `h-5 w-5` icon proportions instead of looking undersized.
- `src/components/admin/empty-state.tsx` — icon circle: `bg-muted` → `bg-secondary` (existing
  light-violet token), matching the icon-chip language used everywhere else now.
- `src/components/admin/page-skeleton.tsx` — `PageSkeleton`/`AdminListSkeleton` now wrap
  themselves in `AdminGlassBackground` + `glassPanel(...)`, so every per-route `loading.tsx` (each
  just `return <PageSkeleton />`/`<AdminListSkeleton />`, none of them touched) automatically shows
  the glass backdrop instead of a flash of the old flat background before the real page mounts.
- `src/components/admin/page-error.tsx` — **not touched**. Its destructive icon color is semantic
  (an error state), same "don't glassify a color that's carrying meaning" rule as every other
  status/warning box - and it's a full-page centered message, not a card, so there was no panel to
  convert either.

**Verified:** `pnpm typecheck` clean; `pnpm lint` at the pre-existing baseline (1 error, 14
warnings); `pnpm vitest run` scoped to `src/app/admin/(dashboard)` + `src/components/admin` - all
passing.

**Status:** committed locally (`8326ca0`), not pushed.

## 2026-11-24 — Admin glassmorphism redesign, Phase 2b: dialogs, drawer, toasts

**Asked:** Group b: `confirm-dialog.tsx`, `confirm-changes-dialog.tsx`, Sheet/drawer styling
consistency, `<Toaster>` theming.

**Files changed:**
- `src/components/admin/confirm-dialog.tsx`, `confirm-changes-dialog.tsx` — their shared
  `AlertDialogContent` (from `src/components/ui/alert-dialog.tsx`, untouched) now gets
  `className={GLASS_PANEL}`. The overlay already dims the backdrop ~40%, same reasoning as why the
  standard content-panel translucency (not the chrome level) is right here too.
- `src/components/admin/mobile-nav-drawer.tsx` — hamburger trigger was missing a focus-visible
  ring; added, matching every other interactive control's style.
- `src/components/admin/admin-nav.tsx` — same fix for the nav links, the per-group collapse
  button, and the rail-collapse button - all three had no focus ring before this pass (pre-existing
  gaps, not something Phase 1 introduced, fixed now while already touching this file for the
  "visible focus rings everywhere" design rule).
- `src/app/admin/(dashboard)/layout.tsx` — `<Toaster>` gets `toastOptions.classNames.toast` with
  shape only (`rounded-xl border border-white/40 shadow-lg backdrop-blur-xl`) - deliberately never
  touching `richColors`' own success/error/warning background colors, which stay exactly as they
  are (semantic, same rule as every status badge).

**Verified:** `pnpm typecheck` clean; `pnpm lint` at the pre-existing baseline; `pnpm vitest run`
scoped to `src/app/admin/(dashboard)` + `src/components/admin` - all passing.

**Status:** committed locally (`4ffe610`), not pushed.

## 2026-11-24 — Admin glassmorphism redesign, Phase 2c: form grids, status badges

**Asked:** Group c: `status-badge.tsx` (stays flat/opaque, as planned), SectionCard/form layouts,
sticky action bars.

**Findings and files changed:**
- `src/components/admin/status-badge.tsx` — **not touched**, as planned: its draft/published/
  warning/destructive colors are semantic, same "never glassify a color that's carrying meaning"
  rule as every other status/warning box this redesign has left alone throughout.
- SectionCard's own shape was already glass (the earlier site-wide rollout) - what was actually
  missing was mobile responsiveness. Found 24 bare `grid-cols-2`/`grid-cols-3` form grids with no
  responsive fallback, across 15 files: `worlds/world-editor.tsx` (×2), `lessons/lesson-editor.tsx`
  (×2), `questions/question-editor.tsx` (×3), `mentors/mentor-editor.tsx` (×2),
  `badges/badge-editor.tsx`, `rewards/reward-editor.tsx`, `competitions/competitions-editor.tsx`
  (×2), `instruments/instrument-editor.tsx` (×2), `roles/roles-editor.tsx` (×2),
  `staff/staff-profile-panel.tsx`, `consent/dob-correction-form.tsx`,
  `news/quiz-generator-settings-editor.tsx` (×2), `news/pulse-check-scoring-editor.tsx`,
  `settings/scoring-settings-editor.tsx`, `settings/arena-league-settings-editor.tsx` - these would
  squeeze a 2-3 column field grid into a 390px phone, unlike their already-responsive siblings
  (e.g. every "Basics" section already does `grid-cols-1 sm:grid-cols-3`). All given the same
  `grid-cols-1 sm:grid-cols-N` treatment.
- Sticky action bars (10 occurrences across 5 editor files) checked, left unchanged - they sit
  inside `<main>`'s own padding, not flush to the viewport edge, so the rounded `GLASS_PANEL_SUBTLE`
  corners already read fine at any width; no fix needed.

**Verified:** `pnpm typecheck` clean; `pnpm lint` at the pre-existing baseline; `pnpm vitest run`
scoped to `src/app/admin/(dashboard)` + `src/components/admin` - all passing.

**Status:** committed locally (`67a5fe9`), not pushed.

## 2026-11-24 — Admin glassmorphism redesign, Phase 2d: final consistency pass

**Asked:** A final consistency pass across every admin page at 390/768/1280: spacing, overlaps,
readable text, no layout breaks.

**Approach:** No way to actually render a browser here, so this was a bounded static-analysis
pass (grepping for non-wrapping flex rows, raw dialog usages, fixed-width elements) rather than a
literal pixel check - the founder's own browser check still covers what this can't.

**Found and fixed:**
- 9 raw `<AlertDialogContent>` usages across 7 files (`ops/feed-halt-control.tsx` ×2,
  `ops/risk-thresholds-editor.tsx`, `ops/symbol-master-table.tsx`,
  `settings/rank-titles-editor.tsx`, `settings/peer-handles-editor.tsx`,
  `settings/about-me-chips-editor.tsx`, `settings/economy-settings-editor.tsx` ×2) built their own
  dialog directly instead of going through the shared `ConfirmDialog`/`ConfirmChangesDialog`, so
  they missed group 2b's glass treatment entirely. All given `className={GLASS_PANEL}` too.
- `feed-halt-control.tsx` had two non-wrapping flex rows (the 3-button feed-mode switcher, and the
  halt-toggle's label+button row) that could get tight at 390px - both now `flex-wrap`.

**Checked, already fine:** `KpiTileGrid` (already `sm:grid-cols-2 lg:grid-cols-4`), every filter
bar, the two "Audit log" heading rows (news/ops), the 10 sticky save bars (sit inside `<main>`'s
own padding, not flush to the edge), Select-heavy filter rows (already `flex-wrap`).

**Verified:** `pnpm typecheck` clean; `pnpm lint` at the pre-existing baseline; `pnpm vitest run`
scoped to `src/app/admin/(dashboard)` + `src/components/admin` - all passing.

**Status:** committed locally (`cdf8f16`), not pushed.
