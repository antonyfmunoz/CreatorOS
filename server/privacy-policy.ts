import { createHash } from "node:crypto";

export const accountDeletionGraceDays = 7;

export type AccountDeletionBlocker = {
  kind: "business" | "community";
  id: string;
  name: string;
  otherMemberCount: number;
  resolution: string;
};

export function accountDeletionConfirmation(username: string) {
  return `DELETE ${username}`;
}

export function validAccountDeletionConfirmation(
  username: string,
  confirmation: unknown,
) {
  return (
    typeof confirmation === "string" &&
    confirmation.trim() === accountDeletionConfirmation(username)
  );
}

export function accountDeletionScheduledFor(
  now = new Date(),
  graceDays = accountDeletionGraceDays,
) {
  return new Date(now.getTime() + graceDays * 24 * 60 * 60 * 1_000);
}

export function accountDeletionRequestFingerprint(
  userId: number,
  scheduledFor: Date,
) {
  return createHash("sha256")
    .update(`creativesos:account-deletion:${userId}:${scheduledFor.toISOString()}`)
    .digest("hex");
}

const sensitiveExportKey =
  /(?:password|secret|token|ciphertext|authorization|cookie|storage[_-]?key|state[_-]?hash|provider[_-]?reference)/i;

export function sanitizeAccountExport(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAccountExport);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !sensitiveExportKey.test(key))
      .map(([key, nested]) => [key, sanitizeAccountExport(nested)]),
  );
}

export function deletedAccountIdentity(userId: number, requestId: string) {
  const suffix = requestId.replace(/[^a-z0-9]/gi, "").slice(0, 12).toLowerCase();
  return {
    clerkId: `deleted_${userId}_${suffix}`,
    username: `deleted_${userId}_${suffix}`,
    displayName: "Deleted account",
    role: "deleted",
    status: "deleted",
  } as const;
}

export function canCancelAccountDeletion(status: string) {
  return status === "scheduled" || status === "blocked" || status === "failed";
}
