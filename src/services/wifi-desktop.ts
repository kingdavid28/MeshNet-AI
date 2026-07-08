/**
 * Desktop WiFi Service for Electron
 * Uses native WiFi APIs through IPC bridge for WiFi scanning and hotspot creation
 */

export interface DesktopWiFiNetwork {
  ssid: string;
  bssid: string[];
  signal: number;
  security: string;
  channel: number;
}

export interface DesktopHotspotConfig {
  ssid: string;
  password: string;
  interface?: string;
}

export class DesktopWiFiService {
  private readonly isElectron: boolean;
  private readonly electronAPI: any;

  constructor() {
    this.isElectron = globalThis.window !== undefined && !!(globalThis.window as any).electronAPI;
    this.electronAPI = this.isElectron ? (globalThis.window as any).electronAPI : null;
  }

  isSupported(): boolean {
    return this.isElectron;
  }

  async scanNetworks(): Promise<DesktopWiFiNetwork[]> {
    if (!this.isElectron || !this.electronAPI) {
      throw new Error('Desktop WiFi service only available in Electron app');
    }

    try {
      const result = await this.electronAPI.scanNetworks();
      if (result.success) {
        return result.networks;
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('[Desktop WiFi] Scan failed:', error);
      throw error;
    }
  }

  async createHotspot(config: DesktopHotspotConfig): Promise<any> {
    if (!this.isElectron || !this.electronAPI) {
      throw new Error('Desktop WiFi service only available in Electron app');
    }

    try {
      const result = await this.electronAPI.createHotspot(config);
      if (result.success) {
        return result.result;
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('[Desktop WiFi] Hotspot creation failed:', error);
      throw error;
    }
  }

  async stopHotspot(): Promise<any> {
    if (!this.isElectron || !this.electronAPI) {
      throw new Error('Desktop WiFi service only available in Electron app');
    }

    try {
      const result = await this.electronAPI.stopHotspot();
      if (result.success) {
        return result.result;
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('[Desktop WiFi] Hotspot stop failed:', error);
      throw error;
    }
  }

  async checkElevated(): Promise<boolean> {
    if (!this.isElectron || !this.electronAPI) {
      return false;
    }

    try {
      const result = await this.electronAPI.checkElevated();
      if (result.success) {
        return result.isElevated;
      } else {
        return false;
      }
    } catch (error) {
      console.error('[Desktop WiFi] Elevated check failed:', error);
      return false;
    }
  }

  getPlatform(): string {
    if (this.isElectron && this.electronAPI) {
      return this.electronAPI.platform;
    }
    return 'browser';
  }

  async getConnectedDevicesCount(): Promise<number> {
    if (!this.isElectron || !this.electronAPI) {
      return 0;
    }

    try {
      const result = await this.electronAPI.getConnectedDevicesCount();
      if (result.success) {
        return result.count;
      } else {
        return 0;
      }
    } catch (error) {
      console.error('[Desktop WiFi] Connected devices count failed:', error);
      return 0;
    }
  }

  async getConnectedDevices(): Promise<Array<{ip: string, mac: string}>> {
    if (!this.isElectron || !this.electronAPI) {
      return [];
    }

    try {
      const result = await this.electronAPI.getConnectedDevices();
      if (result.success) {
        return result.devices || [];
      } else {
        return [];
      }
    } catch (error) {
      console.error('[Desktop WiFi] Connected devices failed:', error);
      return [];
    }
  }

  async getHotspotIP(): Promise<string> {
    if (!this.isElectron || !this.electronAPI) {
      return '192.168.137.1'; // NOSONAR — Windows Mobile Hotspot default gateway
    }

    try {
      const result = await this.electronAPI.getHotspotIP();
      if (result.success) {
        return result.ip || '192.168.137.1'; // NOSONAR
      } else {
        return '192.168.137.1'; // NOSONAR
      }
    } catch (error) {
      console.error('[Desktop WiFi] Hotspot IP failed:', error);
      return '192.168.137.1'; // NOSONAR
    }
  }

  async startRedirectServer(hotspotIP: string): Promise<{ port?: number | null; method?: string; proxied?: boolean; manualUrl?: string | null } | null> {
    if (!this.isElectron || !this.electronAPI) {
      console.warn('[Desktop WiFi] Redirect server only available in Electron app');
      return null;
    }
    try {
      const result = await this.electronAPI.startRedirectServer(hotspotIP);
      if (!result.success) {
        console.error('[Desktop WiFi] Redirect server start failed:', result.error);
        return null;
      }
      return { port: result.port, method: result.method, proxied: result.proxied, manualUrl: result.manualUrl };
    } catch (error) {
      console.error('[Desktop WiFi] Redirect server start failed:', error);
      return null;
    }
  }

  async stopRedirectServer(): Promise<void> {
    if (!this.isElectron || !this.electronAPI) {
      return;
    }

    try {
      const result = await this.electronAPI.stopRedirectServer();
      if (!result.success) {
        console.error('[Desktop WiFi] Redirect server stop failed:', result.error);
      }
    } catch (error) {
      console.error('[Desktop WiFi] Redirect server stop failed:', error);
    }
  }
}
