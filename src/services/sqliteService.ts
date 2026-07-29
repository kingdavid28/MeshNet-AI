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

interface MeshNode {
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

interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  email: string;
  category: string;
  location: string;
  medicalSpecialty?: string;
}

interface MedicalFacility {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: string;
  phone: string;
  address: string;
}

interface Shelter {
  id: string;
  name: string;
  lat: number;
  lng: number;
  capacity: number;
  currentOccupancy: number;
  phone: string;
  address: string;
}

class SQLiteService {
  private sqlite: SQLiteConnection;
  private db: SQLiteDBConnection | null = null;
  private initialized: boolean = false;
  private nodes: Map<string, MeshNode> = new Map();

  constructor() {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
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
      // Create database connection
      this.db = await this.sqlite.createConnection(
        'meshnet-local',
        false,
        'no-encryption',
        1,
        false
      );

      // Open database
      await this.db.open();

      // Create tables
      await this.createTables();

      // Seed sample data
      await this.seedSampleData();

      this.initialized = true;
      console.log('[SQLiteService] Database initialized successfully');
    } catch (error) {
      console.error('[SQLiteService] Failed to initialize database:', error);
      // Don't throw - allow app to continue without SQLite
      this.initialized = true;
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

    await this.db.execute(createEmergencyContacts);
    await this.db.execute(createMedicalFacilities);
    await this.db.execute(createShelters);
  }

  private async seedSampleData(): Promise<void> {
    if (!this.db) return;

    // Check if data already exists
    const contactsResult = await this.db.query('SELECT COUNT(*) as count FROM emergency_contacts');
    if (contactsResult.values && contactsResult.values[0].count > 0) {
      return; // Data already seeded
    }

    // Seed emergency contacts
    await this.db.execute(`
      INSERT INTO emergency_contacts (id, name, phone, email, category, location, medical_specialty) VALUES
      ('1', 'Dr. John Smith', '+1234567890', 'john@hospital.com', 'medical', 'City Hospital', 'Emergency Medicine'),
      ('2', 'Fire Department', '+1234567891', 'fire@city.gov', 'fire', 'Central Station', NULL),
      ('3', 'Police Station', '+1234567892', 'police@city.gov', 'police', 'Downtown', NULL);
    `);

    // Seed medical facilities
    await this.db.execute(`
      INSERT INTO medical_facilities (id, name, lat, lng, type, phone, address) VALUES
      ('1', 'City General Hospital', 40.7128, -74.0060, 'hospital', '+1234567890', '123 Main St'),
      ('2', 'Urgent Care Center', 40.7138, -74.0070, 'clinic', '+1234567891', '456 Oak Ave');
    `);

    // Seed shelters
    await this.db.execute(`
      INSERT INTO shelters (id, name, lat, lng, capacity, current_occupancy, phone, address) VALUES
      ('1', 'Emergency Shelter A', 40.7148, -74.0080, 100, 45, '+1234567892', '789 Pine Rd'),
      ('2', 'Community Center', 40.7158, -74.0090, 50, 20, '+1234567893', '321 Elm St');
    `);

    console.log('[SQLiteService] Sample data seeded');
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
  async getMedicalFacilities(lat: number = 0, lng: number = 0, radius: number = 10): Promise<(MedicalFacility & { distance: number })[]> {
    if (!this.db) return [];

    const facilities = await this.db.query('SELECT * FROM medical_facilities');
    
    return (facilities.values || []).map((fac: any) => {
      const distance = Math.sqrt(Math.pow(fac.lat - lat, 2) + Math.pow(fac.lng - lng, 2));
      return { ...fac, distance };
    }).filter((fac: any) => fac.distance <= radius);
  }

  // Shelters Operations
  async getShelters(lat: number = 0, lng: number = 0, radius: number = 10): Promise<(Shelter & { distance: number })[]> {
    if (!this.db) return [];

    const shelters = await this.db.query('SELECT * FROM shelters');
    
    return (shelters.values || []).map((shelter: any) => {
      const distance = Math.sqrt(Math.pow(shelter.lat - lat, 2) + Math.pow(shelter.lng - lng, 2));
      return { ...shelter, distance };
    }).filter((shelter: any) => shelter.distance <= radius);
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
