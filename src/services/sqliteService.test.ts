/**
 * SQLite Service Test Script
 * Tests the database integration features
 * 
 * Note: This requires running on a native platform (Android/iOS) or with SQLite mock
 * 
 * Run with: npm test sqliteService.test.ts
 */

import { getSQLiteService } from './sqliteService';

async function testSQLiteService() {
  console.log('=== SQLite Service Integration Tests ===\n');
  
  const sqliteService = getSQLiteService();
  
  try {
    // Initialize database
    console.log('1. Testing database initialization...');
    await sqliteService.initialize();
    console.log('✓ Database initialized successfully\n');
    
    // Test emergency contacts
    console.log('2. Testing emergency contact operations...');
    const testContact = {
      id: 'test-contact-1',
      name: 'Test Hospital',
      phone: '123-456-7890',
      email: 'test@hospital.com',
      category: 'medical',
      location: 'Test Location',
      medicalSpecialty: 'Emergency'
    };
    
    const contactAdded = await sqliteService.addEmergencyContact(testContact);
    console.log(`✓ Contact added: ${contactAdded}`);
    
    const contacts = await sqliteService.searchEmergencyContacts('medical');
    console.log(`✓ Found ${contacts.length} medical contacts\n`);
    
    // Test medical facilities
    console.log('3. Testing medical facility operations...');
    const testFacility = {
      id: 'test-facility-1',
      name: 'Test Medical Center',
      lat: 40.7128,
      lng: -74.0060,
      type: 'hospital',
      phone: '123-456-7890',
      address: '123 Test St'
    };
    
    const facilityAdded = await sqliteService.addMedicalFacility(testFacility);
    console.log(`✓ Facility added: ${facilityAdded}`);
    
    const facilities = await sqliteService.getMedicalFacilities(40.7128, -74.0060, 50);
    console.log(`✓ Found ${facilities.length} facilities within 50km\n`);
    
    // Test shelters
    console.log('4. Testing shelter operations...');
    const testShelter = {
      id: 'test-shelter-1',
      name: 'Test Emergency Shelter',
      lat: 40.7128,
      lng: -74.0060,
      capacity: 100,
      currentOccupancy: 50,
      phone: '123-456-7890',
      address: '456 Shelter Ave'
    };
    
    const shelterAdded = await sqliteService.addShelter(testShelter);
    console.log(`✓ Shelter added: ${shelterAdded}`);
    
    const shelters = await sqliteService.getShelters(40.7128, -74.0060, 50);
    console.log(`✓ Found ${shelters.length} shelters within 50km\n`);
    
    // Test discovered peers
    console.log('5. Testing discovered peer operations...');
    const testPeer = {
      nodeId: 'test-peer-1',
      label: 'Test Device',
      lat: 40.7128,
      lng: -74.0060,
      battery: 80,
      signal: 75,
      protocol: 'ble',
      firstSeen: Date.now(),
      lastSeen: Date.now()
    };
    
    const peerAdded = await sqliteService.addDiscoveredPeer(testPeer);
    console.log(`✓ Peer added: ${peerAdded}`);
    
    const peers = await sqliteService.getDiscoveredPeers();
    console.log(`✓ Found ${peers.length} discovered peers\n`);
    
    // Test peer update
    console.log('6. Testing peer update...');
    const peerUpdated = await sqliteService.updateDiscoveredPeer('test-peer-1', {
      battery: 70,
      signal: 80
    });
    console.log(`✓ Peer updated: ${peerUpdated}\n`);
    
    // Test peer cleanup
    console.log('7. Testing old peer cleanup...');
    const cleaned = await sqliteService.cleanupOldPeers(3600000);
    console.log(`✓ Cleaned ${cleaned} old peers\n`);
    
    // Test backend sync (if backend is available)
    console.log('8. Testing backend sync...');
    const syncResult = await sqliteService.syncFromBackend('http://localhost:4000');
    console.log(`✓ Sync result: ${syncResult.success ? 'Success' : 'Failed'}`);
    console.log(`  Synced: ${syncResult.synced} items`);
    console.log(`  Errors: ${syncResult.errors.length}\n`);
    
    console.log('=== All Tests Completed ===');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  testSQLiteService()
    .then(() => {
      console.log('\n✓ All tests passed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n✗ Tests failed:', error);
      process.exit(1);
    });
}

export { testSQLiteService };
