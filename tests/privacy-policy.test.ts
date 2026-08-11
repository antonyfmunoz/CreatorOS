import { describe, expect, it } from "vitest";
import {
  accountDeletionConfirmation,
  accountDeletionRequestFingerprint,
  accountDeletionScheduledFor,
  canCancelAccountDeletion,
  deletedAccountIdentity,
  sanitizeAccountExport,
  validAccountDeletionConfirmation,
} from "../server/privacy-policy";

describe("account privacy policy", () => {
  it("requires the exact account-specific destructive confirmation", () => {
    expect(accountDeletionConfirmation("antony")).toBe("DELETE antony");
    expect(validAccountDeletionConfirmation("antony", "DELETE antony")).toBe(true);
    expect(validAccountDeletionConfirmation("antony", "delete antony")).toBe(false);
    expect(validAccountDeletionConfirmation("antony", "DELETE someone_else")).toBe(false);
  });

  it("provides a reversible seven-day grace period", () => {
    const start = new Date("2026-08-10T12:00:00.000Z");
    expect(accountDeletionScheduledFor(start).toISOString()).toBe("2026-08-17T12:00:00.000Z");
    expect(canCancelAccountDeletion("scheduled")).toBe(true);
    expect(canCancelAccountDeletion("executing")).toBe(false);
    expect(canCancelAccountDeletion("completed")).toBe(false);
  });

  it("creates deterministic audit fingerprints without storing confirmation text", () => {
    const scheduled = new Date("2026-08-17T12:00:00.000Z");
    expect(accountDeletionRequestFingerprint(7, scheduled)).toMatch(/^[a-f0-9]{64}$/);
    expect(accountDeletionRequestFingerprint(7, scheduled)).toBe(accountDeletionRequestFingerprint(7, scheduled));
  });

  it("recursively removes credentials and private storage locators from exports", () => {
    expect(sanitizeAccountExport({
      id: 1,
      accessTokenCiphertext: "secret",
      nested: { storageKey: "private/key", storage_key: "private/raw-sql-key", body: "safe" },
      rows: [{ refresh_token: "secret", state_hash: "oauth-state", value: 2 }],
    })).toEqual({ id: 1, nested: { body: "safe" }, rows: [{ value: 2 }] });
  });

  it("creates a unique non-identifying tombstone", () => {
    expect(deletedAccountIdentity(7, "ABC-123-XYZ")).toEqual({
      clerkId: "deleted_7_abc123xyz",
      username: "deleted_7_abc123xyz",
      displayName: "Deleted account",
      role: "deleted",
      status: "deleted",
    });
  });
});
