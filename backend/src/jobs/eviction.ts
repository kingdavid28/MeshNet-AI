/**
 * eviction.ts — Stale-node eviction background job
 * backend/src/jobs/eviction.ts
 *
 * Marks nodes as offline when last_seen is older than STALE_THRESHOLD_MS
 * and hard-deletes them after EVICT_THRESHOLD_MS (default: 5 min offline
 * → stale, 10 min offline → evicted).
 *
 * Runs every EVICTION_INTERVAL_MS (default: 30 s) using a plain setInterval
 * so it survives without an external scheduler dependency.
 */

import type { Database } from "better-sqlite3";

// Configurable via env vars (milliseconds)
const STALE_THRESHOLD_MS   = parseInt(process.env.NODE_STALE_MS   ?? String(3 * 60_000),  10); // 3 min
const EVICT_THRESHOLD_MS   = parseInt(process.env.NODE_EVICT_MS   ?? String(10 * 60_000), 10); // 10 min
const EVICTION_INTERVAL_MS = parseInt(process.env.EVICT_INTERVAL_MS ?? String(30_000),    10); // 30 s

export function startEvictionJob(db: Database): void {
  // Prepare statements once — reused on every tick
  const markStale = db.prepare(`
    UPDATE nodes
    SET signal = 0, bluetooth_status = 0, wifi_status = 0
    WHERE datetime(last_seen) < datetime('now', ?)
      AND signal > 0
  `);

  const evict = db.prepare(`
    DELETE FROM nodes
    WHERE datetime(last_seen) < datetime('now', ?)
  `);

  const evictEdges = db.prepare(`
    DELETE FROM edges
    WHERE node_a NOT IN (SELECT id FROM nodes)
       OR node_b NOT IN (SELECT id FROM nodes)
  `);

  function tick(): void {
    try {
      const staleArg  = `-${Math.floor(STALE_THRESHOLD_MS  / 1000)} seconds`;
      const evictArg  = `-${Math.floor(EVICT_THRESHOLD_MS  / 1000)} seconds`;

      const staleInfo = markStale.run(staleArg);
      const evictInfo = evict.run(evictArg);
      evictEdges.run();

      if (staleInfo.changes > 0 || evictInfo.changes > 0) {
        console.log(
          `[eviction] stale=${staleInfo.changes} zeroed, evicted=${evictInfo.changes} removed`
        );
      }
    } catch (err) {
      console.error("[eviction] job error:", err);
    }
  }

  // Run once on startup, then on interval
  tick();
  setInterval(tick, EVICTION_INTERVAL_MS);

  console.log(
    `[eviction] job started — stale after ${STALE_THRESHOLD_MS / 1000}s, ` +
    `evicted after ${EVICT_THRESHOLD_MS / 1000}s, interval ${EVICTION_INTERVAL_MS / 1000}s`
  );
}
