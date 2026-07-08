# BLE/WiFi Discovery Requirements

## Overview
MeshNet requires device-to-device discovery for mesh networking. Currently, the system uses simulated topology data, but production deployment requires real BLE and WiFi discovery.

## Current State
- **Development**: Uses pre-seeded topology data in SQLite database
- **Production**: Requires real device discovery implementation

## Technical Requirements

### BLE (Bluetooth Low Energy) Discovery
- **Range**: 80m (flood), 20m (war_zone), 120m (earthquake)
- **Protocol**: BLE 5.0+ for extended range
- **Data**: Signal strength (RSSI), device ID, battery level
- **Frequency**: Continuous scanning with adaptive intervals

### WiFi Direct Discovery
- **Range**: 200m (flood), 50m (war_zone), 400m (earthquake)
- **Protocol**: WiFi Direct / P2P
- **Data**: Signal strength, device ID, latency
- **Frequency**: Periodic discovery scans

## Implementation Requirements

### Android (Primary Platform)
```kotlin
// BLE Discovery
val bluetoothAdapter: BluetoothAdapter
val scanner: BluetoothLeScanner

// WiFi Direct
val wifiP2pManager: WifiP2pManager
val channel: WifiP2pManager.Channel
```

### iOS (Secondary Platform)
```swift
// CoreBluetooth
let centralManager: CBCentralManager

// Multipeer Connectivity
let session: MCSession
```

## Discovery Flow
1. **Scan**: Advertise and scan for nearby devices
2. **Handshake**: Exchange device IDs and capabilities
3. **Measure**: Calculate signal strength and latency
4. **Register**: Send discovered nodes to backend via `/api/mesh/register`
5. **Update**: Periodic refresh of topology

## Backend Integration
- **Endpoint**: `POST /api/mesh/register`
- **Authentication**: `X-Mesh-Secret` header
- **Data**: Device ID, signal, battery, GPS coordinates

## Performance Considerations
- **Battery**: Adaptive scanning based on battery level
- **Privacy**: Only discover devices with MeshNet app
- **Reliability**: Fallback to cellular if mesh unavailable
- **Latency**: <2s for discovery and registration

## Testing
- Use multiple physical devices in same location
- Test in different environments (indoor, outdoor, interference)
- Verify signal strength accuracy
- Test mesh routing with real connections

## Security
- Device authentication via shared secret
- Encrypted communication channels
- Rate limiting for discovery requests
- Privacy mode to disable discovery
