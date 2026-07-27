/**
 * Mesh Service Discovery Protocol
 * DNS-like service discovery for offline mesh networks
 * Follows best practices for service registration and discovery
 */

import { MeshRoutingProtocol, MeshNode } from './meshRouting';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ServiceInfo {
  id: string;
  name: string;
  type: string;
  version: string;
  nodeId: string;
  address: string;
  port: number;
  metadata: any;
  lastSeen: number;
  ttl: number;
  status: 'active' | 'inactive' | 'degraded';
  load: number; // 0-100 percentage
  capabilities: string[];
}

export interface ServiceQuery {
  type?: string;
  name?: string;
  version?: string;
  capabilities?: string[];
  minLoad?: number;
  status?: 'active' | 'inactive' | 'degraded';
}

export interface ServiceRegistration {
  service: ServiceInfo;
  timestamp: number;
  signature?: string; // For authentication
}

// ─── Service Discovery Protocol ─────────────────────────────────────────────────

export class ServiceDiscoveryProtocol {
  private nodeId: string;
  private routingProtocol: MeshRoutingProtocol;
  private serviceRegistry: Map<string, ServiceInfo> = new Map();
  private serviceCache: Map<string, ServiceInfo[]> = new Map(); // Query -> Results cache
  private maxCacheSize: number = 100;
  private defaultTTL: number = 300000; // 5 minutes

  constructor(nodeId: string, routingProtocol: MeshRoutingProtocol) {
    this.nodeId = nodeId;
    this.routingProtocol = routingProtocol;
    this.loadServiceRegistry();
  }

  // ─── Service Registration ─────────────────────────────────────────────────────

  /**
   * Register a service with the mesh network
   */
  registerService(service: Omit<ServiceInfo, 'id' | 'nodeId' | 'lastSeen' | 'status'>): string {
    const serviceId = this.generateServiceId(service.name, this.nodeId);
    
    const serviceInfo: ServiceInfo = {
      ...service,
      id: serviceId,
      nodeId: this.nodeId,
      lastSeen: Date.now(),
      status: 'active',
      ttl: service.ttl || this.defaultTTL
    };

    this.serviceRegistry.set(serviceId, serviceInfo);
    this.invalidateCache();
    this.persistServiceRegistry();

    // Announce service to network
    this.announceService(serviceInfo);

    console.log(`Registered service: ${service.name} (${service.type})`);
    return serviceId;
  }

  /**
   * Unregister a service
   */
  unregisterService(serviceId: string): boolean {
    const removed = this.serviceRegistry.delete(serviceId);
    if (removed) {
      this.invalidateCache();
      this.persistServiceRegistry();
      console.log(`Unregistered service: ${serviceId}`);
    }
    return removed;
  }

  /**
   * Update service status
   */
  updateServiceStatus(serviceId: string, status: 'active' | 'inactive' | 'degraded', load?: number): boolean {
    const service = this.serviceRegistry.get(serviceId);
    if (!service) return false;

    service.status = status;
    service.lastSeen = Date.now();
    if (load !== undefined) service.load = load;

    this.invalidateCache();
    this.persistServiceRegistry();
    return true;
  }

  /**
   * Heartbeat to keep service alive
   */
  heartbeatService(serviceId: string): boolean {
    const service = this.serviceRegistry.get(serviceId);
    if (!service) return false;

    service.lastSeen = Date.now();
    service.status = 'active';
    this.persistServiceRegistry();
    return true;
  }

  // ─── Service Discovery ───────────────────────────────────────────────────────

  /**
   * Discover services matching query
   */
  async discoverServices(query: ServiceQuery): Promise<ServiceInfo[]> {
    // Check cache first
    const cacheKey = this.generateCacheKey(query);
    const cached = this.serviceCache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      return cached;
    }

    // Query local registry
    const results = this.queryLocalRegistry(query);

    // If insufficient results, query network
    if (results.length < 3) {
      const networkResults = await this.queryNetwork(query);
      results.push(...networkResults);
    }

    // Cache results
    this.serviceCache.set(cacheKey, results);
    this.limitCacheSize();

    return results;
  }

  /**
   * Query local service registry
   */
  private queryLocalRegistry(query: ServiceQuery): ServiceInfo[] {
    const results: ServiceInfo[] = [];

    for (const service of this.serviceRegistry.values()) {
      if (this.matchesQuery(service, query)) {
        results.push(service);
      }
    }

    // Sort by load and status
    return this.sortServices(results);
  }

  /**
   * Query network for services
   */
  private async queryNetwork(query: ServiceQuery): Promise<ServiceInfo[]> {
    const results: ServiceInfo[] = [];
    const queryPacket = {
      type: 'service_query',
      query,
      source: this.nodeId,
      timestamp: Date.now()
    };

    // Broadcast to network
    // In real implementation, this would use the routing protocol
    console.log('Querying network for services:', query);

    return results;
  }

  /**
   * Check if service matches query
   */
  private matchesQuery(service: ServiceInfo, query: ServiceQuery): boolean {
    if (query.type && service.type !== query.type) return false;
    if (query.name && !service.name.includes(query.name)) return false;
    if (query.version && service.version !== query.version) return false;
    if (query.status && service.status !== query.status) return false;
    if (query.minLoad && service.load > query.minLoad) return false;
    if (query.capabilities) {
      for (const cap of query.capabilities) {
        if (!service.capabilities.includes(cap)) return false;
      }
    }
    return true;
  }

  /**
   * Sort services by quality
   */
  private sortServices(services: ServiceInfo[]): ServiceInfo[] {
    return services.sort((a, b) => {
      // Prefer active services
      if (a.status !== b.status) {
        const statusOrder = { active: 0, degraded: 1, inactive: 2 };
        return statusOrder[a.status] - statusOrder[b.status];
      }

      // Prefer lower load
      if (a.load !== b.load) return a.load - b.load;

      // Prefer more recently seen
      return b.lastSeen - a.lastSeen;
    });
  }

  /**
   * Get service by ID
   */
  getService(serviceId: string): ServiceInfo | null {
    return this.serviceRegistry.get(serviceId) || null;
  }

  /**
   * Get services by type
   */
  async getServicesByType(type: string): Promise<ServiceInfo[]> {
    return await this.discoverServices({ type });
  }

  /**
   * Get best service for a type
   */
  async getBestService(type: string): Promise<ServiceInfo | null> {
    const services = await this.getServicesByType(type);
    return services.length > 0 ? services[0] : null;
  }

  // ─── Service Announcement ────────────────────────────────────────────────────

  /**
   * Announce service to network
   */
  private announceService(service: ServiceInfo): void {
    const announcement = {
      type: 'service_announcement',
      service,
      source: this.nodeId,
      timestamp: Date.now()
    };

    // Broadcast to network
    console.log(`Announcing service: ${service.name}`);
  }

  /**
   * Process service announcement from network
   */
  processServiceAnnouncement(announcement: any): void {
    const service = announcement.service as ServiceInfo;
    if (!service || !service.id) return;

    // Update or add service
    const existing = this.serviceRegistry.get(service.id);
    if (existing) {
      existing.lastSeen = Date.now();
      existing.status = service.status;
      existing.load = service.load;
    } else {
      this.serviceRegistry.set(service.id, service);
    }

    this.invalidateCache();
    this.persistServiceRegistry();
  }

  // ─── Service Health Monitoring ───────────────────────────────────────────────

  /**
   * Check service health
   */
  async checkServiceHealth(serviceId: string): Promise<boolean> {
    const service = this.serviceRegistry.get(serviceId);
    if (!service) return false;

    try {
      // In real implementation, this would ping the service
      const isHealthy = await this.pingService(service);
      
      if (isHealthy) {
        service.status = 'active';
        service.lastSeen = Date.now();
      } else {
        service.status = 'degraded';
      }

      this.persistServiceRegistry();
      return isHealthy;
    } catch (error) {
      service.status = 'inactive';
      this.persistServiceRegistry();
      return false;
    }
  }

  /**
   * Ping service to check availability
   */
  private async pingService(service: ServiceInfo): Promise<boolean> {
    // In real implementation, this would send a health check request
    console.log(`Pinging service: ${service.name}`);
    return true; // Simplified
  }

  /**
   * Cleanup expired services
   */
  cleanupExpiredServices(): number {
    let cleaned = 0;
    const now = Date.now();

    for (const [id, service] of this.serviceRegistry.entries()) {
      if (now - service.lastSeen > service.ttl) {
        this.serviceRegistry.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.invalidateCache();
      this.persistServiceRegistry();
      console.log(`Cleaned up ${cleaned} expired services`);
    }

    return cleaned;
  }

  // ─── Load Balancing ─────────────────────────────────────────────────────────

  /**
   * Get service with lowest load
   */
  async getLeastLoadedService(type: string): Promise<ServiceInfo | null> {
    const services = await this.getServicesByType(type);
    const activeServices = services.filter((s: ServiceInfo) => s.status === 'active');
    
    if (activeServices.length === 0) return null;

    return activeServices.reduce((min: ServiceInfo, current: ServiceInfo) => 
      current.load < min.load ? current : min
    );
  }

  /**
   * Get services sorted by proximity
   */
  async getServicesByProximity(type: string, location: { lat: number; lng: number }): Promise<ServiceInfo[]> {
    const services = await this.getServicesByType(type);
    const nodes = this.routingProtocol.getKnownNodes();

    return services.sort((a: ServiceInfo, b: ServiceInfo) => {
      const nodeA = nodes.find(n => n.id === a.nodeId);
      const nodeB = nodes.find(n => n.id === b.nodeId);

      if (!nodeA || !nodeB) return 0;

      const distA = this.calculateDistance(location, nodeA.position);
      const distB = this.calculateDistance(location, nodeB.position);

      return distA - distB;
    });
  }

  /**
   * Calculate distance between two points
   */
  private calculateDistance(
    pos1: { lat: number; lng: number },
    pos2: { lat: number; lng: number }
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = (pos2.lat - pos1.lat) * Math.PI / 180;
    const dLng = (pos2.lng - pos1.lng) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(pos1.lat * Math.PI / 180) * Math.cos(pos2.lat * Math.PI / 180) *
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  // ─── Service Statistics ───────────────────────────────────────────────────────

  /**
   * Get service statistics
   */
  getServiceStats(): {
    totalServices: number;
    activeServices: number;
    inactiveServices: number;
    degradedServices: number;
    byType: { [key: string]: number };
    averageLoad: number;
  } {
    const services = Array.from(this.serviceRegistry.values());
    const byType: { [key: string]: number } = {};
    let totalLoad = 0;

    for (const service of services) {
      byType[service.type] = (byType[service.type] || 0) + 1;
      totalLoad += service.load;
    }

    return {
      totalServices: services.length,
      activeServices: services.filter(s => s.status === 'active').length,
      inactiveServices: services.filter(s => s.status === 'inactive').length,
      degradedServices: services.filter(s => s.status === 'degraded').length,
      byType,
      averageLoad: services.length > 0 ? totalLoad / services.length : 0
    };
  }

  // ─── Caching ─────────────────────────────────────────────────────────────────

  private generateCacheKey(query: ServiceQuery): string {
    return JSON.stringify(query);
  }

  private isCacheValid(services: ServiceInfo[]): boolean {
    if (services.length === 0) return true;
    const oldest = Math.min(...services.map(s => s.lastSeen));
    return Date.now() - oldest < 60000; // Cache valid for 1 minute
  }

  private invalidateCache(): void {
    this.serviceCache.clear();
  }

  private limitCacheSize(): void {
    if (this.serviceCache.size > this.maxCacheSize) {
      const entries = Array.from(this.serviceCache.entries());
      entries.sort((a, b) => {
        const oldestA = Math.min(...a[1].map(s => s.lastSeen));
        const oldestB = Math.min(...b[1].map(s => s.lastSeen));
        return oldestA - oldestB;
      });

      // Remove oldest entries
      const toRemove = entries.slice(0, entries.length - this.maxCacheSize);
      for (const [key] of toRemove) {
        this.serviceCache.delete(key);
      }
    }
  }

  // ─── Persistence ─────────────────────────────────────────────────────────────

  private persistServiceRegistry(): void {
    try {
      const data = {
        registry: Array.from(this.serviceRegistry.entries()),
        cache: Array.from(this.serviceCache.entries())
      };
      localStorage.setItem('mesh_service_registry', JSON.stringify(data));
    } catch (error) {
      console.error('Failed to persist service registry:', error);
    }
  }

  private loadServiceRegistry(): void {
    try {
      const data = localStorage.getItem('mesh_service_registry');
      if (data) {
        const parsed = JSON.parse(data);
        this.serviceRegistry = new Map(parsed.registry || []);
        this.serviceCache = new Map(parsed.cache || []);
        console.log('Loaded service registry from storage');
      }
    } catch (error) {
      console.error('Failed to load service registry:', error);
    }
  }

  /**
   * Clear all services
   */
  clearServiceRegistry(): void {
    this.serviceRegistry.clear();
    this.serviceCache.clear();
    this.persistServiceRegistry();
    console.log('Cleared all services from registry');
  }

  // ─── Utilities ──────────────────────────────────────────────────────────────

  private generateServiceId(name: string, nodeId: string): string {
    return `${name}-${nodeId}-${Date.now()}`;
  }
}

// ─── Service Types ───────────────────────────────────────────────────────────

/**
 * Standard service types for mesh network
 */
export const ServiceTypes = {
  MESH_ROUTING: 'mesh-routing',
  CONTENT_STORAGE: 'content-storage',
  MESSAGE_RELAY: 'message-relay',
  LOCATION_SERVICE: 'location-service',
  EMERGENCY_COORDINATION: 'emergency-coordination',
  MEDICAL_SERVICE: 'medical-service',
  COMMUNICATION_HUB: 'communication-hub',
  DATA_SYNC: 'data-sync',
  AUTHENTICATION: 'authentication',
  DISCOVERY: 'discovery'
} as const;

/**
 * Standard service capabilities
 */
export const ServiceCapabilities = {
  STORE_CONTENT: 'store-content',
  RETRIEVE_CONTENT: 'retrieve-content',
  FORWARD_MESSAGES: 'forward-messages',
  PROVIDE_LOCATION: 'provide-location',
  EMERGENCY_BROADCAST: 'emergency-broadcast',
  MEDICAL_RESPONSE: 'medical-response',
  VOICE_COMMUNICATION: 'voice-communication',
  TEXT_COMMUNICATION: 'text-communication',
  FILE_TRANSFER: 'file-transfer',
  USER_AUTHENTICATION: 'user-authentication'
} as const;

/**
 * Create standard service info
 */
export function createServiceInfo(
  name: string,
  type: string,
  address: string,
  port: number,
  capabilities: string[] = [],
  metadata: any = {}
): Omit<ServiceInfo, 'id' | 'nodeId' | 'lastSeen' | 'status'> {
  return {
    name,
    type,
    version: '1.0.0',
    address,
    port,
    metadata,
    ttl: 300000,
    load: 0,
    capabilities
  };
}
