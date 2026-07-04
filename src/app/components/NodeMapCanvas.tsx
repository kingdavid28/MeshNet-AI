/**
 * NodeMapCanvas — Live mesh map  (Leaflet + real OpenStreetMap tiles)
 *
 * Features:
 *  • Real OpenStreetMap tiles from /public/tiles/ (offline bundle) or live CDN
 *  • BLE-active edges as green dashed polylines on the real map
 *  • AI route overlay as orange polyline with travelling packet marker
 *  • Custom SVG DivIcons — colour-coded by BLE / relay status
 *  • Click-to-select node → detail card below map
 *  • broadcast-active mode forces all markers green
 *  • Graceful loading / error states
 */

import { useState, useMemo, useRef } from "react";
import type { CloudantNode } from "../hooks/useCloudantNodes";
import type { DeviceLocation } from "../hooks/useDeviceLocation";
import { Bluetooth, Battery, Signal, RefreshCw, Database, Wifi, LocateFixed, Layers, WifiOff } from "lucide-react";
import LeafletMap, { type LeafletMapHandle } from "./LeafletMap";

// ─── Palette ──────────────────────────────────────────────────────────────────

const COLOR_BOTH  = "#14B8A6";   // teal  — BLE + Wi-Fi
const COLOR_BLE   = "#22C55E";   // green — BLE only
const COLOR_WIFI  = "#3B82F6";   // blue  — Wi-Fi Direct only
const COLOR_OFF   = "#4B5563";   // grey  — all radios off
const COLOR_RELAY = "#5B8DD9";
const COLOR_ROUTE = "#F97316";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  nodes:            CloudantNode[];
  loading:          boolean;
  error:            string | null;
  source:           "cloudant" | "local-backend" | "seed";
  onRefresh?:       () => void;
  activeRoutePath?: string[];
  broadcastActive?: boolean;
  onNodeClick?:     (node: CloudantNode) => void;
  deviceLocation?:  DeviceLocation | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NodeMapCanvas({
  nodes,
  loading,
  error,
  source,
  onRefresh,
  activeRoutePath = [],
  broadcastActive = false,
  onNodeClick,
  deviceLocation,
}: Props): JSX.Element {
  const [selected, setSelected] = useState<CloudantNode | null>(null);
  const leafletRef = useRef<LeafletMapHandle>(null);

  const effectiveNodes = useMemo(
    () => broadcastActive
      ? nodes.map((n) => ({ ...n, bluetooth_status: true, wifi_status: true, protocol_active: "both" as const }))
      : nodes,
    [nodes, broadcastActive],
  );

  const bleActiveCount  = effectiveNodes.filter((n) => n.bluetooth_status).length;
  const wifiActiveCount = effectiveNodes.filter((n) => n.wifi_status).length;
  const bothActiveCount = effectiveNodes.filter((n) => n.protocol_active === "both").length;

  const sourceBadge: { label: string; color: string } = {
    cloudant:        { label: "IBM Cloudant", color: "#5B8DD9" },
    "local-backend": { label: "Local Backend", color: "#F97316" },
    seed:            { label: "Seed Data",     color: "#7B9CC4" },
  }[source];

  function handleNodeClick(node: CloudantNode) {
    setSelected((prev) => (prev?.node_id === node.node_id ? null : node));
    onNodeClick?.(node);
  }

  return (
    /* flex:1 + minHeight:0 fills the parent flex column (both mobile shell
       and DashboardLayout map panel). Inline styles only — never rely on
       Tailwind for structural flex properties in the height chain. */
    <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0 }}>

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="text-sm font-black text-[#E8EEF7] uppercase tracking-widest leading-none"
            style={{ fontFamily: "Barlow Condensed, sans-serif" }}
          >
            Live Mesh Map
          </h2>
          <p className="text-[10px] text-[#7B9CC4] mt-0.5 font-mono">
            {effectiveNodes.length} node{effectiveNodes.length !== 1 ? "s" : ""}
              &nbsp;·&nbsp;{bleActiveCount} BLE
              &nbsp;·&nbsp;{wifiActiveCount} Wi-Fi
              {bothActiveCount > 0 && <>&nbsp;·&nbsp;<span style={{ color: COLOR_BOTH }}>{bothActiveCount} dual</span></>}
            {activeRoutePath.length > 1 && (
              <span className="text-[#F97316]">
                &nbsp;·&nbsp;route: {activeRoutePath.length - 1} hop{activeRoutePath.length > 2 ? "s" : ""}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* GPS location status badge */}
          {deviceLocation && (
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-mono uppercase tracking-wider border"
              style={
                deviceLocation.status === "ok"
                  ? { background: "rgba(59,130,246,0.1)", borderColor: "rgba(59,130,246,0.3)", color: "#3B82F6" }
                  : deviceLocation.status === "acquiring"
                  ? { background: "rgba(249,115,22,0.1)", borderColor: "rgba(249,115,22,0.3)", color: "#F97316" }
                  : { background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.2)", color: "#EF4444" }
              }
              title={deviceLocation.error ?? "GPS active"}
            >
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background:
                    deviceLocation.status === "ok" ? "#3B82F6" :
                    deviceLocation.status === "acquiring" ? "#F97316" : "#EF4444",
                }}
              />
              {deviceLocation.status === "ok"
                ? `GPS ±${Math.round(deviceLocation.accuracy ?? 0)}m`
                : deviceLocation.status === "acquiring"
                ? "GPS…"
                : "No GPS"}
            </div>
          )}

          {/* Source badge */}
          <div
            className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-mono uppercase tracking-wider border"
            style={{
              background:  `${sourceBadge.color}12`,
              borderColor: `${sourceBadge.color}30`,
              color:        sourceBadge.color,
            }}
          >
            <Database size={9} />
            {sourceBadge.label}
          </div>

          {/* Live pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#22C55E]/10 border border-[#22C55E]/20">
            <div className={`w-1.5 h-1.5 rounded-full bg-[#22C55E] ${loading ? "animate-pulse" : ""}`} />
            <span className="text-[10px] font-mono text-[#22C55E] uppercase tracking-wider">
              {loading ? "Syncing" : "Live"}
            </span>
          </div>

          {/* Locate me — fly to device GPS position */}
          {deviceLocation && deviceLocation.status === "ok" && (
            <button
              onClick={() => leafletRef.current?.locateMe()}
              className="w-7 h-7 rounded-lg bg-[#132B5A] border border-[rgba(59,130,246,0.35)] flex items-center justify-center active:scale-90 transition-transform"
              title="Centre map on my location"
            >
              <LocateFixed size={12} className="text-[#3B82F6]" />
            </button>
          )}

          {/* Fit nodes — zoom to show all mesh nodes */}
          <button
            onClick={() => leafletRef.current?.fitNodes()}
            className="w-7 h-7 rounded-lg bg-[#132B5A] border border-[rgba(91,141,217,0.2)] flex items-center justify-center active:scale-90 transition-transform"
            title="Fit map to all nodes"
          >
            <Layers size={12} className="text-[#7B9CC4]" />
          </button>

          {/* Refresh */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="w-7 h-7 rounded-lg bg-[#132B5A] border border-[rgba(91,141,217,0.2)] flex items-center justify-center active:scale-90 transition-transform"
              title="Refresh nodes"
            >
              <RefreshCw size={12} className="text-[#7B9CC4]" />
            </button>
          )}
        </div>
      </div>

      {/* ── Leaflet map canvas ─────────────────────────────────────────────── */}
      {/* flex:1 + minHeight:320 guarantees Leaflet always has a concrete pixel
          height. overflow:hidden is still required for Leaflet's absolutely-
          positioned tile panes but the minHeight prevents them being clipped. */}
      <div
        className="rounded-2xl border border-[rgba(91,141,217,0.2)] relative"
        style={{ flex: 1, minHeight: 320, overflow: "hidden" }}
      >
        <LeafletMap
          ref={leafletRef}
          nodes={effectiveNodes}
          activeRoutePath={activeRoutePath}
          onNodeClick={handleNodeClick}
          selectedNodeId={selected?.node_id ?? null}
          deviceLocation={deviceLocation}
          broadcastActive={broadcastActive}
        />

        {/* Error overlay */}
        {error && !loading && (
          <div className="absolute bottom-3 left-3 right-3 z-[1000] rounded-lg px-3 py-2 text-[10px] font-mono text-[#F97316] bg-[#F97316]/10 border border-[#F97316]/25 pointer-events-none">
            ⚠ {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && effectiveNodes.length === 0 && (
          <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center gap-2 pointer-events-none">
            <div className="text-[#7B9CC4] text-xs font-mono">No nodes loaded</div>
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#132B5A] border border-[rgba(91,141,217,0.25)] text-[10px] font-mono text-[#7B9CC4] hover:text-[#E8EEF7]"
              >
                <RefreshCw size={10} /> Retry
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Legend ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2">
        {([
          { dot: COLOR_BOTH,  label: "BLE + Wi-Fi", sub: "teal dot"   },
          { dot: COLOR_BLE,   label: "BLE Only",    sub: "green dot"  },
          { dot: COLOR_WIFI,  label: "Wi-Fi Only",  sub: "blue dot"   },
          { dot: COLOR_ROUTE, label: "AI Route",    sub: "orange path"},
        ] as const).map((l) => (
          <div key={l.label} className="flex items-center gap-2">
            <div
              className="w-3.5 h-3.5 rounded-full shrink-0"
              style={{ background: `${l.dot}25`, border: `2px solid ${l.dot}` }}
            />
            <div>
              <div className="text-[9px] font-semibold text-[#E8EEF7] leading-none">{l.label}</div>
              <div className="text-[8px] text-[#7B9CC4]">{l.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Selected node detail card ─────────────────────────────────────────── */}
      {selected && (
        <div
          className="rounded-xl border p-3 flex items-start gap-3"
          style={{
            background: "#0F2040",
            borderColor: selected.bluetooth_status
              ? "rgba(34,197,94,0.3)"
              : "rgba(75,85,99,0.3)",
          }}
        >
          {/* Protocol icon — shows Bluetooth, Wifi, or WifiOff based on active radio */}
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
            style={{
              background:
                selected.protocol_active === "both"      ? "rgba(20,184,166,0.12)" :
                selected.protocol_active === "bluetooth" ? "rgba(34,197,94,0.12)"  :
                selected.protocol_active === "wifi"      ? "rgba(59,130,246,0.12)" :
                                                           "rgba(75,85,99,0.12)",
              border: `1px solid ${
                selected.protocol_active === "both"      ? "rgba(20,184,166,0.35)" :
                selected.protocol_active === "bluetooth" ? "rgba(34,197,94,0.35)"  :
                selected.protocol_active === "wifi"      ? "rgba(59,130,246,0.35)" :
                                                           "rgba(75,85,99,0.35)"
              }`,
            }}
          >
            {selected.protocol_active === "wifi" ? (
              <Wifi size={18} style={{ color: COLOR_WIFI }} />
            ) : selected.protocol_active === "none" ? (
              <WifiOff size={18} style={{ color: COLOR_OFF }} />
            ) : (
              <Bluetooth size={18} style={{
                color:
                  selected.protocol_active === "both" ? COLOR_BOTH :
                  selected.protocol_active === "bluetooth" ? COLOR_BLE : COLOR_OFF,
              }} />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-[#E8EEF7]" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>
                {selected.label}
              </span>
              {/* Protocol badge */}
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wider font-mono"
                style={{
                  background:
                    selected.protocol_active === "both"      ? "rgba(20,184,166,0.15)"  :
                    selected.protocol_active === "bluetooth" ? "rgba(34,197,94,0.15)"   :
                    selected.protocol_active === "wifi"      ? "rgba(59,130,246,0.15)"  :
                                                               "rgba(75,85,99,0.15)",
                  color:
                    selected.protocol_active === "both"      ? COLOR_BOTH :
                    selected.protocol_active === "bluetooth" ? COLOR_BLE  :
                    selected.protocol_active === "wifi"      ? COLOR_WIFI :
                                                               COLOR_OFF,
                }}
              >
                {selected.protocol_active === "both"      ? "BLE+WiFi" :
                 selected.protocol_active === "bluetooth" ? "BLE only" :
                 selected.protocol_active === "wifi"      ? "WiFi only" :
                                                            "offline"}
              </span>
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full uppercase"
                style={{ background: "rgba(91,141,217,0.12)", color: "#5B8DD9" }}
              >
                {selected.role}
              </span>
            </div>

            <div className="text-[10px] text-[#7B9CC4] mt-0.5 font-mono">{selected.node_id}</div>

            <div className="grid grid-cols-3 gap-2 mt-2">
              <div className="flex items-center gap-1.5">
                <Signal size={11} className="text-[#7B9CC4] shrink-0" />
                <div>
                  <div className="text-[10px] font-mono text-[#E8EEF7]">{selected.signal}%</div>
                  <div className="text-[8px] text-[#7B9CC4]">signal</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Battery size={11} className="text-[#7B9CC4] shrink-0" />
                <div>
                  <div
                    className="text-[10px] font-mono"
                    style={{ color: selected.battery_percentage > 60 ? "#22C55E" : selected.battery_percentage > 30 ? "#F97316" : "#EF4444" }}
                  >
                    {selected.battery_percentage}%
                  </div>
                  <div className="text-[8px] text-[#7B9CC4]">battery</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Wifi size={11} className="text-[#7B9CC4] shrink-0" />
                <div>
                  <div className="text-[10px] font-mono text-[#E8EEF7]">{selected.device}</div>
                  <div className="text-[8px] text-[#7B9CC4]">device</div>
                </div>
              </div>
            </div>

            <div className="mt-2 text-[9px] font-mono text-[#7B9CC4]/70">
              {selected.latitude.toFixed(4)}°N · {selected.longitude.toFixed(4)}°E · bat {selected.battery_percentage}%
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
