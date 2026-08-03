
  # MeshNet-AI

  An offline, P2P emergency communication system using BLE and AI-optimized routing with IBM Bob to assist rescue operations in zero-infrastructure disaster zones. Built with React, Node.js, and Electron, it turns everyday smartphones into an interconnected, self-healing mesh network using Bluetooth and Wi-Fi—requiring zero cellular signal and zero internet.

  <p align="center">
    <img src="public/MeshnetLogo.png" alt="MeshNet AI" width="320" />
  </p>

  ## Team

  - **ROHIT SANE** — Team Lead & Author [@Rohit Sane](https://github.com/RohitSane)
  - **REYCEL CENTINO** — Front-End [@kingdavid](https://github.com/kingdavid28)
  - **PAUL OLANTUNDE ABIMBOLA** — Back-End [@paulgreat](https://github.com/paulgreat)
  - **ARIANE SANDOY** — [@archii](https://github.com/archii)
  - **MARCELO RODRIGUEZ** — SQL & Database [@Marcelo Rodriguez | Peru](https://github.com/MarceloRodriguezPeru)

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
- **Demo Mode (Backend Disabled)**: For this demo, the backend server is intentionally disabled. In the full production version, the backend would be enabled and pressing the alert button would immediately broadcast emergency messages to rescue teams via the mesh network. This ensures safe testing without triggering real emergency alerts.
- **Android 11+ Hotspot Limitation**: WiFi hotspot creation requires system app privileges on Android 11+. On modern devices, users must manually create the hotspot in Android Settings and the app will connect to it.
- **Standalone Mode**: The Android app includes in-memory storage for offline operation. Data persists during app session but is lost on restart. For full mesh network functionality, it needs a running Node.js backend (port 4000) on the same network.
- **Backend Required**: The Android app can work in standalone mode with in-memory storage, but for full mesh network functionality, it needs a running Node.js backend (port 4000) on the same network. Configure the backend IP in the app settings or via `VITE_API_BASE_URL`.
- **Permissions**: The app requests Bluetooth, Location, and WiFi permissions on first launch.

The Android app includes:
- Full MeshNet UI (React-based via Capacitor)
- BLE discovery and advertising
- WiFi Direct peer-to-peer connections
- Captive portal redirect server
- mDNS service broadcasting
- SOS and emergency communication

---

## User Manual

### Table of Contents
1. [Getting Started](#getting-started)
2. [First-Time Setup](#first-time-setup)
3. [Core Features](#core-features)
4. [Emergency Procedures](#emergency-procedures)
5. [Troubleshooting](#troubleshooting)
6. [Best Practices](#best-practices)

### Getting Started

**What is MeshNet AI?**
MeshNet AI is an emergency communication platform that creates a decentralized mesh network using Bluetooth and WiFi. It works without cellular service or internet, making it ideal for disaster response scenarios.

**System Requirements**
- Android 8.0 or higher
- Bluetooth Low Energy (BLE) support
- WiFi capability
- Location services enabled
- Minimum 50MB free storage

### First-Time Setup

#### Installation
1. Download the APK from GitHub Releases
2. Enable "Install from Unknown Sources" in Android Settings > Security
3. Install the APK
4. Launch the app

#### Granting Permissions
The app requires the following permissions:
- **Bluetooth**: For peer discovery and mesh networking
- **Location**: Required for BLE scanning on Android
- **WiFi**: For network connections and hotspot creation

**To grant permissions:**
1. When prompted, tap "Allow" for each permission
2. If permissions were denied, go to Settings > Apps > MeshNet AI > Permissions
3. Enable all required permissions manually

#### Initial Configuration
1. **Backend URL Configuration** (Optional)
   - If you have a MeshNet backend server, configure its IP address
   - Go to Settings > Protocols Tab
   - **Auto-Discovery (Recommended)**: Tap the "Auto" button to automatically find the backend on your local network
   - **Manual Configuration**: Enter the backend URL manually (e.g., `http://192.168.1.100:4000`)
   - Tap "Save Configuration"

**How Auto-Discovery Works:**
- The app automatically scans common gateway IPs (192.168.137.1, 192.168.43.1, etc.)
- Checks your local network subnet for backend servers
- Caches successful connections for faster future connections
- Shows discovery method and latency when backend is found

**When to Use Auto-Discovery:**
- When you're connected to a MeshNet hotspot
- When the backend is on the same local network
- When you don't know the backend IP address
- For fastest setup in emergency situations

2. **Network Mode Selection**
   - Choose your preferred network mode:
     - **Auto Mode**: Desktop on phone network (recommended)
     - **Bluetooth Mode**: Bluetooth tethering
     - **Manual Mode**: Same network with manual IP

### Core Features

#### 1. Mesh Discovery
**Purpose**: Automatically discover nearby devices in the mesh network

**How to Use:**
1. Ensure Bluetooth and Location are enabled
2. The app automatically scans for nearby MeshNet devices
3. Discovered peers appear on the map with their:
   - Device label/name
   - Battery level
   - Signal strength
   - Last seen timestamp
   - GPS location

**What You'll See:**
- Real-time map of all connected devices
- Color-coded indicators for signal strength
- Battery status for each device
- Distance estimation from your location

#### 2. Emergency Contacts
**Purpose**: Store and search emergency contact information

**How to Use:**
1. Navigate to the Emergency Contacts tab
2. Tap "Add Emergency Contact"
3. Fill in the required fields:
   - Name
   - Phone number
   - Email
   - Category (Doctor, Hospital, Rescue Team, etc.)
   - Location
   - Medical specialty (if applicable)
4. Tap "Save"

**Searching Contacts:**
- Use the search bar to find contacts by name or location
- Filter by category using the dropdown
- Results update in real-time as you type

#### 3. Medical Facilities
**Purpose**: Locate nearby medical facilities

**How to Use:**
1. Navigate to the Medical Facilities tab
2. Tap "Add Medical Facility" to add new facilities
3. Enter facility details:
   - Name
   - GPS coordinates (auto-detected or manual)
   - Type (Hospital, Clinic, First Aid, etc.)
   - Phone number
   - Address
4. Tap "Save"

**Finding Facilities:**
- The map shows all medical facilities within range
- Facilities are color-coded by type
- Tap a facility marker for details
- Distance is calculated from your current location

#### 4. Shelters
**Purpose**: Track emergency shelter locations and capacity

**How to Use:**
1. Navigate to the Shelters tab
2. Tap "Add Shelter" to register a new shelter
3. Enter shelter information:
   - Name
   - GPS coordinates
   - Total capacity
   - Current occupancy
   - Phone number
   - Address
4. Tap "Save"

**Monitoring Shelters:**
- View real-time occupancy levels
- Color indicators show capacity status:
  - Green: Available space
  - Yellow: Near capacity
  - Red: Full capacity
- Tap for detailed information

#### 5. SOS Broadcasting
**Purpose**: Send emergency distress signals through the mesh network

**How to Use:**
1. Tap the SOS button (red emergency icon)
2. Confirm the SOS alert
3. Your device will:
   - Broadcast your GPS location
   - Send emergency status to all nearby devices
   - Update your role to "emergency" on the mesh map
4. Keep the app open for continued broadcasting

**What Happens:**
- All nearby mesh nodes receive your SOS
- Your location appears on their maps with emergency marker
- Rescue teams can track your position in real-time
- The signal continues until you cancel it

#### Backend Sync
**Purpose**: Synchronize data with a central backend server when available

**How to Use:**
1. Ensure backend URL is configured (use Auto-Discovery for easiest setup)
2. Navigate to Settings > Protocols Tab
3. Tap "Sync from Backend"
4. The app will sync:
   - Emergency contacts
   - Medical facilities
   - Shelters
   - Discovered peers

**Sync Status:**
- Success message shows number of items synced
- Errors are displayed if sync fails
- Data is stored locally if backend is unavailable

**Tip:** Use Auto-Discovery before syncing to ensure you're connected to the correct backend

### Emergency Procedures
   - Look for "MeshNet-Emergency" network
   - Connect to the network

2. **Open Emergency App**
   - A "Sign in to network" popup should appear
   - Tap the notification
   - The MeshNet emergency page opens automatically

3. **Send SOS**
   - Enter your name (optional)
   - Describe your situation briefly
   - Tap "SEND SOS"
   - Your GPS location is sent automatically

4. **Stay Connected**
   - Keep the emergency page open
   - Your device acts as a relay for others
   - Rescue teams can see your location

#### For Rescue Teams
1. **Set Up Rescue Hub**
   - Launch MeshNet AI on desktop/laptop
   - Click "Activate Hotspot"
   - Create "MeshNet" WiFi network

2. **Monitor Mesh Map**
   - Watch for new devices appearing
   - Check SOS alerts (red markers)
   - Review victim messages and locations

3. **Coordinate Response**
   - Assign rescue teams to locations
   - Track team positions on map
   - Communicate via mesh messaging

4. **Manage Resources**
   - Update shelter occupancy
   - Track medical facility status
   - Coordinate with other rescue hubs

### Troubleshooting

#### App Won't Discover Peers
**Possible Causes:**
- Bluetooth disabled
- Location services disabled
- Permissions not granted

**Solutions:**
1. Enable Bluetooth in Settings
2. Enable Location Services (High Accuracy mode)
3. Check app permissions in Settings > Apps > MeshNet AI
4. Restart the app
5. Restart Bluetooth (toggle off/on)

#### SOS Not Sending
**Possible Causes:**
- GPS not enabled
- No mesh peers in range
- Network configuration issue

**Solutions:**
1. Enable GPS/Location services
2. Check if other devices are visible on mesh map
3. Verify backend URL configuration
4. Try switching network modes
5. Restart the app

#### Data Not Persisting
**Expected Behavior:**
- The app uses in-memory storage for offline operation
- Data persists during app session but is lost on restart
- This is intentional for the current version

**For Persistent Storage:**
- Use backend sync when available
- Data will persist on the backend server
- Sync regularly to maintain data

#### Hotspot Issues
**Android 11+ Limitation:**
- System apps can create hotspots automatically
- Regular apps require manual hotspot creation

**Workaround:**
1. Go to Android Settings > Network & Internet > Hotspot & Tethering
2. Manually create a hotspot named "MeshNet-Emergency"
3. The app will connect to this hotspot

#### Battery Drain
**Expected Behavior:**
- BLE scanning and WiFi use more battery
- Emergency mode maximizes discovery

**Solutions:**
1. Reduce mesh discovery frequency in settings
2. Use power saving mode when not in emergency
3. Keep device plugged in during extended operations
4. Close other background apps

### Best Practices

#### For Emergency Use
1. **Pre-Configure Before Disaster**
   - Install and test the app beforehand
   - Grant all permissions
   - Configure backend URL if available
   - Add emergency contacts

2. **Keep App Updated**
   - Regularly check for updates
   - New versions may have critical fixes
   - Update before deployment in field

3. **Battery Management**
   - Carry portable chargers
   - Use power saving mode when possible
   - Close unnecessary apps
   - Keep screen brightness low

4. **Network Testing**
   - Test mesh discovery with nearby devices
   - Verify SOS functionality
   - Practice emergency procedures

#### For Rescue Operations
1. **Hub Placement**
   - Place rescue hub in central location
   - Ensure good WiFi coverage
   - Use multiple hubs for large areas
   - Consider terrain and obstacles

2. **Team Coordination**
   - Assign clear roles to team members
   - Establish communication protocols
   - Regular sync intervals
   - Backup communication methods

3. **Data Management**
   - Sync data regularly when backend available
   - Keep records of operations
   - Document discovered victims
   - Track resource usage

4. **Safety First**
   - Never put rescuers at risk
   - Use mesh for coordination only
   - Maintain traditional communication backup
   - Follow standard emergency protocols

#### For Network Configuration
1. **Choose Right Mode**
   - Use Auto mode for most scenarios
   - Bluetooth mode for desktop connection
   - Manual mode for same-network setups

2. **IP Configuration**
   - Use local network IPs (192.168.x.x)
   - Avoid public IPs
   - Test connectivity before operations
   - Document network topology

3. **Backend Setup**
   - Ensure backend is accessible
   - Test API endpoints
   - Monitor backend logs
   - Have backup backend ready

### Technical Support

**For Issues or Questions:**
- GitHub Issues: https://github.com/kingdavid28/MeshNet-AI/issues
- Check existing issues for solutions
- Provide detailed error logs
- Include device model and Android version

**Emergency Contact:**
- For critical deployment issues, contact the development team
- Include "URGENT" in issue title
- Provide phone number for immediate response

---



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