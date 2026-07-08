# MeshNet AI — User Flow & App Flowchart

> Documents the complete UI/UX journey from cold launch to first SOS alert sent.
> Use this as a debug reference during final integration.

---

## 1. Cold launch → first SOS (step-by-step)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  USER ACTION                          │  APP STATE / SCREEN                  │
├───────────────────────────────────────┼──────────────────────────────────────┤
│  1. Tap / launch MeshNet app          │  Splash / loading screen             │
│                                       │  • Checks localStorage for           │
│                                       │    mesh-secret + node ID             │
│                                       │  • Requests GPS permission           │
│                                       │  • Attempts backend ping on :4000    │
├───────────────────────────────────────┼──────────────────────────────────────┤
│  2. App loads dashboard               │  DashboardLayout renders             │
│                                       │  • Live Mesh Map (Leaflet)           │
│                                       │  • Map centres on device GPS         │
│                                       │  • useCloudantNodes polls /topology  │
│                                       │  • If no nodes → seed nodes shown    │
│                                       │    near device location              │
├───────────────────────────────────────┼──────────────────────────────────────┤
│  3. Bottom nav: tap "Protocols"       │  Protocols tab opens                 │
│                                       │  Shows: BLE / WebRTC / Hotspot       │
│                                       │  Manager cards                       │
├───────────────────────────────────────┼──────────────────────────────────────┤
│  4. Tap "Activate Hotspot"            │  HotspotManager:                     │
│                                       │  • Desktop: Electron IPC call        │
│                                       │  • Mobile: manual instructions shown │
│                                       │  • Redirect server starts on :80     │
│                                       │  • mDNS Bonjour broadcast starts     │
│                                       │  Status: "Hotspot active"            │
├───────────────────────────────────────┼──────────────────────────────────────┤
│  5. Victim device connects to MeshNet │  HotspotManager polls ARP every 5 s │
│     Wi-Fi SSID                        │  • Detects new IP 192.168.137.x      │
│                                       │  • Registers node via                │
│                                       │    POST /api/mesh/register           │
│                                       │    (with host GPS coords)            │
│                                       │  • connectedDevices counter +1       │
├───────────────────────────────────────┼──────────────────────────────────────┤
│  6. Victim browser auto-redirects     │  Redirect server (port 80):          │
│     (or manual: open any URL)         │  302 → /api/mesh/join                │
│                                       │  Join HTML page loads on victim      │
│                                       │  Auto-redirect after 3 s →           │
│                                       │  http://192.168.137.1:5173           │
├───────────────────────────────────────┼──────────────────────────────────────┤
│  7. Victim sees MeshNet app           │  DashboardLayout on victim device    │
│                                       │  • No internet, uses hotspot LAN     │
│                                       │  • GPS acquired                      │
│                                       │  • Registers own node                │
├───────────────────────────────────────┼──────────────────────────────────────┤
│  8. Victim selects scenario           │  SosInputPortal renders:             │
│     e.g. FLOOD                        │  • Template picker (F-1 … F-6)       │
│                                       │  • [LOCATION] auto-filled with GPS   │
│                                       │  • [TIME] auto-filled with now       │
├───────────────────────────────────────┼──────────────────────────────────────┤
│  9. Victim taps "Send SOS"            │  POST /api/alerts with:              │
│                                       │  • X-Mesh-Secret header              │
│                                       │  • type, message, lat, lng           │
│                                       │  Alert stored in SQLite              │
│                                       │  SSE broadcast to all connected      │
│                                       │  clients via /api/signal/stream      │
├───────────────────────────────────────┼──────────────────────────────────────┤
│ 10. Host (Device A) receives alert    │  FlickerAlertBanner appears          │
│                                       │  Activity log entry added            │
│                                       │  Map node pulses with alert colour   │
│                                       │  ✅ SOS delivered end-to-end         │
└───────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 2. Full app flowchart (ASCII)

```
                          ┌──────────────┐
                          │  App Launch  │
                          └──────┬───────┘
                                 │
                    ┌────────────▼─────────────┐
                    │  Init localStorage:       │
                    │  mesh-secret, node ID     │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │  Request GPS permission  │
                    └────────────┬─────────────┘
                         ┌───────┴────────┐
                    Denied│               │Granted
                          │               │
              ┌───────────▼──┐  ┌─────────▼──────────┐
              │ GPS status:  │  │ useDeviceLocation   │
              │ "denied"     │  │ status: "ok"        │
              │ Map uses     │  │ Map centres on      │
              │ seed default │  │ device coordinates  │
              └───────┬──────┘  └─────────┬──────────┘
                      └─────────┬──────────┘
                                │
                   ┌────────────▼────────────────┐
                   │  DashboardLayout renders     │
                   │  • Live Mesh Map             │
                   │  • Activity Log              │
                   │  • Disaster Control Panel    │
                   │  • Bottom Navigation Bar     │
                   └────────────┬────────────────┘
                                │
              ┌─────────────────┼─────────────────────┐
              │                 │                      │
    ┌─────────▼──────┐  ┌───────▼──────┐   ┌──────────▼───────┐
    │  MAP tab       │  │ SOS tab      │   │ PROTOCOLS tab    │
    │                │  │              │   │                  │
    │ • Tap node →   │  │ • Select     │   │ • BLE Scanner    │
    │   NodeDetail   │  │   scenario   │   │ • WebRTC Mgr     │
    │ • Route query  │  │ • Pick       │   │ • Hotspot Mgr    │
    │ • Zoom/pan     │  │   template   │   │ • mDNS Discovery │
    └────────────────┘  │ • Fill msg   │   └──────────┬───────┘
                        │ • Send →     │              │
                        │   POST alert │    ┌─────────▼────────┐
                        └──────┬───────┘    │ Activate Hotspot │
                               │            └─────────┬────────┘
                    ┌──────────▼──────────┐           │
                    │  /api/alerts POST   │  ┌────────▼─────────────┐
                    │  201 Created        │  │ Hotspot active       │
                    └──────────┬──────────┘  │ Redirect srv: :80    │
                               │             │ Poll ARP every 5s    │
                    ┌──────────▼──────────┐  └────────┬─────────────┘
                    │  SSE broadcast →    │           │ device joins
                    │  all connected      │  ┌────────▼─────────────┐
                    │  clients            │  │ Register new node    │
                    └──────────┬──────────┘  │ POST /api/mesh/      │
                               │             │ register             │
                    ┌──────────▼──────────┐  └────────┬─────────────┘
                    │ FlickerAlertBanner  │           │
                    │ Activity log entry  │  ┌────────▼─────────────┐
                    │ Map node pulses     │  │ Node appears on map  │
                    └─────────────────────┘  └──────────────────────┘
```

---

## 3. Error / edge-case flows

### 3.1 Backend offline
```
useCloudantNodes load()
  → fetch /api/cloudant/nodes  → FAIL (connection refused)
  → fetch /api/mesh/topology   → FAIL (connection refused)
  → setNodes(generateSeedNodes(deviceLat, deviceLng))
  → source = "seed"
  → Map renders seed nodes near device location
  → Error banner: "Backend unreachable — showing seed data"
```

### 3.2 GPS unavailable
```
useDeviceLocation
  → navigator.geolocation.watchPosition error
  → status = "denied" | "unavailable"
  → HotspotManager registers device with lat: null, lng: null
  → fetchFromLocalBackend maps null coords → 0, 0
  → Node placed at [0, 0] (map pan warns user)
  → User shown: "Enable location for accurate positioning"
```

### 3.3 BLE + Wi-Fi Direct both fail
```
BluetoothScanner
  → navigator.bluetooth.requestDevice() throws
  → Displays: "⚠ Bluetooth unavailable"
WebRTC Manager
  → RTCPeerConnection ICE fails
  → Displays: "⚠ No peer connection"
HotspotManager
  → auto-expands with CTA: "Switch to Hotspot mode"
  → User activates hotspot as fallback protocol
```

### 3.4 SOS send fails (offline queue)
```
SosInputPortal
  → POST /api/alerts → network error
  → Alert stored in localStorage queue
  → Retry every 10 s
  → On reconnect, flush queue
  → User sees: "⚠ SOS queued — will send when connected"
```

---

## 4. Component responsibility map

| Component | File | Responsibility |
|-----------|------|----------------|
| `DashboardLayout` | `src/app/components/DashboardLayout.tsx` | Root layout, hooks orchestration |
| `NodeMapCanvas` | `src/app/components/NodeMapCanvas.tsx` | Leaflet map, node rendering |
| `SosInputPortal` | `src/app/components/SosInputPortal.tsx` | Scenario picker, template fill, POST alert |
| `HotspotManager` | `src/components/HotspotManager.tsx` | Hotspot activation, ARP polling, node registration |
| `MeshNetDiscovery` | `src/components/MeshNetDiscovery.tsx` | QR code display for manual joining |
| `MeshNetJoin` | `src/components/MeshNetJoin.tsx` | Captive-portal join page (victim side) |
| `FlickerAlertBanner` | `src/app/components/FlickerAlertBanner.tsx` | SSE-driven real-time alert banner |
| `useCloudantNodes` | `src/app/hooks/useCloudantNodes.ts` | Node data fetch + polling |
| `useDeviceLocation` | `src/app/hooks/useDeviceLocation.ts` | GPS coordinates |
| `useSignalStream` | `src/app/hooks/useSignalStream.ts` | SSE alert stream |

---

## 5. UI/UX bottlenecks checklist (integration debug)

| # | Potential bottleneck | Debug check |
|---|----------------------|-------------|
| 1 | Map renders 0 nodes | Check `source` state in useCloudantNodes; verify backend on :4000 |
| 2 | GPS never resolves | Check browser/OS location permission; check HTTPS (required on mobile) |
| 3 | Hotspot not detected | Confirm SSID `MeshNet` visible; check redirect server on :80 |
| 4 | Join page not loading | Check CORS headers on `/api/mesh/join`; CSP allows hotspot IP |
| 5 | SOS 401 Unauthorized | Verify `mesh-secret` in localStorage matches `MESH_SECRET` env var |
| 6 | Node at wrong position | Old node had null lat/lng; call `DELETE /api/mesh/nodes` to clear |
| 7 | Alert not received | Check SSE connection in DevTools Network tab; confirm `useSignalStream` |
