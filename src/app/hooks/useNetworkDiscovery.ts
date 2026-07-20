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

  // Try common hotspot gateway IPs
  const GATEWAY_IPS = [
    '192.168.137.1', // Windows Mobile Hotspot
    '192.168.42.1',  // Android hotspot
    '10.42.0.1',     // Linux NetworkManager hotspot
    '192.168.1.1',   // Common router
    '192.168.0.1',   // Common router
  ];

  const discoverBackend = async () => {
    setDiscovering(true);
    setError(null);

    for (const ip of GATEWAY_IPS) {
      try {
        const response = await fetch(`http://${ip}:4000/api/mesh/discover`, {
          method: 'GET',
          signal: AbortSignal.timeout(2000), // 2 second timeout per IP
        });

        if (response.ok) {
          const data = await response.json();
          if (data.meshnet) {
            setBackend(data);
            setDiscovering(false);
            return data;
          }
        }
      } catch (e) {
        // Continue to next IP
        continue;
      }
    }

    setDiscovering(false);
    setError('No MeshNet backend found on local network');
    return null;
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
  };
}
