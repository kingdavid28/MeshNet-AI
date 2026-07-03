/**
 * LeafletMap.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Real-map Leaflet layer for NodeMapCanvas.
 *
 * Features
 * ────────
 *  • OpenStreetMap tiles served from /public/tiles/{z}/{x}/{y}.png  (offline)
 *  • Falls back to tile.openstreetmap.org when the local bundle is absent
 *  • BLE-active edges rendered as green animated Polylines
 *  • Inactive edges rendered as grey dashed Polylines
 *  • AI route overlay as orange bold Polyline with blinking packet dot
 *  • Custom SVG DivIcon per node — colour-coded by BLE/relay status
 *  • Click-to-select node → fires onNodeClick
 *  • broadcast-active mode forces every marker green
 *  • Map auto-fits to node bounds on first load
 *
 * Tile URL strategy (tries local first, falls back to OSM CDN):
 *   /tiles/{z}/{x}/{y}.png  ← run scripts/download-tiles.mjs once
 *   https://tile.openstreetmap.org/{z}/{x}/{y}.png  ← live fallback
 *
 * Attribution: © OpenStreetMap contributors  (required by tile licence)
 */

import { useEffect, useRef, useMemo, useCallback } from "react";
import type { ReactNode } from "react";
import L from "leaflet";
import type { CloudantNode } from "../hooks/useCloudantNodes";

// ── Fix Leaflet's default icon paths broken by Vite bundling ─────────────────
// Leaflet tries to load marker icons from a path Vite doesn't expose.
// We override with inline SVG so no external image files are needed.
delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl;

// ── Colour palette (mirrors NodeMapCanvas constants) ─────────────────────────
const C_ON    = "#22C55E";
const C_OFF   = "#4B5563";
const C_RELAY = "#5B8DD9";
const C_ROUTE = "#F97316";

// ── Node SVG icon factory ─────────────────────────────────────────────────────

function makeIcon(ble: boolean, isRelay: boolean, isSelected: boolean): L.DivIcon {
  const r      = isRelay ? 11 : 8;
  const size   = (r + (isSelected ? 10 : 6)) * 2;
  const cx     = size / 2;
  const fill   = ble ? (isRelay ? C_RELAY : C_ON) : C_OFF;
  const ring   = isSelected ? C_ROUTE : (ble ? fill : C_OFF);
  const rOuter = r + (isSelected ? 8 : 4);

  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"
    xmlns="http://www.w3.org/2000/svg">
    ${isRelay ? `<circle cx="${cx}" cy="${cx}" r="${rOuter}"
      fill="none" stroke="${ring}" stroke-width="${isSelected ? 2.5 : 1.5}" opacity="0.7"/>` : ""}
    ${isSelected ? `<circle cx="${cx}" cy="${cx}" r="${rOuter + 4}"
      fill="none" stroke="${C_ROUTE}" stroke-width="2" opacity="0.5"/>` : ""}
    <circle cx="${cx}" cy="${cx}" r="${r}"
      fill="${fill}25" stroke="${fill}" stroke-width="${isSelected ? 3 : 2.5}"
      ${ble ? `filter="drop-shadow(0 0 4px ${fill}99)"` : ""}/>
    <circle cx="${cx}" cy="${cx}" r="${r * 0.36}" fill="${fill}"/>
  </svg>`;

  return L.divIcon({
    html: svg,
    className: "",           // prevent Leaflet's default white box
    iconSize:    [size, size],
    iconAnchor:  [cx, cx],
    popupAnchor: [0, -(r + 6)],
  });
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  nodes:            CloudantNode[];
  activeRoutePath?: string[];
  broadcastActive?: boolean;
  onNodeClick?:     (node: CloudantNode) => void;
  selectedNodeId?:  string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LeafletMap({
  nodes,
  activeRoutePath = [],
  broadcastActive = false,
  onNodeClick,
  selectedNodeId,
}: Props): ReactNode {
  const divRef      = useRef<HTMLDivElement>(null);
  const mapRef      = useRef<L.Map | null>(null);
  const markersRef  = useRef<Map<string, L.Marker>>(new Map());
  const edgesRef    = useRef<L.Polyline[]>([]);
  const routeRef    = useRef<L.Polyline | null>(null);
  const packetRef   = useRef<L.CircleMarker | null>(null);
  const packetRafRef = useRef<number>(0);
  const fittedRef   = useRef(false);

  // Effective nodes: broadcast forces all BLE on
  const effective = useMemo(
    () => broadcastActive ? nodes.map((n) => ({ ...n, bluetooth_status: true })) : nodes,
    [nodes, broadcastActive],
  );

  // ── Initialise map once ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!divRef.current || mapRef.current) return;

    const map = L.map(divRef.current, {
      zoomControl:        true,
      attributionControl: true,
      center:             [14.5995, 120.9842],  // Manila fallback
      zoom:               15,
      maxZoom:            17,
    });

    // ── Tile layer: local offline bundle → OSM CDN fallback ───────────────────
    const localTile = L.tileLayer("/tiles/{z}/{x}/{y}.png", {
      minZoom:     12,
      maxZoom:     17,   // z17 = building-level (core area pre-downloaded)
      maxNativeZoom: 17,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      errorTileUrl: "",   // suppress 404 icons while we check
    });

    const osmTile = L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        minZoom:     12,
        maxZoom:     19,   // OSM CDN supports up to z19
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    );

    // Try loading one local tile — if it 404s, switch to OSM CDN.
    // Tile coords for Manila centre (14.5995°N, 120.9842°E) at z=15:
    //   x = 27394,  y = 15037   (verified against public/tiles/ contents)
    const probe = new Image();
    probe.onload  = () => { localTile.addTo(map); };
    probe.onerror = () => { osmTile.addTo(map); };
    probe.src     = "/tiles/15/27394/15037.png";  // Manila centre z=15 tile

    mapRef.current = map;
    return () => {
      cancelAnimationFrame(packetRafRef.current);
      map.remove();
      mapRef.current = null;
      fittedRef.current = false;
    };
  }, []);

  // ── Update markers whenever nodes/selection changes ─────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set<string>();

    for (const node of effective) {
      seen.add(node.node_id);
      const ble      = node.bluetooth_status;
      const isRelay  = node.role === "relay";
      const isSel    = node.node_id === selectedNodeId;
      const icon     = makeIcon(ble, isRelay, isSel);
      const latlng   = L.latLng(node.latitude, node.longitude);

      let marker = markersRef.current.get(node.node_id);
      if (!marker) {
        marker = L.marker(latlng, { icon })
          .addTo(map)
          .bindTooltip(
            `<b>${node.label}</b><br/>
             ${node.role} · ${ble ? "BLE ON" : "BLE OFF"}<br/>
             Battery ${node.battery_percentage}% · Signal ${node.signal}%`,
            { direction: "top", offset: [0, -4], className: "meshnet-tip" },
          );
        // capture node in closure for click handler
        const captured = node;
        marker.on("click", () => onNodeClick?.(captured));
        markersRef.current.set(node.node_id, marker);
      } else {
        marker.setLatLng(latlng);
        marker.setIcon(icon);
        // Update tooltip
        marker.setTooltipContent(
          `<b>${node.label}</b><br/>
           ${node.role} · ${ble ? "BLE ON" : "BLE OFF"}<br/>
           Battery ${node.battery_percentage}% · Signal ${node.signal}%`,
        );
        // Re-bind click with fresh node data
        marker.off("click");
        const captured = node;
        marker.on("click", () => onNodeClick?.(captured));
      }
    }

    // Remove stale markers
    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    // Auto-fit bounds on first load
    if (!fittedRef.current && effective.length > 0) {
      const latlngs = effective.map((n) => L.latLng(n.latitude, n.longitude));
      map.fitBounds(L.latLngBounds(latlngs), { padding: [48, 48], maxZoom: 16 });
      fittedRef.current = true;
    }
  }, [effective, selectedNodeId, onNodeClick]);

  // ── Draw BLE edges between nearby nodes ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove old edges
    edgesRef.current.forEach((p) => p.remove());
    edgesRef.current = [];

    // Build edges: connect nodes within ~600 m (0.006° ≈ 660 m)
    const MAX_DEG = 0.006;
    for (let i = 0; i < effective.length; i++) {
      for (let j = i + 1; j < effective.length; j++) {
        const a = effective[i];
        const b = effective[j];
        const dLat = Math.abs(a.latitude  - b.latitude);
        const dLng = Math.abs(a.longitude - b.longitude);
        if (dLat > MAX_DEG || dLng > MAX_DEG) continue;

        const bothBle = a.bluetooth_status && b.bluetooth_status;
        const line = L.polyline(
          [L.latLng(a.latitude, a.longitude), L.latLng(b.latitude, b.longitude)],
          {
            color:     bothBle ? C_ON : C_OFF,
            weight:    bothBle ? 2 : 1,
            opacity:   bothBle ? 0.55 : 0.2,
            dashArray: bothBle ? "8, 5" : "4, 7",
          },
        ).addTo(map);
        edgesRef.current.push(line);
      }
    }
  }, [effective]);

  // ── AI route overlay + animated packet dot ───────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove old route + packet
    routeRef.current?.remove();
    routeRef.current = null;
    packetRef.current?.remove();
    packetRef.current = null;
    cancelAnimationFrame(packetRafRef.current);

    if (activeRoutePath.length < 2) return;

    const nodeById = new Map(effective.map((n) => [n.node_id, n]));
    const routeLatLngs: L.LatLng[] = [];
    for (const id of activeRoutePath) {
      const n = nodeById.get(id);
      if (n) routeLatLngs.push(L.latLng(n.latitude, n.longitude));
    }
    if (routeLatLngs.length < 2) return;

    routeRef.current = L.polyline(routeLatLngs, {
      color:   C_ROUTE,
      weight:  4,
      opacity: 0.9,
    }).addTo(map);

    // Packet dot travelling along the route
    packetRef.current = L.circleMarker(routeLatLngs[0], {
      radius:      6,
      color:       "#FFFFFF",
      fillColor:   "#FFFFFF",
      fillOpacity: 0.95,
      weight:      2,
    }).addTo(map);

    // Animate packet
    let t = 0;
    const totalSegs = routeLatLngs.length - 1;
    const SPEED = 0.008;

    function tick() {
      t = (t + SPEED) % 1;
      const globalT  = t * totalSegs;
      const segIdx   = Math.floor(globalT) % totalSegs;
      const localT   = globalT - Math.floor(globalT);
      const a        = routeLatLngs[segIdx];
      const b        = routeLatLngs[segIdx + 1];
      const lat      = a.lat + (b.lat - a.lat) * localT;
      const lng      = a.lng + (b.lng - a.lng) * localT;
      packetRef.current?.setLatLng([lat, lng]);
      packetRafRef.current = requestAnimationFrame(tick);
    }
    packetRafRef.current = requestAnimationFrame(tick);

    return () => { cancelAnimationFrame(packetRafRef.current); };
  }, [activeRoutePath, effective]);

  // ── Tooltip style injected once ──────────────────────────────────────────────
  useEffect(() => {
    const id = "meshnet-tip-style";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      .meshnet-tip {
        background: #0F2040 !important;
        border: 1px solid rgba(91,141,217,0.35) !important;
        color: #E8EEF7 !important;
        font-family: 'JetBrains Mono', monospace;
        font-size: 10px !important;
        line-height: 1.5;
        border-radius: 6px !important;
        padding: 5px 8px !important;
        box-shadow: 0 2px 12px rgba(0,0,0,0.5) !important;
      }
      .meshnet-tip::before { display: none !important; }
      .leaflet-attribution-flag { display: none !important; }
    `;
    document.head.appendChild(style);
  }, []);

  // Invalidate map size whenever the container resizes
  const containerRef = useCallback((el: HTMLDivElement | null) => {
    (divRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    if (el && mapRef.current) {
      setTimeout(() => mapRef.current?.invalidateSize(), 0);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", minHeight: 220 }}
    />
  );
}
