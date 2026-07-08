/**
 * DashboardLayout — Master dashboard layout for MeshNet AI
 *
 * Desktop two-column layout:
 *  LEFT  (380px) — Emergency SOS Input Portal + Disaster Control Panel
 *  RIGHT (flex)  — IBM Cloudant Node Map Canvas + Route strip + Activity log
 *
 * On narrow screens (< 768px) the layout stacks vertically and defers
 * to the existing mobile App.tsx tab navigation.
 *
 * Layer integration:
 *  Layer 1 → calls Layer 3 (/api/route) via useRouting hook
 *  Layer 4 data → loaded by useCloudantNodes (IBM Cloudant / local backend / seed)
 *  Signal flicker alerts → delivered via SSE through useSignalStream
 */

import SosInputPortal, { type SosPayload } from "./SosInputPortal";
import NodeMapCanvas from "./NodeMapCanvas";
import DisasterControlPanel, { type Scenario } from "./DisasterControlPanel";
import FlickerAlertBanner from "./FlickerAlertBanner";
import { useCloudantNodes, type CloudantNode } from "../hooks/useCloudantNodes";
import { useRouting } from "../hooks/useRouting";
import { useSignalStream } from "../hooks/useSignalStream";
import { useDeviceLocation } from "../hooks/useDeviceLocation";
import { BluetoothScanner } from "../../components/BluetoothScanner";
import { WebRTCManager } from "../../components/WebRTCManager";
import { HotspotManager } from "../../components/HotspotManager";
import { NetworkStatus } from "../../components/NetworkStatus";
import { EmergencyMode } from "../../components/EmergencyMode";
import { Radio, Wifi, WifiOff, Database, AlertTriangle, Route, Signal, Zap, Settings, X, Home, Bell, Map, MessageCircle } from "lucide-react";
import { useState, useEffect, useRef } from "react";

// ─── Activity log ─────────────────────────────────────────────────────────────

interface LogEntry {
  id: string;
  time: string;
  type: string;
  message: string;
}

function makeEntry(type: string, message: string): LogEntry {
  const id = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    type,
    message,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardLayout() {
  const deviceLocation = useDeviceLocation();
  const { nodes, loading, error, source, refresh } = useCloudantNodes(10_000, deviceLocation.lat, deviceLocation.lng);
  const { result: routeResult, loading: routeLoading, error: routeError, query: queryRoute } = useRouting();
  const { latestFlicker, flickerHistory, connected: sseConnected, dismiss: dismissFlicker } = useSignalStream();

  const [log, setLog] = useState<LogEntry[]>([
    makeEntry("system", "Dashboard initialized — IBM Cloudant sync active... acquiring GPS"),
  ]);

  // Disaster scenario state
  const [scenario,         setScenario]         = useState<Scenario>("earthquake");
  // Broadcast-active: true = all BLE nodes forced green on map
  const [broadcastActive,  setBroadcastActive]  = useState(false);
  // Clicked node for route source selection
  const [selectedNodeId,   setSelectedNodeId]   = useState<string | null>(null);
  // Desktop tab state
  const [activeTab,        setActiveTab]        = useState<"dashboard" | "protocols">("dashboard");
  // Protocol selection
  const [activeProtocol,   setActiveProtocol]   = useState<'ble' | 'webrtc' | 'hotspot' | null>(null);

  const appendLog = (type: string, message: string) => {
    setLog((prev) => [makeEntry(type, message), ...prev].slice(0, 40));
  };

  // ── Self-registration: register/heartbeat the rescuer "You" node ──────────
  const selfRegistered = useRef(false);
  useEffect(() => {
    if (deviceLocation.status !== "ok" || deviceLocation.lat == null || deviceLocation.lng == null) return;
    const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:4000";
    const secret  = (import.meta.env.VITE_MESH_SECRET as string | undefined) ?? localStorage.getItem("mesh-secret") ?? "";
    const nodeId  = (() => {
      let id = localStorage.getItem("meshnet_node_id");
      if (!id) {
        id = `device-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        localStorage.setItem("meshnet_node_id", id);
        localStorage.setItem("meshnet_node_label", "You");
      }
      return id;
    })();

    void fetch(`${apiBase}/api/mesh/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(secret ? { "X-Mesh-Secret": secret } : {}) },
      body: JSON.stringify({
        id:                nodeId,
        label:             "You",
        name:              "Rescuer (Desktop)",
        device:            "laptop",
        role:              "relay",
        signal:            100,
        batteryPercentage: 100,
        bluetoothStatus:   false,
        wifiStatus:        true,
        lat:               deviceLocation.lat,
        lng:               deviceLocation.lng,
      }),
      signal: AbortSignal.timeout(6_000),
    }).then((r) => {
      if (r.ok && !selfRegistered.current) {
        selfRegistered.current = true;
        appendLog("node", `You (${nodeId}) registered at ${deviceLocation.lat!.toFixed(5)}, ${deviceLocation.lng!.toFixed(5)}`);
      }
    }).catch(() => { /* offline — will retry on next GPS update */ });
  }, [deviceLocation.lat, deviceLocation.lng, deviceLocation.status]);

  // ── HQ Broadcast ──────────────────────────────────────────────────────────

  const handleBroadcast = () => {
    setBroadcastActive(true);
    appendLog(
      "broadcast",
      `DISASTER PROTOCOL BROADCASTED — Scenario: ${scenario.toUpperCase()} — All device radios forced into active BLE scanning mode`
    );
    // Reset broadcast visual after 10 s (nodes will naturally stay green
    // once the backend pushes updated bluetooth_status: true back)
    setTimeout(() => setBroadcastActive(false), 10_000);
  };

  // ── SOS sent ──────────────────────────────────────────────────────────────

  const handleSosSent = (payload: SosPayload) => {
    appendLog(
      payload.type,
      `SOS [${payload.type.toUpperCase()}] sent${payload.message ? `: "${payload.message}"` : ""}`
    );

    // Auto-query AI route: clicked node → last relay; fallback to first→last relay
    const relayNodes = nodes.filter((n) => n.role === "relay");
    const srcNode = selectedNodeId
      ? nodes.find((n) => n.node_id === selectedNodeId)
      : relayNodes[0];
    const tgtNode = relayNodes[relayNodes.length - 1];

    if (srcNode && tgtNode && srcNode.node_id !== tgtNode.node_id) {
      const scenarioMap: Record<string, Scenario> = {
        flood: "flood", war_zone: "war_zone", fire: "earthquake",
        medical: "earthquake", sos: "earthquake", evacuation: "earthquake",
      };
      queryRoute({
        source: srcNode.node_id,
        target: tgtNode.node_id,
        scenario: scenarioMap[payload.type] ?? scenario,
      }).then(() => {
        if (routeResult?.found) {
          appendLog("route", `Route found: ${routeResult.path.join(" → ")} (${routeResult.hops} hops)`);
        }
      });
    }
  };

  // ── Node click → select as route source ──────────────────────────────────

  const handleNodeClick = (node: CloudantNode) => {
    setSelectedNodeId((prev) => (prev === node.node_id ? null : node.node_id));
    appendLog("node", `Selected node: ${node.label} (${node.node_id}) — Signal ${node.signal}%`);
  };

  // ── Flicker alert → log entry ─────────────────────────────────────────────

  if (latestFlicker && log[0]?.id !== `flicker-${latestFlicker.id}`) {
    setLog((prev) => [
      {
        id:      `flicker-${latestFlicker.id}`,
        time:    new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        type:    "flicker",
        message: `FLICKER: ${latestFlicker.nodeLabel} — ${latestFlicker.prevSignal}% → ${latestFlicker.currSignal}% — HIGH-PRIORITY BURST`,
      },
      ...prev,
    ].slice(0, 40));
  }

  // Active BLE nodes count
  const bleActive = broadcastActive
    ? nodes.length
    : nodes.filter((n) => n.bluetooth_status).length;

  // Active route path (array of node_ids from routeResult)
  const activeRoutePath = routeResult?.found ? routeResult.path : [];

  return (
    // Single root element — no Fragment. The outer div is position:fixed so it
    // owns its own stacking context and is guaranteed 100vw × 100vh regardless
    // of what #root or body do. FlickerAlertBanner sits inside as an overlay.
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "radial-gradient(ellipse at 30% 10%, #0F2347 0%, #060E1C 70%)",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {/* ── Signal-flicker alert pop-up — absolute overlay inside this shell ── */}
      <FlickerAlertBanner
        alert={latestFlicker}
        onDismiss={dismissFlicker}
      />

      {/* ── Content pushed down when flicker banner is visible ────────────── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          paddingTop: latestFlicker ? "68px" : "0",
          transition: "padding-top 0.15s",
        }}
      >
        {/* ── Top bar ──────────────────────────────────────────────────────── */}
        <header
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 24px",
            borderBottom: "1px solid rgba(91,141,217,0.15)",
            background: "rgba(10,21,38,0.8)",
          }}
        >
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#F97316] flex items-center justify-center">
              <Radio size={16} className="text-white" strokeWidth={2.5} />
            </div>
            <div>
              <div
                className="text-base font-black text-[#E8EEF7] tracking-wider uppercase leading-none"
                style={{ fontFamily: "Barlow Condensed, sans-serif" }}
              >
                MeshNet AI
              </div>
              <div className="text-[9px] font-mono text-[#7B9CC4] tracking-widest uppercase">
                Emergency Routing · Command Dashboard
              </div>
            </div>
          </div>

          {/* Status pills */}
          <div className="flex items-center gap-3">
            {/* SSE stream status */}
            <div
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-mono uppercase border"
              style={{
                background:  sseConnected ? "rgba(34,197,94,0.1)"  : "rgba(239,68,68,0.08)",
                borderColor: sseConnected ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.2)",
                color:       sseConnected ? "#22C55E" : "#EF4444",
              }}
            >
              <Signal size={9} />
              {sseConnected ? "Stream live" : "Stream offline"}
            </div>

            {/* Flicker count */}
            {flickerHistory.length > 0 && (
              <div
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-mono uppercase border"
                style={{
                  background:  "rgba(239,68,68,0.1)",
                  borderColor: "rgba(239,68,68,0.25)",
                  color:       "#EF4444",
                }}
              >
                <Zap size={9} />
                {flickerHistory.length} flicker{flickerHistory.length !== 1 ? "s" : ""}
              </div>
            )}

            {/* Cloudant data source */}
            <div
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-mono uppercase border"
              style={{
                background: "rgba(91,141,217,0.1)",
                borderColor: "rgba(91,141,217,0.25)",
                color: "#7B9CC4",
              }}
            >
              <Database size={9} />
              {source === "cloudant"
                ? "IBM Cloudant"
                : source === "local-backend"
                ? "Local API"
                : "Seed Data"}
            </div>

            {/* AI Routing status pill */}
            <div
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-mono uppercase border"
              style={{
                background: routeResult?.found
                  ? "rgba(34,197,94,0.1)"
                  : routeLoading
                  ? "rgba(249,115,22,0.1)"
                  : "rgba(91,141,217,0.1)",
                borderColor: routeResult?.found
                  ? "rgba(34,197,94,0.25)"
                  : routeLoading
                  ? "rgba(249,115,22,0.25)"
                  : "rgba(91,141,217,0.25)",
                color: routeResult?.found ? "#22C55E" : routeLoading ? "#F97316" : "#7B9CC4",
              }}
            >
              <Route size={9} />
              {routeLoading
                ? "Routing…"
                : routeResult?.found
                ? `${routeResult.hops} hop route`
                : routeError
                ? "Router offline"
                : "AI Router"}
            </div>

            {/* Nodes online */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#22C55E]/10 border border-[#22C55E]/20">
              <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
              <span className="text-[10px] font-mono text-[#22C55E] uppercase tracking-wider">
                {nodes.length} nodes
              </span>
            </div>

            {/* BLE count */}
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border"
              style={{
                background: bleActive > 0 ? "rgba(34,197,94,0.08)" : "rgba(75,85,99,0.15)",
                borderColor: bleActive > 0 ? "rgba(34,197,94,0.2)" : "rgba(75,85,99,0.3)",
              }}
            >
              {bleActive > 0 ? (
                <Wifi size={10} className="text-[#22C55E]" />
              ) : (
                <WifiOff size={10} className="text-[#4B5563]" />
              )}
              <span
                className="text-[10px] font-mono uppercase tracking-wider"
                style={{ color: bleActive > 0 ? "#22C55E" : "#4B5563" }}
              >
                {bleActive} BLE
              </span>
            </div>
          </div>
        </header>

        {/* ── Main grid ────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>

          {/* LEFT — SOS Input Portal + Disaster Control Panel */}
          <aside
            style={{
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
              width: 360,
              minWidth: 320,
              borderRight: "1px solid rgba(91,141,217,0.15)",
              background: "rgba(11,29,58,0.6)",
              padding: "1.25rem",
              gap: "1.5rem",
              scrollbarWidth: "none",
            }}
          >
            {/* Disaster scenario + HQ broadcast */}
            <DisasterControlPanel
              activeScenario={scenario}
              onScenarioChange={(s) => {
                setScenario(s);
                appendLog("scenario", `Scenario changed to: ${s.replace("_", " ").toUpperCase()}`);
              }}
              onBroadcast={handleBroadcast}
            />

            {/* Divider */}
            <div className="border-t" style={{ borderColor: "rgba(91,141,217,0.12)" }} />

            {/* SOS Input Portal */}
            <SosInputPortal onSend={handleSosSent} />
          </aside>

          {/* RIGHT — Map + Route result + Activity log */}
          <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>

            {/* Selected node hint */}
            {selectedNodeId && (
              <div
                className="shrink-0 px-4 py-1.5 flex items-center gap-2 text-[10px] font-mono border-b"
                style={{
                  background: "rgba(249,115,22,0.06)",
                  borderColor: "rgba(249,115,22,0.2)",
                  color: "#F97316",
                }}
              >
                <Route size={10} />
                Route source: <strong>{selectedNodeId}</strong> — Send SOS to auto-route from this node
                <button
                  onClick={() => setSelectedNodeId(null)}
                  className="ml-auto text-[#7B9CC4] hover:text-[#E8EEF7]"
                  title="Clear selection"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Map panel — flex:1 + minHeight:0 so the panel stretches to fill
                all remaining height in the <main> column. overflow:hidden keeps
                Leaflet's absolutely-positioned panes from leaking outside.
                Inline styles only — Tailwind flex-1 is unreliable in the
                critical height chain with Tailwind v4 source(none). */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                padding: "1rem",
              }}
            >
              <NodeMapCanvas
                nodes={nodes}
                loading={loading}
                error={error}
                source={source}
                onRefresh={refresh}
                activeRoutePath={activeRoutePath}
                broadcastActive={broadcastActive}
                onNodeClick={handleNodeClick}
                deviceLocation={deviceLocation}
              />
            </div>

            {/* Route result strip */}
            {routeResult && (
              <div
                className="shrink-0 border-t px-4 py-2 flex items-center gap-3"
                style={{
                  borderColor: "rgba(91,141,217,0.12)",
                  background: routeResult.found
                    ? "rgba(34,197,94,0.06)"
                    : "rgba(239,68,68,0.06)",
                }}
              >
                <Route
                  size={12}
                  style={{ color: routeResult.found ? "#22C55E" : "#EF4444", flexShrink: 0 }}
                />
                <div className="flex-1 min-w-0">
                  {routeResult.found ? (
                    <span className="text-[10px] font-mono text-[#22C55E] truncate block">
                      {routeResult.path.join(" → ")}
                      &nbsp;·&nbsp;
                      <span className="text-[#7B9CC4]">
                        {routeResult.hops} hop{routeResult.hops !== 1 ? "s" : ""}
                        &nbsp;·&nbsp;
                        ~{Math.round(routeResult.estimatedLatencyMs)} ms
                        &nbsp;·&nbsp;
                        scenario: {routeResult.scenario}
                      </span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-[#EF4444]">
                      No route: {routeResult.reason}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Activity log strip */}
            <div
              className="shrink-0 border-t overflow-hidden"
              style={{
                borderColor: "rgba(91,141,217,0.12)",
                background: "rgba(6,14,28,0.7)",
                height: 120,
              }}
            >
              <div className="flex items-center gap-2 px-4 py-1.5 border-b" style={{ borderColor: "rgba(91,141,217,0.1)" }}>
                <AlertTriangle size={10} className="text-[#7B9CC4]" />
                <span className="text-[9px] font-mono uppercase tracking-widest text-[#7B9CC4]">
                  Activity Log
                </span>
                <span className="ml-auto text-[9px] font-mono text-[#7B9CC4]/40">
                  {log.length} entries
                </span>
              </div>
              <div
                className="overflow-y-auto px-4 py-1.5 flex flex-col gap-1"
                style={{ height: 84, scrollbarWidth: "none" }}
              >
                {log.map((entry) => (
                  <div key={entry.id} className="flex items-baseline gap-2 text-[10px] font-mono">
                    <span className="text-[#7B9CC4]/50 shrink-0">{entry.time}</span>
                    <span
                      className="uppercase shrink-0"
                      style={{
                        color:
                          entry.type === "sos" || entry.type === "war_zone"
                            ? "#EF4444"
                            : entry.type === "flicker"
                            ? "#EF4444"
                            : entry.type === "broadcast"
                            ? "#F97316"
                            : entry.type === "medical"
                            ? "#F97316"
                            : entry.type === "flood"
                            ? "#38BDF8"
                            : entry.type === "route"
                            ? "#22C55E"
                            : entry.type === "node"
                            ? "#7B9CC4"
                            : entry.type === "scenario"
                            ? "#A855F7"
                            : "#7B9CC4",
                      }}
                    >
                      [{entry.type}]
                    </span>
                    <span className="text-[#C4D5EC] truncate">{entry.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </main>
        </div>

        {/* ── Bottom Navigation Bar (Desktop) ───────────────────────────────── */}
        <div
          style={{
            flexShrink: 0,
            borderTop: "1px solid rgba(91,141,217,0.15)",
            background: "rgba(10,21,38,0.8)",
            padding: "12px 24px",
          }}
        >
          <div className="flex items-center justify-center gap-8">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                activeTab === "dashboard"
                  ? "bg-[#F97316] text-white"
                  : "text-[#7B9CC4] hover:text-[#E8EEF7] hover:bg-[rgba(91,141,217,0.1)]"
              }`}
            >
              <Route size={18} />
              <span className="text-sm font-semibold">Dashboard</span>
            </button>
            <button
              onClick={() => setActiveTab("protocols")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                activeTab === "protocols"
                  ? "bg-[#F97316] text-white"
                  : "text-[#7B9CC4] hover:text-[#E8EEF7] hover:bg-[rgba(91,141,217,0.1)]"
              }`}
            >
              <Settings size={18} />
              <span className="text-sm font-semibold">Protocols</span>
            </button>
          </div>
        </div>

        {/* ── Protocols Panel (shown when protocols tab is active) ──────────────── */}
        {activeTab === "protocols" && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(6,14,28,0.95)",
              zIndex: 1000,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 24px",
                borderBottom: "1px solid rgba(91,141,217,0.15)",
                background: "rgba(10,21,38,0.8)",
              }}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F97316] flex items-center justify-center">
                  <Settings size={16} className="text-white" />
                </div>
                <div>
                  <div
                    className="text-base font-black text-[#E8EEF7] tracking-wider uppercase leading-none"
                    style={{ fontFamily: "Barlow Condensed, sans-serif" }}
                  >
                    Connection Protocols
                  </div>
                  <div className="text-[9px] font-mono text-[#7B9CC4] tracking-widest uppercase">
                    Mesh Networking Management
                  </div>
                </div>
              </div>
              <button
                onClick={() => setActiveTab("dashboard")}
                className="w-10 h-10 rounded-lg bg-[rgba(91,141,217,0.2)] flex items-center justify-center hover:bg-[rgba(91,141,217,0.3)] transition-colors"
              >
                <X size={20} className="text-[#7B9CC4]" />
              </button>
            </div>

            <div style={{ flex: 1, overflow: "auto", padding: "24px" }}>
              <div style={{ maxWidth: "1200px", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "24px" }}>
                {/* Protocol Selection */}
                <div
                  style={{
                    background: "rgba(11,29,58,0.6)",
                    border: "1px solid rgba(91,141,217,0.15)",
                    borderRadius: "12px",
                    padding: "20px",
                  }}
                >
                  <h3
                    className="text-sm font-bold text-[#E8EEF7] uppercase tracking-widest mb-4"
                    style={{ fontFamily: "Barlow Condensed, sans-serif" }}
                  >
                    Select Protocol
                  </h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
                    <button
                      onClick={() => setActiveProtocol('ble')}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        activeProtocol === 'ble' 
                          ? 'bg-[#F97316] border-[#F97316]' 
                          : 'bg-[#132B5A] border-[rgba(91,141,217,0.2)] hover:border-[rgba(91,141,217,0.4)]'
                      }`}
                    >
                      <div style={{ fontSize: "24px", marginBottom: "8px" }}>📡</div>
                      <div className="text-xs font-bold text-[#E8EEF7]">BLE</div>
                    </button>
                    <button
                      onClick={() => setActiveProtocol('webrtc')}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        activeProtocol === 'webrtc' 
                          ? 'bg-[#F97316] border-[#F97316]' 
                          : 'bg-[#132B5A] border-[rgba(91,141,217,0.2)] hover:border-[rgba(91,141,217,0.4)]'
                      }`}
                    >
                      <div style={{ fontSize: "24px", marginBottom: "8px" }}>🔗</div>
                      <div className="text-xs font-bold text-[#E8EEF7]">WebRTC</div>
                    </button>
                    <button
                      onClick={() => setActiveProtocol('hotspot')}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        activeProtocol === 'hotspot' 
                          ? 'bg-[#F97316] border-[#F97316]' 
                          : 'bg-[#132B5A] border-[rgba(91,141,217,0.2)] hover:border-[rgba(91,141,217,0.4)]'
                      }`}
                    >
                      <div style={{ fontSize: "24px", marginBottom: "8px" }}>📶</div>
                      <div className="text-xs font-bold text-[#E8EEF7]">Hotspot</div>
                    </button>
                  </div>

                  {activeProtocol === 'ble' && (
                    <div style={{ marginTop: "20px" }}>
                      <BluetoothScanner />
                    </div>
                  )}
                  {activeProtocol === 'webrtc' && (
                    <div style={{ marginTop: "20px" }}>
                      <WebRTCManager />
                    </div>
                  )}
                  {activeProtocol === 'hotspot' && (
                    <div style={{ marginTop: "20px" }}>
                      <HotspotManager />
                    </div>
                  )}
                </div>

                {/* Network Status */}
                <div
                  style={{
                    background: "rgba(11,29,58,0.6)",
                    border: "1px solid rgba(91,141,217,0.15)",
                    borderRadius: "12px",
                    padding: "20px",
                  }}
                >
                  <h3
                    className="text-sm font-bold text-[#E8EEF7] uppercase tracking-widest mb-4"
                    style={{ fontFamily: "Barlow Condensed, sans-serif" }}
                  >
                    Network Status
                  </h3>
                  <NetworkStatus />
                </div>

                {/* Emergency Mode */}
                <div
                  style={{
                    background: "rgba(11,29,58,0.6)",
                    border: "1px solid rgba(91,141,217,0.15)",
                    borderRadius: "12px",
                    padding: "20px",
                  }}
                >
                  <h3
                    className="text-sm font-bold text-[#E8EEF7] uppercase tracking-widest mb-4"
                    style={{ fontFamily: "Barlow Condensed, sans-serif" }}
                  >
                    Emergency Mode
                  </h3>
                  <EmergencyMode />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
