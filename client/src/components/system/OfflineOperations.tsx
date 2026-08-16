import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CloudOff, RefreshCw, Trash2, Wifi } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { queryClient } from "@/lib/queryClient";
import { useMessaging } from "@/lib/stores";
import {
  clearOfflineOperations,
  discardBlockedOfflineOperations,
  flushOfflineOperations,
  listOfflineOperations,
  offlineQueueEvent,
  purgeOfflineOperationsForOtherUsers,
  retryBlockedOfflineOperations,
  type OfflineOperation,
} from "@/lib/offline-queue";
import { nativeWakeEvent } from "@/lib/native-runtime";

function operationLabel(operation: OfflineOperation) {
  if (operation.kind === "post.create") return "Post";
  if (operation.kind === "message.send") return "Message";
  return operation.filename ? `Upload · ${operation.filename}` : "Media upload";
}

export default function OfflineOperations() {
  const { user, isLoading, isSignedIn } = useAuth();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [operations, setOperations] = useState<OfflineOperation[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const selectedConversation = useMessaging((state) => state.selectedConversation);

  const refresh = useCallback(async () => {
    if (!user) return setOperations([]);
    setOperations(await listOfflineOperations(user.id).catch(() => []));
  }, [user]);

  const flush = useCallback(async () => {
    if (!user || !navigator.onLine) return;
    await flushOfflineOperations(user.id);
    await refresh();
  }, [refresh, user]);

  useEffect(() => {
    if (isLoading) return;
    if (!isSignedIn) {
      void clearOfflineOperations().catch(() => undefined);
      return;
    }
    // A signed-in identity may be temporarily unavailable after an offline
    // reload. Preserve the device outbox until the session is definitively
    // signed out; otherwise a transient auth/profile read would destroy work.
    if (!user) return;
    void purgeOfflineOperationsForOtherUsers(user.id)
      .then(refresh)
      .then(flush)
      .catch(() => undefined);
  }, [flush, isLoading, isSignedIn, refresh, user]);

  useEffect(() => {
    const connectivity = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void flush();
    };
    const queueUpdate = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail;
      if (detail?.outcome === "sent") {
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: ["/api/posts"] }),
          queryClient.invalidateQueries({ queryKey: ["/api/media/assets"] }),
          queryClient.invalidateQueries({ queryKey: ["/api/media/collections"] }),
          user
            ? queryClient.invalidateQueries({
                queryKey: [`/api/users/${user.id}/conversations`],
              })
            : Promise.resolve(),
        ]);
        if (detail.kind === "message.send" && user) {
          void useMessaging.getState().fetchConversations(user.id);
          if (selectedConversation)
            void useMessaging.getState().fetchMessages(selectedConversation);
        }
      }
      void refresh();
    };
    const visibility = () => {
      if (document.visibilityState === "visible") connectivity();
    };
    const serviceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "creativesos:flush-offline-outbox") void flush();
    };
    window.addEventListener("online", connectivity);
    window.addEventListener("offline", connectivity);
    window.addEventListener(nativeWakeEvent, connectivity);
    window.addEventListener(offlineQueueEvent, queueUpdate);
    document.addEventListener("visibilitychange", visibility);
    navigator.serviceWorker?.addEventListener("message", serviceWorkerMessage);
    const interval = window.setInterval(() => void flush(), 30_000);
    return () => {
      window.removeEventListener("online", connectivity);
      window.removeEventListener("offline", connectivity);
      window.removeEventListener(nativeWakeEvent, connectivity);
      window.removeEventListener(offlineQueueEvent, queueUpdate);
      document.removeEventListener("visibilitychange", visibility);
      navigator.serviceWorker?.removeEventListener("message", serviceWorkerMessage);
      window.clearInterval(interval);
    };
  }, [flush, refresh, selectedConversation, user]);

  const blocked = useMemo(
    () => operations.filter((operation) => operation.state === "blocked"),
    [operations],
  );
  if (online && operations.length === 0) return null;

  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside
      aria-live="polite"
      className="fixed inset-x-3 top-[calc(max(.75rem,env(safe-area-inset-top))+3.75rem)] z-[120] mx-auto max-w-lg rounded-2xl border border-zinc-700 bg-zinc-950/95 p-3 text-white shadow-2xl backdrop-blur"
    >
      <div className="flex items-center gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${blocked.length ? "bg-red-500/15 text-red-300" : online ? "bg-[#1d9bf0]/15 text-[#1d9bf0]" : "bg-amber-500/15 text-amber-300"}`}>
          {blocked.length ? <AlertTriangle className="h-4 w-4" /> : online ? <Wifi className="h-4 w-4" /> : <CloudOff className="h-4 w-4" />}
        </span>
        <button className="min-w-0 flex-1 text-left" onClick={() => setExpanded((value) => !value)}>
          <strong className="block text-xs">
            {blocked.length
              ? `${blocked.length} offline change${blocked.length === 1 ? "" : "s"} need review`
              : online
                ? `Syncing ${operations.length} protected change${operations.length === 1 ? "" : "s"}`
                : "You’re offline — changes are protected"}
          </strong>
          <span className="mt-0.5 block text-[10px] text-zinc-400">
            {expanded ? "Hide details" : "View queue and recovery controls"}
          </span>
        </button>
        {online && !blocked.length && (
          <button disabled={busy} onClick={() => void act(flush)} aria-label="Sync offline changes now" className="rounded-full p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-40">
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>
      {expanded && (
        <div className="mt-3 border-t border-zinc-800 pt-2">
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {operations.map((operation) => (
              <li key={operation.id} className="rounded-xl bg-black px-3 py-2">
                <div className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="min-w-0 truncate font-bold">{operationLabel(operation)}</span>
                  <span className={operation.state === "blocked" ? "text-red-300" : "text-zinc-500"}>{operation.state}</span>
                </div>
                {operation.lastError && <p className="mt-1 text-[10px] leading-4 text-zinc-500">{operation.lastError}</p>}
              </li>
            ))}
          </ul>
          {blocked.length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button disabled={busy || !online} onClick={() => user && void act(() => retryBlockedOfflineOperations(user.id))} className="rounded-lg bg-[#1d9bf0] px-3 py-2 text-[10px] font-black text-black disabled:opacity-40">
                Retry blocked
              </button>
              <button disabled={busy} onClick={() => user && window.confirm("Discard blocked offline changes from this device?") && void act(() => discardBlockedOfflineOperations(user.id))} className="inline-flex items-center justify-center gap-1 rounded-lg border border-zinc-700 px-3 py-2 text-[10px] font-bold text-zinc-300 disabled:opacity-40">
                <Trash2 className="h-3 w-3" /> Discard
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
