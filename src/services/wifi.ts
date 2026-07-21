import { getApiBase, getMeshSecret } from '../utils/env';
import { generateHotspotPassword } from '../utils/password';

// WiFi Hotspot Service for MeshNet PWA
export interface HotspotConfig {
  ssid: string;
  password: string;
  security: 'WPA2-PSK' | 'WPA3-PSK' | 'open';
  channel: 'auto' | number;
  maxConnections: number;
  ip?: string;
}

export interface WiFiNetwork {
  ssid: string;
  signalStrength: number;
  security: string;
  isMeshNet: boolean;
}

export class WiFiHotspotService {
  private hotspotConfig: HotspotConfig | null = null;
  private isHotspotActive = false;
  private connectedDevices: number = 0;
  private localDeviceId: string;

  constructor() {
    this.localDeviceId = this.getLocalDeviceId();
  }

  async detectMeshNetHotspots(): Promise<WiFiNetwork[]> {
    // Note: Direct WiFi scanning is limited in browsers
    // Use Network Information API for connection type
    const connection = (navigator as any).connection;
    
    if (!connection) {
      console.log('[WiFi] Network Information API not available');
      return [];
    }

    const networks: WiFiNetwork[] = [];
    
    // Check if connected to WiFi
    if (connection.type === 'wifi' || connection.effectiveType !== '4g') {
      // Check if connected to MeshNet hotspot
      const currentSSID = await this.getCurrentSSID();
      
      if (currentSSID && currentSSID.startsWith('MeshNet-')) {
        networks.push({
          ssid: currentSSID,
          signalStrength: this.getSignalStrength(),
          security: 'WPA2-PSK',
          isMeshNet: true
        });
      }
    }

    // In a real implementation, this would scan for available networks
    // Browser limitations prevent direct WiFi scanning
    // This would require a native bridge or server-side discovery
    
    return networks;
  }

  async createHotspotConfig(): Promise<HotspotConfig> {
    const deviceId = this.localDeviceId;

    const config: HotspotConfig = {
      ssid: 'MeshNet',
      password: generateHotspotPassword(),
      security: 'WPA2-PSK', // Emergency standard
      channel: 'auto',
      maxConnections: 10,
      ip: '192.168.1.1'
    };

    this.hotspotConfig = config;
    return config;
  }

  async activateHotspot(): Promise<boolean> {
    if (!this.hotspotConfig) {
      this.hotspotConfig = await this.createHotspotConfig();
    }

    try {
      // First, register the device with the backend if not already registered
      await fetch(`${getApiBase()}/api/mesh/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Mesh-Secret': getMeshSecret()
        },
        body: JSON.stringify({
          id: this.localDeviceId,
          label: this.localDeviceId,
          name: 'MeshNet Device',
          device: 'smartphone',
          role: 'peer',
          signal: 100,
          batteryPercentage: 100,
          bluetoothStatus: true,
          wifiStatus: true
        })
      });

      // Register hotspot with backend
      const response = await fetch(`${getApiBase()}/api/mesh/hotspot/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Mesh-Secret': getMeshSecret()
        },
        body: JSON.stringify({
          device_id: this.localDeviceId,
          ip: this.hotspotConfig.ip,
          password: this.hotspotConfig.password,
          max_connections: this.hotspotConfig.maxConnections
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[WiFi] Hotspot registered with backend:', data);

        // Note: Actual hotspot activation requires user intervention
        // Browsers cannot directly enable WiFi hotspots
        // This would require:
        // 1. User manual activation
        // 2. Native bridge (Android/iOS)
        // 3. System-level permissions

        // In browser mode, don't auto-activate since user must manually enable in system settings
        // Only emit hotspotActivated when running in desktop/native mode
        const isDesktop = typeof (globalThis as any).electronAPI !== 'undefined';
        if (isDesktop) {
          this.isHotspotActive = true;
          this.emit('hotspotActivated', this.hotspotConfig);
        }

        return true;
      } else {
        console.error('[WiFi] Failed to register hotspot with backend');
        return false;
      }
    } catch (error) {
      console.error('[WiFi] Hotspot activation failed:', error);
      return false;
    }
  }

  async deactivateHotspot(): Promise<boolean> {
    try {
      this.isHotspotActive = false;
      this.connectedDevices = 0;
      
      // Notify backend of deactivation
      await fetch(`${getApiBase()}/api/mesh/nodes/${this.localDeviceId}/heartbeat`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Mesh-Secret': getMeshSecret()
        },
        body: JSON.stringify({
          signal: 60,
          wifiStatus: false
        })
      });

      this.emit('hotspotDeactivated');
      return true;
    } catch (error) {
      console.error('[WiFi] Hotspot deactivation failed:', error);
      return false;
    }
  }

  async connectToHotspot(ssid: string, password: string): Promise<boolean> {
    // Note: Browsers cannot directly connect to WiFi networks
    // This would require:
    // 1. User manual connection
    // 2. Native bridge
    // 3. System-level permissions
    
    console.log('[WiFi] Connection request for:', ssid);
    console.log('[WiFi] User must manually connect to WiFi network');
    
    this.emit('hotspotConnectionRequested', { ssid, password });
    
    // Return true to indicate request was processed
    // Actual connection is manual
    return true;
  }

  getHotspotConfig(): HotspotConfig | null {
    return this.hotspotConfig;
  }

  getHotspotStatus(): {
    active: boolean;
    config: HotspotConfig | null;
    connectedDevices: number;
  } {
    return {
      active: this.isHotspotActive,
      config: this.hotspotConfig,
      connectedDevices: this.connectedDevices
    };
  }

  updateConnectedDevices(count: number): void {
    this.connectedDevices = count;
    this.emit('devicesUpdated', count);
  }

  private async getCurrentSSID(): Promise<string | null> {
    // Note: Browsers cannot directly read current WiFi SSID
    // This would require native bridge or server-side detection
    // For now, return null
    return null;
  }

  private getSignalStrength(): number {
    const connection = (navigator as any).connection;
    if (connection && connection.rtt) {
      // Convert RTT to signal strength approximation
      const rtt = connection.rtt;
      if (rtt < 50) return 100;
      if (rtt < 100) return 80;
      if (rtt < 200) return 60;
      if (rtt < 300) return 40;
      return 20;
    }
    return 50; // Default
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
    let deviceId = localStorage.getItem('mesh-device-id');
    if (!deviceId) {
      deviceId = this.generateDeviceId();
      localStorage.setItem('mesh-device-id', deviceId);
    }
    return deviceId;
  }

  private generateDeviceId(): string {
    return 'device-' + Math.random().toString(36).substring(2, 11);
  }

  // Simple event emitter
  private listeners: Map<string, Function[]> = new Map();

  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback: Function): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emit(event: string, data?: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  // Check if WiFi APIs are available
  static isSupported(): boolean {
    return 'connection' in navigator;
  }

  // Get supported features
  static getSupportedFeatures(): string[] {
    const features: string[] = [];
    
    if ('connection' in navigator) {
      features.push('Network Information');
      features.push('Connection Type Detection');
      features.push('Signal Strength');
    }
    
    // Note: Direct WiFi management is not supported in browsers
    features.push('Hotspot Configuration (Manual)');
    features.push('Backend Integration');
    
    return features;
  }

  // Get limitations
  static getLimitations(): string[] {
    return [
      'Cannot directly enable WiFi hotspot (requires user intervention)',
      'Cannot directly connect to WiFi networks (requires user intervention)',
      'Cannot scan for available networks (browser security restriction)',
      'Cannot read current WiFi SSID (browser security restriction)',
      'Requires native bridge for full WiFi management',
      'iOS has limited WiFi API support'
    ];
  }
}
