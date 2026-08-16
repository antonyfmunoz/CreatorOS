import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
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
    expect(migration).toContain('WHERE "status" = \'active\'');
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

  it("keeps the device API authenticated, bounded and token-redacted", () => {
    const source = readFileSync("server/mobile.ts", "utf8");
    const publicFields = source.slice(
      source.indexOf("const publicDeviceFields"),
      source.indexOf("function tokenHash"),
    );
    expect(source).toContain('app.get("/api/mobile/devices", attachUser, safe(');
    expect(source).toContain('app.post("/api/mobile/devices", attachUser, deviceWriteLimit, safe(');
    expect(source).toContain("encryptSensitiveValue(parsed.data.pushToken)");
    expect(source).toContain('limit: 20');
    expect(publicFields).not.toContain("pushTokenHash");
    expect(publicFields).not.toContain("pushTokenCiphertext");
  });
});
