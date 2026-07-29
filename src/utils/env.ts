// Centralised environment helpers for MeshNet AI.
// These read Vite env vars at build/runtime and avoid scattering
// hardcoded defaults across services and components.

export function getApiBase(): string {
  const env = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";

  // On native mobile, return empty string for pure P2P mode unless backend is explicitly configured
  if (typeof window !== "undefined" && "capacitor" in window) {
    console.log('[env] Native platform detected, checking for backend config');
    // Only return a backend URL if explicitly configured in env or storage
    if (typeof env === "string" && env && env !== "http://localhost:4000" && env !== "http://127.0.0.1:4000") {
      console.log('[env] Using configured backend URL:', env);
      return env;
    }
    const stored = localStorage.getItem("meshnet_backend_url");
    if (stored && stored !== "http://localhost:4000" && stored !== "http://127.0.0.1:4000") {
      console.log('[env] Using stored backend URL:', stored);
      return stored;
    }
    console.log('[env] No valid backend configured, using empty string for P2P mode');
    return "";
  }

  // If the configured backend URL is on a real hostname, or the page itself is
  // served from localhost, trust the configured value directly.
  if (typeof env === "string" && env) {
    try {
      const url = new URL(env);
      const envLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
      const pageLoopback = hostname === "localhost" || hostname === "127.0.0.1";
      if (!envLoopback || pageLoopback) return env;
      // Hotspot/LAN client: rewrite loopback backend URL to the page's hostname
      // so the device reaches the host's Python backend (e.g., 192.168.137.1:5050).
      url.hostname = hostname;
      return url.toString();
    } catch {
      // ignore malformed env value
    }
  }

  // Use a manually saved backend URL if one exists.
  const stored = typeof window !== "undefined" ? localStorage.getItem("meshnet_backend_url") : null;
  if (stored) {
    try {
      const url = new URL(stored);
      // Clear any stored URL pointing to port 5050 (Python backend) - force port 4000 for hotspot
      if (url.port === "5050") {
        console.log('[env] Clearing stored Python backend URL (5050), switching to Node backend (4000)');
        localStorage.removeItem("meshnet_backend_url");
      } else {
        // Rewrite a loopback stored URL to the current serving hostname so
        // hotspot/LAN clients reach the host.
        if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
          url.hostname = hostname || url.hostname;
        }
        return url.toString();
      }
    } catch {
      // ignore malformed stored URL
    }
  }

  // Fall back to the serving hostname with the Node.js Express backend port.
  if (hostname) return `http://${hostname}:4000`;
  return "http://localhost:4000";
}

export function getMeshSecret(): string {
  const env = import.meta.env.VITE_MESH_SECRET;
  if (typeof env === "string" && env) return env;
  return "";
}
