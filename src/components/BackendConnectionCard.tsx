/**
 * BackendConnectionCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * React component for manual backend configuration and connection management.
 *
 * Features:
 * - Custom text input for backend URL
 * - Connect and Retry buttons
 * - Status indicator with color coding
 * - Thread-safe connection state management
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { getApiBase } from '../utils/env';
import { getSQLiteService } from '../services/sqliteService';

interface BackendConnectionCardProps {
  onConnect?: (url: string) => void;
  onDisconnect?: (url: string, error: string) => void;
  onStatusChange?: (status: 'connected' | 'disconnected' | 'connecting' | 'error' | 'updated', nodeCount: number) => void;
  className?: string;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export const BackendConnectionCard: React.FC<BackendConnectionCardProps> = ({
  onConnect,
  onDisconnect,
  onStatusChange,
  className = '',
}) => {
  const [backendUrl, setBackendUrl] = useState<string>(getApiBase());
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [statusMessage, setStatusMessage] = useState<string>('Disconnected');
  const [nodeCount, setNodeCount] = useState<number>(0);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPollingRef = useRef<boolean>(false);

  // Auto-prepend http:// if missing
  const handleUrlChange = useCallback((value: string) => {
    if (!backendUrl && !value.startsWith('http')) {
      setBackendUrl(`http://${value}`);
    } else {
      setBackendUrl(value);
    }
  }, [backendUrl]);

  // Verify backend connection (SQLite offline mode)
  const verifyConnection = useCallback(async () => {
    if (isConnecting) return;

    setIsConnecting(true);
    setStatus('connecting');
    setStatusMessage('Connecting to SQLite...');

    try {
      const sqliteService = getSQLiteService();
      const nodes = sqliteService.getTopology();
      const count = nodes.length;

      setStatus('connected');
      setStatusMessage(`Offline Mode (${count} nodes)`);
      setNodeCount(count);

      onConnect?.('sqlite://local');
      onStatusChange?.('connected', count);

      // Start polling
      startPolling();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setStatus('error');
      setStatusMessage(`Error: ${errorMessage}`);
      setNodeCount(0);

      onDisconnect?.('sqlite://local', errorMessage);
      onStatusChange?.('error', 0);

      stopPolling();
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting, onConnect, onDisconnect, onStatusChange]);

  // Start background polling (SQLite offline mode)
  const startPolling = useCallback(() => {
    if (isPollingRef.current) return;

    isPollingRef.current = true;
    pollingIntervalRef.current = setInterval(() => {
      try {
        const sqliteService = getSQLiteService();
        const nodes = sqliteService.getTopology();
        const count = nodes.length;

        setNodeCount(count);
        setStatusMessage(`Offline Mode (${count} nodes)`);
        onStatusChange?.('updated', count);
      } catch (error) {
        console.error('[BackendConnectionCard] Polling error:', error);
      }
    }, 5000); // Poll every 5 seconds
  }, [onStatusChange]);

  // Stop background polling
  const stopPolling = useCallback(() => {
    isPollingRef.current = false;
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // Manual disconnect
  const disconnect = useCallback(() => {
    stopPolling();
    setStatus('disconnected');
    setStatusMessage('Disconnected');
    setNodeCount(0);
    onDisconnect?.(backendUrl, 'Manual disconnect');
    onStatusChange?.('disconnected', 0);
  }, [backendUrl, stopPolling, onDisconnect, onStatusChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  // Get status color
  const getStatusColor = (): string => {
    switch (status) {
      case 'connected':
        return 'bg-green-500';
      case 'connecting':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusTextColor = (): string => {
    switch (status) {
      case 'connected':
        return 'text-green-600';
      case 'connecting':
        return 'text-yellow-600';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  if (isCollapsed) {
    return (
      <div className={`bg-gray-100 border border-gray-300 rounded-lg p-3 ${className}`}>
        <button
          onClick={() => setIsCollapsed(false)}
          className="w-full text-left text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          ▼ Backend Connection
        </button>
      </div>
    );
  }

  return (
    <div className={`bg-gray-50 border border-gray-300 rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold text-gray-800">Backend Connection</h3>
        <button
          onClick={() => setIsCollapsed(true)}
          className="text-gray-500 hover:text-gray-700 text-sm"
        >
          ▲
        </button>
      </div>

      <div className="space-y-3">
        {/* URL Input */}
        <div className="flex items-center space-x-2">
          <label className="text-sm text-gray-600 w-12">URL:</label>
          <input
            type="text"
            value={backendUrl}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="http://localhost:4000"
            className="flex-1 px-3 py-2 border border-gray-400 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isConnecting}
          />
        </div>

        {/* Buttons */}
        <div className="flex space-x-2">
          <button
            onClick={verifyConnection}
            disabled={isConnecting}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 px-4 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isConnecting ? 'Connecting...' : 'Connect'}
          </button>
          <button
            onClick={verifyConnection}
            disabled={isConnecting}
            className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-white py-2 px-4 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Retry
          </button>
        </div>

        {/* Status */}
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
          <span className={`text-sm ${getStatusTextColor()}`}>{statusMessage}</span>
        </div>
      </div>
    </div>
  );
};
