/**
 * Emergency Contact Search Service
 * backend/src/services/emergencySearch.ts
 * 
 * Provides search functionality for emergency contacts stored in SQLite database.
 * Uses better-sqlite3 for efficient offline queries.
 */

import Database from 'better-sqlite3';
import path from 'node:path';

interface EmergencyContact {
  id: number;
  name: string;
  phone: string;
  email?: string;
  organization?: string;
  role?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  category?: string;
  availability?: string;
  notes?: string;
  last_updated?: string;
}

interface MedicalFacility {
  id: number;
  name: string;
  type: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  beds_total?: number;
  beds_available?: number;
  contact_phone?: string;
  emergency_services: number;
  last_updated?: string;
}

interface ShelterLocation {
  id: number;
  name: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  capacity: number;
  current_occupancy: number;
  facilities?: string;
  contact_phone?: string;
  accepts_pets: number;
  last_updated?: string;
}

interface DisasterResource {
  id: number;
  name: string;
  type: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  capacity: number;
  current_occupancy: number;
  contact_phone?: string;
  status: string;
  last_updated?: string;
}

class EmergencySearchService {
  private db: Database.Database | null = null;
  private readonly dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(__dirname, '../../emergency_contacts.db');
  }

  private getDatabase(): Database.Database {
    if (!this.db) {
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
    }
    return this.db;
  }

  /**
   * Search emergency contacts by name (partial match)
   */
  searchByName(query: string, limit: number = 50): EmergencyContact[] {
    const db = this.getDatabase();
    const stmt = db.prepare(`
      SELECT id, name, phone, email, organization, role, location,
             latitude, longitude, category, availability, notes, last_updated
      FROM emergency_contacts
      WHERE name LIKE ?
      ORDER BY name
      LIMIT ?
    `);
    return stmt.all(`%${query}%`, limit) as EmergencyContact[];
  }

  /**
   * Search emergency contacts by location (partial match)
   */
  searchByLocation(query: string, limit: number = 50): EmergencyContact[] {
    const db = this.getDatabase();
    const stmt = db.prepare(`
      SELECT id, name, phone, email, organization, role, location,
             latitude, longitude, category, availability, notes, last_updated
      FROM emergency_contacts
      WHERE location LIKE ?
      ORDER BY location
      LIMIT ?
    `);
    return stmt.all(`%${query}%`, limit) as EmergencyContact[];
  }

  /**
   * Search emergency contacts by category
   */
  searchByCategory(category: string, limit: number = 50): EmergencyContact[] {
    const db = this.getDatabase();
    const stmt = db.prepare(`
      SELECT id, name, phone, email, organization, role, location,
             latitude, longitude, category, availability, notes, last_updated
      FROM emergency_contacts
      WHERE category = ?
      ORDER BY name
      LIMIT ?
    `);
    return stmt.all(category, limit) as EmergencyContact[];
  }

  /**
   * Search emergency contacts by availability status
   */
  searchByAvailability(availability: string = 'available', limit: number = 50): EmergencyContact[] {
    const db = this.getDatabase();
    const stmt = db.prepare(`
      SELECT id, name, phone, email, organization, role, location,
             latitude, longitude, category, availability, notes, last_updated
      FROM emergency_contacts
      WHERE availability = ?
      ORDER BY name
      LIMIT ?
    `);
    return stmt.all(availability, limit) as EmergencyContact[];
  }

  /**
   * Search emergency contacts within geographic radius
   */
  searchByProximity(lat: number, lon: number, radiusKm: number, limit: number = 50): (EmergencyContact & { distance_km: number })[] {
    const db = this.getDatabase();
    const stmt = db.prepare(`
      SELECT id, name, phone, email, organization, role, location,
             latitude, longitude, category, availability, notes, last_updated
      FROM emergency_contacts
      WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    `);

    const contacts = stmt.all() as EmergencyContact[];
    const results: (EmergencyContact & { distance_km: number })[] = [];

    for (const contact of contacts) {
      const distance = this.haversineDistance(lat, lon, contact.latitude!, contact.longitude!);
      if (distance <= radiusKm) {
        results.push({ ...contact, distance_km: Math.round(distance * 100) / 100 });
      }
    }

    results.sort((a, b) => a.distance_km - b.distance_km);
    return results.slice(0, limit);
  }

  /**
   * Search medical facilities
   */
  searchMedicalFacilities(query?: string, limit: number = 50): MedicalFacility[] {
    const db = this.getDatabase();
    let stmt: Database.Statement;

    if (query) {
      stmt = db.prepare(`
        SELECT id, name, type, location, latitude, longitude, beds_total,
               beds_available, contact_phone, emergency_services, last_updated
        FROM medical_facilities
        WHERE name LIKE ? OR location LIKE ?
        ORDER BY name
        LIMIT ?
      `);
      return stmt.all(`%${query}%`, `%${query}%`, limit) as MedicalFacility[];
    } else {
      stmt = db.prepare(`
        SELECT id, name, type, location, latitude, longitude, beds_total,
               beds_available, contact_phone, emergency_services, last_updated
        FROM medical_facilities
        ORDER BY name
        LIMIT ?
      `);
      return stmt.all(limit) as MedicalFacility[];
    }
  }

  /**
   * Search shelter locations
   */
  searchShelters(query?: string, acceptsPets?: boolean, limit: number = 50): ShelterLocation[] {
    const db = this.getDatabase();
    let stmt: Database.Statement;

    if (query && acceptsPets !== undefined) {
      stmt = db.prepare(`
        SELECT id, name, location, latitude, longitude, capacity,
               current_occupancy, facilities, contact_phone, accepts_pets, last_updated
        FROM shelter_locations
        WHERE (name LIKE ? OR location LIKE ?) AND accepts_pets = ?
        ORDER BY capacity DESC
        LIMIT ?
      `);
      return stmt.all(`%${query}%`, `%${query}%`, acceptsPets ? 1 : 0, limit) as ShelterLocation[];
    } else if (query) {
      stmt = db.prepare(`
        SELECT id, name, location, latitude, longitude, capacity,
               current_occupancy, facilities, contact_phone, accepts_pets, last_updated
        FROM shelter_locations
        WHERE name LIKE ? OR location LIKE ?
        ORDER BY capacity DESC
        LIMIT ?
      `);
      return stmt.all(`%${query}%`, `%${query}%`, limit) as ShelterLocation[];
    } else if (acceptsPets !== undefined) {
      stmt = db.prepare(`
        SELECT id, name, location, latitude, longitude, capacity,
               current_occupancy, facilities, contact_phone, accepts_pets, last_updated
        FROM shelter_locations
        WHERE accepts_pets = ?
        ORDER BY capacity DESC
        LIMIT ?
      `);
      return stmt.all(acceptsPets ? 1 : 0, limit) as ShelterLocation[];
    } else {
      stmt = db.prepare(`
        SELECT id, name, location, latitude, longitude, capacity,
               current_occupancy, facilities, contact_phone, accepts_pets, last_updated
        FROM shelter_locations
        ORDER BY capacity DESC
        LIMIT ?
      `);
      return stmt.all(limit) as ShelterLocation[];
    }
  }

  /**
   * Search disaster resources
   */
  searchDisasterResources(resourceType?: string, status: string = 'active', limit: number = 50): DisasterResource[] {
    const db = this.getDatabase();
    let stmt: Database.Statement;

    if (resourceType) {
      stmt = db.prepare(`
        SELECT id, name, type, location, latitude, longitude, capacity,
               current_occupancy, contact_phone, status, last_updated
        FROM disaster_resources
        WHERE type = ? AND status = ?
        ORDER BY name
        LIMIT ?
      `);
      return stmt.all(resourceType, status, limit) as DisasterResource[];
    } else {
      stmt = db.prepare(`
        SELECT id, name, type, location, latitude, longitude, capacity,
               current_occupancy, contact_phone, status, last_updated
        FROM disaster_resources
        WHERE status = ?
        ORDER BY name
        LIMIT ?
      `);
      return stmt.all(status, limit) as DisasterResource[];
    }
  }

  /**
   * Calculate Haversine distance between two coordinates
   */
  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLon / 2) ** 2;
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Log search to history
   */
  logSearch(searchQuery: string, searchType: string, resultsCount: number): void {
    const db = this.getDatabase();
    const stmt = db.prepare(`
      INSERT INTO search_history (search_query, search_type, results_count)
      VALUES (?, ?, ?)
    `);
    stmt.run(searchQuery, searchType, resultsCount);
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Singleton instance
let emergencySearchService: EmergencySearchService | null = null;

export function getEmergencySearchService(dbPath?: string): EmergencySearchService {
  if (!emergencySearchService) {
    emergencySearchService = new EmergencySearchService(dbPath);
  }
  return emergencySearchService;
}
