/**
 * useRouting — Layer 1: Frontend routing hook
 * src/app/hooks/useRouting.ts
 *
 * Calls the Express /api/route endpoint (Layer 3), which proxies to
 * the Python RouteEngine (Layer 2 / Layer 3 AI logic).
 *
 * Returns the computed mesh path, hop count, estimated latency,
 * and loading / error state so the dashboard can visualise it.
 *
 * Usage
 * -----
 *   const { query, result, loading, error } = useRouting();
 *   query({ source: "cmd-hq", target: "med-01", scenario: "flood" });
 */

import { useState, useCallback } from "react";
import { getApiBase } from "../../utils/env";
import { meshHeaders } from "../constants";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Scenario = "flood" | "war_zone" | "earthquake";

export interface RouteRequest {
  source:   string;
  target:   string;
  scenario: Scenario;
  max_hops?: number;
}

export interface RouteResult {
  found:               boolean;
  path:                string[];
  hops:                number;
  totalWeight:         number;
  estimatedLatencyMs:  number;
  reason:              string;
  scenario:            string;
  computedAt:          number;
}

interface UseRoutingReturn {
  result:  RouteResult | null;
  loading: boolean;
  error:   string | null;
  /** Fire a routing query; clears previous result while loading. */
  query:   (req: RouteRequest) => Promise<void>;
  /** Reset state back to idle. */
  clear:   () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRouting(): UseRoutingReturn {
  const [result,  setResult]  = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const query = useCallback(async (req: RouteRequest) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${getApiBase()}/api/route`, {
        method:  "POST",
        headers: meshHeaders(),
        body:    JSON.stringify(req),
        signal:  AbortSignal.timeout(10_000),
      });

      const data: RouteResult | { error: string } = await res.json();

      if (!res.ok) {
        const msg = (data as { error: string }).error ?? `HTTP ${res.status}`;
        setError(msg);
        return;
      }

      setResult(data as RouteResult);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, loading, error, query, clear };
}
