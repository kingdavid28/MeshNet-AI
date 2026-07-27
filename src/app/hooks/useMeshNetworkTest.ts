/**
 * React Hook for Testing Mesh Network
 * Provides in-app testing capabilities for mesh network protocols
 */

import { useState, useCallback } from 'react';
import { MeshRoutingProtocol, MeshNode } from '../../utils/meshRouting';
import { StoreAndForwardProtocol } from '../../utils/storeAndForward';
import { ContentAddressingSystem } from '../../utils/contentAddressing';
import { ServiceDiscoveryProtocol, ServiceTypes, createServiceInfo } from '../../utils/serviceDiscovery';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

export function useMeshNetworkTest() {
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const runTest = useCallback(async (name: string, test: () => Promise<void>) => {
    const startTime = Date.now();
    try {
      await test();
      const duration = Date.now() - startTime;
      const result: TestResult = { name, passed: true, duration };
      setTestResults(prev => [...prev, result]);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const result: TestResult = { 
        name, 
        passed: false, 
        duration, 
        error: error instanceof Error ? error.message : String(error) 
      };
      setTestResults(prev => [...prev, result]);
      return result;
    }
  }, []);

  const runAllTests = useCallback(async () => {
    setIsRunning(true);
    setTestResults([]);
    setProgress(0);

    const totalTests = 25;
    let completedTests = 0;

    // Mesh Routing Tests
    await runTest('Create routing protocol', async () => {
      const protocol = new MeshRoutingProtocol('node-1');
      if (!protocol) throw new Error('Failed to create protocol');
    });
    completedTests++;
    setProgress((completedTests / totalTests) * 100);

    await runTest('Add nodes to network', async () => {
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
    completedTests++;
    setProgress((completedTests / totalTests) * 100);

    await runTest('Route discovery', async () => {
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
    completedTests++;
    setProgress((completedTests / totalTests) * 100);

    // Store and Forward Tests
    await runTest('Create store and forward protocol', async () => {
      const routingProtocol = new MeshRoutingProtocol('node-1');
      const saf = new StoreAndForwardProtocol(routingProtocol);
      if (!saf) throw new Error('Failed to create SAF protocol');
    });
    completedTests++;
    setProgress((completedTests / totalTests) * 100);

    await runTest('Store message', async () => {
      const routingProtocol = new MeshRoutingProtocol('node-1');
      const saf = new StoreAndForwardProtocol(routingProtocol);
      const messageId = saf.storeMessage('node-1', 'node-2', { test: true }, 'high');
      if (!messageId) throw new Error('Message not stored');
    });
    completedTests++;
    setProgress((completedTests / totalTests) * 100);

    // Content Addressing Tests
    await runTest('Create content addressing system', async () => {
      const routingProtocol = new MeshRoutingProtocol('node-1');
      const cas = new ContentAddressingSystem('node-1', routingProtocol);
      if (!cas) throw new Error('Failed to create CAS');
    });
    completedTests++;
    setProgress((completedTests / totalTests) * 100);

    await runTest('Store content', async () => {
      const routingProtocol = new MeshRoutingProtocol('node-1');
      const cas = new ContentAddressingSystem('node-1', routingProtocol);
      const cid = await cas.storeContent({ test: 'data' }, 'test-content');
      if (!cid) throw new Error('Content not stored');
    });
    completedTests++;
    setProgress((completedTests / totalTests) * 100);

    await runTest('Retrieve content', async () => {
      const routingProtocol = new MeshRoutingProtocol('node-1');
      const cas = new ContentAddressingSystem('node-1', routingProtocol);
      const testData = { test: 'data' };
      const cid = await cas.storeContent(testData, 'test-content');
      const retrieved = await cas.getContent(cid);
      if (!retrieved) throw new Error('Content not retrieved');
    });
    completedTests++;
    setProgress((completedTests / totalTests) * 100);

    // Service Discovery Tests
    await runTest('Create service discovery protocol', async () => {
      const routingProtocol = new MeshRoutingProtocol('node-1');
      const sdp = new ServiceDiscoveryProtocol('node-1', routingProtocol);
      if (!sdp) throw new Error('Failed to create SDP');
    });
    completedTests++;
    setProgress((completedTests / totalTests) * 100);

    await runTest('Register service', async () => {
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
    completedTests++;
    setProgress((completedTests / totalTests) * 100);

    await runTest('Discover services', async () => {
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
    completedTests++;
    setProgress((completedTests / totalTests) * 100);

    // Integration Tests
    await runTest('Full mesh network setup', async () => {
      const routingProtocol = new MeshRoutingProtocol('node-1');
      const saf = new StoreAndForwardProtocol(routingProtocol);
      const cas = new ContentAddressingSystem('node-1', routingProtocol);
      const sdp = new ServiceDiscoveryProtocol('node-1', routingProtocol);
      
      if (!routingProtocol || !saf || !cas || !sdp) {
        throw new Error('Failed to create mesh network components');
      }
    });
    completedTests++;
    setProgress((completedTests / totalTests) * 100);

    await runTest('End-to-end message flow', async () => {
      const routingProtocol = new MeshRoutingProtocol('node-1');
      const saf = new StoreAndForwardProtocol(routingProtocol);
      
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
      
      const messageId = saf.storeMessage('node-1', 'node-2', { test: true }, 'high');
      if (!messageId) throw new Error('Message not stored');
    });
    completedTests++;
    setProgress((completedTests / totalTests) * 100);

    setIsRunning(false);
    setProgress(100);
  }, [runTest]);

  const clearResults = useCallback(() => {
    setTestResults([]);
    setProgress(0);
  }, []);

  const getPassedCount = useCallback(() => {
    return testResults.filter(r => r.passed).length;
  }, [testResults]);

  const getFailedCount = useCallback(() => {
    return testResults.filter(r => !r.passed).length;
  }, [testResults]);

  return {
    testResults,
    isRunning,
    progress,
    runAllTests,
    clearResults,
    getPassedCount,
    getFailedCount
  };
}
