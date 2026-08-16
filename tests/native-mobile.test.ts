import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { safeNativeAppPath } from "../client/src/lib/native-links";
import { registerMobileDeviceSchema } from "../shared/mobile";

describe("native mobile contract", () => {
  it("accepts only platform-matched push providers", () => {
    const base = {
      installationId: "4db35089-55ac-4ee2-87c7-4616eef26f9f",
      pushToken: "provider-token-long-enough",
    };
    expect(registerMobileDeviceSchema.safeParse({ ...base, platform: "ios", provider: "apns" }).success).toBe(true);
    expect(registerMobileDeviceSchema.safeParse({ ...base, platform: "android", provider: "fcm" }).success).toBe(true);
    expect(registerMobileDeviceSchema.safeParse({ ...base, platform: "ios", provider: "fcm" }).success).toBe(false);
    expect(registerMobileDeviceSchema.safeParse({ ...base, platform: "web", provider: "fcm" }).success).toBe(false);
  });

  it("keeps tokens encrypted and owner scoped in the migration", () => {
    const migration = readFileSync("migrations/0103_native_mobile.sql", "utf8");
    const journal = readFileSync("migrations/meta/_journal.json", "utf8");
    expect(migration).toContain('"push_token_hash" text NOT NULL');
    expect(migration).toContain('"push_token_ciphertext" text NOT NULL');
    expect(migration).toContain('UNIQUE("user_id", "installation_id")');
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS "mobile_device_registrations_active_token_hash_unique"[\s\S]*?ON "mobile_device_registrations" \("push_token_hash"\)[\s\S]*?WHERE "status" = 'active';/);
    expect(migration).toContain('"platform" = \'ios\' AND "push_provider" = \'apns\'');
    expect(migration).toContain('REFERENCES "public"."users"("id") ON DELETE cascade');
    expect(migration).not.toMatch(/"push_token" text/);
    expect(journal).toContain('"tag": "0103_native_mobile"');
  });

  it("keeps background work metadata-only", () => {
    const runner = readFileSync("client/public/runners/background.js", "utf8");
    expect(runner).toContain("creativesos:last-background-wake");
    expect(runner).not.toContain("/api/");
    expect(runner).not.toMatch(/token|authorization|cookie/i);
  });

  it("accepts only approved native links and preserves SPA route state", () => {
    expect(safeNativeAppPath("https://creativesos.net/profile?tab=posts#top")).toBe(
      "/profile?tab=posts#top",
    );
    expect(safeNativeAppPath("creativesos://app/communities/8")).toBe(
      "/communities/8",
    );
    expect(safeNativeAppPath("/broadcast/field")).toBe("/broadcast/field");
    expect(safeNativeAppPath("creativesos://evil/profile")).toBeNull();
    expect(safeNativeAppPath("https://creativesos.net.evil.example/profile")).toBeNull();
    expect(safeNativeAppPath("https://creativesos.net/not-a-real-route")).toBeNull();
    expect(safeNativeAppPath("javascript:alert(1)")).toBeNull();
  });

  it("keeps the device API authenticated, bounded and token-redacted", () => {
    const source = readFileSync("server/mobile.ts", "utf8");
    const publicFields = source.slice(
      source.indexOf("const publicDeviceFields"),
      source.indexOf("function tokenHash"),
    );
    expect(source).toContain('app.get("/api/mobile/devices", attachUser, safe(');
    expect(source).toContain('app.post("/api/mobile/devices", attachUser, deviceWriteLimit, safe(');
    expect(source).toContain("encryptSensitiveValue(parsed.data.pushToken)");
    expect(source).toContain('fingerprintSensitiveValue(token, "mobile-push-token")');
    expect(source).toContain('limit: 20');
    expect(source).toContain("ipKeyGenerator");
    expect(source).toContain("req.dbUser?.id");
    expect(source).toContain("db.transaction");
    expect(source).toContain("pg_advisory_xact_lock");
    expect(publicFields).not.toContain("pushTokenHash");
    expect(publicFields).not.toContain("pushTokenCiphertext");
  });

  it("includes the mobile contract in production readiness", () => {
    const source = readFileSync("server/routes.ts", "utf8");
    expect(source).toContain('"mobile_device_registrations"');
  });

  it("fails Android release assembly without Firebase configuration", () => {
    const build = readFileSync("android/app/build.gradle", "utf8");
    expect(build).toContain("servicesJSON.exists() && servicesJSON.length() > 0");
    expect(build).toContain("throw new GradleException");
    expect(build).toContain("google-services.json");
  });
});
