/**
 * SimPerfOverlay
 * ─────────────────────────────────────────────────────────────────────────────
 * Non-intrusive performance overlay for the simulation mode map tab.
 *
 * Shows:
 *  • Tick counter and interval
 *  • Last tick computation time in ms
 *  • React render count (tracks how many times MapTab re-renders per tick)
 *  • Pause / Resume button
 *
 * Rendered as a translucent chip in the top-right corner of the map area so it
 * does not obstruct the Leaflet canvas.  It is DOM-only (no canvas painting)
 * so its own render cost is negligible.
 *
 * The render counter uses a ref — incrementing a ref never triggers a re-render
 * of this component, so the displayed count is always one paint behind (showing
 * renders that already completed), which is exactly what we want.
 */

import { useRef, useEffect } from "react";
import type { SimulationStats } from "../hooks/useMockNodeSimulation";

interface Props {
  stats:     SimulationStats;
  tickMs:    number;
  nodeCount: number;
  isPaused:  boolean;
  onPause:   () => void;
  onResume:  () => void;
}

export default function SimPerfOverlay({
  stats,
  tickMs,
  nodeCount,
  isPaused,
  onPause,
  onResume,
}: Props) {
  // Count how many times this component itself re-renders — a proxy for the
  // parent MapTab re-render count because it receives the same props chain.
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  // Track renders per tick — reset on each tick
  const rendersThisTickRef    = useRef(0);
  const prevTickCountRef      = useRef(stats.tickCount);
  const rendersPerTickDisplay = useRef(0);

  if (stats.tickCount !== prevTickCountRef.current) {
    rendersPerTickDisplay.current  = rendersThisTickRef.current;
    rendersThisTickRef.current     = 0;
    prevTickCountRef.current       = stats.tickCount;
  }
  rendersThisTickRef.current += 1;

  // Flash the tick indicator green for 400 ms after each tick
  const flashRef  = useRef<HTMLDivElement | null>(null);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (stats.tickCount === 0) return;
    const el = flashRef.current;
    if (!el) return;
    el.style.background = "rgba(34,197,94,0.25)";
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (el) el.style.background = "rgba(11,29,58,0.85)";
    }, 400);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [stats.tickCount]);

  const tickBudgetOk = stats.lastTickMs < 4; // <4 ms is well under a 16 ms frame

  return (
    <div
      ref={flashRef}
      style={{
        position:      "absolute",
        top:            10,
        right:          10,
        zIndex:         1001,
        background:    "rgba(11,29,58,0.85)",
        border:        "1px solid rgba(91,141,217,0.25)",
        borderRadius:   8,
        padding:       "6px 10px",
        minWidth:       148,
        fontFamily:    "monospace",
        fontSize:       10,
        color:         "#7B9CC4",
        lineHeight:    1.7,
        backdropFilter: "blur(4px)",
        transition:    "background 0.15s ease",
        userSelect:    "none",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontWeight: 700, color: "#E8EEF7", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Sim Perf
        </span>
        <button
          onClick={isPaused ? onResume : onPause}
          style={{
            background:   isPaused ? "rgba(249,115,22,0.15)" : "rgba(34,197,94,0.12)",
            border:       `1px solid ${isPaused ? "rgba(249,115,22,0.4)" : "rgba(34,197,94,0.3)"}`,
            borderRadius:  4,
            color:         isPaused ? "#F97316" : "#22C55E",
            fontSize:      9,
            padding:      "1px 6px",
            cursor:       "pointer",
            fontFamily:   "monospace",
            letterSpacing: "0.05em",
          }}
        >
          {isPaused ? "▶ RESUME" : "⏸ PAUSE"}
        </button>
      </div>

      {/* Metrics grid */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "1px 8px" }}>
        <span style={{ color: "#57606a" }}>nodes</span>
        <span style={{ color: "#E8EEF7" }}>{nodeCount}</span>

        <span style={{ color: "#57606a" }}>interval</span>
        <span style={{ color: "#E8EEF7" }}>{(tickMs / 1000).toFixed(1)} s</span>

        <span style={{ color: "#57606a" }}>ticks</span>
        <span style={{ color: "#14B8A6" }}>{stats.tickCount}</span>

        <span style={{ color: "#57606a" }}>tick cost</span>
        <span style={{ color: tickBudgetOk ? "#22C55E" : "#F97316" }}>
          {stats.lastTickMs > 0 ? `${stats.lastTickMs} ms` : "—"}
        </span>

        <span style={{ color: "#57606a" }}>renders/tick</span>
        <span style={{ color: rendersPerTickDisplay.current <= 1 ? "#22C55E" : "#F97316" }}>
          {rendersPerTickDisplay.current || "—"}
        </span>

        <span style={{ color: "#57606a" }}>total renders</span>
        <span style={{ color: "#7B9CC4" }}>{renderCountRef.current}</span>
      </div>
    </div>
  );
}
