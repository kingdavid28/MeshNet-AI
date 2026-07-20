// Centralised environment helpers for MeshNet AI.
// These read Vite env vars at build/runtime and avoid scattering
// hardcoded defaults across services and components.

export function getApiBase(): string {
  const env = import.meta.env.VITE_API_BASE_URL;
  if (typeof env === "string" && env) return env;
  return "http://localhost:4000";
}

export function getMeshSecret(): string {
  const env = import.meta.env.VITE_MESH_SECRET;
  if (typeof env === "string" && env) return env;
  return "";
}
