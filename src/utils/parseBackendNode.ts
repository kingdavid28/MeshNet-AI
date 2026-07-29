/**
 * parseBackendNode.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Schema normalizer for parsing backend node data from the Express server.
 *
 * This module provides robust JSON parsing that normalizes different backend schemas
 * into a consistent internal format for the React application.
 */

export interface MeshNode {
  id: string;
  label: string;
  lat: number;
  lng: number;
  battery: number;
  signal: number;
  device: string;
  role: string;
  bluetoothStatus: boolean;
  wifiStatus: boolean;
  lastSeen?: Date;
}

/**
 * Parse and normalize backend node data from various schema formats.
 *
 * Handles different backend response formats:
 * - Standard format: {id, label, lat, lng, battery, signal, device, role, ...}
 * - Legacy format: {node_id, name, latitude, longitude, ...}
 * - Nested format: {data: {id, label, ...}}
 *
 * @param data - Raw JSON dictionary from backend
 * @returns MeshNode object if parsing succeeds, null otherwise
 *
 * @example
 * parseBackendNode({
 *   id: "node1",
 *   label: "Test",
 *   lat: 0.0,
 *   lng: 0.0,
 *   battery: 100,
 *   signal: 80,
 *   device: "smartphone",
 *   role: "peer"
 * })
 * // Returns: MeshNode object
 */
export function parseBackendNode(data: unknown): MeshNode | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }

  const obj = data as Record<string, unknown>;

  // Handle nested data format
  if ('data' in obj && typeof obj.data === 'object' && obj.data !== null) {
    return parseBackendNode(obj.data);
  }

  // Extract ID with fallback to legacy field names
  const nodeId =
    (obj.id as string) ||
    (obj.node_id as string) ||
    (obj.nodeId as string) ||
    (obj._id as string) ||
    '';

  if (!nodeId) {
    return null;
  }

  // Extract label with fallbacks
  const label =
    (obj.label as string) ||
    (obj.name as string) ||
    (obj.display_name as string) ||
    (obj.displayName as string) ||
    `Node ${nodeId.slice(0, 8)}`;

  // Extract coordinates with type conversion
  const lat = safeFloat(obj.lat ?? obj.latitude ?? 0);
  const lng = safeFloat(obj.lng ?? obj.longitude ?? 0);

  // Extract numeric fields with defaults
  const battery = safeInt(obj.battery ?? obj.batteryPercentage ?? 100, 0, 100);
  const signal = safeInt(obj.signal ?? obj.rssi ?? 80, 0, 100);

  // Extract device type
  const device =
    (obj.device as string) ||
    (obj.device_type as string) ||
    (obj.deviceType as string) ||
    'unknown';

  // Extract role
  const role = (obj.role as string) || (obj.type as string) || 'peer';

  // Extract boolean status fields
  const bluetoothStatus = safeBool(obj.bluetooth_status ?? obj.bluetoothStatus ?? false);
  const wifiStatus = safeBool(obj.wifi_status ?? obj.wifiStatus ?? false);

  // Parse timestamp if available
  let lastSeen: Date | undefined;
  const timestamp = obj.last_seen ?? obj.lastSeen;
  if (timestamp) {
    try {
      if (typeof timestamp === 'number') {
        lastSeen = new Date(timestamp * 1000);
      } else if (typeof timestamp === 'string') {
        lastSeen = new Date(timestamp);
      }
    } catch {
      // Invalid timestamp, ignore
    }
  }

  return {
    id: nodeId,
    label,
    lat,
    lng,
    battery,
    signal,
    device,
    role,
    bluetoothStatus,
    wifiStatus,
    lastSeen,
  };
}

/**
 * Parse a list of backend nodes or a single node.
 *
 * @param data - List of dictionaries or single dictionary
 * @returns List of MeshNode objects
 */
export function parseBackendNodes(data: unknown): MeshNode[] {
  if (!data) {
    return [];
  }

  if (Array.isArray(data)) {
    const nodes: MeshNode[] = [];
    for (const item of data) {
      const node = parseBackendNode(item);
      if (node) {
        nodes.push(node);
      }
    }
    return nodes;
  }

  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;

    // Check if it's a list wrapper
    if ('nodes' in obj && Array.isArray(obj.nodes)) {
      return parseBackendNodes(obj.nodes);
    }
    if ('data' in obj && Array.isArray(obj.data)) {
      return parseBackendNodes(obj.data);
    }

    // Single node
    const node = parseBackendNode(data);
    return node ? [node] : [];
  }

  return [];
}

/**
 * Safely convert value to float, returning 0.0 on failure.
 */
function safeFloat(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * Safely convert value to int with clamping.
 */
function safeInt(value: unknown, min: number = 0, max: number = 100): number {
  if (typeof value === 'number') {
    return Math.max(min, Math.min(max, Math.floor(value)));
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      return min;
    }
    return Math.max(min, Math.min(max, parsed));
  }
  return min;
}

/**
 * Safely convert value to bool.
 */
function safeBool(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  }
  return false;
}
