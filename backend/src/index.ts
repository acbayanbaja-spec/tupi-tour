import { randomUUID } from "crypto";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import path from "path";
import pino from "pino";
import { optionalAuth } from "./auth.js";
import { config } from "./config.js";
import { checkDbReadiness, closePool } from "./db/pool.js";
import { api } from "./routesApi.js";
import { authRouter } from "./routesAuth.js";
import { initDb, store } from "./store.js";

const log = pino({
  transport: config.nodeEnv === "development" ? { target: "pino-pretty" } : undefined,
});

const app = express();
app.set("trust proxy", 1);

app.use(
  cors({
    origin: (requestOrigin, callback) => {
      if (!requestOrigin) return callback(null, true);
      const allowedOrigins = Array.isArray(config.corsOrigin) ? config.corsOrigin : [config.corsOrigin];
      const isAllowed =
        allowedOrigins.includes(requestOrigin) ||
        allowedOrigins.includes("*") ||
        /^https:\/\/.*\.vercel\.app$/.test(requestOrigin) ||
        /^https:\/\/.*\.onrender\.com$/.test(requestOrigin) ||
        /^http:\/\/localhost(:\d+)?$/.test(requestOrigin) ||
        /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(requestOrigin);
      callback(null, isAllowed ? requestOrigin : true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Request-Id", "X-Idempotency-Key"],
  })
);

// Request Correlation ID Middleware (Feature 10)
app.use((req, res, next) => {
  const reqId = (req.headers["x-request-id"] as string) || randomUUID();
  res.setHeader("X-Request-Id", reqId);
  (req as any).id = reqId;
  next();
});

// Process Liveness Check (Phase 2.E)
app.get(["/health", "/api/health"], (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "tupi-tour-api",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Database Readiness Check (Phase 2.E: Verifies PostgreSQL Connectivity)
app.get(["/ready", "/api/ready"], async (_req, res) => {
  const readiness = await checkDbReadiness();
  if (!readiness.ready) {
    return res.status(503).json({
      status: "unready",
      database: readiness.mode,
      error: readiness.error || "PostgreSQL probe failed",
      timestamp: new Date().toISOString(),
    });
  }
  res.status(200).json({
    status: "ready",
    database: readiness.mode,
    latencyMs: readiness.latencyMs,
    storage: store.isUsingPostgres() ? "postgresql-authoritative" : "isolated-dev-fallback",
    timestamp: new Date().toISOString(),
  });
});

app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use("/uploads", express.static(path.resolve(config.uploadDir)));

// Rate Limiting
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 200,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use(optionalAuth);

// Structured Request Logging (Feature 10)
app.use((req, _res, next) => {
  log.info({ reqId: (req as any).id, method: req.method, url: req.url });
  next();
});

app.use("/api/auth", authRouter);
app.use("/api", api);

// Safe Error Handling without Exposing Creds or Stack Traces (Feature 10 & Phase 2.F)
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log.error({ error: err.message, stack: config.nodeEnv === "development" ? err.stack : undefined });
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

let server: any = null;

initDb()
  .then(() => {
    server = app.listen(config.port, "0.0.0.0", () => {
      log.info(`Tupi Tour API listening on port ${config.port} (${config.nodeEnv} mode)`);
    });
  })
  .catch((err) => {
    log.error("Failed to initialize database:", err);
    process.exit(1);
  });

// Graceful Shutdown
function gracefulShutdown(signal: string) {
  log.info(`Received ${signal}. Shutting down gracefully...`);
  if (server) {
    server.close(async () => {
      log.info("HTTP server closed.");
      await closePool();
      log.info("PostgreSQL pool closed.");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
