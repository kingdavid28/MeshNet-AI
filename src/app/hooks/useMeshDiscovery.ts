/**
 * useMeshDiscovery.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook that orchestrates real-device mesh discovery via the native
 * Capacitor plugin (MeshDiscoveryPlugin.kt on Android).
 *
 * This hook now uses a singleton service (meshDiscoveryService) to manage
 * discovery state outside the React component tree, preventing issues with
 * React Strict Mode causing multiple mount/unmount cycles.
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
 */

import { useEffect, useRef, useState } from "react";
import { meshDiscoveryService } from "../services/meshDiscoveryService";
import type { DeviceLocation } from "./useDeviceLocation";
import type { DiscoveryStatus } from "../plugins/MeshDiscoveryPlugin";

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
  reRegister:   () => Promise<void>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useMeshDiscovery({
  nodeId = 'node-1',
  label = 'MeshNet Device',
  battery = 100,
  signal = 80,
  apiBase = '',
  heartbeatIntervalMs = 5_000,
  deviceLocation,
  enabled = true,
}: UseMeshDiscoveryOptions): UseMeshDiscoveryResult {
  // Track if this is the first mount to initialize the service
  const isFirstMount = useRef(true);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Local state mirrors service state - service is single source of truth
  const [state, setState] = useState(() => meshDiscoveryService.getState());

  useEffect(() => {
    // Initialize service on first mount
    if (isFirstMount.current) {
      isFirstMount.current = false;

      if (enabled) {
        meshDiscoveryService.start({
          nodeId,
          label,
          battery,
          signal,
          apiBase,
          heartbeatIntervalMs,
          deviceLocation: deviceLocation?.lat && deviceLocation?.lng
            ? { lat: deviceLocation.lat, lng: deviceLocation.lng }
            : undefined,
        }).catch((error) => {
          console.error('[useMeshDiscovery] Failed to start discovery:', error);
        });
      }
    }

    // Subscribe to service state changes
    unsubscribeRef.current = meshDiscoveryService.subscribe((newState) => {
      setState(newState);
    });

    // Cleanup on unmount
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [nodeId, label, battery, signal, apiBase, heartbeatIntervalMs, deviceLocation, enabled]);

  const reRegister = async () => {
    await meshDiscoveryService.reRegister();
  };

  return {
    status: state.status,
    peers: state.peers,
    error: state.error,
    isNative: state.isNative,
    reRegister,
  };
}
