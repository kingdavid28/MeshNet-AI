import { useDeviceLocation } from "../hooks/useDeviceLocation";
import { useCloudantNodes } from "../hooks/useCloudantNodes";
import { useMeshRouting } from "../hooks/useMeshRouting";
import NodeMapCanvas from "./NodeMapCanvas";
import { MeshNode } from "../../utils/routing";
import type { DiscoveredPeer } from "../hooks/useMeshDiscovery";
import type { DiscoveryStatus } from "../plugins/MeshDiscoveryPlugin";

interface MapTabProps {
  discoveryStatus: DiscoveryStatus | null;
  discoveredPeers: DiscoveredPeer[];
  isNative: boolean;
}

export function MapTab({ discoveryStatus, discoveredPeers, isNative }: MapTabProps) {
  const deviceLocation = useDeviceLocation();

  // ── Mesh routing and SOS messaging ──
  const meshRouting = useMeshRouting();

  // ── Convert discovered peers to MeshNode format for routing ──
  const meshNodes: MeshNode[] = discoveredPeers.map(p => ({
    node_id: p.nodeId,
    battery_level: p.battery,
    is_active: true,
    device_type: 'smartphone',
    has_weather_hq_signal: false,
    lat: p.lat,
    lon: p.lng,
  }));

  // ── Auto-compute route when nodes are available ──
  if (meshNodes.length > 0 && !meshRouting.routingResult) {
    meshRouting.computeRoute(meshNodes);
  }

  // ── Live data source — real backend or discovered peers ───────────
  const live = useCloudantNodes(10_000);

  // Production mode: Try backend first, fallback to discovered peers on mobile
  let nodes, loading, error, source, refresh;
  
  if (isNative) {
    // Mobile: Try backend first, merge with discovered peers
    if (live.nodes.length > 0 && !live.error) {
      // Backend available - use backend nodes
      nodes = live.nodes;
      loading = live.loading;
      error = live.error;
      source = live.source;
      refresh = live.refresh;
    } else {
      // Backend unavailable - use discovered peers from BLE/WiFi Direct
      nodes = discoveredPeers.map(p => ({
        node_id: p.nodeId,
        label: p.label,
        latitude: p.lat,
        longitude: p.lng,
        battery_percentage: p.battery,
        bluetooth_status: p.protocol === "bluetooth" || p.protocol === "both",
        wifi_status: p.protocol === "wifi" || p.protocol === "both",
        protocol_active: (() => {
          if (p.protocol === "both") return "both" as const;
          if (p.protocol === "bluetooth") return "bluetooth" as const;
          return "wifi" as const;
        })(),
        signal: p.signal,
        device: "smartphone" as const,
        role: "peer" as const,
        last_seen: new Date(p.lastSeen).toISOString(),
      }));
      loading = false;
      error = live.error; // Show backend error if any
      source = "local-backend" as const;
      refresh = () => {};
    }
  } else {
    // Web: use backend
    nodes = live.nodes;
    loading = live.loading;
    error = live.error;
    source = live.source;
    refresh = live.refresh;
  }

  return (
    <div style={{ flex: 1, minHeight: 0, padding: 12, display: "flex", flexDirection: "column" }}>

      {/* Discovery status strip (native only) */}
      {isNative && discoveryStatus && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 10px", marginBottom: 8,
            borderRadius: 8, flexShrink: 0,
            background: "rgba(20,184,166,0.08)",
            border: "1px solid rgba(20,184,166,0.2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: discoveryStatus.scanning ? "#22C55E" : "#4B5563",
            }} />
            <span style={{ fontSize: 9, fontFamily: "monospace", color: "#7B9CC4", textTransform: "uppercase" }}>
              BLE
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: discoveryStatus.wifiDirect ? "#3B82F6" : "#4B5563",
            }} />
            <span style={{ fontSize: 9, fontFamily: "monospace", color: "#7B9CC4", textTransform: "uppercase" }}>
              WiFi
            </span>
          </div>
          <span style={{ fontSize: 9, fontFamily: "monospace", color: "#14B8A6", marginLeft: "auto" }}>
            {discoveryStatus.peersFound} peer{discoveryStatus.peersFound !== 1 ? "s" : ""} found
          </span>
        </div>
      )}

      {/* Routing status strip */}
      {meshRouting.routingResult && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 10px", marginBottom: 8,
            borderRadius: 8, flexShrink: 0,
            background: "rgba(59,130,246,0.08)",
            border: "1px solid rgba(59,130,246,0.2)",
          }}
        >
          <span style={{ fontSize: 9, fontFamily: "monospace", color: "#7B9CC4", textTransform: "uppercase" }}>
            Route: {meshRouting.routingResult.optimal_path.length} hops
          </span>
          <span style={{ fontSize: 9, fontFamily: "monospace", color: "#3B82F6", marginLeft: "auto" }}>
            Quality: {(meshRouting.routingResult.path_quality * 100).toFixed(0)}%
          </span>
          {meshRouting.routingResult.hq_anchor && (
            <span style={{ fontSize: 9, fontFamily: "monospace", color: "#F59E0B" }}>
              HQ: {meshRouting.routingResult.hq_anchor}
            </span>
          )}
        </div>
      )}

      {/* SOS broadcast status strip */}
      {meshRouting.isBroadcasting && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 10px", marginBottom: 8,
            borderRadius: 8, flexShrink: 0,
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
          }}
        >
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "#EF4444",
            animation: "pulse 1s infinite",
          }} />
          <span style={{ fontSize: 9, fontFamily: "monospace", color: "#EF4444", textTransform: "uppercase" }}>
            SOS Broadcast
          </span>
          <span style={{ fontSize: 9, fontFamily: "monospace", color: "#7B9CC4", marginLeft: "auto" }}>
            Hop {meshRouting.currentHop + 1}: {meshRouting.currentNode} ({meshRouting.hopStatus})
          </span>
          <button
            onClick={meshRouting.abortBroadcast}
            style={{
              fontSize: 8, fontFamily: "monospace", padding: "2px 6px",
              background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.4)",
              borderRadius: 4, color: "#EF4444", cursor: "pointer",
            }}
          >
            ABORT
          </button>
        </div>
      )}

      {/* Map canvas */}
      <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex", flexDirection: "column" }}>
        <NodeMapCanvas
          nodes={nodes}
          loading={loading}
          error={error}
          source={source}
          onRefresh={refresh}
          deviceLocation={deviceLocation}
        />
      </div>
    </div>
  );
}
