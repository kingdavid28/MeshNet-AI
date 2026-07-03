-- Migration 006 — signal_events table
-- Tracks every signal-flicker event (0 → ≥1 bar) for high-priority burst dispatch.

CREATE TABLE IF NOT EXISTS signal_events (
  id           TEXT    PRIMARY KEY,
  node_id      TEXT    NOT NULL,                  -- device that flickered
  node_label   TEXT    NOT NULL,
  prev_signal  INTEGER NOT NULL DEFAULT 0,        -- signal before flicker
  curr_signal  INTEGER NOT NULL DEFAULT 0,        -- signal after flicker
  scenario     TEXT    NOT NULL DEFAULT 'earthquake',
  burst        INTEGER NOT NULL DEFAULT 0,        -- 0=pending, 1=burst dispatched
  detected_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_signal_events_node ON signal_events(node_id);
CREATE INDEX IF NOT EXISTS idx_signal_events_ts   ON signal_events(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_events_burst ON signal_events(burst);
