import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { store } from "./store.js";
import type { Role, User } from "./types.js";

export interface AuthedRequest extends Request {
  user?: ReturnType<typeof store.publicUser> & { role: Role; id: string };
}

export function signAccess(user: User) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: "20m" });
}

export function signRefresh(user: User) {
  return jwt.sign({ sub: user.id, typ: "refresh" }, config.jwtRefreshSecret, { expiresIn: "14d" });
}

export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : req.cookies?.access_token;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
    const user = store.findUserById(payload.sub);
    if (user) req.user = store.publicUser(user);
  } catch {
    /* unauthenticated */
  }
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  optionalAuth(req, res, () => {
    if (!req.user) return res.status(401).json({ error: "Please sign in to continue." });
    next();
  });
}

export function requireRole(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Please sign in to continue." });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "You do not have access to this area." });
    next();
  };
}
