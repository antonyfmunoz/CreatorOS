import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { disableCutRecovery, readCutRecoveryCopies, recoveryPreferenceKey, removeCutRecoveryCopy, withCutRecoveryLock, writeCutRecoveryCopy, type CutRecoveryCopy } from "@/lib/cut-local-recovery";
import type { CutEdl } from "@shared/cut-studio";

type Props = { authorizedUserId: number; project: { id: string; businessId: string; revision: number; edl: CutEdl }; draft: CutEdl; busy: boolean; onRestore: (copy: CutRecoveryCopy) => Promise<void> };

export function CutStudioRecovery({ authorizedUserId, project, draft, busy, onRestore }: Props) {
  const { user, isSignedIn } = useAuth();
  // A distinct writer per mount prevents two tabs from overwriting each other's
  // drafts. A reload discovers its previous writer only after authorized GETs.
  const writerId = useRef(crypto.randomUUID());
  const [enabled, setEnabled] = useState(false);
  const [copies, setCopies] = useState<CutRecoveryCopy[]>([]);
  const [status, setStatus] = useState("");
  const [restoring, setRestoring] = useState(false);
  const dirty = JSON.stringify(project.edl) !== JSON.stringify(draft);
  const accountId = isSignedIn && user?.id === authorizedUserId ? user.id : undefined;

  useEffect(() => {
    setEnabled(false); setCopies([]); setStatus("");
    if (!accountId) return;
    let disposed = false;
    void withCutRecoveryLock(accountId, () => { if (!disposed) setEnabled(localStorage.getItem(recoveryPreferenceKey(accountId)) === "true"); })
      .catch(() => { if (!disposed) setStatus("Device recovery is unavailable in this browser. Server saving is unchanged."); });
    return () => { disposed = true; };
  }, [accountId]);

  useEffect(() => {
    if (!accountId || !enabled) return;
    let disposed = false;
    const scope = { userId: accountId, businessId: project.businessId, projectId: project.id };
    const refresh = async () => {
      try { await withCutRecoveryLock(accountId, () => {
        if (disposed) return;
        let stored = readCutRecoveryCopies(localStorage, scope);
        // Verified server equality closes a recovery record even if the prior
        // page crashed between its successful save and local cleanup.
        for (const copy of stored) if (JSON.stringify(copy.edl) === JSON.stringify(project.edl)) removeCutRecoveryCopy(localStorage, copy);
        if (dirty) {
          writeCutRecoveryCopy(localStorage, { version: 1, ...scope, writerId: writerId.current, baseRevision: project.revision, updatedAt: Date.now(), edl: draft });
          setStatus("Current timeline recovery copy kept on this device. Not yet saved to the server.");
        } else setStatus("");
        stored = readCutRecoveryCopies(localStorage, scope);
        setCopies(stored.filter((copy) => copy.writerId !== writerId.current));
      }); } catch (error) { if (!disposed) setStatus(`Device recovery could not be updated. ${error instanceof Error ? error.message : "Browser storage is unavailable."} Server saving is unchanged.`); }
    };
    void refresh();
    const storageChanged = (event: StorageEvent) => {
      if (event.key === recoveryPreferenceKey(accountId) && event.newValue !== "true") { setEnabled(false); setCopies([]); setStatus(""); return; }
      // Do not rewrite the current writer from a storage event (which would
      // make two tabs repeatedly trigger each other).
      void withCutRecoveryLock(accountId, () => { if (!disposed) setCopies(readCutRecoveryCopies(localStorage, scope).filter((copy) => copy.writerId !== writerId.current)); })
        .catch(() => { if (!disposed) setStatus("Recovery copies could not be refreshed from this device."); });
    };
    window.addEventListener("storage", storageChanged);
    return () => { disposed = true; window.removeEventListener("storage", storageChanged); };
  }, [accountId, enabled, project.id, project.businessId, project.revision, project.edl, draft, dirty]);

  if (!accountId) return null;
  const toggle = async (value: boolean) => {
    if (!value && !window.confirm("Delete this account's CutStudio recovery copies from this device and turn recovery off? Server projects are unchanged.")) return;
    try {
      await withCutRecoveryLock(accountId, () => {
      if (value) localStorage.setItem(recoveryPreferenceKey(accountId), "true");
      else {
        disableCutRecovery(localStorage, accountId); setCopies([]); setStatus("");
      }
      setEnabled(value);
      });
    } catch { setStatus("Browser storage is unavailable. Recovery settings were not changed."); }
  };
  const discard = async (copy: CutRecoveryCopy) => {
    if (!window.confirm("Discard this device recovery copy? This cannot be undone. The server project is unchanged.")) return;
    try { await withCutRecoveryLock(accountId, () => { removeCutRecoveryCopy(localStorage, copy); setCopies(readCutRecoveryCopies(localStorage, copy).filter((item) => item.writerId !== writerId.current)); }); }
    catch { setStatus("The recovery copy could not be removed. It has not been marked discarded."); }
  };
  const download = (copy: CutRecoveryCopy) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, baseRevision: copy.baseRevision, edl: copy.edl }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `cutstudio-recovery-${copy.writerId}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section aria-label="Timeline recovery" className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-300">
    <div className="flex items-center justify-between gap-3"><span>Keep recovery copies on this device</span><Switch aria-label="Keep timeline recovery copies on this device" checked={enabled} onCheckedChange={toggle}/></div>
    <p className="mt-2 text-xs leading-5 text-zinc-500">Optional browser storage contains timeline text and edit settings, not media files. Avoid shared devices. Copies expire after 7 days, are removed after confirmed saving, and may be cleared by your browser. This is not a backup or an offline media editor.</p>
    {status && <p role="status" className="mt-2 text-xs">{status}</p>}
    {copies.map((copy) => <div key={copy.writerId} className="mt-3 rounded-lg border border-zinc-700 p-3">
      <p>Recovered timeline · {new Date(copy.updatedAt).toLocaleString()}</p>
      <p className="mt-1 text-xs">Saved locally from server revision {copy.baseRevision}. {copy.baseRevision !== project.revision ? "The server has changed. Download this copy for comparison; automatic replacement is blocked." : "Restoring will replace the current timeline and save this copy. Download it first if you want to inspect it."}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy || dirty || restoring || copy.baseRevision !== project.revision} onClick={async () => { setRestoring(true); try { await onRestore(copy); } catch (error) { setStatus(error instanceof Error ? error.message : "Recovery could not be applied."); } finally { setRestoring(false); } }}>Restore and save timeline copy</Button>
        <Button size="sm" variant="outline" onClick={() => download(copy)}>Download recovery copy</Button>
        <Button size="sm" variant="outline" onClick={() => discard(copy)}>Discard recovery copy</Button>
      </div>
    </div>)}
  </section>;
}
