/**
 * cloudant.ts — Server-side Cloudant proxy route
 * backend/src/routes/cloudant.ts
 *
 * SEC-1 fix: the CLOUDANT_API_KEY and CLOUDANT_URL live exclusively in the
 * backend's config/.env. The frontend calls GET /api/cloudant/nodes instead
 * of talking to Cloudant directly — so the key is never shipped to the browser.
 *
 * GET /api/cloudant/nodes
 *   Returns the full mesh-nodes document list from the configured Cloudant DB,
 *   already shaped into the CloudantNode schema expected by useCloudantNodes.
 *   Falls back to an empty array with a 503 if Cloudant is not configured.
 */

import { Router, Request, Response } from "express";

export const cloudantRouter = Router();

const CLOUDANT_URL = process.env.CLOUDANT_URL ?? "";
const CLOUDANT_KEY = process.env.CLOUDANT_API_KEY ?? "";
const CLOUDANT_DB  = process.env.CLOUDANT_DB ?? "mesh_nodes_db";

function deriveProtocol(ble: boolean, wifi: boolean): string {
  if (ble && wifi) return "both";
  if (ble)         return "bluetooth";
  if (wifi)        return "wifi";
  return "none";
}

cloudantRouter.get("/nodes", async (_req: Request, res: Response) => {
  // If Cloudant is not configured, return empty nodes with 200 so frontend falls back silently
  if (!CLOUDANT_URL || CLOUDANT_URL.includes("<") || !CLOUDANT_KEY || CLOUDANT_KEY.includes("<")) {
    res.json({ nodes: [] });
    return;
  }

  try {
    const upstream = await fetch(
      `${CLOUDANT_URL}/${CLOUDANT_DB}/_all_docs?include_docs=true`,
      {
        headers: {
          Authorization: `Bearer ${CLOUDANT_KEY}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!upstream.ok) {
      res.status(upstream.status).json({
        error: `Cloudant HTTP ${upstream.status}: ${upstream.statusText}`,
        nodes: [],
      });
      return;
    }

    const data = await upstream.json() as {
      rows: Array<{ doc: Record<string, unknown> }>;
    };

    const nodes = data.rows
      .map((r) => r.doc)
      .filter((doc) => doc && !String(doc._id ?? "").startsWith("_design"))
      .map((doc) => {
        const ble  = Boolean(doc.bluetooth_status ?? false);
        const wifi = Boolean(doc.wifi_status       ?? false);
        return {
          node_id:            String(doc.node_id ?? doc._id ?? "unknown"),
          label:              String(doc.label ?? doc.node_id ?? "Node"),
          latitude:           Number(doc.latitude  ?? 0),
          longitude:          Number(doc.longitude ?? 0),
          battery_percentage: Number(doc.battery_percentage ?? 80),
          bluetooth_status:   ble,
          wifi_status:        wifi,
          protocol_active:    deriveProtocol(ble, wifi),
          signal:             Number(doc.signal ?? 80),
          device:             (doc.device as string) ?? "smartphone",
          role:               (doc.role   as string) ?? "peer",
          last_seen:          String(doc.last_seen ?? new Date().toISOString()),
        };
      });

    res.json({ nodes });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ error: `Cloudant proxy error: ${msg}`, nodes: [] });
  }
});
