export type OfflineOperationKind =
  | "post.create"
  | "message.send"
  | "media.upload";

export type OfflineOperationState = "pending" | "sending" | "blocked";

export type OfflineOperation = {
  id: string;
  ownerUserId: number;
  kind: OfflineOperationKind;
  state: OfflineOperationState;
  payload: Record<string, unknown>;
  file?: Blob;
  filename?: string;
  mimeType?: string;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
};

export type OfflineDispatchResult =
  | { state: "sent"; id: string; value: unknown }
  | { state: "queued"; id: string };

const DATABASE = "creativesos-offline-v1";
const STORE = "operations";
const MAX_OPERATIONS_PER_USER = 100;
const MAX_JSON_BYTES = 128 * 1024;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const QUEUE_EVENT = "creativesos:offline-queue-changed";
const FALLBACK_KEY = "creativesos:offline-json-outbox:v1";
const STORAGE_TIMEOUT_MS = 2_000;
let flushPromise: Promise<void> | null = null;

class OfflineHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      run();
    };
    const timer = window.setTimeout(
      () => finish(() => reject(new Error("Offline storage did not become ready"))),
      STORAGE_TIMEOUT_MS,
    );
    if (!("indexedDB" in window)) {
      finish(() => reject(new Error("This browser cannot protect offline changes")));
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("ownerUserId", "ownerUserId", { unique: false });
      store.createIndex("state", "state", { unique: false });
      store.createIndex("nextAttemptAt", "nextAttemptAt", { unique: false });
    };
    request.onsuccess = () => finish(() => resolve(request.result));
    request.onerror = () => finish(() => reject(request.error ?? new Error("Offline storage is unavailable")));
    request.onblocked = () => finish(() => reject(new Error("Offline storage upgrade is blocked")));
  });
}

async function transact<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
) {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    let settled = false;
    let result: T;
    let hasResult = false;
    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      db.close();
      run();
    };
    const timer = window.setTimeout(
      () => {
        try { tx.abort(); } catch { /* The transaction may already be inactive. */ }
        finish(() => reject(new Error("Offline storage transaction timed out")));
      },
      STORAGE_TIMEOUT_MS,
    );
    tx.oncomplete = () => finish(() => {
      if (!hasResult) reject(new Error("Offline storage transaction completed without a result"));
      else resolve(result);
    });
    tx.onabort = () => {
      finish(() => reject(tx.error ?? new Error("Offline storage transaction failed")));
    };
    tx.onerror = () => finish(() => reject(tx.error ?? new Error("Offline storage transaction failed")));
    try {
      run(
        tx.objectStore(STORE),
        (value) => {
          result = value;
          hasResult = true;
        },
        (reason) => {
          try { tx.abort(); } catch { /* The request may already have aborted it. */ }
          finish(() => reject(reason));
        },
      );
    } catch (error) {
      try { tx.abort(); } catch { /* The transaction may already be inactive. */ }
      finish(() => reject(error));
    }
  });
}

function fallbackOperations() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FALLBACK_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed as OfflineOperation[] : [];
  } catch {
    return [];
  }
}

function writeFallback(operations: OfflineOperation[]) {
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(operations));
}

async function allOperations() {
  let primary: OfflineOperation[] = [];
  try {
    primary = await transact<OfflineOperation[]>("readonly", (store, resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as OfflineOperation[]);
    request.onerror = () => reject(request.error);
    });
  } catch {
    // JSON actions have a bounded localStorage fallback. Blob uploads never do.
  }
  const byId = new Map(primary.map((operation) => [operation.id, operation]));
  for (const operation of fallbackOperations()) if (!byId.has(operation.id)) byId.set(operation.id, operation);
  return Array.from(byId.values());
}

async function putOperation(operation: OfflineOperation) {
  // JSON operations are synchronously mirrored before IndexedDB work. This
  // makes route changes and abrupt lifecycle transitions durable while the
  // primary store commits. Blob uploads remain IndexedDB-only.
  if (!operation.file) {
    const fallback = fallbackOperations().filter((item) => item.id !== operation.id);
    fallback.push(operation);
    writeFallback(fallback);
  }
  try {
    await transact<void>("readwrite", (store, resolve, reject) => {
      const request = store.put(operation);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    if (operation.file) throw error;
    // The JSON mirror remains authoritative until the primary store recovers.
  }
  queueChanged();
}

async function removeOperation(id: string) {
  try {
    await transact<void>("readwrite", (store, resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // The fallback removal below is still authoritative for JSON operations.
  }
  writeFallback(fallbackOperations().filter((operation) => operation.id !== id));
  queueChanged();
}

function queueChanged(detail?: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail }));
}

function safeMessage(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 240)
    : fallback;
}

async function responseValue(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;
  return response.json().catch(() => null);
}

async function checked(response: Response) {
  const value = await responseValue(response);
  if (!response.ok) {
    const message =
      value && typeof value === "object" && "message" in value
        ? safeMessage((value as { message?: unknown }).message, "The server rejected this change")
        : "The server rejected this change";
    throw new OfflineHttpError(response.status, message);
  }
  return value;
}

async function fetchWithDeadline(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = 3_000,
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

export function retryDelayMs(attempt: number) {
  return Math.min(5 * 60_000, 1_000 * 2 ** Math.min(10, Math.max(0, attempt)));
}

export function isRetryableOfflineStatus(status: number) {
  return status === 0 || [408, 425, 429].includes(status) || status >= 500;
}

function retryable(error: unknown) {
  return error instanceof OfflineHttpError
    ? isRetryableOfflineStatus(error.status) || error.status === 401
    : true;
}

async function executeMediaUpload(operation: OfflineOperation) {
  if (!operation.file || !operation.filename || !operation.mimeType) {
    throw new OfflineHttpError(422, "The protected upload is incomplete");
  }
  const metadata = operation.payload as {
    kind?: unknown;
    visibility?: unknown;
  };
  const kind = String(metadata.kind ?? "");
  const visibility = String(metadata.visibility ?? "private");
  const intentBody = {
    kind,
    visibility,
    filename: operation.filename,
    mimeType: operation.mimeType,
    sizeBytes: operation.file.size,
    clientMutationId: operation.id,
  };

  try {
    const intent = (await checked(
      await fetchWithDeadline("/api/assets/upload-intents", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intentBody),
      }, 10_000),
    )) as {
      asset?: { id?: string };
      upload?: { uploadUrl?: string } | null;
      alreadyComplete?: boolean;
    } | null;
    if (intent?.alreadyComplete) return intent;
    const assetId = intent?.asset?.id;
    const uploadUrl = intent?.upload?.uploadUrl;
    if (!assetId || !uploadUrl)
      throw new OfflineHttpError(502, "The upload destination was unavailable");
    const uploaded = await fetchWithDeadline(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": operation.mimeType },
      body: operation.file,
    }, 10 * 60_000);
    if (!uploaded.ok)
      throw new OfflineHttpError(uploaded.status, "The direct upload was interrupted");
    return checked(
      await fetchWithDeadline(`/api/assets/${assetId}/complete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }, 30_000),
    );
  } catch (error) {
    if (!navigator.onLine || (error instanceof OfflineHttpError && error.status === 401))
      throw error;
    const body = new FormData();
    body.append("kind", kind);
    body.append("visibility", visibility);
    body.append("clientMutationId", operation.id);
    body.append(kind === "photo" ? "image" : kind, operation.file, operation.filename);
    return checked(
      await fetchWithDeadline("/api/assets/upload-proxy", {
        method: "POST",
        credentials: "include",
        body,
      }, 10 * 60_000),
    );
  }
}

async function execute(operation: OfflineOperation) {
  if (operation.kind === "media.upload") return executeMediaUpload(operation);
  const endpoint = operation.kind === "post.create" ? "/api/posts" : "/api/messages";
  return checked(
    await fetchWithDeadline(endpoint, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...operation.payload, clientMutationId: operation.id }),
    }, 3_000),
  );
}

async function ensureCapacity(ownerUserId: number, file?: Blob) {
  const existing = await listOfflineOperations(ownerUserId);
  if (existing.length >= MAX_OPERATIONS_PER_USER)
    throw new Error("The offline queue is full. Reconnect or review pending changes first.");
  if (!file) return;
  if (navigator.storage?.persist)
    void navigator.storage.persist().catch(() => false);
  const estimate = navigator.storage?.estimate
    ? await Promise.race([
        navigator.storage.estimate().catch(() => null),
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 500)),
      ])
    : null;
  if (
    estimate?.quota &&
    typeof estimate.usage === "number" &&
    estimate.quota - estimate.usage < file.size * 1.2
  ) {
    throw new Error("This device does not have enough protected offline storage for that file.");
  }
}

async function enqueue(operation: OfflineOperation) {
  const jsonSize = new Blob([JSON.stringify(operation.payload)]).size;
  if (jsonSize > MAX_JSON_BYTES)
    throw new Error("This change is too large for the protected offline queue.");
  await ensureCapacity(operation.ownerUserId, operation.file);
  await putOperation(operation);
  void requestBackgroundSync();
}

function buildOperation(input: {
  ownerUserId: number;
  kind: OfflineOperationKind;
  payload: Record<string, unknown>;
  file?: Blob;
  filename?: string;
  mimeType?: string;
}): OfflineOperation {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    ownerUserId: input.ownerUserId,
    kind: input.kind,
    state: "pending" as const,
    payload: input.payload,
    file: input.file,
    filename: input.filename,
    mimeType: input.mimeType,
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    nextAttemptAt: now,
    lastError: null,
  };
}

export async function sendOrQueueOfflineOperation(input: {
  ownerUserId: number;
  kind: "post.create" | "message.send";
  payload: Record<string, unknown>;
}): Promise<OfflineDispatchResult> {
  const operation = buildOperation(input);
  if (navigator.onLine) {
    try {
      const value = await execute(operation);
      queueChanged({ kind: operation.kind, outcome: "sent", value });
      return { state: "sent", id: operation.id, value };
    } catch (error) {
      if (!retryable(error)) throw error;
      operation.lastError = safeMessage(
        error instanceof Error ? error.message : null,
        "Waiting for a reliable connection",
      );
    }
  }
  await enqueue(operation);
  return { state: "queued", id: operation.id };
}

export async function sendOrQueueMediaUpload(input: {
  ownerUserId: number;
  file: File;
  kind: "photo" | "video" | "audio";
  visibility: "public" | "private";
}): Promise<OfflineDispatchResult> {
  const operation = buildOperation({
    ownerUserId: input.ownerUserId,
    kind: "media.upload",
    payload: { kind: input.kind, visibility: input.visibility },
    file: input.file,
    filename: input.file.name.slice(0, 255),
    mimeType: input.file.type,
  });
  if (navigator.onLine) {
    try {
      const value = await execute(operation);
      queueChanged({ kind: operation.kind, outcome: "sent", value });
      return { state: "sent", id: operation.id, value };
    } catch (error) {
      if (!retryable(error)) throw error;
      operation.lastError = safeMessage(
        error instanceof Error ? error.message : null,
        "Upload protected until the connection recovers",
      );
    }
  }
  await enqueue(operation);
  return { state: "queued", id: operation.id };
}

export async function listOfflineOperations(ownerUserId: number) {
  return (await allOperations())
    .filter((operation) => operation.ownerUserId === ownerUserId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function flushOfflineOperations(ownerUserId: number) {
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    if (!navigator.onLine) return;
    const now = Date.now();
    const operations = await listOfflineOperations(ownerUserId);
    for (const operation of operations) {
      if (operation.state === "blocked" || operation.nextAttemptAt > now) continue;
      if (now - operation.createdAt > MAX_AGE_MS) {
        await putOperation({
          ...operation,
          state: "blocked",
          updatedAt: now,
          lastError: "This change is more than seven days old and needs review.",
        });
        continue;
      }
      await putOperation({ ...operation, state: "sending", updatedAt: Date.now() });
      try {
        const value = await execute(operation);
        await removeOperation(operation.id);
        queueChanged({ kind: operation.kind, outcome: "sent", value });
      } catch (error) {
        const status = error instanceof OfflineHttpError ? error.status : 0;
        const attempts = operation.attempts + 1;
        const shouldRetry = isRetryableOfflineStatus(status) || status === 401;
        await putOperation({
          ...operation,
          state: shouldRetry ? "pending" : "blocked",
          attempts,
          nextAttemptAt: Date.now() + (status === 401 ? 60_000 : retryDelayMs(attempts)),
          updatedAt: Date.now(),
          lastError: safeMessage(
            error instanceof Error ? error.message : null,
            shouldRetry ? "Waiting to retry" : "This change needs review",
          ),
        });
        if (!shouldRetry || status === 401 || !navigator.onLine) break;
      }
    }
  })().finally(() => {
    flushPromise = null;
    queueChanged();
  });
  return flushPromise;
}

export async function retryBlockedOfflineOperations(ownerUserId: number) {
  const now = Date.now();
  for (const operation of await listOfflineOperations(ownerUserId)) {
    if (operation.state !== "blocked") continue;
    await putOperation({
      ...operation,
      state: "pending",
      attempts: 0,
      nextAttemptAt: now,
      updatedAt: now,
      lastError: null,
    });
  }
  await flushOfflineOperations(ownerUserId);
}

export async function discardBlockedOfflineOperations(ownerUserId: number) {
  for (const operation of await listOfflineOperations(ownerUserId)) {
    if (operation.state === "blocked") await removeOperation(operation.id);
  }
}

export async function purgeOfflineOperationsForOtherUsers(ownerUserId: number) {
  for (const operation of await allOperations()) {
    if (operation.ownerUserId !== ownerUserId) await removeOperation(operation.id);
  }
}

export async function clearOfflineOperations() {
  await transact<void>("readwrite", (store, resolve, reject) => {
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }).catch(() => undefined);
  localStorage.removeItem(FALLBACK_KEY);
  queueChanged();
}

export async function requestBackgroundSync() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.ready.catch(() => null);
  const sync = registration && "sync" in registration
    ? (registration as ServiceWorkerRegistration & {
        sync: { register(tag: string): Promise<void> };
      }).sync
    : null;
  await sync?.register("creativesos-offline-outbox").catch(() => undefined);
}

export const offlineQueueEvent = QUEUE_EVENT;
