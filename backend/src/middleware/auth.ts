import { Request, Response, NextFunction } from "express";

// Fail-fast: refuse to start if the secret is not set.
// This prevents accidental open-relay deployments.
const MESH_SECRET = process.env.MESH_SECRET;
if (!MESH_SECRET) {
  console.error(
    "[auth] FATAL: MESH_SECRET env var is not set. " +
    "Set it in config/.env before starting the server."
  );
  process.exit(1);
}

/**
 * requireMeshAuth — shared-secret guard for all node-facing endpoints.
 *
 * Clients must include the header:
 *   X-Mesh-Secret: <MESH_SECRET value>
 *
 * The /api/health endpoint is intentionally left unprotected so uptime
 * monitors can probe liveness without credentials.
 *
 * Production upgrade path: replace the shared secret with per-node
 * Ed25519 signatures (sign the request body with the device's private key,
 * verify against the registered public key).
 */
export function requireMeshAuth(req: Request, res: Response, next: NextFunction): void {
  // Primary: X-Mesh-Secret header (all standard requests)
  // Fallback: ?secret= query param — EventSource (SSE) cannot set headers, so the
  // signal stream endpoint passes the secret in the URL instead.
  const token = req.headers["x-mesh-secret"] ?? req.query["secret"];
  if (token !== MESH_SECRET) {
    res.status(401).json({ error: "Unauthorized — invalid or missing X-Mesh-Secret header" });
    return;
  }
  next();
}
