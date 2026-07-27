/**
 * React Hook for Mesh Network
 * Provides access to mesh network protocols for React components
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { MeshRoutingProtocol, MeshNode } from '../../utils/meshRouting';
import { StoreAndForwardProtocol } from '../../utils/storeAndForward';
import { ContentAddressingSystem } from '../../utils/contentAddressing';
import { ServiceDiscoveryProtocol, ServiceTypes } from '../../utils/serviceDiscovery';
import { NetworkTransportLayer, integrateTransportWithRouting } from '../../utils/networkTransport';

export function useMeshNetwork(nodeId: string = 'node-1') {
  const [isInitialized, setIsInitialized] = useState(false);
  const [nodes, setNodes] = useState<MeshNode[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Protocol instances
  const routingProtocolRef = useRef<MeshRoutingProtocol | null>(null);
  const storeAndForwardRef = useRef<StoreAndForwardProtocol | null>(null);
  const contentAddressingRef = useRef<ContentAddressingSystem | null>(null);
  const serviceDiscoveryRef = useRef<ServiceDiscoveryProtocol | null>(null);
  const transportLayerRef = useRef<NetworkTransportLayer | null>(null);

  // Initialize mesh network
  useEffect(() => {
    try {
      // Create routing protocol
      const routingProtocol = new MeshRoutingProtocol(nodeId);
      routingProtocolRef.current = routingProtocol;

      // Create store and forward protocol
      const storeAndForward = new StoreAndForwardProtocol(routingProtocol);
      storeAndForwardRef.current = storeAndForward;

      // Create content addressing system
      const contentAddressing = new ContentAddressingSystem(nodeId, routingProtocol);
      contentAddressingRef.current = contentAddressing;

      // Create service discovery protocol
      const serviceDiscovery = new ServiceDiscoveryProtocol(nodeId, routingProtocol);
      serviceDiscoveryRef.current = serviceDiscovery;

      // Create network transport layer
      const transportLayer = new NetworkTransportLayer(nodeId, routingProtocol);
      transportLayerRef.current = transportLayer;

      // Integrate transport with routing
      integrateTransportWithRouting(routingProtocol, transportLayer);

      // Start transport layer listening
      transportLayer.startListening();

      setIsInitialized(true);
      console.log('Mesh network initialized');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize mesh network');
      console.error('Mesh network initialization failed:', err);
    }
  }, [nodeId]);

  // Update nodes periodically
  useEffect(() => {
    if (!routingProtocolRef.current) return;

    const interval = setInterval(() => {
      const knownNodes = routingProtocolRef.current?.getKnownNodes() || [];
      setNodes(knownNodes);
      setIsConnected(knownNodes.length > 0);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Send message through mesh network
  const sendMessage = useCallback(async (
    destination: string,
    message: any,
    priority: 'emergency' | 'high' | 'normal' | 'low' = 'normal'
  ): Promise<string | null> => {
    if (!storeAndForwardRef.current) {
      setError('Store and forward protocol not initialized');
      return null;
    }

    try {
      const messageId = storeAndForwardRef.current.storeMessage(
        nodeId,
        destination,
        message,
        priority
      );

      // Attempt immediate delivery
      await storeAndForwardRef.current.deliverQueuedMessages();

      return messageId;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      return null;
    }
  }, [nodeId]);

  // Store content in mesh network
  const storeContent = useCallback(async (
    data: any,
    name: string = '',
    metadata: any = {}
  ): Promise<string | null> => {
    if (!contentAddressingRef.current) {
      setError('Content addressing system not initialized');
      return null;
    }

    try {
      const cid = await contentAddressingRef.current.storeContent(data, name, metadata);
      return cid;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to store content');
      return null;
    }
  }, []);

  // Retrieve content from mesh network
  const getContent = useCallback(async (cid: string): Promise<any | null> => {
    if (!contentAddressingRef.current) {
      setError('Content addressing system not initialized');
      return null;
    }

    try {
      const content = await contentAddressingRef.current.getContent(cid);
      return content;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve content');
      return null;
    }
  }, []);

  // Register service
  const registerService = useCallback((
    name: string,
    type: string,
    address: string,
    port: number,
    capabilities: string[] = []
  ): string | null => {
    if (!serviceDiscoveryRef.current) {
      setError('Service discovery protocol not initialized');
      return null;
    }

    try {
      const serviceInfo = {
        name,
        type,
        version: '1.0.0',
        address,
        port,
        metadata: {},
        ttl: 300000,
        load: 0,
        capabilities
      };

      const serviceId = serviceDiscoveryRef.current.registerService(serviceInfo);
      return serviceId;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register service');
      return null;
    }
  }, []);

  // Discover services
  const discoverServices = useCallback(async (type?: string): Promise<any[]> => {
    if (!serviceDiscoveryRef.current) {
      setError('Service discovery protocol not initialized');
      return [];
    }

    try {
      const query = type ? { type } : {};
      const services = await serviceDiscoveryRef.current.discoverServices(query);
      return services;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to discover services');
      return [];
    }
  }, []);

  // Get network statistics
  const getNetworkStats = useCallback(() => {
    if (!routingProtocolRef.current) return null;

    return {
      routing: routingProtocolRef.current.getNetworkStats(),
      transport: transportLayerRef.current?.getTransportStats() || [],
      content: contentAddressingRef.current?.getContentStats() || null,
      services: serviceDiscoveryRef.current?.getServiceStats() || null,
      messages: storeAndForwardRef.current?.getQueueStats() || null
    };
  }, []);

  // Process message queue
  const processMessageQueue = useCallback(async (): Promise<void> => {
    if (!storeAndForwardRef.current) return;

    try {
      await storeAndForwardRef.current.deliverQueuedMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process message queue');
    }
  }, []);

  // Cleanup expired content
  const cleanupExpiredContent = useCallback((): number => {
    if (!contentAddressingRef.current) return 0;

    try {
      return contentAddressingRef.current.cleanupExpiredContent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cleanup expired content');
      return 0;
    }
  }, []);

  // Get routing table
  const getRoutingTable = useCallback(() => {
    return routingProtocolRef.current?.getRoutingTable() || {};
  }, []);

  // Discover route to node
  const discoverRoute = useCallback(async (destination: string): Promise<string[] | null> => {
    if (!routingProtocolRef.current) return null;

    try {
      const route = await routingProtocolRef.current.discoverRoute(destination);
      return route;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to discover route');
      return null;
    }
  }, []);

  return {
    // State
    isInitialized,
    isConnected,
    nodes,
    error,

    // Messaging
    sendMessage,
    processMessageQueue,

    // Content
    storeContent,
    getContent,
    cleanupExpiredContent,

    // Services
    registerService,
    discoverServices,

    // Routing
    getRoutingTable,
    discoverRoute,
    getNetworkStats,

    // Protocols (advanced usage)
    routingProtocol: routingProtocolRef.current,
    storeAndForward: storeAndForwardRef.current,
    contentAddressing: contentAddressingRef.current,
    serviceDiscovery: serviceDiscoveryRef.current,
    transportLayer: transportLayerRef.current
  };
}

// ─── Convenience Hooks ───────────────────────────────────────────────────────

/**
 * Hook for emergency messaging
 */
export function useEmergencyMessaging(nodeId: string = 'node-1') {
  const meshNetwork = useMeshNetwork(nodeId);

  const sendEmergencyMessage = useCallback(async (
    destination: string,
    message: any
  ): Promise<string | null> => {
    return await meshNetwork.sendMessage(destination, message, 'emergency');
  }, [meshNetwork]);

  return {
    ...meshNetwork,
    sendEmergencyMessage
  };
}

/**
 * Hook for content sharing
 */
export function useContentSharing(nodeId: string = 'node-1') {
  const meshNetwork = useMeshNetwork(nodeId);

  const shareContent = useCallback(async (
    data: any,
    name: string
  ): Promise<string | null> => {
    return await meshNetwork.storeContent(data, name, { type: 'shared' });
  }, [meshNetwork]);

  const retrieveSharedContent = useCallback(async (name: string): Promise<any | null> => {
    if (!meshNetwork.contentAddressing) return null;
    return await meshNetwork.contentAddressing.getContentByName(name);
  }, [meshNetwork]);

  return {
    ...meshNetwork,
    shareContent,
    retrieveSharedContent
  };
}

/**
 * Hook for service registration
 */
export function useMeshServices(nodeId: string = 'node-1') {
  const meshNetwork = useMeshNetwork(nodeId);

  const registerEmergencyService = useCallback((
    address: string,
    port: number
  ): string | null => {
    return meshNetwork.registerService(
      'emergency-coordination',
      ServiceTypes.EMERGENCY_COORDINATION,
      address,
      port,
      ['emergency-broadcast']
    );
  }, [meshNetwork]);

  const registerMessageRelay = useCallback((
    address: string,
    port: number
  ): string | null => {
    return meshNetwork.registerService(
      'message-relay',
      ServiceTypes.MESSAGE_RELAY,
      address,
      port,
      ['forward-messages']
    );
  }, [meshNetwork]);

  const discoverEmergencyServices = useCallback(async (): Promise<any[]> => {
    return await meshNetwork.discoverServices(ServiceTypes.EMERGENCY_COORDINATION);
  }, [meshNetwork]);

  return {
    ...meshNetwork,
    registerEmergencyService,
    registerMessageRelay,
    discoverEmergencyServices
  };
}
