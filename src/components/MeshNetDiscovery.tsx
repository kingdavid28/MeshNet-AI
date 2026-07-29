import React, { useState, useEffect } from 'react';
import { Wifi, QrCode, Network } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface MeshNetConnectionInfo {
  nodeId: string;
  name: string;
  bluetooth: {
    serviceUuid: string;
  };
  wifi: {
    ssid: string;
  };
}

export const MeshNetDiscovery: React.FC = () => {
  const [showQR, setShowQR] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState<MeshNetConnectionInfo | null>(null);

  // Generate connection info for QR code
  useEffect(() => {
    const nodeId = localStorage.getItem('meshnet_node_id') || crypto.randomUUID();
    const deviceName = localStorage.getItem('meshnet_node_label') || 'MeshNet Device';
    
    setConnectionInfo({
      nodeId,
      name: deviceName,
      bluetooth: {
        serviceUuid: '0000FEED-0000-1000-8000-00805F9B34FB'
      },
      wifi: {
        ssid: 'MESHNET-' + nodeId.substring(0, 6).toUpperCase()
      }
    });
  }, []);

  const getQRCodeData = () => {
    if (!connectionInfo) return '';
    return JSON.stringify(connectionInfo);
  };

  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <Network className="w-5 h-5 text-blue-400 mr-2" />
          <h3 className="text-white font-semibold">MeshNet Discovery</h3>
        </div>
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
        
        {showQR && connectionInfo && (
          <div className="flex flex-col items-center">
            <div className="bg-white p-3 rounded-lg mb-2">
              <QRCodeSVG 
                value={getQRCodeData()} 
                size={180}
                level="H"
                includeMargin={true}
              />
            </div>
            <p className="text-gray-400 text-xs text-center">
              Scan this QR code to join MeshNet
            </p>
            <p className="text-gray-500 text-xs text-center mt-1">
              Device: {connectionInfo.name}
            </p>
            <p className="text-gray-500 text-xs text-center">
              WiFi: {connectionInfo.wifi.ssid}
            </p>
          </div>
        )}
      </div>

      {/* Connection Info */}
      <div className="mt-4 p-3 bg-blue-900/30 border border-blue-700 rounded">
        <div className="flex items-start">
          <Wifi className="w-4 h-4 text-blue-400 mr-2 mt-0.5" />
          <div>
            <h4 className="text-white text-sm font-medium mb-1">Connection Information</h4>
            <p className="text-gray-400 text-xs">
              Your device broadcasts this QR code to allow other MeshNet devices to connect via Bluetooth or WiFi Direct.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
