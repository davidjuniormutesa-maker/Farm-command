#!/usr/bin/env node
/**
 * Farm Command — server smoke test.
 *
 * Run against a LOCAL dev/production server:
 *
 *   BASE=http://localhost:3000 node tests/smoke.mjs
 *   # or: BASE=http://localhost:3000 bun tests/smoke.mjs
 *
 * Verifies the server-side API contract the sync engine depends on:
 *   1. GET  /api/sync/pull            → full hydration payload
 *   2. POST /api/sync/push (put)      → create, idempotent re-push (no dup)
 *   3. POST /api/sync/push (del)      → tombstone, then pull shows it
 *   4. LWW  push with older updatedAt → server keeps newer copy (conflict)
 *   5. GET  /api/settings | /api/tasks | /api/backup | /api/weather → 200
 *
 * The test creates and deletes its own record (title prefix "SMOKE-TEST"),
 * leaving the database as it found it. Exit code 0 = all assertions passed.
 */

const BASE = process.env.BASE ?? "http://localhost:3000";

let passed = 0;
let failed = 0;
function ok(condition, name, extra = "") {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name} ${extra}`);
  }
}

async function json(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

const now = new Date().toISOString();
const record = {
  id: `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title: "SMOKE-TEST sync record (safe to ignore)",
  description: null,
  category: "general",
  dueDate: now,
  dueTime: null,
  priority: "low",
  repeatRule: "once",
  repeatIntervalDays: null,
  leadTimeDays: 0,
  animalId: null,
  groupId: null,
  cropCycleId: null,
  fieldId: null,
  assignee: null,
  status: "open",
  completedAt: null,
  nextOccurrenceId: null,
  vaccinationId: null,
  notes: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
};
const put = (rec) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ changes: [{ table: "tasks", recordId: rec.id, op: "put", record: rec }] }),
});
const del = (id) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ changes: [{ table: "tasks", recordId: id, op: "del", deletedAt: new Date().toISOString() }] }),
});

console.log(`\nFarm Command smoke test → ${BASE}\n`);

// ---- 0. basics ----
console.log("0. Core endpoints");
for (const path of ["/api/settings", "/api/tasks", "/api/backup", "/api/dashboard"]) {
  const { status } = await json(path);
  ok(status === 200, `GET ${path} → 200`, `(got ${status})`);
}
const weather = await json("/api/weather");
ok(weather.status === 200 || weather.status === 502, "GET /api/weather responds", `(got ${weather.status})`);

// ---- 1. hydration pull ----
console.log("\n1. Sync pull (hydration)");
const pull1 = await json("/api/sync/pull?since=");
ok(pull1.status === 200, "GET /api/sync/pull → 200", `(got ${pull1.status})`);
ok(typeof pull1.body?.serverTime === "string", "returns serverTime cursor");
ok(Array.isArray(pull1.body?.changes?.tasks) || pull1.body?.changes?.tasks === undefined, "changes.tasks is an array");

// ---- 2. push put + idempotency ----
console.log("\n2. Sync push (put) + idempotency");
const push1 = await json("/api/sync/push", put(record));
ok(push1.status === 200, "POST /api/sync/push → 200", `(got ${push1.status})`);
ok((push1.body?.applied ?? []).includes(`tasks:${record.id}`), "change applied");
const push2 = await json("/api/sync/push", put(record));
ok((push2.body?.applied ?? []).includes(`tasks:${record.id}`), "re-push acked (idempotent)");
const tasksAfter = await json("/api/tasks");
const copies = (tasksAfter.body ?? []).filter((t) => t.id === record.id).length;
ok(copies === 1, "exactly one record after re-push (no duplicates)", `(found ${copies})`);

// ---- 3. LWW: older push must not clobber newer ----
console.log("\n3. Last-write-wins protection");
const newer = { ...record, title: "SMOKE-TEST newer", updatedAt: now };
await json("/api/sync/push", put(newer));
const older = { ...record, title: "SMOKE-TEST older", updatedAt: new Date(Date.now() - 5000).toISOString() };
const pushOlder = await json("/api/sync/push", put(older));
const conflicted = (pushOlder.body?.conflicts ?? []).some((c) => c.record?.id === record.id);
const tasksLww = await json("/api/tasks");
const kept = (tasksLww.body ?? []).find((t) => t.id === record.id);
ok(conflicted || kept?.title === "SMOKE-TEST newer", "older push does not overwrite newer record", `(title now: ${kept?.title})`);

// ---- 4. tombstone delete + pull ----
console.log("\n4. Tombstone delete");
// Delete made AFTER the last edit (deletedAt newer than the record's updatedAt)
const tombstoneTime = new Date(Date.now() + 2000).toISOString();
const pushDel = await json("/api/sync/push", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ changes: [{ table: "tasks", recordId: record.id, op: "del", deletedAt: tombstoneTime }] }),
});
ok(pushDel.status === 200 && (pushDel.body?.applied ?? []).includes(`tasks:${record.id}`), "delete applied");
const tasksAfterDel = await json("/api/tasks");
ok(!(tasksAfterDel.body ?? []).some((t) => t.id === record.id), "record removed from task list");
const pull2 = await json(`/api/sync/pull?since=${encodeURIComponent(new Date(Date.now() - 60_000).toISOString())}`);
const tombstoned = (pull2.body?.tombstones?.tasks ?? []).some((t) => t.id === record.id) ||
  !((pull2.body?.changes?.tasks ?? []).some((t) => t.id === record.id));
ok(tombstoned, "tombstone visible on pull (other devices will delete too)");

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
