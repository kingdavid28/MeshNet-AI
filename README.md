
  # Mobile App UI Design

  <p align="center">
    <img src="public/MeshnetLogo.png" alt="MeshNet AI" width="320" />
  </p>

  This is a code bundle for Mobile App UI Design. The original project is available at https://www.figma.com/design/wB8QPHCwQU1tXKgbpFxHR9/Mobile-App-UI-Design.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.
  

  Open 3 terminals and run one command in each
Terminal 1 — Python FastAPI (AI routing engine, port 5050)
cd "c:\Users\reycel\Downloads\Mobile App UI Design\backend"
python -m uvicorn api_server:app --port 5050 --reload

Terminal 2 — Node.js Express (REST API + SQLite, port 4000)
cd "c:\Users\reycel\Downloads\Mobile App UI Design\backend"
npm run dev

Terminal 3 — Vite frontend (React app, port 5173)
cd "c:\Users\reycel\Downloads\Mobile App UI Design"
pnpm dev
pnpm preview

Once all three are running, open your browser at:

http://localhost:4173




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