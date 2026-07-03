/**
 * NodeMapCanvas — Paul's canvas map component
 *
 * Renders IBM Cloudant mesh nodes as interactive dots on a canvas:
 *   • GREEN dot  → bluetooth_status = true  (BLE scanning active)
 *   • GREY dot   → bluetooth_status = false (BLE off / unreachable)
 *
 * Node lat/lng coordinates are projected onto the canvas using a simple
 * linear min-max normalisation so the relative positions match reality.
 * Clicking a dot selects it and shows a detail tooltip.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { CloudantNode } from "../hooks/useCloudantNodes";
import { Wifi, Bluetooth, Battery, Signal, RefreshCw, Database } from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const DOT_RADIUS        = 10;
const DOT_RADIUS_SELF   = 13;
const PULSE_PERIOD      = 60;   // animation frames per pulse cycle
const GRID_STEP         = 24;
const PADDING           = 0.08; // 8% canvas margin so dots aren't clipped

const COLOR_BLE_ON  = "#22C55E";  // green  — BLE active
const COLOR_BLE_OFF = "#4B5563";  // grey   — BLE inactive
const COLOR_RELAY   = "#5B8DD9";  // blue tint for relay ring
const COLOR_SELF    = "#F97316";  // orange — self node

// ─── Lat/Lng → canvas XY ─────────────────────────────────────────────────────

function projectNodes(
  nodes: CloudantNode[],
  width: number,
  height: number
): Map<string, { px: number; py: number }> {
  if (nodes.length === 0) return new Map();

  const lats = nodes.map((n) => n.latitude);
  const lngs = nodes.map((n) => n.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const latRange = maxLat - minLat || 0.01;
  const lngRange = maxLng - minLng || 0.01;

  const usableW = width  * (1 - PADDING * 2);
  const usableH = height * (1 - PADDING * 2);
  const offX    = width  * PADDING;
  const offY    = height * PADDING;

  const result = new Map<string, { px: number; py: number }>();
  nodes.forEach((n) => {
    // Latitude increases upward, canvas Y increases downward → flip lat
    const px = offX + ((n.longitude - minLng) / lngRange) * usableW;
    const py = offY + ((maxLat - n.latitude) / latRange) * usableH;
    result.set(n.node_id, { px, py });
  });

  return result;
}

// ─── Hit test ─────────────────────────────────────────────────────────────────

function hitTest(
  mx: number,
  my: number,
  positions: Map<string, { px: number; py: number }>,
  radius = DOT_RADIUS + 6
): string | null {
  for (const [id, { px, py }] of positions) {
    if (Math.hypot(mx - px, my - py) <= radius) return id;
  }
  return null;
}

// ─── Route path overlay ───────────────────────────────────────────────────────

function drawRoutePath(
  ctx: CanvasRenderingContext2D,
  path: string[],
  positions: Map<string, { px: number; py: number }>,
  pulse: number,
) {
  if (path.length < 2) return;

  for (let i = 0; i < path.length - 1; i++) {
    const posA = positions.get(path[i]);
    const posB = positions.get(path[i + 1]);
    if (!posA || !posB) continue;

    // Glowing route line
    ctx.save();
    ctx.strokeStyle = "#F97316";
    ctx.lineWidth   = 3;
    ctx.globalAlpha = 0.9;
    ctx.shadowColor = "#F97316";
    ctx.shadowBlur  = 10;
    ctx.beginPath();
    ctx.moveTo(posA.px, posA.py);
    ctx.lineTo(posB.px, posB.py);
    ctx.stroke();
    ctx.restore();

    // Animated packet traveling along the route segment
    const t = (pulse / PULSE_PERIOD + i * 0.25) % 1;
    const dx = posA.px + (posB.px - posA.px) * t;
    const dy = posA.py + (posB.py - posA.py) * t;
    ctx.save();
    ctx.fillStyle   = "#FFFFFF";
    ctx.shadowColor = "#F97316";
    ctx.shadowBlur  = 12;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(dx, dy, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  nodes: CloudantNode[];
  loading: boolean;
  error: string | null;
  source: "cloudant" | "local-backend" | "seed";
  onRefresh?: () => void;
  /** Node IDs forming the active AI route — draws animated overlay */
  activeRoutePath?: string[];
  /** When true, renders ALL nodes as BLE-active (green) regardless of stored state */
  broadcastActive?: boolean;
  /** Callback when a node dot is clicked */
  onNodeClick?: (node: CloudantNode) => void;
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
}: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [pulse, setPulse]       = useState(0);
  const [selected, setSelected] = useState<CloudantNode | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 480, h: 340 });
  const positionsRef = useRef<Map<string, { px: number; py: number }>>(new Map());

  // Resize observer — canvas fills its wrapper
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setCanvasSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pulse animation
  useEffect(() => {
    const id = setInterval(() => setPulse((p) => (p + 1) % PULSE_PERIOD), 50);
    return () => clearInterval(id);
  }, []);

  // When broadcastActive flips on, derive the effective node list
  const effectiveNodes = broadcastActive
    ? nodes.map((n) => ({ ...n, bluetooth_status: true }))
    : nodes;

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // ── Background grid dots ──────────────────────────────────────────────────
    ctx.fillStyle = "rgba(91,141,217,0.06)";
    for (let x = 0; x < W; x += GRID_STEP) {
      for (let y = 0; y < H; y += GRID_STEP) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (effectiveNodes.length === 0) return;

    const positions = projectNodes(effectiveNodes, W, H);
    positionsRef.current = positions;

    // ── Edges — connect nodes within ~50% of canvas diagonal ─────────────────
    const maxDist = Math.hypot(W, H) * 0.42;
    const nodeList = [...positions.entries()];
    for (let i = 0; i < nodeList.length; i++) {
      for (let j = i + 1; j < nodeList.length; j++) {
        const [idA, posA] = nodeList[i];
        const [idB, posB] = nodeList[j];
        const dist = Math.hypot(posA.px - posB.px, posA.py - posB.py);
        if (dist > maxDist) continue;

        const nodeA = effectiveNodes.find((n) => n.node_id === idA)!;
        const nodeB = effectiveNodes.find((n) => n.node_id === idB)!;
        const bothBle = nodeA.bluetooth_status && nodeB.bluetooth_status;

        ctx.save();
        ctx.globalAlpha = bothBle ? 0.5 : 0.18;
        ctx.strokeStyle = bothBle ? "#22C55E" : "#4B5563";
        ctx.lineWidth   = bothBle ? 1.5 : 1;
        ctx.setLineDash(bothBle ? [] : [5, 5]);
        ctx.beginPath();
        ctx.moveTo(posA.px, posA.py);
        ctx.lineTo(posB.px, posB.py);
        ctx.stroke();
        ctx.restore();
      }
    }

    // ── Active route path overlay ─────────────────────────────────────────────
    drawRoutePath(ctx, activeRoutePath, positions, pulse);

    // ── Nodes ─────────────────────────────────────────────────────────────────
    effectiveNodes.forEach((node) => {
      const pos = positions.get(node.node_id);
      if (!pos) return;
      const { px, py } = pos;

      const isSelected = selected?.node_id === node.node_id;
      const bleOn       = node.bluetooth_status;
      const isRelay     = node.role === "relay";

      const dotColor  = bleOn ? COLOR_BLE_ON : COLOR_BLE_OFF;
      const radius    = isRelay ? DOT_RADIUS_SELF : DOT_RADIUS;

      // Pulse ring for BLE-active relay nodes
      if (bleOn && isRelay) {
        const ripple = (pulse / PULSE_PERIOD) * 18;
        const alpha  = (1 - pulse / PULSE_PERIOD) * 0.35;
        ctx.beginPath();
        ctx.arc(px, py, radius + ripple, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(34,197,94,${alpha})`;
        ctx.lineWidth   = 1.5;
        ctx.stroke();
      }

      // Selection ring
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(px, py, radius + 6, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(249,115,22,0.7)";
        ctx.lineWidth   = 2;
        ctx.stroke();
      }

      // Role ring — relay nodes get a subtle outer ring
      if (isRelay) {
        ctx.beginPath();
        ctx.arc(px, py, radius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = bleOn
          ? "rgba(34,197,94,0.35)"
          : "rgba(75,85,99,0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Main dot fill
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = bleOn
        ? `rgba(34,197,94,0.18)`
        : `rgba(75,85,99,0.18)`;
      ctx.fill();

      // Dot stroke
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.strokeStyle = dotColor;
      ctx.lineWidth   = 2.5;
      ctx.stroke();

      // Inner solid dot
      ctx.beginPath();
      ctx.arc(px, py, radius * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = dotColor;
      ctx.fill();

      // Battery indicator arc (bottom half)
      const batt  = node.battery_percentage / 100;
      const start = Math.PI * 0.1;
      const end   = Math.PI * 0.9;
      const battColor =
        batt > 0.6 ? "#22C55E" : batt > 0.3 ? "#F97316" : "#EF4444";
      ctx.beginPath();
      ctx.arc(px, py, radius + 5, start + (end - start) * (1 - batt), end, false);
      ctx.strokeStyle = battColor;
      ctx.lineWidth   = 2;
      ctx.stroke();

      // Label
      const labelY = py + radius + 14;
      ctx.font      = "bold 8.5px Barlow Condensed, sans-serif";
      ctx.fillStyle = "#E8EEF7";
      ctx.textAlign = "center";
      ctx.fillText(node.label, px, labelY);

      // BLE status sub-label
      ctx.font      = "7px JetBrains Mono, monospace";
      ctx.fillStyle = bleOn ? "#22C55E" : "#4B5563";
      ctx.fillText(bleOn ? "BLE·ON" : "BLE·OFF", px, labelY + 9);
    });
  }, [effectiveNodes, pulse, selected, canvasSize, activeRoutePath, broadcastActive]);

  // Click handler
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      // Scale mouse coords to canvas logical pixels
      const scaleX = (canvasRef.current!.width  / rect.width);
      const scaleY = (canvasRef.current!.height / rect.height);
      const hit = hitTest(mx * scaleX, my * scaleY, positionsRef.current);
      if (hit) {
        const node = effectiveNodes.find((n) => n.node_id === hit) ?? null;
        setSelected((prev) => (prev?.node_id === hit ? null : node));
        if (node) onNodeClick?.(node);
      } else {
        setSelected(null);
      }
    },
    [effectiveNodes, onNodeClick]
  );

  // Source badge
  const sourceBadge = {
    cloudant:        { label: "IBM Cloudant", color: "#5B8DD9" },
    "local-backend": { label: "Local Backend", color: "#F97316" },
    seed:            { label: "Seed Data",     color: "#7B9CC4" },
  }[source];

  return (
    <div className="flex flex-col gap-3 h-full">

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="text-sm font-black text-[#E8EEF7] uppercase tracking-widest leading-none"
            style={{ fontFamily: "Barlow Condensed, sans-serif" }}
          >
            Mesh Node Map
          </h2>
          <p className="text-[10px] text-[#7B9CC4] mt-0.5 font-mono">
            {nodes.length} node{nodes.length !== 1 ? "s" : ""} ·{" "}
            {nodes.filter((n) => n.bluetooth_status).length} BLE active
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Data source badge */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-mono uppercase tracking-wider border"
            style={{
              background: `${sourceBadge.color}12`,
              borderColor: `${sourceBadge.color}30`,
              color: sourceBadge.color,
            }}
          >
            <Database size={9} />
            {sourceBadge.label}
          </div>

          {/* Live / loading indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#22C55E]/12 border border-[#22C55E]/25">
            <div
              className={`w-1.5 h-1.5 rounded-full bg-[#22C55E] ${loading ? "animate-pulse" : ""}`}
            />
            <span className="text-[10px] font-mono text-[#22C55E] uppercase tracking-wider">
              {loading ? "Syncing" : "Live"}
            </span>
          </div>

          {/* Refresh button */}
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

      {/* Canvas */}
      <div
        ref={wrapperRef}
        className="flex-1 rounded-2xl overflow-hidden border border-[rgba(91,141,217,0.2)] relative"
        style={{ background: "#080F20", minHeight: 220 }}
      >
        <canvas
          ref={canvasRef}
          width={canvasSize.w}
          height={canvasSize.h}
          className="w-full h-full cursor-crosshair"
          onClick={handleClick}
        />

        {/* Error overlay */}
        {error && !loading && (
          <div className="absolute bottom-3 left-3 right-3 rounded-lg px-3 py-2 text-[10px] font-mono text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/25">
            ⚠ {error} — showing fallback data
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { dot: COLOR_BLE_ON,  label: "BLE Active",  sub: "green dot" },
          { dot: COLOR_BLE_OFF, label: "BLE Off",     sub: "grey dot"  },
          { dot: COLOR_RELAY,   label: "Relay Node",  sub: "large ring"},
          { dot: "#F97316",     label: "Battery",     sub: "arc rim"   },
        ].map((l) => (
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

      {/* Selected node detail card */}
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
          {/* BLE status dot */}
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
            style={{
              background: selected.bluetooth_status
                ? "rgba(34,197,94,0.12)"
                : "rgba(75,85,99,0.12)",
              border: `1px solid ${selected.bluetooth_status ? "rgba(34,197,94,0.35)" : "rgba(75,85,99,0.35)"}`,
            }}
          >
            <Bluetooth
              size={18}
              style={{ color: selected.bluetooth_status ? COLOR_BLE_ON : COLOR_BLE_OFF }}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-sm font-bold text-[#E8EEF7]"
                style={{ fontFamily: "Barlow Condensed, sans-serif" }}
              >
                {selected.label}
              </span>
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wider font-mono"
                style={{
                  background: selected.bluetooth_status ? "rgba(34,197,94,0.15)" : "rgba(75,85,99,0.15)",
                  color: selected.bluetooth_status ? COLOR_BLE_ON : COLOR_BLE_OFF,
                }}
              >
                {selected.bluetooth_status ? "BLE·ON" : "BLE·OFF"}
              </span>
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wider"
                style={{ background: "rgba(91,141,217,0.12)", color: "#5B8DD9" }}
              >
                {selected.role}
              </span>
            </div>

            <div className="text-[10px] text-[#7B9CC4] mt-0.5 font-mono">
              {selected.node_id}
            </div>

            <div className="grid grid-cols-3 gap-2 mt-2">
              {/* Signal */}
              <div className="flex items-center gap-1.5">
                <Signal size={11} className="text-[#7B9CC4] shrink-0" />
                <div>
                  <div className="text-[10px] font-mono text-[#E8EEF7]">{selected.signal}%</div>
                  <div className="text-[8px] text-[#7B9CC4]">signal</div>
                </div>
              </div>
              {/* Battery */}
              <div className="flex items-center gap-1.5">
                <Battery size={11} className="text-[#7B9CC4] shrink-0" />
                <div>
                  <div
                    className="text-[10px] font-mono"
                    style={{
                      color:
                        selected.battery_percentage > 60
                          ? "#22C55E"
                          : selected.battery_percentage > 30
                          ? "#F97316"
                          : "#EF4444",
                    }}
                  >
                    {selected.battery_percentage}%
                  </div>
                  <div className="text-[8px] text-[#7B9CC4]">battery</div>
                </div>
              </div>
              {/* Wi-Fi */}
              <div className="flex items-center gap-1.5">
                <Wifi size={11} className="text-[#7B9CC4] shrink-0" />
                <div>
                  <div className="text-[10px] font-mono text-[#E8EEF7]">
                    {selected.device}
                  </div>
                  <div className="text-[8px] text-[#7B9CC4]">device</div>
                </div>
              </div>
            </div>

            {/* Coords */}
            <div className="mt-2 text-[9px] font-mono text-[#7B9CC4]/70">
              {selected.latitude.toFixed(4)}°N · {selected.longitude.toFixed(4)}°E
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
