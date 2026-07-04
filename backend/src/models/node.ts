export type DeviceKind = "smartphone" | "laptop";
export type NodeRole   = "peer" | "relay";
export type Protocol   = "wifi" | "bluetooth";

/**
 * The active radio protocol(s) on a node.
 *   "bluetooth" — BLE only
 *   "wifi"      — Wi-Fi Direct / hotspot only
 *   "both"      — BLE + Wi-Fi active simultaneously (highest capability)
 *   "none"      — all radios off / unreachable
 */
export type ProtocolActive = "bluetooth" | "wifi" | "both" | "none";

export interface MeshNode {
  id:                string;
  label:             string;
  name:              string;
  device:            DeviceKind;
  role:              NodeRole;
  signal:            number;           // 0–100 RSSI-normalised
  lastSeen:          string;           // ISO timestamp
  /** 0–100 — used to colour battery arc on the map and warn rescue teams */
  batteryPercentage: number;
  /** true = BLE scanning active → shown as BLE indicator on map */
  bluetoothStatus:   boolean;
  /** true = Wi-Fi Direct / hotspot active → shown as Wi-Fi indicator on map */
  wifiStatus:        boolean;
  /**
   * Derived from bluetoothStatus + wifiStatus:
   *   both      → both radios on  (blue+green dot)
   *   bluetooth → BLE only        (green dot)
   *   wifi      → Wi-Fi only      (blue dot)
   *   none      → all radios off  (grey dot)
   */
  protocolActive:    ProtocolActive;
  os?:               string;
  lat?:              number;
  lng?:              number;
}

export interface MeshEdge {
  a:        string;    // node id
  b:        string;    // node id
  protocol: Protocol;
  quality:  number;    // 0–100
}

export interface MeshTopology {
  nodes:     MeshNode[];
  edges:     MeshEdge[];
  updatedAt: string;
}
