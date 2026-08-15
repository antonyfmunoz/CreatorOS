import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Clock3, Loader2, MessageSquare, Send, Users } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

type Participant = { id: number; username: string; displayName: string; profileImageUrl?: string | null; role: "owner" | "editor" | "reviewer" };
type WorkspaceNote = { id: string; body: string; positionMs: number; status: "open" | "resolved"; createdAt: string; author: Pick<Participant, "id" | "username" | "displayName" | "profileImageUrl"> | null };
type WorkspacePayload = {
  project: { id: string; name: string; duration: number; mediaKind: "video" | "audio" };
  access: { role: "owner" | "editor" | "reviewer"; canManage: boolean };
  version: { id: string; label: string; revision: number; reviewStatus: string; createdAt: string } | null;
  media: { url: string; expiresAt?: string | null } | null;
  participants: Participant[];
  notes: WorkspaceNote[];
};

function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function CutStudioWorkspacePage() {
  const { id = "" } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const player = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [positionMs, setPositionMs] = useState(0);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await apiRequest("GET", `/api/cut/workspace/projects/${id}`);
    setWorkspace(await response.json() as WorkspacePayload);
  }, [id]);

  useEffect(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : "This workspace is unavailable")); }, [load]);

  const addNote = async () => {
    if (!body.trim()) return;
    setBusy(true); setError("");
    try {
      await apiRequest("POST", `/api/cut/workspace/projects/${id}/notes`, { body, positionMs });
      setBody(""); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The note could not be added"); }
    finally { setBusy(false); }
  };

  if (error && !workspace) return <main className="flex min-h-screen items-center justify-center bg-black p-6 text-white"><section className="max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 p-8 text-center"><h1 className="text-xl font-bold">Workspace unavailable</h1><p className="mt-2 text-sm leading-6 text-zinc-400">{error}</p></section></main>;
  if (!workspace) return <main className="flex min-h-screen items-center justify-center bg-black text-white"><Loader2 className="h-8 w-8 animate-spin text-[#1d9bf0]"/></main>;

  return <main className="min-h-screen bg-black text-white">
    <header className="border-b border-zinc-800 bg-zinc-950 px-4 py-3"><div className="mx-auto flex max-w-6xl items-center gap-3"><Button size="icon" variant="ghost" aria-label="Back to CutStudio" onClick={() => setLocation("/cut-studio")}><ArrowLeft/></Button><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-widest text-[#1d9bf0]">CutStudio workspace</p><h1 className="truncate text-lg font-bold">{workspace.project.name}</h1></div><span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-bold capitalize text-zinc-300">{workspace.access.role}</span></div></header>
    <div className="mx-auto grid max-w-6xl gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-4">
        <div className="flex min-h-72 items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">{workspace.media ? workspace.project.mediaKind === "audio" ? <audio ref={(node) => { player.current = node; }} className="w-[90%]" src={workspace.media.url} controls onTimeUpdate={(event) => setPositionMs(Math.round(event.currentTarget.currentTime * 1_000))}/> : <video ref={(node) => { player.current = node; }} aria-label="Workspace review media" className="max-h-[70vh] w-full bg-black object-contain" src={workspace.media.url} controls onTimeUpdate={(event) => setPositionMs(Math.round(event.currentTarget.currentTime * 1_000))}/> : <p className="text-sm text-zinc-500">The owner has not shared a rendered version yet.</p>}</div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-[#1d9bf0]"/><h2 className="font-bold">Workspace note</h2><button className="ml-auto rounded bg-black px-2 py-1 text-xs font-bold text-[#1d9bf0]" onClick={() => setPositionMs(Math.round((player.current?.currentTime ?? 0) * 1_000))}>{formatTime(positionMs)}</button></div><p className="mt-1 text-xs text-zinc-500">Use @username to notify a workspace participant.</p><textarea aria-label="Workspace note" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Add feedback or mention a teammate…" className="mt-3 min-h-24 w-full rounded-xl border border-zinc-700 bg-black p-3 text-sm outline-none focus:border-[#1d9bf0]"/><Button className="mt-2" disabled={!body.trim() || busy} onClick={() => void addNote()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4"/>}Add workspace note</Button></div>
        {error && <p role="alert" className="rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</p>}
      </section>
      <aside className="space-y-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><h2 className="flex items-center gap-2 font-bold"><Users className="h-4 w-4 text-[#1d9bf0]"/>Participants</h2><div className="mt-3 space-y-2">{workspace.participants.map((participant) => <div key={participant.id} className="flex items-center gap-3 rounded-xl bg-black p-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-xs font-black">{participant.displayName.slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{participant.displayName}</span><span className="block truncate text-[11px] text-zinc-500">@{participant.username}</span></span><span className="text-[10px] font-bold capitalize text-zinc-600">{participant.role}</span></div>)}</div></div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><h2 className="font-bold">Notes · {workspace.notes.filter((note) => note.status === "open").length}</h2><div className="mt-3 space-y-2">{workspace.notes.length ? workspace.notes.map((note) => <button key={note.id} className="w-full rounded-xl border border-zinc-800 bg-black p-3 text-left" onClick={() => { if (player.current) player.current.currentTime = note.positionMs / 1_000; setPositionMs(note.positionMs); }}><span className="flex items-center gap-1 text-xs font-bold text-[#1d9bf0]"><Clock3 className="h-3 w-3"/>{formatTime(note.positionMs)}</span><p className="mt-1 text-sm leading-5">{note.body}</p><p className="mt-2 text-[11px] text-zinc-600">{note.author?.displayName ?? "Workspace member"}</p></button>) : <p className="py-6 text-center text-sm text-zinc-600">No workspace notes yet.</p>}</div></div>
      </aside>
    </div>
  </main>;
}
