/**
 * MeshDiscoveryPlugin.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TypeScript bridge between the JavaScript app and the native Kotlin plugin.
 *
 * On Android:   delegates to MeshDiscoveryPlugin.kt via the Capacitor bridge.
 * On web / iOS: returns safe no-op stubs so the app still compiles and runs
 *               in a browser (development) without crashing.
 *
 * Import pattern:
 *   import { MeshDiscovery } from "./plugins/MeshDiscoveryPlugin";
 *   await MeshDiscovery.startDiscovery({ nodeId: "my-node", ... });
 */

import { registerPlugin, type Plugin } from "@capacitor/core";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StartDiscoveryOptions {
  /** This device's node ID — must be unique on the mesh. */
  nodeId:              string;
  /** Human-readable label shown on the map (e.g. "Torres"). */
  label:               string;
  /** Current GPS latitude. */
  lat:                 number;
  /** Current GPS longitude. */
  lng:                 number;
  /** Current battery percentage 0–100. */
  battery:             number;
  /** RSSI-normalised signal 0–100. */
  signal:              number;
  /** Express backend base URL reachable from this device. */
  apiBase:             string;
  /** Heartbeat interval in milliseconds (default: 5000). */
  heartbeatIntervalMs?: number;
}

export interface RegisterSelfOptions {
  nodeId:  string;
  label:   string;
  lat:     number;
  lng:     number;
  battery: number;
  signal:  number;
  device:  "smartphone" | "laptop";
  role:    "peer" | "relay";
}

export interface DiscoveryStatus {
  /** true when BLE scanning is active. */
  scanning:    boolean;
  /** true when BLE advertising is active. */
  advertising: boolean;
  /** true when Wi-Fi Direct peer group is active. */
  wifiDirect:  boolean;
  /** Number of unique peers discovered since startDiscovery() was called. */
  peersFound:  number;
  /** This device's own node ID. */
  selfNodeId:  string;
}

export interface PeerDiscoveredEvent {
  nodeId:   string;
  label:    string;
  lat:      number;
  lng:      number;
  battery:  number;
  signal:   number;
  /** "bluetooth" | "wifi" — which radio detected this peer */
  protocol: string;
}

export interface WifiGroupFormedEvent {
  groupOwnerAddress: string;
  isGroupOwner:      boolean;
  ssid:              string;
}

export interface StatusChangeEvent {
  scanning:    boolean;
  advertising: boolean;
  wifiDirect:  boolean;
}

export interface ErrorEvent {
  message: string;
}

// ── Plugin interface ──────────────────────────────────────────────────────────

export interface MeshDiscoveryPlugin extends Plugin {
  /** Start BLE advertising + scanning + Wi-Fi Direct + heartbeat loop. */
  startDiscovery(options: StartDiscoveryOptions): Promise<DiscoveryStatus>;
  /** Stop all discovery, release all resources. */
  stopDiscovery(): Promise<void>;
  /** Return current discovery status without changing state. */
  getStatus(): Promise<DiscoveryStatus>;
  /** POST this device's own record to the Express backend immediately. */
  registerSelf(options: RegisterSelfOptions): Promise<void>;
}

// ── Web stub — used when running in a browser (no native layer) ──────────────

const WebMeshDiscovery: MeshDiscoveryPlugin = {
  async startDiscovery(): Promise<DiscoveryStatus> {
    console.info("[MeshDiscovery] Web stub — native BLE/Wi-Fi not available in browser");
    return { scanning: false, advertising: false, wifiDirect: false, peersFound: 0, selfNodeId: "" };
  },
  async stopDiscovery(): Promise<void> {},
  async getStatus(): Promise<DiscoveryStatus> {
    return { scanning: false, advertising: false, wifiDirect: false, peersFound: 0, selfNodeId: "" };
  },
  async registerSelf(): Promise<void> {
    console.info("[MeshDiscovery] Web stub — registerSelf is a no-op in browser");
  },
  addListener() { return Promise.resolve({ remove: () => Promise.resolve() }); },
  removeAllListeners() { return Promise.resolve(); },
};

// ── Register with Capacitor — native on Android, stub on web ─────────────────

export const MeshDiscovery = registerPlugin<MeshDiscoveryPlugin>(
  "MeshDiscovery",
  { web: () => Promise.resolve(WebMeshDiscovery) }
);
