-- Migration 007 — Drop the REFERENCES nodes(id) foreign key on alerts.from_node_id
--
-- Rationale: alerts can be originated by the dashboard UI (from_node_id = 'dashboard')
-- which is not a mesh node, causing FK violations when PRAGMA foreign_keys = ON.
-- The field is kept as a non-null TEXT identifier; referential integrity is not
-- needed here because alert senders include non-node sources.
--
-- SQLite does not support DROP CONSTRAINT, so we recreate the table.
-- PRAGMA foreign_keys must be OFF during the table recreation.

PRAGMA foreign_keys = OFF;
BEGIN;

-- 1. Rename old table
ALTER TABLE alerts RENAME TO alerts_old;

-- 2. Create new table without the FK
CREATE TABLE alerts (
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

-- 3. Copy existing rows
INSERT INTO alerts SELECT * FROM alerts_old;

-- 4. Drop old table
DROP TABLE alerts_old;

-- 5. Re-create indexes
CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_type    ON alerts(type);

COMMIT;
PRAGMA foreign_keys = ON;
