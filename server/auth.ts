import { clerkMiddleware, getAuth } from "@clerk/express";
import { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { clerkClient } from "./clerkAdmin";
import type { User } from "@shared/schema";
import { ensureDefaultBusiness } from "./businesses";

// Make the resolved DB user available on the request for downstream handlers.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      dbUser?: User;
    }
  }
}

/**
 * Turn an arbitrary string into a valid username seed:
 * lowercase, alphanumeric + underscore only.
 */
function normalizeUsername(seed: string): string {
  const cleaned = seed
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "user";
}

function verifiedPrimaryEmail(clerkUser: Awaited<ReturnType<typeof clerkClient.users.getUser>>): string | undefined {
  const primaryEmail = clerkUser.emailAddresses.find(
    (email) => email.id === clerkUser.primaryEmailAddressId,
  );
  if (primaryEmail?.verification?.status !== "verified") return undefined;
  return primaryEmail.emailAddress.trim().toLowerCase();
}

/**
 * Find a username that isn't taken yet, appending a numeric suffix on collision.
 */
async function uniqueUsername(base: string): Promise<string> {
  const normalized = normalizeUsername(base);
  let candidate = normalized;
  let suffix = 0;
  // Bounded loop — practically resolves in one or two tries.
  while (await storage.getUserByUsername(candidate)) {
    suffix += 1;
    candidate = `${normalized}_${suffix}`;
  }
  return candidate;
}

/**
 * Resolve a Clerk user ID to our internal DB user, provisioning the row
 * on first sight. This is the single bridge between Clerk (string IDs) and
 * the app's numeric user IDs, which the entire client and data model rely on.
 */
export async function getOrCreateDbUser(clerkUserId: string): Promise<User> {
  const existing = await storage.getUserByClerkId(clerkUserId);
  if (existing) {
    // Existing test-instance users acquire their verified email before the
    // production key switch. After the switch this branch is inexpensive.
    if (!existing.authEmail) {
      const clerkUser = await clerkClient.users.getUser(clerkUserId);
      const authEmail = verifiedPrimaryEmail(clerkUser);
      if (authEmail) {
        existing.authEmail = authEmail;
        await storage.rebindClerkIdentity(existing.id, clerkUserId, authEmail);
      }
    }
    await ensureDefaultBusiness(existing);
    return existing;
  }

  // First authenticated request for this Clerk user — build a DB profile
  // from the Clerk account.
  const clerkUser = await clerkClient.users.getUser(clerkUserId);

  const primaryEmail = verifiedPrimaryEmail(clerkUser);

  // Clerk development and production instances intentionally have separate
  // user IDs. A new live account with the same verified email therefore
  // reclaims the existing local profile and all of its related data.
  if (primaryEmail) {
    const legacyUser = await storage.getUserByAuthEmail(primaryEmail);
    if (legacyUser) {
      const reboundUser = await storage.rebindClerkIdentity(legacyUser.id, clerkUserId, primaryEmail);
      await ensureDefaultBusiness(reboundUser);
      return reboundUser;
    }
  }

  const usernameSeed =
    clerkUser.username ||
    (primaryEmail ? primaryEmail.split("@")[0] : "") ||
    `user_${clerkUserId.slice(-8)}`;

  const username = await uniqueUsername(usernameSeed);

  const displayName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() ||
    clerkUser.username ||
    username;

  const user = await storage.createUser({
    clerkId: clerkUserId,
    authEmail: primaryEmail ?? null,
    username,
    displayName,
    bio: null,
    profileImageUrl: clerkUser.imageUrl ?? null,
    role: "creator",
  });
  await ensureDefaultBusiness(user);
  return user;
}

/**
 * Clerk-based authentication setup.
 * Replaces Passport.js local strategy and session middleware.
 */
export function setupAuth(app: Express) {
  if (process.env.CREATOROS_DEMO_MODE === "true") {
    app.get("/api/user", attachUser, (req: Request, res: Response) => {
      res.json(req.dbUser);
    });
    return;
  }

  // Configure Clerk explicitly instead of depending on the SDK's environment
  // discovery. The browser build uses the Vite-prefixed value; the server needs
  // the same public identifier under its non-Vite name. Keeping this fallback
  // here makes local development, Fly, and `op run` resolve the same instance.
  const publishableKey =
    process.env.CLERK_PUBLISHABLE_KEY ?? process.env.VITE_CLERK_PUBLISHABLE_KEY;
  const authorizedParties = process.env.PUBLIC_APP_URL
    ? [process.env.PUBLIC_APP_URL]
    : undefined;
  app.use(
    clerkMiddleware({
      secretKey: process.env.CLERK_SECRET_KEY,
      publishableKey,
      authorizedParties,
    }),
  );

  // Current user route — returns the full DB user, provisioning on first sight.
  app.get("/api/user", attachUser, (req: Request, res: Response) => {
    res.json(req.dbUser);
  });
}

/**
 * Middleware that requires a valid Clerk session.
 * Returns 401 if the request has no authenticated user.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  let userId: string | null;
  try {
    ({ userId } = getAuth(req));
  } catch {
    return res.status(401).json({ message: "Not authenticated" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

/**
 * Middleware that resolves the authenticated Clerk user to a DB user and
 * attaches it as `req.dbUser`. Use after (or in place of) requireAuth on any
 * handler that needs the acting user's numeric ID. 401s if unauthenticated.
 */
export async function attachUser(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (process.env.CREATOROS_DEMO_MODE === "true") {
      const demoUser = await storage.getUser(1);
      if (!demoUser) {
        return res.status(500).json({ message: "Demo user is unavailable" });
      }
      req.dbUser = demoUser;
      return next();
    }

    let userId: string | null;
    try {
      ({ userId } = getAuth(req));
    } catch {
      // A request without a valid Clerk context is unauthenticated, not a
      // server fault. This also keeps protected API contracts deterministic
      // during local and deployment health checks.
      return res.status(401).json({ message: "Not authenticated" });
    }
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    req.dbUser = await getOrCreateDbUser(userId);
    if (req.dbUser.status === "deleted") {
      return res.status(410).json({ message: "This account has been deleted" });
    }
    next();
  } catch (error) {
    console.error("Failed to resolve authenticated user:", error);
    res.status(500).json({ message: "Failed to resolve user" });
  }
}
