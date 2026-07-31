
  # MeshNet-AI

  An AI-powered offline emergency communication platform built with React, Node.js, and Electron. It turns everyday smartphones into an interconnected, self-healing mesh network using Bluetooth and Wi-Fi—requiring zero cellular signal and zero internet.

  <p align="center">
    <img src="public/MeshnetLogo.png" alt="MeshNet AI" width="320" />
  </p>

  ## Running the code

### Primary: Android APK (Mobile App)

**For Judges - Quick Installation:**

Download the latest APK directly from GitHub Releases:
```
https://github.com/kingdavid28/MeshNet-AI/releases/latest/download/app-debug.apk
```

Installation Steps:
1. Download the APK from the link above
2. Enable "Install from Unknown Sources" in Android Settings > Security
3. Tap the downloaded APK file to install
4. Launch the MeshNet AI app
5. Grant Bluetooth, Location, and WiFi permissions when prompted

**For Developers - Build from Source:**

Install the pre-built APK on your Android device:
```
Location: android/app/build/outputs/apk/debug/app-debug.apk
```

**Build the APK:**
```bash
# Build the web app first
pnpm build

# Sync with Capacitor and build Android
npx cap sync android
cd android
./gradlew assembleDebug
```

**Important Notes:**
- **Android 11+ Hotspot Limitation**: WiFi hotspot creation requires system app privileges on Android 11+. On modern devices, users must manually create the hotspot in Android Settings and the app will connect to it.
- **Backend Required**: The Android app needs a running Node.js backend (port 4000) on the same network. Configure the backend IP in the app settings or via `VITE_API_BASE_URL`.
- **Permissions**: The app requests Bluetooth, Location, and WiFi permissions on first launch.

The Android app includes:
- Full MeshNet UI (React-based via Capacitor)
- BLE discovery and advertising
- WiFi Direct peer-to-peer connections
- Captive portal redirect server
- mDNS service broadcasting
- SOS and emergency communication

### Secondary: Desktop (Rescue Hub)
For desktop-based rescue operations, run the Electron app:

**Quick Start (Windows Desktop)**
Run `start_meshnet.bat` to start all services:
- Node.js Express backend (port 4000)
- Vite frontend (React app, port 5173)
- Electron desktop app (with admin rights for hotspot)

**Manual Setup**
Run `npm i` to install dependencies.

Open 3 terminals and run one command in each:

Terminal 1 — Node.js Express (REST API + SQLite, port 4000)
cd "c:\Users\reycel\Downloads\Mobile App UI Design\backend"
npm run dev

Terminal 2 — Vite frontend (React app, port 5173)
cd "c:\Users\reycel\Downloads\Mobile App UI Design"
pnpm dev

Terminal 3 — Electron desktop app (hotspot management)
cd "c:\Users\reycel\Downloads\Mobile App UI Design\desktop"
npm start

Once all three are running, open your browser at:

http://localhost:5173



----------------------------------------------------------------
Real Life Scenario
Situation: Earthquake. Buildings collapsed. No cell signal. No internet.

The Rescuer's Side (your laptop/desktop running MeshNet)


1. Open MeshNet app
2. Click "Activate Hotspot"
3. Laptop broadcasts Wi-Fi named "MeshNet"
   └─ Redirect server starts on port 80
   └─ Backend running on port 4000
Your screen shows:



✅ MeshNet Hotspot Active
   Connected devices: 0
   http://192.168.137.1:4000/api/mesh/join
The Victim's Side (any phone, no app needed)


Maria is trapped under rubble.
Her phone has no signal but Wi-Fi still works.
Step 1 — Phone sees the hotspot



📶 Available Networks:
   - MeshNet          ← she taps this
   - HomeWifi_2.4G
Step 2 — OS sends the silent probe (she does nothing)



Her Android phone automatically sends:
GET http://connectivitycheck.gstatic.com/generate_204
 
But DNS has no internet → request hits our server instead
Our server replies: 302 → http://192.168.137.1:4000/api/mesh/join
Step 3 — Notification appears (she does nothing)



📱 Status bar notification:
┌─────────────────────────────┐
│ 📶 Sign in to MeshNet       │
│    Tap to sign in to this   │
│    Wi-Fi network            │
└─────────────────────────────┘
Step 4 — She taps the notification



Browser opens automatically showing:
 
┌─────────────────────────────────┐
│  🔴 EMERGENCY NETWORK ACTIVE    │
│                                 │
│  You are connected to MeshNet   │
│                                 │
│  Your name (optional)           │
│  [ Maria Santos              ]  │
│                                 │
│  Short message (optional)       │
│  [ Trapped 3rd floor, help   ]  │
│                                 │
│  📍 Location found (10.3148, …) │
│                                 │
│  ┌─────────────────────────┐    │
│  │   🆘  SEND SOS          │    │
│  └─────────────────────────┘    │
└─────────────────────────────────┘
Step 5 — She taps SEND SOS



Her phone POSTs to http://192.168.137.1:4000/api/mesh/register
{
  name: "Maria Santos",
  message: "Trapped 3rd floor, help",
  lat: 10.3148,
  lng: 123.8820,
  device: "smartphone"
}
 
Screen shows:
✅ SOS Sent Successfully
   Rescue teams have been notified.
   Keep this page open.
Back on the Rescuer's Screen (instant)


✅ MeshNet Hotspot Active
   Connected devices: 2        ← jumped from 0 to 2
 
Mesh Map updates:
  [You] ──── [Maria Santos — Trapped 3rd floor]  📍 10.3148, 123.882
         └── [Unknown victim]                     📍 10.3151, 123.881
The Relay Effect (why "keep this page open" matters)


Maria's phone is now a node.
Another victim (Pedro) is 50m away — too far from your laptop's hotspot.
But he's close enough to Maria's phone.
 
Pedro connects to MeshNet
  → his probe hits Maria's phone relay
  → redirected to SOS page
  → registers on the mesh map
 
You now know Pedro exists even though
his phone never directly reached your laptop.
Summary in one sentence
Any phone within Wi-Fi range connects, gets a popup, taps SEND SOS, and appears on your rescue map — in under 10 seconds, with no app install, no internet, no cell signal.


How MeshNet enables device communication without regular networks:

The system uses a hybrid approach combining BLE for discovery and WiFi for data transfer:

1. BLE (Bluetooth Low Energy) for Initial Discovery
Desktop (Electron app):

Acts as BLE peripheral, advertising with MeshNet service UUID (0000FEED-0000-1000-8000-00805F9B34FB)
Broadcasts WiFi credentials (SSID, password) via BLE characteristics
Phone (Browser):

Scans for BLE devices with MeshNet service UUID
Connects to desktop via BLE
Retrieves WiFi credentials from BLE characteristic
User manually connects to WiFi using retrieved credentials
2. WiFi Hotspot for Data Transfer
Desktop creates emergency hotspot:

Uses Windows Mobile Hotspot (or equivalent on other platforms)
Creates local network (e.g., 192.168.137.x)
Acts as gateway for all connected devices
Phone connects to hotspot:

Uses credentials from BLE
Joins local WiFi network
Can now communicate with backend and other devices
3. Captive Portal for Automatic Discovery
Desktop runs DNS hijacking:

Intercepts DNS queries on hotspot gateway IP
Redirects all HTTP requests to MeshNet app
Uses netsh portproxy for kernel-level forwarding
This ensures:

Devices automatically see "Sign in to network" popup
Tapping opens MeshNet emergency app
No manual URL entry required
4. Backend Communication
Once on same WiFi:

All devices communicate via backend on gateway IP
Backend runs on 192.168.137.1:4000 (or similar)
Supports emergency alerts, medical requests, GPS sharing
Uses SSE (Server-Sent Events) for real-time updates
5. Disaster Protocol Activation
When disaster protocol is triggered:

All devices forced into active BLE scanning mode
Maximum device discovery for emergency connectivity
Prioritizes emergency communication over normal operations
Key advantage: This works without cellular towers, internet, or traditional infrastructure - only requires devices with BLE and WiFi capabilities.

How victims can receive help and communicate with MeshNet:

Current Implementation
1. Automatic Discovery via Captive Portal

Victim connects to MeshNet emergency WiFi hotspot
Phone automatically shows "Sign in to network" popup
Tapping opens MeshNet emergency app (no app install needed)
2. One-Tap SOS Button

Victim taps "SEND SOS" button
Phone sends emergency alert with GPS location
Alert appears on rescue dashboard immediately
3. Two-Way Communication

Medical Requests: Victim can request medical help with severity level
Text Messages: Victim can send text messages to rescuers
GPS Sharing: Victim's location is shared in real-time on map
4. Mesh Networking

Devices communicate via WebRTC peer-to-peer
mDNS broadcasting enables local discovery
BLE advertising provides WiFi credentials automatically
Current Flow
Rescue Team Setup
Desktop app creates emergency WiFi hotspot
Captive portal redirects all traffic to MeshNet app
Backend runs on gateway IP (192.168.137.1:4000)
Victim Connection
Victim connects to "MeshNet-Emergency" WiFi
Phone automatically opens MeshNet emergency app
Victim sees SOS button and communication options
Emergency Response
Victim taps SOS → Alert appears on rescue map
Rescuers see victim's GPS location
Two-way communication established
What's Working
✅ WiFi hotspot creation
✅ Captive portal redirect (HTTP mode)
✅ SOS alert system
✅ GPS location sharing
✅ Medical request system
✅ Text messaging
✅ Real-time map display
✅ mDNS service broadcasting
✅ BLE credential advertising (requires USB adapter)
What Would Improve Victim Experience
Push notifications for rescue team responses
Voice communication via WebRTC
Offline mode when backend unavailable
Battery optimization for extended emergency use
Multi-language support for international disasters
The system is designed to work without cellular service or internet - only requires WiFi and BLE capabilities on devices.



Feedback submitted


Network Mode Selection Implementation Complete

Implemented Connection Options:

Option A: Desktop as Rescue Hub (Already Working)

Desktop creates WiFi hotspot
Desktop runs backend API
Phone connects to desktop hotspot
No network configuration needed
Option B: Phone as Rescue Hub + Desktop on Phone Network (NEW)

Phone creates WiFi hotspot "MeshNet-Emergency"
Desktop connects to phone hotspot (192.168.43.x)
Phone captive portal redirects to desktop on same network
Auto mode in UI
Option C: Phone as Rescue Hub + Bluetooth Tethering (NEW)

Phone creates WiFi hotspot "MeshNet-Emergency"
Desktop connects via Bluetooth tethering (192.168.44.x)
Phone captive portal redirects via Bluetooth
Bluetooth mode in UI
Option D: Phone as Rescue Hub + Same Network (Already Working)

Phone creates WiFi hotspot
Phone and desktop on same existing network
Manual IP configuration required
Manual mode in UI
New UI Features:

Network mode selection with three options
Visual feedback for selected mode
Context-aware help text for each mode
Manual IP input only shown when needed
Clear descriptions of each connection method
APK Location: c:\Users\reycel\Downloads\meshnetmerge\Mobile App UI Design\android\app\build\outputs\apk\debug\app-debug.apk

Usage Instructions:

For Option B (Desktop on Phone Network):

Phone: Select "Auto (Desktop on Phone Network)" mode
Phone: Activate hotspot
Desktop: Connect to "MeshNet-Emergency" WiFi
Desktop: Run backend (will be on 192.168.43.x)
Victim: Connect to phone hotspot
Captive portal redirects to desktop backend
For Option C (Bluetooth Tethering):

Phone: Enable Bluetooth tethering
Phone: Select "Bluetooth Tethering" mode
Desktop: Pair with phone via Bluetooth
Desktop: Connect to phone's Bluetooth network
Phone: Activate hotspot
Victim: Connect to phone hotspot
Captive portal redirects via Bluetooth
For Option D (Same Network):

Phone: Select "Manual (Same Network)" mode
Phone: Enter desktop backend IP
Phone: Activate hotspot
Ensure phone and desktop on same network
Victim: Connect to phone hotspot
Captive portal redirects to configured IP
Best Practice Recommendation:

Use Option A (Desktop as Rescue Hub) for most scenarios - it's already working and simplest
Use Option B when phone must be the rescue hub and desktop can connect to phone hotspot
Use Option C when Bluetooth is preferred over WiFi for desktop connection
Use Option D when both devices are already on the same network
The implementation now supports all major network topology options with a user-friendly interface for selecting the appropriate mode.

export CLOUDANT_URL="https://apikey:password@account.cloudant.com"
python fetch_cloudant.py