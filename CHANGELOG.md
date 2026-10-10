# Changelog — Farm Command

All notable changes to Farm Command are documented here.

## Unreleased — Round 14 (Dedicated Poultry section + egg collection)

### Added
- **New "Poultry" section** separate from Livestock, with its own tab in the
  sidebar (desktop + the mobile "More" sheet; the 5-slot mobile bottom bar is
  unchanged). Lets you keep flocks of **Chickens, Ducks, Quail, Turkeys and
  Geese** apart from cattle/goats/etc.
- **Two new Prisma models** (`prisma/schema.prisma`): `PoultryFlock`
  (name, birdType, breed, count, the same optional role breakdown as groups,
  location, a light-touch `feedNote`, status, notes, photo) and `EggLog`
  (per-flock daily egg-collection entry: date, eggs, notes, with
  `onDelete: Cascade`). Purely additive — run `npm run db:push` to add the two
  tables; no existing data is touched.
- **Species-correct bird words.** New helpers in `src/lib/farm.ts`
  (`BIRD_TYPES`, `birdRoleWord`, `flockRoleSummary`, `BIRD_TYPE_EMOJI`) give the
  right role word per bird: Chickens cock/hen/chick/capon, Ducks
  drake/duck/duckling, Quail cock/hen/chick, Turkeys tom/hen/poult, Geese
  gander/goose/gosling. Singular/plural handled automatically.
- **Per-flock daily egg log.** The flock detail dialog shows eggs today, last 7
  days and all-time, has an inline "Log egg collection" form (date + count +
  optional note), lists recent entries, and lets you delete an entry. Flock
  CRUD + egg logs are fully offline-first (local-first writes, outbox, sync).
- **New UI** under `src/components/farm/poultry/`: `poultry-view.tsx` (flock
  cards + filters), `poultry-flock-form-dialog.tsx` (create/edit), and
  `poultry-flock-detail-dialog.tsx` (profile + egg log).

### Changed / wired
- Offline facade (`src/lib/offline/api.ts`): added `/api/poultry` CRUD plus
  `/api/poultry/{id}/eggs` (POST) and `/api/poultry/{id}/eggs/{logId}` (DELETE),
  with cascade delete of a flock's egg logs.
- Sync: new tables added to `SYNC_TABLES` (`src/lib/offline/sync.ts`), Dexie
  stores bumped to `version(2)` (`src/lib/offline/db.ts`), and `SYNC_SPECS`
  (`src/app/api/sync/table-specs.ts`) so flocks + egg logs replicate across
  devices automatically.
- Navigation/store: `poultry` view added to `FarmView`, `VIEW_TITLES`
  (`store.ts`) and `NAV_ITEMS` + render switch (`page.tsx`).

### Notes
- **Eggs are deliberately NOT in Reports or Finance yet** — this round is just
  the section + collection log, as agreed. A fuller feed log is also a later
  round (only the light `feedNote` is included now).
- NOT built or type-checked in this environment (no `node_modules`, Node 16).
  Run `npm run typecheck` / `npm run build` locally to verify.

## Unreleased — Round 13 (Simple group role breakdown)

### Added
- **Optional per-group role breakdown** on livestock groups: four new
  whole-number counts — breeding males (patriarchs), breeding females
  (matriarchs), young, and castrated — stored on each `LivestockGroup`
  (`prisma/schema.prisma`, all `Int @default(0)`). Existing groups keep working;
  the fields default to 0 and are purely additive (a `db:push` adds the columns
  with no data loss).
- **Species-correct wording.** A new helper in `src/lib/farm.ts`
  (`groupRoleSummary` / `groupRoleWord`) renders the counts with the right animal
  word per species, e.g. Sheep show "Patriarchs: 1 ram · Matriarchs: 4 ewes ·
  Young: 11 lambs", Cattle show bull/cow/calf/steer, Goats buck/doe/kid/wether,
  Pigs boar/sow/piglet/barrow, Poultry cock/hen/chick/capon, and Other falls back
  to male/female/young/castrated. Singular/plural is handled automatically.
- The group form (`group-form-dialog.tsx`) gained an optional "Breakdown" section
  with four number inputs (labels adapt to the chosen species) plus a live
  preview line. The breakdown is shown on the group card
  (`livestock-view.tsx`) and in the group detail dialog
  (`group-detail-dialog.tsx`). Only roles with a positive count are displayed.

### Notes
- The sync layer needed **no changes**: `src/app/api/sync/table-specs.ts`
  serializes/writes every scalar column generically, so the new fields sync
  across devices automatically.
- NOT built or type-checked in this environment (no `node_modules`, Node 16).
  Run `npm run typecheck` / `npm run build` locally to verify.

## Unreleased — Round 12 (PostgreSQL datasource for serverless / cloud hosting)

### Changed
- **Database provider switched from SQLite to PostgreSQL** (`prisma/schema.prisma`).
  A file-based SQLite database cannot run on serverless hosts such as Vercel
  (read-only, ephemeral function filesystem), which caused `POST /api/sync/push`
  to return 500 ("Sync push failed on the server") after deploying there. Moving
  to a networked Postgres (Neon / Vercel Postgres / self-hosted) makes server sync
  work in the cloud and across devices. The schema was already portable — no
  column-type changes were needed; all 50 indexes and the sync contract are
  unchanged.
- **`.env.example`** now documents a PostgreSQL `DATABASE_URL` (with the
  `sslmode=require` shape) and the guidance to use the same URL locally and on
  Vercel so every device shares one database.
- **README** database/deployment/environment sections updated for PostgreSQL.

### Added
- **`postinstall: prisma generate`** script so hosts that run a clean install
  (e.g. Vercel) generate the Prisma Client before building.
- **`.gitignore`** covering `node_modules/`, `.next/`, local `*.db` files, `.env`
  and logs, so a data file or secrets are never committed.

### Fixed (cross-platform)
- **Windows-safe npm scripts**: `dev`/`start` no longer use bash-only `tee`
  pipes; `start` runs the standalone server with `node` (not `bun`); the `build`
  post-step copies static/`public` assets via a cross-platform Node one-liner
  instead of Unix `cp -r`.

### Verification note
- Verified end-to-end on the user's machine earlier this round: `db:push`,
  `typecheck`, `build`, `start`, and the smoke suite (16/16) all passed on
  Windows with Node 20 against a local database. The PostgreSQL switch itself is
  a one-line provider change against a schema already validated as portable;
  run `npm run db:push` against your Postgres `DATABASE_URL` once, then
  `npm run build`, before deploying.

## Unreleased — Round 11 (production hardening pass)

### Added
- **Optional server access gate** — set `FARM_ACCESS_TOKEN` to require a one-time
  unlock before the sync server/API responds. Browsers unlock at `/unlock`
  (httpOnly cookie thereafter); programmatic callers send
  `Authorization: Bearer <token>`. Unset = gate off, behaviour unchanged. New
  `src/middleware.ts`, `src/app/unlock/page.tsx`, `src/app/api/unlock/route.ts`.
- **Per-IP rate limiting** (`src/lib/rate-limit.ts`) on the abusable endpoints:
  AI 20/min, sync-push 60/min, sync-pull 120/min, unlock 10/min (in-process).
- **Database indexes** — 50 `@@index` declarations added across the Prisma schema
  (foreign keys + the `updatedAt`/`deletedAt` columns the sync cursor scans), so
  pull queries and joins stay fast as data grows.
- **Server-side validation on `POST /api/sync/push`** — the change envelope is now
  validated with zod and applied inside chunked transactions; non-scalar record
  payloads are rejected before reaching the ORM.
- **`typecheck` and `test` npm scripts** plus app-level `error`, `global-error`,
  `not-found` and `loading` boundaries.

### Changed
- **Build is now strict** — `next.config.ts` no longer ignores TypeScript/ESLint
  errors during `build`, and React Strict Mode is on.
- **Dependency cleanup** — removed unused packages (`@dnd-kit/*`, `@mdxeditor/*`,
  `react-syntax-highlighter`, `next-intl`, `next-auth`) and three leftover shell
  test stubs.

### Verification note
- Changes were syntax-checked (esbuild transpile) and the manifest was validated,
  but a full `build` / smoke run was **not** performed in the packaging
  environment (Node 16, no bun). Run `bun install`, `bun run db:push`,
  `bun run typecheck`, `bun run build`, then `node tests/smoke.mjs` on Node 18+
  before deploying.

## Unreleased — Round 10 (standalone index.html launcher in the source zip)

### Added
- **`index.html` launcher page at the zip root** — extracting the source zip and
  double-clicking `index.html` now opens a self-contained, branded page (no
  internet or tooling needed): how to run the app step by step (`bun install`
  → `bun run dev`), a full feature overview, a "what's in this package" file
  map, and links to README / QA_AUDIT / CHANGELOG / .env.example. Carries the
  version + package build date stamp.

## Unreleased — Round 9 (calendar breeding markers, vaccination & weight CSV import, sync-accuracy fixes)

### Added
- **Breeding & heat markers on the Calendar** — expected births (pink) and
  re-breeding heat windows (violet) now appear as month-grid chips, mobile
  dots, list rows and day-dialog entries. The derivation was extracted into a
  shared module (`src/components/farm/reports/breeding-derive.ts`) used by BOTH
  the Reports card and the Calendar, so the two views can never disagree.
  Calendar legend upgraded to tinted pills (with role=listitem semantics).
- **CSV import for Vaccinations and Weight records (Settings → Data)** — the
  import dialog now has four targets (Animals, Transactions, Vaccinations,
  Weight records). Vaccination templates match the export headers exactly
  ("Animal, Group, Vaccine, Date given, Next due, Batch, Administered by,
  Notes"); the Animal column accepts the export format "C-023 (Mama)" or a
  bare Tag ID, or a group name for herd-level records; next-due dates create
  reminder tasks automatically (same facade path as the manual form). Weight
  records post to the animal's weight endpoint and update the animal's current
  weight; an empty date transparently means today (shown in the preview).
  Unresolvable animal tags/groups are skipped with honest reasons — IDs are
  never fabricated. Per-target query invalidation after import.
- **Offline badge & glance (`GET /api/summary` joins the local facade)** — the
  shell badges (due+overdue tasks, active livestock) previously fell through to
  the network; they are now computed from IndexedDB and work fully offline.

### Fixed
- **Tombstone leakage in server aggregates** — `GET /api/summary` and
  `GET /api/dashboard` did not filter `deletedAt` rows, inflating badges and
  attention counts with deleted records (e.g. 18 "due today" instead of 7,
  28 open tasks instead of 15). All count/find/aggregate queries in both
  routes now exclude tombstones, matching the r6 list-route fix.
- **`GET /api/groups` was not served offline** — the path was missing from the
  facade's local-read table, so group lists fell through to the network
  (failing offline when the SW cache was cold). Added a local read mirroring
  the server route (name asc, `?status=` filter, tombstones removed).

### Verified
- Round-trip QA through the real UI: vaccination CSV (2 imported incl. one
  group-level row; 3 skipped with reasons; both auto reminder tasks appeared;
  both records deleted via the timeline confirm flows) and weight CSV (1
  imported; duplicate-same-day, unknown-tag and bad-number rows skipped;
  weight history + current weight updated; QA record deleted; weight restored
  via the Edit form). Demo state restored; smoke suite 16/16; offline reload
  renders shell, data, groups list AND the corrected badges from IndexedDB.

## Unreleased — Round 8 (CSV import, breeding outlook, Zambian sources)

### Added
- **CSV import (Settings → Data)** — bulk-import Animals and Transactions from a
  spreadsheet. Downloads a template whose columns are exactly the app's export
  headers (full round-trip with your own exports), parses quoted/multiline CSVs
  client-side, validates every row with honest per-row skip reasons (missing Tag
  ID, duplicate Tag ID, bad dates like 32/13/2026, non-positive amounts), shows a
  "N ready · M will be skipped" preview, then imports row-by-row **through the
  offline-first facade** — rows land on this device first and sync to your server
  later, so import works with no network. Group names are matched against
  existing groups; unmatched rows still import without the link.
- **Breeding & heat outlook (Reports)** — a new report card derived entirely from
  the breeding & birth records you already keep: expected birth dates for open
  gestations (species gestation reused from the animal profile logic) with
  overdue/soon chips, and re-breeding (heat) windows after recent births for
  Cattle/Goats/Sheep/Pigs. Includes an explicit "general guidance — confirm with
  your veterinarian or extension officer" note.
- **More Zambian sources (Knowledge Hub)** — links to the Ministry of
  Agriculture, Ministry of Fisheries and Livestock, ZARI and ZNFU, with an
  honest note that external pages are only available while online.

### Verified
- Import round-trip exercised in-browser end-to-end: template download →
  preview → import → duplicate-skip on re-import → delete via UI → tombstone
  synced (demo data restored to the 7 seeded animals).

## Unreleased — Round 7 polish (camera, seasons, print)

### Added
- **Camera photo capture for animals & groups** — "Take photo" in the Add/Edit
  animal and group dialogs (plus a new "Upload photo" file option) using
  `getUserMedia` with a live preview; frames are downscaled to ≤1024 px JPEG and
  stored as the record's photo (data URL) — offline-first, synced on save.
  Permission is only requested by the explicit capture action; denied / no-camera
  / unsupported states show honest guidance. Fulfils the Permissions & devices
  camera promise ("used when you choose to take a photo of an animal").
- **Rainfall season analytics (Nov – Apr)** — new "Seasons" section in the
  rainfall report: Zambia rain-season totals (Nov 1 → Apr 30), rain days,
  wettest month, and season-over-season comparison, rendered as a compact
  horizontal bar chart. Computed client-side from local readings (works offline).
- **Report print header & footer** — print/PDF output now starts with the farm
  name, owner, location and generation timestamp, and ends with a
  "Generated by Farm Command — <farm>" line; screen-only controls are hidden in
  print and card shadows are stripped (verified via real PDF render).

### Changed
- Knowledge article reading experience: paragraphs split and spaced
  (`max-w-prose`, relaxed leading), "General guidance —" lines render as
  distinct amber note boxes, and the source line shows a real external link
  plus published/retrieved dates.

## Unreleased — Offline-first architecture upgrade

### Added
- **IndexedDB local database + offline-first data layer for ALL modules** — every
  read/write now goes to the browser's local database first (Dexie, 14 data tables +
  outbox + meta + weather cache + notification dedupe log); dashboard aggregates,
  reports and finance summaries are computed locally.
- **Sync engine with outbox, LWW conflicts, tombstones and idempotent endpoints** —
  `POST /api/sync/push` + `GET /api/sync/pull` (cursor-based); deterministic
  last-write-wins on `updatedAt`, `deletedAt` tombstone deletes, client-generated
  record ids, retry-safe pushes; automatic triggers (app start, every 30 s while
  visible, reconnect, debounced after-write) and manual "Sync now".
- **Live sync status UI** — header chip with Up to date / Offline — working locally /
  Syncing… / N changes waiting / Sync issue — tap to review, last-synced time,
  plain-language error explanations, and a never-deletes-unsynced outbox guarantee.
- **Permissions & Devices centre** — truthful Notifications / Location / Camera /
  Microphone statuses (Allowed / Denied / Not yet requested / Unsupported), request-
  on-use only, denied-permission guidance, camera/mic test dialogs.
- **Real browser notifications + local reminder engine** — reminders evaluated on
  launch/refocus/60 s while open; quiet hours, lead time, ~20 h dedupe, priorities,
  snooze/reschedule, test notification with honest failure reasons; Reminder Centre
  bell rebuilt on the local engine (works offline).
- **Web Push support** — VAPID configuration, per-device subscribe/unsubscribe, test
  push, `POST /api/push/check` for external cron delivery while the app is closed,
  and server-side dedupe via `PushLog`.
- **PWA upgrades** — service worker v3 (push + notification-click deep link + precached
  start URL + offline navigation fallback), manifest `id`, shortcuts and standalone
  display; dismissible install banner (never nags) + About-card install row.
- **Spacious dashboard redesign** — TODAY → WHAT NEEDS ATTENTION → QUICK ACTIONS →
  DETAILS hierarchy with inline complete/snooze, weather snapshot card with rain
  gauge, and progressive-disclosure lists.
- **Weather offline cache + stale indicator** — "Cached — may be stale (offline)" pill;
  honest unavailability message; no fabricated data.
- **Vaccination reminder-task generation ported offline** — creating/rescheduling a
  vaccination with a next-due date builds its reminder task locally and syncs.
- **Local backup/restore/CSV** — versioned JSON v2 backup (settings + all tables),
  restore into the local DB queued for sync, per-table CSV exports — all offline.
- **Smoke test suite** — `tests/smoke.mjs`, 16 assertions covering the sync contract
  (idempotency, LWW, tombstones, hydration, core endpoints).
- **Docs** — README overhaul, `QA_AUDIT.md` implementation audit, `.env.example`.

### Changed
- Tombstone (`deletedAt`) filtering added across server list APIs so deleted records
  disappear everywhere once synced.

## 1.1.0 — 2026-09-18

### Added
- **Breeding & gestation tracker** — log a `Breeding` event on any animal and the
  profile now shows a live gestation countdown (species-aware windows: cattle 283 d,
  goats 150 d, sheep 152 d, pigs 114 d), stage chip (early/mid/final), overdue
  warnings, a "Record birth" shortcut that closes the cycle, and last-cycle history.
  No new data model — derived from the health events you already keep.
- **Rain gauge report** — new Reports card with a trailing-12-month rainfall chart
  (cyan = Nov–Apr rainy season), season-to-date total, trailing-year total and the
  wettest month.
- **Print header** — printed reports now carry the farm name + generated date, and
  the sidebar/topbar/bottom-nav stay out of the printout.
- Root `README.md` and this `CHANGELOG.md`; the source zip ships a portable `.env`.

### Changed
- Downloadable source package (`farm-command.zip`) regenerated with all of the above.

## 1.0.0 — 2026-09-17

### Added
- Initial release: offline-first farm management PWA (dashboard, livestock with
  weight goals, crops & fields, tasks & reminders, calendar, farm map, finances,
  reports, knowledge hub, rainfall log, JSON backup/restore, CSV export, PWA
  install + offline fallback, optional AI assistant).
