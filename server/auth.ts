import { clerkMiddleware, getAuth } from "@clerk/express";
import { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";

/**
 * Clerk-based authentication setup.
 * Replaces Passport.js local strategy and session middleware.
 */
export function setupAuth(app: Express) {
  // Apply Clerk middleware globally — parses auth state on every request
  app.use(clerkMiddleware());

  // Get current user route
  app.get("/api/user", requireAuth, async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    res.json({ clerkUserId: userId });
  });
}

/**
 * Middleware that requires a valid Clerk session.
 * Returns 401 if the request has no authenticated user.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const { userId } = getAuth(req);
  if (!userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}
