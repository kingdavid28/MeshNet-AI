# BLE Peripheral Advertising Limitations on Desktop

## Problem Statement
The MeshNet admin desktop needs to broadcast BLE signals so victim phones without the MeshNet APK can discover and connect to the mesh network via Bluetooth, becoming relay nodes.

## Technical Limitations

### 1. Web Bluetooth API Restrictions
- **Central Role Only**: Web Bluetooth API (available in Chromium browsers and Electron renderer) only supports the GATT Central role (scan → connect → read/write characteristics)
- **No Peripheral Role**: Browsers deliberately do not expose GATT Peripheral role (advertise + accept connections) for security reasons
- **OS-Level Access Required**: Advertising requires direct Bluetooth HCI access that browsers do not provide

### 2. Node.js BLE Library Issues on Windows
- **bleno**: The primary Node.js BLE peripheral library has significant compatibility issues on Windows
- **Driver Dependencies**: Requires specific Bluetooth drivers and OS-level access that often fails
- **No Active Maintenance**: Original bleno library is unmaintained; forks like @abandonware/bleno have limited Windows support
- **Version Conflicts**: npm package versions are inconsistent and often fail to install on Windows

### 3. Platform-Specific Constraints
- **Windows**: BLE peripheral advertising requires complex driver setup and often fails
- **macOS**: Requires special entitlements and code signing
- **Linux**: Works better but still requires bluez and proper permissions

## Current Implementation

### What Works
1. **Wi-Fi Hotspot + Captive Portal** (Primary discovery mechanism)
   - DNS hijack redirects HTTP/HTTPS to local backend
   - HTTPS captive portal with self-signed certificate
   - Web-based SOS page at `/api/mesh/join`
   - Works on any phone without APK

2. **Web Bluetooth API in Captive Portal** (Supplementary)
   - Phones with Web Bluetooth support (Chrome on Android) can connect to advertising devices
   - "Connect via BLE" button in captive portal page
   - Allows direct BLE connection to devices running MeshNet APK

3. **Desktop BLE Scanning** (Central role)
   - Desktop can scan for nearby BLE devices advertising MeshNet service
   - Connect to devices with MeshNet APK installed
   - Exchange data via GATT characteristics

### What Doesn't Work
- **Desktop BLE Peripheral Advertising**: Desktop cannot advertise as a BLE peripheral for victim phones to discover without APK
- **Cross-Platform BLE Advertising**: No reliable Node.js solution for Windows BLE peripheral advertising

## Best Practices for Victim Discovery

### Primary: Wi-Fi Hotspot with Captive Portal
1. Admin activates hotspot on desktop
2. Victim phone connects to Wi-Fi
3. DNS hijack redirects to `/api/mesh/join`
4. Victim sees SOS page and registers
5. Victim becomes a relay node via Wi-Fi

### Secondary: BLE (requires MeshNet APK on some devices)
1. Android phones with MeshNet APK advertise BLE service
2. Desktop scans and connects via Web Bluetooth
3. Phones without APK can use Web Bluetooth in captive portal to connect to advertising devices
4. Data exchange via GATT characteristics

### Alternative: mDNS/Bonjour
1. Desktop broadcasts mDNS service
2. Devices on same network can discover
3. Requires devices to be on same network (not applicable for first-time victims)

## Recommendations

### For First-Time Victims (No APK)
- **Rely on Wi-Fi Hotspot + Captive Portal**: This is the most reliable and universal mechanism
- **HTTPS Captive Portal**: Implemented with self-signed certificate for Android HTTPS connectivity checks
- **Web-Based Registration**: No APK required, works in any browser

### For BLE Enhancement
- **Android APK Required**: For full BLE peripheral advertising, devices need the native Capacitor app
- **Web Bluetooth as Fallback**: Phones with Chrome can use Web Bluetooth to connect to advertising devices
- **Focus on Wi-Fi**: Given the limitations, prioritize Wi-Fi hotspot as the primary discovery mechanism

### Future Improvements
1. **Native Windows BLE Module**: Develop a native C++ module for Windows BLE peripheral advertising
2. **Alternative Discovery**: Consider other protocols like WiFi Direct (also requires native implementation)
3. **Hybrid Approach**: Combine Wi-Fi hotspot with opportunistic BLE when available

## Conclusion
Due to browser security restrictions and Node.js library limitations on Windows, the desktop cannot reliably advertise as a BLE peripheral. The current implementation prioritizes the Wi-Fi hotspot with captive portal as the primary discovery mechanism for first-time victims, with Web Bluetooth as a supplementary option for devices that support it.
