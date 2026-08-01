/**
 * Database Test Component
 * Add this component to any tab to test SQLite functionality on-device
 * 
 * Usage: <DatabaseTest />
 */

import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { getSQLiteService } from "../../services/sqliteService";
import { Play, Trash2 } from "lucide-react";

export function DatabaseTest() {
  const [results, setResults] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const isNative = Capacitor.isNativePlatform();

  const addResult = (message: string, success: boolean = true) => {
    setResults(prev => [...prev, `${success ? '✓' : '✗'} ${message}`]);
  };

  const runTests = async () => {
    setRunning(true);
    setResults([]);
    
    if (!isNative) {
      addResult('SQLite is only available on native platforms (Android/iOS)', false);
      addResult('This test is running on web/Electron - skipping', false);
      setRunning(false);
      return;
    }
    
    const sqliteService = getSQLiteService();
    
    try {
      addResult('Starting database tests...');
      
      // Test 1: Initialize
      addResult('Testing database initialization...');
      await sqliteService.initialize();
      addResult('Database initialized successfully');
      
      // Add a small delay to ensure database is fully ready
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Test 2: Add emergency contact
      addResult('Testing emergency contact...');
      const contactAdded = await sqliteService.addEmergencyContact({
        id: `test-contact-${Date.now()}`,
        name: 'Test Hospital',
        phone: '123-456-7890',
        email: 'test@hospital.com',
        category: 'medical',
        location: 'Test Location',
        medicalSpecialty: 'Emergency'
      });
      addResult(`Contact added: ${contactAdded}`, contactAdded);
      
      // Test 3: Search contacts
      addResult('Testing contact search...');
      const contacts = await sqliteService.searchEmergencyContacts('medical');
      addResult(`Found ${contacts.length} medical contacts`, contacts.length > 0);
      
      // Test 4: Add medical facility
      addResult('Testing medical facility...');
      const facilityAdded = await sqliteService.addMedicalFacility({
        id: `test-facility-${Date.now()}`,
        name: 'Test Medical Center',
        lat: 40.7128,
        lng: -74.0060,
        type: 'hospital',
        phone: '123-456-7890',
        address: '123 Test St'
      });
      addResult(`Facility added: ${facilityAdded}`, facilityAdded);
      
      // Test 5: Get facilities with radius
      addResult('Testing facility radius search (50km)...');
      const facilities = await sqliteService.getMedicalFacilities(40.7128, -74.0060, 50);
      addResult(`Found ${facilities.length} facilities within 50km`, facilities.length > 0);
      
      // Test 6: Add shelter
      addResult('Testing shelter...');
      const shelterAdded = await sqliteService.addShelter({
        id: `test-shelter-${Date.now()}`,
        name: 'Test Emergency Shelter',
        lat: 40.7128,
        lng: -74.0060,
        capacity: 100,
        currentOccupancy: 50,
        phone: '123-456-7890',
        address: '456 Shelter Ave'
      });
      addResult(`Shelter added: ${shelterAdded}`, shelterAdded);
      
      // Test 7: Get shelters with radius
      addResult('Testing shelter radius search (50km)...');
      const shelters = await sqliteService.getShelters(40.7128, -74.0060, 50);
      addResult(`Found ${shelters.length} shelters within 50km`, shelters.length > 0);
      
      // Test 8: Add discovered peer
      addResult('Testing discovered peer...');
      const peerAdded = await sqliteService.addDiscoveredPeer({
        nodeId: `test-peer-${Date.now()}`,
        label: 'Test Device',
        lat: 40.7128,
        lng: -74.0060,
        battery: 80,
        signal: 75,
        protocol: 'ble',
        firstSeen: Date.now(),
        lastSeen: Date.now()
      });
      addResult(`Peer added: ${peerAdded}`, peerAdded);
      
      // Test 9: Get discovered peers
      addResult('Testing peer retrieval...');
      const peers = await sqliteService.getDiscoveredPeers();
      addResult(`Found ${peers.length} discovered peers`, peers.length > 0);
      
      // Test 10: Update peer
      addResult('Testing peer update...');
      if (peers.length > 0) {
        const peerUpdated = await sqliteService.updateDiscoveredPeer(peers[0].nodeId, {
          battery: 70,
          signal: 80
        });
        addResult(`Peer updated: ${peerUpdated}`, peerUpdated);
      } else {
        addResult('No peers to update', false);
      }
      
      // Test 11: Backend sync (will fail if no backend)
      addResult('Testing backend sync...');
      try {
        const syncResult = await sqliteService.syncFromBackend('http://localhost:4000');
        addResult(`Sync: ${syncResult.success ? 'Success' : 'Failed'} (${syncResult.synced} items)`, syncResult.success);
        if (syncResult.errors.length > 0) {
          addResult(`Sync errors: ${syncResult.errors[0]}`, false);
        }
      } catch (error) {
        addResult('Backend sync failed (expected if no backend)', false);
      }
      
      addResult('=== All tests completed ===');
      
    } catch (error) {
      addResult(`Test failed: ${error instanceof Error ? error.message : String(error)}`, false);
    } finally {
      setRunning(false);
    }
  };

  const clearResults = () => {
    setResults([]);
  };

  return (
    <div className="rounded-xl bg-[#132B5A] border border-[rgba(91,141,217,0.2)] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-[#E8EEF7] uppercase tracking-widest">
          Database Tests
        </h3>
        <div className="flex gap-2">
          <button
            onClick={clearResults}
            className="p-2 rounded-lg bg-[#132B5A] border border-[rgba(91,141,217,0.2)] hover:bg-[rgba(91,141,217,0.1)] transition-colors"
            title="Clear results"
          >
            <Trash2 size={14} className="text-[#7B9CC4]" />
          </button>
          <button
            onClick={runTests}
            disabled={running}
            className="px-3 py-2 rounded-lg bg-[#5B8DD9] hover:bg-[#4A7BC8] disabled:bg-[#132B5A] disabled:text-[#7B9CC4] text-white text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <Play size={14} className={running ? "animate-spin" : ""} />
            {running ? "Running..." : "Run Tests"}
          </button>
        </div>
      </div>
      
      <div className="bg-[#0A1F3D] rounded-lg p-3 max-h-96 overflow-y-auto">
        {results.length === 0 ? (
          <p className="text-xs text-[#7B9CC4] text-center py-4">
            Click "Run Tests" to verify database functionality
          </p>
        ) : (
          <div className="space-y-1">
            {results.map((result, index) => (
              <div
                key={index}
                className={`text-xs font-mono ${
                  result.startsWith('✓') ? 'text-[#22C55E]' : 
                  result.startsWith('✗') ? 'text-[#EF4444]' : 
                  'text-[#7B9CC4]'
                }`}
              >
                {result}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
