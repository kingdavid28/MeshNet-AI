/**
 * BLE Scanner Component
 * 
 * This component allows phones to scan for MeshNet BLE devices and retrieve hotspot credentials.
 * 
 * Flow:
 * 1. User clicks "Scan for MeshNet"
 * 2. Phone scans for BLE devices with MeshNet service UUID
 * 3. User connects to device
 * 4. Credentials are retrieved and displayed
 * 5. User manually connects to WiFi using credentials
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import { bleService, MeshNetCredentials } from '../services/ble';

export function BLEScanner() {
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [credentials, setCredentials] = useState<MeshNetCredentials | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleScan = async () => {
    if (!bleService.isSupported()) {
      setError('Web Bluetooth API not supported in this browser. Try Chrome or Edge.');
      return;
    }

    setScanning(true);
    setError(null);
    setCredentials(null);

    try {
      console.log('[BLEScanner] Starting scan...');
      const devices = await bleService.scanForMeshNet();
      console.log('[BLEScanner] Found devices:', devices);

      if (devices.length === 0) {
        setError('No MeshNet devices found. Make sure the desktop app is running with hotspot active.');
        return;
      }

      // Connect to the first device
      setConnecting(true);
      const creds = await bleService.connectAndRetrieveCredentials(devices[0].id);
      setCredentials(creds);
      console.log('[BLEScanner] Credentials retrieved:', { ssid: creds.ssid, password: '***' });
    } catch (err) {
      setError('Failed to scan or connect: ' + (err as Error).message);
      console.error('[BLEScanner] Error:', err);
    } finally {
      setScanning(false);
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await bleService.disconnect();
      setCredentials(null);
    } catch (err) {
      console.error('[BLEScanner] Disconnect error:', err);
    }
  };

  return (
    <div className="p-3 bg-gray-800 border border-gray-700 rounded-xl space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold text-xs">BLE Scanner</h3>
        {bleService.isSupported() ? (
          <div className="w-2 h-2 bg-green-400 rounded-full flex-shrink-0" />
        ) : (
          <div className="w-2 h-2 bg-red-400 rounded-full flex-shrink-0" />
        )}
      </div>

      {error && (
        <div className="relative p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
          <button
            onClick={() => setError(null)}
            className="absolute top-1 right-1 p-0.5 rounded hover:bg-red-500/20 transition-colors"
            aria-label="Dismiss error"
          >
            <X size={12} className="text-red-400" />
          </button>
          <div className="flex items-start gap-2 pr-5 max-h-[60px] overflow-y-auto" style={{ scrollbarWidth: "none" }}>
            <span className="text-red-400 text-[10px] flex-shrink-0 mt-0.5">⚠</span>
            <p className="text-red-300 text-[10px] leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {credentials && (
        <div className="p-2 bg-green-500/10 border border-green-500/30 rounded-lg space-y-1.5">
          <p className="text-green-300 text-[10px] font-semibold">Credentials</p>
          <div className="space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-[10px]">SSID:</span>
              <span className="text-white font-mono text-[10px]">{credentials.ssid}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-[10px]">Password:</span>
              <span className="text-white font-mono text-[10px]">{credentials.password}</span>
            </div>
          </div>
          <button
            onClick={handleDisconnect}
            className="w-full py-1 text-[10px] font-semibold rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors"
          >
            Disconnect
          </button>
        </div>
      )}

      {!credentials && (
        <button
          onClick={handleScan}
          disabled={scanning || connecting || !bleService.isSupported()}
          className="w-full py-1.5 text-[10px] font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white transition-colors"
        >
          {(() => {
            if (scanning) return 'Scanning...';
            if (connecting) return 'Connecting...';
            return 'Scan for MeshNet';
          })()}
        </button>
      )}
    </div>
  );
}
