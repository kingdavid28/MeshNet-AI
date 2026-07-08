import React, { useState, useEffect } from 'react';
import { Wifi, QrCode, Network, Smartphone } from 'lucide-react';
import mdnsService, { MeshNetService } from '../services/mdns';

interface DiscoveredDevice {
  id: string;
  name: string;
  type: 'hotspot' | 'bluetooth' | 'mdns';
  signal: number;
  url: string;
}

export const MeshNetDiscovery: React.FC = () => {
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [connectionUrl, setConnectionUrl] = useState('');

  // Generate connection URL for QR code
  useEffect(() => {
    const url = `${window.location.origin}/join`;
    setConnectionUrl(url);
  }, []);

  // Start mDNS discovery on mount
  useEffect(() => {
    const handleServicesDiscovered = (services: MeshNetService[]) => {
      const devices: DiscoveredDevice[] = services.map(service => ({
        id: `${service.host}-${service.port}`,
        name: service.name,
        type: 'mdns' as const,
        signal: 85, // Would be calculated from actual signal strength
        url: `http://${service.host}:${service.port}/join`
      }));
      setDiscoveredDevices(devices);
      setIsScanning(false);
    };

    mdnsService.onServicesDiscovered(handleServicesDiscovered);
    mdnsService.startDiscovery();

    return () => {
      mdnsService.removeListener(handleServicesDiscovered);
      mdnsService.stopDiscovery();
    };
  }, []);

  // Manual scan trigger
  const startMDNSDiscovery = async () => {
    setIsScanning(true);
    mdnsService.scanForMeshNetServices?.();
  };

  const connectToDevice = (device: DiscoveredDevice) => {
    // Navigate to connection URL
    window.location.href = device.url;
  };

  const generateQRCode = () => {
    // Using a simple QR code API for now
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(connectionUrl)}`;
    return qrApiUrl;
  };

  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <Network className="w-5 h-5 text-blue-400 mr-2" />
          <h3 className="text-white font-semibold">MeshNet Discovery</h3>
        </div>
        <button
          onClick={startMDNSDiscovery}
          disabled={isScanning}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white text-xs rounded"
        >
          {isScanning ? 'Scanning...' : 'Scan for MeshNet'}
        </button>
      </div>

      {/* QR Code Section */}
      <div className="mb-4 p-4 bg-gray-700 rounded">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center">
            <QrCode className="w-4 h-4 text-green-400 mr-2" />
            <h4 className="text-white text-sm font-medium">Quick Join via QR Code</h4>
          </div>
          <button
            onClick={() => setShowQR(!showQR)}
            className="text-blue-400 hover:text-blue-300 text-xs"
          >
            {showQR ? 'Hide' : 'Show'}
          </button>
        </div>
        
        {showQR && (
          <div className="flex flex-col items-center">
            <img 
              src={generateQRCode()} 
              alt="MeshNet QR Code" 
              className="border-4 border-white rounded-lg mb-2"
            />
            <p className="text-gray-400 text-xs text-center">
              Scan this QR code to join MeshNet
            </p>
            <p className="text-gray-500 text-xs text-center mt-1">
              {connectionUrl}
            </p>
          </div>
        )}
      </div>

      {/* Discovered Devices */}
      {discoveredDevices.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-gray-400 text-sm font-medium">Available MeshNet Devices</h4>
          {discoveredDevices.map((device) => (
            <div
              key={device.id}
              className="p-3 bg-gray-700 rounded flex items-center justify-between hover:bg-gray-600 cursor-pointer"
              onClick={() => connectToDevice(device)}
            >
              <div className="flex items-center">
                {device.type === 'hotspot' && <Wifi className="w-4 h-4 text-blue-400 mr-2" />}
                {device.type === 'bluetooth' && <Smartphone className="w-4 h-4 text-blue-400 mr-2" />}
                {device.type === 'mdns' && <Network className="w-4 h-4 text-blue-400 mr-2" />}
                <div>
                  <p className="text-white text-sm font-medium">{device.name}</p>
                  <p className="text-gray-400 text-xs">Signal: {device.signal}%</p>
                </div>
              </div>
              <button className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded">
                Join
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Captive Portal Info */}
      <div className="mt-4 p-3 bg-blue-900/30 border border-blue-700 rounded">
        <div className="flex items-start">
          <Wifi className="w-4 h-4 text-blue-400 mr-2 mt-0.5" />
          <div>
            <h4 className="text-white text-sm font-medium mb-1">Captive Portal Auto-Connect</h4>
            <p className="text-gray-400 text-xs">
              When connecting to MeshNet hotspot, you'll be automatically redirected to join the mesh network.
            </p>
          </div>
        </div>
      </div>

      {/* Scanning State */}
      {isScanning && (
        <div className="mt-4 p-3 bg-gray-700 rounded text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400 mx-auto mb-2"></div>
          <p className="text-gray-400 text-sm">Scanning for MeshNet devices...</p>
        </div>
      )}
    </div>
  );
};
