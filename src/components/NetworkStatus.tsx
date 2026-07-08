import { useState, useEffect } from 'react';

export function NetworkStatus() {
  const [status, setStatus] = useState({
    online: navigator.onLine,
    connectionType: 'unknown',
    latency: 0,
    downlink: 0,
    saveData: false,
    devicesConnected: 0,
    protocolActive: 'none' as 'ble' | 'webrtc' | 'hotspot' | 'none'
  });

  useEffect(() => {
    const updateStatus = () => {
      const connection = (navigator as any).connection;
      setStatus(prev => ({
        ...prev,
        online: navigator.onLine,
        connectionType: connection?.effectiveType || 'unknown',
        latency: connection?.rtt || 0,
        downlink: connection?.downlink || 0,
        saveData: connection?.saveData || false
      }));
    };

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    
    if ((navigator as any).connection) {
      (navigator as any).connection.addEventListener('change', updateStatus);
    }
    
    const interval = setInterval(updateStatus, 5000);
    updateStatus();

    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
      if ((navigator as any).connection) {
        (navigator as any).connection.removeEventListener('change', updateStatus);
      }
      clearInterval(interval);
    };
  }, []);

  const getConnectionQuality = () => {
    if (!status.online) return 'offline';
    if (status.downlink >= 10) return 'excellent';
    if (status.downlink >= 5) return 'good';
    if (status.downlink >= 2) return 'fair';
    return 'poor';
  };

  const getLatencyColor = () => {
    if (status.latency < 50) return 'text-green-400';
    if (status.latency < 100) return 'text-yellow-400';
    if (status.latency < 200) return 'text-orange-400';
    return 'text-red-400';
  };

  const getConnectionIcon = () => {
    if (!status.online) return '📴';
    if (status.connectionType === '4g') return '📶';
    if (status.connectionType === '3g') return '📡';
    if (status.connectionType === '2g') return '📱';
    return '🌐';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-gray-400 text-sm">Status</span>
        <div className="flex items-center">
          <span className="text-xl mr-2">{getConnectionIcon()}</span>
          <span className={`font-semibold text-sm ${status.online ? 'text-green-400' : 'text-red-400'}`}>
            {status.online ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-gray-400 text-sm">Connection</span>
        <span className="text-white text-sm capitalize">{status.connectionType}</span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-gray-400 text-sm">Quality</span>
        <span className="text-white text-sm capitalize">{getConnectionQuality()}</span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-gray-400 text-sm">Latency</span>
        <span className={`text-sm font-semibold ${getLatencyColor()}`}>
          {status.latency}ms
        </span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-gray-400 text-sm">Downlink</span>
        <span className="text-white text-sm">{status.downlink} Mbps</span>
      </div>

      {status.saveData && (
        <div className="flex items-center justify-between">
          <span className="text-gray-400 text-sm">Data Saver</span>
          <span className="text-yellow-400 text-sm">Enabled</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-gray-400 text-sm">Mesh Devices</span>
        <span className="text-white text-sm">{status.devicesConnected}</span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-gray-400 text-sm">Active Protocol</span>
        <span className="text-white text-sm capitalize">{status.protocolActive}</span>
      </div>

      {!status.online && (
        <div className="mt-3 p-3 bg-red-900/30 border border-red-700 rounded">
          <p className="text-red-300 text-sm">
            ⚠️ You are offline. MeshNet will continue to work with cached data and local connections.
          </p>
        </div>
      )}

      {status.online && status.latency > 200 && (
        <div className="mt-3 p-3 bg-yellow-900/30 border border-yellow-700 rounded">
          <p className="text-yellow-300 text-sm">
            ⚠️ High latency detected. Mesh performance may be affected.
          </p>
        </div>
      )}
    </div>
  );
}
