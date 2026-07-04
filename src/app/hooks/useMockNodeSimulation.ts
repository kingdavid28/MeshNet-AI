/**
 * useMockNodeSimulation
 * ─────────────────────────────────────────────────────────────────────────────
 * Simulates live mesh-node coordinate + signal changes every `tickMs` (default
 * 5 000 ms) without hitting any network endpoint.
 *
 * Performance design
 * ──────────────────
 * 1. State is a single `CloudantNode[]` reference.  The interval callback
 *    produces a *new array* only when actual values change, preventing
 *    React.memo / useMemo dependencies from re-running on a no-op tick.
 *
 * 2. Node positions drift by a tiny random Gaussian jitter (≤ ±0.0003°,
 *    ≈ 33 m).  Leaflet's imperative `marker.setLatLng` handles this in O(n)
 *    DOM mutations — zero React reconciliation cost for the map itself.
 *
 * 3. The tick function is kept outside the hook closure so it never becomes
 *    a new function reference between renders, which would cause the interval
 *    to be cleared and reset unnecessarily.
 *
 * 4. The interval is cleared on unmount via the returned cleanup in useEffect.
 *
 * Usage
 * ─────
 *   const { nodes, tick, isPaused, pause, resume } = useMockNodeSimulation();
 *
 *   // Pass `nodes` directly to NodeMapCanvas — it is a stable reference
 *   // between ticks and only changes identity every `tickMs` ms.
 *
 * The hook is intentionally self-contained: it owns the seed data so it works
 * in complete isolation from the backend, Cloudant, and device GPS.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { CloudantNode } from "./useCloudantNodes";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SimulationStats {
  /** Total number of ticks fired since mount */
  tickCount:    number;
  /** Timestamp (Date.now()) of the most recent tick */
  lastTickAt:   number;
  /** Milliseconds the last tick computation took (excluding React render) */
  lastTickMs:   number;
}

export interface UseMockNodeSimulationResult {
  nodes:   CloudantNode[];
  stats:   SimulationStats;
  isPaused: boolean;
  pause:   () => void;
  resume:  () => void;
}

// ─── Seed nodes — Cebu City cluster ──────────────────────────────────────────
// Five nodes spread ≈ 200–500 m around Plaza Independencia.

const SEED: CloudantNode[] = [
  {
    node_id: "cmd-hq",      label: "CMD·HQ",  latitude: 10.3157, longitude: 123.8854,
    battery_percentage: 82, bluetooth_status: true,  wifi_status: true,
    protocol_active: "both",      signal: 91, device: "laptop",     role: "relay",
    last_seen: new Date().toISOString(),
  },
  {
    node_id: "ramos-phone", label: "Ramos",   latitude: 10.3175, longitude: 123.8837,
    battery_percentage: 67, bluetooth_status: true,  wifi_status: true,
    protocol_active: "both",      signal: 87, device: "smartphone", role: "relay",
    last_seen: new Date().toISOString(),
  },
  {
    node_id: "chen-laptop", label: "Chen",    latitude: 10.3140, longitude: 123.8878,
    battery_percentage: 91, bluetooth_status: false, wifi_status: true,
    protocol_active: "wifi",      signal: 72, device: "laptop",     role: "relay",
    last_seen: new Date().toISOString(),
  },
  {
    node_id: "med-01",      label: "MED·01",  latitude: 10.3162, longitude: 123.8865,
    battery_percentage: 55, bluetooth_status: true,  wifi_status: false,
    protocol_active: "bluetooth", signal: 91, device: "smartphone", role: "peer",
    last_seen: new Date().toISOString(),
  },
  {
    node_id: "torres-phone", label: "Torres", latitude: 10.3148, longitude: 123.8820,
    battery_percentage: 38, bluetooth_status: false, wifi_status: false,
    protocol_active: "none",      signal: 64, device: "smartphone", role: "peer",
    last_seen: new Date().toISOString(),
  },
];

// ─── Deterministic seeded helpers ─────────────────────────────────────────────

/** Gaussian jitter via Box-Muller transform — zero mean, ~σ = 0.0001° (≈ 11 m). */
function gaussianJitter(sigma = 0.0001): number {
  const u1 = Math.random();
  const u2 = Math.random();
  // Box-Muller: u1 must be > 0 to avoid log(0)
  return sigma * Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
}

/** Clamp value to [min, max]. */
function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Derive protocol_active from two booleans. */
function deriveProtocol(ble: boolean, wifi: boolean): CloudantNode["protocol_active"] {
  if (ble && wifi) return "both";
  if (ble)         return "bluetooth";
  if (wifi)        return "wifi";
  return "none";
}

// ─── Tick function — pure, no closures over hook state ───────────────────────
// Defined outside the hook so its identity is stable across renders.
// Receives the previous node array and returns a NEW array only when at least
// one value changed.  If the dice roll produced no meaningful delta for all
// nodes it returns the same reference — React bails out of a re-render.

function applyTick(prev: CloudantNode[]): CloudantNode[] {
  let changed = false;

  const next = prev.map((node): CloudantNode => {
    // ── Coordinate drift — tiny Gaussian jitter ──────────────────────────────
    const dLat = gaussianJitter(0.0001);
    const dLng = gaussianJitter(0.0001);

    // ── Signal random walk ±3 ────────────────────────────────────────────────
    const dSignal  = Math.round((Math.random() - 0.5) * 6);
    const signal   = clamp(node.signal + dSignal, 0, 100);

    // ── Battery slow drain (−0.1 % per tick on average) ─────────────────────
    const battery  = clamp(node.battery_percentage - Math.random() * 0.2, 0, 100);

    // ── Radio flicker: 3 % chance of toggling BLE or Wi-Fi ──────────────────
    const ble  = Math.random() < 0.03 ? !node.bluetooth_status : node.bluetooth_status;
    const wifi = Math.random() < 0.03 ? !node.wifi_status      : node.wifi_status;

    const newLat  = node.latitude  + dLat;
    const newLng  = node.longitude + dLng;
    const newProto = deriveProtocol(ble, wifi);

    // Bail out early if nothing meaningful changed (avoids object allocation)
    const coordChanged  = Math.abs(dLat) > 1e-7 || Math.abs(dLng) > 1e-7;
    const signalChanged = signal !== node.signal;
    const batteryChanged = Math.abs(battery - node.battery_percentage) > 0.05;
    const radioChanged  = ble !== node.bluetooth_status || wifi !== node.wifi_status;

    if (!coordChanged && !signalChanged && !batteryChanged && !radioChanged) {
      return node; // same reference — no React prop change
    }

    changed = true;
    return {
      ...node,
      latitude:           newLat,
      longitude:          newLng,
      signal:             signal,
      battery_percentage: Math.round(battery * 10) / 10,
      bluetooth_status:   ble,
      wifi_status:        wifi,
      protocol_active:    newProto,
      last_seen:          new Date().toISOString(),
    };
  });

  // Return the original array reference if nothing changed so React.memo
  // components (including NodeMapCanvas) skip the re-render entirely.
  return changed ? next : prev;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMockNodeSimulation(tickMs = 5_000): UseMockNodeSimulationResult {
  const [nodes,    setNodes]    = useState<CloudantNode[]>(SEED);
  const [isPaused, setIsPaused] = useState(false);
  const [stats,    setStats]    = useState<SimulationStats>({
    tickCount: 0, lastTickAt: 0, lastTickMs: 0,
  });

  // Refs avoid stale closures in the interval callback
  const isPausedRef = useRef(isPaused);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

  const tick = useCallback(() => {
    if (isPausedRef.current) return;

    const t0 = performance.now();

    setNodes((prev) => applyTick(prev));

    const elapsed = performance.now() - t0;
    setStats((s) => ({
      tickCount:  s.tickCount + 1,
      lastTickAt: Date.now(),
      lastTickMs: Math.round(elapsed * 100) / 100,
    }));
  }, []); // stable — no dependencies, uses refs + pure applyTick

  useEffect(() => {
    const id = setInterval(tick, tickMs);
    return () => clearInterval(id);
  }, [tick, tickMs]);

  const pause  = useCallback(() => setIsPaused(true),  []);
  const resume = useCallback(() => setIsPaused(false), []);

  return { nodes, stats, isPaused, pause, resume };
}
