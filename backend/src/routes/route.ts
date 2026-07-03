/**
 * route.ts — Layer 3 routing proxy
 * backend/src/routes/route.ts
 *
 * Proxies routing queries from the frontend to the Python FastAPI
 * routing service (Layer 3 → Layer 2 bridge).
 *
 * POST /api/route
 *   Body: { source, target, scenario }
 *   Returns the RouteResult from the Python engine.
 *
 * GET  /api/route/topology?scenario=earthquake
 *   Returns the weighted graph topology from the Python simulation.
 */

import { Router, Request, Response } from "express";

export const routeRouter = Router();

const PYTHON_ROUTER_URL =
  process.env.PYTHON_ROUTER_URL ?? "http://localhost:5050";

const VALID_SCENARIOS = new Set(["flood", "war_zone", "earthquake"]);

// POST /api/route — forward to Python RouteEngine
routeRouter.post("/", async (req: Request, res: Response) => {
  const { source, target, scenario = "earthquake", max_hops } = req.body as {
    source?: string;
    target?: string;
    scenario?: string;
    max_hops?: number;
  };

  if (!source || !target) {
    res.status(400).json({ error: "source and target node IDs are required" });
    return;
  }

  if (!VALID_SCENARIOS.has(scenario)) {
    res.status(422).json({
      error: `Invalid scenario '${scenario}'. Use: flood, war_zone, earthquake`,
    });
    return;
  }

  try {
    const upstream = await fetch(`${PYTHON_ROUTER_URL}/api/route`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ source, target, scenario, max_hops }),
      signal:  AbortSignal.timeout(8_000),
    });

    const data = await upstream.json();
    res.status(upstream.ok ? 200 : upstream.status).json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(503).json({
      error:  "Python routing service unreachable",
      detail: msg,
    });
  }
});

// GET /api/route/topology — weighted simulation graph
routeRouter.get("/topology", async (req: Request, res: Response) => {
  const scenario = (req.query.scenario as string | undefined) ?? "earthquake";

  if (!VALID_SCENARIOS.has(scenario)) {
    res.status(422).json({ error: `Invalid scenario '${scenario}'` });
    return;
  }

  try {
    const upstream = await fetch(
      `${PYTHON_ROUTER_URL}/api/simulation/topology?scenario=${scenario}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    const data = await upstream.json();
    res.status(upstream.ok ? 200 : upstream.status).json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(503).json({
      error:  "Python simulation service unreachable",
      detail: msg,
    });
  }
});
