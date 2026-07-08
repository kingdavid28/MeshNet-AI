import { useState, useEffect } from 'react';
import { WebRTCMeshService } from '../services/webrtc';

export function WebRTCManager() {
  const [connectedDevices, setConnectedDevices] = useState<string[]>([]);
  const [signalingConnected, setSignalingConnected] = useState(false);
  const [availableDevices, setAvailableDevices] = useState<string[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  const webrtcService = new WebRTCMeshService();
  const SIGNALING_SERVER_URL = 'ws://localhost:4000/signaling';

  useEffect(() => {
    // Check if WebRTC is supported
    setIsSupported(WebRTCMeshService.isSupported());
    
    // Connect to signaling server
    connectToSignaling();
    
    // Listen for WebRTC events
    webrtcService.on('signalingConnected', handleSignalingConnected);
    webrtcService.on('signalingDisconnected', handleSignalingDisconnected);
    webrtcService.on('signalingError', handleSignalingError);
    webrtcService.on('peerConnected', handlePeerConnected);
    webrtcService.on('peerDisconnected', handlePeerDisconnected);
    webrtcService.on('offerReceived', handleOfferReceived);
    webrtcService.on('answerReceived', handleAnswerReceived);
    webrtcService.on('iceCandidateReceived', handleIceCandidateReceived);
    webrtcService.on('deviceRegistered', handleDeviceRegistered);

    return () => {
      webrtcService.off('signalingConnected', handleSignalingConnected);
      webrtcService.off('signalingDisconnected', handleSignalingDisconnected);
      webrtcService.off('signalingError', handleSignalingError);
      webrtcService.off('peerConnected', handlePeerConnected);
      webrtcService.off('peerDisconnected', handlePeerDisconnected);
      webrtcService.off('offerReceived', handleOfferReceived);
      webrtcService.off('answerReceived', handleAnswerReceived);
      webrtcService.off('iceCandidateReceived', handleIceCandidateReceived);
      webrtcService.off('deviceRegistered', handleDeviceRegistered);
      webrtcService.disconnectAll();
      webrtcService.disconnectSignaling();
    };
  }, []);

  const connectToSignaling = async () => {
    try {
      // Probe the HTTP backend before attempting the WebSocket upgrade.
      // If the backend isn't running there is no signaling route, so skip
      // silently rather than logging a WebSocket error on every mount.
      const probe = await fetch('http://localhost:4000/api/mesh/topology', {
        signal: AbortSignal.timeout(2_000),
      }).catch(() => null);
      if (!probe?.ok) return; // backend not reachable — skip signaling

      const success = await webrtcService.connectToSignaling(SIGNALING_SERVER_URL);
      if (!success) {
        setError('Failed to connect to signaling server');
      }
    } catch {
      // Signaling is optional — suppress connection errors
    }
  };

  const handleSignalingConnected = () => {
    setSignalingConnected(true);
    setError(null);
  };

  const handleSignalingDisconnected = () => {
    setSignalingConnected(false);
    setError('Signaling server disconnected');
  };

  const handleSignalingError = (error: any) => {
    setError('Signaling error: ' + error.message);
  };

  const handlePeerConnected = (deviceId: string) => {
    setConnectedDevices(prev => [...prev, deviceId]);
    setError(null);
  };

  const handlePeerDisconnected = (deviceId: string) => {
    setConnectedDevices(prev => prev.filter(id => id !== deviceId));
  };

  const handleOfferReceived = async (message: any) => {
    console.log('Offer received from:', message.deviceId);
    try {
      const answer = await webrtcService.acceptConnection(message.deviceId, message.offer);
      // Send answer via signaling server
      // This would be handled by the signaling server
    } catch (error) {
      setError('Failed to accept connection: ' + (error as Error).message);
    }
  };

  const handleAnswerReceived = async (message: any) => {
    console.log('Answer received from:', message.deviceId);
    try {
      await webrtcService.finalizeConnection(message.deviceId, message.answer);
    } catch (error) {
      setError('Failed to finalize connection: ' + (error as Error).message);
    }
  };

  const handleIceCandidateReceived = async (message: any) => {
    console.log('ICE candidate received from:', message.deviceId);
    try {
      await webrtcService.addIceCandidate(message.deviceId, message.candidate);
    } catch (error) {
      console.error('Failed to add ICE candidate:', error);
    }
  };

  const handleDeviceRegistered = (message: any) => {
    console.log('Device registered:', message.deviceId);
    setAvailableDevices(prev => [...prev, message.deviceId]);
  };

  const initiateConnection = async (remoteDeviceId: string) => {
    setConnecting(true);
    setError(null);
    
    try {
      const offer = await webrtcService.offerConnection(remoteDeviceId);
      // Send offer via signaling server
      // This would be handled by the signaling server
      console.log('Connection initiated with:', remoteDeviceId);
    } catch (error) {
      setError('Failed to initiate connection: ' + (error as Error).message);
    } finally {
      setConnecting(false);
    }
  };

  const disconnectFrom = (deviceId: string) => {
    webrtcService.disconnectFrom(deviceId);
    setConnectedDevices(prev => prev.filter(id => id !== deviceId));
  };

  const disconnectAll = () => {
    webrtcService.disconnectAll();
    setConnectedDevices([]);
  };

  if (!isSupported) {
    return (
      <div className="p-4 bg-gray-800 rounded-lg border border-red-600">
        <div className="flex items-center mb-4">
          <div className="w-3 h-3 bg-red-500 rounded-full mr-2" />
          <h3 className="text-white font-semibold">WebRTC Not Supported</h3>
        </div>
        <p className="text-gray-400 text-sm">
          WebRTC is not supported in this browser. Please use a modern browser like Chrome, Firefox, or Edge.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <div className={`w-3 h-3 rounded-full mr-2 ${signalingConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <h3 className="text-white font-semibold">WebRTC Mesh Connections</h3>
        </div>
        {connectedDevices.length > 0 && (
          <button
            onClick={disconnectAll}
            className="text-red-400 hover:text-red-300 text-sm"
          >
            Disconnect All
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      <div className="mb-4 p-3 bg-gray-700 rounded">
        <div className="flex items-center justify-between">
          <span className="text-gray-400 text-sm">Signaling Server</span>
          <span className={`text-sm font-semibold ${signalingConnected ? 'text-green-400' : 'text-red-400'}`}>
            {signalingConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-gray-400 text-sm">Connected Devices</span>
          <span className="text-white text-sm font-semibold">{connectedDevices.length}</span>
        </div>
      </div>

      {connectedDevices.length > 0 && (
        <div className="space-y-2 mb-4">
          <p className="text-gray-400 text-sm mb-2">Connected Devices</p>
          {connectedDevices.map(deviceId => (
            <div
              key={deviceId}
              className="flex items-center justify-between bg-green-900/30 border border-green-700 p-3 rounded"
            >
              <div className="flex items-center">
                <div className="text-xl mr-3">🔗</div>
                <div>
                  <p className="text-white font-medium">{deviceId}</p>
                  <p className="text-green-400 text-xs">Connected via WebRTC</p>
                </div>
              </div>
              <button
                onClick={() => disconnectFrom(deviceId)}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm font-semibold transition-colors"
              >
                Disconnect
              </button>
            </div>
          ))}
        </div>
      )}

      {availableDevices.length > 0 && connectedDevices.length === 0 && (
        <div className="space-y-2 mb-4">
          <p className="text-gray-400 text-sm mb-2">Available Devices</p>
          {availableDevices.filter(id => !connectedDevices.includes(id)).map(deviceId => (
            <div
              key={deviceId}
              className="flex items-center justify-between bg-gray-700 p-3 rounded hover:bg-gray-600 transition-colors"
            >
              <div className="flex items-center">
                <div className="text-xl mr-3">📱</div>
                <div>
                  <p className="text-white font-medium">{deviceId}</p>
                  <p className="text-gray-400 text-xs">Available for connection</p>
                </div>
              </div>
              <button
                onClick={() => initiateConnection(deviceId)}
                disabled={connecting}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-3 py-1 rounded text-sm font-semibold transition-colors"
              >
                {connecting ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          ))}
        </div>
      )}

      {connectedDevices.length === 0 && availableDevices.length === 0 && (
        <div className="text-center py-8">
          <div className="text-4xl mb-3">🔗</div>
          <p className="text-gray-400 text-sm">
            {signalingConnected 
              ? 'Waiting for devices to join the mesh network...'
              : 'Connecting to signaling server...'}
          </p>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-700">
        <p className="text-gray-500 text-xs">
          WebRTC enables peer-to-peer data channels for direct device communication without intermediate servers
        </p>
      </div>
    </div>
  );
}
