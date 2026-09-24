import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || "development",
  corsOrigin: (process.env.CORS_ORIGIN || "http://localhost:3000,http://127.0.0.1:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  databaseUrl: process.env.DATABASE_URL || "",
  jwtSecret: process.env.JWT_SECRET || "dev-access-secret-change-me",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "dev-refresh-secret-change-me",
  groqKey: process.env.GROQ_API_KEY || process.env.AI_API_KEY || "",
  geminiKey: process.env.GEMINI_API_KEY || "",
  pollinationsReferrer: process.env.POLLINATIONS_REFERRER || "tupi-tour.local",
  uploadDir: process.env.UPLOAD_DIR || "./uploads",
};
