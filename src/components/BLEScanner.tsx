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
    <div className="p-4 bg-gray-800 border border-gray-700 rounded-xl space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold text-sm">BLE Credential Scanner</h3>
        <div className="flex items-center gap-2">
          {bleService.isSupported() ? (
            <span className="text-green-400 text-xs">✓ Supported</span>
          ) : (
            <span className="text-red-400 text-xs">✗ Not Supported</span>
          )}
        </div>
      </div>

      <p className="text-gray-400 text-xs leading-relaxed">
        Scan for MeshNet BLE devices to automatically retrieve hotspot credentials.
      </p>

      {error && (
        <div className="flex items-start gap-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
          <span className="text-red-400 text-xs flex-shrink-0">⚠</span>
          <p className="text-red-300 text-xs leading-relaxed">{error}</p>
        </div>
      )}

      {credentials && (
        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg space-y-2">
          <p className="text-green-300 text-xs font-semibold">Credentials Retrieved</p>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-xs">SSID:</span>
              <span className="text-white font-mono text-xs">{credentials.ssid}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-xs">Password:</span>
              <span className="text-white font-mono text-xs">{credentials.password}</span>
            </div>
          </div>
          <p className="text-gray-400 text-[11px] leading-relaxed">
            Connect to this WiFi network to access the MeshNet PWA.
          </p>
          <button
            onClick={handleDisconnect}
            className="w-full py-1.5 text-xs font-semibold rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors"
          >
            Disconnect
          </button>
        </div>
      )}

      {!credentials && (
        <button
          onClick={handleScan}
          disabled={scanning || connecting || !bleService.isSupported()}
          className="w-full py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white transition-colors"
        >
          {scanning ? 'Scanning...' : connecting ? 'Connecting...' : 'Scan for MeshNet'}
        </button>
      )}

      <p className="text-gray-500 text-[10px] leading-relaxed">
        Note: Web Bluetooth API requires HTTPS or localhost. Make sure you're accessing this PWA via a secure connection.
      </p>
    </div>
  );
}
