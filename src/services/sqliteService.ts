/**
 * sqliteService.ts
 * ────────────────────────────────────────────────────────────────────────────
 * SQLite service for offline React app using Capacitor SQLite plugin.
 * 
 * This service provides direct SQLite database access for offline operation,
 * replacing the need for a separate backend server.
 */

import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';

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

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  email: string;
  category: string;
  location: string;
  medicalSpecialty?: string;
}

export interface MedicalFacility {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: string;
  phone: string;
  address: string;
}

export interface Shelter {
  id: string;
  name: string;
  lat: number;
  lng: number;
  capacity: number;
  currentOccupancy: number;
  phone: string;
  address: string;
}

export interface DiscoveredPeer {
  nodeId: string;
  label: string;
  lat: number;
  lng: number;
  battery: number;
  signal: number;
  protocol: string;
  firstSeen: number;
  lastSeen: number;
}

class SQLiteService {
  private readonly sqlite: SQLiteConnection;
  private db: SQLiteDBConnection | null = null;
  private initialized: boolean = false;
  private readonly nodes: Map<string, MeshNode> = new Map();

  constructor() {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[SQLiteService] Already initialized, skipping');
      return;
    }

    // Only initialize SQLite on native platforms (Android/iOS)
    // On web, use in-memory fallback
    if (!Capacitor.isNativePlatform()) {
      console.log('[SQLiteService] Web platform detected, using in-memory fallback');
      this.initialized = true;
      return;
    }

    try {
      console.log('[SQLiteService] Starting database initialization...');
      
      // Create database connection
      this.db = await this.sqlite.createConnection(
        'meshnet-local',
        false,
        'no-encryption',
        1,
        false
      );
      console.log('[SQLiteService] Database connection created');

      // Open database
      await this.db.open();
      console.log('[SQLiteService] Database opened');

      // Create tables
      await this.createTables();
      console.log('[SQLiteService] Tables created');

      this.initialized = true;
      console.log('[SQLiteService] Database initialized successfully');
    } catch (error) {
      console.error('[SQLiteService] Failed to initialize database:', error);
      // SQLite is required for standalone app - throw error to prevent app from running without it
      throw new Error(`SQLite initialization failed: ${error instanceof Error ? error.message : String(error)}. SQLite is required for the app to function in standalone mode.`);
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) return;

    const createEmergencyContacts = `
      CREATE TABLE IF NOT EXISTS emergency_contacts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        category TEXT NOT NULL,
        location TEXT,
        medical_specialty TEXT
      );
    `;

    const createMedicalFacilities = `
      CREATE TABLE IF NOT EXISTS medical_facilities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        type TEXT,
        phone TEXT,
        address TEXT
      );
    `;

    const createShelters = `
      CREATE TABLE IF NOT EXISTS shelters (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        capacity INTEGER,
        current_occupancy INTEGER,
        phone TEXT,
        address TEXT
      );
    `;

    const createDiscoveredPeers = `
      CREATE TABLE IF NOT EXISTS discovered_peers (
        node_id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        battery INTEGER,
        signal INTEGER,
        protocol TEXT,
        first_seen INTEGER,
        last_seen INTEGER
      );
    `;

    await this.db.execute(createEmergencyContacts);
    await this.db.execute(createMedicalFacilities);
    await this.db.execute(createShelters);
    await this.db.execute(createDiscoveredPeers);
  }

  // Mesh Node Operations (in-memory)
  registerNode(node: MeshNode): MeshNode {
    this.nodes.set(node.id, node);
    return node;
  }

  getTopology(): MeshNode[] {
    return Array.from(this.nodes.values());
  }

  getNode(nodeId: string): MeshNode | null {
    return this.nodes.get(nodeId) || null;
  }

  updateNode(nodeId: string, updates: Partial<MeshNode>): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;

    const updated = { ...node, ...updates, lastSeen: new Date().toISOString() };
    this.nodes.set(nodeId, updated);
    return true;
  }

  // Emergency Contact Operations
  async addEmergencyContact(contact: EmergencyContact): Promise<boolean> {
    if (!this.db) {
      console.error('[SQLiteService] addEmergencyContact: Database not initialized');
      return false;
    }

    try {
      await this.db.execute(
        `INSERT INTO emergency_contacts (id, name, phone, email, category, location, medical_specialty) VALUES ('${contact.id}', '${contact.name}', '${contact.phone}', '${contact.email}', '${contact.category}', '${contact.location}', '${contact.medicalSpecialty || ''}')`
      );
      console.log('[SQLiteService] Emergency contact added successfully:', contact.id);
      return true;
    } catch (error) {
      console.error('[SQLiteService] Failed to add emergency contact:', error);
      return false;
    }
  }

  async searchEmergencyContacts(query: string = '', category: string = ''): Promise<EmergencyContact[]> {
    if (!this.db) return [];

    let sql = 'SELECT * FROM emergency_contacts';
    const params: any[] = [];

    if (query && category) {
      sql += ' WHERE (name LIKE ? OR location LIKE ?) AND category = ?';
      params.push(`%${query}%`, `%${query}%`, category);
    } else if (query) {
      sql += ' WHERE name LIKE ? OR location LIKE ?';
      params.push(`%${query}%`, `%${query}%`);
    } else if (category) {
      sql += ' WHERE category = ?';
      params.push(category);
    }

    const result = await this.db.query(sql, params);
    return (result.values || []) as EmergencyContact[];
  }

  // Medical Facilities Operations
  async addMedicalFacility(facility: MedicalFacility): Promise<boolean> {
    if (!this.db) {
      console.error('[SQLiteService] addMedicalFacility: Database not initialized');
      return false;
    }

    try {
      await this.db.execute(
        `INSERT INTO medical_facilities (id, name, lat, lng, type, phone, address) VALUES ('${facility.id}', '${facility.name}', ${facility.lat}, ${facility.lng}, '${facility.type}', '${facility.phone}', '${facility.address}')`
      );
      console.log('[SQLiteService] Medical facility added successfully:', facility.id);
      return true;
    } catch (error) {
      console.error('[SQLiteService] Failed to add medical facility:', error);
      return false;
    }
  }

  async getMedicalFacilities(lat: number = 0, lng: number = 0, radius: number = 10): Promise<(MedicalFacility & { distance: number })[]> {
    if (!this.db) return [];

    const facilities = await this.db.query('SELECT * FROM medical_facilities');
    
    return (facilities.values || []).map((fac: any) => {
      const distance = Math.sqrt(Math.pow(fac.lat - lat, 2) + Math.pow(fac.lng - lng, 2));
      return { ...fac, distance };
    }).filter((fac: any) => fac.distance <= radius);
  }

  // Shelters Operations
  async addShelter(shelter: Shelter): Promise<boolean> {
    if (!this.db) {
      console.error('[SQLiteService] addShelter: Database not initialized');
      return false;
    }

    try {
      await this.db.execute(
        `INSERT INTO shelters (id, name, lat, lng, capacity, current_occupancy, phone, address) VALUES ('${shelter.id}', '${shelter.name}', ${shelter.lat}, ${shelter.lng}, ${shelter.capacity}, ${shelter.currentOccupancy}, '${shelter.phone}', '${shelter.address}')`
      );
      console.log('[SQLiteService] Shelter added successfully:', shelter.id);
      return true;
    } catch (error) {
      console.error('[SQLiteService] Failed to add shelter:', error);
      return false;
    }
  }

  async getShelters(lat: number = 0, lng: number = 0, radius: number = 10): Promise<(Shelter & { distance: number })[]> {
    if (!this.db) return [];

    const shelters = await this.db.query('SELECT * FROM shelters');
    
    return (shelters.values || []).map((shelter: any) => {
      const distance = Math.sqrt(Math.pow(shelter.lat - lat, 2) + Math.pow(shelter.lng - lng, 2));
      return { ...shelter, distance };
    }).filter((shelter: any) => shelter.distance <= radius);
  }

  // Discovered Peers Operations
  async addDiscoveredPeer(peer: DiscoveredPeer): Promise<boolean> {
    if (!this.db) {
      console.error('[SQLiteService] addDiscoveredPeer: Database not initialized');
      return false;
    }

    try {
      await this.db.execute(
        `INSERT OR REPLACE INTO discovered_peers (node_id, label, lat, lng, battery, signal, protocol, first_seen, last_seen) VALUES ('${peer.nodeId}', '${peer.label}', ${peer.lat}, ${peer.lng}, ${peer.battery}, ${peer.signal}, '${peer.protocol}', ${peer.firstSeen}, ${peer.lastSeen})`
      );
      console.log('[SQLiteService] Discovered peer added successfully:', peer.nodeId);
      return true;
    } catch (error) {
      console.error('[SQLiteService] Failed to add discovered peer:', error);
      return false;
    }
  }

  async getDiscoveredPeers(): Promise<DiscoveredPeer[]> {
    if (!this.db) return [];

    const result = await this.db.query('SELECT * FROM discovered_peers');
    return (result.values || []).map((row: any) => ({
      nodeId: row.node_id,
      label: row.label,
      lat: row.lat,
      lng: row.lng,
      battery: row.battery,
      signal: row.signal,
      protocol: row.protocol,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen
    }));
  }

  async updateDiscoveredPeer(nodeId: string, updates: Partial<DiscoveredPeer>): Promise<boolean> {
    if (!this.db) return false;

    try {
      const setClause = Object.entries(updates)
        .filter(([key]) => key !== 'nodeId')
        .map(([key, value]) => {
          const dbKey = key === 'nodeId' ? 'node_id' : 
                        key === 'firstSeen' ? 'first_seen' : 
                        key === 'lastSeen' ? 'last_seen' : key;
          return `${dbKey} = ${typeof value === 'string' ? `'${value}'` : value}`;
        })
        .join(', ');

      await this.db.execute(
        `UPDATE discovered_peers SET ${setClause}, last_seen = ${Date.now()} WHERE node_id = '${nodeId}'`
      );
      return true;
    } catch (error) {
      console.error('[SQLiteService] Failed to update discovered peer:', error);
      return false;
    }
  }

  async cleanupOldPeers(maxAgeMs: number = 3600000): Promise<number> {
    if (!this.db) return 0;

    try {
      const cutoff = Date.now() - maxAgeMs;
      const result = await this.db.execute(
        `DELETE FROM discovered_peers WHERE last_seen < ${cutoff}`
      );
      return result.changes?.changes || 0;
    } catch (error) {
      console.error('[SQLiteService] Failed to cleanup old peers:', error);
      return 0;
    }
  }

  // Backend Sync Operations
  async syncFromBackend(apiBase: string): Promise<{ success: boolean; synced: number; errors: string[] }> {
    if (!this.db) {
      return { success: false, synced: 0, errors: ['Database not initialized'] };
    }

    const errors: string[] = [];
    let synced = 0;

    try {
      // Sync emergency contacts
      try {
        const contactsRes = await fetch(`${apiBase}/api/contacts`);
        if (contactsRes.ok) {
          const contacts = await contactsRes.json();
          for (const contact of contacts) {
            const success = await this.addEmergencyContact(contact);
            if (success) synced++;
          }
        }
      } catch (error) {
        errors.push(`Failed to sync contacts: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Sync medical facilities
      try {
        const facilitiesRes = await fetch(`${apiBase}/api/facilities`);
        if (facilitiesRes.ok) {
          const facilities = await facilitiesRes.json();
          for (const facility of facilities) {
            const success = await this.addMedicalFacility(facility);
            if (success) synced++;
          }
        }
      } catch (error) {
        errors.push(`Failed to sync facilities: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Sync shelters
      try {
        const sheltersRes = await fetch(`${apiBase}/api/shelters`);
        if (sheltersRes.ok) {
          const shelters = await sheltersRes.json();
          for (const shelter of shelters) {
            const success = await this.addShelter(shelter);
            if (success) synced++;
          }
        }
      } catch (error) {
        errors.push(`Failed to sync shelters: ${error instanceof Error ? error.message : String(error)}`);
      }

      console.log('[SQLiteService] Backend sync complete:', { synced, errors });
      return { success: errors.length === 0, synced, errors };
    } catch (error) {
      console.error('[SQLiteService] Backend sync failed:', error);
      return { success: false, synced, errors: [error instanceof Error ? error.message : String(error)] };
    }
  }

  // SOS Operation
  sendSOS(nodeId: string): { success: boolean; sosId: string } {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.role = 'emergency';
      this.nodes.set(nodeId, node);
    }
    return { success: true, sosId: `sos-${Date.now()}` };
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
    this.initialized = false;
  }
}

// Singleton instance
let sqliteService: SQLiteService | null = null;

export function getSQLiteService(): SQLiteService {
  if (!sqliteService) {
    sqliteService = new SQLiteService();
  }
  return sqliteService;
}

export default SQLiteService;
