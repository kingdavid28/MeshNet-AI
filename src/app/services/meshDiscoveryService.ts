import { Capacitor } from '@capacitor/core';
import {
  MeshDiscovery,
  type DiscoveryStatus,
  type PeerDiscoveredEvent,
  type StartDiscoveryOptions,
} from '../plugins/MeshDiscoveryPlugin';
import type { DiscoveredPeer } from '../hooks/useMeshDiscovery';

interface DiscoveryState {
  status: DiscoveryStatus | null;
  peers: DiscoveredPeer[];
  error: string | null;
  isNative: boolean;
}

type StateListener = (state: DiscoveryState) => void;

class MeshDiscoveryService {
  private static instance: MeshDiscoveryService;
  
  private state: DiscoveryState = {
    status: null,
    peers: [],
    error: null,
    isNative: Capacitor.isNativePlatform()
  };
  
  private listeners: Set<StateListener> = new Set();
  private isInitialized = false;
  private eventListeners: { remove: () => void }[] = [];
  private nodeId: string;
  private label: string;
  private battery: number;
  private signal: number;
  private apiBase: string;
  private heartbeatIntervalMs: number;
  private deviceLocation: { lat: number; lng: number } | undefined;

  private constructor() {
    this.nodeId = this.getOrCreateNodeId();
    this.label = 'You';
    this.battery = 80;
    this.signal = 75;
    this.apiBase = 'http://localhost:4000';
    this.heartbeatIntervalMs = 5000;
  }

  static getInstance(): MeshDiscoveryService {
    if (!MeshDiscoveryService.instance) {
      MeshDiscoveryService.instance = new MeshDiscoveryService();
    }
    return MeshDiscoveryService.instance;
  }

  private getOrCreateNodeId(): string {
    const stored = localStorage.getItem('meshnet_node_id');
    if (stored) return stored;
    const newId = `device-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('meshnet_node_id', newId);
    return newId;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    // Immediately notify with current state
    listener({ ...this.state });
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener({ ...this.state }));
  }

  private async registerSelf() {
    try {
      await MeshDiscovery.registerSelf({
        nodeId: this.nodeId,
        label: this.label,
        lat: this.deviceLocation?.lat ?? 0,
        lng: this.deviceLocation?.lng ?? 0,
        battery: this.battery,
        signal: this.signal,
        device: 'smartphone',
        role: 'peer'
      });
      console.log('[MeshDiscoveryService] Registration successful');
    } catch (error) {
      console.warn('[MeshDiscoveryService] Registration failed (backend unavailable, running in standalone mode):', error);
      // Continue in standalone mode - BLE discovery will still work
    }
  }

  async start(options: {
    nodeId?: string;
    label?: string;
    battery?: number;
    signal?: number;
    apiBase?: string;
    heartbeatIntervalMs?: number;
    deviceLocation?: { lat: number; lng: number };
  }) {
    // Update options (only if not already initialized to prevent restarts)
    if (!this.isInitialized) {
      if (options.nodeId) this.nodeId = options.nodeId;
      if (options.label) this.label = options.label;
      if (options.battery !== undefined) this.battery = options.battery;
      if (options.signal !== undefined) this.signal = options.signal;
      if (options.apiBase) this.apiBase = options.apiBase;
      if (options.heartbeatIntervalMs) this.heartbeatIntervalMs = options.heartbeatIntervalMs;
      if (options.deviceLocation) this.deviceLocation = options.deviceLocation;
    }

    if (this.isInitialized) {
      console.log('[MeshDiscoveryService] Already initialized, skipping start');
      return;
    }

    console.log('[MeshDiscoveryService] Starting discovery...', { 
      isNative: this.state.isNative, 
      nodeId: this.nodeId, 
      label: this.label, 
      apiBase: this.apiBase 
    });

    // Register this device
    await this.registerSelf();

    if (!this.state.isNative) {
      console.log('[MeshDiscoveryService] Not native platform, skipping BLE/WiFi');
      this.isInitialized = true;
      return;
    }

    try {
      // Start native discovery
      const initialStatus = await MeshDiscovery.startDiscovery({
        nodeId: this.nodeId,
        label: this.label,
        lat: this.deviceLocation?.lat ?? 0,
        lng: this.deviceLocation?.lng ?? 0,
        battery: this.battery,
        signal: this.signal,
        apiBase: this.apiBase,
        heartbeatIntervalMs: this.heartbeatIntervalMs
      });
      
      console.log('[MeshDiscoveryService] Initial status:', initialStatus);
      this.state.status = initialStatus;
      this.notifyListeners();

      // Listen for events
      const peerSub = await MeshDiscovery.addListener('peerDiscovered', (event) => {
        console.log('[MeshDiscoveryService] Peer discovered:', event);
        this.state.peers = this.updatePeers(this.state.peers, event);
        this.notifyListeners();
      });

      const statusSub = await MeshDiscovery.addListener('statusChange', (event) => {
        console.log('[MeshDiscoveryService] Status change:', event);
        this.state.status = event;
        this.notifyListeners();
      });

      const errorSub = await MeshDiscovery.addListener('error', (event) => {
        console.error('[MeshDiscoveryService] Error:', event);
        this.state.error = event.message;
        this.notifyListeners();
      });

      this.eventListeners.push(peerSub, statusSub, errorSub);
      this.isInitialized = true;

    } catch (error) {
      console.error('[MeshDiscoveryService] Failed to start discovery:', error);
      this.state.error = error instanceof Error ? error.message : String(error);
      this.notifyListeners();
    }
  }

  async stop() {
    if (!this.isInitialized) {
      console.log('[MeshDiscoveryService] Not initialized, skipping stop');
      return;
    }

    console.log('[MeshDiscoveryService] Stopping discovery');
    
    // Remove event listeners
    this.eventListeners.forEach(listener => listener.remove());
    this.eventListeners = [];

    // Stop native discovery
    if (this.state.isNative) {
      try {
        await MeshDiscovery.stopDiscovery();
      } catch (error) {
        console.error('[MeshDiscoveryService] Failed to stop discovery:', error);
      }
    }

    this.isInitialized = false;
    this.state.status = null;
    this.state.peers = [];
    this.state.error = null;
    this.notifyListeners();
  }

  async reRegister() {
    await this.registerSelf();
  }

  private updatePeers(currentPeers: DiscoveredPeer[], newPeer: any): DiscoveredPeer[] {
    const now = Date.now();
    const existing = currentPeers.find((p) => p.nodeId === newPeer.nodeId);
    
    if (existing) {
      return currentPeers.map((p) =>
        p.nodeId === newPeer.nodeId
          ? { ...p, lastSeen: now, ...newPeer }
          : p
      );
    }
    
    return [...currentPeers, { ...newPeer, lastSeen: now }];
  }

  getState(): DiscoveryState {
    return { ...this.state };
  }
}

export const meshDiscoveryService = MeshDiscoveryService.getInstance();
