/**
 * BLE Service for MeshNet Credential Exchange
 * 
 * This service handles BLE scanning and credential retrieval for the MeshNet hotspot.
 * The desktop app advertises BLE with hotspot credentials, and the phone scans and retrieves them.
 * 
 * Flow:
 * 1. Desktop (Electron) → BLE Advertising (Peripheral) with credentials
 * 2. Phone (Browser) → BLE Scanning (Central) to find MeshNet
 * 3. Phone → Connect to BLE and read credentials
 * 4. Phone → Display credentials for manual WiFi connection
 * 
 * Note: Web Bluetooth API cannot programmatically connect to WiFi networks.
 * Users must manually connect using the retrieved credentials.
 */

export interface MeshNetCredentials {
  ssid: string;
  password: string;
  version: string;
}

export interface MeshNetDevice {
  id: string;
  name: string;
  rssi: number;
  credentials?: MeshNetCredentials;
}

const MESHNET_SERVICE_UUID = '0000FEED-0000-1000-8000-00805F9B34FB';
const CREDENTIALS_CHARACTERISTIC_UUID = '0000FEED-0000-1000-8000-00805F9B34FB';

export class BLEService {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null | undefined = null;
  private scanning: boolean = false;

  /**
   * Check if Web Bluetooth API is available
   */
  isSupported(): boolean {
    return 'bluetooth' in navigator;
  }

  /**
   * Start scanning for MeshNet devices
   */
  async scanForMeshNet(): Promise<MeshNetDevice[]> {
    if (!this.isSupported()) {
      throw new Error('Web Bluetooth API not supported in this browser');
    }

    if (this.scanning) {
      throw new Error('Already scanning');
    }

    this.scanning = true;

    try {
      console.log('[BLE] Starting scan for MeshNet devices...');
      
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [MESHNET_SERVICE_UUID] }],
        optionalServices: [MESHNET_SERVICE_UUID]
      });

      console.log('[BLE] Found MeshNet device:', device.name);

      return [{
        id: device.id,
        name: device.name || 'MeshNet Emergency Network',
        rssi: 0, // RSSI not available in Web Bluetooth API
      }];
    } catch (error) {
      console.error('[BLE] Scan failed:', error);
      throw error;
    } finally {
      this.scanning = false;
    }
  }

  /**
   * Connect to a MeshNet device and retrieve credentials
   */
  async connectAndRetrieveCredentials(deviceId: string): Promise<MeshNetCredentials> {
    if (!this.isSupported()) {
      throw new Error('Web Bluetooth API not supported in this browser');
    }

    try {
      console.log('[BLE] Connecting to device:', deviceId);

      // Request device again (required by Web Bluetooth API)
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [MESHNET_SERVICE_UUID] }],
        optionalServices: [MESHNET_SERVICE_UUID]
      });

      this.device = device;
      this.server = await device.gatt?.connect();
      if (!this.server) {
        throw new Error('Failed to connect to GATT server');
      }
      console.log('[BLE] Connected to GATT server');

      // Get the service
      const service = await this.server.getPrimaryService(MESHNET_SERVICE_UUID);
      console.log('[BLE] Got primary service');

      // Get the credentials characteristic
      const characteristic = await service.getCharacteristic(CREDENTIALS_CHARACTERISTIC_UUID);
      console.log('[BLE] Got credentials characteristic');

      // Read credentials
      const value = await characteristic.readValue();
      const credentials = this.parseCredentials(value);
      console.log('[BLE] Retrieved credentials:', { ssid: credentials.ssid, password: '***' });

      return credentials;
    } catch (error) {
      console.error('[BLE] Connection failed:', error);
      throw error;
    }
  }

  /**
   * Parse credentials from BLE characteristic value
   * Format: JSON string encoded as UTF-8
   */
  private parseCredentials(value: DataView): MeshNetCredentials {
    const decoder = new TextDecoder('utf-8');
    const json = decoder.decode(value);
    
    try {
      const credentials = JSON.parse(json);
      return {
        ssid: credentials.ssid || 'MeshNet-Emergency',
        password: credentials.password || '',
        version: credentials.version || '1.0',
      };
    } catch (error) {
      console.error('[BLE] Failed to parse credentials JSON:', error);
      throw new Error('Invalid credentials format');
    }
  }

  /**
   * Disconnect from the current device
   */
  async disconnect(): Promise<void> {
    if (this.server && this.server.connected) {
      await this.server.disconnect();
      console.log('[BLE] Disconnected from device');
    }
    this.device = null;
    this.server = null;
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.server?.connected ?? false;
  }
}

// Singleton instance
export const bleService = new BLEService();
