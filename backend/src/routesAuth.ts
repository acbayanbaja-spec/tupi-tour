import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { type Request, type Response, Router } from "express";
import { z } from "zod";
import { requireAuth, signAccess, signRefresh, type AuthedRequest } from "./auth.js";
import { config } from "./config.js";
import { hashToken, store } from "./store.js";

export const authRouter = Router();

authRouter.post("/register", async (req: Request, res: Response) => {
  const parsed = z
    .object({
      email: z.string().email(),
      password: z.string().min(8),
      name: z.string().min(2),
      role: z.enum(["tourist", "owner"]).default("tourist"),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Check your name, email, and password (8+ characters)." });
  if (store.findUserByEmail(parsed.data.email)) return res.status(409).json({ error: "An account with that email already exists." });
  const user = store.createUser({
    email: parsed.data.email,
    passwordHash: await bcrypt.hash(parsed.data.password, 12),
    name: parsed.data.name,
    role: parsed.data.role,
  });
  store.notify(user.id, "Welcome to Tupi", "Start with Explore or the AI trip planner.", "system");
  store.audit(user.id, "register", { role: user.role });
  const tokens = issue(user.id);
  res.status(201).json({ user: store.publicUser(user), ...tokens });
});

authRouter.post("/login", async (req: Request, res: Response) => {
  const parsed = z.object({ email: z.string().email(), password: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Email and password are required." });
  const user = store.findUserByEmail(parsed.data.email);
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return res.status(401).json({ error: "Those credentials do not match our records." });
  }
  store.audit(user.id, "login", {});
  res.json({ user: store.publicUser(user), ...issue(user.id) });
});

authRouter.post("/refresh", (req: Request, res: Response) => {
  const token = String(req.body?.refreshToken || "");
  const row = store.findRefresh(hashToken(token));
  if (!row || new Date(row.expiresAt) < new Date()) return res.status(401).json({ error: "Session expired. Please sign in again." });
  const user = store.findUserById(row.userId);
  if (!user) return res.status(401).json({ error: "Session expired. Please sign in again." });
  store.revokeRefresh(hashToken(token));
  res.json({ user: store.publicUser(user), ...issue(user.id) });
});

authRouter.post("/logout", requireAuth, (req: AuthedRequest, res: Response) => {
  const token = String(req.body?.refreshToken || "");
  if (token) store.revokeRefresh(hashToken(token));
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req: AuthedRequest, res: Response) => {
  const user = store.findUserById(req.user!.id);
  res.json({ user: user ? store.publicUser(user) : null });
});

authRouter.post("/forgot-password", (req: Request, res: Response) => {
  const email = String(req.body?.email || "");
  const user = store.findUserByEmail(email);
  if (!user) return res.json({ ok: true });
  const token = randomBytes(24).toString("hex");
  store.saveReset(user.id, hashToken(token), new Date(Date.now() + 1000 * 60 * 30).toISOString());
  const payload: { ok: boolean; resetToken?: string } = { ok: true };
  if (config.nodeEnv !== "production") payload.resetToken = token;
  res.json(payload);
});

authRouter.post("/reset-password", async (req: Request, res: Response) => {
  const parsed = z.object({ token: z.string(), password: z.string().min(8) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Reset token and a new password are required." });
  const row = store.consumeReset(hashToken(parsed.data.token));
  if (!row) return res.status(400).json({ error: "This reset link is invalid or expired." });
  store.updateUser(row.userId, { passwordHash: await bcrypt.hash(parsed.data.password, 12) });
  res.json({ ok: true });
});

function issue(userId: string) {
  const user = store.findUserById(userId)!;
  const accessToken = signAccess(user);
  const refreshToken = signRefresh(user);
  store.saveRefresh(user.id, hashToken(refreshToken), new Date(Date.now() + 14 * 86400000).toISOString());
  return { accessToken, refreshToken, expiresIn: 20 * 60 };
}
