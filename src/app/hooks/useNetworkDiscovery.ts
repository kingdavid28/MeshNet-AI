import { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';

interface MeshNetBackend {
  meshnet: boolean;
  version: string;
  apiBase: string;
  webBase: string;
  capabilities: string[];
  signal_strength?: number;
  latency?: number;
}

interface ConnectionPriority {
  type: 'manual' | 'hotspot' | 'router' | 'dev';
  ips: string[];
  priority: number;
  description: string;
}

export function useNetworkDiscovery() {
  const [backend, setBackend] = useState<MeshNetBackend | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState<string>(() => {
    // Load manually configured URL from localStorage
    return localStorage.getItem('meshnet_backend_url') || '';
  });
  const [connectionHealth, setConnectionHealth] = useState<'excellent' | 'good' | 'fair' | 'poor' | 'unknown'>('unknown');
  const [lastConnectionTime, setLastConnectionTime] = useState<number | null>(null);

  // Prevent repeated emergency-mode discovery attempts when no backend exists
  const emergencyDiscoveryTriggered = useRef(false);

  // Emergency-optimized connection priority queue
  const CONNECTION_PRIORITY: ConnectionPriority[] = [
    {
      type: 'manual',
      ips: [],
      priority: 1,
      description: 'User-configured backend'
    },
    {
      type: 'hotspot',
      ips: ['192.168.137.1', '192.168.42.1'],
      priority: 2,
      description: 'Direct hotspot connections (most reliable for emergencies)'
    },
    {
      type: 'router',
      ips: ['192.168.1.1', '192.168.0.1', '10.0.0.1'],
      priority: 3,
      description: 'Local network router/gateway'
    },
    {
      type: 'dev',
      ips: ['localhost', '127.0.0.1'],
      priority: 4,
      description: 'Development backend (skipped in emergency mode)'
    }
  ];

  const checkBackend = async (url: string, emergencyMode: boolean = false): Promise<MeshNetBackend | null> => {
    try {
      // Faster timeout in emergency mode for quicker fallback
      const timeout = emergencyMode ? 1500 : 3000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const startTime = performance.now();
      const response = await fetch(`${url}/api/mesh/discover`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data.meshnet) {
          // Calculate latency and add to backend info
          const latency = Math.round(performance.now() - startTime);
          return {
            ...data,
            latency,
            signal_strength: calculateSignalStrength(latency)
          };
        }
      }
    } catch (e) {
      // Expected: network errors when backend not found, continue to next URL
    }
    return null;
  };

  // Calculate signal strength based on latency
  const calculateSignalStrength = (latency: number): number => {
    if (latency < 50) return 100;
    if (latency < 100) return 90;
    if (latency < 200) return 75;
    if (latency < 500) return 50;
    return 25;
  };

  // Update connection health based on backend status
  const updateConnectionHealth = (backend: MeshNetBackend | null) => {
    if (!backend) {
      setConnectionHealth('unknown');
      return;
    }

    if (backend.signal_strength && backend.latency) {
      if (backend.signal_strength >= 90 && backend.latency < 100) {
        setConnectionHealth('excellent');
      } else if (backend.signal_strength >= 75 && backend.latency < 200) {
        setConnectionHealth('good');
      } else if (backend.signal_strength >= 50 && backend.latency < 500) {
        setConnectionHealth('fair');
      } else {
        setConnectionHealth('poor');
      }
    }
  };

  const discoverBackend = async () => {
    setDiscovering(true);
    setError(null);
    
    const emergencyMode = localStorage.getItem('emergency_mode') === 'true';

    // Process connection priority queue
    for (const priority of (import.meta.env.DEV
      ? [CONNECTION_PRIORITY[0], CONNECTION_PRIORITY[3], CONNECTION_PRIORITY[1], CONNECTION_PRIORITY[2]]
      : CONNECTION_PRIORITY)) {
      // Skip development IPs in emergency mode or on native (loopback is the device itself)
      if ((emergencyMode || Capacitor.isNativePlatform()) && priority.type === 'dev') {
        console.log(emergencyMode ? 'Emergency mode: skipping development IPs' : 'Native platform: skipping loopback development IPs');
        continue;
      }

      if (priority.type === 'manual' && manualUrl) {
        console.log(`Trying manual configuration: ${manualUrl}`);
        const result = await checkBackend(manualUrl, emergencyMode);
        if (result) {
          setBackend(result);
          setDiscovering(false);
          updateConnectionHealth(result);
          setLastConnectionTime(Date.now());
          console.log(`Connected via manual: ${priority.description}`);
          return result;
        }
      } else if (priority.type !== 'manual') {
        for (const ip of priority.ips) {
          console.log(`Trying ${priority.type} IP: ${ip} (${priority.description})`);
          const result = await checkBackend(`http://${ip}:4000`, emergencyMode);
          if (result) {
            setBackend(result);
            setDiscovering(false);
            updateConnectionHealth(result);
            setLastConnectionTime(Date.now());
            console.log(`Connected via ${priority.type}: ${priority.description}`);
            return result;
          }
        }
      }
    }

    setDiscovering(false);
    setError('No MeshNet backend found. Configure manually or ensure backend is running on the same network.');
    return null;
  };

  const setManualBackendUrl = (url: string) => {
    setManualUrl(url);
    if (url) {
      localStorage.setItem('meshnet_backend_url', url);
    } else {
      localStorage.removeItem('meshnet_backend_url');
    }
  };

  // Auto-discover on mount
  useEffect(() => {
    discoverBackend();
  }, []);

  // Auto-discover once when emergency mode is activated
  useEffect(() => {
    const emergencyMode = localStorage.getItem('emergency_mode') === 'true';
    if (emergencyMode && !backend && !discovering && !emergencyDiscoveryTriggered.current) {
      emergencyDiscoveryTriggered.current = true;
      console.log('Emergency mode detected - auto-discovering network');
      discoverBackend();
    }
  }, [backend, discovering]);

  // Periodic connection health monitoring
  useEffect(() => {
    if (!backend) return;

    const healthCheckInterval = setInterval(async () => {
      const emergencyMode = localStorage.getItem('emergency_mode') === 'true';
      const checkInterval = emergencyMode ? 30000 : 60000; // 30s emergency, 60s normal

      // Re-check current connection health
      const currentUrl = backend.apiBase;
      const healthCheck = await checkBackend(currentUrl, emergencyMode);
      
      if (healthCheck) {
        updateConnectionHealth(healthCheck);
        setLastConnectionTime(Date.now());
      } else {
        // Connection lost, try to rediscover
        console.log('Connection lost, attempting rediscovery');
        discoverBackend();
      }
    }, 60000); // Check every 60 seconds

    return () => clearInterval(healthCheckInterval);
  }, [backend]);

  return {
    backend,
    discovering,
    error,
    rediscover: discoverBackend,
    manualUrl,
    setManualBackendUrl,
    connectionHealth,
    lastConnectionTime,
  };
}
