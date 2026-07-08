// Simplified mDNS/Bonjour discovery service for MeshNet
// In a production environment, this would use native mDNS libraries
// For now, we simulate discovery using periodic network scanning

interface MeshNetService {
  name: string;
  type: string;
  domain: string;
  host: string;
  port: number;
  txt: Record<string, string>;
}

class MDNSService {
  private discoveryInterval: NodeJS.Timeout | null = null;
  private discoveredServices: MeshNetService[] = [];
  private listeners: ((services: MeshNetService[]) => void)[] = [];

  // Start mDNS discovery for MeshNet services
  startDiscovery() {
    console.log('[mDNS] Starting MeshNet service discovery');
    
    // Simulate mDNS discovery with periodic scanning
    this.discoveryInterval = setInterval(() => {
      this.scanForMeshNetServices();
    }, 15000); // Scan every 15 seconds to reduce console noise

    // Initial scan
    this.scanForMeshNetServices();
  }

  // Stop mDNS discovery
  stopDiscovery() {
    console.log('[mDNS] Stopping MeshNet service discovery');
    
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }
  }

  // Scan for MeshNet services (simulated)
  public async scanForMeshNetServices() {
    try {
      // In a real implementation, this would use native mDNS APIs
      // For now, we simulate discovery by checking local network
      
      const services: MeshNetService[] = [];
      
      // Try to discover MeshNet hotspot
      const hotspotService = await this.discoverHotspot();
      if (hotspotService) {
        services.push(hotspotService);
      }

      // Update discovered services
      if (JSON.stringify(services) !== JSON.stringify(this.discoveredServices)) {
        this.discoveredServices = services;
        this.notifyListeners();
      }
    } catch (error) {
      console.error('[mDNS] Discovery scan failed:', error);
    }
  }

  // Discover MeshNet hotspot (simulated)
  private async discoverHotspot(): Promise<MeshNetService | null> {
    // In a real implementation, this would use mDNS to find _http._tcp.local services
    // For simulation, we check if we can reach the local backend
    
    // Try common hotspot IP addresses for automatic discovery.
    // localhost is first so dev mode resolves instantly without waiting for
    // the hotspot IPs (which time out when no hotspot is active).
    const commonHotspotIPs = [
      'localhost',         // Local development — always fast
      '192.168.137.1',    // NOSONAR — Windows Mobile Hotspot gateway
      '192.168.42.1',     // NOSONAR — Android hotspot gateway
      '10.42.0.1',        // NOSONAR — Linux (NetworkManager) hotspot gateway
    ];

    for (const host of commonHotspotIPs) {
      try {
        const response = await fetch(`http://${host}:4000/api/mesh/join`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Mesh-Secret': localStorage.getItem('mesh-secret') || ''
          },
          // Short timeout so unreachable IPs fail fast instead of blocking for 60s
          signal: AbortSignal.timeout(3_000),
        });

        if (response.ok) {
          console.log(`[mDNS] Discovered MeshNet service at ${host}`);
          return {
            name: 'MeshNet Emergency Network',
            type: '_http._tcp',
            domain: 'local',
            host: host,
            port: 4000,
            txt: {
              'ssid': 'MeshNet',
              'password': '', // Open network - no password
              'version': '1.0'
            }
          };
        }
      } catch {
        // Host not reachable or timed out — try next candidate
        continue;
      }
    }

    return null;
  }

  // Register a listener for discovered services
  onServicesDiscovered(listener: (services: MeshNetService[]) => void) {
    this.listeners.push(listener);
  }

  // Remove a listener
  removeListener(listener: (services: MeshNetService[]) => void) {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  // Notify all listeners of discovered services
  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.discoveredServices));
  }

  // Get currently discovered services
  getDiscoveredServices(): MeshNetService[] {
    return this.discoveredServices;
  }

  // Broadcast MeshNet service (for host devices)
  async broadcastService(config: {
    name: string;
    port: number;
    txt: Record<string, string>;
  }) {
    console.log('[mDNS] Broadcasting MeshNet service:', config);
    
    try {
      // In Electron environment, we can try to use native mDNS if available
      if (globalThis.window !== undefined && (globalThis as any).electronAPI) {
        try {
          const result = await (globalThis as any).electronAPI.broadcastMDNSService(config);
          console.log('[mDNS] Native broadcast result:', result);
          return result.success;
        } catch (error) {
          console.log('[mDNS] Native broadcast not available, using simulation:', error);
        }
      }
      
      // Simulation: Store broadcast info in localStorage for other tabs to discover
      const broadcastInfo = {
        ...config,
        timestamp: Date.now(),
        host: globalThis.window?.location.hostname || 'localhost'
      };
      localStorage.setItem('meshnet-broadcast', JSON.stringify(broadcastInfo));
      
      console.log('[mDNS] Service broadcast info stored:', broadcastInfo);
      return true;
    } catch (error) {
      console.error('[mDNS] Broadcast failed:', error);
      return false;
    }
  }
}

// Singleton instance
const mdnsService = new MDNSService();

export default mdnsService;
export type { MeshNetService };
