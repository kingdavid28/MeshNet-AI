/**
 * NodeMapCanvas — Live SVG graphical mesh map
 *
 * Features:
 *  • Equirectangular geo-projection of lat/lng → SVG pixel coordinates
 *  • Zoom (mouse-wheel / pinch) + pan (drag) with transform matrix
 *  • Animated BLE-active edges (dashed green, flow animation)
 *  • Pulsing relay-node rings (CSS keyframe via inline style)
 *  • Animated AI route path overlay with traveling packet dot
 *  • Click-to-select node tooltip panel
 *  • broadcast-active mode forces all nodes green
 *  • Graceful empty / loading / error states
 */

import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import type { CloudantNode } from "../hooks/useCloudantNodes";
import { Bluetooth, Battery, Signal, RefreshCw, Database, Wifi, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const PADDING      = 0.10;   // 10 % margin around the node cloud
const DOT_R_PEER   = 8;
const DOT_R_RELAY  = 11;
const COLOR_ON     = "#22C55E";
const COLOR_OFF    = "#4B5563";
const COLOR_RELAY  = "#5B8DD9";
const COLOR_ROUTE  = "#F97316";
const MIN_ZOOM     = 0.4;
const MAX_ZOOM     = 6;
const PACKET_SPEED = 0.008; // fraction of segment per frame

// ─── Geo projection ───────────────────────────────────────────────────────────

interface Pt { x: number; y: number }

function geoProject(
  nodes: CloudantNode[],
  svgW: number,
  svgH: number,
): Map<string, Pt> {
  if (nodes.length === 0) return new Map();

  const lats = nodes.map((n) => n.latitude);
  const lngs = nodes.map((n) => n.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const latSpan = maxLat - minLat || 0.002;
  const lngSpan = maxLng - minLng || 0.002;

  // Equirectangular aspect correction
  const midLat  = (minLat + maxLat) / 2;
  const cosLat  = Math.cos((midLat * Math.PI) / 180);

  const usableW = svgW * (1 - PADDING * 2);
  const usableH = svgH * (1 - PADDING * 2);
  const offX    = svgW * PADDING;
  const offY    = svgH * PADDING;

  // Choose the axis that constrains the bounding box to preserve aspect ratio
  const scaleX = usableW / (lngSpan * cosLat);
  const scaleY = usableH / latSpan;
  const scale  = Math.min(scaleX, scaleY);

  // Centre the projected cloud in the usable area
  const projW  = lngSpan * cosLat * scale;
  const projH  = latSpan * scale;
  const padX   = (usableW - projW) / 2;
  const padY   = (usableH - projH) / 2;

  const map = new Map<string, Pt>();
  for (const n of nodes) {
    const x = offX + padX + (n.longitude - minLng) * cosLat * scale;
    const y = offY + padY + (maxLat - n.latitude) * scale; // flip lat
    map.set(n.node_id, { x, y });
  }
  return map;
}

// ─── Edge list (connect nodes whose projected distance ≤ threshold) ───────────

interface EdgeDef { a: string; b: string; bothBle: boolean; dist: number }

function buildEdges(
  nodes: CloudantNode[],
  positions: Map<string, Pt>,
  svgW: number,
  svgH: number,
): EdgeDef[] {
  const maxDist = Math.hypot(svgW, svgH) * 0.40;
  const edges: EdgeDef[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = positions.get(nodes[i].node_id);
      const b = positions.get(nodes[j].node_id);
      if (!a || !b) continue;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist > maxDist) continue;
      edges.push({
        a: nodes[i].node_id,
        b: nodes[j].node_id,
        bothBle: nodes[i].bluetooth_status && nodes[j].bluetooth_status,
        dist,
      });
    }
  }
  return edges;
}

// ─── Zoom/pan helpers ─────────────────────────────────────────────────────────

interface Transform { tx: number; ty: number; scale: number }

function clampScale(s: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, s));
}

// ─── Animated route packet ────────────────────────────────────────────────────

function usePacketT(): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    let frame: number;
    function tick() {
      setT((prev) => (prev + PACKET_SPEED) % 1);
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return t;
}

// ─── Pulse animation counter (for relay ripple) ───────────────────────────────

function usePulse(period = 1500): number {
  const [p, setP] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf: number;
    function tick(now: number) {
      setP(((now - start) % period) / period);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [period]);
  return p;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  nodes: CloudantNode[];
  loading: boolean;
  error: string | null;
  source: "cloudant" | "local-backend" | "seed";
  onRefresh?: () => void;
  activeRoutePath?: string[];
  broadcastActive?: boolean;
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
  const svgRef    = useRef<SVGSVGElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);
  const [svgSize, setSvgSize] = useState({ w: 600, h: 400 });
  const [xform,   setXform]   = useState<Transform>({ tx: 0, ty: 0, scale: 1 });
  const [selected, setSelected] = useState<CloudantNode | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const packetT  = usePacketT();
  const pulse    = usePulse(1600);

  // Pan state
  const dragRef = useRef<{ startX: number; startY: number; tx0: number; ty0: number } | null>(null);

  // Resize observer
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSvgSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const effectiveNodes = useMemo(
    () => broadcastActive ? nodes.map((n) => ({ ...n, bluetooth_status: true })) : nodes,
    [nodes, broadcastActive],
  );

  const positions = useMemo(
    () => geoProject(effectiveNodes, svgSize.w, svgSize.h),
    [effectiveNodes, svgSize],
  );

  const edges = useMemo(
    () => buildEdges(effectiveNodes, positions, svgSize.w, svgSize.h),
    [effectiveNodes, positions, svgSize],
  );

  // ── Zoom ──────────────────────────────────────────────────────────────────

  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const rect = svgRef.current!.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setXform((prev) => {
      const newScale = clampScale(prev.scale * factor);
      // Zoom toward mouse pointer
      const tx = mx - (mx - prev.tx) * (newScale / prev.scale);
      const ty = my - (my - prev.ty) * (newScale / prev.scale);
      return { tx, ty, scale: newScale };
    });
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Only pan on background (not on a node circle)
    if ((e.target as SVGElement).closest("[data-node]")) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, tx0: xform.tx, ty0: xform.ty };
  }, [xform]);

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setXform((prev) => ({
      ...prev,
      tx: dragRef.current!.tx0 + dx,
      ty: dragRef.current!.ty0 + dy,
    }));
  }, []);

  const onMouseUp = useCallback(() => { dragRef.current = null; }, []);

  const resetView = useCallback(() => setXform({ tx: 0, ty: 0, scale: 1 }), []);
  const zoomIn    = useCallback(() => setXform((p) => ({ ...p, scale: clampScale(p.scale * 1.25) })), []);
  const zoomOut   = useCallback(() => setXform((p) => ({ ...p, scale: clampScale(p.scale / 1.25) })), []);

  // ── Node click ────────────────────────────────────────────────────────────

  const handleNodeClick = useCallback((node: CloudantNode, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected((prev) => (prev?.node_id === node.node_id ? null : node));
    onNodeClick?.(node);
  }, [onNodeClick]);

  // Click on SVG background deselects
  const handleBgClick = useCallback(() => setSelected(null), []);

  // ── Route overlay ─────────────────────────────────────────────────────────

  const routeSegments = useMemo(() => {
    if (activeRoutePath.length < 2) return [];
    const segs: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    for (let i = 0; i < activeRoutePath.length - 1; i++) {
      const a = positions.get(activeRoutePath[i]);
      const b = positions.get(activeRoutePath[i + 1]);
      if (a && b) segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
    return segs;
  }, [activeRoutePath, positions]);

  // Traveling packet position along route
  const packetPos = useMemo((): Pt | null => {
    if (routeSegments.length === 0) return null;
    const totalSegs = routeSegments.length;
    const globalT   = packetT * totalSegs;
    const segIdx    = Math.floor(globalT) % totalSegs;
    const localT    = globalT - Math.floor(globalT);
    const seg       = routeSegments[segIdx];
    return {
      x: seg.x1 + (seg.x2 - seg.x1) * localT,
      y: seg.y1 + (seg.y2 - seg.y1) * localT,
    };
  }, [packetT, routeSegments]);

  // ── Source badge ──────────────────────────────────────────────────────────

  const sourceBadge: { label: string; color: string } = {
    cloudant:        { label: "IBM Cloudant", color: "#5B8DD9" },
    "local-backend": { label: "Local Backend", color: "#F97316" },
    seed:            { label: "Seed Data",     color: "#7B9CC4" },
  }[source];

  // ── SVG transform string ──────────────────────────────────────────────────

  const transformStr = `translate(${xform.tx} ${xform.ty}) scale(${xform.scale})`;

  // ── Render ────────────────────────────────────────────────────────────────

  const bleActiveCount = effectiveNodes.filter((n) => n.bluetooth_status).length;

  return (
    <div className="flex flex-col gap-3 h-full">

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
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
            &nbsp;·&nbsp;{bleActiveCount} BLE active
            &nbsp;·&nbsp;{edges.length} link{edges.length !== 1 ? "s" : ""}
            {activeRoutePath.length > 1 && (
              <span className="text-[#F97316]">
                &nbsp;·&nbsp;route: {activeRoutePath.length - 1} hop{activeRoutePath.length > 2 ? "s" : ""}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
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

          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={zoomIn}
              className="w-7 h-7 rounded-lg bg-[#132B5A] border border-[rgba(91,141,217,0.2)] flex items-center justify-center active:scale-90 transition-transform"
              title="Zoom in"
            >
              <ZoomIn size={12} className="text-[#7B9CC4]" />
            </button>
            <button
              onClick={zoomOut}
              className="w-7 h-7 rounded-lg bg-[#132B5A] border border-[rgba(91,141,217,0.2)] flex items-center justify-center active:scale-90 transition-transform"
              title="Zoom out"
            >
              <ZoomOut size={12} className="text-[#7B9CC4]" />
            </button>
            <button
              onClick={resetView}
              className="w-7 h-7 rounded-lg bg-[#132B5A] border border-[rgba(91,141,217,0.2)] flex items-center justify-center active:scale-90 transition-transform"
              title="Reset view"
            >
              <Maximize2 size={12} className="text-[#7B9CC4]" />
            </button>
          </div>

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

      {/* ── SVG map canvas ─────────────────────────────────────────────────── */}
      <div
        ref={wrapRef}
        className="flex-1 rounded-2xl overflow-hidden border border-[rgba(91,141,217,0.2)] relative select-none"
        style={{ background: "#080F20", minHeight: 220 }}
      >
        <svg
          ref={svgRef}
          width={svgSize.w}
          height={svgSize.h}
          className="w-full h-full cursor-grab active:cursor-grabbing"
          onWheel={onWheel}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onClick={handleBgClick}
        >
          <defs>
            {/* Route glow filter */}
            <filter id="glow-route" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            {/* Node glow filter */}
            <filter id="glow-node" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            {/* BLE edge animated dash */}
            <style>{`
              @keyframes ble-flow { to { stroke-dashoffset: -24; } }
              .ble-edge { animation: ble-flow 1.2s linear infinite; }
              @keyframes relay-pulse {
                0%   { r: 0; opacity: 0.5; }
                100% { r: 20; opacity: 0; }
              }
              .relay-ring { animation: relay-pulse 1.6s ease-out infinite; }
            `}</style>
          </defs>

          {/* Background grid dots */}
          {Array.from({ length: Math.ceil(svgSize.w / 24) }, (_, xi) =>
            Array.from({ length: Math.ceil(svgSize.h / 24) }, (_, yi) => (
              <circle
                key={`g${xi}-${yi}`}
                cx={xi * 24}
                cy={yi * 24}
                r={0.8}
                fill="rgba(91,141,217,0.06)"
              />
            ))
          )}

          {/* Zoomable / pannable group */}
          <g transform={transformStr}>

            {/* ── Edges ──────────────────────────────────────────────────── */}
            {edges.map((e) => {
              const a = positions.get(e.a)!;
              const b = positions.get(e.b)!;
              return (
                <line
                  key={`${e.a}-${e.b}`}
                  x1={a.x} y1={a.y}
                  x2={b.x} y2={b.y}
                  stroke={e.bothBle ? COLOR_ON : COLOR_OFF}
                  strokeWidth={e.bothBle ? 1.5 : 1}
                  strokeOpacity={e.bothBle ? 0.55 : 0.18}
                  strokeDasharray={e.bothBle ? "8 4" : "4 6"}
                  className={e.bothBle ? "ble-edge" : undefined}
                />
              );
            })}

            {/* ── Active route overlay ───────────────────────────────────── */}
            {routeSegments.map((seg, i) => (
              <line
                key={`route-${i}`}
                x1={seg.x1} y1={seg.y1}
                x2={seg.x2} y2={seg.y2}
                stroke={COLOR_ROUTE}
                strokeWidth={3}
                strokeOpacity={0.9}
                filter="url(#glow-route)"
              />
            ))}

            {/* Traveling packet */}
            {packetPos && (
              <circle
                cx={packetPos.x}
                cy={packetPos.y}
                r={5}
                fill="#FFFFFF"
                filter="url(#glow-route)"
                opacity={0.95}
              />
            )}

            {/* ── Nodes ──────────────────────────────────────────────────── */}
            {effectiveNodes.map((node) => {
              const pos = positions.get(node.node_id);
              if (!pos) return null as unknown as ReactNode;
              const { x, y } = pos;
              const ble    = node.bluetooth_status;
              const isRelay = node.role === "relay";
              const r      = isRelay ? DOT_R_RELAY : DOT_R_PEER;
              const color  = ble ? COLOR_ON : COLOR_OFF;
              const isSelected = selected?.node_id === node.node_id;
              const isHovered  = hoveredId === node.node_id;
              const isOnRoute  = activeRoutePath.includes(node.node_id);
              const battFrac   = node.battery_percentage / 100;
              const battColor  = battFrac > 0.6 ? COLOR_ON : battFrac > 0.3 ? "#F97316" : "#EF4444";

              // Battery arc (bottom semicircle)
              const arcR    = r + 5;
              const arcStart = Math.PI * 0.1;
              const arcEnd   = Math.PI * 0.9;
              const aSpan    = (arcEnd - arcStart) * battFrac;
              const aS       = arcStart + (arcEnd - arcStart) * (1 - battFrac);
              const battArc  = `M ${x + arcR * Math.cos(aS)} ${y + arcR * Math.sin(aS)}
                A ${arcR} ${arcR} 0 ${aSpan > Math.PI ? 1 : 0} 1
                ${x + arcR * Math.cos(arcEnd)} ${y + arcR * Math.sin(arcEnd)}`;

              return (
                <g
                  key={node.node_id}
                  data-node={node.node_id}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => handleNodeClick(node, e)}
                  onMouseEnter={() => setHoveredId(node.node_id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {/* Pulse ring — relay + BLE on */}
                  {ble && isRelay && (
                    <circle
                      cx={x} cy={y}
                      r={r + pulse * 20}
                      fill="none"
                      stroke={COLOR_ON}
                      strokeWidth={1.5}
                      opacity={(1 - pulse) * 0.35}
                    />
                  )}

                  {/* Selection ring */}
                  {isSelected && (
                    <circle
                      cx={x} cy={y}
                      r={r + 7}
                      fill="none"
                      stroke="rgba(249,115,22,0.7)"
                      strokeWidth={2}
                    />
                  )}

                  {/* Route node highlight */}
                  {isOnRoute && !isSelected && (
                    <circle
                      cx={x} cy={y}
                      r={r + 5}
                      fill="none"
                      stroke="rgba(249,115,22,0.4)"
                      strokeWidth={1.5}
                    />
                  )}

                  {/* Relay outer ring */}
                  {isRelay && (
                    <circle
                      cx={x} cy={y}
                      r={r + 3}
                      fill="none"
                      stroke={ble ? "rgba(34,197,94,0.35)" : "rgba(75,85,99,0.3)"}
                      strokeWidth={1}
                    />
                  )}

                  {/* Node fill */}
                  <circle
                    cx={x} cy={y} r={r}
                    fill={ble ? "rgba(34,197,94,0.15)" : "rgba(75,85,99,0.15)"}
                    stroke={color}
                    strokeWidth={isHovered ? 3 : 2.5}
                    filter={ble ? "url(#glow-node)" : undefined}
                  />

                  {/* Inner dot */}
                  <circle cx={x} cy={y} r={r * 0.36} fill={color} />

                  {/* Battery arc */}
                  <path
                    d={battArc}
                    fill="none"
                    stroke={battColor}
                    strokeWidth={2}
                    strokeLinecap="round"
                  />

                  {/* Label */}
                  <text
                    x={x} y={y + r + 13}
                    textAnchor="middle"
                    fontSize={8.5}
                    fontWeight="bold"
                    fontFamily="Barlow Condensed, sans-serif"
                    fill="#E8EEF7"
                  >
                    {node.label}
                  </text>

                  {/* BLE sub-label */}
                  <text
                    x={x} y={y + r + 22}
                    textAnchor="middle"
                    fontSize={7}
                    fontFamily="JetBrains Mono, monospace"
                    fill={ble ? COLOR_ON : COLOR_OFF}
                  >
                    {ble ? "BLE·ON" : "BLE·OFF"}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Error overlay */}
        {error && !loading && (
          <div className="absolute bottom-3 left-3 right-3 rounded-lg px-3 py-2 text-[10px] font-mono text-[#F97316] bg-[#F97316]/10 border border-[#F97316]/25">
            ⚠ {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && effectiveNodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="text-[#7B9CC4] text-xs font-mono">No nodes loaded</div>
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#132B5A] border border-[rgba(91,141,217,0.25)] text-[10px] font-mono text-[#7B9CC4] hover:text-[#E8EEF7]"
              >
                <RefreshCw size={10} /> Retry
              </button>
            )}
          </div>
        )}

        {/* Zoom hint */}
        <div className="absolute bottom-3 right-3 text-[8px] font-mono text-[#7B9CC4]/40 pointer-events-none">
          scroll to zoom · drag to pan
        </div>
      </div>

      {/* ── Legend ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2">
        {([
          { dot: COLOR_ON,    label: "BLE Active",  sub: "green dot"  },
          { dot: COLOR_OFF,   label: "BLE Off",     sub: "grey dot"   },
          { dot: COLOR_RELAY, label: "Relay Node",  sub: "large ring" },
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

      {/* ── Selected node detail card ───────────────────────────────────────── */}
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
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
            style={{
              background: selected.bluetooth_status ? "rgba(34,197,94,0.12)" : "rgba(75,85,99,0.12)",
              border: `1px solid ${selected.bluetooth_status ? "rgba(34,197,94,0.35)" : "rgba(75,85,99,0.35)"}`,
            }}
          >
            <Bluetooth
              size={18}
              style={{ color: selected.bluetooth_status ? COLOR_ON : COLOR_OFF }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-[#E8EEF7]" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>
                {selected.label}
              </span>
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wider font-mono"
                style={{
                  background: selected.bluetooth_status ? "rgba(34,197,94,0.15)" : "rgba(75,85,99,0.15)",
                  color: selected.bluetooth_status ? COLOR_ON : COLOR_OFF,
                }}
              >
                {selected.bluetooth_status ? "BLE·ON" : "BLE·OFF"}
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
