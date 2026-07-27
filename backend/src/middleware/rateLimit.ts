import rateLimit from "express-rate-limit";

// Prevent a single node from flooding the relay with broadcasts.
// Increased to 300 requests per minute for development with multiple devices
// In production, consider reducing this based on actual load
export const rateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — slow down broadcast rate" },
  skip: (req) => {
    // Skip rate limiting for health checks and discovery endpoints
    return req.path === '/api/health' || req.path === '/api/mesh/discover';
  },
});
