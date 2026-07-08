/**
 * db.ts — Layer 4: SQLite persistence service
 * backend/src/db.ts
 *
 * Singleton better-sqlite3 connection shared by all route handlers.
 * Schema is managed by the migration runner in ./db/migrations.ts —
 * do NOT add ad-hoc CREATE TABLE or ALTER TABLE statements here.
 *
 * Import pattern:
 *   import { db, NodeRow, AlertRow, MessageRow } from "../db";
 */

import path from "path";
import Database from "better-sqlite3";
import { runMigrations } from "./db/migrations";

// ─── Connection ───────────────────────────────────────────────────────────────

const DB_PATH = process.env.DB_PATH ?? path.resolve(__dirname, "../../database/meshnet.db");

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Run all pending migrations before preparing any statements.
runMigrations(db);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NodeRow {
  id:                 string;
  label:              string;
  name:               string;
  device:             "smartphone" | "laptop";
  role:               "peer" | "relay";
  signal:             number;
  battery_percentage: number;
  bluetooth_status:   number;   // SQLite stores boolean as 0 / 1
  wifi_status:        number;   // SQLite stores boolean as 0 / 1
  os:                 string | null;
  lat:                number | null;
  lng:                number | null;
  last_seen:          string;
  registered:         string;
}

export interface EdgeRow {
  id:          number;
  node_a:      string;
  node_b:      string;
  protocol:    "wifi" | "bluetooth";
  quality:     number;
  observed_at: string;
}

export interface AlertRow {
  id:           string;
  type:         string;
  severity:     string;
  from_node_id: string;
  from_label:   string;
  message:      string | null;
  lat:          number | null;
  lng:          number | null;
  ttl:          number;
  acknowledged: number;    // 0 | 1
  created_at:   string;
  expires_at:   string | null;
}

export interface SignalEventRow {
  id:           string;
  node_id:      string;
  node_label:   string;
  prev_signal:  number;
  curr_signal:  number;
  scenario:     string;
  burst:        number;   // 0 | 1
  detected_at:  string;
}

export interface MessageRow {
  id:           string;
  from_node_id: string;
  from_label:   string;
  to_node_id:   string;
  category:     string;
  ciphertext:   string;
  hops:         number;
  read:         number;    // 0 | 1
  created_at:   string;
}

// ─── Prepared statements ──────────────────────────────────────────────────────

// ── nodes ──
export const nodeStmts = {
  upsert: db.prepare<NodeRow>(`
    INSERT INTO nodes
      (id, label, name, device, role, signal,
       battery_percentage, bluetooth_status, wifi_status, os, lat, lng, last_seen)
    VALUES
      (@id, @label, @name, @device, @role, @signal,
       @battery_percentage, @bluetooth_status, @wifi_status, @os, @lat, @lng, @last_seen)
    ON CONFLICT(id) DO UPDATE SET
      label              = excluded.label,
      signal             = excluded.signal,
      battery_percentage = excluded.battery_percentage,
      bluetooth_status   = excluded.bluetooth_status,
      wifi_status        = excluded.wifi_status,
      lat                = excluded.lat,
      lng                = excluded.lng,
      last_seen          = excluded.last_seen
  `),

  getAll: db.prepare<[], NodeRow>(
    "SELECT * FROM nodes ORDER BY last_seen DESC"
  ),

  getById: db.prepare<[string], NodeRow>(
    "SELECT * FROM nodes WHERE id = ?"
  ),

  heartbeat: db.prepare(`
    UPDATE nodes
    SET signal             = @signal,
        battery_percentage = @battery_percentage,
        bluetooth_status   = @bluetooth_status,
        wifi_status        = @wifi_status,
        lat                = COALESCE(@lat, lat),
        lng                = COALESCE(@lng, lng),
        last_seen          = @last_seen
    WHERE id = @id
  `),

  delete: db.prepare<[string], any>(
    "DELETE FROM nodes WHERE id = ?"
  ),

  deleteAll: db.prepare<[], any>(
    "DELETE FROM nodes"
  ),
};

// ── edges ──
export const edgeStmts = {
  upsert: db.prepare(`
    INSERT INTO edges (node_a, node_b, protocol, quality)
    VALUES (@node_a, @node_b, @protocol, @quality)
    ON CONFLICT(node_a, node_b, protocol) DO UPDATE SET
      quality     = excluded.quality,
      observed_at = datetime('now')
  `),

  getAll: db.prepare<[], EdgeRow>(
    "SELECT * FROM edges ORDER BY observed_at DESC"
  ),

  getByNodes: db.prepare<[string, string], EdgeRow>(
    "SELECT * FROM edges WHERE (node_a = ? AND node_b = ?) OR (node_a = ? AND node_b = ?)"
  ),
};

// ── alerts ──
export const alertStmts = {
  insert: db.prepare(`
    INSERT INTO alerts
      (id, type, severity, from_node_id, from_label, message, lat, lng, ttl, acknowledged, created_at)
    VALUES
      (@id, @type, @severity, @from_node_id, @from_label, @message, @lat, @lng, @ttl, @acknowledged, @created_at)
  `),

  getAll: db.prepare<[], AlertRow>(
    "SELECT * FROM alerts ORDER BY created_at DESC"
  ),

  acknowledge: db.prepare(
    "UPDATE alerts SET acknowledged = 1 WHERE id = ?"
  ),
};

// ── signal_events ──
export const signalEventStmts = {
  insert: db.prepare(`
    INSERT INTO signal_events
      (id, node_id, node_label, prev_signal, curr_signal, scenario, burst, detected_at)
    VALUES
      (@id, @node_id, @node_label, @prev_signal, @curr_signal, @scenario, @burst, @detected_at)
  `),

  markBurst: db.prepare(
    "UPDATE signal_events SET burst = 1 WHERE id = ?"
  ),

  getRecent: db.prepare<[number], SignalEventRow>(`
    SELECT * FROM signal_events
    ORDER BY detected_at DESC
    LIMIT ?
  `),

  getUnburst: db.prepare<[], SignalEventRow>(
    "SELECT * FROM signal_events WHERE burst = 0 ORDER BY detected_at DESC"
  ),
};

// ── messages ──
export const messageStmts = {
  insert: db.prepare(`
    INSERT INTO messages
      (id, from_node_id, from_label, to_node_id, category, ciphertext, hops, created_at)
    VALUES
      (@id, @from_node_id, @from_label, @to_node_id, @category, @ciphertext, @hops, @created_at)
  `),

  getAll: db.prepare<[], MessageRow>(
    "SELECT * FROM messages ORDER BY created_at DESC"
  ),

  getForNode: db.prepare<[string, string], MessageRow>(`
    SELECT * FROM messages
    WHERE to_node_id = ? OR to_node_id = 'broadcast' OR from_node_id = ?
    ORDER BY created_at DESC
  `),

  markRead: db.prepare(
    "UPDATE messages SET read = 1 WHERE id = ?"
  ),
};
