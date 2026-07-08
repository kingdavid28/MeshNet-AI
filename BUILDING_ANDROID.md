# Building the MeshNet Android APK (Victim Phone BLE Advertiser)

This guide explains how to build and install the MeshNet Android app so victim phones **advertise a BLE GATT service** that the desktop Electron app can detect and connect to.

---

## How the BLE architecture works

```
Desktop (Electron)                    Victim Phone (Android APK)
─────────────────                    ──────────────────────────
BluetoothMeshService.ts              MeshDiscoveryPlugin.kt
  Central role                         Peripheral role
  navigator.bluetooth                  BluetoothLeAdvertiser
  .requestDevice()          ←──────    advertising UUID: 0000FEED-...
  .connectGatt()            ──────→    BluetoothGattServer
  reads characteristics                CHAR_NODE_ID, CHAR_LABEL,
                                        CHAR_LAT, CHAR_LNG, etc.
  POST /api/mesh/register              POST /api/mesh/register
  (registers phone as node)            (registers itself on launch)
```

The phone **advertises** via `startBleAdvertise()` in `MeshDiscoveryPlugin.kt`.  
The desktop **scans** via `navigator.bluetooth.requestDevice()` in `bluetooth.ts`.  
Both use the same UUID: `0000FEED-0000-1000-8000-00805F9B34FB`.

---

## Prerequisites

Install these once on your development machine (Windows):

| Tool | Version | Download |
|------|---------|----------|
| Android Studio | Latest | https://developer.android.com/studio |
| JDK | 17+ | bundled with Android Studio |
| Node.js | 18+ | https://nodejs.org |
| pnpm | any | `npm i -g pnpm` |

Inside Android Studio, open **SDK Manager** and install:
- Android SDK Platform **API 34**
- Android SDK Build-Tools **34.0.0**

---

## Step 1 — Build the Vite web app

```powershell
# In the project root
pnpm install
pnpm build
```

This outputs the React app to `dist/`. Capacitor copies this into the Android WebView.

---

## Step 2 — Sync Capacitor

```powershell
npx cap sync android
```

This copies `dist/` into `android/app/src/main/assets/public/` and updates
any native plugin configs from `capacitor.config.ts`.

---

## Step 3 — Set the backend URL

The Android app needs to reach the Express backend running on the desktop.

**Find your desktop's local IP:**
```powershell
ipconfig
# Look for: IPv4 Address . . . . 192.168.x.x
```

**Option A — via environment variable (recommended for builds):**
```powershell
$env:VITE_API_BASE_URL = "http://192.168.x.x:4000"
pnpm build
npx cap sync android
```

**Option B — edit `capacitor.config.ts` directly:**
```ts
plugins: {
  MeshDiscovery: {
    apiBase: "http://192.168.x.x:4000",   // ← your desktop IP
  }
}
```

> The phone and desktop must be on the same Wi-Fi network **or** connected
> via the MeshNet hotspot (`192.168.137.1:4000`) for HTTP to reach the backend.

---

## Step 4 — Open in Android Studio

```powershell
npx cap open android
```

Android Studio opens. Wait for Gradle sync to finish (first time: ~2–5 min).

---

## Step 5 — Connect a phone and run

1. On the victim phone: **Settings → Developer options → USB debugging: ON**
   *(To enable developer options: tap Build Number 7 times in About Phone)*
2. Connect the phone via USB to your PC.
3. In Android Studio: select the phone in the device dropdown (top toolbar).
4. Click **Run ▶** (Shift+F10).

The APK is built and installed directly on the phone. The app opens automatically.

---

## Step 6 — Grant permissions on the phone

On first launch, the MeshNet app requests:

| Permission | Why |
|-----------|-----|
| Bluetooth Scan | Find nearby mesh nodes |
| **Bluetooth Advertise** | **Broadcast BLE so desktop can find this phone** |
| Bluetooth Connect | Exchange GATT data |
| Location (Android < 12) | Required by BLE scan API |
| Nearby Wi-Fi Devices (Android 12+) | Wi-Fi Direct peer discovery |

**Tap "Allow" for all of them.** If you deny Advertise, the desktop cannot find this phone via BLE.

---

## Step 7 — Verify advertising is working

On the phone, you should see in the app's status:
- `advertising: true`
- `scanning: true`

On the desktop Electron app:
1. Go to **Protocols → BLE**
2. Tap **"Scan for Nearby MeshNet Nodes"**
3. The browser device picker appears — the phone should appear as a device
4. Select it → desktop connects, reads the phone's node ID/label/GPS
5. Phone is registered in the mesh backend and appears on the map

---

## Building a release APK (for distribution without USB)

```powershell
# Generate a signing keystore (one time only)
keytool -genkey -v -keystore meshnet.keystore -alias meshnet `
        -keyalg RSA -keysize 2048 -validity 10000

# Set env vars
$env:MESHNET_KEYSTORE_FILE = "C:\path\to\meshnet.keystore"
$env:MESHNET_KEYSTORE_PASS = "yourpassword"
$env:MESHNET_KEY_ALIAS     = "meshnet"
$env:MESHNET_KEY_PASS      = "yourpassword"
```

Then in Android Studio: **Build → Generate Signed Bundle / APK → APK → release**.

The signed APK is at:
```
android\app\build\outputs\apk\release\app-release.apk
```

Transfer it to phones via USB, Bluetooth file share, or a local HTTP server:
```powershell
# Serve the APK locally so phones on the hotspot can download it
python -m http.server 8080
# Phone browser: http://192.168.137.1:8080/app-release.apk
```

On the phone: **Settings → Install unknown apps → allow browser/Files app**.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Gradle sync fails | File → Invalidate Caches → Restart |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | Uninstall the old APK first |
| Phone not in device picker | Make sure BLE Advertise permission was granted; check `advertising: true` in app status |
| Desktop picker shows nothing | Confirm both devices have Bluetooth on; stay within 10–30 m |
| Backend registration fails | Confirm `apiBase` points to desktop IP, backend is running (`node backend/dist/index.js`) |
| `minSdk 26` error | The app requires Android 8.0+. Older phones are not supported. |
