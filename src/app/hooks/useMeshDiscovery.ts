/**
 * useMeshDiscovery.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook that orchestrates real-device mesh discovery via the native
 * Capacitor plugin (MeshDiscoveryPlugin.kt on Android).
 *
 * Responsibilities
 * ────────────────
 *  1. On mount: registers this device with the Express backend so it
 *     appears on the map immediately (registerSelf).
 *  2. Starts BLE advertising + scanning + Wi-Fi Direct via the native plugin.
 *  3. Listens for peerDiscovered events and adds them to local state so
 *     the map can show them without waiting for the next 10-second poll.
 *  4. On unmount: calls stopDiscovery() and removes all event listeners.
 *
 * Usage
 * ─────
 *   const { status, peers, error } = useMeshDiscovery({
 *     nodeId:  "torres-phone",
 *     label:   "Torres",
 *     lat:     10.3148,
 *     lng:     123.8820,
 *     battery: 80,
 *     signal:  75,
 *   });
 *
 * On web (browser): all operations are no-ops — the hook returns
 * { status: null, peers: [], error: null, isNative: false }.
 *
 * On Android: the hook returns live discovery state and fires whenever
 * a new peer is found via BLE or Wi-Fi Direct.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import {
  MeshDiscovery,
  type DiscoveryStatus,
  type PeerDiscoveredEvent,
  type StartDiscoveryOptions,
} from "../plugins/MeshDiscoveryPlugin";
import type { DeviceLocation } from "./useDeviceLocation";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiscoveredPeer {
  nodeId:    string;
  label:     string;
  lat:       number;
  lng:       number;
  battery:   number;
  signal:    number;
  protocol:  string;
  firstSeen: number;   // Date.now() ms
  lastSeen:  number;
}

export interface UseMeshDiscoveryOptions {
  /** This device's node ID — should be stable (stored in localStorage). */
  nodeId:   string;
  /** Human-readable label for the map (e.g. "Torres"). */
  label:    string;
  /** Battery percentage 0–100. */
  battery:  number;
  /** RSSI-normalised signal 0–100. */
  signal:   number;
  /** Express backend base URL. */
  apiBase?: string;
  /** Heartbeat interval ms (default 5000). */
  heartbeatIntervalMs?: number;
  /** GPS location — lat/lng are passed to the plugin for self-registration. */
  deviceLocation?: DeviceLocation | null;
  /** Set false to disable discovery even on native (default: true). */
  enabled?: boolean;
}

export interface UseMeshDiscoveryResult {
  /** Current plugin status (null on web). */
  status:       DiscoveryStatus | null;
  /** All peers discovered in this session. */
  peers:        DiscoveredPeer[];
  /** Latest error message, if any. */
  error:        string | null;
  /** true only when running inside a Capacitor Android/iOS app. */
  isNative:     boolean;
  /** Manually trigger re-registration of self with the backend. */
  reRegister:   () => void;
}

// ── Stable node ID — persisted in localStorage so it survives app restarts ───
// DATA-4: use crypto.randomUUID() for guaranteed uniqueness across reinstalls

function getOrCreateNodeId(): string {
  const key = "meshnet_node_id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

function meshHeaders(): HeadersInit {
  const secret = import.meta.env.VITE_MESH_SECRET as string | undefined;
  return {
    "Content-Type": "application/json",
    ...(secret ? { "X-Mesh-Secret": secret } : {}),
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useMeshDiscovery({
  nodeId:              propNodeId,
  label,
  battery,
  signal,
  apiBase:             propApiBase,
  heartbeatIntervalMs = 5_000,
  deviceLocation,
  enabled              = true,
}: UseMeshDiscoveryOptions): UseMeshDiscoveryResult {

  const isNative = Capacitor.isNativePlatform();

  const nodeId = propNodeId || getOrCreateNodeId();
  const apiBase = propApiBase
    ?? (import.meta.env.VITE_API_BASE_URL as string | undefined)
    ?? "http://localhost:4000";

  const [status, setStatus]   = useState<DiscoveryStatus | null>(null);
  const [peers,  setPeers]    = useState<DiscoveredPeer[]>([]);
  const [error,  setError]    = useState<string | null>(null);

  // Keep a ref to the current GPS coords so the heartbeat always sends fresh data
  const latRef = useRef(deviceLocation?.lat ?? 0);
  const lngRef = useRef(deviceLocation?.lng ?? 0);
  useEffect(() => {
    latRef.current = deviceLocation?.lat ?? latRef.current;
    lngRef.current = deviceLocation?.lng ?? lngRef.current;
  }, [deviceLocation]);

  // ── Build options object ───────────────────────────────────────────────────

  const buildOptions = useCallback((): StartDiscoveryOptions => ({
    nodeId,
    label,
    lat:                latRef.current,
    lng:                lngRef.current,
    battery,
    signal,
    apiBase,
    heartbeatIntervalMs,
  }), [nodeId, label, battery, signal, apiBase, heartbeatIntervalMs]);

  // ── Register self with backend (runs on web too via fetch) ────────────────

  const reRegister = useCallback(() => {
    const lat = latRef.current;
    const lng = lngRef.current;

    if (isNative) {
      // On native: delegate to the plugin (it handles the HTTP call natively)
      MeshDiscovery.registerSelf({
        nodeId, label, lat, lng, battery, signal,
        device: "smartphone",
        role:   "peer",
      }).catch((e) => setError(String(e)));
    } else {
      // On web: call the backend directly so the node appears on the map
      fetch(`${apiBase}/api/mesh/register`, {
        method:  "POST",
        headers: meshHeaders(),
        body:    JSON.stringify({
          id:                nodeId,
          label,
          name:              label,
          device:            "smartphone",
          role:              "peer",
          signal,
          batteryPercentage: battery,
          bluetoothStatus:   false,
          wifiStatus:        false,
          lat,
          lng,
        }),
      }).catch(() => { /* offline — silently ignore */ });
    }
  }, [isNative, nodeId, label, battery, signal, apiBase]);

  // ── Main effect — start discovery, attach event listeners ─────────────────

  useEffect(() => {
    if (!enabled) return;

    let removed = false;
    const listeners: Array<{ remove: () => void }> = [];

    async function start() {
      try {
        // 1. Register this device so it appears on the map immediately
        reRegister();

        if (!isNative) return;   // BLE/Wi-Fi not available in browser

        // 2. Start native discovery
        const initialStatus = await MeshDiscovery.startDiscovery(buildOptions());
        if (!removed) setStatus(initialStatus);

        // 3. Listen for events from the Kotlin plugin
        const peerSub = await MeshDiscovery.addListener(
          "peerDiscovered",
          (event: PeerDiscoveredEvent) => {
            if (removed) return;
            setPeers((prev) => {
              const now = Date.now();
              const existing = prev.find((p) => p.nodeId === event.nodeId);
              if (existing) {
                return prev.map((p) =>
                  p.nodeId === event.nodeId
                    ? { ...p, ...event, lastSeen: now }
                    : p
                );
              }
              return [...prev, { ...event, firstSeen: now, lastSeen: now }];
            });
          }
        );
        listeners.push(peerSub);

        const statusSub = await MeshDiscovery.addListener(
          "statusChange",
          (evt) => { if (!removed) setStatus((s) => ({ ...(s ?? {} as DiscoveryStatus), ...evt })); }
        );
        listeners.push(statusSub);

        const errorSub = await MeshDiscovery.addListener(
          "error",
          (evt: { message: string }) => { if (!removed) setError(evt.message); }
        );
        listeners.push(errorSub);

      } catch (e) {
        if (!removed) setError(e instanceof Error ? e.message : String(e));
      }
    }

    void start();

    return () => {
      removed = true;
      listeners.forEach((l) => l.remove());
      if (isNative) {
        MeshDiscovery.stopDiscovery().catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, isNative]);

  return { status, peers, error, isNative, reRegister };
}
