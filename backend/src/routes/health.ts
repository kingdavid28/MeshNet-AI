import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    status: "ok",
    nodeId: process.env.NODE_ID ?? "unknown",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
