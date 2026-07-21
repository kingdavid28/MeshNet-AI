# MeshNet AI - User Manual

## Table of Contents
1. [Introduction](#introduction)
2. [System Requirements](#system-requirements)
3. [Installation](#installation)
4. [Getting Started](#getting-started)
5. [Desktop Application](#desktop-application)
6. [Mobile Application](#mobile-application)
7. [Features](#features)
8. [Captive Portal Setup](#captive-portal-setup)
9. [Emergency Communication](#emergency-communication)
10. [Troubleshooting](#troubleshooting)
11. [Security Considerations](#security-considerations)
12. [FAQ](#faq)

---

## Introduction

MeshNet AI is an emergency communication and routing system designed for disaster scenarios where traditional communication networks may be unavailable. The system enables offline emergency communication, GPS sharing, medical requests, and mesh networking capabilities.

### Key Features
- **Offline Communication**: Works without internet connectivity
- **Mesh Networking**: Creates peer-to-peer networks for device-to-device communication
- **Emergency SOS**: Quick distress signal broadcasting
- **GPS Location Sharing**: Share location with rescue teams
- **Medical Requests**: Request medical assistance during emergencies
- **Captive Portal**: Automatic network detection for quick access
- **Multi-Platform Support**: Desktop (Windows), Mobile (Android), and Web (PWA)

---

## System Requirements

### Desktop Application (Windows)
- **Operating System**: Windows 10 or later
- **Processor**: Intel Core i5 or equivalent
- **RAM**: 8GB minimum, 16GB recommended
- **Network**: WiFi adapter with hosted network support
- **Privileges**: Administrator rights required for hotspot creation
- **Storage**: 500MB free space

### Mobile Application (Android)
- **Operating System**: Android 8.0 (API Level 26) or higher
- **RAM**: 4GB minimum
- **Storage**: 100MB free space
- **Network**: WiFi and Bluetooth capabilities
- **Permissions**: Location, WiFi, Bluetooth, Camera (optional)

### Web Application (PWA)
- **Browser**: Chrome, Firefox, Safari, or Edge (latest version)
- **Network**: Internet connection for initial setup, offline thereafter
- **Storage**: 50MB browser storage

---

## Installation

### Desktop Application

1. **Download the latest release** from the GitHub repository
2. **Extract the zip file** to your desired location
3. **Run the installer** (MeshNet-Setup.exe)
4. **Grant administrator privileges** when prompted
5. **Complete the installation** wizard

### Mobile Application

**Note: APK releases are not currently available on GitHub. You can build the APK locally:**

1. **Clone the repository** from GitHub
2. **Navigate to the android directory**: `cd android`
3. **Build the APK**: `./gradlew assembleDebug`
4. **Find the APK** in `android/app/build/outputs/apk/debug/`
5. **Enable "Unknown Sources"** in Android settings
6. **Install the APK** by tapping on the file
7. **Grant required permissions** when prompted
8. **Launch the application**

**Alternative: Use the development build**
1. **Connect Android device** via USB
2. **Enable USB debugging** in Android settings
3. **Run**: `cd android && ./gradlew installDebug`
4. **Launch the app** from your device's app drawer

### Web Application (PWA)

1. **Visit the deployed URL** or run locally with `pnpm dev`
2. **Install as PWA** by clicking "Add to Home Screen" in browser menu
3. **Access offline** from your home screen

---

## Getting Started

### Initial Setup

1. **Launch the application** on your preferred platform
2. **Configure network settings** (desktop only)
3. **Set up your profile** and emergency contacts
4. **Test the system** with a trial run

### Network Configuration

#### Desktop Hotspot Setup
1. **Run as Administrator** (required for hotspot creation)
2. **Click "Activate Hotspot"** in the HotspotManager section
3. **Configure hotspot settings**:
   - Network name: "MeshNet-Emergency"
   - Password: "12345678" (default, can be changed)
4. **Enable portproxy** for captive portal functionality
5. **Test connection** with a mobile device

#### Mobile Network Setup
1. **Enable WiFi** on your device
2. **Connect to MeshNet hotspot** using the provided credentials
3. **Allow captive portal** when prompted
4. **Access the emergency interface**

---

## Desktop Application

### Interface Overview

The desktop application provides a comprehensive command dashboard with the following sections:

#### Header
- **Logo**: MeshNet AI branding
- **Status Pills**: Stream status, data source, routing status
- **Controls**: Settings, emergency mode toggle

#### Main Dashboard
- **Tab System**: Home, Map, Alerts, Communications, Protocols
- **Activity Log**: Real-time system events
- **Hotspot Manager**: WiFi hotspot control
- **Network Status**: Connection information

### Hotspot Manager

#### Creating a Hotspot
1. **Click "Activate Hotspot"** button
2. **Follow manual instructions** if automatic setup fails
3. **Configure in Windows Settings**:
   - Network name: "MeshNet"
   - Password: "12345678"
   - Enable "Share my internet connection"
4. **Return to app** to continue setup

#### Captive Portal Setup
1. **Click "Enable Auto-Popup"** button
2. **Accept UAC prompt** for portproxy configuration
3. **Deactivate and reactivate hotspot** to apply changes
4. **Test with mobile device** to verify popup appears

#### Status Monitoring
- **Connected Devices**: Shows number of connected devices
- **Captive Portal Status**: Indicates if auto-popup is active
- **Network Information**: IP address and connection details

### Emergency Mode

#### Activating Emergency Mode
1. **Click "Emergency Mode"** toggle in header
2. **Confirm activation** when prompted
3. **System enters emergency state** with enhanced features

#### Emergency Features
- **Priority routing**: Emergency messages take precedence
- **Extended range**: Maximum network coverage
- **Battery optimization**: Reduced power consumption
- **Auto-broadcast**: Continuous SOS signal transmission

---

## Mobile Application

### Interface Overview

The mobile application provides a simplified interface optimized for emergency use:

#### Main Screen
- **Quick Actions**: SOS button, medical request, location share
- **Network Status**: Connection information and signal strength
- **Activity Feed**: Recent messages and alerts
- **Navigation**: Bottom tab bar for different sections

### Features

#### SOS Button
- **Tap SOS button** to broadcast distress signal
- **Select emergency type**: Medical, rescue, evacuation
- **Add location** automatically via GPS
- **Broadcast to network** for immediate response

#### Medical Request
- **Tap "Medical Request"** from quick actions
- **Describe condition** in detail
- **Attach photos** if possible
- **Submit to network** for medical assistance

#### Location Sharing
- **Tap "Share Location"** to broadcast GPS coordinates
- **Set update frequency**: Real-time, periodic, or one-time
- **Share with specific groups** or entire network
- **Monitor battery impact** of continuous sharing

#### BLE Scanner
- **Scan for nearby devices** using Bluetooth
- **Discover network credentials** automatically
- **Connect to available MeshNet hotspots**
- **View device information** and signal strength

---

## Features

### Mesh Networking

#### How It Works
MeshNet creates a peer-to-peer network where each device acts as a node, relaying messages to extend coverage without requiring traditional infrastructure.

#### Network Formation
1. **Devices discover each other** via WiFi and Bluetooth
2. **Automatic routing** determines optimal message paths
3. **Self-healing network** adapts to device failures
4. **Extended range** through multi-hop communication

#### Node Types
- **Gateway Nodes**: Connected to internet (if available)
- **Relay Nodes**: Forward messages between devices
- **End Nodes**: Send and receive messages
- **Emergency Nodes**: Prioritized for distress signals

### GPS Location Services

#### Location Sharing
- **Automatic GPS capture** when enabled
- **Battery-efficient tracking** with adaptive intervals
- **Offline map support** with cached tiles
- **Emergency coordinates** broadcast even without signal

#### Map Features
- **Real-time device tracking** on network map
- **Route visualization** between nodes
- **Coverage area display** and signal strength
- **Emergency location highlighting**

### Communication Protocols

#### Message Types
- **SOS Signals**: Highest priority distress messages
- **Medical Requests**: Emergency medical assistance
- **Status Updates**: Network and device status
- **Location Data**: GPS coordinates and movement
- **Text Messages**: Standard communication

#### Encryption
- **End-to-end encryption** for all communications
- **Secure key exchange** via mesh network
- **Message authentication** to prevent spoofing
- **Privacy protection** for sensitive data

---

## Captive Portal Setup

### What is Captive Portal?

A captive portal automatically redirects users to a specific web page when they connect to a WiFi network, enabling quick access to emergency services without manual URL entry.

### Setup Instructions

#### Desktop Configuration
1. **Ensure administrator privileges** are granted
2. **Activate hotspot** in HotspotManager
3. **Click "Enable Auto-Popup"** button
4. **Accept UAC prompt** for portproxy setup
5. **Restart hotspot** to apply changes

#### Portproxy Configuration
The system automatically configures Windows portproxy rules:
- `192.168.137.1:80 → 192.168.137.1:8080` (HTTP)
- `192.168.137.1:443 → 192.168.137.1:8443` (HTTPS)

#### Verification
1. **Connect mobile device** to MeshNet hotspot
2. **Wait 5-10 seconds** for captive portal detection
3. **"Sign in to network" popup** should appear
4. **Tap popup** to access emergency interface

### Troubleshooting Captive Portal

#### Popup Not Appearing
- **Verify portproxy rules** are active: `netsh interface portproxy show all`
- **Check DNS hijack** is running in desktop app logs
- **Ensure HTTP redirect server** is on port 8080
- **Reconnect mobile device** after portproxy setup

#### Connection Issues
- **Restart hotspot** after configuration changes
- **Verify WiFi adapter** supports hosted networks
- **Check firewall rules** aren't blocking connections
- **Ensure administrator privileges** are active

---

## Emergency Communication

### SOS Protocol

#### Sending SOS
1. **Tap SOS button** prominently displayed
2. **Select emergency type** from options
3. **Add optional details** (condition, number of people, etc.)
4. **Confirm broadcast** to network
5. **Monitor for responses** in activity feed

#### Receiving SOS
- **Immediate alert** with sound and vibration
- **Emergency details** displayed prominently
- **Sender location** shown on map
- **Response options** available (acknowledge, respond, ignore)

### Medical Emergency Protocol

#### Requesting Medical Assistance
1. **Tap "Medical Request"** from quick actions
2. **Describe condition** in detail
3. **Attach photos** if possible and relevant
4. **Include location** automatically captured
5. **Submit to network** for medical team response

#### Medical Response
- **Triage priority** based on condition severity
- **Resource allocation** for medical teams
- **Location tracking** for evacuation
- **Status updates** throughout response

### Evacuation Protocol

#### Evacuation Alerts
- **Broadcast evacuation** instructions to network
- **Include safe routes** and assembly points
- **Real-time updates** as situation changes
- **Confirmation system** for message receipt

#### Evacuation Response
- **Acknowledge receipt** of evacuation alert
- **Report current location** and status
- **Request assistance** if needed
- **Follow provided routes** to safety

---

## Troubleshooting

### Common Issues

#### Desktop Application Won't Start
- **Check administrator privileges** are granted
- **Verify .NET Framework** is installed
- **Check antivirus** isn't blocking the application
- **Reinstall application** if issue persists

#### Hotspot Creation Fails
- **Verify WiFi adapter** supports hosted networks
- **Check driver updates** for WiFi adapter
- **Ensure no other hotspot** software is running
- **Restart computer** and try again

#### Mobile Device Can't Connect
- **Verify hotspot is active** on desktop
- **Check password** is correct (default: 12345678)
- **Ensure WiFi is enabled** on mobile device
- **Forget network** and reconnect

#### Captive Portal Not Working
- **Verify portproxy rules** are configured
- **Check DNS hijack** is running
- **Ensure HTTP redirect server** is active
- **Restart hotspot** after configuration

#### GPS Not Working
- **Enable location services** on device
- **Check app permissions** for location access
- **Verify GPS is enabled** in device settings
- **Test outdoors** for better satellite reception

#### Network Not Forming
- **Ensure devices are within range** (typically 50-100m)
- **Check WiFi and Bluetooth** are enabled
- **Verify no interference** from other networks
- **Restart network** on all devices

### Error Messages

#### "Administrator Privileges Required"
- **Run as Administrator** on Windows
- **Right-click application** → "Run as Administrator"
- **UAC prompt** will appear, accept to continue

#### "WiFi Adapter Not Supported"
- **Check adapter specifications** for hosted network support
- **Update WiFi drivers** from manufacturer
- **Consider external WiFi adapter** if needed
- **Verify adapter is not disabled** in Device Manager

#### "Portproxy Setup Failed"
- **Accept UAC prompt** when it appears
- **Check Windows Firewall** isn't blocking
- **Verify no other service** is using ports 80/443
- **Restart as Administrator** and try again

#### "DNS Hijack Failed"
- **Check port 53** is not in use by other services
- **Verify no other DNS server** is running
- **Restart desktop application** as Administrator
- **Check firewall rules** for DNS traffic

---

## Security Considerations

### Network Security

#### Encryption
- **All communications** are end-to-end encrypted
- **AES-256 encryption** for message content
- **Secure key exchange** via mesh network
- **Message authentication** to prevent spoofing

#### Access Control
- **Password-protected hotspot** (default: 12345678)
- **Device authentication** before network access
- **Rate limiting** to prevent abuse
- **Audit logging** for security events

### Data Privacy

#### Location Data
- **GPS data encrypted** in transit and storage
- **User consent required** for location sharing
- **Automatic expiration** of location history
- **Selective sharing** with specific groups

#### Communication Privacy
- **Message content encrypted** end-to-end
- **Metadata minimized** to protect privacy
- **No third-party data sharing**
- **Local storage only** for sensitive data

### Best Practices

#### Password Security
- **Change default password** from 12345678
- **Use strong passwords** for hotspot access
- **Rotate passwords** regularly
- **Don't share credentials** unnecessarily

#### Device Security
- **Keep applications updated** with latest patches
- **Use antivirus software** on desktop
- **Enable device encryption** on mobile
- **Report suspicious activity** immediately

---

## FAQ

### General Questions

**Q: What is MeshNet AI?**
A: MeshNet AI is an emergency communication system that creates peer-to-peer networks for disaster scenarios where traditional communication may be unavailable.

**Q: Does it require internet connectivity?**
A: No, MeshNet works completely offline after initial setup. It creates its own mesh network for device-to-device communication.

**Q: How far does the network reach?**
A: Typical range is 50-100m per hop, but can be extended through multiple relay devices to cover larger areas.

**Q: Can I use it with my existing WiFi?**
A: MeshNet creates its own dedicated hotspot. It's designed to work independently of existing networks for emergency use.

### Technical Questions

**Q: What platforms are supported?**
A: Desktop (Windows), Mobile (Android), and Web (PWA) applications are available.

**Q: How many devices can connect?**
A: Theoretically unlimited, but practical limits depend on hardware and network conditions. Typically 20-50 devices work well.

**Q: Does it work with iOS devices?**
A: iOS devices can connect to the MeshNet hotspot via web browser, but a native iOS app is not currently available.

**Q: How much battery does it use?**
A: Battery usage varies by device and usage patterns. Emergency mode includes battery optimization features.

### Setup Questions

**Q: Why do I need administrator privileges?**
A: Administrator privileges are required to create WiFi hotspots and configure network routing on Windows.

**Q: Can I change the hotspot password?**
A: Yes, you can change the password in the Windows Mobile Hotspot settings. The default is "12345678".

**Q: What if the captive portal doesn't appear?**
A: Ensure portproxy is configured by clicking "Enable Auto-Popup" in the desktop app, then restart the hotspot.

**Q: How do I know if the network is working?**
A: Check the status indicators in the desktop app and look for connected devices in the Hotspot Manager section.

### Emergency Use Questions

**Q: How do I send an SOS signal?**
A: Tap the prominent SOS button in the mobile app or use the emergency mode in the desktop app.

**Q: Will my location be shared automatically?**
A: Location is only shared when you explicitly enable it or send an SOS signal. You have full control over location sharing.

**Q: Can I communicate with specific people only?**
A: Yes, you can send messages to specific devices or broadcast to the entire network depending on the situation.

**Q: What happens if devices go offline?**
A: The mesh network is self-healing and will automatically reroute messages around offline devices to maintain connectivity.

---

## Support and Resources

### Documentation
- **GitHub Repository**: https://github.com/kingdavid28/MeshNet-AI
- **Issue Tracker**: Report bugs and feature requests
- **Wiki**: Additional documentation and guides

### Community
- **Discord Server**: Join for community support
- **Forums**: Discussion boards for users
- **Contributing**: Guidelines for contributing to the project

### Emergency Contacts
- **Technical Support**: support@meshnet.ai
- **Emergency Line**: Available during active deployments
- **Security Issues**: security@meshnet.ai

---

## Version History

### Current Version: 1.0.0
- Initial release with core mesh networking features
- Desktop hotspot management with captive portal
- Mobile SOS and emergency communication
- GPS location sharing and tracking
- Multi-platform support (Windows, Android, PWA)

### Recent Updates
- Fixed captive portal redirect server for all HTTP requests
- Added WPA2 security support for Windows hotspots
- Improved UI with enhanced logo and styling
- Added BLE scanner for credential discovery
- Updated CORS configuration for localhost access
- Various bug fixes and performance improvements

---

## License

MeshNet AI is released under the MIT License. See LICENSE file for details.

---

## Acknowledgments

- **Contributors**: Thank you to all contributors who have helped develop MeshNet AI
- **Open Source Projects**: Built on various open source libraries and frameworks
- **Emergency Services**: Inspired by real-world emergency communication needs
- **Community**: Thanks to the community for testing and feedback

---

*This manual is continuously updated. Check the GitHub repository for the latest version.*
