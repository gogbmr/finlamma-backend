---
name: admin-page
description: Build a staff admin dashboard page (tables, forms, consoles) with shadcn/ui, permission gating and audit logging. Use for anything under src/app/admin.
paths: "src/app/admin/**"
---

0. Check the prototype for this console/page design (Ops console is in the Trade screen code,
   News Desk in the News screen code) at `D:\nextjs_projects\finlamma final project\ui_file\Finlamma_UI`.
   Read only; search with Grep and read small ranges.
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
