/**
 * meshService.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Mesh network service using SQLite for offline operation.
 * 
 * This service provides mesh network operations using local SQLite storage
 * instead of HTTP API calls for offline functionality.
 */

import { getSQLiteService } from './sqliteService';

export interface MeshNode {
  id: string;
  label: string;
  lat: number;
  lng: number;
  battery: number;
  signal: number;
  device: string;
  role: string;
  lastSeen: string;
}

class MeshService {
  private sqliteService = getSQLiteService();

  async registerNode(node: MeshNode): Promise<MeshNode> {
    return this.sqliteService.registerNode(node);
  }

  async getTopology(): Promise<MeshNode[]> {
    return this.sqliteService.getTopology();
  }

  async getNode(nodeId: string): Promise<MeshNode | null> {
    return this.sqliteService.getNode(nodeId);
  }

  async updateNode(nodeId: string, updates: Partial<MeshNode>): Promise<boolean> {
    return this.sqliteService.updateNode(nodeId, updates);
  }

  async sendHeartbeat(nodeId: string): Promise<void> {
    const updates = { lastSeen: new Date().toISOString() };
    this.sqliteService.updateNode(nodeId, updates);
  }

  async sendSOS(nodeId: string): Promise<{ success: boolean; sosId: string }> {
    return this.sqliteService.sendSOS(nodeId);
  }
}

// Singleton instance
let meshService: MeshService | null = null;

export function getMeshService(): MeshService {
  if (!meshService) {
    meshService = new MeshService();
  }
  return meshService;
}

export default MeshService;
