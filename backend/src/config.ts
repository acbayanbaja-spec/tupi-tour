import dotenv from "dotenv";
dotenv.config();

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";

const databaseUrl = process.env.DATABASE_URL || "";
const jwtSecret = process.env.JWT_SECRET || (isProduction ? "" : "dev-access-secret-change-me-local-only-32chars");
const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || (isProduction ? "" : "dev-refresh-secret-change-me-local-only-32chars");

// Phase 2.F: Secure production configuration validation
if (isProduction) {
  if (!databaseUrl) {
    console.error("FATAL: DATABASE_URL environment variable is required in production mode.");
  }
  if (!jwtSecret || jwtSecret.length < 32 || jwtSecret.includes("change-me")) {
    console.error("FATAL: JWT_SECRET must be at least 32 characters and cannot use default dev secret in production.");
    if (process.env.STRICT_SECURITY === "true") {
      process.exit(1);
    }
  }
  if (!jwtRefreshSecret || jwtRefreshSecret.length < 32 || jwtRefreshSecret.includes("change-me")) {
    console.error("FATAL: JWT_REFRESH_SECRET must be at least 32 characters and cannot use default dev secret in production.");
    if (process.env.STRICT_SECURITY === "true") {
      process.exit(1);
    }
  }
}

export const config = {
  port: Number(process.env.PORT || 4000),
  nodeEnv,
  isProduction,
  corsOrigin: (process.env.CORS_ORIGIN || "http://localhost:3000,http://127.0.0.1:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  databaseUrl,
  jwtSecret: jwtSecret || "dev-access-secret-change-me-local-only-32chars",
  jwtRefreshSecret: jwtRefreshSecret || "dev-refresh-secret-change-me-local-only-32chars",
  groqKey: process.env.GROQ_API_KEY || process.env.AI_API_KEY || "",
  geminiKey: process.env.GEMINI_API_KEY || "",
  pollinationsReferrer: process.env.POLLINATIONS_REFERRER || "tupi-tour.local",
  uploadDir: process.env.UPLOAD_DIR || "./uploads",
};
