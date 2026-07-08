import path from "node:path";
import dotenv from "dotenv";

// Resolve config/.env relative to the project root (works in both
// ts-node-dev dev mode and compiled dist/ production mode).
const envPath = path.resolve(process.cwd(), "config/.env");
dotenv.config({ path: envPath });

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { meshRouter, publicMeshRouter } from "./routes/mesh";
import { alertsRouter }  from "./routes/alerts";
import { messagesRouter } from "./routes/messages";
import { healthRouter }  from "./routes/health";
import { routeRouter }   from "./routes/route";
import { signalRouter }  from "./routes/signal";
import { requestLogger } from "./middleware/logger";
import { rateLimiter }   from "./middleware/rateLimit";
import { requireMeshAuth } from "./middleware/auth";
import { startEvictionJob } from "./jobs/eviction";
import { cloudantRouter }  from "./routes/cloudant";
import { db } from "./db";

const app = express();
const PORT = process.env.PORT ?? 4000;

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Restrict to known origins in production via CORS_ORIGINS env var.
// Multiple origins are comma-separated: "https://app.example.com,http://10.0.0.5:5173"
// Falls back to localhost dev server if not set — never wildcards in production.
const rawOrigins = process.env.CORS_ORIGINS ?? "http://localhost:5173,http://localhost:4173";
const allowedOrigins = rawOrigins.split(",").map((o) => o.trim()).filter(Boolean);

// Configure helmet with relaxed CSP for the join endpoint
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
    },
  },
  crossOriginOpenerPolicy: false,
  originAgentCluster: false,
}));
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no Origin header (same-origin, curl, native WebView)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin '${origin}' is not allowed`));
    }
  },
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-Mesh-Secret"],
}));
app.use(express.json({ limit: "64kb" }));
app.use(requestLogger);
app.use(rateLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────
// /api/health is intentionally unauthenticated — uptime monitors probe it.
app.use("/api/health", healthRouter);

// Public mesh endpoints — no auth required (captive portal + victim self-registration)
app.use("/api/mesh", publicMeshRouter);

// All other /api/mesh/* require a valid X-Mesh-Secret header.
app.use("/api/mesh",      requireMeshAuth, meshRouter);
app.use("/api/alerts",    requireMeshAuth, alertsRouter);
app.use("/api/messages",  requireMeshAuth, messagesRouter);
app.use("/api/route",     requireMeshAuth, routeRouter);
app.use("/api/signal",    requireMeshAuth, signalRouter);
// Cloudant proxy — key stays server-side, frontend uses this instead of Cloudant directly
app.use("/api/cloudant",  requireMeshAuth, cloudantRouter);

// ─── Background jobs ──────────────────────────────────────────────────────────
// Evict stale nodes (last_seen > 5 min) from the topology every 30 s.
startEvictionJob(db);

app.listen(PORT, () => {
  console.log(`[MeshNet] Backend running on port ${PORT}`);
  console.log(`[MeshNet] Allowed CORS origins: ${allowedOrigins.join(", ")}`);
});

export default app;
