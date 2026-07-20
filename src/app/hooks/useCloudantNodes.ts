/**
 * useCloudantNodes — Mesh node data hook
 * src/app/hooks/useCloudantNodes.ts
 *
 * SEC-1 fix: Cloudant credentials are NEVER sent to the browser.
 * The frontend calls the backend proxy at GET /api/cloudant/nodes which
 * handles authentication server-side.
 *
 * Priority chain:
 *   1. Backend Cloudant proxy   → /api/cloudant/nodes
 *   2. Local Express topology   → /api/mesh/topology
 *   3. Seed fallback            → hardcoded Cebu City nodes (map always renders)
 *
 * The X-Mesh-Secret header is read from VITE_MESH_SECRET (baked at build
 * time into the bundle). This is a shared-LAN secret, not a user credential —
 * it prevents random devices on the network from hitting the API, not
 * browser-based attackers who could read the bundle anyway. For higher
 * security, rotate to short-lived JWTs issued after a QR-code pairing.
 */

import { useState, useEffect, useCallback } from "react";
import { getApiBase, getMeshSecret } from "../../utils/env";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProtocolActive = "bluetooth" | "wifi" | "both" | "none";

export interface CloudantNode {
  node_id:            string;
  label:              string;
  latitude:           number | null;
  longitude:          number | null;
  battery_percentage: number;
  bluetooth_status:   boolean;
  wifi_status:        boolean;
  protocol_active:    ProtocolActive;
  signal:             number;
  device:             "smartphone" | "laptop";
  role:               "peer" | "relay";
  last_seen:          string;
}

function deriveProtocol(ble: boolean, wifi: boolean): ProtocolActive {
  if (ble && wifi) return "both";
  if (ble)         return "bluetooth";
  if (wifi)        return "wifi";
  return "none";
}

interface UseCloudantNodesResult {
  nodes:   CloudantNode[];
  loading: boolean;
  error:   string | null;
  source:  "cloudant" | "local-backend" | "seed";
  refresh: () => void;
}

// ─── Seed fallback generator — generates nodes around device location ───────────

function generateSeedNodes(centerLat: number | null, centerLng: number | null): CloudantNode[] {
  // Default to Cebu City if no location available
  const lat = centerLat ?? 10.3157;
  const lng = centerLng ?? 123.8854;

  // Generate nodes in a ~1km radius around the center point
  const offset = 0.01; // ~1km at equator

  return [
    {
      node_id: "cmd-hq",     label: "CMD·HQ",  latitude: lat, longitude: lng,
      battery_percentage: 82,  bluetooth_status: true,  wifi_status: true,
      protocol_active: "both",      signal: 91, device: "laptop",     role: "relay",
      last_seen: new Date().toISOString(),
    },
    {
      node_id: "ramos-phone", label: "Ramos",  latitude: lat + offset * 0.2, longitude: lng - offset * 0.2,
      battery_percentage: 67,  bluetooth_status: true,  wifi_status: true,
      protocol_active: "both",      signal: 87, device: "smartphone", role: "relay",
      last_seen: new Date().toISOString(),
    },
    {
      node_id: "chen-laptop", label: "Chen",   latitude: lat - offset * 0.2, longitude: lng + offset * 0.3,
      battery_percentage: 91,  bluetooth_status: false, wifi_status: true,
      protocol_active: "wifi",      signal: 72, device: "laptop",     role: "relay",
      last_seen: new Date().toISOString(),
    },
    {
      node_id: "med-01",      label: "MED·01", latitude: lat + offset * 0.1, longitude: lng + offset * 0.1,
      battery_percentage: 55,  bluetooth_status: true,  wifi_status: false,
      protocol_active: "bluetooth", signal: 91, device: "smartphone", role: "peer",
      last_seen: new Date().toISOString(),
    },
    {
      node_id: "torres-phone", label: "Torres", latitude: lat - offset * 0.1, longitude: lng - offset * 0.4,
      battery_percentage: 38,  bluetooth_status: false, wifi_status: false,
      protocol_active: "none",      signal: 64, device: "smartphone", role: "peer",
      last_seen: new Date().toISOString(),
    },
  ];
}

// ─── Shared fetch helper ──────────────────────────────────────────────────────

function meshHeaders(): HeadersInit {
  const secret = getMeshSecret();
  return secret ? { "Content-Type": "application/json", "X-Mesh-Secret": secret } : {};
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchFromCloudantProxy(apiBase: string): Promise<CloudantNode[]> {
  const res = await fetch(`${apiBase}/api/cloudant/nodes`, {
    headers: meshHeaders(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Cloudant proxy HTTP ${res.status}`);
  const data = await res.json() as { nodes: CloudantNode[] };
  if (!Array.isArray(data.nodes)) throw new Error("Unexpected response shape");
  return data.nodes;
}

async function fetchFromLocalBackend(apiBase: string): Promise<CloudantNode[]> {
  const res = await fetch(`${apiBase}/api/mesh/topology`, {
    headers: meshHeaders(),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Backend HTTP ${res.status}`);

  const data = await res.json() as {
    nodes: Array<{
      id: string; label: string; lat?: number; lng?: number;
      battery?: number; signal: number; device: string; role: string;
      lastSeen: string; bluetoothStatus?: boolean; wifiStatus?: boolean;
      protocol?: string[];
    }>;
  };

  return data.nodes.map((n) => {
    const ble  = Array.isArray(n.protocol)
      ? n.protocol.includes("bluetooth")
      : Boolean(n.bluetoothStatus ?? true);
    const wifi = Array.isArray(n.protocol)
      ? n.protocol.includes("wifi")
      : Boolean(n.wifiStatus ?? false);
    return {
      node_id:            n.id,
      label:              n.label,
      latitude:           n.lat  ?? null,
      longitude:          n.lng  ?? null,
      battery_percentage: n.battery ?? 80,
      bluetooth_status:   ble,
      wifi_status:        wifi,
      protocol_active:    deriveProtocol(ble, wifi),
      signal:             n.signal,
      device:             (n.device as "smartphone" | "laptop") ?? "smartphone",
      role:               (n.role as "peer" | "relay") ?? "peer",
      last_seen:          n.lastSeen,
    };
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCloudantNodes(
  pollIntervalMs = 10_000,
  deviceLat: number | null = null,
  deviceLng: number | null = null
): UseCloudantNodesResult {
  const [nodes,   setNodes]   = useState<CloudantNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [source,  setSource]  = useState<UseCloudantNodesResult["source"]>("seed");

  const apiBase = getApiBase();

  const load = useCallback(async () => {
    try {
      // Priority 1 — backend Cloudant proxy (Cloudant credentials stay server-side)
      try {
        const data = await fetchFromCloudantProxy(apiBase);
        // If Cloudant returns empty nodes, fall through to local topology
        if (data.length === 0) {
          throw new Error("Cloudant not configured or empty");
        }
        setNodes(data);
        setSource("cloudant");
        setError(null);
        return;
      } catch {
        // Cloudant not configured on backend — fall through to local topology
      }

      // Priority 2 — local Express topology (SQLite)
      const data = await fetchFromLocalBackend(apiBase);
      setNodes(data);
      setSource("local-backend");
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      // Priority 3 — seed fallback so the map always renders something
      const seedNodes = generateSeedNodes(deviceLat, deviceLng);
      setNodes((prev) => (prev.length === 0 ? seedNodes : prev));
      setSource((prev) => (prev === "seed" ? "seed" : prev));
    } finally {
      setLoading(false);
    }
  }, [apiBase, deviceLat, deviceLng]);

  useEffect(() => {
    load();
    const id = setInterval(load, pollIntervalMs);
    return () => clearInterval(id);
  }, [load, pollIntervalMs]);

  return { nodes, loading, error, source, refresh: load };
}
