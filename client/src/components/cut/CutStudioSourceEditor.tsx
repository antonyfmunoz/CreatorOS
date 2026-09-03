import { useState } from "react";
import { Button } from "@/components/ui/button";
import { assertCutSourceTextBudget, buildCutSourceZip, cutSourceEditorLimits, validateCutSourceFiles, type CutSourceFile } from "@shared/cut-code-authoring";
import { generateCutSourceLockfile } from "@shared/cut-code-lockfile";

export type CutSourceDraft = { files: CutSourceFile[]; entrypoint: string; saved: string | null };
export const sourceDraftIdentity = (draft: Pick<CutSourceDraft, "files" | "entrypoint">) => JSON.stringify([draft.entrypoint, draft.files]);
export const sourceDraftDirty = (draft: CutSourceDraft | null) => Boolean(draft && sourceDraftIdentity(draft) !== draft.saved);
const field = "mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-xs text-white outline-none focus:border-[#1d9bf0]";

export function CutStudioSourceEditor({ draft, busy, onChange, onSave }: { draft: CutSourceDraft; busy: boolean; onChange: (draft: CutSourceDraft) => void; onSave: (withLockfile?: boolean) => void }) {
  const [selectedPath, selectPath] = useState(draft.entrypoint);
  const [newPath, setNewPath] = useState("src/Title.tsx");
  const [message, setMessage] = useState("");
  const selected = draft.files.find((file) => file.path === selectedPath) ?? draft.files[0];
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
  return <div aria-label="Composition source editor" className="mt-3 space-y-3 rounded-xl border border-zinc-700 p-3">
    <p className="text-xs leading-5 text-zinc-400">Edit files as text. No code runs on this page. Save creates a new private ZIP; existing packages are never overwritten. Save with a matching lockfile for the runtime's pinned React/Three dependencies, or supply your own lockfile separately. Nothing is installed.</p>
    <label className="block text-xs text-zinc-400">Entrypoint<select aria-label="Source editor entrypoint" className={field} disabled={busy} value={draft.entrypoint} onChange={(event) => onChange({ ...draft, entrypoint: event.target.value })}>{draft.files.filter((file) => /\.tsx?$/.test(file.path)).map((file) => <option key={file.path}>{file.path}</option>)}</select></label>
    <label className="block text-xs text-zinc-400">File<select aria-label="Source editor file" className={field} value={selected?.path ?? ""} onChange={(event) => selectPath(event.target.value)}>{draft.files.map((file) => <option key={file.path}>{file.path}</option>)}</select></label>
    {selected && <>
      <textarea aria-label="Source file contents" spellCheck={false} autoCapitalize="off" autoCorrect="off" maxLength={cutSourceEditorLimits.fileBytes} className={`${field} min-h-64 font-mono`} disabled={busy} value={selected.content} onChange={(event) => {
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
}
