/**
 * Emergency Contact Search Routes
 * backend/src/routes/emergency.ts
 * 
 * HTTP endpoints for searching emergency contacts in the SQLite database.
 * Provides offline search functionality for disaster scenarios.
 */

import { Router } from 'express';
import { getEmergencySearchService } from '../services/emergencySearch';

const router = Router();

/**
 * GET /api/emergency/search
 * Search emergency contacts by name, location, or category
 * Query params:
 *   - type: search type (name, location, category, availability, proximity)
 *   - query: search query string
 *   - category: category filter (for category search)
 *   - availability: availability status (default: available)
 *   - lat, lon: coordinates for proximity search
 *   - radius: search radius in km (default: 10)
 *   - limit: max results (default: 50)
 */
router.get('/search', (req, res) => {
  try {
    const {
      type = 'name',
      query,
      category,
      availability = 'available',
      lat,
      lon,
      radius = 10,
      limit = 50
    } = req.query;

    const service = getEmergencySearchService();
    let results: any[] = [];

    switch (type) {
      case 'name':
        if (!query) {
          return res.status(400).json({ error: 'query parameter required for name search' });
        }
        results = service.searchByName(query as string, Number(limit));
        service.logSearch(query as string, 'name', results.length);
        break;

      case 'location':
        if (!query) {
          return res.status(400).json({ error: 'query parameter required for location search' });
        }
        results = service.searchByLocation(query as string, Number(limit));
        service.logSearch(query as string, 'location', results.length);
        break;

      case 'category':
        const cat = category || query;
        if (!cat) {
          return res.status(400).json({ error: 'category or query parameter required for category search' });
        }
        results = service.searchByCategory(cat as string, Number(limit));
        service.logSearch(cat as string, 'category', results.length);
        break;

      case 'availability':
        results = service.searchByAvailability(availability as string, Number(limit));
        service.logSearch(availability as string, 'availability', results.length);
        break;

      case 'proximity':
        if (!lat || !lon) {
          return res.status(400).json({ error: 'lat and lon parameters required for proximity search' });
        }
        results = service.searchByProximity(
          Number(lat),
          Number(lon),
          Number(radius),
          Number(limit)
        );
        service.logSearch(`${lat},${lon}`, 'proximity', results.length);
        break;

      default:
        return res.status(400).json({ error: `Invalid search type: ${type}` });
    }

    res.json({
      success: true,
      type,
      count: results.length,
      results
    });
  } catch (error) {
    console.error('[Emergency Search] Error:', error);
    res.status(500).json({ error: 'Internal server error', message: (error as Error).message });
  }
});

/**
 * GET /api/emergency/medical
 * Search medical facilities
 * Query params:
 *   - query: search query for name or location
 *   - limit: max results (default: 50)
 */
router.get('/medical', (req, res) => {
  try {
    const { query, limit = 50 } = req.query;
    const service = getEmergencySearchService();
    
    const results = service.searchMedicalFacilities(query as string | undefined, Number(limit));
    service.logSearch(query as string || 'all', 'medical', results.length);

    res.json({
      success: true,
      count: results.length,
      results
    });
  } catch (error) {
    console.error('[Emergency Medical] Error:', error);
    res.status(500).json({ error: 'Internal server error', message: (error as Error).message });
  }
});

/**
 * GET /api/emergency/shelters
 * Search shelter locations
 * Query params:
 *   - query: search query for name or location
 *   - pets: filter by pet acceptance (true/false)
 *   - limit: max results (default: 50)
 */
router.get('/shelters', (req, res) => {
  try {
    const { query, pets, limit = 50 } = req.query;
    const service = getEmergencySearchService();
    
    const acceptsPets = pets === 'true' ? true : pets === 'false' ? false : undefined;
    const results = service.searchShelters(query as string | undefined, acceptsPets, Number(limit));
    service.logSearch(query as string || 'all', 'shelters', results.length);

    res.json({
      success: true,
      count: results.length,
      results
    });
  } catch (error) {
    console.error('[Emergency Shelters] Error:', error);
    res.status(500).json({ error: 'Internal server error', message: (error as Error).message });
  }
});

/**
 * GET /api/emergency/resources
 * Search disaster resources
 * Query params:
 *   - type: resource type filter
 *   - status: status filter (default: active)
 *   - limit: max results (default: 50)
 */
router.get('/resources', (req, res) => {
  try {
    const { type, status = 'active', limit = 50 } = req.query;
    const service = getEmergencySearchService();
    
    const results = service.searchDisasterResources(type as string | undefined, status as string, Number(limit));
    service.logSearch(type as string || 'all', 'resources', results.length);

    res.json({
      success: true,
      count: results.length,
      results
    });
  } catch (error) {
    console.error('[Emergency Resources] Error:', error);
    res.status(500).json({ error: 'Internal server error', message: (error as Error).message });
  }
});

/**
 * GET /api/emergency/categories
 * Get available emergency contact categories
 */
router.get('/categories', (req, res) => {
  try {
    const service = getEmergencySearchService();
    const db = (service as any).getDatabase();
    
    const stmt = db.prepare('SELECT DISTINCT category FROM emergency_contacts WHERE category IS NOT NULL ORDER BY category');
    const categories = stmt.all().map((row: any) => row.category);

    res.json({
      success: true,
      categories
    });
  } catch (error) {
    console.error('[Emergency Categories] Error:', error);
    res.status(500).json({ error: 'Internal server error', message: (error as Error).message });
  }
});

/**
 * GET /api/emergency/health
 * Check if emergency database is available
 */
router.get('/health', (req, res) => {
  try {
    const service = getEmergencySearchService();
    const db = (service as any).getDatabase();
    
    // Try to execute a simple query
    const stmt = db.prepare('SELECT COUNT(*) as count FROM emergency_contacts');
    const result = stmt.get() as { count: number };

    res.json({
      success: true,
      available: true,
      contactCount: result.count
    });
  } catch (error) {
    res.json({
      success: false,
      available: false,
      error: (error as Error).message
    });
  }
});

export default router;
