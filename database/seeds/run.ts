#!/usr/bin/env ts-node
// Loads seed data into the SQLite DB for local development.
// Usage: npx ts-node seeds/run.ts
// Safe to re-run — uses INSERT OR REPLACE.

import Database from "better-sqlite3";
import path from "path";
import nodes from "./nodes.json";
import alerts from "./alerts.json";

const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, "..", "meshnet.db");
console.log(`Seeding database at: ${DB_PATH}`);
const db = new Database(DB_PATH);
db.pragma("foreign_keys = ON");

// ── Nodes ──────────────────────────────────────────────────────────────────────
const insertNode = db.prepare(`
  INSERT OR REPLACE INTO nodes (id, label, name, device, role, signal, battery_percentage, bluetooth_status, os, lat, lng)
  VALUES (@id, @label, @name, @device, @role, @signal, @battery_percentage, @bluetooth_status, @os, @lat, @lng)
`);
db.transaction((rows: typeof nodes) => rows.forEach((r) => insertNode.run(r)))(nodes);
console.log(`  seeded ${nodes.length} nodes`);

// ── Edges ──────────────────────────────────────────────────────────────────────
// Generate realistic mesh connections based on proximity and signal strength
const edges: Array<{node_a: string, node_b: string, protocol: string, quality: number}> = [];

// Connect each node to 2-4 nearby nodes to create a realistic mesh
for (let i = 0; i < nodes.length; i++) {
  const nodeA = nodes[i];
  const connections = Math.floor(Math.random() * 3) + 2; // 2-4 connections per node
  
  // Find closest nodes based on coordinate distance
  const distances = nodes
    .map((nodeB, idx) => {
      if (idx === i) return { idx, dist: Infinity };
      const dist = Math.sqrt(
        Math.pow(nodeA.lat - nodeB.lat, 2) + 
        Math.pow(nodeA.lng - nodeB.lng, 2)
      );
      return { idx, dist };
    })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, connections + 1); // +1 to account for self
  
  for (const { idx } of distances) {
    if (idx === i) continue;
    const nodeB = nodes[idx];
    
    // Check if edge already exists (avoid duplicates)
    const exists = edges.some(
      e => (e.node_a === nodeA.id && e.node_b === nodeB.id) ||
           (e.node_a === nodeB.id && e.node_b === nodeA.id)
    );
    
    if (!exists) {
      const protocol = Math.random() > 0.4 ? "wifi" : "bluetooth";
      const quality = Math.floor(Math.random() * 40) + 60; // 60-100 quality
      edges.push({
        node_a: nodeA.id,
        node_b: nodeB.id,
        protocol,
        quality
      });
    }
  }
}
const insertEdge = db.prepare(`
  INSERT OR REPLACE INTO edges (node_a, node_b, protocol, quality)
  VALUES (@node_a, @node_b, @protocol, @quality)
`);
db.transaction((rows: typeof edges) => rows.forEach((r) => insertEdge.run(r)))(edges);
console.log(`  seeded ${edges.length} edges`);

// ── Alerts ─────────────────────────────────────────────────────────────────────
const insertAlert = db.prepare(`
  INSERT OR REPLACE INTO alerts (id, type, severity, from_node_id, from_label, message, lat, lng, ttl, acknowledged)
  VALUES (@id, @type, @severity, @from_node_id, @from_label, @message, @lat, @lng, @ttl, @acknowledged)
`);
db.transaction((rows: typeof alerts) => rows.forEach((r) => insertAlert.run(r)))(alerts);
console.log(`  seeded ${alerts.length} alerts`);

console.log(`\nDone. DB: ${DB_PATH}`);
db.close();
