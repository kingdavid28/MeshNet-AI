# MeshNet AI — Offline Testing Scenarios & Test Cases

> **Scope:** Peer-to-peer offline communication via BLE, Wi-Fi Direct, and Hotspot.
> All tests assume NO internet connection unless explicitly stated.
> Target platform: Android APK (min SDK 26) + Windows Electron desktop.

---

## Environment setup

| Item | Specification |
|------|---------------|
| Device A | Host — Windows laptop running Electron app + backend (port 4000) |
| Device B | Joining device — Android phone visiting `http://192.168.137.1:4000/api/mesh/join` |
| Backend | Express + SQLite — `npm run dev` in `/backend` |
| Network | Devices connected via Windows Mobile Hotspot (SSID: MeshNet) |
| GPS | Real device GPS or mocked via DevTools sensor override |

---

## Distance parameters

| Protocol | Ideal range | Maximum tested range | Notes |
|----------|-------------|----------------------|-------|
| BLE 4.2+ | 10 m | **50 m** (line of sight) | Walls halve range |
| Wi-Fi Direct | 50 m | **200 m** (open field) | 802.11n 2.4 GHz |
| Hotspot (Infrastructure) | 30 m | **100 m** indoors | OS-limited SSID power |
| WebRTC over Hotspot | Same as Hotspot | 100 m | Relay via host node |

> **Rule of thumb for field testing:** Start at **10 m**, step out to **50 m**, then
> **100 m**. Mark the distance at which packet delivery rate drops below 80 %.

---

## TC-01 — Happy path: full mesh join and SOS

**Objective:** Verify a device can join the mesh and send an SOS end-to-end.

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | Launch Electron app on Device A | Dashboard loads; backend starts on port 4000 |
| 2 | Navigate to Protocols → Hotspot Manager | Hotspot panel visible |
| 3 | Tap **Activate Hotspot** | Windows Mobile Hotspot starts; SSID `MeshNet` visible |
| 4 | On Device B, connect Wi-Fi to `MeshNet` | Device B gets IP `192.168.137.x` |
| 5 | Device B browser opens `http://192.168.137.1:80` | Redirect server sends 302 to join page |
| 6 | Join page loads; Device B taps **Open MeshNet App** | App opens at `http://192.168.137.1:5173` |
| 7 | Device A dashboard shows **1 connected device** | Node icon appears on Live Mesh Map |
| 8 | Device B selects scenario **FLOOD** and sends SOS | Alert recorded in backend; Device A receives alert |
| 9 | Device A activity log shows `[FLOOD] SOS received` | ✅ Pass |

---

## TC-02 — Distance degradation test

**Objective:** Measure message delivery at increasing distances.

| Step | Distance | Action | Expected result |
|------|----------|--------|-----------------|
| 1 | 5 m | Send 10 SOS messages from Device B | 10/10 delivered |
| 2 | 25 m | Send 10 SOS messages | ≥9/10 delivered |
| 3 | 50 m | Send 10 SOS messages | ≥8/10 delivered |
| 4 | 100 m | Send 10 SOS messages | ≥6/10 delivered |
| 5 | 150 m | Send 10 SOS messages | Record drop rate; mark as range limit if <50% |

**Pass criteria:** ≥ 80 % delivery within 50 m for Hotspot; ≥ 60 % at 100 m.

---

## TC-03 — BLE + Wi-Fi Direct simultaneous failure

**Objective:** Verify graceful degradation and user-facing error handling when both
BLE and Wi-Fi Direct fail concurrently.

### Simulation steps
1. Disable Bluetooth on Device B (Settings → Bluetooth off).
2. Disable Wi-Fi Direct by putting Device B in Airplane Mode, then re-enable Wi-Fi only
   (this disables Wi-Fi Direct peer discovery while keeping infrastructure Wi-Fi).
3. Attempt to scan for peers via the **Protocols** tab.

### Expected error handling behaviour

| Layer | Expected behaviour |
|-------|--------------------|
| **BLE Scanner** | Shows `⚠ Bluetooth unavailable — enable Bluetooth to scan` within 3 s |
| **Wi-Fi Direct** | Shows `⚠ Wi-Fi Direct not supported or disabled` |
| **WebRTC** | Shows `⚠ No signalling server reachable — peer connection unavailable` |
| **Hotspot fallback** | App offers **Switch to Hotspot mode** button automatically |
| **Offline queue** | SOS messages queued locally; retried on reconnect |
| **UI state** | No crash; spinner resolves to error state with retry CTA |
| **Console log** | `[BLE] scan failed: ...` and `[WiFiDirect] discovery failed: ...` logged |

### Pass criteria
- No unhandled exceptions thrown.
- User sees a clear error message within 5 s.
- **"Switch to Hotspot mode"** CTA is visible and functional.
- Queued SOS message is delivered once hotspot connection is re-established.

---

## TC-04 — Node registration with GPS coordinates

**Objective:** Verify that registered nodes have correct lat/lng stored.

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | Grant location permission on Device A | `useDeviceLocation` returns `status: ok` |
| 2 | Connect Device B via hotspot | `HotspotManager` registers device with host lat/lng |
| 3 | Call `GET /api/mesh/topology` | Response includes `lat` and `lng` ≠ null |
| 4 | Open Live Mesh Map | Node marker appears at correct geographic position |

---

## TC-05 — Eviction / stale node cleanup

**Objective:** Confirm stale nodes are evicted after 1 hour without a heartbeat.

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | Register a test node via `POST /api/mesh/register` | Node appears in topology |
| 2 | Set `last_seen` to 2 hours ago via direct DB update | — |
| 3 | Wait for eviction job (runs every 30 s) | Node removed from topology |
| 4 | Call `GET /api/mesh/topology` | Node no longer in response |

---

## TC-06 — Multi-hop relay

**Objective:** Verify SOS message reaches Device A via Device B relay when
Device C is out of direct range.

```
Device C  --[BLE/WiFi]--> Device B  --[Hotspot]--> Device A (host)
(out of direct range)     (relay)
```

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | Device C is 80 m from Device A (beyond hotspot range) | Device C cannot see SSID |
| 2 | Device B is 40 m from both | Device B connected to hotspot |
| 3 | Device C connects to Device B via BLE | BLE pairing succeeds |
| 4 | Device C sends SOS via BLE → Device B relays to Device A | Alert received on Device A |
| 5 | Topology shows 3 nodes | Device C visible with relay path |

---

## TC-07 — Redirect server behaviour

**Objective:** Verify HTTP redirect server routes joining devices correctly.

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | Redirect server running on port 80 | `GET http://192.168.137.1/` |
| 2 | Device B connects to MeshNet and opens browser | Browser auto-navigates to gateway |
| 3 | Redirect server responds | `302 → http://192.168.137.1:4000/api/mesh/join` |
| 4 | Join page loads | HTML join page displayed in < 2 s |
| 5 | "Open MeshNet App" button tapped | `window.location.href` set to `http://192.168.137.1:5173` |

---

## TC-08 — Backend auth with mesh-secret

**Objective:** Confirm unauthenticated requests are rejected.

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | `GET /api/mesh/topology` with no header | `401 Unauthorized` |
| 2 | `GET /api/mesh/topology` with wrong secret | `401 Unauthorized` |
| 3 | `GET /api/mesh/topology` with correct secret | `200 OK` with topology payload |
| 4 | `GET /api/mesh/join` (public) with no header | `200 OK` — join HTML served |

---

## Bug report template

```
Bug ID:     BUG-####
Test Case:  TC-##
Date:       YYYY-MM-DD
Tester:     [name]
Severity:   CRITICAL / HIGH / MEDIUM / LOW

Steps to reproduce:
1.
2.
3.

Expected: 
Actual:   
Screenshot/log: [attach]
```

---

## Pass / fail summary table

| TC | Description | Status | Notes |
|----|-------------|--------|-------|
| TC-01 | Happy path — join + SOS | ⬜ Pending | |
| TC-02 | Distance degradation | ⬜ Pending | |
| TC-03 | BLE + Wi-Fi Direct failure | ⬜ Pending | |
| TC-04 | GPS node registration | ⬜ Pending | |
| TC-05 | Node eviction | ⬜ Pending | |
| TC-06 | Multi-hop relay | ⬜ Pending | |
| TC-07 | Redirect server | ⬜ Pending | |
| TC-08 | Auth guard | ⬜ Pending | |
