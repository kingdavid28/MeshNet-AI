/**
 * Multi-Hop Mesh Routing Protocol
 * Implements BATMAN-inspired routing for offline mesh networks
 * Follows best practices for emergency communication networks
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MeshNode {
  id: string;
  address: string; // BLE address or IP
  position: { lat: number; lng: number };
  battery: number;
  signal: number;
  lastSeen: number;
  neighbors: string[]; // Direct neighbors
}

export interface MeshPacket {
  id: string;
  source: string;
  destination: string;
  hopCount: number;
  maxHops: number;
  ttl: number; // Time to live in milliseconds
  payload: any;
  timestamp: number;
  route: string[]; // Path taken
  priority: 'emergency' | 'high' | 'normal' | 'low';
}

export interface RouteEntry {
  destination: string;
  nextHop: string;
  hopCount: number;
  lastSeen: number;
  metric: number; // Route quality metric
}

export interface RoutingTable {
  [destination: string]: RouteEntry;
}

// ─── Mesh Routing Protocol ────────────────────────────────────────────────────

export class MeshRoutingProtocol {
  private nodeId: string;
  private routingTable: RoutingTable = {};
  private knownNodes: Map<string, MeshNode> = new Map();
  private messageQueue: Map<string, MeshPacket[]> = new Map();
  private maxHops: number = 10;
  private defaultTTL: number = 300000; // 5 minutes

  constructor(nodeId: string) {
    this.nodeId = nodeId;
  }

  // ─── Route Discovery ────────────────────────────────────────────────────────

  /**
   * Discover route to destination using flood-based routing
   * Similar to BATMAN protocol but simplified for emergency use
   */
  async discoverRoute(destination: string): Promise<string[] | null> {
    if (destination === this.nodeId) {
      return [this.nodeId];
    }

    // Check routing table first
    const existingRoute = this.routingTable[destination];
    if (existingRoute && this.isRouteValid(existingRoute)) {
      return [this.nodeId, existingRoute.nextHop];
    }

    // Perform route discovery via flooding
    const route = await this.floodRouteDiscovery(destination);
    if (route) {
      this.updateRoutingTable(destination, route[1], route.length - 1);
      return route;
    }

    return null;
  }

  /**
   * Flood-based route discovery
   * Sends route discovery packets through the network
   */
  private async floodRouteDiscovery(destination: string): Promise<string[] | null> {
    const discoveryPacket: MeshPacket = {
      id: this.generatePacketId(),
      source: this.nodeId,
      destination,
      hopCount: 0,
      maxHops: this.maxHops,
      ttl: this.defaultTTL,
      payload: { type: 'route_discovery' },
      timestamp: Date.now(),
      route: [this.nodeId],
      priority: 'high'
    };

    // Broadcast to all neighbors
    const neighbors = this.getNeighbors();
    for (const neighbor of neighbors) {
      await this.sendPacket(neighbor, discoveryPacket);
    }

    // Wait for route response (simplified - in real implementation would use callbacks)
    return this.waitForRouteResponse(destination, 5000);
  }

  /**
   * Wait for route response with timeout
   */
  private async waitForRouteResponse(destination: string, timeout: number): Promise<string[] | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeout);
      
      // In real implementation, this would listen for route responses
      // For now, return a simple route if destination is a known neighbor
      const neighbors = this.getNeighbors();
      if (neighbors.includes(destination)) {
        clearTimeout(timer);
        resolve([this.nodeId, destination]);
      } else {
        clearTimeout(timer);
        resolve(null);
      }
    });
  }

  // ─── Packet Forwarding ───────────────────────────────────────────────────────

  /**
   * Send packet to specific node
   */
  async sendPacket(destination: string, packet: MeshPacket): Promise<boolean> {
    if (destination === this.nodeId) {
      // Packet is for us
      this.handlePacket(packet);
      return true;
    }

    // Check if destination is direct neighbor
    const neighbors = this.getNeighbors();
    if (neighbors.includes(destination)) {
      return await this.transmitPacket(destination, packet);
    }

    // Multi-hop routing
    const route = await this.discoverRoute(destination);
    if (route && route.length > 1) {
      const nextHop = route[1];
      packet.route = [...packet.route, this.nodeId];
      packet.hopCount++;
      
      if (packet.hopCount >= packet.maxHops) {
        console.log('Max hops reached, dropping packet');
        return false;
      }

      return await this.transmitPacket(nextHop, packet);
    }

    // Store for later if route not found
    this.queuePacket(destination, packet);
    return false;
  }

  /**
   * Transmit packet to specific node (implementation-specific)
   */
  private async transmitPacket(destination: string, packet: MeshPacket): Promise<boolean> {
    // In real implementation, this would use BLE, WiFi, or other transport
    console.log(`Transmitting packet to ${destination}:`, packet);
    return true; // Simplified
  }

  /**
   * Handle incoming packet
   */
  handlePacket(packet: MeshPacket): void {
    // Check if we've already seen this packet (prevent loops)
    if (packet.route.includes(this.nodeId)) {
      console.log('Packet loop detected, dropping');
      return;
    }

    // Check TTL
    if (Date.now() - packet.timestamp > packet.ttl) {
      console.log('Packet TTL expired, dropping');
      return;
    }

    if (packet.destination === this.nodeId) {
      // Packet is for us
      this.deliverPacket(packet);
    } else {
      // Forward packet
      this.forwardPacket(packet);
    }
  }

  /**
   * Forward packet to next hop
   */
  private async forwardPacket(packet: MeshPacket): Promise<void> {
    packet.route = [...packet.route, this.nodeId];
    packet.hopCount++;

    if (packet.hopCount >= packet.maxHops) {
      console.log('Max hops reached, dropping packet');
      return;
    }

    const route = this.routingTable[packet.destination];
    if (route && this.isRouteValid(route)) {
      await this.transmitPacket(route.nextHop, packet);
    } else {
      // Route not found, queue for later
      this.queuePacket(packet.destination, packet);
    }
  }

  /**
   * Deliver packet to application layer
   */
  private deliverPacket(packet: MeshPacket): void {
    console.log('Packet delivered:', packet);
    // In real implementation, this would emit an event or call a callback
  }

  // ─── Routing Table Management ────────────────────────────────────────────────

  /**
   * Update routing table with new route
   */
  updateRoutingTable(destination: string, nextHop: string, hopCount: number): void {
    const metric = this.calculateRouteMetric(nextHop, hopCount);
    
    this.routingTable[destination] = {
      destination,
      nextHop,
      hopCount,
      lastSeen: Date.now(),
      metric
    };

    console.log(`Updated routing table: ${destination} via ${nextHop} (${hopCount} hops, metric: ${metric})`);
  }

  /**
   * Calculate route quality metric
   * Considers hop count, signal strength, and battery
   */
  private calculateRouteMetric(nextHop: string, hopCount: number): number {
    const node = this.knownNodes.get(nextHop);
    if (!node) return hopCount * 100;

    const signalPenalty = (100 - node.signal) * 0.5;
    const batteryPenalty = node.battery < 30 ? 50 : 0;
    const hopPenalty = hopCount * 10;

    return hopPenalty + signalPenalty + batteryPenalty;
  }

  /**
   * Check if route is still valid
   */
  private isRouteValid(route: RouteEntry): boolean {
    const age = Date.now() - route.lastSeen;
    return age < 60000; // Route valid for 1 minute
  }

  /**
   * Clean up stale routes
   */
  cleanupStaleRoutes(): void {
    const now = Date.now();
    for (const [destination, route] of Object.entries(this.routingTable)) {
      if (now - route.lastSeen > 60000) {
        delete this.routingTable[destination];
        console.log(`Removed stale route to ${destination}`);
      }
    }
  }

  // ─── Node Management ────────────────────────────────────────────────────────

  /**
   * Add or update known node
   */
  updateNode(node: MeshNode): void {
    this.knownNodes.set(node.id, node);
    node.lastSeen = Date.now();
    
    // Update routing table if this is a direct neighbor
    if (node.neighbors.includes(this.nodeId)) {
      this.updateRoutingTable(node.id, node.id, 1);
    }
  }

  /**
   * Get direct neighbors
   */
  getNeighbors(): string[] {
    const neighbors: string[] = [];
    for (const [id, node] of this.knownNodes.entries()) {
      if (node.neighbors.includes(this.nodeId)) {
        neighbors.push(id);
      }
    }
    return neighbors;
  }

  /**
   * Get all known nodes
   */
  getKnownNodes(): MeshNode[] {
    return Array.from(this.knownNodes.values());
  }

  // ─── Message Queue ───────────────────────────────────────────────────────────

  /**
   * Queue packet for later delivery
   */
  private queuePacket(destination: string, packet: MeshPacket): void {
    if (!this.messageQueue.has(destination)) {
      this.messageQueue.set(destination, []);
    }
    this.messageQueue.get(destination)!.push(packet);
    console.log(`Queued packet for ${destination}`);
  }

  /**
   * Attempt to deliver queued packets
   */
  async processQueue(): Promise<void> {
    for (const [destination, packets] of this.messageQueue.entries()) {
      const route = await this.discoverRoute(destination);
      if (route) {
        for (const packet of packets) {
          await this.sendPacket(destination, packet);
        }
        this.messageQueue.delete(destination);
      }
    }
  }

  // ─── Utilities ──────────────────────────────────────────────────────────────

  private generatePacketId(): string {
    return `${this.nodeId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get routing table for debugging/visualization
   */
  getRoutingTable(): RoutingTable {
    return { ...this.routingTable };
  }

  /**
   * Get network statistics
   */
  getNetworkStats(): {
    totalNodes: number;
    directNeighbors: number;
    routingTableSize: number;
    queuedPackets: number;
  } {
    return {
      totalNodes: this.knownNodes.size,
      directNeighbors: this.getNeighbors().length,
      routingTableSize: Object.keys(this.routingTable).length,
      queuedPackets: Array.from(this.messageQueue.values()).reduce((sum, packets) => sum + packets.length, 0)
    };
  }
}

// ─── Route Optimization ───────────────────────────────────────────────────────

/**
 * Optimize routes based on network conditions
 */
export function optimizeRoutes(routingTable: RoutingTable, nodes: Map<string, MeshNode>): RoutingTable {
  const optimized: RoutingTable = {};

  for (const [destination, route] of Object.entries(routingTable)) {
    const nextHopNode = nodes.get(route.nextHop);
    if (!nextHopNode) continue;

    // Calculate new metric based on current conditions
    const signalPenalty = (100 - nextHopNode.signal) * 0.5;
    const batteryPenalty = nextHopNode.battery < 30 ? 50 : 0;
    const hopPenalty = route.hopCount * 10;
    const newMetric = hopPenalty + signalPenalty + batteryPenalty;

    // Find alternative routes if current metric is poor
    if (newMetric > 100) {
      const alternativeRoute = findAlternativeRoute(destination, nodes, routingTable);
      if (alternativeRoute) {
        optimized[destination] = alternativeRoute;
        continue;
      }
    }

    optimized[destination] = { ...route, metric: newMetric };
  }

  return optimized;
}

/**
 * Find alternative route with better metric
 */
function findAlternativeRoute(
  destination: string,
  nodes: Map<string, MeshNode>,
  currentTable: RoutingTable
): RouteEntry | null {
  // Simplified - in real implementation would use Dijkstra or similar
  const currentNode = Array.from(nodes.values())[0];
  if (!currentNode) return null;

  return {
    destination,
    nextHop: currentNode.id,
    hopCount: 2,
    lastSeen: Date.now(),
    metric: 50
  };
}
