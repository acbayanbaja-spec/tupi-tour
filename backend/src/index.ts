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
import { authRouter } from "./routesAuth.js";
import { api } from "./routesApi.js";
import { initDb, store } from "./store.js";

const log = pino({ transport: config.nodeEnv === "development" ? { target: "pino-pretty" } : undefined });

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
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

app.get(["/health", "/api/health"], (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "tupi-tour-api",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    database: store.isUsingPostgres() ? "supabase-postgres" : "local-json",
  });
});

app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use("/uploads", express.static(path.resolve(config.uploadDir)));
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 180,
    standardHeaders: true,
    legacyHeaders: false,
  })
);
app.use(optionalAuth);
app.use((req, _res, next) => {
  log.info({ method: req.method, url: req.url });
  next();
});

app.use("/api/auth", authRouter);
app.use("/api", api);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

initDb().then(() => {
  app.listen(config.port, "0.0.0.0", () => log.info(`Tupi API on ${config.port}`));
});
