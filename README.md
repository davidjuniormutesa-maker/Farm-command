# Farm Command

**Offline-first farm management for a Zambian family farm.**

Farm Command is a web application and installable PWA that keeps every farm record —
livestock, health records, vaccinations, tasks and reminders, calendar, crops, fields
and harvests, finances in Zambian Kwacha (ZMW), reports, rainfall, a farm map, a
Knowledge Hub and an optional AI assistant — on the device you are using. It is built
for connectivity that comes and goes: **everything you can do online, you can do
offline**, and changes sync to your own server when a connection is available.

- No accounts, no subscriptions, no third-party cloud. Your data lives in your browser
  (IndexedDB) and on a server you control (PostgreSQL).
- Installable on desktop and Android via Chrome, and on iOS via Safari's
  "Add to Home Screen".
- English UI, ZMW currency, en-GB dates, Zambia-first agricultural content.

> QA: see [`QA_AUDIT.md`](./QA_AUDIT.md) for the implementation audit (what was
> actually tested, and what could not be verified in this environment).

---

## Architecture overview

Farm Command is **offline-first**: the browser copy of your farm data is the primary
working copy, and the server is the sync target — not a dependency.

```
┌──────────────────────────────┐
│  Browser / Installed PWA     │
│  (React UI, all modules)     │
└──────────────┬───────────────┘
               │ every read & write
               ▼
┌──────────────────────────────┐
│  Local Offline DB            │
│  IndexedDB via Dexie         │
│  (src/lib/offline/db.ts)     │
│  14 data tables + outbox +   │
│  meta + weather + notif log  │
└──────────────┬───────────────┘
               │ outbox drain (push) / cursor pull
               ▼
┌──────────────────────────────┐
│  Sync/API layer              │
│  (src/lib/offline/sync.ts)   │
└──────────────┬───────────────┘
               │ HTTPS (POST /api/sync/push · GET /api/sync/pull)
               ▼
┌──────────────────────────────┐
│  Next.js API routes          │
│  (src/app/api/**)            │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│  Prisma ORM                  │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│  Server database             │
│  PostgreSQL (cloud/self-host) │
└──────────────────────────────┘
```

How it works in practice:

- **All reads and writes go to IndexedDB first.** The UI never waits for the network.
  A small API facade (`src/lib/offline/api.ts`) serves every module from the local
  database, including locally computed dashboard aggregates, reports and finance
  summaries.
- **The sync engine drains an outbox.** Local changes are queued as outbox entries
  (`src/lib/offline/outbox.ts`) and pushed to `POST /api/sync/push`; server-side
  changes are pulled from `GET /api/sync/pull?since=<cursor>` and merged locally.
  Outbox entries are only removed once the server acknowledges them.
- **Conflict strategy is deterministic last-write-wins (LWW) on each record's
  `updatedAt`.** This is a documented, deliberate choice: when the same record is
  edited on two devices, the newest edit always survives — nothing is silently
  destroyed, the older edit is simply superseded by newer content. Deletes are
  **tombstones** (`deletedAt` timestamp) rather than hard deletes, so a deletion
  propagates to other devices, and a newer edit beats an older delete.
- **Record ids are generated on the client** (`crypto.randomUUID()` in
  `src/lib/offline/db.ts`), so records created offline sync to the server without the
  server having to mint ids — and without duplication.
- **Retries are idempotent.** Pushes carry full record bodies with stable ids; pushing
  the same change twice acks without duplicating.
- **Tombstones are purged** locally after 14 days (the server keeps its own copy so
  late-pulling devices still learn about the delete).

### Syncable tables

`settings`, `groups`, `animals`, `weightRecords`, `healthEvents`, `vaccinations`,
`fields`, `crops`, `activities`, `tasks`, `transactions`, `knowledge`, `rainfall`,
`mapItems` — i.e. every farm data model except purely local helpers (outbox, meta,
weather cache, notification dedupe log) and server-only tables (`WeatherSnapshot`,
`PushSubscription`, `PushLog`).

---

## Using Farm Command in a browser (website)

You do **not** have to install anything. Open the site in Chrome (or any modern
browser) and use it as a normal website. Core features — records, tasks, finances,
reports, backup — keep working when the network drops, because the local database and
service worker are part of the site itself. The site remembers your data on the same
browser profile on that device.

## Installing as a PWA

**Chrome (desktop or Android)**

- Chrome shows an **install icon in the address bar** when the site qualifies.
- Farm Command also shows an **in-app install banner** (on the dashboard) exactly when
  the browser offers installation. It is dismissible, never nags again in that browser,
  and installing is always your choice.
- Installed, Farm Command launches **standalone** (its own window, no browser chrome).

> HTTPS is required for installability and service workers in production. On
> `localhost` during development everything works without HTTPS.

**iOS (Safari)**

- Tap **Share → Add to Home Screen**. The app launches full-screen from the home
  screen icon. iOS does not expose the install-prompt API, so no in-app banner is
  shown there — this is an Apple platform limitation, not a missing feature.

## Offline behaviour

### Works offline (no connection needed)

- Dashboard with cached/locally computed data
- Livestock: animals, groups, weight records, health events, vaccinations
  (including automatic vaccination → reminder-task creation)
- Tasks: create/edit/complete/snooze/reschedule, recurring next-occurrence generation
- Calendar (aggregates tasks, vaccinations, activities, harvests, rain chips)
- Crops: fields, crop cycles, activities, harvest recording (with income logging)
- Finances: transactions, summaries and category breakdowns
- Reports (computed locally from your records)
- Global search across your data
- Knowledge Hub articles already stored on the device + your own notes
- Farm map (viewing and editing blocks)
- Settings
- JSON backup / restore and CSV exports
- Reminder evaluation (local engine) while the app is open

### Needs internet

- **Weather refresh** (Open-Meteo) — otherwise the last snapshot is shown with a
  stale indicator
- **AI assistant** (server-side SDK call)
- **Web Push delivery and subscription** (server must reach the push service, and the
  device must be online to receive)
- **Initial device hydration** (a brand-new browser pulls its first copy from the
  server; after that it works locally)

### Visible states

The header shows a sync chip with an honest state at all times:

| State | Meaning |
| --- | --- |
| **Up to date** | Connected, nothing pending |
| **Offline — working locally** | No connection; keep working, everything is saved locally |
| **Syncing…** | Push/pull in progress (shows the number of changes when pending) |
| **N changes waiting** | Local changes queued, will sync when a connection is available |
| **Sync issue — tap to review** | The last sync attempt failed; tap for a plain-language explanation (plus the technical detail) and a **Sync now** button |

The chip also shows **Last synced** (or "Never"). Weather shows a
**"Cached — may be stale (offline)"** pill when the displayed snapshot is stale; when
there is no cache at all it says so honestly instead of inventing data.

## Permissions

**Settings → Permissions & Devices** shows one row each for Notifications, Location,
Camera and Microphone:

- **Notifications** — so due reminders can reach you as browser notifications.
- **Location** — optional; used to fill your farm's coordinates for weather. Manual
  location entry always works as an alternative.
- **Camera** — only for an explicit in-app test so you can see it works; nothing
  photographs or uploads anything in the background.
- **Microphone** — only for an explicit in-app test; nothing records or uploads
  anything in the background.

Nothing is requested at page load. Permissions are requested **on use**, each row
shows the truthful status (**Allowed / Denied / Not yet requested / Unsupported**),
status is re-read after every request, and a denied permission shows guidance for
changing it in the browser's site settings instead of a dead "retry" button.

## Notification behaviour — and honest limitations

**Local reminders (work offline, while the app is open/active):**

- Reminders are evaluated when the app launches, when you refocus it, and every 60 s
  while it is visible. Due/overdue tasks and vaccinations (within your configured
  lead time) are shown as notifications through the service worker.
- Quiet hours (default 20:00–06:00) hold notifications back while the app is open;
  the Reminder Centre (bell icon) always lists what is due regardless.
- Lead time, quiet hours and a master toggle are in **Settings → Notifications**, plus
  a **Send test notification** button that reports the real reason on failure.
- The same reminder is not re-shown more than about once per 20 hours (local dedupe).

**Web Push (server-delivered, optional, requires configuration):**

- When VAPID keys are configured (see below) and the device is online, the server can
  deliver reminder notifications **while the app is closed**.
- Delivery is evaluated by `POST /api/push/check`. **Call it from an external cron**
  (e.g. every 15 minutes) for scheduled delivery; the client also triggers it
  opportunistically after each successful sync.
- A `PushLog` table de-duplicates server pushes per (kind, record, due-date) so
  retries never spam you.

**What a PWA cannot do — stated plainly:**

- A PWA **cannot set the phone's native alarm clock**, cannot install its own ringtone
  into the alarm settings, and cannot guarantee background notification delivery when
  **both** the device and the server are offline.
- Sound and vibration follow the OS/browser notification settings, not the app.
- These are platform limits, documented here on purpose rather than papered over.

## Local development

Requirements: [Bun](https://bun.sh) or Node.js 18+.

```bash
bun install                # or: npm install
bun run db:push            # creates/updates the PostgreSQL schema from prisma/schema.prisma
bun run dev                # http://localhost:3000
```

Other commands:

```bash
bun run lint               # ESLint
bun run typecheck          # tsc --noEmit (build now fails on type errors too)
bun run build              # production build (standalone output)
bun run start              # run the production build
bun run test               # server smoke test (16 assertions) against BASE URL
BASE=http://localhost:3000 bun run test   # explicit target
# or: node tests/smoke.mjs
```

Optional demo data: the first-launch **onboarding** offers "load demo data", and
**Settings → Data → Load demo data** re-loads it any time — both work offline.

## Production deployment

Any Node host works — VPS, Docker, or a PaaS:

1. Set the environment variables (see below; only `DATABASE_URL` is required).
2. Run `bun run db:push` once to create/update the database schema.
3. `bun run build` then `bun run start` (standalone output; static assets and
   `public/` are copied into `.next/standalone` by the build script).
4. Serve over **HTTPS** — required for service worker, installability and Web Push.
5. Reverse-proxy notes: forward all paths to the app's port; do not buffer-strip
   `POST` bodies (the sync push batches can be sizeable); no sticky sessions needed
   (single-process app).

The datasource is PostgreSQL (`provider = "postgresql"` in `prisma/schema.prisma`).
Use a managed Postgres such as Neon or Vercel Postgres (both have free tiers) and
point `DATABASE_URL` at it. The schema is portable (no database-specific column
types), so it also runs on any self-hosted Postgres. On serverless hosts (e.g.
Vercel) a file-based database like SQLite cannot be used because the function
filesystem is read-only and ephemeral — a networked database is required.

## Database setup

- `DATABASE_URL=postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require` — the
  connection string from your Postgres provider (Neon / Vercel Postgres / self-hosted).
  Use the SAME URL locally and in production so every device shares one database.
- **`db:push` vs migrations**: this project uses `prisma db push` (schema → database,
  no migration files). There is no `prisma/migrations` folder and it is not used.
  For this project's scale, `db:push` is the recommended workflow.
- **Back up before schema changes**: run the in-app JSON backup (or a `pg_dump`)
  before running `db:push` after pulling code changes.
- **The browser copy is separate and per-device.** IndexedDB belongs to that browser
  profile on that device; clearing browser data deletes the local working copy. It is
  restored either by re-syncing from the server or by importing a JSON backup.

## Synchronization

**Automatic triggers**

- App start (and first-run hydration for a new device)
- Every 30 seconds while the tab is visible and online
- On browser reconnect (`online` event)
- Shortly (3 s, debounced) after any local change

**Manual trigger**: tap the sync chip → **Sync now**.

**Outbox semantics**

- Every local write enqueues an outbox entry (`put` or `del` per record); entries are
  removed only on server acknowledgement, so a crash or offline period never loses a
  change. Failed pushes keep their entries, increment a retry counter and record the
  error shown in the sync chip.
- **Never-deletes-unsynced guarantee**: a record with pending changes is never removed
  locally; deletes queue as tombstones and propagate on the next successful sync.

**Multi-device notes**

- Each device has its own IndexedDB copy. Changes converge through LWW on
  `updatedAt`; offline-created client ids prevent duplication; server tombstones
  remove deleted records on other devices (unless a device holds a newer edit — that
  edit then wins and re-syncs, per the documented LWW rule).
- **Reset** in Settings → Data wipes the **local browser copy** (with a typed
  confirmation) and also offers a full server reset; re-sync re-hydrates a reset
  device.

## Push notification setup (optional)

1. Generate VAPID keys:

   ```bash
   bunx web-push generate-vapid-keys
   ```

   (Note: the correct subcommand is `generate-vapid-keys`.)

2. Put them in `.env` (see `.env.example`):

   ```env
   WEB_PUSH_PUBLIC_KEY=...
   WEB_PUSH_PRIVATE_KEY=...
   WEB_PUSH_CONTACT=mailto:you@example.com
   ```

3. Restart the server. `GET /api/push/config` should report `configured: true`.
4. On each device: **Settings → Notifications → Enable push on this device**, then use
   **Send test push** to verify end-to-end.
5. Schedule delivery while the app is closed with an external cron:

   ```bash
   # e.g. every 15 minutes (crontab)
   */15 * * * * curl -X POST https://your-host/api/push/check
   ```

Server tables involved: `PushSubscription` (one per browser/device) and `PushLog`
(dedupe per kind/record/due-date).

## Weather API setup

- Uses **Open-Meteo** — free and **no API key required** — called server-side by
  `/api/weather` (8 s timeout).
- Location comes from your settings (manual lat/lon in **Settings → Farm profile**) or
  optionally from device geolocation (a permission you grant).
- Responses are cached server-side (`WeatherSnapshot`) and client-side (IndexedDB
  `weatherCache`). Offline → the cached snapshot with a "may be stale" indicator; with
  no cache at all, an honest "unavailable" message. Weather data is never fabricated.

## Optional AI assistant

- `/api/ai` calls the `z-ai-web-dev-sdk` **server-side only** — no keys or SDK code in
  the client.
- Toggle it in **Settings** (off by default). It is strictly optional: a disabled or
  unreachable AI never blocks any core feature (the UI says so and carries on).
- Safety stance: the assistant handles farm records and educational references only;
  it is instructed never to diagnose, never to prescribe or give individualized
  dosages, and to recommend professional veterinary advice. Knowledge articles carry
  their sources and a "confirm with your local extension officer / veterinarian"
  notice.

## Backup and restore

**Settings → Data**:

- **Download full backup (JSON)** — versioned format (v2) including settings and all
  farm tables in one file. Works offline, no cloud involved.
- **Import backup** — imports into the local database and queues the records for
  sync; confirmation-guarded (it replaces current data).
- **CSV export** — one file per table (animals, weights, tasks, finances, rainfall,
  and more).
- **Reset** — wipes local data, requires typing `RESET`.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | **Yes** | Prisma PostgreSQL connection, e.g. `postgresql://user:pass@host/db?sslmode=require` |
| `WEB_PUSH_PUBLIC_KEY` | No | VAPID public key — enables server push |
| `WEB_PUSH_PRIVATE_KEY` | No | VAPID private key (server-only) |
| `WEB_PUSH_CONTACT` | No | Contact URI for the push service, e.g. `mailto:you@example.com` |
| `FARM_ACCESS_TOKEN` | No | Shared access code for the optional server gate. Blank = gate off (default). |

See [`.env.example`](./.env.example). Everything else works without configuration.

## Security notes

- **No secrets in client code.** Web-push keys are read from the server environment
  only; the AI SDK runs server-side only (`/api/ai`).
- **Input validation** with zod on both client and server — including the sync push
  endpoint, which validates the change envelope and rejects non-scalar record payloads
  before they reach the ORM.
- **Optional access gate.** By default the app is account-free (nothing to log into).
  When you host the sync server on the public internet, set `FARM_ACCESS_TOKEN` to a
  long random value (`openssl rand -base64 32`) to require a one-time unlock:
  browsers unlock at `/unlock` (an httpOnly cookie is then sent automatically on every
  request), and programmatic callers such as the push cron send
  `Authorization: Bearer <FARM_ACCESS_TOKEN>`. When the variable is unset the gate is a
  no-op and behaviour is unchanged. The gate protects the server API; it is not a
  per-user login and does not change the offline-first model.
- **Rate limiting.** The expensive/abusable endpoints are throttled per client IP
  (AI 20/min, sync-push 60/min, sync-pull 120/min, unlock 10/min). Limits are
  per-process — fine for the single-server model; front multiple instances with a
  proxy/WAF.
- **No accounts** means your data stays on your devices and your server — there is
  nothing to leak to a third party, and also nothing to recover if you lose both a
  device and its backups. Take JSON backups.
- **Serve HTTPS in production** (required for PWA/push anyway).
- **Caching**: the service worker only caches same-origin `GET` responses the user
  already loaded; `POST`/`PUT`/`PATCH`/`DELETE` requests are never intercepted or
  cached.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| App shows the offline page | Visit the site once while online so the service worker can precache; then reload. Check the SW is registered (DevTools → Application). |
| Records not syncing | Tap the sync chip → **Sync now**. The chip shows the last error in plain language (with technical detail underneath). |
| Duplicate-looking data after a restore | This is LWW merge settling: same-id records converge on the newest `updatedAt`. Give it a sync cycle; genuinely distinct records have distinct ids. |
| Notification permission denied | Open the browser's site settings (padlock icon → Site settings → Notifications) and reset to "Ask", or re-allow there. The app will not re-prompt. |
| IndexedDB was cleared (browser cleanup) | Re-open while online — the server re-hydrates the device — or restore a JSON backup. |
| Weather looks stale | Tap refresh on the weather card while online; the stale pill disappears on a successful fetch. |
| Database schema drift | Run `bun run db:push` (or `npm run db:push`) against your `DATABASE_URL`. |
| Port 3000 already in use | Stop the other process, or run on another port (`next dev -p 3001`) — the app itself has no hard-coded port dependency beyond the dev script. |

## Known browser / platform limitations

Honest list — these are platform facts, not defects we plan to "fix":

- **No native alarm-clock or ringtone control** — a PWA cannot set the phone's alarm
  clock or install a ringtone into alarm settings. Reminder sounds/vibration follow
  OS/browser notification settings.
- **No guaranteed background notifications when offline on both ends** — server push
  needs the server online and the device reachable; local reminders need the app open
  or active.
- **iOS Safari**: no Web Push before iOS 16.4; no `beforeinstallprompt` (install is
  via Share → Add to Home Screen); notification permission has quirks; Safari can
  evict website storage after ~7 days of non-use for some versions — regular use or
  installing to the home screen mitigates this, and JSON backup is the safety net.
- **Firefox** lacks some `PermissionName` queries — camera/microphone status may show
  "Not yet requested" even after a grant/deny (the app falls back gracefully).
- **IndexedDB quota** is typically hundreds of MB — ample for farm records; note that
  photos stored as data URLs count against the same quota.
- **Headless/test environments** (and some kiosk browsers) deny notifications, camera
  and microphone — the app reports the denial honestly instead of pretending success.

## Project structure

```
farm-command/
├── index.html                        # Standalone launcher page (open in any browser:
│                                     #   run instructions, feature map, doc links)
├── src/
│   ├── app/
│   │   ├── page.tsx                  # App shell: sidebar, topbar, view switch
│   │   └── api/                      # REST API routes
│   │       ├── sync/                 #   push/ + pull/ — the sync contract
│   │       ├── push/                 #   config|subscribe|unsubscribe|test|check (Web Push)
│   │       ├── animals|groups|health-events|vaccinations|weights
│   │       ├── tasks/                #   incl. complete + snooze (recurrence engine)
│   │       ├── crops|fields|activities|harvest
│   │       ├── finance|reports|backup|rainfall|map
│   │       ├── knowledge|ai|weather|search|settings|seed|dashboard|summary
│   ├── components/farm/              # Feature UI (dashboard, livestock, crops, tasks,
│   │                                 #   calendar, finances, reports, knowledge,
│   │                                 #   settings, reminders, sync, search, onboarding)
│   ├── lib/
│   │   ├── offline/                  # THE offline core
│   │   │   ├── db.ts                 #   Dexie IndexedDB schema + client id generation
│   │   │   ├── outbox.ts             #   change queue + data-changed notifications
│   │   │   ├── api.ts                #   offline-first apiGet/apiSend facade (all modules)
│   │   │   ├── sync.ts               #   push/pull engine, LWW merge, triggers, sync store
│   │   │   ├── reminders.ts          #   local reminder evaluation + SW notifications
│   │   │   ├── push-client.ts        #   Web Push subscribe/unsubscribe/status
│   │   │   ├── seed-data.ts          #   shared demo dataset (client + server)
│   │   │   └── dto.ts|types.ts|qk.ts #   shared types + query keys
│   │   ├── api.ts                    # re-exports the offline facade (compat)
│   │   ├── farm.ts                   # DTOs, constants, formatting helpers
│   │   └── db.ts                     # Prisma client (server)
│   └── components/ui/                # shadcn/ui primitives
├── prisma/schema.prisma              # 16 models (incl. tombstones, PushSubscription, PushLog)
├── public/
│   ├── sw.js                         # service worker v3 (precache, push, notificationclick)
│   ├── manifest.webmanifest          # PWA manifest (id, shortcuts, standalone)
│   └── offline.html                  # offline navigation fallback (precached)
├── tests/smoke.mjs                   # 16-assertion server smoke test
└── scripts/                          # environment helper scripts
```

## QA audit

A per-requirement implementation audit — including what was genuinely tested, what is
only partially verifiable outside a real device, and what is impossible on the web
platform — lives in [`QA_AUDIT.md`](./QA_AUDIT.md).
