// WebRTC Service for MeshNet PWA
export interface MeshMessage {
  type: 'register' | 'data' | 'route' | 'heartbeat';
  deviceId: string;
  timestamp: number;
  payload?: any;
}

export interface WebRTCConnection {
  deviceId: string;
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  state: 'connecting' | 'connected' | 'disconnected';
}

export class WebRTCMeshService {
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private connections: Map<string, WebRTCConnection> = new Map();
  private signalingSocket: WebSocket | null = null;
  private localDeviceId: string;

  readonly config = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };

  constructor() {
    this.localDeviceId = this.getLocalDeviceId();
  }

  async connectToSignaling(serverUrl: string): Promise<boolean> {
    try {
      console.log('[WebRTC] Connecting to signaling server:', serverUrl);

      this.signalingSocket = new WebSocket(serverUrl);

      this.signalingSocket.onopen = () => {
        console.log('[WebRTC] Signaling server connected');
        this.emit('signalingConnected');

        // Register device
        this.sendSignalingMessage({
          type: 'register',
          deviceId: this.localDeviceId
        });
      };

      this.signalingSocket.onmessage = (event) => {
        this.handleSignalingMessage(JSON.parse(event.data));
      };

      this.signalingSocket.onerror = (error) => {
        console.error('[WebRTC] Signaling error:', error);
        this.emit('signalingError', error);
        // Note: Signaling server not available - WebRTC will work in manual mode
        console.log('[WebRTC] Signaling server unavailable - manual peer connection required');
      };

      this.signalingSocket.onclose = () => {
        console.log('[WebRTC] Signaling server disconnected');
        this.emit('signalingDisconnected');
      };

      return true;
    } catch (error) {
      console.error('[WebRTC] Failed to connect to signaling server:', error);
      console.log('[WebRTC] Signaling server unavailable - manual peer connection required');
      return false;
    }
  }

  async createPeerConnection(remoteDeviceId: string): Promise<RTCPeerConnection> {
    console.log('[WebRTC] Creating peer connection for:', remoteDeviceId);
    
    const pc = new RTCPeerConnection(this.config);

    // Create data channel for mesh messaging
    const dataChannel = pc.createDataChannel('mesh-data', {
      ordered: true,
      maxRetransmits: 3
    });

    this.setupDataChannel(dataChannel, remoteDeviceId);
    this.dataChannels.set(remoteDeviceId, dataChannel);

    // ICE candidate handling
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendIceCandidate(remoteDeviceId, event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', pc.connectionState);
      
      if (pc.connectionState === 'connected') {
        this.updateConnectionState(remoteDeviceId, 'connected');
        this.emit('peerConnected', remoteDeviceId);
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.updateConnectionState(remoteDeviceId, 'disconnected');
        this.handleDisconnection(remoteDeviceId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE connection state:', pc.iceConnectionState);
    };

    this.peerConnections.set(remoteDeviceId, pc);
    this.connections.set(remoteDeviceId, {
      deviceId: remoteDeviceId,
      connection: pc,
      dataChannel,
      state: 'connecting'
    });

    return pc;
  }

  async offerConnection(remoteDeviceId: string): Promise<RTCSessionDescription> {
    console.log('[WebRTC] Initiating connection to:', remoteDeviceId);
    
    const pc = await this.createPeerConnection(remoteDeviceId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    console.log('[WebRTC] Offer created');
    return offer;
  }

  async acceptConnection(remoteDeviceId: string, offer: RTCSessionDescription): Promise<RTCSessionDescription> {
    console.log('[WebRTC] Accepting connection from:', remoteDeviceId);
    
    const pc = await this.createPeerConnection(remoteDeviceId);
    
    // Listen for incoming data channel
    pc.ondatachannel = (event) => {
      const channel = event.channel;
      this.setupDataChannel(channel, remoteDeviceId);
      this.dataChannels.set(remoteDeviceId, channel);
    };

    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    console.log('[WebRTC] Answer created');
    return answer;
  }

  async finalizeConnection(remoteDeviceId: string, answer: RTCSessionDescription): Promise<void> {
    console.log('[WebRTC] Finalizing connection with:', remoteDeviceId);
    
    const pc = this.peerConnections.get(remoteDeviceId);
    if (pc) {
      await pc.setRemoteDescription(answer);
      console.log('[WebRTC] Connection finalized');
    }
  }

  async addIceCandidate(remoteDeviceId: string, candidate: RTCIceCandidate): Promise<void> {
    const pc = this.peerConnections.get(remoteDeviceId);
    if (pc) {
      await pc.addIceCandidate(candidate);
      console.log('[WebRTC] ICE candidate added for:', remoteDeviceId);
    }
  }

  private setupDataChannel(channel: RTCDataChannel, deviceId: string): void {
    channel.onopen = () => {
      console.log(`[WebRTC] Data channel opened with ${deviceId}`);
      this.updateConnectionState(deviceId, 'connected');
      
      // Send initial mesh registration
      this.sendMeshMessage(deviceId, {
        type: 'register',
        deviceId: this.localDeviceId,
        timestamp: Date.now()
      });
    };

    channel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMeshMessage(deviceId, message);
      } catch (error) {
        console.error('[WebRTC] Failed to parse message:', error);
      }
    };

    channel.onclose = () => {
      console.log(`[WebRTC] Data channel closed with ${deviceId}`);
      this.handleDisconnection(deviceId);
    };

    channel.onerror = (error) => {
      console.error(`[WebRTC] Data channel error with ${deviceId}:`, error);
    };
  }

  sendMeshMessage(deviceId: string, message: MeshMessage): void {
    const channel = this.dataChannels.get(deviceId);
    if (channel && channel.readyState === 'open') {
      channel.send(JSON.stringify(message));
      console.log('[WebRTC] Message sent to:', deviceId);
    } else {
      console.warn('[WebRTC] Cannot send message - channel not open:', deviceId);
    }
  }

  broadcastMessage(message: MeshMessage): void {
    this.dataChannels.forEach((channel, deviceId) => {
      if (channel.readyState === 'open') {
        channel.send(JSON.stringify(message));
      }
    });
    console.log('[WebRTC] Message broadcast to all peers');
  }

  private handleMeshMessage(deviceId: string, message: MeshMessage): void {
    console.log('[WebRTC] Message received from:', deviceId, message.type);
    
    switch (message.type) {
      case 'register':
        this.handleDeviceRegistration(deviceId, message);
        break;
      case 'data':
        this.handleDataMessage(deviceId, message);
        break;
      case 'route':
        this.handleRouteUpdate(deviceId, message);
        break;
      case 'heartbeat':
        this.handleHeartbeat(deviceId, message);
        break;
    }
  }

  private handleDeviceRegistration(deviceId: string, message: MeshMessage): void {
    console.log('[WebRTC] Device registered:', deviceId);
    this.emit('deviceRegistered', { deviceId, message });
    
    // Register with backend
    this.registerWithBackend(deviceId);
  }

  private handleDataMessage(deviceId: string, message: MeshMessage): void {
    console.log('[WebRTC] Data message from:', deviceId);
    this.emit('dataReceived', { deviceId, message });
  }

  private handleRouteUpdate(deviceId: string, message: MeshMessage): void {
    console.log('[WebRTC] Route update from:', deviceId);
    this.emit('routeUpdate', { deviceId, message });
  }

  private handleHeartbeat(deviceId: string, message: MeshMessage): void {
    console.log('[WebRTC] Heartbeat from:', deviceId);
    this.emit('heartbeat', { deviceId, message });
  }

  private handleDisconnection(deviceId: string): void {
    console.log('[WebRTC] Handling disconnection:', deviceId);
    
    this.peerConnections.delete(deviceId);
    this.dataChannels.delete(deviceId);
    this.connections.delete(deviceId);
    
    this.emit('peerDisconnected', deviceId);
  }

  private updateConnectionState(deviceId: string, state: 'connecting' | 'connected' | 'disconnected'): void {
    const connection = this.connections.get(deviceId);
    if (connection) {
      connection.state = state;
      this.connections.set(deviceId, connection);
    }
  }

  private handleSignalingMessage(message: any): void {
    console.log('[WebRTC] Signaling message:', message.type);
    
    switch (message.type) {
      case 'offer':
        this.emit('offerReceived', message);
        break;
      case 'answer':
        this.emit('answerReceived', message);
        break;
      case 'ice-candidate':
        this.emit('iceCandidateReceived', message);
        break;
      case 'device-registered':
        this.emit('deviceRegistered', message);
        break;
      case 'device-disconnected':
        this.emit('deviceDisconnected', message);
        break;
    }
  }

  private sendSignalingMessage(message: any): void {
    if (this.signalingSocket && this.signalingSocket.readyState === WebSocket.OPEN) {
      this.signalingSocket.send(JSON.stringify(message));
    }
  }

  private sendIceCandidate(deviceId: string, candidate: RTCIceCandidate): void {
    this.sendSignalingMessage({
      type: 'ice-candidate',
      deviceId,
      candidate
    });
  }

  private async registerWithBackend(deviceId: string): Promise<void> {
    try {
      const response = await fetch('/api/mesh/protocol/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Mesh-Secret': localStorage.getItem('mesh-secret') || ''
        },
        body: JSON.stringify({
          device_id: this.localDeviceId,
          protocol: 'wifi_direct'
        })
      });

      if (response.ok) {
        console.log('[WebRTC] Registered with backend');
      }
    } catch (error) {
      console.error('[WebRTC] Backend registration failed:', error);
    }
  }

  disconnectFrom(deviceId: string): void {
    const pc = this.peerConnections.get(deviceId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(deviceId);
    }
    const channel = this.dataChannels.get(deviceId);
    if (channel) {
      channel.close();
      this.dataChannels.delete(deviceId);
    }
    this.connections.delete(deviceId);
    console.log('[WebRTC] Disconnected from:', deviceId);
  }

  disconnectAll(): void {
    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();
    this.dataChannels.forEach((channel) => channel.close());
    this.dataChannels.clear();
    this.connections.clear();
    console.log('[WebRTC] Disconnected from all peers');
  }

  disconnectSignaling(): void {
    if (this.signalingSocket) {
      this.signalingSocket.close();
      this.signalingSocket = null;
    }
  }

  getConnectedDevices(): string[] {
    return Array.from(this.connections.keys()).filter(
      deviceId => this.connections.get(deviceId)?.state === 'connected'
    );
  }

  getConnectionState(deviceId: string): 'connecting' | 'connected' | 'disconnected' | undefined {
    return this.connections.get(deviceId)?.state;
  }

  isSignalingConnected(): boolean {
    return this.signalingSocket?.readyState === WebSocket.OPEN;
  }

  private getLocalDeviceId(): string {
    let deviceId = localStorage.getItem('mesh-device-id');
    if (!deviceId) {
      deviceId = this.generateDeviceId();
      localStorage.setItem('mesh-device-id', deviceId);
    }
    return deviceId;
  }

  private generateDeviceId(): string {
    return 'device-' + Math.random().toString(36).substring(2, 11);
  }

  // Simple event emitter
  private listeners: Map<string, Function[]> = new Map();

  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback: Function): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emit(event: string, data?: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  // Check if WebRTC is supported
  static isSupported(): boolean {
    return 'RTCPeerConnection' in window && 'RTCDataChannel' in window;
  }

  // Get supported features
  static getSupportedFeatures(): string[] {
    const features: string[] = [];
    
    if ('RTCPeerConnection' in window) {
      features.push('Peer Connections');
    }
    if ('RTCDataChannel' in window) {
      features.push('Data Channels');
    }
    if ('webkitRTCPeerConnection' in window) {
      features.push('Webkit Support');
    }
    
    return features;
  }
}
