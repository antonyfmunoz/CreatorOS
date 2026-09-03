import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { assertCutSourceTextBudget, buildCutSourceZip, cutSourceEditorLimits, validateCutSourceFiles, type CutSourceFile } from "@shared/cut-code-authoring";
import { generateCutSourceLockfile } from "@shared/cut-code-lockfile";

export type CutSourceDraft = { files: CutSourceFile[]; entrypoint: string; saved: string | null };
export const sourceDraftIdentity = (draft: Pick<CutSourceDraft, "files" | "entrypoint">) => JSON.stringify([draft.entrypoint, draft.files]);
export const sourceDraftDirty = (draft: CutSourceDraft | null) => Boolean(draft && sourceDraftIdentity(draft) !== draft.saved);
const field = "mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-xs text-white outline-none focus:border-[#1d9bf0]";

export function CutStudioSourceEditor({ draft, busy, selectedPath, onSelectPath: selectPath, canUndo, canRedo, onUndo, onRedo, onChange, onSave }: { draft: CutSourceDraft; busy: boolean; selectedPath: string; onSelectPath: (path: string) => void; canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void; onChange: (draft: CutSourceDraft) => void; onSave: (withLockfile?: boolean) => void }) {
  const [newPath, setNewPath] = useState("src/Title.tsx");
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const workspaceViewport = useRef<HTMLDivElement>(null);
  const fileSelector = useRef<HTMLLabelElement>(null);
  const selection = useRef<{ path: string; start: number; end: number; direction: "forward" | "backward" | "none"; top: number; left: number } | null>(null);
  const selected = draft.files.find((file) => file.path === selectedPath) ?? draft.files[0];
  const changeView = (next: boolean) => {
    const field = textarea.current;
    if (field && selected) selection.current = { path: selected.path, start: field.selectionStart, end: field.selectionEnd, direction: field.selectionDirection, top: field.scrollTop, left: field.scrollLeft };
    setExpanded(next);
  };
  const restoreSelection = () => {
    const saved = selection.current; const field = textarea.current;
    if (field && saved?.path === selected?.path) {
      field.setSelectionRange(saved.start, saved.end, saved.direction);
      field.scrollTop = saved.top; field.scrollLeft = saved.left;
    }
  };
  const revealSource = () => {
    const field = textarea.current; const viewport = workspaceViewport.current;
    if (!field || !viewport || document.activeElement !== field) return;
    const fieldBox = field.getBoundingClientRect(); const viewportBox = viewport.getBoundingClientRect();
    // The selected file remains sticky while the workspace scrolls. Reserve
    // its actual height so refocusing code cannot hide the filename or place
    // the first editable line underneath that control.
    const sourceTop = viewportBox.top + (fileSelector.current?.getBoundingClientRect().height ?? 0) + 8;
    if (fieldBox.top < sourceTop || fieldBox.bottom > viewportBox.bottom - 8) {
      viewport.scrollTop += fieldBox.top - sourceTop;
    }
  };
  useLayoutEffect(restoreSelection, [expanded]);
  useLayoutEffect(() => {
    const viewport = workspaceViewport.current;
    if (!expanded || !viewport) return;
    const observer = new ResizeObserver(revealSource);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [expanded]);
  let invalid = "";
  try { validateCutSourceFiles(draft.files, draft.entrypoint); } catch (error) { invalid = error instanceof Error ? error.message : "Invalid source files"; }
  let lockfileUnavailable = "";
  try { generateCutSourceLockfile(draft.files); } catch (error) { lockfileUnavailable = error instanceof Error ? error.message : "A matching lockfile must be supplied separately."; }
  const exportZip = () => {
    try {
      const zip = buildCutSourceZip(draft.files, draft.entrypoint);
      const url = URL.createObjectURL(new Blob([zip], { type: "application/zip" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "cut-composition.zip"; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setMessage("ZIP downloaded. Downloading does not save this draft to your project.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "ZIP export failed"); }
  };
  const editor = <div aria-label="Composition source editor" className="mt-3 min-w-0 space-y-3 rounded-xl border border-zinc-700 p-3">
    <p className="text-xs leading-5 text-zinc-400">Edit files as text. No code runs on this page. Save creates a new private ZIP; existing packages are never overwritten. Save with a matching lockfile for the runtime's pinned React/Three dependencies, or supply your own lockfile separately. Nothing is installed.</p>
    <div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" disabled={busy || !canUndo} aria-keyshortcuts="Control+Z Meta+Z" onClick={onUndo}>Undo source edit</Button><Button size="sm" variant="outline" disabled={busy || !canRedo} aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y" onClick={onRedo}>Redo source edit</Button><span className="text-[10px] text-zinc-500">Bounded undo history stays in memory until this project closes or another source package opens.</span></div>
    <label className="block text-xs text-zinc-400">Entrypoint<select aria-label="Source editor entrypoint" className={field} disabled={busy} value={draft.entrypoint} onChange={(event) => onChange({ ...draft, entrypoint: event.target.value })}>{draft.files.filter((file) => /\.tsx?$/.test(file.path)).map((file) => <option key={file.path}>{file.path}</option>)}</select></label>
    <label ref={fileSelector} className={`block text-xs text-zinc-400 ${expanded ? "sticky top-0 z-10 bg-black pb-2" : ""}`}>File<select aria-label="Source editor file" className={field} value={selected?.path ?? ""} onChange={(event) => selectPath(event.target.value)}>{draft.files.map((file) => <option key={file.path}>{file.path}</option>)}</select></label>
    {selected && <>
      <textarea ref={textarea} aria-label="Source file contents" spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off" style={{ tabSize: 2 }} maxLength={cutSourceEditorLimits.fileBytes} className={`${field} ${expanded ? "min-h-[45dvh] text-sm" : "min-h-64"} font-mono`} disabled={busy} value={selected.content} onFocus={() => { if (expanded) requestAnimationFrame(revealSource); }} onKeyDown={(event) => {
        if ((!event.ctrlKey && !event.metaKey) || event.altKey || event.nativeEvent.isComposing) return;
        const key = event.key.toLowerCase();
        if (key !== "z" && key !== "y") return;
        event.preventDefault(); event.stopPropagation();
        if (!busy) { if (key === "y" || event.shiftKey) onRedo(); else onUndo(); }
      }} onChange={(event) => {
        const files = draft.files.map((file) => file.path === selected.path ? { ...file, content: event.target.value } : file);
        try { assertCutSourceTextBudget(files); onChange({ ...draft, files }); setMessage(""); }
        catch (error) { setMessage(`${error instanceof Error ? error.message : "Source is too large"} Previous draft retained.`); }
      }}/>
      <Button size="sm" variant="ghost" disabled={busy || selected.path === "package.json" || selected.path === draft.entrypoint} onClick={() => { if (window.confirm(`Remove ${selected.path} from this draft?`)) onChange({ ...draft, files: draft.files.filter((file) => file.path !== selected.path) }); }}>Remove selected source file</Button>
    </>}
    <div className="flex gap-2"><input aria-label="New source file path" maxLength={240} className={field} disabled={busy} value={newPath} onChange={(event) => setNewPath(event.target.value)} placeholder="src/Title.tsx"/><Button size="sm" variant="outline" disabled={busy || draft.files.length >= 64} onClick={() => {
      try {
        const files = [...draft.files, { path: newPath, content: "" }]; validateCutSourceFiles(files, draft.entrypoint);
        onChange({ ...draft, files }); selectPath(newPath); setMessage("");
      } catch (error) { setMessage(error instanceof Error ? error.message : "Cannot add file"); }
    }}>Add source file</Button></div>
    {invalid && <p role="alert" className="text-xs text-amber-300">{invalid}</p>}
    <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy || Boolean(invalid) || !sourceDraftDirty(draft)} onClick={() => onSave(false)}>Save new private source ZIP</Button><Button size="sm" variant="outline" disabled={busy || Boolean(invalid) || Boolean(lockfileUnavailable)} onClick={() => onSave(true)}>Save source + matching lockfile</Button><Button size="sm" variant="outline" disabled={busy || Boolean(invalid)} onClick={exportZip}>Download source ZIP</Button></div>
    {lockfileUnavailable && <p className="text-xs text-amber-300">{lockfileUnavailable}</p>}
    <p role="status" className="text-xs text-zinc-400">{sourceDraftDirty(draft) ? "Unsaved source draft. Save or download before leaving." : "Source package saved to this project."}</p>
    {message && <p className="text-xs text-zinc-400">{message}</p>}
  </div>;
  return <Dialog open={expanded} onOpenChange={changeView}>
    <div className="mt-3">
      <DialogTrigger asChild><Button size="sm" variant="outline">Expand source editor</Button></DialogTrigger>
      {!expanded && editor}
    </div>
    {expanded && <DialogContent className="flex h-[94dvh] w-[96vw] max-w-[1400px] flex-col gap-3 overflow-hidden border-zinc-700 bg-black p-4 text-white" onOpenAutoFocus={(event) => { event.preventDefault(); textarea.current?.focus({ preventScroll: true }); restoreSelection(); revealSource(); }}>
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div><DialogTitle>Composition source workspace</DialogTitle><DialogDescription className="mt-2 text-xs text-zinc-400">More room for the same draft. Returning to the studio keeps your text, selected file and undo history. Saving still creates a private package; no code executes here.</DialogDescription></div>
        <DialogClose asChild><Button size="sm" variant="outline">Return to studio</Button></DialogClose>
      </div>
      <div ref={workspaceViewport} role="region" aria-label="Source workspace viewport" className="min-h-0 flex-1 overflow-y-auto">{editor}</div>
    </DialogContent>}
  </Dialog>;
}
