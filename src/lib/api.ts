/**
 * Farm Command — data access entry point.
 *
 * Since the offline-first upgrade this module is a facade over the LOCAL
 * IndexedDB database (Dexie). Reads and writes never require the network:
 * writes land in the local database and a background sync engine replicates
 * them to the server (see src/lib/offline/sync.ts). Only genuinely online
 * features (weather refresh, AI assistant, web-push management) touch the
 * network, with graceful offline fallbacks.
 *
 * The historical `apiGet` / `apiSend` signatures are preserved so all view
 * code keeps working unchanged. `ApiError` is kept as the historical name of
 * the typed error class (now implemented as OfflineError in the facade).
 */

export { qk } from "./offline/qk";
export { apiGet, apiSend, apiGetCsv } from "./offline/api";
export { OfflineError as ApiError } from "./offline/api";
