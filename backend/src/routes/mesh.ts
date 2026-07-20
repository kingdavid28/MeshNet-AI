import { Router, Request, Response } from "express";
import type { MeshNode, MeshEdge, MeshTopology, ProtocolActive } from "../models/node";
import { nodeStmts, edgeStmts, type NodeRow, type EdgeRow } from "../db";

export const meshRouter = Router();

// Public router — mounted before auth middleware. Contains only endpoints
// that victim phones must reach without a mesh secret.
export const publicMeshRouter = Router();

// ─── Helper: derive protocolActive from boolean flags ─────────────────────────

function deriveProtocol(ble: boolean, wifi: boolean): ProtocolActive {
  if (ble && wifi) return "both";
  if (ble)         return "bluetooth";
  if (wifi)        return "wifi";
  return "none";
}

// ─── Helper: NodeRow → MeshNode ───────────────────────────────────────────────

function rowToNode(r: NodeRow): MeshNode {
  const ble  = Boolean(r.bluetooth_status);
  const wifi = Boolean(r.wifi_status);
  return {
    id:                r.id,
    label:             r.label,
    name:              r.name,
    device:            r.device,
    role:              r.role,
    signal:            r.signal,
    batteryPercentage: r.battery_percentage,
    bluetoothStatus:   ble,
    wifiStatus:        wifi,
    protocolActive:    deriveProtocol(ble, wifi),
    lastSeen:          r.last_seen,
    os:                r.os ?? undefined,
    lat:               r.lat ?? undefined,
    lng:               r.lng ?? undefined,
  };
}

function rowToEdge(r: EdgeRow): MeshEdge {
  return { a: r.node_a, b: r.node_b, protocol: r.protocol, quality: r.quality };
}

// ─── GET /api/mesh/nodes ───────────────────────────────────────────────────────

meshRouter.get("/nodes", (_req: Request, res: Response) => {
  const nodes = nodeStmts.getAll.all().map(rowToNode);
  res.json({ nodes });
});

// ─── GET /api/mesh/topology ───────────────────────────────────────────────────

meshRouter.get("/topology", (_req: Request, res: Response) => {
  const nodes    = nodeStmts.getAll.all().map(rowToNode);
  const edges    = edgeStmts.getAll.all().map(rowToEdge);
  const topology: MeshTopology = { nodes, edges, updatedAt: new Date().toISOString() };
  console.log(`[topology] Returning ${nodes.length} nodes, ${edges.length} edges`);
  res.json(topology);
});

// ─── GET /api/mesh/join ───────────────────────────────────────────────────────
// Serve the join page for captive portal flow
// NOTE: This endpoint is PUBLIC - no authentication required
// This is the entry point for devices joining the mesh network

// Register on both routers so /api/mesh/join works whether auth is applied or not.
publicMeshRouter.get("/join", (req: Request, res: Response) => {
  joinHandler(req, res);
});
meshRouter.get("/join", (req: Request, res: Response) => {
  joinHandler(req, res);
});

function joinHandler(req: Request, res: Response) {
  // Derive gateway IP from the incoming request so this works on any hotspot subnet.
  // req.socket.localAddress is the interface IP the server accepted the connection on.
  const gatewayIp = req.socket.localAddress?.replace("::ffff:", "") ?? "192.168.137.1"; // NOSONAR
  const clientIp = req.socket.remoteAddress?.replace("::ffff:", "") ?? "127.0.0.1";

  // Only redirect if request is coming from a hotspot client (not localhost)
  // This prevents redirect loops when called from the desktop app itself
  if (clientIp === "127.0.0.1" || clientIp === "::1" || clientIp === "localhost") {
    // Called from localhost - serve the simple registration form
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MeshNet - Join Network</title>
  <style>
    body { font-family: system-ui; max-width: 500px; margin: 50px auto; padding: 20px; }
    h1 { color: #f97316; }
    .info { background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0; }
  </style>
</head>
<body>
  <h1>MeshNet Emergency Network</h1>
  <div class="info">
    <p><strong>Join from a device:</strong></p>
    <ol>
      <li>Connect to the MeshNet Wi-Fi hotspot</li>
      <li>Open your browser - captive portal will redirect automatically</li>
      <li>Or visit: <a href="http://${gatewayIp}:8080/">http://${gatewayIp}:8080/</a></li>
    </ol>
  </div>
  <p>This endpoint is for captive portal redirection. Access the PWA directly at the URL above.</p>
</body>
</html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
    return;
  }

  // Serve the full PWA from captive portal - redirect to main app
  // This allows users to install the PWA directly from the captive portal
  res.redirect(`http://${gatewayIp}:8080/`);
}

// ─── GET /api/mesh/discover ─────────────────────────────────────────────────────
// Discovery endpoint for PWA to find backend on local network
// Returns backend info including API base URL
publicMeshRouter.get("/discover", (req: Request, res: Response) => {
  const gatewayIp = req.socket.localAddress?.replace("::ffff:", "") ?? "192.168.137.1"; // NOSONAR
  res.json({
    meshnet: true,
    version: "2.4.0",
    apiBase: `http://${gatewayIp}:4000`,
    webBase: `http://${gatewayIp}:8080`,
    capabilities: ["wifi-hotspot", "captive-portal", "https"],
  });
});
meshRouter.get("/discover", (req: Request, res: Response) => {
  const gatewayIp = req.socket.localAddress?.replace("::ffff:", "") ?? "192.168.137.1"; // NOSONAR
  res.json({
    meshnet: true,
    version: "2.4.0",
    apiBase: `http://${gatewayIp}:4000`,
    webBase: `http://${gatewayIp}:8080`,
    capabilities: ["wifi-hotspot", "captive-portal", "https"],
  });
});

// ─── POST /api/mesh/device/register ─────────────────────────────────────────────
// Simplified device registration for captive portal flow

meshRouter.post("/device/register", (req: Request, res: Response) => {
  const { device_id, name, type, capabilities, location } = req.body as {
    device_id: string;
    name: string;
    type: string;
    capabilities: string[];
    location: { lat: number; lng: number };
  };

  // Check if device already exists
  const existing = nodeStmts.getById.get(device_id);
  
  if (existing) {
    // Update existing device
    nodeStmts.upsert.run({
      id: device_id,
      label: name,
      name: name,
      device: type as any,
      role: "peer",
      signal: 100,
      battery_percentage: 100,
      bluetooth_status: capabilities.includes('bluetooth') ? 1 : 0,
      wifi_status: capabilities.includes('wifi') ? 1 : 0,
      os: null,
      lat: location.lat,
      lng: location.lng,
      last_seen: new Date().toISOString(),
      registered: existing.registered,
    });
  } else {
    // Register new device
    nodeStmts.upsert.run({
      id: device_id,
      label: name,
      name: name,
      device: type as any,
      role: "peer",
      signal: 100,
      battery_percentage: 100,
      bluetooth_status: capabilities.includes('bluetooth') ? 1 : 0,
      wifi_status: capabilities.includes('wifi') ? 1 : 0,
      os: null,
      lat: location.lat,
      lng: location.lng,
      last_seen: new Date().toISOString(),
      registered: new Date().toISOString(),
    });
  }

  res.status(201).json({ 
    registered: true, 
    device_id,
    message: "Device successfully registered to MeshNet"
  });
});

// ─── POST /api/mesh/register ──────────────────────────────────────────────────

publicMeshRouter.post("/register", (req: Request, res: Response) => {
  registerHandler(req, res);
});
meshRouter.post("/register", (req: Request, res: Response) => {
  registerHandler(req, res);
});

function registerHandler(req: Request, res: Response) {
  const {
    id, label, name, device, role,
    signal, batteryPercentage, bluetoothStatus, wifiStatus,
    os, lat, lng,
  } = req.body as Partial<MeshNode>;

  if (!id || !label || !device) {
    res.status(400).json({ error: "id, label, and device are required" });
    return;
  }

  const row: NodeRow = {
    id,
    label,
    name:               name ?? label,
    device,
    role:               role ?? "peer",
    signal:             signal ?? 80,
    battery_percentage: batteryPercentage ?? 100,
    bluetooth_status:   bluetoothStatus ? 1 : 0,
    wifi_status:        wifiStatus       ? 1 : 0,
    os:                 os ?? null,
    lat:                lat ?? null,
    lng:                lng ?? null,
    last_seen:          new Date().toISOString(),
    registered:         new Date().toISOString(),
  };

  nodeStmts.upsert.run(row);
  res.status(201).json({ registered: true, node: rowToNode(row) });
}

// ─── DELETE /api/mesh/nodes/:id ─────────────────────────────────────────────────

meshRouter.delete("/nodes/:id", (req: Request, res: Response) => {
  const existing = nodeStmts.getById.get(req.params.id);
  if (!existing) { res.status(404).json({ error: "Node not found" }); return; }

  nodeStmts.delete.run(req.params.id);
  res.json({ deleted: true, id: req.params.id });
});

// ─── DELETE /api/mesh/nodes ─────────────────────────────────────────────────────
// Clear all nodes (useful for resetting the mesh)

meshRouter.delete("/nodes", (_req: Request, res: Response) => {
  const count = nodeStmts.deleteAll.run();
  res.json({ deleted: true, count: count.changes });
});

// ─── PATCH /api/mesh/nodes/:id/heartbeat ──────────────────────────────────────

meshRouter.patch("/nodes/:id/heartbeat", (req: Request, res: Response) => {
  const existing = nodeStmts.getById.get(req.params.id);
  if (!existing) { res.status(404).json({ error: "Node not found" }); return; }

  const { signal, batteryPercentage, bluetoothStatus, wifiStatus, lat, lng } =
    req.body as Partial<MeshNode>;

  let newBluetoothStatus = existing.bluetooth_status;
  if (bluetoothStatus !== undefined) {
    newBluetoothStatus = bluetoothStatus ? 1 : 0;
  }

  let newWifiStatus = existing.wifi_status;
  if (wifiStatus !== undefined) {
    newWifiStatus = wifiStatus ? 1 : 0;
  }

  nodeStmts.heartbeat.run({
    id:                existing.id,
    signal:            signal            ?? existing.signal,
    battery_percentage: batteryPercentage ?? existing.battery_percentage,
    bluetooth_status:  newBluetoothStatus,
    wifi_status:       newWifiStatus,
    lat:               lat ?? null,
    lng:               lng ?? null,
    last_seen:         new Date().toISOString(),
  });

  res.json({ updated: true });
});

// ─── POST /api/mesh/edges ─────────────────────────────────────────────────────
// Called by the Python simulation seed endpoint and peer nodes on discovery.

meshRouter.post("/edges", (req: Request, res: Response) => {
  const { a, b, protocol, quality } = req.body as Partial<MeshEdge>;

  if (!a || !b || !protocol) {
    res.status(400).json({ error: "a, b, and protocol are required" });
    return;
  }

  if (!["wifi", "bluetooth"].includes(protocol)) {
    res.status(400).json({ error: "protocol must be 'wifi' or 'bluetooth'" });
    return;
  }

  edgeStmts.upsert.run({
    node_a:   a,
    node_b:   b,
    protocol,
    quality:  quality ?? 80,
  });

  res.status(201).json({ registered: true, edge: { a, b, protocol, quality: quality ?? 80 } });
});

// ─── POST /api/mesh/protocol/register ─────────────────────────────────────────────
// Register device's active protocol(s) for unified mesh architecture

type ProtocolType = "ble" | "wifi_direct" | "hotspot";

meshRouter.post("/protocol/register", (req: Request, res: Response) => {
  const { device_id, protocol, hotspot_ip, hotspot_password } = req.body as {
    device_id: string;
    protocol: ProtocolType;
    hotspot_ip?: string;
    hotspot_password?: string;
  };

  if (!device_id || !protocol) {
    res.status(400).json({ error: "device_id and protocol are required" });
    return;
  }

  const validProtocols = ["ble", "wifi_direct", "hotspot"];
  if (!validProtocols.includes(protocol)) {
    res.status(400).json({ error: `protocol must be one of: ${validProtocols.join(", ")}` });
    return;
  }

  // Update node with protocol information
  const existing = nodeStmts.getById.get(device_id);
  if (!existing) {
    res.status(404).json({ error: "Device not found. Register with /api/mesh/register first" });
    return;
  }

  // Store protocol registration (using signal field for protocol type temporarily)
  // In production, this would be a separate protocols table
  let protocolSignal: number;
  if (protocol === "hotspot") {
    protocolSignal = 100;
  } else if (protocol === "wifi_direct") {
    protocolSignal = 80;
  } else {
    protocolSignal = 60;
  }

  const protocolBleStatus = protocol === "ble" ? 1 : existing.bluetooth_status;
  const protocolWifiStatus = protocol === "wifi_direct" || protocol === "hotspot" ? 1 : existing.wifi_status;

  nodeStmts.heartbeat.run({
    id: device_id,
    signal: protocolSignal,
    battery_percentage: existing.battery_percentage,
    bluetooth_status: protocolBleStatus,
    wifi_status: protocolWifiStatus,
    lat: existing.lat,
    lng: existing.lng,
    last_seen: new Date().toISOString(),
  });

  const response: any = {
    registered: true,
    device_id,
    protocol,
    timestamp: new Date().toISOString(),
  };

  if (protocol === "hotspot" && hotspot_ip && hotspot_password) {
    response.hotspot_config = {
      ip: hotspot_ip,
      password: hotspot_password,
      ssid: `MeshNet-${device_id.slice(-6)}`,
    };
  }

  res.status(201).json(response);
});

// ─── GET /api/mesh/protocol/status ───────────────────────────────────────────────
// Get device's current protocol status and recommendations

meshRouter.get("/protocol/status/:id", (req: Request, res: Response) => {
  const device = nodeStmts.getById.get(req.params.id);
  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }

  const bleActive = Boolean(device.bluetooth_status);
  const wifiActive = Boolean(device.wifi_status);
  const batteryLow = device.battery_percentage < 20;

  // Determine recommended protocol based on context
  let recommendedProtocol: ProtocolType;
  let reason: string;

  if (batteryLow) {
    recommendedProtocol = "ble";
    reason = "Battery level low - BLE recommended for power efficiency";
  } else if (wifiActive) {
    recommendedProtocol = "hotspot";
    reason = "WiFi available - Hotspot recommended for universal compatibility";
  } else if (bleActive) {
    recommendedProtocol = "wifi_direct";
    reason = "BLE active - WiFi Direct recommended for better bandwidth";
  } else {
    recommendedProtocol = "ble";
    reason = "Default - BLE recommended for discovery";
  }

  res.json({
    device_id: device.id,
    current_protocols: {
      ble: bleActive,
      wifi_direct: wifiActive,
      hotspot: wifiActive && device.signal > 90,
    },
    battery_level: device.battery_percentage,
    signal_strength: device.signal,
    recommended_protocol: recommendedProtocol,
    recommendation_reason: reason,
    capabilities: {
      ble: bleActive,
      wifi_direct: wifiActive,
      hotspot: wifiActive,
    },
  });
});

// ─── POST /api/mesh/hotspot/create ───────────────────────────────────────────────
// Register a new hotspot for the mesh network

meshRouter.post("/hotspot/create", (req: Request, res: Response) => {
  const { device_id, ip, password, max_connections, location } = req.body as {
    device_id: string;
    ip: string;
    password?: string;
    max_connections?: number;
    location?: { lat: number; lng: number };
  };

  if (!device_id || !ip) {
    res.status(400).json({ error: "device_id and ip are required" });
    return;
  }

  const existing = nodeStmts.getById.get(device_id);
  if (!existing) {
    res.status(404).json({ error: "Device not found" });
    return;
  }

  // Update node with hotspot information
  nodeStmts.heartbeat.run({
    id: device_id,
    signal: 100, // High signal for hotspot
    battery_percentage: existing.battery_percentage,
    bluetooth_status: 1,
    wifi_status: 1,
    lat: location?.lat ?? existing.lat,
    lng: location?.lng ?? existing.lng,
    last_seen: new Date().toISOString(),
  });

  res.status(201).json({
    created: true,
    hotspot: {
      device_id,
      ssid: `MeshNet-${device_id.slice(-6)}`,
      ip,
      password,
      max_connections: max_connections ?? 10,
      location: location ?? { lat: existing.lat, lng: existing.lng },
      created_at: new Date().toISOString(),
    },
  });
});

// ─── POST /api/mesh/messages/relay ───────────────────────────────────────────────
// Relay messages between devices in the mesh network

meshRouter.post("/messages/relay", (req: Request, res: Response) => {
  const { message, from_protocol, to_protocol, from_device, to_device } = req.body as {
    message: any;
    from_protocol: ProtocolType;
    to_protocol: ProtocolType;
    from_device: string;
    to_device: string;
  };

  if (!message || !from_protocol || !to_protocol || !from_device || !to_device) {
    res.status(400).json({ error: "message, from_protocol, to_protocol, from_device, and to_device are required" });
    return;
  }

  const validProtocols = ["ble", "wifi_direct", "hotspot"];
  if (!validProtocols.includes(from_protocol) || !validProtocols.includes(to_protocol)) {
    res.status(400).json({ error: `protocols must be one of: ${validProtocols.join(", ")}` });
    return;
  }

  // Verify both devices exist
  const fromNode = nodeStmts.getById.get(from_device);
  const toNode = nodeStmts.getById.get(to_device);

  if (!fromNode || !toNode) {
    res.status(404).json({ error: "One or both devices not found" });
    return;
  }

  // In a real implementation, this would:
  // 1. Store the message for relay
  // 2. Update routing tables
  // 3. Forward to next hop
  // 4. Handle cross-protocol translation if needed

  res.json({
    relayed: true,
    message_id: message.id || `msg_${Date.now()}`,
    from_device,
    to_device,
    protocol_chain: [from_protocol, to_protocol],
    timestamp: new Date().toISOString(),
    status: "queued_for_delivery",
  });
});

// ─── GET /api/mesh/messages/:id ─────────────────────────────────────────────────
// Get messages for a specific device (store-and-forward)

meshRouter.get("/messages/:id", (req: Request, res: Response) => {
  const device = nodeStmts.getById.get(req.params.id);
  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }

  // In a real implementation, this would query a messages table
  // For now, return empty array
  res.json({
    device_id: device.id,
    messages: [],
    count: 0,
    last_updated: new Date().toISOString(),
  });
});
