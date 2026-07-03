#!/usr/bin/env ts-node
// Runs all SQL migration files in numeric order against the SQLite DB.
// Usage: npx ts-node migrations/run.ts

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, "..", "meshnet.db");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    filename TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

const applied = new Set<string>(
  (db.prepare("SELECT filename FROM _migrations").all() as { filename: string }[]).map((r) => r.filename)
);

const migrationsDir = __dirname;
const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

let count = 0;
for (const file of files) {
  if (applied.has(file)) {
    console.log(`  skip  ${file} (already applied)`);
    continue;
  }
  const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
  db.exec(sql);
  db.prepare("INSERT INTO _migrations (filename) VALUES (?)").run(file);
  console.log(`  apply ${file}`);
  count++;
}

console.log(`\nDone — ${count} migration(s) applied. DB: ${DB_PATH}`);
db.close();
