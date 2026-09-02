import { cutEdlSchema, type CutEdl } from "@shared/cut-studio";

export type CutRecoveryScope = { userId: number; businessId: string; projectId: string };
export type CutRecoveryCopy = CutRecoveryScope & { version: 1; writerId: string; baseRevision: number; updatedAt: number; edl: CutEdl };
export type RecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
export const CUT_RECOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CUT_RECOVERY_MAX_BYTES = 256 * 1024;
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function userPrefix(userId: number) {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("A signed-in account is required for device recovery.");
  return `creativesos:cut-recovery:v1:${userId}:`;
}
export function recoveryPreferenceKey(userId: number) { return `${userPrefix(userId)}enabled`; }
// All application storage access uses the same per-account Web Lock, including
// reads that expire records. Unsupported browsers fail closed instead of
// pretending localStorage read/write pairs are an atomic cross-tab transaction.
export function withCutRecoveryLock<T>(userId: number, action: () => T): Promise<T> {
  const name = userPrefix(userId);
  if (typeof navigator === "undefined" || !navigator.locks?.request) return Promise.reject(new Error("This browser cannot safely coordinate device recovery between tabs."));
  return navigator.locks.request(name, { mode: "exclusive" }, action);
}
function projectPrefix(scope: CutRecoveryScope) {
  if (!idPattern.test(scope.businessId) || !idPattern.test(scope.projectId)) throw new Error("Invalid recovery project scope.");
  return `${userPrefix(scope.userId)}${scope.businessId}:${scope.projectId}:`;
}
function copyKey(copy: CutRecoveryScope & { writerId: string }) {
  if (!idPattern.test(copy.writerId)) throw new Error("Invalid recovery writer identity.");
  return `${projectPrefix(copy)}${copy.writerId}`;
}
function keys(storage: RecoveryStorage, prefix: string) {
  const found: string[] = [];
  for (let index = 0; index < storage.length; index++) { const key = storage.key(index); if (key?.startsWith(prefix)) found.push(key); }
  return found;
}
function decode(raw: string, scope: CutRecoveryScope, key: string, now: number): CutRecoveryCopy {
  if (new TextEncoder().encode(raw).length > CUT_RECOVERY_MAX_BYTES) throw new Error("Recovery copy exceeds its size limit.");
  const value = JSON.parse(raw);
  if (value?.version !== 1 || value.userId !== scope.userId || value.businessId !== scope.businessId || value.projectId !== scope.projectId || copyKey(value) !== key
    || !Number.isSafeInteger(value.baseRevision) || value.baseRevision < 1 || !Number.isSafeInteger(value.updatedAt) || value.updatedAt > now + 60_000 || now - value.updatedAt > CUT_RECOVERY_TTL_MS) throw new Error("Invalid or expired recovery copy.");
  // Browser storage is untrusted. Only the bounded timeline schema is retained;
  // there are no media bytes, access tokens, signed URLs or executable callbacks.
  return { version: 1, ...scope, writerId: value.writerId, baseRevision: value.baseRevision, updatedAt: value.updatedAt, edl: cutEdlSchema.parse(value.edl) };
}
export function readCutRecoveryCopies(storage: RecoveryStorage, scope: CutRecoveryScope, now = Date.now()) {
  const copies: CutRecoveryCopy[] = [];
  for (const key of keys(storage, projectPrefix(scope))) {
    const raw = storage.getItem(key);
    if (raw === null) continue;
    try { copies.push(decode(raw, scope, key, now)); }
    catch { if (storage.getItem(key) === raw) storage.removeItem(key); }
  }
  return copies.sort((left, right) => right.updatedAt - left.updatedAt);
}
export function writeCutRecoveryCopy(storage: RecoveryStorage, copy: CutRecoveryCopy, now = Date.now()) {
  if (storage.getItem(recoveryPreferenceKey(copy.userId)) !== "true") throw new Error("Device recovery has not been enabled for this account.");
  const key = copyKey(copy);
  const raw = JSON.stringify(copy);
  const normalized = decode(raw, copy, key, now);
  for (const priorKey of keys(storage, userPrefix(copy.userId))) {
    if (priorKey === recoveryPreferenceKey(copy.userId)) continue;
    const priorRaw = storage.getItem(priorKey);
    if (!priorRaw) continue;
    try {
      const prior = JSON.parse(priorRaw);
      if (prior.userId === copy.userId && Number.isSafeInteger(prior.updatedAt) && now - prior.updatedAt > CUT_RECOVERY_TTL_MS && storage.getItem(priorKey) === priorRaw) storage.removeItem(priorKey);
    } catch { /* Unknown local data is not a reason to remove another record. */ }
  }
  if (storage.getItem(key) === null && keys(storage, userPrefix(copy.userId)).filter((item) => item !== recoveryPreferenceKey(copy.userId)).length >= 10) throw new Error("This account already has ten device recovery copies. Save or discard a copy before keeping another.");
  storage.setItem(key, JSON.stringify(normalized));
  return normalized;
}
export function removeCutRecoveryCopy(storage: RecoveryStorage, copy: CutRecoveryCopy) {
  const key = copyKey(copy), raw = storage.getItem(key);
  if (!raw) return;
  // Never delete a newer copy from another still-open page after reading one.
  const current = decode(raw, copy, key, Date.now());
  if (current.updatedAt === copy.updatedAt && JSON.stringify(current.edl) === JSON.stringify(copy.edl) && storage.getItem(key) === raw) storage.removeItem(key);
}
export function disableCutRecovery(storage: RecoveryStorage, userId: number) {
  // Explicit opt-out deletes only this account's CutStudio recovery records.
  storage.removeItem(recoveryPreferenceKey(userId));
  for (const key of keys(storage, userPrefix(userId))) storage.removeItem(key);
}
