/**
 * Network Transport Layer
 * Integrates mesh protocols with BLE, WiFi, and mDNS infrastructure
 * Provides actual network transmission capabilities
 */

import { MeshRoutingProtocol, MeshPacket, MeshNode } from './meshRouting';
import { getApiBase } from '../utils/env';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TransportType = 'ble' | 'wifi' | 'mdns' | 'http';

export interface TransportConfig {
  type: TransportType;
  enabled: boolean;
  priority: number;
  maxPacketSize: number;
  timeout: number;
}

export interface NetworkPacket {
  id: string;
  data: any;
  timestamp: number;
  transport: TransportType;
  targetAddress: string;
  retryCount: number;
  maxRetries: number;
}

export interface TransportStats {
  type: TransportType;
  packetsSent: number;
  packetsReceived: number;
  packetsFailed: number;
  averageLatency: number;
  lastUsed: number;
}

// ─── Network Transport Layer ───────────────────────────────────────────────────

export class NetworkTransportLayer {
  private nodeId: string;
  private routingProtocol: MeshRoutingProtocol;
  private transports: Map<TransportType, TransportConfig> = new Map();
  private transportStats: Map<TransportType, TransportStats> = new Map();
  private packetQueue: Map<TransportType, NetworkPacket[]> = new Map();
  private activeConnections: Map<string, any> = new Map();

  constructor(nodeId: string, routingProtocol: MeshRoutingProtocol) {
    this.nodeId = nodeId;
    this.routingProtocol = routingProtocol;
    this.initializeTransports();
    this.initializeStats();
  }

  // ─── Transport Initialization ────────────────────────────────────────────────

  private initializeTransports(): void {
    // BLE Transport - High priority for direct device-to-device
    this.transports.set('ble', {
      type: 'ble',
      enabled: this.isBLEAvailable(),
      priority: 1,
      maxPacketSize: 512, // BLE MTU
      timeout: 5000
    });

    // WiFi Transport - Medium priority for local network
    this.transports.set('wifi', {
      type: 'wifi',
      enabled: this.isWiFiAvailable(),
      priority: 2,
      maxPacketSize: 65536, // Standard TCP
      timeout: 3000
    });

    // mDNS Transport - Low priority for discovery
    this.transports.set('mdns', {
      type: 'mdns',
      enabled: this.ismDNSAvailable(),
      priority: 3,
      maxPacketSize: 1024,
      timeout: 2000
    });

    // HTTP Transport - Fallback for backend connections
    this.transports.set('http', {
      type: 'http',
      enabled: true,
      priority: 4,
      maxPacketSize: 1048576, // 1MB
      timeout: 10000
    });
  }

  private initializeStats(): void {
    for (const type of this.transports.keys()) {
      this.transportStats.set(type, {
        type,
        packetsSent: 0,
        packetsReceived: 0,
        packetsFailed: 0,
        averageLatency: 0,
        lastUsed: 0
      });
    }
  }

  // ─── Transport Availability Checks ───────────────────────────────────────────

  private isBLEAvailable(): boolean {
    // Check if Web Bluetooth API is available
    return 'bluetooth' in navigator;
  }

  private isWiFiAvailable(): boolean {
    // Check if we have network connectivity
    return navigator.onLine;
  }

  private ismDNSAvailable(): boolean {
    // mDNS is typically available in local networks
    return navigator.onLine;
  }

  // ─── Packet Transmission ─────────────────────────────────────────────────────

  /**
   * Send packet using best available transport
   */
  async sendPacket(
    targetAddress: string,
    data: any,
    preferredTransport?: TransportType
  ): Promise<boolean> {
    const packet: NetworkPacket = {
      id: this.generatePacketId(),
      data,
      timestamp: Date.now(),
      transport: preferredTransport || this.selectBestTransport(targetAddress, data),
      targetAddress,
      retryCount: 0,
      maxRetries: 3
    };

    return await this.transmitPacket(packet);
  }

  /**
   * Select best transport for packet
   */
  private selectBestTransport(targetAddress: string, data: any): TransportType {
    const dataSize = JSON.stringify(data).length;
    
    // Sort transports by priority and availability
    const availableTransports = Array.from(this.transports.values())
      .filter(t => t.enabled && t.maxPacketSize >= dataSize)
      .sort((a, b) => a.priority - b.priority);

    if (availableTransports.length === 0) {
      return 'http'; // Fallback
    }

    // Select based on address type
    if (targetAddress.includes('BLE:') || targetAddress.length < 20) {
      return 'ble';
    } else if (targetAddress.includes('http')) {
      return 'http';
    } else if (targetAddress.includes('.local')) {
      return 'mdns';
    }

    return availableTransports[0].type;
  }

  /**
   * Transmit packet using specific transport
   */
  private async transmitPacket(packet: NetworkPacket): Promise<boolean> {
    const transport = this.transports.get(packet.transport);
    if (!transport || !transport.enabled) {
      console.error(`Transport ${packet.transport} not available`);
      return false;
    }

    const startTime = Date.now();
    let success = false;

    try {
      switch (packet.transport) {
        case 'ble':
          success = await this.transmitViaBLE(packet);
          break;
        case 'wifi':
          success = await this.transmitViaWiFi(packet);
          break;
        case 'mdns':
          success = await this.transmitViaMDNS(packet);
          break;
        case 'http':
          success = await this.transmitViaHTTP(packet);
          break;
      }

      const latency = Date.now() - startTime;
      this.updateStats(packet.transport, success, latency);

      if (!success && packet.retryCount < packet.maxRetries) {
        packet.retryCount++;
        console.log(`Retrying packet ${packet.id} (attempt ${packet.retryCount})`);
        return await this.transmitPacket(packet);
      }

      return success;
    } catch (error) {
      console.error(`Transmission failed via ${packet.transport}:`, error);
      this.updateStats(packet.transport, false, Date.now() - startTime);
      
      // Try fallback transport
      if (packet.retryCount < packet.maxRetries) {
        packet.retryCount++;
        packet.transport = this.selectFallbackTransport(packet.transport);
        return await this.transmitPacket(packet);
      }

      return false;
    }
  }

  /**
   * Select fallback transport
   */
  private selectFallbackTransport(failedTransport: TransportType): TransportType {
    const availableTransports = Array.from(this.transports.values())
      .filter(t => t.enabled && t.type !== failedTransport)
      .sort((a, b) => a.priority - b.priority);

    return availableTransports.length > 0 ? availableTransports[0].type : 'http';
  }

  // ─── BLE Transmission ────────────────────────────────────────────────────────

  private async transmitViaBLE(packet: NetworkPacket): Promise<boolean> {
    try {
      // Check Web Bluetooth availability
      if (!('bluetooth' in navigator)) {
        console.log('Web Bluetooth not available');
        return false;
      }

      // Parse BLE address
      const bleAddress = packet.targetAddress.replace('BLE:', '');
      
      // Request device
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['battery-service'] }],
        optionalServices: ['generic_access']
      });

      // Connect to device
      const server = await device.gatt!.connect();
      this.activeConnections.set(bleAddress, server);

      // Get service and characteristic
      const service = await server.getPrimaryService('battery-service');
      const characteristic = await service.getCharacteristic('battery_level');

      // Write data (simplified - real implementation would use proper service)
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify(packet.data));
      await characteristic.writeValue(data);

      console.log(`BLE transmission successful to ${bleAddress}`);
      return true;
    } catch (error) {
      console.error('BLE transmission failed:', error);
      return false;
    }
  }

  // ─── WiFi Transmission ───────────────────────────────────────────────────────

  private async transmitViaWiFi(packet: NetworkPacket): Promise<boolean> {
    try {
      // Use fetch for WiFi transmission
      const url = `http://${packet.targetAddress}/mesh/packet`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: packet.id,
          source: this.nodeId,
          data: packet.data,
          timestamp: packet.timestamp
        }),
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        console.log(`WiFi transmission successful to ${packet.targetAddress}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error('WiFi transmission failed:', error);
      return false;
    }
  }

  // ─── mDNS Transmission ──────────────────────────────────────────────────────

  private async transmitViaMDNS(packet: NetworkPacket): Promise<boolean> {
    try {
      // mDNS transmission via local network
      const hostname = packet.targetAddress.replace('.local', '');
      const url = `http://${hostname}.local:4000/mesh/packet`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: packet.id,
          source: this.nodeId,
          data: packet.data,
          timestamp: packet.timestamp
        }),
        signal: AbortSignal.timeout(3000)
      });

      if (response.ok) {
        console.log(`mDNS transmission successful to ${hostname}.local`);
        return true;
      }

      return false;
    } catch (error) {
      console.error('mDNS transmission failed:', error);
      return false;
    }
  }

  // ─── HTTP Transmission ───────────────────────────────────────────────────────

  private async transmitViaHTTP(packet: NetworkPacket): Promise<boolean> {
    try {
      const url = packet.targetAddress.startsWith('http') 
        ? packet.targetAddress 
        : `http://${packet.targetAddress}`;

      const response = await fetch(`${url}/mesh/packet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: packet.id,
          source: this.nodeId,
          data: packet.data,
          timestamp: packet.timestamp
        }),
        signal: AbortSignal.timeout(10000)
      });

      if (response.ok) {
        console.log(`HTTP transmission successful to ${url}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error('HTTP transmission failed:', error);
      return false;
    }
  }

  // ─── Packet Reception ───────────────────────────────────────────────────────

  /**
   * Start listening for incoming packets
   */
  startListening(): void {
    // Start BLE listener
    if (this.transports.get('ble')?.enabled) {
      this.startBLEListener();
    }

    // Start WiFi/mDNS listener via polling
    this.startNetworkListener();
  }

  private startBLEListener(): void {
    // Web Bluetooth doesn't support listening for connections
    // This would need to be implemented via a native bridge
    console.log('BLE listener started (native bridge required)');
  }

  private startNetworkListener(): void {
    // Poll for incoming packets via HTTP endpoint
    const apiBase = getApiBase();
    setInterval(async () => {
      try {
        const response = await fetch(`${apiBase}/api/mesh/incoming`);
        if (response.ok) {
          const packets = await response.json();
          for (const packet of packets) {
            await this.handleIncomingPacket(packet);
          }
        }
      } catch (error) {
        // Silent fail - polling will retry
      }
    }, 5000);
  }

  private async handleIncomingPacket(packet: any): Promise<void> {
    const stats = this.transportStats.get('http');
    if (stats) {
      stats.packetsReceived++;
      stats.lastUsed = Date.now();
    }

    // Forward to routing protocol
    const meshPacket: MeshPacket = {
      id: packet.id,
      source: packet.source,
      destination: this.nodeId,
      hopCount: packet.hopCount || 0,
      maxHops: packet.maxHops || 10,
      ttl: packet.ttl || 60000,
      payload: packet.data,
      timestamp: packet.timestamp,
      route: packet.route || [],
      priority: packet.priority || 'normal'
    };

    this.routingProtocol.handlePacket(meshPacket);
  }

  // ─── Statistics and Management ───────────────────────────────────────────────

  private updateStats(type: TransportType, success: boolean, latency: number): void {
    const stats = this.transportStats.get(type);
    if (!stats) return;

    if (success) {
      stats.packetsSent++;
      stats.averageLatency = (stats.averageLatency * (stats.packetsSent - 1) + latency) / stats.packetsSent;
    } else {
      stats.packetsFailed++;
    }
    stats.lastUsed = Date.now();
  }

  getTransportStats(): TransportStats[] {
    return Array.from(this.transportStats.values());
  }

  getTransportConfig(type: TransportType): TransportConfig | undefined {
    return this.transports.get(type);
  }

  enableTransport(type: TransportType): void {
    const config = this.transports.get(type);
    if (config) {
      config.enabled = true;
      console.log(`Enabled ${type} transport`);
    }
  }

  disableTransport(type: TransportType): void {
    const config = this.transports.get(type);
    if (config) {
      config.enabled = false;
      console.log(`Disabled ${type} transport`);
    }
  }

  // ─── Connection Management ─────────────────────────────────────────────────

  async disconnect(address: string): Promise<void> {
    const connection = this.activeConnections.get(address);
    if (connection) {
      try {
        if (connection.disconnect) {
          await connection.disconnect();
        }
        this.activeConnections.delete(address);
        console.log(`Disconnected from ${address}`);
      } catch (error) {
        console.error(`Disconnect failed for ${address}:`, error);
      }
    }
  }

  async disconnectAll(): Promise<void> {
    const addresses = Array.from(this.activeConnections.keys());
    for (const address of addresses) {
      await this.disconnect(address);
    }
  }

  // ─── Utilities ──────────────────────────────────────────────────────────────

  private generatePacketId(): string {
    return `pkt-${this.nodeId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getActiveConnections(): string[] {
    return Array.from(this.activeConnections.keys());
  }

  isConnected(address: string): boolean {
    return this.activeConnections.has(address);
  }
}

// ─── Integration with Mesh Routing Protocol ─────────────────────────────────────

/**
 * Enhance mesh routing protocol with network transport
 */
export function integrateTransportWithRouting(
  routingProtocol: MeshRoutingProtocol,
  transportLayer: NetworkTransportLayer
): void {
  // Override transmitPacket method
  const originalTransmit = routingProtocol['transmitPacket'];
  
  routingProtocol['transmitPacket'] = async (destination: string, packet: MeshPacket): Promise<boolean> => {
    // Use network transport layer for actual transmission
    return await transportLayer.sendPacket(destination, packet);
  };

  // Start listening for incoming packets
  transportLayer.startListening();

  console.log('Network transport layer integrated with routing protocol');
}
