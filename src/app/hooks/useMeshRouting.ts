/**
 * useMeshRouting Hook
 * ===================
 * React hook for mesh network routing and SOS messaging
 * Integrates the routing engine and broadcast engine with React state
 */

import { useState, useCallback, useRef } from 'react';
import { RoutingEngine, MeshNode, RoutingResult, mockTopology } from '../../utils/routing';
import { 
  SOSPacket, 
  HopCallback, 
  CompleteCallback,
  handshakeLogger,
  broadcastEngine 
} from '../../utils/messaging';

export interface RoutingState {
  nodes: MeshNode[];
  routingResult: RoutingResult | null;
  isComputing: boolean;
}

export interface BroadcastState {
  isBroadcasting: boolean;
  currentHop: number;
  currentNode: string;
  hopStatus: 'TX' | 'RX' | null;
  completedPackets: SOSPacket[];
}

export function useMeshRouting() {
  const [routingState, setRoutingState] = useState<RoutingState>({
    nodes: [],
    routingResult: null,
    isComputing: false,
  });

  const [broadcastState, setBroadcastState] = useState<BroadcastState>({
    isBroadcasting: false,
    currentHop: 0,
    currentNode: '',
    hopStatus: null,
    completedPackets: [],
  });

  const routingEngineRef = useRef(new RoutingEngine());

  /**
   * Compute optimal routing path for given nodes
   */
  const computeRoute = useCallback((nodes: MeshNode[]) => {
    setRoutingState(prev => ({ ...prev, isComputing: true }));
    
    // Simulate async computation for UI feedback
    setTimeout(() => {
      const result = routingEngineRef.current.compute(nodes);
      setRoutingState({
        nodes,
        routingResult: result,
        isComputing: false,
      });
    }, 100);
  }, []);

  /**
   * Load mock topology for testing
   */
  const loadMockTopology = useCallback(() => {
    const nodes = mockTopology();
    computeRoute(nodes);
  }, [computeRoute]);

  /**
   * Broadcast SOS message through the mesh
   */
  const broadcastSOS = useCallback(async (
    scenario: string,
    message: string,
    originNode: string,
    path: string[]
  ) => {
    if (broadcastState.isBroadcasting) {
      console.warn('[Routing] Broadcast already in progress');
      return;
    }

    const packet = new SOSPacket(scenario, message, originNode, path);
    
    setBroadcastState({
      isBroadcasting: true,
      currentHop: 0,
      currentNode: '',
      hopStatus: null,
      completedPackets: broadcastState.completedPackets,
    });

    const onHop: HopCallback = (hopIndex, nodeId, status) => {
      setBroadcastState(prev => ({
        ...prev,
        currentHop: hopIndex,
        currentNode: nodeId,
        hopStatus: status,
      }));
    };

    const onComplete: CompleteCallback = (packet, success) => {
      setBroadcastState(prev => ({
        ...prev,
        isBroadcasting: false,
        currentHop: 0,
        currentNode: '',
        hopStatus: null,
        completedPackets: success 
          ? [...prev.completedPackets, packet]
          : prev.completedPackets,
      }));
    };

    try {
      await broadcastEngine.broadcast(packet, onHop, onComplete);
    } catch (error) {
      console.error('[Routing] Broadcast failed:', error);
      setBroadcastState(prev => ({
        ...prev,
        isBroadcasting: false,
        currentHop: 0,
        currentNode: '',
        hopStatus: null,
      }));
    }
  }, [broadcastState.isBroadcasting, broadcastState.completedPackets]);

  /**
   * Abort current broadcast
   */
  const abortBroadcast = useCallback(() => {
    if (broadcastState.isBroadcasting) {
      broadcastEngine.abort();
      setBroadcastState(prev => ({
        ...prev,
        isBroadcasting: false,
        currentHop: 0,
        currentNode: '',
        hopStatus: null,
      }));
    }
  }, [broadcastState.isBroadcasting]);

  /**
   * Load handshake log history
   */
  const loadHandshakeLog = useCallback(async () => {
    try {
      const records = await handshakeLogger.readAll();
      return records;
    } catch (error) {
      console.error('[Routing] Failed to load handshake log:', error);
      return [];
    }
  }, []);

  /**
   * Clear handshake log
   */
  const clearHandshakeLog = useCallback(async () => {
    try {
      await handshakeLogger.clear();
      setBroadcastState(prev => ({
        ...prev,
        completedPackets: [],
      }));
    } catch (error) {
      console.error('[Routing] Failed to clear handshake log:', error);
    }
  }, []);

  return {
    // Routing state
    nodes: routingState.nodes,
    routingResult: routingState.routingResult,
    isComputing: routingState.isComputing,
    
    // Broadcast state
    isBroadcasting: broadcastState.isBroadcasting,
    currentHop: broadcastState.currentHop,
    currentNode: broadcastState.currentNode,
    hopStatus: broadcastState.hopStatus,
    completedPackets: broadcastState.completedPackets,
    
    // Actions
    computeRoute,
    loadMockTopology,
    broadcastSOS,
    abortBroadcast,
    loadHandshakeLog,
    clearHandshakeLog,
  };
}
