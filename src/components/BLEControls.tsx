/**
 * BLEControls — Component for controlling BLE peripheral advertising
 * 
 * This component allows the desktop app to broadcast WiFi credentials via BLE
 * for automatic device discovery by mobile devices.
 * 
 * IMPORTANT: Requires USB Bluetooth 4.0+ adapter with WinUSB driver on Windows.
 * See desktop/README.md for Zadig setup instructions.
 */

import { useState, useEffect } from 'react';
import { Bluetooth, BluetoothOff, Wifi, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

interface BLEControlsProps {
  hotspotCredentials?: { ssid: string; password: string } | null;
  onStatusChange?: (isAdvertising: boolean) => void;
}

export function BLEControls({ hotspotCredentials, onStatusChange }: BLEControlsProps) {
  const [isAdvertising, setIsAdvertising] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Check if Electron API is available
  const isElectron = typeof window !== 'undefined' && 'electronAPI' in window;

  // Initialize BLE on mount
  useEffect(() => {
    if (!isElectron) return;

    const initBLE = async () => {
      setIsInitializing(true);
      setError(null);
      try {
        const result = await (window as any).electronAPI.initializeBLE();
        if (result.success) {
          setInitialized(true);
        } else {
          setError(result.error || 'Failed to initialize BLE');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize BLE');
      } finally {
        setIsInitializing(false);
      }
    };

    initBLE();
  }, [isElectron]);

  // Check advertising status periodically
  useEffect(() => {
    if (!isElectron || !initialized) return;

    const checkStatus = async () => {
      try {
        const result = await (window as any).electronAPI.isBLEAdvertising();
        if (result.success) {
          setIsAdvertising(result.isAdvertising);
          onStatusChange?.(result.isAdvertising);
        }
      } catch (err) {
        console.error('Failed to check BLE status:', err);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [isElectron, initialized, onStatusChange]);

  const handleStartAdvertising = async () => {
    if (!hotspotCredentials) {
      setError('No hotspot credentials available');
      return;
    }

    if (!isElectron) {
      setError('Electron API not available');
      return;
    }

    setIsStarting(true);
    setError(null);

    try {
      const result = await (window as any).electronAPI.startBLEAdvertising(hotspotCredentials);
      if (result.success) {
        setIsAdvertising(true);
        onStatusChange?.(true);
      } else {
        setError(result.error || 'Failed to start BLE advertising');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start BLE advertising');
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopAdvertising = async () => {
    if (!isElectron) {
      setError('Electron API not available');
      return;
    }

    setIsStopping(true);
    setError(null);

    try {
      const result = await (window as any).electronAPI.stopBLEAdvertising();
      if (result.success) {
        setIsAdvertising(false);
        onStatusChange?.(false);
      } else {
        setError(result.error || 'Failed to stop BLE advertising');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop BLE advertising');
    } finally {
      setIsStopping(false);
    }
  };

  if (!isElectron) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-yellow-800 font-medium">Desktop Only</p>
            <p className="text-xs text-yellow-700 mt-1">
              BLE advertising is only available in the desktop Electron app.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isAdvertising ? (
            <Bluetooth className="w-5 h-5 text-blue-600" />
          ) : (
            <BluetoothOff className="w-5 h-5 text-gray-400" />
          )}
          <h3 className="font-semibold text-gray-900">BLE Advertising</h3>
        </div>
        <div className="flex items-center gap-2">
          {isAdvertising ? (
            <CheckCircle className="w-4 h-4 text-green-500" />
          ) : (
            <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
          )}
          <span className="text-xs text-gray-600">
            {isAdvertising ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-800">{error}</p>
          </div>
        </div>
      )}

      {isInitializing && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Initializing BLE...</span>
        </div>
      )}

      {!initialized && !isInitializing && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-yellow-800 font-medium">BLE Not Initialized</p>
              <p className="text-xs text-yellow-700 mt-1">
                Requires USB Bluetooth 4.0+ adapter with WinUSB driver.
                See desktop/README.md for setup instructions.
              </p>
            </div>
          </div>
        </div>
      )}

      {initialized && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Wifi className="w-4 h-4" />
            <span className="text-xs">
              Broadcasting: {hotspotCredentials?.ssid || 'No hotspot'}
            </span>
          </div>

          <div className="flex gap-2">
            {!isAdvertising ? (
              <button
                onClick={handleStartAdvertising}
                disabled={isStarting || !hotspotCredentials}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {isStarting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Bluetooth className="w-4 h-4" />
                    Start Advertising
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleStopAdvertising}
                disabled={isStopping}
                className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {isStopping ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Stopping...
                  </>
                ) : (
                  <>
                    <BluetoothOff className="w-4 h-4" />
                    Stop Advertising
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="text-xs text-gray-500 border-t border-gray-200 pt-3">
        <p className="font-medium mb-1">How it works:</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>Desktop advertises WiFi credentials via BLE</li>
          <li>Phone scans for MeshNet service UUID</li>
          <li>Phone reads credentials and connects to WiFi</li>
        </ul>
      </div>
    </div>
  );
}
