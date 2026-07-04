/**
 * LeafletMap.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Real-map Leaflet layer for NodeMapCanvas.
 *
 * Features
 * ────────
 *  • OpenStreetMap CDN tiles (live)
 *  • Device GPS location — pulsing blue "you are here" marker, map flies to
 *    the device on first fix; subsequent position updates move the marker
 *  • BLE-active edges rendered as green dashed Polylines
 *  • Inactive edges rendered as grey dashed Polylines
 *  • AI route overlay as orange bold Polyline with animated packet dot
 *  • Custom SVG DivIcon per node — colour-coded by BLE/relay status
 *  • Click-to-select node → fires onNodeClick
 *  • Map auto-fits to node bounds when no device location is available
 *
 * Attribution: © OpenStreetMap contributors  (required by tile licence)
 */

import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import L from "leaflet";
import markerIcon    from "leaflet/dist/images/marker-icon.png";
import markerIcon2x  from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow  from "leaflet/dist/images/marker-shadow.png";
import type { CloudantNode } from "../hooks/useCloudantNodes";
import type { DeviceLocation } from "../hooks/useDeviceLocation";

// ── Fix Leaflet's default icon paths broken by Vite bundling ─────────────────
// Using mergeOptions is safer than deleting _getIconUrl: it configures a real
// fallback for any code that creates a default marker in the future.
L.Icon.Default.mergeOptions({
  iconUrl:       markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl:     markerShadow,
});

// ── Colour palette ────────────────────────────────────────────────────────────
const C_BOTH  = "#14B8A6";   // teal  — BLE + Wi-Fi active
const C_BLE   = "#22C55E";   // green — Bluetooth only
const C_WIFI  = "#3B82F6";   // blue  — Wi-Fi Direct only
const C_OFF   = "#4B5563";   // grey  — all radios off
const C_RELAY = "#5B8DD9";   // blue-grey relay ring
const C_ROUTE = "#F97316";   // orange AI route

import type { ProtocolActive } from "../hooks/useCloudantNodes";

/** Map protocol_active → fill colour. */
function protocolColor(p: ProtocolActive): string {
  if (p === "both")      return C_BOTH;
  if (p === "bluetooth") return C_BLE;
  if (p === "wifi")      return C_WIFI;
  return C_OFF;
}

// ── Node SVG icon factory ─────────────────────────────────────────────────────

function makeIcon(
  protocol: ProtocolActive,
  isRelay: boolean,
  isSelected: boolean,
): L.DivIcon {
  const r      = isRelay ? 11 : 8;
  const size   = (r + (isSelected ? 10 : 6)) * 2;
  const cx     = size / 2;
  const fill   = protocolColor(protocol);
  const active = protocol !== "none";
  const ring   = isSelected ? C_ROUTE : (active ? fill : C_OFF);
  const rOuter = r + (isSelected ? 8 : 4);

  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"
    xmlns="http://www.w3.org/2000/svg">
    ${isRelay ? `<circle cx="${cx}" cy="${cx}" r="${rOuter}"
      fill="none" stroke="${ring}" stroke-width="${isSelected ? 2.5 : 1.5}" opacity="0.7"/>` : ""}
    ${isSelected ? `<circle cx="${cx}" cy="${cx}" r="${rOuter + 4}"
      fill="none" stroke="${C_ROUTE}" stroke-width="2" opacity="0.5"/>` : ""}
    <circle cx="${cx}" cy="${cx}" r="${r}"
      fill="${fill}25" stroke="${fill}" stroke-width="${isSelected ? 3 : 2.5}"
      ${active ? `filter="drop-shadow(0 0 4px ${fill}99)"` : ""}/>
    <circle cx="${cx}" cy="${cx}" r="${r * 0.36}" fill="${fill}"/>
  </svg>`;

  return L.divIcon({
    html: svg,
    className: "",
    iconSize:    [size, size],
    iconAnchor:  [cx, cx],
    popupAnchor: [0, -(r + 6)],
  });
}

// ── "You are here" SVG DivIcon ────────────────────────────────────────────────

function makeDeviceIcon(accuracy: number | null): L.DivIcon {
  // Outer pulse ring scales with accuracy but is capped for readability.
  const ring = Math.min(Math.max(accuracy ?? 40, 20), 80);
  const svg = `<svg width="${ring * 2}" height="${ring * 2}"
      viewBox="0 0 ${ring * 2} ${ring * 2}" xmlns="http://www.w3.org/2000/svg">
    <!-- Accuracy circle -->
    <circle cx="${ring}" cy="${ring}" r="${ring - 2}"
      fill="rgba(59,130,246,0.12)" stroke="rgba(59,130,246,0.4)"
      stroke-width="1.5"/>
    <!-- Solid dot -->
    <circle cx="${ring}" cy="${ring}" r="8"
      fill="#3B82F6" stroke="#ffffff" stroke-width="2.5"/>
  </svg>`;
  return L.divIcon({
    html:        svg,
    className:   "",
    iconSize:    [ring * 2, ring * 2],
    iconAnchor:  [ring, ring],
    popupAnchor: [0, -ring],
  });
}

// ── Props + imperative handle ─────────────────────────────────────────────────

interface Props {
  nodes:            CloudantNode[];
  activeRoutePath?: string[];
  onNodeClick?:     (node: CloudantNode) => void;
  selectedNodeId?:  string | null;
  /** Live device GPS coordinates from useDeviceLocation */
  deviceLocation?:  DeviceLocation | null;
  /** When true, force all nodes to show as fully active (BLE+Wi-Fi both) */
  broadcastActive?: boolean;
}

export interface LeafletMapHandle {
  /** Fly the map to the current device location (no-op if no fix yet). */
  locateMe(): void;
  /** Fit the map view to all node markers. */
  fitNodes(): void;
}

// ── Component ─────────────────────────────────────────────────────────────────

const LeafletMap = forwardRef<LeafletMapHandle, Props>(function LeafletMap({
  nodes,
  activeRoutePath = [],
  onNodeClick,
  selectedNodeId,
  deviceLocation,
  broadcastActive = false,
}, ref) {
  const divRef          = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<L.Map | null>(null);
  const markersRef      = useRef<Map<string, L.Marker>>(new Map());
  const edgesRef        = useRef<L.Polyline[]>([]);
  const routeRef        = useRef<L.Polyline | null>(null);
  const packetRef       = useRef<L.CircleMarker | null>(null);
  const packetRafRef    = useRef<number>(0);
  const fittedRef       = useRef(false);
  const deviceMarkerRef = useRef<L.Marker | null>(null);
  // true after the map has flown to the device location at least once
  const deviceFlyRef    = useRef(false);
  // Keep a stable ref to onNodeClick so marker click handlers don't need
  // to be re-bound on every render when only the callback identity changes.
  const onNodeClickRef  = useRef(onNodeClick);
  useEffect(() => { onNodeClickRef.current = onNodeClick; }, [onNodeClick]);
  // Keep a live ref to the latest props so tryInit can seed the map
  // with whatever data has already arrived by the time the DOM is ready.
  const nodesRef             = useRef(nodes);
  const selectedNodeIdRef    = useRef(selectedNodeId);
  const broadcastActiveRef   = useRef(broadcastActive);
  useEffect(() => { nodesRef.current = nodes; },            [nodes]);
  useEffect(() => { selectedNodeIdRef.current = selectedNodeId; }, [selectedNodeId]);
  useEffect(() => { broadcastActiveRef.current = broadcastActive; }, [broadcastActive]);

  // ── Imperative handle — lets NodeMapCanvas call locateMe() / fitNodes() ─────
  useImperativeHandle(ref, () => ({
    locateMe() {
      const map = mapRef.current;
      if (!map || !deviceLocation || deviceLocation.status !== "ok") return;
      if (deviceLocation.lat === null || deviceLocation.lng === null) return;
      map.flyTo([deviceLocation.lat, deviceLocation.lng], 16, { animate: true, duration: 1 });
    },
    fitNodes() {
      const map = mapRef.current;
      if (!map || nodes.length === 0) return;
      const latlngs = nodes.map((n) => L.latLng(n.latitude, n.longitude));
      map.fitBounds(L.latLngBounds(latlngs), { padding: [48, 48], maxZoom: 16 });
    },
  }), [deviceLocation, nodes]);

  // ── Initialise map — runs after first paint so the container has real size ──
  useEffect(() => {
    const el = divRef.current;
    if (!el) return;

    // Use rAF + ResizeObserver to guarantee the container has a real pixel height
    // before creating the Leaflet map. The NodeMapCanvas wrapper now always has
    // minHeight:320, so the guard threshold is kept low just as a safety net.
    function tryInit() {
      if (mapRef.current) return;
      if (!divRef.current) return;
      // minHeight:320 on the parent wrapper means we should always have height,
      // but keep a small guard in case the DOM hasn't painted yet.
      if (divRef.current.clientHeight < 4) return;

      const map = L.map(divRef.current, {
        zoomControl:        true,
        attributionControl: true,
        // Sensible default — will be replaced by fitBounds once nodes arrive
        center:             [10.3157, 123.8854],
        zoom:               14,
        maxZoom:            19,
      });

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        minZoom:     1,
        maxZoom:     19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      mapRef.current = map;
      // Force Leaflet to recalculate its container size immediately after init —
      // avoids the common "grey tiles" bug when the container size wasn't stable.
      requestAnimationFrame(() => {
        map.invalidateSize();
        // Seed the map with any nodes that already arrived before the DOM
        // was ready.  The nodes/edges effects depend on mapRef.current being
        // non-null, so they silently no-op on first render — this call
        // bootstraps them immediately after the map is initialised.
        seedMapWithCurrentNodes(map);
      });
      ro.disconnect();
    }

    const ro = new ResizeObserver(tryInit);
    ro.observe(el);
    // Also try immediately and after the next paint
    tryInit();
    const rafId = requestAnimationFrame(tryInit);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      cancelAnimationFrame(packetRafRef.current);
      mapRef.current?.remove();
      mapRef.current = null;
      fittedRef.current    = false;
      deviceFlyRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // seedMapWithCurrentNodes is defined below but only called from tryInit
  // which runs inside the init effect — deps are intentionally empty because
  // the function accesses all live data via refs.

  // ── Bootstrap helper — called once right after the map is created ────────────
  // Reads from refs so it works even though it lives outside the nodes effect.
  function seedMapWithCurrentNodes(map: L.Map) {
    const currentNodes      = nodesRef.current;
    const currentSelected   = selectedNodeIdRef.current;
    const currentBroadcast  = broadcastActiveRef.current;

    for (const node of currentNodes) {
      const protocol = currentBroadcast ? "both" : node.protocol_active;
      const isRelay  = node.role === "relay";
      const isSel    = node.node_id === currentSelected;
      const icon     = makeIcon(protocol, isRelay, isSel);
      const latlng   = L.latLng(node.latitude, node.longitude);
      const protoLabel =
        protocol === "both"      ? "BLE + Wi-Fi" :
        protocol === "bluetooth" ? "BLE only"    :
        protocol === "wifi"      ? "Wi-Fi only"  : "offline";
      const tipContent =
        `<b>${node.label}</b><br/>` +
        `${node.role} · <span style="color:${protocolColor(protocol)}">${protoLabel}</span><br/>` +
        `Battery ${node.battery_percentage}% · Signal ${node.signal}%`;

      const marker = L.marker(latlng, { icon })
        .addTo(map)
        .bindTooltip(tipContent, { direction: "top", offset: [0, -4], className: "meshnet-tip" });
      marker.on("click", () => onNodeClickRef.current?.(node));
      markersRef.current.set(node.node_id, marker);
    }

    // Draw edges
    const MAX_DEG = 0.006;
    for (let i = 0; i < currentNodes.length; i++) {
      for (let j = i + 1; j < currentNodes.length; j++) {
        const a = currentNodes[i];
        const b = currentNodes[j];
        if (Math.abs(a.latitude  - b.latitude)  > MAX_DEG) continue;
        if (Math.abs(a.longitude - b.longitude) > MAX_DEG) continue;
        const pa = currentBroadcast ? "both" : a.protocol_active;
        const pb = currentBroadcast ? "both" : b.protocol_active;
        const bothWifi  = (pa === "wifi" || pa === "both") && (pb === "wifi" || pb === "both");
        const bothBle   = (pa === "bluetooth" || pa === "both") && (pb === "bluetooth" || pb === "both");
        const anyActive = pa !== "none" && pb !== "none";
        const edgeColor =
          bothWifi && bothBle ? C_BOTH :
          bothWifi            ? C_WIFI :
          bothBle             ? C_BLE  : C_OFF;
        edgesRef.current.push(
          L.polyline(
            [L.latLng(a.latitude, a.longitude), L.latLng(b.latitude, b.longitude)],
            { color: edgeColor, weight: anyActive ? 2 : 1, opacity: anyActive ? 0.55 : 0.18, dashArray: anyActive ? "8, 5" : "4, 8" },
          ).addTo(map),
        );
      }
    }

    // fitBounds on first load
    if (!fittedRef.current && currentNodes.length > 0) {
      const latlngs = currentNodes.map((n) => L.latLng(n.latitude, n.longitude));
      map.fitBounds(L.latLngBounds(latlngs), { padding: [48, 48], maxZoom: 16 });
      fittedRef.current = true;
    }
  }

  // ── Device location marker — update position, never auto-pan ────────────────
  // GPS only moves the "You" marker. The map viewport is NOT changed here —
  // nodes always own the initial viewport (fitBounds). The user can press the
  // "Locate me" button in NodeMapCanvas to pan to their position on demand.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !deviceLocation || deviceLocation.status !== "ok") return;
    if (deviceLocation.lat === null || deviceLocation.lng === null) return;

    const latlng = L.latLng(deviceLocation.lat, deviceLocation.lng);
    const icon   = makeDeviceIcon(deviceLocation.accuracy);

    if (!deviceMarkerRef.current) {
      deviceMarkerRef.current = L.marker(latlng, { icon, zIndexOffset: 1000 })
        .addTo(map)
        .bindTooltip(
          `<b>You</b><br/>±${Math.round(deviceLocation.accuracy ?? 0)} m`,
          { direction: "top", offset: [0, -8], className: "meshnet-tip" },
        );
    } else {
      deviceMarkerRef.current.setLatLng(latlng);
      deviceMarkerRef.current.setIcon(icon);
      deviceMarkerRef.current.setTooltipContent(
        `<b>You</b><br/>±${Math.round(deviceLocation.accuracy ?? 0)} m`,
      );
    }

    // Record that we have a fix so the locate button can use it
    deviceFlyRef.current = true;
  }, [deviceLocation]);

  // ── Update mesh node markers + fit bounds ───────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set<string>();

    for (const node of nodes) {
      seen.add(node.node_id);
      const protocol = broadcastActive ? "both" : node.protocol_active;
      const isRelay  = node.role === "relay";
      const isSel    = node.node_id === selectedNodeId;
      const icon     = makeIcon(protocol, isRelay, isSel);
      const latlng   = L.latLng(node.latitude, node.longitude);

      // Build a human-readable protocol label for the tooltip
      const protoLabel =
        protocol === "both"      ? "BLE + Wi-Fi" :
        protocol === "bluetooth" ? "BLE only"    :
        protocol === "wifi"      ? "Wi-Fi only"  :
                                   "offline";

      const tipContent =
        `<b>${node.label}</b><br/>` +
        `${node.role} · <span style="color:${protocolColor(protocol)}">${protoLabel}</span><br/>` +
        `Battery ${node.battery_percentage}% · Signal ${node.signal}%`;

      let marker = markersRef.current.get(node.node_id);
      if (!marker) {
        marker = L.marker(latlng, { icon })
          .addTo(map)
          .bindTooltip(tipContent, { direction: "top", offset: [0, -4], className: "meshnet-tip" });
        marker.on("click", () => onNodeClickRef.current?.(node));
        markersRef.current.set(node.node_id, marker);
      } else {
        marker.setLatLng(latlng);
        marker.setIcon(icon);
        marker.setTooltipContent(tipContent);
      }
    }

    // Remove stale markers
    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    // Always fit to node bounds on first load — GPS does NOT block this
    if (!fittedRef.current && nodes.length > 0) {
      const latlngs = nodes.map((n) => L.latLng(n.latitude, n.longitude));
      map.fitBounds(L.latLngBounds(latlngs), { padding: [48, 48], maxZoom: 16 });
      fittedRef.current = true;
    }
  }, [nodes, selectedNodeId]);

  // ── Draw BLE edges between nearby nodes ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    edgesRef.current.forEach((p) => p.remove());
    edgesRef.current = [];

    const MAX_DEG = 0.006;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        if (Math.abs(a.latitude  - b.latitude)  > MAX_DEG) continue;
        if (Math.abs(a.longitude - b.longitude) > MAX_DEG) continue;

        // Edge colour reflects the best shared protocol:
        //   both nodes have wifi  → blue (Wi-Fi Direct, longest range)
        //   both nodes have ble   → green (BLE)
        //   only one side active  → grey dashed (weak link)
        const pa = broadcastActive ? "both" : a.protocol_active;
        const pb = broadcastActive ? "both" : b.protocol_active;
        const bothWifi = (pa === "wifi" || pa === "both") && (pb === "wifi" || pb === "both");
        const bothBle  = (pa === "bluetooth" || pa === "both") && (pb === "bluetooth" || pb === "both");
        const anyActive = pa !== "none" && pb !== "none";

        const edgeColor =
          bothWifi && bothBle ? C_BOTH :
          bothWifi            ? C_WIFI :
          bothBle             ? C_BLE  :
                                C_OFF;

        edgesRef.current.push(
          L.polyline(
            [L.latLng(a.latitude, a.longitude), L.latLng(b.latitude, b.longitude)],
            {
              color:     edgeColor,
              weight:    anyActive ? 2 : 1,
              opacity:   anyActive ? 0.55 : 0.18,
              dashArray: anyActive ? "8, 5" : "4, 8",
            },
          ).addTo(map),
        );
      }
    }
  }, [nodes]);

  // ── AI route overlay + animated packet dot ───────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    routeRef.current?.remove();   routeRef.current = null;
    packetRef.current?.remove();  packetRef.current = null;
    cancelAnimationFrame(packetRafRef.current);

    if (activeRoutePath.length < 2) return;

    const nodeById = new Map(nodes.map((n) => [n.node_id, n]));
    const routeLatLngs: L.LatLng[] = [];
    for (const id of activeRoutePath) {
      const n = nodeById.get(id);
      if (n) routeLatLngs.push(L.latLng(n.latitude, n.longitude));
    }
    if (routeLatLngs.length < 2) return;

    routeRef.current = L.polyline(routeLatLngs, {
      color: C_ROUTE, weight: 4, opacity: 0.9,
    }).addTo(map);

    packetRef.current = L.circleMarker(routeLatLngs[0], {
      radius: 6, color: "#FFFFFF", fillColor: "#FFFFFF", fillOpacity: 0.95, weight: 2,
    }).addTo(map);

    let t = 0;
    const totalSegs = routeLatLngs.length - 1;
    const SPEED = 0.008;

    function tick() {
      t = (t + SPEED) % 1;
      const globalT = t * totalSegs;
      const segIdx  = Math.floor(globalT) % totalSegs;
      const localT  = globalT - Math.floor(globalT);
      const a = routeLatLngs[segIdx];
      const b = routeLatLngs[segIdx + 1];
      packetRef.current?.setLatLng([
        a.lat + (b.lat - a.lat) * localT,
        a.lng + (b.lng - a.lng) * localT,
      ]);
      packetRafRef.current = requestAnimationFrame(tick);
    }
    packetRafRef.current = requestAnimationFrame(tick);

    return () => { cancelAnimationFrame(packetRafRef.current); };
  }, [activeRoutePath, nodes]);

  // ── Invalidate map size on container resize ───────────────────────────────────
  useEffect(() => {
    const el = divRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      mapRef.current?.invalidateSize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={divRef}
      style={{
        position:  "absolute",
        inset:     0,
        // absolute fill ensures the div matches the wrapper's height exactly,
        // regardless of any flex sizing quirks in ancestor components.
      }}
    />
  );
});

export default LeafletMap;
