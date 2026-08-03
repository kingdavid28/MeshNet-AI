/**
 * Backend Auto-Discovery Utility
 * Automatically detects MeshNet backend server on local network
 * Uses multiple strategies: mDNS, common gateway IPs, and network scanning
 */

export interface BackendDiscoveryResult {
  found: boolean;
  url: string;
  method: 'mdns' | 'gateway' | 'scan' | 'cached' | 'manual';
  latency?: number;
}

// Common gateway/hotspot IPs to try
// These are standard private network IPs used by routers and hotspots
// Safe to scan as they're within private IP ranges (RFC 1918)
const COMMON_GATEWAY_IPS = [
  '192.168.137.1',  // Windows Mobile Hotspot
  '192.168.43.1',   // Android Hotspot
  '192.168.1.1',    // Common router
  '192.168.0.1',    // Common router
  '192.168.1.100',  // Common backend server
  '192.168.0.100',  // Common backend server
  '10.0.0.1',       // Common router
  '10.0.0.100',     // Common backend server
];

const BACKEND_PORT = 4000;
const DISCOVERY_TIMEOUT = 5000; // 5 seconds

/**
 * Check if a backend is available at the given URL
 */
async function checkBackend(url: string): Promise<{ available: boolean; latency: number }> {
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout per check
    
    const response = await fetch(`${url}/api/health`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-cache'
    });
    
    clearTimeout(timeoutId);
    const latency = performance.now() - start;
    
    if (response.ok) {
      return { available: true, latency };
    }
    return { available: false, latency };
  } catch (error) {
    // Network errors are expected during discovery - return unavailable
    console.log(`[BackendDiscovery] Backend check failed for ${url}:`, error);
    return { available: false, latency: performance.now() - start };
  }
}

/**
 * Try common gateway IPs
 */
async function discoverViaGateway(): Promise<BackendDiscoveryResult> {
  console.log('[BackendDiscovery] Scanning common gateway IPs...');
  
  // Check all common IPs in parallel
  const checks = COMMON_GATEWAY_IPS.map(async (ip) => {
    const url = `http://${ip}:${BACKEND_PORT}`;
    const result = await checkBackend(url);
    return { url, ...result };
  });
  
  const results = await Promise.all(checks);
  
  // Find the first available backend with lowest latency
  const available = results
    .filter(r => r.available)
    .sort((a, b) => a.latency - b.latency);
  
  if (available.length > 0) {
    const best = available[0];
    console.log(`[BackendDiscovery] Found backend via gateway scan: ${best.url} (${best.latency.toFixed(0)}ms)`);
    return {
      found: true,
      url: best.url,
      method: 'gateway',
      latency: best.latency
    };
  }
  
  console.log('[BackendDiscovery] No backend found via gateway scan');
  return { found: false, url: '', method: 'gateway' };
}

/**
 * Scan local network for backend (subnet scan)
 * Note: This is limited by browser security - can only try common IPs
 */
async function discoverViaScan(): Promise<BackendDiscoveryResult> {
  console.log('[BackendDiscovery] Scanning local network for backend...');
  
  // Get current network info from window.location
  const hostname = window.location.hostname;
  
  // If we're connected to a network, try to scan the subnet
  if (hostname && !hostname.includes('localhost') && !hostname.includes('127.0.0.1')) {
    // Extract the first 3 octets to scan the subnet
    const parts = hostname.split('.');
    if (parts.length === 4) {
      const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
      
      // Scan common server IPs in the subnet (1-10, 100-110)
      const scanIPs = [];
      for (let i = 1; i <= 10; i++) scanIPs.push(`${subnet}.${i}`);
      for (let i = 100; i <= 110; i++) scanIPs.push(`${subnet}.${i}`);
      
      // Remove duplicates with common gateways
      const uniqueIPs = [...new Set([...scanIPs, ...COMMON_GATEWAY_IPS])];
      
      const checks = uniqueIPs.map(async (ip) => {
        const url = `http://${ip}:${BACKEND_PORT}`;
        const result = await checkBackend(url);
        return { url, ...result };
      });
      
      const results = await Promise.all(checks);
      const available = results
        .filter(r => r.available)
        .sort((a, b) => a.latency - b.latency);
      
      if (available.length > 0) {
        const best = available[0];
        console.log(`[BackendDiscovery] Found backend via network scan: ${best.url} (${best.latency.toFixed(0)}ms)`);
        return {
          found: true,
          url: best.url,
          method: 'scan',
          latency: best.latency
        };
      }
    }
  }
  
  console.log('[BackendDiscovery] No backend found via network scan');
  return { found: false, url: '', method: 'scan' };
}

/**
 * Check cached backend URL
 */
async function discoverViaCache(): Promise<BackendDiscoveryResult> {
  const cached = localStorage.getItem('meshnet_backend_url');
  if (cached && cached !== 'http://localhost:4000' && cached !== 'http://127.0.0.1:4000') {
    console.log('[BackendDiscovery] Checking cached backend URL:', cached);
    const result = await checkBackend(cached);
    if (result.available) {
      console.log(`[BackendDiscovery] Cached backend available: ${cached} (${result.latency.toFixed(0)}ms)`);
      return {
        found: true,
        url: cached,
        method: 'cached',
        latency: result.latency
      };
    }
    console.log('[BackendDiscovery] Cached backend not available, clearing cache');
    localStorage.removeItem('meshnet_backend_url');
  }
  return { found: false, url: '', method: 'cached' };
}

/**
 * Main auto-discovery function
 * Tries multiple strategies in order of preference
 */
export async function autoDiscoverBackend(): Promise<BackendDiscoveryResult> {
  console.log('[BackendDiscovery] Starting auto-discovery...');
  
  // Strategy 1: Check cached URL first (fastest)
  const cachedResult = await discoverViaCache();
  if (cachedResult.found) {
    return cachedResult;
  }
  
  // Strategy 2: Try common gateway IPs (fast)
  const gatewayResult = await discoverViaGateway();
  if (gatewayResult.found) {
    // Cache the successful discovery
    localStorage.setItem('meshnet_backend_url', gatewayResult.url);
    return gatewayResult;
  }
  
  // Strategy 3: Network scan (slower but more thorough)
  const scanResult = await discoverViaScan();
  if (scanResult.found) {
    // Cache the successful discovery
    localStorage.setItem('meshnet_backend_url', scanResult.url);
    return scanResult;
  }
  
  console.log('[BackendDiscovery] Auto-discovery failed, no backend found');
  return { found: false, url: '', method: 'manual' };
}

/**
 * Simple backend check without full discovery
 */
export async function checkBackendAvailability(url: string): Promise<boolean> {
  const result = await checkBackend(url);
  return result.available;
}

/**
 * Get the best available backend URL
 * Returns auto-discovered URL, cached URL, or empty string for P2P mode
 */
export async function getBestBackendUrl(): Promise<string> {
  // First try auto-discovery
  const discovered = await autoDiscoverBackend();
  if (discovered.found) {
    return discovered.url;
  }
  
  // Fall back to cached or manual configuration
  const cached = localStorage.getItem('meshnet_backend_url');
  if (cached && cached !== 'http://localhost:4000' && cached !== 'http://127.0.0.1:4000') {
    return cached;
  }
  
  // Return empty string for pure P2P mode
  return '';
}
