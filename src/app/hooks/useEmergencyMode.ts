/**
 * Emergency Mode Hook
 * One-click emergency startup with auto-configuration
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNetworkDiscovery } from './useNetworkDiscovery';
import { useCloudantNodes } from './useCloudantNodes';

export interface EmergencyModeState {
  isActive: boolean;
  isInitializing: boolean;
  autoConnected: boolean;
  networkStatus: 'disconnected' | 'connecting' | 'connected' | 'offline';
  batteryOptimized: boolean;
  simplifiedUI: boolean;
  lastActivated: number | null;
}

export function useEmergencyMode() {
  const [emergencyState, setEmergencyState] = useState<EmergencyModeState>({
    isActive: false,
    isInitializing: false,
    autoConnected: false,
    networkStatus: 'disconnected',
    batteryOptimized: false,
    simplifiedUI: false,
    lastActivated: null,
  });

  const { backend, discovering, rediscover } = useNetworkDiscovery();
  const { nodes } = useCloudantNodes();

  // Keep latest refs to avoid re-creating callbacks and dependency loops
  const backendRef = useRef(backend);
  const rediscoverRef = useRef(rediscover);
  useEffect(() => { backendRef.current = backend; }, [backend]);
  useEffect(() => { rediscoverRef.current = rediscover; }, [rediscover]);

  // Activate emergency mode with one click
  const activateEmergencyMode = useCallback(async () => {
    setEmergencyState(prev => ({
      ...prev,
      isActive: true,
      isInitializing: true,
      networkStatus: 'connecting',
    }));

    try {
      // Step 1: Auto-discover network
      if (!backendRef.current) {
        await rediscoverRef.current();
      }

      // Step 2: Optimize battery settings
      await optimizeBattery();

      // Step 3: Enable simplified UI
      setEmergencyState(prev => ({
        ...prev,
        simplifiedUI: true,
        batteryOptimized: true,
      }));

      // Step 4: Set network status
      const currentBackend = backendRef.current;
      setEmergencyState(prev => ({
        ...prev,
        networkStatus: currentBackend ? 'connected' : 'offline',
        autoConnected: !!currentBackend,
        isInitializing: false,
        lastActivated: Date.now(),
      }));

      // Step 5: Store emergency mode in localStorage for persistence
      localStorage.setItem('emergency_mode', 'true');
      localStorage.setItem('emergency_activated', Date.now().toString());

    } catch (error) {
      console.error('Emergency mode activation failed:', error);
      setEmergencyState(prev => ({
        ...prev,
        networkStatus: 'offline',
        isInitializing: false,
      }));
    }
  }, []);

  // Deactivate emergency mode
  const deactivateEmergencyMode = useCallback(() => {
    setEmergencyState({
      isActive: false,
      isInitializing: false,
      autoConnected: false,
      networkStatus: 'disconnected',
      batteryOptimized: false,
      simplifiedUI: false,
      lastActivated: null,
    });

    localStorage.removeItem('emergency_mode');
    localStorage.removeItem('emergency_activated');
  }, []);

  // Battery optimization for emergency mode
  const optimizeBattery = useCallback(async () => {
    try {
      // Request wake lock to prevent screen from sleeping
      if ('wakeLock' in navigator) {
        // @ts-ignore - Wake Lock API is experimental
        const wakeLock = await navigator.wakeLock.request('screen');
        console.log('Wake lock activated for emergency mode');
      }

      // Reduce background operations
      // Disable non-essential animations
      document.body.classList.add('emergency-mode');

      // Set lower refresh rate for map updates
      localStorage.setItem('map_refresh_rate', '10000'); // 10 seconds

      return true;
    } catch (error) {
      console.error('Battery optimization failed:', error);
      return false;
    }
  }, []);

  // Auto-activate emergency mode on startup if previously activated
  useEffect(() => {
    const wasEmergencyMode = localStorage.getItem('emergency_mode') === 'true';
    const lastActivated = localStorage.getItem('emergency_activated');

    if (wasEmergencyMode && lastActivated) {
      const activatedTime = parseInt(lastActivated);
      const hoursSinceActivation = (Date.now() - activatedTime) / (1000 * 60 * 60);

      // Auto-reactivate if within 24 hours
      if (hoursSinceActivation < 24) {
        activateEmergencyMode();
      } else {
        // Clear old emergency mode
        localStorage.removeItem('emergency_mode');
        localStorage.removeItem('emergency_activated');
      }
    }
  }, [activateEmergencyMode]);

  // Monitor network status
  useEffect(() => {
    if (emergencyState.isActive && !emergencyState.isInitializing) {
      if (backend) {
        setEmergencyState(prev => ({
          ...prev,
          networkStatus: 'connected',
          autoConnected: true,
        }));
      } else if (!discovering) {
        setEmergencyState(prev => ({
          ...prev,
          networkStatus: 'offline',
        }));
      }
    }
  }, [backend, discovering, emergencyState.isActive, emergencyState.isInitializing]);

  // Get emergency status summary
  const getEmergencyStatus = useCallback(() => {
    if (!emergencyState.isActive) {
      return 'Standby - Ready for emergency activation';
    }

    if (emergencyState.isInitializing) {
      return 'Initializing emergency mode...';
    }

    const statusParts = [];
    if (emergencyState.networkStatus === 'connected') {
      statusParts.push('Network Connected');
    } else if (emergencyState.networkStatus === 'offline') {
      statusParts.push('Offline Mode');
    }

    if (emergencyState.batteryOptimized) {
      statusParts.push('Battery Optimized');
    }

    if (emergencyState.simplifiedUI) {
      statusParts.push('Emergency UI Active');
    }

    return statusParts.join(' • ') || 'Emergency Mode Active';
  }, [emergencyState]);

  return {
    emergencyState,
    activateEmergencyMode,
    deactivateEmergencyMode,
    getEmergencyStatus,
    isEmergencyReady: !emergencyState.isActive && !emergencyState.isInitializing,
  };
}
