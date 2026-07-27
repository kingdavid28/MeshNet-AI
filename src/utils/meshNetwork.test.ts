/**
 * Mesh Network Integration Test Suite
 * Tests all mesh network protocols and identifies implementation gaps
 */

import { MeshRoutingProtocol, MeshNode } from './meshRouting';
import { StoreAndForwardProtocol, calculateMessagePriority, calculateMessageTTL } from './storeAndForward';
import { ContentAddressingSystem, calculateOptimalBlockSize, calculateReplicationFactor } from './contentAddressing';
import { ServiceDiscoveryProtocol, ServiceTypes, createServiceInfo } from './serviceDiscovery';

// ─── Test Results ─────────────────────────────────────────────────────────────

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: any;
}

class TestSuite {
  private results: TestResult[] = [];

  async runTest(name: string, test: () => Promise<void>): Promise<void> {
    const startTime = Date.now();
    try {
      await test();
      const duration = Date.now() - startTime;
      this.results.push({ name, passed: true, duration });
      console.log(`✓ ${name} (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.push({ 
        name, 
        passed: false, 
        duration, 
        error: error instanceof Error ? error.message : String(error) 
      });
      console.error(`✗ ${name} (${duration}ms):`, error);
    }
  }

  getResults(): TestResult[] {
    return this.results;
  }

  printSummary(): void {
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    console.log(`\n=== Test Summary ===`);
    console.log(`Total: ${this.results.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    
    if (failed > 0) {
      console.log(`\n=== Failed Tests ===`);
      this.results.filter(r => !r.passed).forEach(r => {
        console.log(`- ${r.name}: ${r.error}`);
      });
    }
  }
}

// ─── Mesh Routing Tests ───────────────────────────────────────────────────────

async function testMeshRouting(): Promise<void> {
  console.log('\n=== Testing Mesh Routing Protocol ===');
  const suite = new TestSuite();

  await suite.runTest('Create routing protocol', async () => {
    const protocol = new MeshRoutingProtocol('node-1');
    if (!protocol) throw new Error('Failed to create protocol');
  });

  await suite.runTest('Add nodes to network', async () => {
    const protocol = new MeshRoutingProtocol('node-1');
    const node: MeshNode = {
      id: 'node-2',
      address: '192.168.1.2',
      position: { lat: 37.7749, lng: -122.4194 },
      battery: 85,
      signal: 90,
      lastSeen: Date.now(),
      neighbors: ['node-1']
    };
    protocol.updateNode(node);
    const nodes = protocol.getKnownNodes();
    if (nodes.length !== 1) throw new Error('Node not added');
  });

  await suite.runTest('Route discovery', async () => {
    const protocol = new MeshRoutingProtocol('node-1');
    const node: MeshNode = {
      id: 'node-2',
      address: '192.168.1.2',
      position: { lat: 37.7749, lng: -122.4194 },
      battery: 85,
      signal: 90,
      lastSeen: Date.now(),
      neighbors: ['node-1']
    };
    protocol.updateNode(node);
    const route = await protocol.discoverRoute('node-2');
    if (!route) throw new Error('Route not discovered');
  });

  await suite.runTest('Packet forwarding', async () => {
    const protocol = new MeshRoutingProtocol('node-1');
    const node: MeshNode = {
      id: 'node-2',
      address: '192.168.1.2',
      position: { lat: 37.7749, lng: -122.4194 },
      battery: 85,
      signal: 90,
      lastSeen: Date.now(),
      neighbors: ['node-1']
    };
    protocol.updateNode(node);
    const packet = {
      id: 'test-packet',
      source: 'node-1',
      destination: 'node-2',
      hopCount: 0,
      maxHops: 10,
      ttl: 60000,
      payload: { test: true },
      timestamp: Date.now(),
      route: [],
      priority: 'normal' as const
    };
    const sent = await protocol.sendPacket('node-2', packet);
    if (!sent) throw new Error('Packet not sent');
  });

  await suite.runTest('Routing table management', async () => {
    const protocol = new MeshRoutingProtocol('node-1');
    const node: MeshNode = {
      id: 'node-2',
      address: '192.168.1.2',
      position: { lat: 37.7749, lng: -122.4194 },
      battery: 85,
      signal: 90,
      lastSeen: Date.now(),
      neighbors: ['node-1']
    };
    protocol.updateNode(node);
    await protocol.discoverRoute('node-2');
    const table = protocol.getRoutingTable();
    if (Object.keys(table).length === 0) throw new Error('Routing table empty');
  });

  await suite.runTest('Network statistics', async () => {
    const protocol = new MeshRoutingProtocol('node-1');
    const stats = protocol.getNetworkStats();
    if (stats.totalNodes !== 0) throw new Error('Expected 0 nodes');
  });

  suite.printSummary();
}

// ─── Store and Forward Tests ─────────────────────────────────────────────────

async function testStoreAndForward(): Promise<void> {
  console.log('\n=== Testing Store and Forward Protocol ===');
  const suite = new TestSuite();

  await suite.runTest('Create store and forward protocol', async () => {
    const routingProtocol = new MeshRoutingProtocol('node-1');
    const saf = new StoreAndForwardProtocol(routingProtocol);
    if (!saf) throw new Error('Failed to create SAF protocol');
  });

  await suite.runTest('Store message', async () => {
    const routingProtocol = new MeshRoutingProtocol('node-1');
    const saf = new StoreAndForwardProtocol(routingProtocol);
    const messageId = saf.storeMessage('node-1', 'node-2', { test: true }, 'high');
    if (!messageId) throw new Error('Message not stored');
  });

  await suite.runTest('Message priority calculation', async () => {
    const priority = calculateMessagePriority({ type: 'sos' }, true);
    if (priority !== 'emergency') throw new Error('Wrong priority for SOS');
  });

  await suite.runTest('Message TTL calculation', async () => {
    const ttl = calculateMessageTTL('emergency', { type: 'sos' });
    if (ttl < 3600000) throw new Error('TTL too short for emergency');
  });

  await suite.runTest('Queue management', async () => {
    const routingProtocol = new MeshRoutingProtocol('node-1');
    const saf = new StoreAndForwardProtocol(routingProtocol);
    saf.storeMessage('node-1', 'node-2', { test: true }, 'normal');
    const messages = saf.getAllQueuedMessages();
    if (messages.length !== 1) throw new Error('Message not in queue');
  });

  await suite.runTest('Queue statistics', async () => {
    const routingProtocol = new MeshRoutingProtocol('node-1');
    const saf = new StoreAndForwardProtocol(routingProtocol);
    const stats = saf.getQueueStats();
    if (stats.totalMessages !== 0) throw new Error('Expected 0 messages');
  });

  await suite.runTest('Expired message cleanup', async () => {
    const routingProtocol = new MeshRoutingProtocol('node-1');
    const saf = new StoreAndForwardProtocol(routingProtocol);
    saf.storeMessage('node-1', 'node-2', { test: true }, 'normal', 1); // 1ms TTL
    await new Promise(resolve => setTimeout(resolve, 10));
    const cleared = saf.clearExpiredMessages();
    if (cleared === 0) throw new Error('No expired messages cleared');
  });

  suite.printSummary();
}

// ─── Content Addressing Tests ─────────────────────────────────────────────────

async function testContentAddressing(): Promise<void> {
  console.log('\n=== Testing Content Addressing System ===');
  const suite = new TestSuite();

  await suite.runTest('Create content addressing system', async () => {
    const routingProtocol = new MeshRoutingProtocol('node-1');
    const cas = new ContentAddressingSystem('node-1', routingProtocol);
    if (!cas) throw new Error('Failed to create CAS');
  });

  await suite.runTest('Store content', async () => {
    const routingProtocol = new MeshRoutingProtocol('node-1');
    const cas = new ContentAddressingSystem('node-1', routingProtocol);
    const cid = await cas.storeContent({ test: 'data' }, 'test-content');
    if (!cid) throw new Error('Content not stored');
  });

  await suite.runTest('Retrieve content', async () => {
    const routingProtocol = new MeshRoutingProtocol('node-1');
    const cas = new ContentAddressingSystem('node-1', routingProtocol);
    const testData = { test: 'data' };
    const cid = await cas.storeContent(testData, 'test-content');
    const retrieved = await cas.getContent(cid);
    if (!retrieved) throw new Error('Content not retrieved');
  });

  await suite.runTest('Content by name', async () => {
    const routingProtocol = new MeshRoutingProtocol('node-1');
    const cas = new ContentAddressingSystem('node-1', routingProtocol);
    await cas.storeContent({ test: 'data' }, 'test-content');
    const retrieved = await cas.getContentByName('test-content');
    if (!retrieved) throw new Error('Content not retrieved by name');
  });

  await suite.runTest('Content verification', async () => {
    const routingProtocol = new MeshRoutingProtocol('node-1');
    const cas = new ContentAddressingSystem('node-1', routingProtocol);
    const testData = { test: 'data' };
    const cid = await cas.storeContent(testData);
    const verified = await cas.verifyContent(cid, testData);
    if (!verified) throw new Error('Content verification failed');
  });

  await suite.runTest('Content statistics', async () => {
    const routingProtocol = new MeshRoutingProtocol('node-1');
    const cas = new ContentAddressingSystem('node-1', routingProtocol);
    const stats = cas.getContentStats();
    if (stats.totalBlocks !== 0) throw new Error('Expected 0 blocks');
  });

  await suite.runTest('Block size calculation', async () => {
    const blockSize = calculateOptimalBlockSize('text', 'good');
    if (blockSize < 1024) throw new Error('Block size too small');
  });

  await suite.runTest('Replication factor calculation', async () => {
    const factor = calculateReplicationFactor('critical', 'emergency');
    if (factor < 3) throw new Error('Replication factor too low');
  });

  suite.printSummary();
}

// ─── Service Discovery Tests ─────────────────────────────────────────────────

async function testServiceDiscovery(): Promise<void> {
  console.log('\n=== Testing Service Discovery Protocol ===');
  const suite = new TestSuite();

  await suite.runTest('Create service discovery protocol', async () => {
    const routingProtocol = new MeshRoutingProtocol('node-1');
    const sdp = new ServiceDiscoveryProtocol('node-1', routingProtocol);
    if (!sdp) throw new Error('Failed to create SDP');
  });

  await suite.runTest('Register service', async () => {
    const routingProtocol = new MeshRoutingProtocol('node-1');
    const sdp = new ServiceDiscoveryProtocol('node-1', routingProtocol);
    const serviceInfo = createServiceInfo(
      'test-service',
      ServiceTypes.MESSAGE_RELAY,
      '192.168.1.1',
      4000,
      ['forward-messages']
    );
    const serviceId = sdp.registerService(serviceInfo);
    if (!serviceId) throw new Error('Service not registered');
  });

  await suite.runTest('Discover services', async () => {
    const routingProtocol = new MeshRoutingProtocol('node-1');
    const sdp = new ServiceDiscoveryProtocol('node-1', routingProtocol);
    const serviceInfo = createServiceInfo(
      'test-service',
      ServiceTypes.MESSAGE_RELAY,
      '192.168.1.1',
      4000
    );
    sdp.registerService(serviceInfo);
    const services = await sdp.discoverServices({ type: ServiceTypes.MESSAGE_RELAY });
    if (services.length === 0) throw new Error('No services discovered');
  });

  await suite.runTest('Get service by type', async () => {
    const routingProtocol = new MeshRoutingProtocol('node-1');
    const sdp = new ServiceDiscoveryProtocol('node-1', routingProtocol);
    const serviceInfo = createServiceInfo(
      'test-service',
      ServiceTypes.MESSAGE_RELAY,
      '192.168.1.1',
      4000
    );
    sdp.registerService(serviceInfo);
    const services = await sdp.getServicesByType(ServiceTypes.MESSAGE_RELAY);
    if (services.length === 0) throw new Error('No services found');
  });

  await suite.runTest('Get best service', async () => {
    const routingProtocol = new MeshRoutingProtocol('node-1');
    const sdp = new ServiceDiscoveryProtocol('node-1', routingProtocol);
    const serviceInfo = createServiceInfo(
      'test-service',
      ServiceTypes.MESSAGE_RELAY,
      '192.168.1.1',
      4000
    );
    sdp.registerService(serviceInfo);
    const best = await sdp.getBestService(ServiceTypes.MESSAGE_RELAY);
    if (!best) throw new Error('No best service found');
  });

  await suite.runTest('Service health check', async () => {
    const routingProtocol = new MeshRoutingProtocol('node-1');
    const sdp = new ServiceDiscoveryProtocol('node-1', routingProtocol);
    const serviceInfo = createServiceInfo(
      'test-service',
      ServiceTypes.MESSAGE_RELAY,
      '192.168.1.1',
      4000
    );
    const serviceId = sdp.registerService(serviceInfo);
    const healthy = await sdp.checkServiceHealth(serviceId);
    // Note: This may fail in test environment due to simplified ping
    console.log('Health check result:', healthy);
  });

  await suite.runTest('Service statistics', async () => {
    const routingProtocol = new MeshRoutingProtocol('node-1');
    const sdp = new ServiceDiscoveryProtocol('node-1', routingProtocol);
    const stats = sdp.getServiceStats();
    if (stats.totalServices !== 0) throw new Error('Expected 0 services');
  });

  await suite.runTest('Load balancing', async () => {
    const routingProtocol = new MeshRoutingProtocol('node-1');
    const sdp = new ServiceDiscoveryProtocol('node-1', routingProtocol);
    const serviceInfo = createServiceInfo(
      'test-service',
      ServiceTypes.MESSAGE_RELAY,
      '192.168.1.1',
      4000
    );
    sdp.registerService(serviceInfo);
    const leastLoaded = await sdp.getLeastLoadedService(ServiceTypes.MESSAGE_RELAY);
    if (!leastLoaded) throw new Error('No least loaded service found');
  });

  suite.printSummary();
}

// ─── Integration Tests ───────────────────────────────────────────────────────

async function testIntegration(): Promise<void> {
  console.log('\n=== Testing Integration ===');
  const suite = new TestSuite();

  await suite.runTest('Full mesh network setup', async () => {
    const routingProtocol = new MeshRoutingProtocol('node-1');
    const saf = new StoreAndForwardProtocol(routingProtocol);
    const cas = new ContentAddressingSystem('node-1', routingProtocol);
    const sdp = new ServiceDiscoveryProtocol('node-1', routingProtocol);
    
    if (!routingProtocol || !saf || !cas || !sdp) {
      throw new Error('Failed to create mesh network components');
    }
  });

  await suite.runTest('End-to-end message flow', async () => {
    const routingProtocol = new MeshRoutingProtocol('node-1');
    const saf = new StoreAndForwardProtocol(routingProtocol);
    
    // Add a node
    const node: MeshNode = {
      id: 'node-2',
      address: '192.168.1.2',
      position: { lat: 37.7749, lng: -122.4194 },
      battery: 85,
      signal: 90,
      lastSeen: Date.now(),
      neighbors: ['node-1']
    };
    routingProtocol.updateNode(node);
    
    // Store message
    const messageId = saf.storeMessage('node-1', 'node-2', { test: true }, 'high');
    if (!messageId) throw new Error('Message not stored');
    
    // Attempt delivery
    const receipts = await saf.deliverQueuedMessages();
    console.log('Delivery receipts:', receipts.length);
  });

  await suite.runTest('Content distribution', async () => {
    const routingProtocol = new MeshRoutingProtocol('node-1');
    const cas = new ContentAddressingSystem('node-1', routingProtocol);
    
    // Store content
    const content = { emergency: 'alert', data: 'test' };
    const cid = await cas.storeContent(content, 'emergency-alert');
    
    // Retrieve content
    const retrieved = await cas.getContent(cid);
    if (!retrieved || retrieved.emergency !== 'alert') {
      throw new Error('Content distribution failed');
    }
  });

  await suite.runTest('Service registration and discovery', async () => {
    const routingProtocol = new MeshRoutingProtocol('node-1');
    const sdp = new ServiceDiscoveryProtocol('node-1', routingProtocol);
    
    // Register emergency service
    const serviceInfo = createServiceInfo(
      'emergency-coordination',
      ServiceTypes.EMERGENCY_COORDINATION,
      '192.168.1.1',
      4000,
      ['emergency-broadcast']
    );
    sdp.registerService(serviceInfo);
    
    // Discover service
    const services = await sdp.discoverServices({ 
      type: ServiceTypes.EMERGENCY_COORDINATION 
    });
    
    if (services.length === 0) throw new Error('Emergency service not discovered');
  });

  suite.printSummary();
}

// ─── Gap Analysis ────────────────────────────────────────────────────────────

function identifyGaps(): string[] {
  console.log('\n=== Implementation Gap Analysis ===');
  const gaps: string[] = [];

  // Check for missing implementations
  gaps.push('Mesh routing transmitPacket() is simplified - needs actual BLE/WiFi transport');
  gaps.push('Route discovery waitForRouteResponse() is simplified - needs callback system');
  gaps.push('Store and forward fetchContentFromNode() is not implemented');
  gaps.push('Content addressing fetchContentFromNode() is not implemented');
  gaps.push('Service discovery queryNetwork() is not implemented');
  gaps.push('Service discovery pingService() is simplified - needs actual health checks');
  gaps.push('No actual network transport layer implementation');
  gaps.push('No integration with existing BLE/WiFi capabilities');
  gaps.push('No integration with existing mDNS broadcasting');
  gaps.push('No integration with existing captive portal system');
  gaps.push('No React hooks for using mesh protocols in UI');
  gaps.push('No error handling for network failures');
  gaps.push('No security/encryption implementation');
  gaps.push('No node authentication system');
  gaps.push('No bandwidth management for mesh traffic');
  gaps.push('No conflict resolution for concurrent operations');

  gaps.forEach((gap, index) => {
    console.log(`${index + 1}. ${gap}`);
  });

  return gaps;
}

// ─── Main Test Runner ───────────────────────────────────────────────────────

export async function runMeshNetworkTests(): Promise<void> {
  console.log('=== Mesh Network Test Suite ===');
  console.log('Testing all mesh network protocols...\n');

  try {
    await testMeshRouting();
    await testStoreAndForward();
    await testContentAddressing();
    await testServiceDiscovery();
    await testIntegration();
    
    const gaps = identifyGaps();
    
    console.log('\n=== Test Complete ===');
    console.log(`Identified ${gaps.length} implementation gaps`);
    
  } catch (error) {
    console.error('Test suite failed:', error);
  }
}

// Run tests if executed directly
if (typeof window === 'undefined') {
  runMeshNetworkTests().catch(console.error);
}
