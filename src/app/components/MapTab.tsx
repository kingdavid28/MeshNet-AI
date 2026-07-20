import { useDeviceLocation } from "../hooks/useDeviceLocation";
import { useCloudantNodes } from "../hooks/useCloudantNodes";
import { useMeshDiscovery } from "../hooks/useMeshDiscovery";
import { useMockNodeSimulation } from "../hooks/useMockNodeSimulation";
import NodeMapCanvas from "./NodeMapCanvas";
import SimPerfOverlay from "./SimPerfOverlay";
import { SIM_MODE, TICK_MS } from "../constants";

export function MapTab() {
  const deviceLocation = useDeviceLocation();

  // ── Live data source — either mock simulation or real backend ───────────
  const live = useCloudantNodes(10_000);
  const sim  = useMockNodeSimulation(TICK_MS);

  const nodes   = SIM_MODE ? sim.nodes   : live.nodes;
  const loading = SIM_MODE ? false        : live.loading;
  const error   = SIM_MODE ? null         : live.error;
  const source  = SIM_MODE ? ("seed" as const) : live.source;
  const refresh = SIM_MODE ? () => {}     : live.refresh;

  // ── Real device mesh discovery (BLE + Wi-Fi Direct via Capacitor plugin) ──
  const { status: discoveryStatus, isNative } = useMeshDiscovery({
    nodeId:  localStorage.getItem("meshnet_node_id") ?? "mobile-user",
    label:   "You",
    battery: 80,
    signal:  75,
    deviceLocation,
  });

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

      {/* Simulation mode banner */}
      {SIM_MODE && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "4px 10px", marginBottom: 6, borderRadius: 6, flexShrink: 0,
          background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.22)",
          fontSize: 9, fontFamily: "monospace", color: "#F97316",
          textTransform: "uppercase", letterSpacing: "0.08em",
        }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#F97316" }} />
          Simulation mode · {TICK_MS / 1000}s tick · {sim.nodes.length} mock nodes
        </div>
      )}

      {/* Map canvas (wraps relative so SimPerfOverlay can be positioned) */}
      <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex", flexDirection: "column" }}>
        <NodeMapCanvas
          nodes={nodes}
          loading={loading}
          error={error}
          source={source}
          onRefresh={refresh}
          deviceLocation={deviceLocation}
        />

        {SIM_MODE && (
          <SimPerfOverlay
            stats={sim.stats}
            tickMs={TICK_MS}
            nodeCount={sim.nodes.length}
            isPaused={sim.isPaused}
            onPause={sim.pause}
            onResume={sim.resume}
          />
        )}
      </div>
    </div>
  );
}
