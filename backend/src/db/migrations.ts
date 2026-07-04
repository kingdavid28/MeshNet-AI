/**
 * migrations.ts — Sequential SQL migration runner
 * backend/src/db/migrations.ts
 *
 * Each migration is identified by a monotonically increasing integer version.
 * Applied migrations are recorded in the `schema_migrations` table so each
 * migration runs exactly once, even across restarts.
 *
 * Usage (called once at server start, before any other DB operation):
 *   import { runMigrations } from "./db/migrations";
 *   runMigrations(db);
 */

import type { Database } from "better-sqlite3";

interface Migration {
  version: number;
  description: string;
  up: string;
}

// ── Migration registry ────────────────────────────────────────────────────────
// Add new migrations to the END of this array only. Never edit existing ones.

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: "initial schema — nodes, edges tables",
    up: `
      CREATE TABLE IF NOT EXISTS nodes (
        id                 TEXT    PRIMARY KEY,
        label              TEXT    NOT NULL,
        name               TEXT    NOT NULL,
        device             TEXT    NOT NULL CHECK (device IN ('smartphone','laptop')),
        role               TEXT    NOT NULL CHECK (role IN ('peer','relay')),
        signal             INTEGER NOT NULL DEFAULT 80,
        battery_percentage INTEGER NOT NULL DEFAULT 100,
        bluetooth_status   INTEGER NOT NULL DEFAULT 0 CHECK (bluetooth_status IN (0,1)),
        os                 TEXT,
        lat                REAL,
        lng                REAL,
        last_seen          TEXT    NOT NULL DEFAULT (datetime('now')),
        registered         TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_nodes_last_seen ON nodes(last_seen DESC);

      CREATE TABLE IF NOT EXISTS edges (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        node_a      TEXT    NOT NULL,
        node_b      TEXT    NOT NULL,
        protocol    TEXT    NOT NULL CHECK (protocol IN ('wifi','bluetooth')),
        quality     INTEGER NOT NULL DEFAULT 80,
        observed_at TEXT    NOT NULL DEFAULT (datetime('now')),
        UNIQUE (node_a, node_b, protocol)
      );
      CREATE INDEX IF NOT EXISTS idx_edges_observed ON edges(observed_at DESC);
    `,
  },
  {
    version: 2,
    description: "add alerts and signal_events tables",
    up: `
      CREATE TABLE IF NOT EXISTS alerts (
        id             TEXT    PRIMARY KEY,
        type           TEXT    NOT NULL CHECK (type IN ('sos','medical','safe','hazard','supply','locate')),
        severity       TEXT    NOT NULL CHECK (severity IN ('critical','high','medium','low')),
        from_node_id   TEXT    NOT NULL,
        from_label     TEXT    NOT NULL,
        message        TEXT,
        lat            REAL,
        lng            REAL,
        ttl            INTEGER NOT NULL DEFAULT 7,
        acknowledged   INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
        expires_at     TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_alerts_type    ON alerts(type);

      CREATE TABLE IF NOT EXISTS signal_events (
        id           TEXT    PRIMARY KEY,
        node_id      TEXT    NOT NULL,
        node_label   TEXT    NOT NULL,
        prev_signal  INTEGER NOT NULL DEFAULT 0,
        curr_signal  INTEGER NOT NULL DEFAULT 0,
        scenario     TEXT    NOT NULL DEFAULT 'earthquake',
        burst        INTEGER NOT NULL DEFAULT 0,
        detected_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_signal_events_node  ON signal_events(node_id);
      CREATE INDEX IF NOT EXISTS idx_signal_events_ts    ON signal_events(detected_at DESC);
      CREATE INDEX IF NOT EXISTS idx_signal_events_burst ON signal_events(burst);
    `,
  },
  {
    version: 3,
    description: "add messages table",
    up: `
      CREATE TABLE IF NOT EXISTS messages (
        id           TEXT    PRIMARY KEY,
        from_node_id TEXT    NOT NULL,
        from_label   TEXT    NOT NULL,
        to_node_id   TEXT    NOT NULL,
        category     TEXT    NOT NULL CHECK (category IN ('alert','medical','info','gps')),
        ciphertext   TEXT    NOT NULL,
        hops         INTEGER NOT NULL DEFAULT 0,
        read         INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_messages_to   ON messages(to_node_id);
      CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_node_id);
      CREATE INDEX IF NOT EXISTS idx_messages_ts   ON messages(created_at DESC);
    `,
  },
  {
    version: 4,
    description: "add wifi_status column to nodes",
    up: `
      ALTER TABLE nodes ADD COLUMN wifi_status INTEGER NOT NULL DEFAULT 0
        CHECK (wifi_status IN (0,1));
    `,
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

export function runMigrations(db: Database): void {
  // Ensure the migration tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      description TEXT    NOT NULL,
      applied_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const getApplied = db.prepare<[], { version: number }>(
    "SELECT version FROM schema_migrations ORDER BY version"
  );
  const insertApplied = db.prepare(
    "INSERT INTO schema_migrations (version, description) VALUES (?, ?)"
  );

  const applied = new Set((getApplied.all() as { version: number }[]).map((r) => r.version));

  let count = 0;
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;

    // Run each migration in a transaction so partial failures don't corrupt the DB
    const runMigration = db.transaction(() => {
      // SQLite doesn't support multiple statements in db.prepare; split on semicolon
      for (const stmt of m.up.split(";").map((s) => s.trim()).filter(Boolean)) {
        db.exec(stmt + ";");
      }
      insertApplied.run(m.version, m.description);
    });

    try {
      runMigration();
      console.log(`[migrations] applied v${m.version}: ${m.description}`);
      count++;
    } catch (err) {
      // Skip "column already exists" errors from the wifi_status migration
      // when the column was previously added via the ad-hoc ALTER TABLE path.
      if (
        err instanceof Error &&
        err.message.includes("duplicate column name")
      ) {
        insertApplied.run(m.version, m.description);
        console.log(`[migrations] v${m.version} skipped (column already existed)`);
        count++;
      } else {
        console.error(`[migrations] FATAL: migration v${m.version} failed:`, err);
        process.exit(1);
      }
    }
  }

  if (count === 0) {
    console.log(`[migrations] schema up-to-date (v${MIGRATIONS.at(-1)!.version})`);
  }
}
