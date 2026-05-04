import bcrypt from "bcryptjs";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

const DEMO_EMAIL = "demo@leoprompt.local";
const DEMO_PASSWORD = "password123";
const isDemoMode = () => !process.env.DATABASE_URL;

async function ensureDemoUser() {
  let user = await db.getUserByEmail(DEMO_EMAIL);
  if (user) return user;

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  await db.createUserWithPassword({
    email: DEMO_EMAIL,
    name: "Demo User",
    passwordHash,
  });
  user = await db.getUserByEmail(DEMO_EMAIL);
  if (!user) throw new Error("Failed to create demo user");
  return user;
}

export function registerOAuthRoutes(app: Express) {
  // Sign up
  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    try {
      const { email, password, name } = req.body;
      if (!email || !password || !name) {
        return res
          .status(400)
          .json({ error: "email, password, and name are required" });
      }
      if (password.length < 8) {
        return res
          .status(400)
          .json({ error: "Password must be at least 8 characters" });
      }
      const existing = await db.getUserByEmail(email);
      if (existing) {
        return res
          .status(409)
          .json({ error: "An account with this email already exists" });
      }
      const passwordHash = await bcrypt.hash(password, 12);
      await db.createUserWithPassword({ email, name, passwordHash });
      const user = await db.getUserByEmail(email);
      if (!user)
        return res.status(500).json({ error: "Failed to create account" });

      const token = await sdk.createSessionToken(
        String(user.id),
        user.email ?? "",
        {
          expiresInMs: ONE_YEAR_MS,
        }
      );
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({ success: true, demoMode: !process.env.DATABASE_URL });
    } catch (error) {
      console.error("[Auth] Signup failed:", error);
      res.status(500).json({ error: "Signup failed" });
    }
  });

  // Sign in
  app.post("/api/auth/signin", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res
          .status(400)
          .json({ error: "email and password are required" });
      }
      let user = await db.getUserByEmail(email);
      if (isDemoMode() && email === DEMO_EMAIL && password === DEMO_PASSWORD) {
        user = await ensureDemoUser();
      }

      if (!user || !user.passwordHash) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      const valid =
        isDemoMode() && email === DEMO_EMAIL && password === DEMO_PASSWORD
          ? true
          : await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      const token = await sdk.createSessionToken(
        String(user.id),
        user.email ?? "",
        {
          expiresInMs: ONE_YEAR_MS,
        }
      );
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({ success: true });
    } catch (error) {
      console.error("[Auth] Signin failed:", error);
      res.status(500).json({ error: "Signin failed" });
    }
  });

  // Sign out
  app.post("/api/auth/signout", (req: Request, res: Response) => {
    res.clearCookie(COOKIE_NAME);
    res.json({ success: true });
  });
}
