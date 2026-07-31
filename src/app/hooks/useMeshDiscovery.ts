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

import { useState, useEffect } from "react";
import { meshDiscoveryService } from "../services/meshDiscoveryService";
import type { DeviceLocation } from "./useDeviceLocation";
import type { DiscoveryStatus } from "../plugins/MeshDiscoveryPlugin";

// Module-level initialization - runs once when module loads
let moduleInitialized = false;
let moduleUnsubscribe: (() => void) | null = null;
let forceUpdateRef: { current: (() => void) | null } = { current: null };

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

  console.log('[useMeshDiscovery] Hook function called', JSON.stringify({ nodeId, label, enabled }));
  console.log('[useMeshDiscovery] About to call useState');

  // Force update trigger
  const [, setTick] = useState(0);
  const forceUpdate = () => setTick(t => t + 1);

  // Read state directly from service
  const serviceState = meshDiscoveryService.getState();
  const [status, setStatus] = useState<DiscoveryStatus | null>(serviceState.status);
  const [peers, setPeers] = useState<DiscoveredPeer[]>(serviceState.peers);
  const [error, setError] = useState<string | null>(serviceState.error);
  const [isNative, setIsNative] = useState(serviceState.isNative);

  console.log('[useMeshDiscovery] useState called');

  // Module-level initialization - runs once when module loads
  if (!moduleInitialized) {
    console.log('[useMeshDiscovery] Module-level initialization');
    moduleInitialized = true;
    
    moduleUnsubscribe = meshDiscoveryService.subscribe((state) => {
      console.log('[useMeshDiscovery] State update (module-level)', state);
      // Trigger force update on current component
      if (forceUpdateRef.current) {
        forceUpdateRef.current();
      }
    });

    if (enabled) {
      console.log('[useMeshDiscovery] Starting discovery service (module-level)');
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
      }).catch(e => {
        console.error('[useMeshDiscovery] Start failed:', e);
      });
    } else {
      console.log('[useMeshDiscovery] Discovery disabled (module-level)');
    }
  }

  // Update force update ref for this component
  useEffect(() => {
    forceUpdateRef.current = forceUpdate;
    return () => {
      forceUpdateRef.current = null;
    };
  }, [forceUpdate]);

  // Sync local state with service state on force update
  useEffect(() => {
    const newState = meshDiscoveryService.getState();
    setStatus(newState.status);
    setPeers(newState.peers);
    setError(newState.error);
    setIsNative(newState.isNative);
  }, []); // Empty deps - runs on every render due to force update

  const reRegister = async () => {
    await meshDiscoveryService.reRegister();
  };

  console.log('[useMeshDiscovery] Hook returning result', { status, peers, error, isNative });
  return { status, peers, error, isNative, reRegister };
}
