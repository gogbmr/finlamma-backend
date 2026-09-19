---
name: admin-page
description: Build a staff admin dashboard page (tables, forms, consoles) with shadcn/ui, permission gating and audit logging. Use for anything under src/app/admin.
paths: "src/app/admin/**"
---

0. Check `docs/PROTOTYPE_INDEX.md` and `docs/FEATURE_MAP.md` first — the prototype has already been
   fully mapped screen by screen, with exact file/line ranges and a feature row per control, so you
   usually don't need to re-search the prototype from scratch.
   - **If the page you're building is one the prototype actually contains** (currently: the Ops
     console, inside the Trade screen's markup+logic per PROTOTYPE_INDEX.md; the News Desk console,
     inside the News screen) — **match its design**: layout, KPI tiles, table shapes, control
     types (sliders, toggles, chip pickers), copy tone. Read the exact line ranges
     PROTOTYPE_INDEX.md gives you at
     `D:\nextjs_projects\finlamma final project\ui_file\Finlamma_UI\Finlamma App.dc.html`
     (read-only, never edit it) to see the real markup before building.
   - **If the page isn't one the prototype contains** (e.g. Staff management — already built in
     Phase 1 — Content editor, Mentor editor, Competition manager, Badge/Reward catalog manager,
     News/Trade instrument editors, Legal document editor, Consent review, Coach-note template
     editor, or anything else FEATURE_MAP.md lists an "Admin page" for that isn't Ops console or
     News Desk) — there's no prototype screen to copy. **Use the same visual style** as the pages
     that do exist (the already-built admin shell/staff management page, and Ops
     console/News Desk once built): same shadcn/ui theme, same page layout convention (title,
     filters bar, table/content, side sheet), same dark-first aesthetic as the rest of the admin
     dashboard — not the consumer app's phone-frame prototype look, which is a different product
     surface.
   - Check `docs/FEATURE_MAP.md` for the exact rows this admin page needs to cover (filter by the
     "Admin page" column) so nothing gets missed.
1. Page lives under `src/app/admin/<area>/page.tsx` as a Server Component; interactive parts are
   small Client Components.
2. Gate access on the server: `await requireStaff("<area>.view")` at the top of the page and
   the specific permission in every server action / API route it calls. Hide buttons the staff
   member lacks permission for, but never rely on hiding alone.
3. UI: shadcn/ui components, TanStack Table for lists (server-side pagination, sorting,
   filters in URL search params), react-hook-form + Zod for forms, Recharts for charts.
   Keep a consistent layout: page title, filters bar, table/content, side sheet for details.
4. Every mutation → service function → `logActivity()` with the staff actor.
5. Destructive actions need a confirmation dialog that names what will happen.
6. Show loading and empty states; toast success and error messages in plain English.
7. Add a Playwright test for the main flow when the page has mutations.
