import { useState, useEffect } from 'react';

interface MeshNetBackend {
  meshnet: boolean;
  version: string;
  apiBase: string;
  webBase: string;
  capabilities: string[];
}

export function useNetworkDiscovery() {
  const [backend, setBackend] = useState<MeshNetBackend | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState<string>(() => {
    // Load manually configured URL from localStorage
    return localStorage.getItem('meshnet_backend_url') || '';
  });

  // Try common hotspot gateway IPs
  // These are standard gateway IPs for local network discovery - not security-sensitive
  const GATEWAY_IPS = [
    '192.168.137.1', // Windows Mobile Hotspot
    '192.168.42.1',  // Android hotspot
    '10.42.0.1',     // Linux NetworkManager hotspot
    '192.168.1.1',   // Common router
    '192.168.0.1',   // Common router
    '10.0.0.1',      // Another common router
  ];

  const checkBackend = async (url: string): Promise<MeshNetBackend | null> => {
    try {
      const response = await fetch(`${url}/api/mesh/discover`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000), // 3 second timeout
      });

      if (response.ok) {
        const data = await response.json();
        if (data.meshnet) {
          return data;
        }
      }
    } catch (e) {
      // Expected: network errors when backend not found, continue to next URL
    }
    return null;
  };

  const discoverBackend = async () => {
    setDiscovering(true);
    setError(null);

    // First try manually configured URL if set
    if (manualUrl) {
      const result = await checkBackend(manualUrl);
      if (result) {
        setBackend(result);
        setDiscovering(false);
        return result;
      }
    }

    // Try common gateway IPs
    for (const ip of GATEWAY_IPS) {
      const result = await checkBackend(`http://${ip}:4000`);
      if (result) {
        setBackend(result);
        setDiscovering(false);
        return result;
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

  return {
    backend,
    discovering,
    error,
    rediscover: discoverBackend,
    manualUrl,
    setManualBackendUrl,
  };
}
