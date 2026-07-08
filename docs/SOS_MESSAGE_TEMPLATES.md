# MeshNet AI — Offline SOS Message Templates

> These templates are transmitted over the mesh network (BLE / Wi-Fi Direct / Hotspot)
> without internet connectivity. Keep messages short to minimise payload size and
> maximise relay hops.

---

## Format conventions

| Placeholder | Description |
|-------------|-------------|
| `[LOCATION]` | GPS coordinates: `lat, lng` — e.g. `10.3157, 123.8854` — OR a named landmark |
| `[TIME]` | Local 24 h timestamp — e.g. `14:32 UTC+8` |
| `[NAME]` | Sender name or device ID if anonymous |
| `[COUNT]` | Number of people affected |
| `[SEVERITY]` | LOW / MODERATE / CRITICAL |

---

## 1. Flood

### Template F-1 — Initial distress report
```
🌊 [FLOOD] EMERGENCY
Location: [LOCATION]
Time: [TIME]
[COUNT] persons stranded, rising water. Need immediate evacuation.
Sent via MeshNet | [NAME]
```

### Template F-2 — Safe zone report
```
🌊 [FLOOD] SAFE ZONE REACHED
Location: [LOCATION]
Time: [TIME]
[COUNT] survivors evacuated to higher ground. Road submerged at last position.
Status: STABLE | [NAME]
```

### Template F-3 — Resource request
```
🌊 [FLOOD] SUPPLY REQUEST
Location: [LOCATION]
Time: [TIME]
Need: Food / Water / Medical / Boat (circle applicable)
[COUNT] persons. [SEVERITY] priority.
[NAME]
```

### Template F-4 — Structural hazard alert
```
🌊 [FLOOD] HAZARD ALERT
Location: [LOCATION]
Time: [TIME]
WARNING: Bridge/road impassable. Avoid [LOCATION].
Report from: [NAME]
```

### Template F-5 — Child/elderly missing
```
🌊 [FLOOD] MISSING PERSON
Last seen: [LOCATION] at [TIME]
Description: [NAME], approx age ____, wearing ____.
Contact rescuer at this node.
```

### Template F-6 — All-clear broadcast
```
🌊 [FLOOD] ALL CLEAR
Area: [LOCATION]
Time: [TIME]
Evacuation complete. [COUNT] persons accounted for.
Verified by: [NAME]
```

---

## 2. Earthquake

### Template E-1 — Initial distress report
```
🏚 [EARTHQUAKE] EMERGENCY
Location: [LOCATION]
Time: [TIME]
Structure collapsed. [COUNT] persons trapped. Send rescue team.
Sent via MeshNet | [NAME]
```

### Template E-2 — Aftershock warning
```
🏚 [EARTHQUAKE] AFTERSHOCK WARNING
Felt at: [LOCATION]
Time: [TIME]
Magnitude estimate: __. Move away from damaged structures.
[NAME]
```

### Template E-3 — Structural damage report
```
🏚 [EARTHQUAKE] DAMAGE REPORT
Location: [LOCATION]
Time: [TIME]
Buildings affected: __
Road passable: YES / NO
Power line down: YES / NO
Casualties: [COUNT]
[NAME]
```

### Template E-4 — Medical triage request
```
🏚 [EARTHQUAKE] MEDICAL TRIAGE NEEDED
Location: [LOCATION]
Time: [TIME]
Injured: [COUNT] — Critical: __ / Moderate: __ / Minor: __
Require: Doctor / Paramedic / First-aid kit
[NAME]
```

### Template E-5 — Rescue team status update
```
🏚 [EARTHQUAKE] RESCUE UPDATE
Location: [LOCATION]
Time: [TIME]
Survivors extracted: [COUNT]
Still searching: YES / NO
Next check-in: [TIME]
Team lead: [NAME]
```

### Template E-6 — Landslide hazard (earthquake-triggered)
```
🏚 [EARTHQUAKE] LANDSLIDE RISK
Location: [LOCATION]
Time: [TIME]
Unstable slope detected. Do NOT traverse [LOCATION].
Warning issued by: [NAME]
```

---

## 3. Medical Emergency

### Template M-1 — General medical emergency
```
🚑 [MEDICAL] EMERGENCY
Location: [LOCATION]
Time: [TIME]
Patient: [NAME], condition: __
Symptoms: __
Need: Doctor / AED / Oxygen / Ambulance
Relay to nearest responder.
```

### Template M-2 — Cardiac / Unconscious patient
```
🚑 [MEDICAL] CARDIAC ARREST
Location: [LOCATION]
Time: [TIME]
Patient unconscious, no pulse detected.
CPR in progress: YES / NO
AED needed: YES / NO
[NAME] requesting immediate help.
```

### Template M-3 — Mass casualty incident
```
🚑 [MEDICAL] MASS CASUALTY
Location: [LOCATION]
Time: [TIME]
Casualties: [COUNT] — Critical: __ / Walking wounded: __
Triage in progress. Need: Medical team / Stretchers / Blood type __
[NAME]
```

### Template M-4 — Medication/supply shortage
```
🚑 [MEDICAL] SUPPLY SHORTAGE
Location: [LOCATION]
Time: [TIME]
Critical need: [medication/equipment name]
Patients at risk: [COUNT]
Contact: [NAME] at this node.
```

### Template M-5 — Patient transfer request
```
🚑 [MEDICAL] TRANSFER REQUEST
Location: [LOCATION]
Time: [TIME]
Patient: [NAME], condition STABLE / CRITICAL
Destination: [nearest hospital/evac point]
Requires transport ASAP.
Requesting relay to command node.
```

### Template M-6 — Mental health / Trauma response
```
🚑 [MEDICAL] MENTAL HEALTH ALERT
Location: [LOCATION]
Time: [TIME]
[COUNT] persons showing signs of acute stress/panic.
Need: Crisis counsellor / Trauma responder
[NAME]
```

---

## Implementation notes for the codebase

These templates are pre-loaded in the `SosInputPortal` component. When a scenario is
selected, the matching template is auto-filled into the message field with the device's
current GPS coordinates and local timestamp substituted for `[LOCATION]` and `[TIME]`.

```typescript
// src/app/components/SosInputPortal.tsx
const TEMPLATES: Record<Scenario, string[]> = {
  flood:     [ /* F-1 … F-6 */ ],
  earthquake:[ /* E-1 … E-6 */ ],
  medical:   [ /* M-1 … M-6 */ ],
};
```

Message payload (JSON, transmitted over mesh):
```json
{
  "type": "sos",
  "template": "F-1",
  "scenario": "flood",
  "message": "<filled text>",
  "lat": 10.3157,
  "lng": 123.8854,
  "timestamp": "2026-07-07T14:32:00+08:00",
  "nodeId": "device-xxxx",
  "ttl": 5
}
```
