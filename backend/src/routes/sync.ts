/**
 * Sync Routes
 * backend/src/routes/sync.ts
 * 
 * HTTP endpoints for syncing emergency data with mobile clients.
 * Provides endpoints for contacts, facilities, and shelters that match
 * the frontend's sync expectations.
 */

import { Router } from 'express';
import { getEmergencySearchService } from '../services/emergencySearch';

const router = Router();

/**
 * GET /api/contacts
 * Get all emergency contacts for sync
 * Query params:
 *   - limit: max results (default: 100)
 */
router.get('/contacts', (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const service = getEmergencySearchService();
    const db = (service as any).getDatabase();
    
    const stmt = db.prepare('SELECT * FROM emergency_contacts LIMIT ?');
    const contacts = stmt.all(Number(limit));

    res.json(contacts);
  } catch (error) {
    console.error('[Sync Contacts] Error:', error);
    res.status(500).json({ error: 'Internal server error', message: (error as Error).message });
  }
});

/**
 * GET /api/facilities
 * Get all medical facilities for sync
 * Query params:
 *   - limit: max results (default: 100)
 */
router.get('/facilities', (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const service = getEmergencySearchService();
    const db = (service as any).getDatabase();
    
    const stmt = db.prepare('SELECT * FROM emergency_contacts WHERE category LIKE "%medical%" OR category LIKE "%hospital%" OR category LIKE "%clinic%" LIMIT ?');
    const facilities = stmt.all(Number(limit));

    res.json(facilities);
  } catch (error) {
    console.error('[Sync Facilities] Error:', error);
    res.status(500).json({ error: 'Internal server error', message: (error as Error).message });
  }
});

/**
 * GET /api/shelters
 * Get all shelters for sync
 * Query params:
 *   - limit: max results (default: 100)
 */
router.get('/shelters', (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const service = getEmergencySearchService();
    const db = (service as any).getDatabase();
    
    const stmt = db.prepare('SELECT * FROM emergency_contacts WHERE category LIKE "%shelter%" OR category LIKE "%evacuation%" LIMIT ?');
    const shelters = stmt.all(Number(limit));

    res.json(shelters);
  } catch (error) {
    console.error('[Sync Shelters] Error:', error);
    res.status(500).json({ error: 'Internal server error', message: (error as Error).message });
  }
});

export default router;
