import { describe, expect, it } from "vitest";
import {
  decryptSensitiveJson,
  decryptSensitiveValue,
  encryptSensitiveJson,
  encryptSensitiveValue,
  fingerprintSensitiveValue,
  isSensitiveDataEncryptionConfigured,
} from "../server/sensitive-data";

const environment = {
  CREATOROS_DATA_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
};

describe("sensitive data envelope", () => {
  it("uses authenticated encryption and rejects the wrong key", () => {
    expect(isSensitiveDataEncryptionConfigured(environment)).toBe(true);
    const encrypted = encryptSensitiveValue("private-address", environment);
    expect(encrypted).not.toContain("private-address");
    expect(decryptSensitiveValue(encrypted, environment)).toBe(
      "private-address",
    );
    expect(() =>
      decryptSensitiveValue(encrypted, {
        CREATOROS_DATA_ENCRYPTION_KEY:
          "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=",
      }),
    ).toThrow();
  });

  it("round trips structured delivery data without plaintext persistence", () => {
    const prior = process.env.CREATOROS_DATA_ENCRYPTION_KEY;
    process.env.CREATOROS_DATA_ENCRYPTION_KEY =
      environment.CREATOROS_DATA_ENCRYPTION_KEY;
    try {
      const encrypted = encryptSensitiveJson({ city: "Los Angeles" });
      expect(encrypted).not.toContain("Los Angeles");
      expect(decryptSensitiveJson<{ city: string }>(encrypted)).toEqual({
        city: "Los Angeles",
      });
    } finally {
      if (prior === undefined) delete process.env.CREATOROS_DATA_ENCRYPTION_KEY;
      else process.env.CREATOROS_DATA_ENCRYPTION_KEY = prior;
    }
  });

  it("creates deterministic, domain-separated sensitive fingerprints", () => {
    const first = fingerprintSensitiveValue(
      "provider-token",
      "mobile",
      environment,
    );
    expect(
      fingerprintSensitiveValue("provider-token", "mobile", environment),
    ).toBe(first);
    expect(
      fingerprintSensitiveValue("provider-token", "other", environment),
    ).not.toBe(first);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain("provider-token");
  });
});
