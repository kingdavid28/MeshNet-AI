# MeshNet PWA Implementation Guide

## Overview
Converting the existing MeshNet web app to a Progressive Web App (PWA) that can be installed on any device (phones, tablets, laptops) to become mesh network nodes without requiring native mobile development.

## Why PWA Approach

### Advantages Over Native Apps
- **Cross-Platform**: Works on Android, iOS, Windows, macOS, Linux
- **No App Store**: Direct installation via web browser
- **Instant Updates**: No app store review process
- **Smaller Size**: <5MB vs 50MB+ native apps
- **Faster Development**: Web technologies vs native languages
- **Offline Capable**: Service workers enable offline functionality
- **Installable**: Users can "install" like native apps

### Web APIs for Mesh Networking
- **Web Bluetooth API**: BLE device discovery and communication
- **WebRTC**: Peer-to-peer data channels for device communication
- **Network Information API**: Network status and connection type
- **Geolocation API**: GPS location sharing
- **Wake Lock API**: Keep device awake for mesh operations
- **Background Sync**: Service worker background tasks

## Implementation Architecture

### PWA Core Components
```
┌─────────────────────────────────────────┐
│         MeshNet PWA Application         │
├─────────────────────────────────────────┤
│  - React Frontend                       │
│  - Web Bluetooth Integration            │
│  - WebRTC Peer Connections              │
│  - Service Worker (Offline Support)      │
│  - Background Sync                      │
│  - Wake Lock API                        │
└─────────────────────────────────────────┘
         ↓              ↓              ↓
    ┌─────────┐  ┌──────────┐  ┌──────────┐
    │   BLE   │  │  WebRTC  │  │  HTTP    │
    │ Scanner │  │  P2P     │  │  API     │
    └─────────┘  └──────────┘  └──────────┘
```

## Phase 1: PWA Foundation (Week 1)

### 1.1 Enhanced Manifest ✅
- Added comprehensive manifest with shortcuts
- Added app categories for emergency communication
- Added protocol handlers for deep linking
- Added feature list for app store descriptions

### 1.2 Service Worker Enhancement
```typescript
// sw-enhanced.ts - Enhanced service worker for mesh networking
const MESH_CACHE_NAME = 'mesh-network-v1';
const MESH_DATA_CACHE = 'mesh-data-v1';

// Mesh-specific caching strategies
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(MESH_CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/',
        '/manifest.webmanifest',
        '/offline.html',
        '/api/mesh/topology', // Cache topology
      ]);
    })
  );
});

// Background sync for mesh messages
self.addEventListener('sync', (event) => {
  if (event.tag === 'mesh-sync') {
    event.waitUntil(syncMeshMessages());
  }
});

// Push notifications for emergency alerts
self.addEventListener('push', (event) => {
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification('MeshNet Emergency', {
      body: data.message,
      icon: '/icons/icon-192.svg',
      tag: 'mesh-emergency',
      requireInteraction: true,
    })
  );
});

async function syncMeshMessages() {
  // Sync queued messages with mesh server
  const messages = await getQueuedMessages();
  for (const message of messages) {
    await sendMessageToMesh(message);
  }
}
```

### 1.3 Install Prompt UI
```typescript
// components/PWAInstallPrompt.tsx
import { useState, useEffect } from 'react';

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setShowInstall(false);
    }
    setDeferredPrompt(null);
  };

  if (!showInstall) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-lg">
      <p className="font-semibold mb-2">Install MeshNet for Offline Access</p>
      <button 
        onClick={handleInstall}
        className="bg-white text-blue-600 px-4 py-2 rounded font-semibold"
      >
        Install App
      </button>
    </div>
  );
}
```

## Phase 2: Web Bluetooth Integration (Week 2)

### 2.1 Bluetooth Device Discovery
```typescript
// services/bluetooth.ts
export class BluetoothMeshService {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;

  readonly MESH_SERVICE_UUID = '0x180A';
  readonly MESH_DATA_UUID = '0x2A01';
  readonly MESH_CONTROL_UUID = '0x2A00';

  async discoverDevices(): Promise<BluetoothDevice[]> {
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{
          services: [this.MESH_SERVICE_UUID]
        }],
        optionalServices: [this.MESH_DATA_UUID]
      });

      this.device = device;
      return [device];
    } catch (error) {
      console.error('Bluetooth discovery failed:', error);
      return [];
    }
  }

  async connectToDevice(device: BluetoothDevice): Promise<boolean> {
    try {
      this.server = await device.gatt?.connect();
      if (!this.server) return false;

      const service = await this.server.getPrimaryService(this.MESH_SERVICE_UUID);
      this.characteristic = await service.getCharacteristic(this.MESH_DATA_UUID);

      // Enable notifications
      await this.characteristic.startNotifications();
      this.characteristic.addEventListener('characteristicvaluechanged', this.handleData.bind(this));

      return true;
    } catch (error) {
      console.error('Bluetooth connection failed:', error);
      return false;
    }
  }

  async sendData(data: ArrayBuffer): Promise<void> {
    if (!this.characteristic) {
      throw new Error('Not connected to device');
    }
    await this.characteristic.writeValue(data);
  }

  private handleData(event: Event) {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    const data = value.buffer;
    // Process incoming mesh data
    this.processMeshData(data);
  }

  private processMeshData(data: ArrayBuffer) {
    // Parse mesh protocol data
    const message = this.parseMeshMessage(data);
    // Handle message routing
  }

  private parseMeshMessage(data: ArrayBuffer): MeshMessage {
    // Implement mesh message parsing
    return {} as MeshMessage;
  }

  async disconnect(): Promise<void> {
    if (this.server) {
      await this.server.disconnect();
    }
    this.device = null;
    this.server = null;
    this.characteristic = null;
  }
}
```

### 2.2 Bluetooth Scanner Component
```typescript
// components/BluetoothScanner.tsx
import { useState, useEffect } from 'react';
import { BluetoothMeshService } from '../services/bluetooth';

export function BluetoothScanner() {
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connected, setConnected] = useState(false);
  const bluetoothService = new BluetoothMeshService();

  const startScan = async () => {
    setScanning(true);
    const foundDevices = await bluetoothService.discoverDevices();
    setDevices(foundDevices);
    setScanning(false);
  };

  const connectToDevice = async (device: BluetoothDevice) => {
    const success = await bluetoothService.connectToDevice(device);
    if (success) {
      setConnected(true);
      // Register with mesh backend
      await registerWithMesh(device.id);
    }
  };

  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <h3 className="text-white font-semibold mb-4">Bluetooth Mesh Discovery</h3>
      
      <button
        onClick={startScan}
        disabled={scanning}
        className="bg-blue-600 text-white px-4 py-2 rounded mb-4"
      >
        {scanning ? 'Scanning...' : 'Scan for Devices'}
      </button>

      <div className="space-y-2">
        {devices.map((device) => (
          <div key={device.id} className="flex items-center justify-between bg-gray-700 p-3 rounded">
            <div>
              <p className="text-white font-medium">{device.name || 'Unknown Device'}</p>
              <p className="text-gray-400 text-sm">{device.id}</p>
            </div>
            <button
              onClick={() => connectToDevice(device)}
              className="bg-green-600 text-white px-3 py-1 rounded text-sm"
            >
              Connect
            </button>
          </div>
        ))}
      </div>

      {connected && (
        <div className="mt-4 p-3 bg-green-900 text-white rounded">
          Connected to MeshNet via Bluetooth
        </div>
      )}
    </div>
  );
}
```

## Phase 3: WebRTC Integration (Week 3)

### 3.1 WebRTC Mesh Connection
```typescript
// services/webrtc.ts
export class WebRTCMeshService {
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private localStream: MediaStream | null = null;

  readonly config = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  async createPeerConnection(remoteDeviceId: string): Promise<RTCPeerConnection> {
    const pc = new RTCPeerConnection(this.config);

    // Create data channel for mesh messaging
    const dataChannel = pc.createDataChannel('mesh-data', {
      ordered: true,
      maxRetransmits: 3
    });

    this.setupDataChannel(dataChannel, remoteDeviceId);
    this.dataChannels.set(remoteDeviceId, dataChannel);

    // ICE candidate handling
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendIceCandidate(remoteDeviceId, event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected') {
        this.handleDisconnection(remoteDeviceId);
      }
    };

    this.peerConnections.set(remoteDeviceId, pc);
    return pc;
  }

  async offerConnection(remoteDeviceId: string): Promise<RTCSessionDescription> {
    const pc = await this.createPeerConnection(remoteDeviceId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    return offer;
  }

  async acceptConnection(remoteDeviceId: string, offer: RTCSessionDescription): Promise<RTCSessionDescription> {
    const pc = await this.createPeerConnection(remoteDeviceId);
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return answer;
  }

  async finalizeConnection(remoteDeviceId: string, answer: RTCSessionDescription): Promise<void> {
    const pc = this.peerConnections.get(remoteDeviceId);
    if (pc) {
      await pc.setRemoteDescription(answer);
    }
  }

  async addIceCandidate(remoteDeviceId: string, candidate: RTCIceCandidate): Promise<void> {
    const pc = this.peerConnections.get(remoteDeviceId);
    if (pc) {
      await pc.addIceCandidate(candidate);
    }
  }

  private setupDataChannel(channel: RTCDataChannel, deviceId: string): void {
    channel.onopen = () => {
      console.log(`Data channel opened with ${deviceId}`);
      // Send initial mesh registration
      this.sendMeshMessage(deviceId, {
        type: 'register',
        deviceId: this.getLocalDeviceId(),
        timestamp: Date.now()
      });
    };

    channel.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMeshMessage(deviceId, message);
    };

    channel.onclose = () => {
      console.log(`Data channel closed with ${deviceId}`);
      this.handleDisconnection(deviceId);
    };
  }

  sendMeshMessage(deviceId: string, message: any): void {
    const channel = this.dataChannels.get(deviceId);
    if (channel && channel.readyState === 'open') {
      channel.send(JSON.stringify(message));
    }
  }

  private handleMeshMessage(deviceId: string, message: any): void {
    // Handle incoming mesh messages
    switch (message.type) {
      case 'register':
        this.handleDeviceRegistration(deviceId, message);
        break;
      case 'data':
        this.handleDataMessage(deviceId, message);
        break;
      case 'route':
        this.handleRouteUpdate(deviceId, message);
        break;
    }
  }

  private handleDisconnection(deviceId: string): void {
    this.peerConnections.delete(deviceId);
    this.dataChannels.delete(deviceId);
    // Notify backend of disconnection
  }

  private sendIceCandidate(deviceId: string, candidate: RTCIceCandidate): void {
    // Send ICE candidate via signaling server
  }

  private getLocalDeviceId(): string {
    // Return local device ID
    return localStorage.getItem('mesh-device-id') || this.generateDeviceId();
  }

  private generateDeviceId(): string {
    return 'device-' + Math.random().toString(36).substr(2, 9);
  }

  disconnectFrom(deviceId: string): void {
    const pc = this.peerConnections.get(deviceId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(deviceId);
    }
    const channel = this.dataChannels.get(deviceId);
    if (channel) {
      channel.close();
      this.dataChannels.delete(deviceId);
    }
  }

  disconnectAll(): void {
    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();
    this.dataChannels.forEach((channel) => channel.close());
    this.dataChannels.clear();
  }
}
```

### 3.2 WebRTC Connection Manager
```typescript
// components/WebRTCManager.tsx
import { useState, useEffect } from 'react';
import { WebRTCMeshService } from '../services/webrtc';

export function WebRTCManager() {
  const [connectedDevices, setConnectedDevices] = useState<string[]>([]);
  const [signalingConnected, setSignalingConnected] = useState(false);
  const webrtcService = new WebRTCMeshService();

  useEffect(() => {
    // Connect to signaling server
    connectToSignaling();
    
    return () => {
      webrtcService.disconnectAll();
    };
  }, []);

  const connectToSignaling = () => {
    // WebSocket connection to signaling server
    const ws = new WebSocket('ws://localhost:4000/signaling');
    
    ws.onopen = () => {
      setSignalingConnected(true);
      // Register device
      ws.send(JSON.stringify({
        type: 'register',
        deviceId: getLocalDeviceId()
      }));
    };

    ws.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      await handleSignalingMessage(message);
    };

    ws.onclose = () => {
      setSignalingConnected(false);
      // Reconnect logic
    };
  };

  const handleSignalingMessage = async (message: any) => {
    switch (message.type) {
      case 'offer':
        const answer = await webrtcService.acceptConnection(message.deviceId, message.offer);
        // Send answer via signaling
        break;
      case 'answer':
        await webrtcService.finalizeConnection(message.deviceId, message.answer);
        setConnectedDevices(prev => [...prev, message.deviceId]);
        break;
      case 'ice-candidate':
        await webrtcService.addIceCandidate(message.deviceId, message.candidate);
        break;
    }
  };

  const initiateConnection = async (remoteDeviceId: string) => {
    const offer = await webrtcService.offerConnection(remoteDeviceId);
    // Send offer via signaling server
  };

  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <h3 className="text-white font-semibold mb-4">WebRTC Mesh Connections</h3>
      
      <div className="flex items-center mb-4">
        <div className={`w-3 h-3 rounded-full mr-2 ${signalingConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-gray-300">
          {signalingConnected ? 'Signaling Connected' : 'Signaling Disconnected'}
        </span>
      </div>

      <div className="space-y-2">
        {connectedDevices.map(deviceId => (
          <div key={deviceId} className="flex items-center justify-between bg-gray-700 p-3 rounded">
            <span className="text-white">{deviceId}</span>
            <button
              onClick={() => webrtcService.disconnectFrom(deviceId)}
              className="bg-red-600 text-white px-3 py-1 rounded text-sm"
            >
              Disconnect
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Phase 4: WiFi Hotspot Management (Week 4)

### 4.1 WiFi Hotspot Detection
```typescript
// services/wifi.ts
export class WiFiHotspotService {
  async detectMeshNetHotspots(): Promise<WiFiNetwork[]> {
    // Note: Direct WiFi scanning is limited in browsers
    // Use Network Information API for connection type
    const connection = (navigator as any).connection;
    
    if (connection) {
      const effectiveType = connection.effectiveType;
      const saveData = connection.saveData;
      
      // Check if connected to WiFi
      if (connection.type === 'wifi') {
        // Assume MeshNet hotspot if specific pattern detected
        return this.detectHotspotPattern();
      }
    }
    
    return [];
  }

  private detectHotspotPattern(): WiFiNetwork[] {
    // Check if connected to MeshNet hotspot
    // This would require backend cooperation
    return [];
  }

  async createHotspotConfig(): Promise<HotspotConfig> {
    // Generate hotspot configuration
    const deviceId = this.getLocalDeviceId();
    const password = this.generatePassword();
    
    return {
      ssid: `MeshNet-${deviceId.slice(-6)}`,
      password: password,
      security: 'WPA2-PSK',
      channel: 'auto',
      maxConnections: 10
    };
  }

  private generatePassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  private getLocalDeviceId(): string {
    return localStorage.getItem('mesh-device-id') || this.generateDeviceId();
  }

  private generateDeviceId(): string {
    return 'device-' + Math.random().toString(36).substr(2, 9);
  }
}
```

### 4.2 Hotspot Management UI
```typescript
// components/HotspotManager.tsx
import { useState, useEffect } from 'react';
import { WiFiHotspotService } from '../services/wifi';

export function HotspotManager() {
  const [hotspotConfig, setHotspotConfig] = useState<HotspotConfig | null>(null);
  const [isHotspotActive, setIsHotspotActive] = useState(false);
  const [connectedDevices, setConnectedDevices] = useState<number>(0);
  const wifiService = new WiFiHotspotService();

  useEffect(() => {
    loadHotspotConfig();
  }, []);

  const loadHotspotConfig = async () => {
    const config = await wifiService.createHotspotConfig();
    setHotspotConfig(config);
  };

  const activateHotspot = async () => {
    if (!hotspotConfig) return;

    // Register hotspot with backend
    const response = await fetch('/api/mesh/hotspot/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Mesh-Secret': localStorage.getItem('mesh-secret') || ''
      },
      body: JSON.stringify({
        device_id: getLocalDeviceId(),
        ip: '192.168.1.1',
        password: hotspotConfig.password,
        max_connections: hotspotConfig.maxConnections
      })
    });

    if (response.ok) {
      setIsHotspotActive(true);
      // Guide user to enable hotspot manually
      showHotspotInstructions(hotspotConfig);
    }
  };

  const showHotspotInstructions = (config: HotspotConfig) => {
    // Show instructions for enabling hotspot
    alert(`Enable WiFi hotspot with:\nSSID: ${config.ssid}\nPassword: ${config.password}`);
  };

  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <h3 className="text-white font-semibold mb-4">WiFi Hotspot Management</h3>
      
      {hotspotConfig && (
        <div className="bg-gray-700 p-4 rounded mb-4">
          <p className="text-gray-300 mb-2">
            <span className="font-semibold">SSID:</span> {hotspotConfig.ssid}
          </p>
          <p className="text-gray-300 mb-2">
            <span className="font-semibold">Password:</span> {hotspotConfig.password}
          </p>
          <p className="text-gray-300">
            <span className="font-semibold">Max Connections:</span> {hotspotConfig.maxConnections}
          </p>
        </div>
      )}

      {!isHotspotActive ? (
        <button
          onClick={activateHotspot}
          className="bg-blue-600 text-white px-4 py-2 rounded w-full"
        >
          Activate Hotspot
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between bg-green-900 p-3 rounded">
            <span className="text-white">Hotspot Active</span>
            <span className="text-green-300">{connectedDevices} devices connected</span>
          </div>
          <button
            onClick={() => setIsHotspotActive(false)}
            className="bg-red-600 text-white px-4 py-2 rounded w-full"
          >
            Deactivate Hotspot
          </button>
        </div>
      )}
    </div>
  );
}
```

## Phase 5: Integration & Testing (Week 5)

### 5.1 Main Mesh Component
```typescript
// components/MeshNetwork.tsx
import { useState } from 'react';
import { BluetoothScanner } from './BluetoothScanner';
import { WebRTCManager } from './WebRTCManager';
import { HotspotManager } from './HotspotManager';
import { PWAInstallPrompt } from './PWAInstallPrompt';

export function MeshNetwork() {
  const [activeProtocol, setActiveProtocol] = useState<'ble' | 'webrtc' | 'hotspot' | null>(null);
  const [isEmergencyMode, setIsEmergencyMode] = useState(false);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <PWAInstallPrompt />
      
      <header className="bg-gray-800 p-4">
        <h1 className="text-2xl font-bold">MeshNet AI</h1>
        <p className="text-gray-400">Emergency Mesh Communication</p>
      </header>

      <main className="p-4 space-y-6">
        {/* Emergency Mode Toggle */}
        <div className="bg-red-900 p-4 rounded-lg">
          <button
            onClick={() => setIsEmergencyMode(!isEmergencyMode)}
            className={`w-full py-3 rounded font-semibold ${
              isEmergencyMode ? 'bg-red-700' : 'bg-red-600'
            }`}
          >
            {isEmergencyMode ? 'Emergency Mode Active' : 'Activate Emergency Mode'}
          </button>
        </div>

        {/* Protocol Selection */}
        <div className="bg-gray-800 p-4 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Connection Protocol</h2>
          <div className="grid grid-cols-3 gap-4">
            <button
              onClick={() => setActiveProtocol('ble')}
              className={`p-4 rounded ${
                activeProtocol === 'ble' ? 'bg-blue-600' : 'bg-gray-700'
              }`}
            >
              <div className="text-2xl mb-2">📡</div>
              <div className="font-semibold">BLE</div>
              <div className="text-sm text-gray-400">Low Power</div>
            </button>
            <button
              onClick={() => setActiveProtocol('webrtc')}
              className={`p-4 rounded ${
                activeProtocol === 'webrtc' ? 'bg-blue-600' : 'bg-gray-700'
              }`}
            >
              <div className="text-2xl mb-2">🔗</div>
              <div className="font-semibold">WebRTC</div>
              <div className="text-sm text-gray-400">P2P Data</div>
            </button>
            <button
              onClick={() => setActiveProtocol('hotspot')}
              className={`p-4 rounded ${
                activeProtocol === 'hotspot' ? 'bg-blue-600' : 'bg-gray-700'
              }`}
            >
              <div className="text-2xl mb-2">📶</div>
              <div className="font-semibold">Hotspot</div>
              <div className="text-sm text-gray-400">Universal</div>
            </button>
          </div>
        </div>

        {/* Protocol Components */}
        {activeProtocol === 'ble' && <BluetoothScanner />}
        {activeProtocol === 'webrtc' && <WebRTCManager />}
        {activeProtocol === 'hotspot' && <HotspotManager />}

        {/* Network Status */}
        <div className="bg-gray-800 p-4 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Network Status</h2>
          <NetworkStatus />
        </div>
      </main>
    </div>
  );
}
```

### 5.2 Network Status Component
```typescript
// components/NetworkStatus.tsx
import { useState, useEffect } from 'react';

export function NetworkStatus() {
  const [status, setStatus] = useState({
    online: navigator.onLine,
    connectionType: 'unknown',
    latency: 0,
    devicesConnected: 0
  });

  useEffect(() => {
    const updateStatus = () => {
      const connection = (navigator as any).connection;
      setStatus({
        online: navigator.onLine,
        connectionType: connection?.effectiveType || 'unknown',
        latency: connection?.rtt || 0,
        devicesConnected: status.devicesConnected
      });
    };

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    
    const interval = setInterval(updateStatus, 5000);

    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-gray-400">Status</span>
        <span className={`font-semibold ${status.online ? 'text-green-400' : 'text-red-400'}`}>
          {status.online ? 'Online' : 'Offline'}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-gray-400">Connection</span>
        <span className="text-white">{status.connectionType}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-gray-400">Latency</span>
        <span className="text-white">{status.latency}ms</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-gray-400">Mesh Devices</span>
        <span className="text-white">{status.devicesConnected}</span>
      </div>
    </div>
  );
}
```

## Testing Strategy

### Cross-Platform Testing
```
1. Android Chrome
   - PWA installation
   - Web Bluetooth discovery
   - WebRTC connections
   - Service worker offline mode

2. iOS Safari
   - PWA installation (limited Web Bluetooth)
   - WebRTC connections
   - Service worker offline mode

3. Desktop Browsers
   - Chrome/Edge (full support)
   - Firefox (limited Web Bluetooth)
   - Safari (limited support)

4. Network Conditions
   - Offline mode
   - Slow connections
   - Intermittent connectivity
```

### Performance Testing
```
- PWA load time <3 seconds
- Service worker installation <1 second
- Bluetooth discovery <10 seconds
- WebRTC connection <5 seconds
- Offline functionality immediate
```

## Deployment

### Build Configuration
```bash
# Build PWA
npm run build

# Test PWA
npm run preview

# Deploy to server
# Copy dist/ contents to web server
# Ensure HTTPS is enabled (required for PWA)
```

### Server Requirements
```
- HTTPS certificate (required for PWA)
- Service worker MIME type correct
- Manifest.webmanifest accessible
- CORS headers configured
- WebSocket support for WebRTC signaling
```

## Best Practices

### Security
- Use HTTPS for all connections
- Validate all incoming data
- Implement rate limiting
- Secure WebSocket connections
- Encrypt sensitive data

### Performance
- Lazy load components
- Optimize images and assets
- Use efficient caching strategies
- Minimize JavaScript bundle size
- Test on low-end devices

### User Experience
- Clear installation instructions
- Offline capability indicators
- Connection status feedback
- Emergency mode prioritization
- Battery optimization

## Limitations

### Web Bluetooth
- Not supported on iOS Safari
- Requires user gesture for discovery
- Limited background operation
- Platform-specific limitations

### WebRTC
- Requires signaling server
- NAT traversal challenges
- Firewall restrictions
- Battery consumption

### PWA Limitations
- No background processing on iOS
- Limited push notification support
- Platform-specific restrictions
- Storage limitations

## Conclusion

This PWA approach provides a practical solution for cross-platform mesh networking without native development. While there are platform limitations, the solution works on most modern browsers and provides emergency communication capabilities across devices.

The implementation leverages modern web APIs to provide mesh networking functionality while maintaining the benefits of PWA technology: cross-platform compatibility, offline support, and easy distribution.
