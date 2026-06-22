# CreatorOS Authentication Audit

**Date:** 2026-06-22
**Scope:** Passport.js, express-session, session stores, password handling, all auth-dependent files

---

## 1. Core Auth Files

### `server/auth.ts` — Primary auth module
- **Imports:** `passport`, `passport-local` (LocalStrategy), `express-session`, `crypto` (scrypt, randomBytes, timingSafeEqual)
- **Exports:** `setupAuth(app: Express)`
- **Declares:** Global `Express.User` interface augmentation (lines 10-25)
- **Functions:**
  - `hashPassword(password)` — scrypt + random salt, returns `hex.salt` format (line 30)
  - `comparePasswords(supplied, stored)` — **BUG: see Section 3** (line 37)
- **Passport config:**
  - `passport.initialize()` + `passport.session()` middleware (lines 80-81)
  - `LocalStrategy` — username/password lookup via `storage.getUserByUsername()` (line 84)
  - `serializeUser` — stores `user.id` in session (line 111)
  - `deserializeUser` — fetches user by id via `storage.getUser()` (line 116)
- **Routes defined:**
  - `POST /api/register` — creates user with hashed password, auto-login via `req.login()` (line 126)
  - `POST /api/login` — `passport.authenticate("local")`, then `req.login()` (line 160)
  - `POST /api/logout` — `req.logout()`, `req.session.destroy()`, clears `connect.sid` cookie (line 176)
  - `GET /api/user` — returns current user if `req.isAuthenticated()` (line 188)
- **Session config (line 66):**
  - Secret: `process.env.SESSION_SECRET || "creatorOS-secret-key"` (hardcoded fallback)
  - Store: `storage.sessionStore`
  - Cookie: 30-day maxAge, httpOnly, secure only in production

### `server/storage.ts` — Session store initialization
- **Imports:** `express-session`, `memorystore` (createMemoryStore), dynamic `connect-pg-simple`
- **`MemStorage` class (in-memory, line 220):**
  - Uses `memorystore` with 24h prune cycle
  - Seed data uses **plaintext passwords** (e.g., `'password123'` on line 235)
- **`DatabaseStorage` class (line 1614):**
  - Async dynamic `import('connect-pg-simple')` in constructor (line 1619)
  - Creates `PostgresStore` with `process.env.DATABASE_URL`, `createTableIfMissing: true`
  - Falls back to `memorystore` on failure (line 1632)
  - **Race condition:** Initializes a temporary `memorystore` immediately (line 1639) that gets replaced async — sessions created before PG store is ready will be lost

### `server/routes.ts` — Protected route handlers
- 17 occurrences of `req.isAuthenticated()` guard checks
- Accesses `req.user.id` and `req.user` throughout
- No middleware abstraction — each handler checks auth inline

---

## 2. Environment Variables

| Variable | File | Purpose |
|---|---|---|
| `SESSION_SECRET` | `server/auth.ts:67`, `.env` | Session cookie signing |
| `DATABASE_URL` | `server/storage.ts:1625` | PostgreSQL connection for session store |
| `NODE_ENV` | `server/auth.ts:74` | Controls secure cookie flag |
| `REPL_ID` | `vite.config.ts:13` | Replit environment detection (not auth, but affects deployment target) |

---

## 3. CONFIRMED BUG: `comparePasswords` (server/auth.ts:37-61)

```typescript
async function comparePasswords(supplied: string, stored: string) {
  if (!stored.includes(".")) {
    console.log("Using plaintext password comparison for development data");
    // Force return true for development/demo purposes (remove in production)
    return true;  // <-- BYPASSES ALL PASSWORD CHECKS
  }
  // ... scrypt comparison below
}
```

**Severity: CRITICAL**

- If the stored password does not contain a `.` character, the function **returns `true` unconditionally** — any password works.
- This was intended for dev seed data but applies to **all environments**, including production.
- Any user whose password was stored in plaintext (seed data, DB migration artifact, or manual DB edit) can be logged into with any password.
- The `console.log` leaks password lengths to stdout.
- The MemStorage seed data stores plaintext passwords (`'password123'`), so this path is always active in dev.

---

## 4. Additional Security Concerns

1. **Hardcoded session secret fallback** — `"creatorOS-secret-key"` if `SESSION_SECRET` env var is missing (auth.ts:67)
2. **Session store race condition** — DatabaseStorage constructor initializes memorystore synchronously, then replaces it async with PG store. Early sessions are lost. (storage.ts:1617-1642)
3. **No rate limiting** on `/api/login` or `/api/register`
4. **No CSRF protection** on session-based auth
5. **Password logged to console** — `console.log` in comparePasswords leaks password metadata (auth.ts:41)
6. **No password complexity validation** on `/api/register`
7. **`connect.sid` cookie name** is the default — reveals session framework to attackers

---

## 5. Packages to Remove (Clerk Migration)

### npm dependencies
- `passport` (^0.7.0)
- `passport-local` (^1.0.0)
- `express-session` (^1.18.1)
- `connect-pg-simple` (^10.0.0)
- `memorystore` (^1.6.7)

### npm devDependencies
- `@types/passport` (^1.0.16)
- `@types/passport-local` (^1.0.38)
- `@types/express-session` (^1.18.0)
- `@types/connect-pg-simple` (^7.0.3)

---

## 6. Files Requiring Modification for Clerk Migration

### Server-side (delete or rewrite)
| File | Changes |
|---|---|
| `server/auth.ts` | **Replace entirely.** Remove Passport, session, LocalStrategy, hashPassword, comparePasswords. Replace with Clerk middleware (`clerkMiddleware`), Clerk `getAuth()` for route protection. Remove `/api/register`, `/api/login`, `/api/logout` routes. Replace `/api/user` with Clerk `currentUser()`. |
| `server/storage.ts` | Remove `express-session` import, `memorystore` import, `connect-pg-simple` dynamic import. Remove `sessionStore` property from both `MemStorage` and `DatabaseStorage` classes. Remove seed data plaintext passwords. |
| `server/routes.ts` | Replace all 17 `req.isAuthenticated()` checks with Clerk `getAuth(req)`. Replace all `req.user.id` / `req.user!.id` accesses with Clerk's `auth.userId`. Map Clerk user IDs (strings) to internal numeric user IDs or migrate schema to string IDs. |
| `shared/schema.ts` | Remove `password` field from users table. Add `clerkId` (text, unique) field. Update `InsertUser` type. |
| `package.json` | Remove 5 dependencies + 4 devDependencies listed above. Add `@clerk/express` (server) and `@clerk/clerk-react` (client). |

### Client-side (delete or rewrite)
| File | Changes |
|---|---|
| `client/src/hooks/use-auth.tsx` | **Replace entirely.** Swap `AuthProvider`/`useAuth` with Clerk's `ClerkProvider`, `useUser()`, `useAuth()`, `useClerk()`. Remove `loginMutation`, `registerMutation`, `logoutMutation`. Keep `updateProfileMutation` and `uploadProfileImageMutation` (these are app-specific). |
| `client/src/lib/protected-route.tsx` | Replace with Clerk's `<SignedIn>` / `<SignedOut>` / `<RedirectToSignIn>` components, or keep wrapper using Clerk's `useUser()`. |
| `client/src/pages/auth-page.tsx` | **Replace entirely.** Swap custom login/register form with Clerk's `<SignIn>` and `<SignUp>` components. |
| `client/src/App.tsx` | Wrap app with `<ClerkProvider>`. Remove custom `<AuthProvider>` if it's only passport-based. |

### Client components using `useAuth()` (36 files)
These files import `useAuth` and access `user` — they will continue to work if the new `useAuth` hook returns the same shape, or need updating if the user object shape changes:

- `client/src/pages/` — auth-page, contacts, create-post, create-product, documents, followers, following, new-text-post, profile, revenue, saved-posts
- `client/src/components/profile/` — ContactList, DocumentEditor, EditProfilePage, ProfileEditForm, ProfileFeed, RevenueChart
- `client/src/components/feed/` — PhotoUploader, PostOptionsPanel, StoriesBar, StoryCreator, TagEditor, TextComposer, VideoRecorder, VoiceRecorder
- `client/src/components/messages/` — MessageButton, MessageCard, MessagePanel
- `client/src/components/notifications/` — NotificationBell, NotificationPanel
- `client/src/components/explore/` — Post, Stories
- `client/src/lib/stores.ts`

### Database
- Drop `session` table (created by connect-pg-simple)
- Migrate `users.password` column (remove or keep for legacy, but stop using)
- Add `users.clerk_id` column (text, unique, not null)

---

## 7. Recommended Migration Order

1. Set up Clerk project, get API keys, add to `.env`
2. Install `@clerk/express` + `@clerk/clerk-react`
3. Add `clerkId` to schema, migrate DB
4. Rewrite `server/auth.ts` with Clerk middleware
5. Update `server/routes.ts` auth checks (swap `req.isAuthenticated()` for Clerk `getAuth()`)
6. Rewrite `client/src/hooks/use-auth.tsx` to wrap Clerk hooks
7. Replace `auth-page.tsx` with Clerk components
8. Wrap app in `ClerkProvider`
9. Update `protected-route.tsx`
10. Remove old packages from `package.json`
11. Drop `session` table, remove `password` column
12. Test all 17 protected routes
