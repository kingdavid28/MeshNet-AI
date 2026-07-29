/**
 * emergencyService.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Emergency service using SQLite for offline operation.
 * 
 * This service provides emergency-related operations using local SQLite storage
 * instead of HTTP API calls for offline functionality.
 */

import { getSQLiteService } from './sqliteService';

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
  distance?: number;
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
  distance?: number;
}

class EmergencyService {
  private readonly sqliteService = getSQLiteService();

  async searchEmergencyContacts(query: string = '', category: string = ''): Promise<EmergencyContact[]> {
    return this.sqliteService.searchEmergencyContacts(query, category);
  }

  async getMedicalFacilities(lat: number = 0, lng: number = 0, radius: number = 10): Promise<(MedicalFacility & { distance: number })[]> {
    return this.sqliteService.getMedicalFacilities(lat, lng, radius);
  }

  async getShelters(lat: number = 0, lng: number = 0, radius: number = 10): Promise<(Shelter & { distance: number })[]> {
    return this.sqliteService.getShelters(lat, lng, radius);
  }

  async sendSOS(nodeId: string): Promise<{ success: boolean; sosId: string }> {
    return this.sqliteService.sendSOS(nodeId);
  }
}

// Singleton instance
let emergencyService: EmergencyService | null = null;

export function getEmergencyService(): EmergencyService {
  if (!emergencyService) {
    emergencyService = new EmergencyService();
  }
  return emergencyService;
}

export default EmergencyService;
