import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { type Request, type Response, Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAuth, signAccess, signRefresh, type AuthedRequest } from "./auth.js";
import { config } from "./config.js";
import { hashToken, store } from "./store.js";

export const authRouter = Router();

// Phase 2.F: Dedicated rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 25, // 25 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Please try again after 15 minutes." },
});

async function issue(userId: string) {
  const user = await store.findUserById(userId);
  if (!user) throw new Error("User not found");
  const accessToken = signAccess(user);
  const refreshToken = signRefresh(user);
  await store.saveRefresh(user.id, hashToken(refreshToken), new Date(Date.now() + 14 * 86400000).toISOString());
  return { accessToken, refreshToken, expiresIn: 20 * 60 };
}

authRouter.post("/register", authLimiter, async (req: Request, res: Response) => {
  const parsed = z
    .object({
      email: z.string().email(),
      password: z.string().min(8),
      name: z.string().min(2),
      role: z.enum(["tourist", "owner"]).default("tourist"),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Check your name, email, and password (8+ characters)." });

  const existing = await store.findUserByEmail(parsed.data.email);
  if (existing) return res.status(409).json({ error: "An account with that email already exists." });

  const user = await store.createUser({
    email: parsed.data.email,
    passwordHash: await bcrypt.hash(parsed.data.password, 12),
    name: parsed.data.name,
    role: parsed.data.role,
  });

  await store.notify(user.id, "Welcome to Tupi", "Start with Explore, Map, or the AI trip planner.", "system");
  await store.audit(user.id, "register", { role: user.role });
  const tokens = await issue(user.id);
  res.status(201).json({ user: store.publicUser(user), ...tokens });
});

authRouter.post("/login", authLimiter, async (req: Request, res: Response) => {
  const parsed = z.object({ email: z.string().email(), password: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Email and password are required." });

  const user = await store.findUserByEmail(parsed.data.email);
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return res.status(401).json({ error: "Those credentials do not match our records." });
  }

  await store.audit(user.id, "login", {});
  const tokens = await issue(user.id);
  res.json({ user: store.publicUser(user), ...tokens });
});

authRouter.post("/refresh", async (req: Request, res: Response) => {
  const token = String(req.body?.refreshToken || "");
  if (!token) return res.status(401).json({ error: "Refresh token is required." });

  const row = await store.findRefresh(hashToken(token));
  if (!row || new Date(row.expires_at || row.expiresAt) < new Date()) {
    return res.status(401).json({ error: "Session expired. Please sign in again." });
  }

  const userId = row.user_id || row.userId;
  const user = await store.findUserById(userId);
  if (!user) return res.status(401).json({ error: "Session expired. Please sign in again." });

  await store.revokeRefresh(hashToken(token));
  const tokens = await issue(user.id);
  res.json({ user: store.publicUser(user), ...tokens });
});

authRouter.post("/logout", requireAuth, async (req: AuthedRequest, res: Response) => {
  const token = String(req.body?.refreshToken || "");
  if (token) await store.revokeRefresh(hashToken(token));
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req: AuthedRequest, res: Response) => {
  const user = await store.findUserById(req.user!.id);
  res.json({ user: user ? store.publicUser(user) : null });
});

authRouter.post("/forgot-password", authLimiter, async (req: Request, res: Response) => {
  const email = String(req.body?.email || "");
  const user = await store.findUserByEmail(email);
  if (!user) return res.json({ ok: true });

  const token = randomBytes(24).toString("hex");
  await store.saveReset(user.id, hashToken(token), new Date(Date.now() + 1000 * 60 * 30).toISOString());
  const payload: { ok: boolean; resetToken?: string } = { ok: true };
  if (config.nodeEnv !== "production") payload.resetToken = token;
  res.json(payload);
});

authRouter.post("/reset-password", authLimiter, async (req: Request, res: Response) => {
  const parsed = z.object({ token: z.string(), password: z.string().min(8) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Reset token and a new password are required." });

  const row = await store.consumeReset(hashToken(parsed.data.token));
  if (!row) return res.status(400).json({ error: "This reset link is invalid or expired." });

  const userId = row.user_id || row.userId;
  await store.updateUser(userId, { passwordHash: await bcrypt.hash(parsed.data.password, 12) });
  res.json({ ok: true });
});
