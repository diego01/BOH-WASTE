# BOH Waste

Mobile-first web app (PWA) to log, control and analyze back-of-house waste and donations, with dayparts, monthly allowance and role-based access.

**Status:** Phases 1–5 done. Phase 1: data model, PIN sign-in & profiles, Excel import with preview, Settings → Products / Areas / Categories / Users. Phase 2: logging screen, offline queue, auto/manual daypart, history with edit/void, shared-phone auto sign-out. Phase 3: Settings → Allowance (individual & group, monthly $, carry-forward), Schedule, Operating days & holidays, Reasons. Phase 4: Reports (real vs allowance, day by day, MTD/pace/projection, dayparts, reasons, CSV/Excel export). Phase 5: installable PWA that opens offline, audit log screen, security headers, indexes, production build.

## Run locally

Requirements: Node 24+. No database install needed — local dev uses an embedded Postgres (PGlite).

```bash
cd waste-app
npm install
cp .env.example .env.local        # set SESSION_SECRET; optionally PGLITE_DIR
npm run setup                     # migrations + base config + demo users + catalog from ../referencias/inventory.xlsx
npm run dev                       # http://localhost:3000
```

Demo users and their test PINs are listed in `.env.example` (local only).

> **Local DB notes**
> - PGlite is single-process: stop `npm run dev` before running any `npm run db:*` script.
> - The project lives in OneDrive. Point `PGLITE_DIR` outside OneDrive (e.g. `C:/Users/<you>/AppData/Local/boh-waste/pglite`) so sync never touches database files.
> - If you see "PGlite failed to initialize", run `npm run db:reset` then `npm run setup`.

### Local test environment (demo data, separate database)

Try changes here before pushing to GitHub (which redeploys Vercel):

```bash
npm run test-env:setup   # (re)creates the TEST database: demo users, catalog, allowances, ~300 entries
npm run test-env         # http://localhost:3001
```

It never touches the real local database or Supabase. Demo PINs are in `.env.example`.

### Real start (no demo data)

```bash
npm run db:reset
npm run db:seed -- --import   # base config + products and users from ../referencias/inventory.xlsx
```

Users sign in with the PIN from the Excel and must choose their own at first sign-in.

### Alternative: bootstrap admin only

```bash
npm run db:seed    # base config; creates BOOTSTRAP_ADMIN_NAME / BOOTSTRAP_ADMIN_PIN if there is no admin
```

Sign in as that admin → Settings → **Import** → upload `inventory.xlsx` → review the summary → Import. The `users` sheet creates users with temporary PINs; each person sets their own PIN at first sign-in.

### Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Unit + integration tests (Vitest, in-memory DB) |
| `npm run db:generate` | New SQL migration from `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Migrations + idempotent base config + bootstrap admin |
| `npm run setup` | `db:seed --demo`: also demo users, the Excel catalog, Sep–Oct 2026 allowances and ~300 demo entries (incl. the Filet test case) |
| `npm run db:reset` | Delete the local PGlite data dir |

## Production

Local production build (what the server runs):

```bash
npm run build
npm run start      # http://localhost:3000 — the service worker only runs in production builds
```

### Deploy (Vercel + Supabase)

1. **Supabase** → new project → Project Settings → Database → copy the connection string (use the *pooler* URI, port 6543, for serverless).
2. Locally, with that URL: `DATABASE_URL=… npm run db:migrate` then `DATABASE_URL=… BOOTSTRAP_ADMIN_NAME=… BOOTSTRAP_ADMIN_PIN=… npm run db:seed`.
3. **Vercel** → import the repository, root directory `waste-app`, framework Next.js. Environment variables: `DATABASE_URL`, `SESSION_SECRET` (32+ random chars). Deploy.
4. Sign in with the bootstrap admin → Settings → Import → upload `inventory.xlsx` (creates products and users) → set allowances.
5. Future schema changes: `npm run db:generate`, commit the new `drizzle/` file, run `npm run db:migrate` against production before deploying.

### Install on iPhone

Open the site in **Safari** → Share → **Add to Home Screen**. It opens full screen on the logging screen. After it has been opened once with a connection, it opens and logs entries with no connection; entries sync when the connection returns.

## Offline & privacy on shared phones

- `public/sw.js` caches build assets and the logging screens (`/log`, `/log/history`) only; reports, settings and APIs are never cached.
- Cached screens belong to the signed-in person; the sign-in screen clears them, so the next person can't see them offline.
- Unsynced entries stay on the phone (IndexedDB) and sync to their author even after a sign-out (signed entry tokens, 7 days).
- Security headers: `nosniff`, `X-Frame-Options: DENY`, strict referrer; PINs are bcrypt-hashed and never logged; CSV exports are protected against formula injection.

## Stack

Next.js 16 (App Router, server actions) · TypeScript · Tailwind 4 · Drizzle ORM · Postgres (PGlite locally) · jose (signed session cookie) · bcryptjs (PIN hashes) · exceljs · zod · Vitest.

## Folder structure

```
waste-app/
  drizzle/                 SQL migrations
  scripts/db.ts            migrate / seed / reset CLI
  src/
    proxy.ts               optimistic route guard (cookie only)
    db/
      schema.ts            data model
      index.ts             DB client (Postgres or PGlite, lazy)
      seed.ts              base config, bootstrap admin, demo users
    lib/
      auth/permissions.ts  permission matrix (single source of truth)
      auth/session.ts      session cookie + DB-backed current user, requireCap()
      auth/token.ts        JWT sign/verify (no DB, usable in proxy)
      import/inventory.ts  pure Excel parser
      import/apply.ts      preview diff + transactional import
      import/categorySuggest.ts
      dayparts.ts          daypart + business date from device time (pure, shared)
      allowance.ts         proration: operating days, daily / range allowance, signed difference (pure)
      allowanceData.ts     month setup (copy previous month), frozen calendar
      reports.ts           report engine (pure): real, allowance comparison, day by day, MTD
      reportData.ts        SQL aggregation + params; reportExport.ts CSV / Excel
      entries/             payload schema, rules (edit window, backdate), ingest
      offline/queue.ts     IndexedDB outbox on the device
      domain.ts            labels, units, dayparts, PIN rules
      actionResult.ts      server action wrapper (auth + error mapping)
      settingsData.ts      settings queries
    components/            bottom sheet, toggle, multi-select, PIN pad, nav, icons
    app/
      login/  change-pin/
      (app)/log            logging screen, history (edit/void) + actions.ts
      api/entries          sync endpoint for the device queue
      (app)/reports        reports + charts
      api/reports/export   CSV / Excel download (reports:view)
      (app)/settings/      products, areas, categories, users, import + actions.ts
      (app)/account
      (app)/settings/audit audit log viewer
  tests/                   parser, permissions, DB import
```

## Data model

| Table | Purpose |
|---|---|
| `store` | Single store: name, timezone (default America/New_York), idle auto-logout minutes |
| `users` | name, role (ADMIN / TEAM_LEADER / TEAM_MEMBER), PIN hash, active, must-change-PIN, lockout counters |
| `areas` | Waste areas with color (BOH today) |
| `categories` | Filter labels (Filets, Nuggets, …) |
| `products` | area, name, code, unit (LB / EACH / OZ / BAG_50OZ), unit cost, **type (WASTE / DONATION)**, **available dayparts[]**, `parte_del_dia_original`, active, archived_at |
| `product_categories` | many-to-many |
| `reasons` | Expired, Contaminated, Floor, Order Accuracy, Overcooked, Quality (editable) |
| `dayparts` | start/end per daypart, local store time |
| `dinner_close` | Dinner close time per weekday (default 22:00 Mon–Wed, 23:30 Thu–Sat) |
| `operating_weekdays`, `holidays` | Operating days for allowance proration (default Mon–Sat) |
| `waste_entries` | Device-generated UUID; snapshots of **type, unit, unit cost**; quantity, total, reason, note, daypart + `daypart_manual`, business date + `date_manual`, real `occurred_at`, user, void fields |
| `allowances`, `allowance_products` | Monthly $ allowance per month, individual or group; `UNIQUE(product_id, month)` so a product counts once per month |
| `allowance_months` | A month whose allowance is set up; freezes the open weekdays used to prorate it |
| `audit_log` | Who changed what, before/after |

Single-store for now; adding `store_id` later is a straightforward migration because all store-level settings already live in one row.

## Permissions

Enforced in three layers: proxy (redirects by route), every page (`requirePageUser`), and every server action (`requireCap`). Hiding a button is never the only check.

| Capability | Admin | Team Leader | Team Member |
|---|:-:|:-:|:-:|
| Log waste / donation | ✓ | ✓ | ✓ |
| Change an entry's daypart | ✓ | ✓ | ✓ |
| View & export reports | ✓ | ✓ | — |
| View Settings | ✓ | — | — |
| Edit Settings (products, type, dayparts, cost, areas, categories, allowance, schedule, operating days) | ✓ | — | — |
| Manage users and profiles | ✓ | — | — |

Rules: there is always at least one active Admin (the last one can't be deactivated or demoted). Admin PINs are 6–8 digits, others 4–6. Five wrong PINs lock the user for 5 minutes (an Admin can unlock). Deactivating a user ends their access on the next request.

## Logging & sync

- Every entry is saved on the phone first (IndexedDB outbox) and synced to `POST /api/entries`; totals include unsynced entries. Sync retries on reconnect, on returning to the app and every 15 s.
- The entry id is generated on the device, so resending is idempotent.
- The daypart and business date are computed from the **device time of the entry**, and the server recomputes them from that time (never the sync time). Before opening → Breakfast; after closing → Dinner.
- Each queued entry carries a signed entry token (7 days), so entries made before a shared-phone sign-out still sync to their author.
- The daypart/date selector in the sheet is collapsed by default. Changing it sets `daypart_manual` / `date_manual`, shown as badges in History. Back-dating: Team Member up to yesterday, Team Leader / Admin up to 7 days.
- Products outside their available dayparts are hidden by default ("Show all" reveals them) and never blocked; the sheet shows a discreet notice.
- **Remove** (in the same sheet): takes back quantity logged by mistake. It's stored as negative rows linked to the entries it reduces (newest first), copying their daypart, date, type and unit cost, so every total nets out; it can never go below zero. Team Members remove only from their own entries of today; Team Leader / Admin from anyone's, up to 7 days back.
- Edit / void from History: the author within 15 minutes; Team Leader and Admin any entry. Voids are soft and audited; voiding an entry also voids removals made against it, and undoing a removal voids it.
- **Header total = one daypart** (what goes on the whiteboard). After a daypart ends, the header keeps showing it for `store.board_grace_minutes` (default 60), with a small "Now logging" line for the new daypart. Cards follow the same daypart. Display only; entries are still assigned by real time.
- Shared phones: sign-out after 2 minutes idle (15 s warning), plus a "Sign out" shortcut after each entry.
- Page loads still need a connection until the service worker lands in Phase 5; an open screen keeps working offline.

## Allowance

- Defined in dollars per month, per product (individual) or per group of products sharing one amount (waste and donation can mix). A product belongs to at most one allowance per month (DB constraint + friendly check that offers to move it).
- Each month is its own set of rows, so changing October never touches September. Opening the current or next month for the first time copies the latest earlier month; past months are never auto-filled.
- **Proration:** daily = monthly ÷ operating days of that month; a period = Σ daily allowance of its operating days; ranges across months use each month's values. Non-operating days get no allowance but their entries count as real. Full precision; round only on display. Validated by the required Filet case (Oct 2026, $200 → 27 days, $7.4074/day, Oct 1–7 = $44.44; real $50 → −$5.56, real $40 → +$4.44) in `tests/allowance.test.ts`.
- Operating days: open weekdays (default Mon–Sat) + closed holidays. Changing weekdays re-freezes only the current and future months; past months keep the weekdays they were prorated with.
- Equivalent quantity (info only) = allowance ÷ current unit cost; for groups shown as a range when all products share a unit, per product otherwise.

## Reports

- Period: a day or a range, with shortcuts (today, yesterday, last 7 days, this week, this month). Default: this month to date. Filters: type (All / Waste / Donation), daypart, area (when there are several).
- Real by product (qty + $, optional split by daypart), category, area, reason, daypart; Waste and Donation totals side by side; daily chart.
- **Real vs allowance**, two views. *Product*: one row per product with its own allowance (groups are left out so items aren't mixed); totals show **Total over** (sum of overages only) and **Total available** (sum of what's left only) so one product's savings never hide another's overage, plus a filter All / Over / Within and a *Without allowance* list (real only). *Area*: everything logged per area with its over/available and real without allowance. Previously: one row per allowance (product or group). Real = all its entries in the period (waste and donation, all dayparts — the allowance isn't split by them), allowance prorated to the period, **Difference = allowance − real**: green with "+" when ≥ 0, red with "−" when negative. Totals overall and by area / category. Sorted most-over first. Tap a row for day by day with daily and cumulative difference.
- **Month to date** (this month): used vs month allowance, remaining, pace vs allowance prorated to today, projected month end = real ÷ operating days elapsed × operating days in month, with an alert when it projects over; per-row projection warnings.
- Remove corrections net out everywhere and count against the reason of the entry they correct.
- Export: Excel (Summary, Real vs Allowance, Day by day, Products, Entries — signed, colored Difference) and CSV (comparison or entries). CSV text is protected against formula injection.

## Languages (English / Español)

- EN | ES switch on the sign-in screen and in Account. The choice is saved per person (applied when they sign in on a shared phone) and per device; first visit follows the phone's language.
- UI text lives inline as `t("English", "Español")` (`useT()` in client components, `getT()` on the server). Server errors travel as `"English||Español"` (`bi()`) and are shown in the reader's language (`pickMsg`).
- Daypart names (Breakfast, Lunch, Afternoon, Dinner) and profile names stay in English in both languages, as the team uses them. Data (product, category and reason names) is shown as entered.
- Excel/CSV exports use the language of whoever downloads them.

## Excel import rules

- The sheet with an `Item Name` column is the catalog; the sheet name is only a label. A sheet with `Name` / `PIN` columns is read as users.
- `Item Name` → name + code (split on the non-breaking space before `(code)`).
- `Tipo de waste`: `Donations` → Donation, `Waste` → Waste; anything else is flagged "no type" and must be chosen in the preview.
- `parte del día`: Breakfast → Breakfast; Lunch/Dinner → Lunch, Afternoon, Dinner; Todas → all four; Desert / Prep → all four, provisionally, and listed separately.
- `Medida`: Pound → lb, Each → each, Ounce → oz, 50 oz Bag → bag 50 oz. `Monto` = cost per unit, rounded to 2 decimals.
- Empty rows are ignored. Re-importing matches products by code (by name when there's no code), refreshes name/unit/cost/type, and never touches dayparts, area, active status or existing categories unless changed in the preview.
