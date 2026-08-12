import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Captions, Check, ChevronRight, Download, Film, Loader2, Play, Plus, Redo2, Scissors, Sparkles, Trash2, Undo2, Upload, WandSparkles, X } from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { removeCutRange, restoreCutRange, splitCutAt, type CutEdl, type CutTranscript } from "@shared/cut-studio";

type Project = { id: string; name: string; duration: number; mediaKind: "video" | "audio"; edl: CutEdl; transcript: CutTranscript | null; revision: number; updatedAt: string; jobs?: Job[] };
type Job = { id: string; kind: "transcribe" | "highlights" | "render"; state: "queued" | "running" | "done" | "error"; detail: string; progress: number; artifactAssetId?: string | null; output?: { candidates?: Highlight[]; filename?: string } };
type Highlight = { id: string; start: number; end: number; title: string; score: number };

function formatTime(value: number) {
  const seconds = Math.max(0, value || 0);
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

async function mediaDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const element = document.createElement(file.type.startsWith("audio/") ? "audio" : "video");
    const url = URL.createObjectURL(file);
    element.preload = "metadata";
    element.onloadedmetadata = () => { const duration = element.duration; URL.revokeObjectURL(url); Number.isFinite(duration) && duration > 0 ? resolve(duration) : reject(new Error("Could not read the media duration")); };
    element.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This media file could not be opened")); };
    element.src = url;
  });
}

export default function CutStudioPage() {
  const [, setLocation] = useLocation();
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [edl, setEdl] = useState<CutEdl | null>(null);
  const [history, setHistory] = useState<CutEdl[]>([]);
  const [future, setFuture] = useState<CutEdl[]>([]);
  const [revision, setRevision] = useState(0);
  const [mediaUrl, setMediaUrl] = useState("");
  const [playhead, setPlayhead] = useState(0);
  const [selectedClip, setSelectedClip] = useState(0);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [prompt, setPrompt] = useState("");
  const [proposal, setProposal] = useState<{ edl: CutEdl; summary: string } | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [aspect, setAspect] = useState("9:16");
  const [captions, setCaptions] = useState(true);
  const [captionStyle, setCaptionStyle] = useState(1);
  const [cleanAudio, setCleanAudio] = useState(false);

  const refreshProjects = useCallback(async () => {
    const response = await apiRequest("GET", "/api/cut/projects");
    setProjects(await response.json());
  }, []);

  useEffect(() => { void refreshProjects().catch((error) => setMessage(error.message)); }, [refreshProjects]);

  const openProject = useCallback(async (id: string) => {
    setBusy("open"); setMessage("");
    try {
      const [projectResponse, mediaResponse] = await Promise.all([apiRequest("GET", `/api/cut/projects/${id}`), apiRequest("GET", `/api/cut/projects/${id}/media`)]);
      const next = await projectResponse.json() as Project;
      const secure = await mediaResponse.json() as { url: string };
      const projectJobs = next.jobs ?? [];
      setProject(next); setEdl(next.edl); setRevision(next.revision); setJobs(projectJobs); setMediaUrl(secure.url); setHistory([]); setFuture([]); setPlayhead(0); setSelectedClip(0); setHighlights(projectJobs.find((job) => job.kind === "highlights" && job.state === "done")?.output?.candidates ?? []);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not open the project"); }
    finally { setBusy(""); }
  }, []);

  const applyEdit = useCallback((next: CutEdl) => {
    if (!edl) return;
    setHistory((items) => [...items.slice(-49), edl]); setFuture([]); setEdl(next);
  }, [edl]);

  useEffect(() => {
    if (!project || !edl || JSON.stringify(edl) === JSON.stringify(project.edl)) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const response = await apiRequest("PUT", `/api/cut/projects/${project.id}/edl`, edl, { "If-Match": String(revision) });
        const saved = await response.json() as CutEdl;
        const nextRevision = Number(response.headers.get("X-EDL-Rev"));
        setRevision(nextRevision); setEdl(saved); setProject((value) => value ? { ...value, edl: saved, revision: nextRevision } : value); setMessage("Saved");
      } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save the edit"); }
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [edl, project, revision]);

  useEffect(() => {
    const active = jobs.filter((job) => job.state === "queued" || job.state === "running");
    if (!active.length) return;
    const timer = setInterval(async () => {
      const updated = await Promise.all(jobs.map(async (job) => active.some((item) => item.id === job.id) ? await (await apiRequest("GET", `/api/cut/jobs/${job.id}`)).json() as Job : job));
      setJobs(updated);
      const completedHighlight = updated.find((job) => job.kind === "highlights" && job.state === "done");
      if (completedHighlight?.output?.candidates) setHighlights(completedHighlight.output.candidates);
      if (updated.some((job, index) => jobs[index]?.state !== job.state && job.state === "done" && job.kind === "transcribe")) void openProject(project!.id);
    }, 1500);
    return () => clearInterval(timer);
  }, [jobs, openProject, project]);

  const uploadProject = async (file: File) => {
    const mediaKind = file.type.startsWith("audio/") ? "audio" : file.type.startsWith("video/") ? "video" : null;
    if (!mediaKind) return setMessage("Choose a video or audio file");
    setBusy("upload"); setMessage("Reading media…");
    try {
      const duration = await mediaDuration(file);
      const intent = await (await apiRequest("POST", "/api/assets/upload-intents", { kind: mediaKind, filename: file.name, mimeType: file.type, sizeBytes: file.size, visibility: "private" })).json() as { asset: { id: string }; upload: { uploadUrl: string } };
      setMessage("Uploading source media…");
      const stored = await fetch(intent.upload.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!stored.ok) throw new Error("The source upload did not complete");
      await apiRequest("POST", `/api/assets/${intent.asset.id}/complete`, {});
      const name = file.name.replace(/\.[^.]+$/, "");
      const created = await (await apiRequest("POST", "/api/cut/projects", { sourceAssetId: intent.asset.id, name, duration, mediaKind })).json() as Project;
      await refreshProjects(); await openProject(created.id);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create the project"); }
    finally { setBusy(""); }
  };

  const startJob = async (kind: "transcribe" | "highlights" | "render", body?: unknown) => {
    if (!project) return;
    setBusy(kind); setMessage("");
    try {
      const job = await (await apiRequest("POST", `/api/cut/projects/${project.id}/${kind}`, body ?? {})).json() as Job;
      setJobs((items) => [job, ...items]);
    } catch (error) { setMessage(error instanceof Error ? error.message : `Could not start ${kind}`); }
    finally { setBusy(""); }
  };

  const transcribe = async () => { await startJob("transcribe"); };
  const requestHighlights = async () => { await startJob("highlights"); };
  const render = async (clip?: { start: number; end: number }) => { await startJob("render", { aspect, captions, captionStyle, cleanAudio, clip }); };

  const seek = (time: number) => { setPlayhead(time); if (mediaRef.current) mediaRef.current.currentTime = time; };
  const onTime = () => {
    const media = mediaRef.current; if (!media || !edl) return;
    const current = media.currentTime; const clip = edl.clips.find((item) => current >= item.start && current < item.end);
    if (!clip) { const next = edl.clips.find((item) => item.start > current); if (next) media.currentTime = next.start; else media.pause(); }
    setPlayhead(media.currentTime);
  };

  const undo = () => { const prior = history.at(-1); if (!prior || !edl) return; setFuture((items) => [edl, ...items].slice(0, 50)); setHistory((items) => items.slice(0, -1)); setEdl(prior); };
  const redo = () => { const next = future[0]; if (!next || !edl) return; setHistory((items) => [...items, edl].slice(-50)); setFuture((items) => items.slice(1)); setEdl(next); };

  if (!project || !edl) return (
    <main className="min-h-screen bg-black pb-24 text-white">
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-zinc-800 bg-black px-4"><Button variant="ghost" size="icon" onClick={() => setLocation("/create")} aria-label="Back"><ArrowLeft /></Button><Film className="ml-2 h-5 w-5 text-[#1d9bf0]"/><h1 className="ml-2 text-lg font-bold">CutStudio</h1></header>
      <section className="mx-auto max-w-5xl px-4 py-8">
        <label className="flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-700 bg-zinc-950 px-6 text-center hover:border-[#1d9bf0]"><input className="sr-only" type="file" accept="video/*,audio/*" disabled={Boolean(busy)} onChange={(event) => event.target.files?.[0] && void uploadProject(event.target.files[0])}/>{busy ? <Loader2 className="h-9 w-9 animate-spin text-[#1d9bf0]"/> : <Upload className="h-9 w-9 text-[#1d9bf0]"/>}<h2 className="mt-4 text-xl font-bold">Start with your footage</h2><p className="mt-2 max-w-md text-sm leading-6 text-zinc-400">Upload private video or audio. CutStudio keeps the source secure while you edit, transcribe, caption, extract clips, and render.</p></label>
        {message && <p role="status" className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-300">{message}</p>}
        <h2 className="mt-10 text-sm font-bold uppercase tracking-wider text-zinc-500">Your projects</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{projects.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-2"><button onClick={() => void openProject(item.id)} className="flex min-w-0 flex-1 items-center gap-4 rounded-xl p-2 text-left hover:bg-zinc-900"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900"><Film/></span><span className="min-w-0 flex-1"><span className="block truncate font-bold">{item.name}</span><span className="text-xs text-zinc-500">{formatTime(item.duration)} · {item.mediaKind}</span></span><ChevronRight className="text-zinc-500"/></button><Button variant="ghost" size="icon" aria-label={`Delete ${item.name}`} onClick={async () => { if (!window.confirm(`Delete ${item.name}? The source asset remains in your private library.`)) return; await apiRequest("DELETE", `/api/cut/projects/${item.id}`); await refreshProjects(); }}><Trash2 className="h-4 w-4 text-zinc-500"/></Button></div>)}</div>
      </section>
    </main>
  );

  const clip = edl.clips[Math.min(selectedClip, edl.clips.length - 1)];
  const words = project.transcript?.segments.flatMap((segment) => segment.words) ?? [];
  const renders = jobs.filter((job) => job.kind === "render");
  const transcriptJob = jobs.find((job) => job.kind === "transcribe");
  const highlightJob = jobs.find((job) => job.kind === "highlights");
  return (
    <main className="min-h-screen bg-black pb-24 text-white">
      <header className="sticky top-0 z-30 flex h-14 items-center border-b border-zinc-800 bg-black px-3"><Button variant="ghost" size="icon" onClick={() => { setProject(null); setEdl(null); }} aria-label="Projects"><ArrowLeft/></Button><Scissors className="ml-1 h-5 w-5 text-[#1d9bf0]"/><h1 className="ml-2 min-w-0 flex-1 truncate font-bold">{project.name}</h1><Button variant="ghost" size="icon" disabled={!history.length} onClick={undo} aria-label="Undo"><Undo2/></Button><Button variant="ghost" size="icon" disabled={!future.length} onClick={redo} aria-label="Redo"><Redo2/></Button><a className="ml-1 rounded-lg border border-zinc-700 p-2" href={`/api/cut/projects/${project.id}/export.edl`} aria-label="Export EDL"><Download className="h-4 w-4"/></a></header>
      <div className="mx-auto grid max-w-[1500px] gap-4 p-3 lg:grid-cols-[1fr_360px]">
        <section className="min-w-0 space-y-4">
          <div className="flex min-h-[280px] items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
            {project.mediaKind === "video" ? <video ref={(node) => { mediaRef.current = node; }} className="max-h-[58vh] w-full bg-black object-contain" src={mediaUrl} controls onTimeUpdate={onTime}/> : <audio ref={(node) => { mediaRef.current = node; }} className="w-[90%]" src={mediaUrl} controls onTimeUpdate={onTime}/>} 
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="mb-3 flex items-center justify-between"><div><h2 className="font-bold">Timeline</h2><p className="text-xs text-zinc-500">{formatTime(playhead)} / {formatTime(project.duration)} · {edl.clips.length} clips</p></div><Button size="sm" variant="outline" onClick={() => applyEdit(splitCutAt(edl, playhead))}><Scissors className="mr-2 h-4 w-4"/>Split</Button></div>
            <div className="relative h-20 overflow-hidden rounded-xl bg-zinc-900" onClick={(event) => { const box = event.currentTarget.getBoundingClientRect(); seek(((event.clientX - box.left) / box.width) * project.duration); }}>
              {edl.clips.map((item, index) => <button key={`${item.start}-${item.end}`} className={`absolute top-2 h-14 rounded-md border text-xs font-bold ${selectedClip === index ? "border-white bg-[#1d9bf0] text-black" : "border-zinc-600 bg-zinc-700"}`} style={{ left: `${(item.start / project.duration) * 100}%`, width: `${Math.max(0.5, ((item.end - item.start) / project.duration) * 100)}%` }} onClick={(event) => { event.stopPropagation(); setSelectedClip(index); seek(item.start); }} aria-label={`Clip ${index + 1}`}>{index + 1}</button>)}
              <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-red-500" style={{ left: `${(playhead / project.duration) * 100}%` }}/>
            </div>
            {clip && <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs text-zinc-400">In · {formatTime(clip.start)}<input className="mt-2 w-full accent-[#1d9bf0]" type="range" min={0} max={clip.end - .05} step="0.05" value={clip.start} onChange={(event) => applyEdit({ version: 1, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, start: Number(event.target.value) } : item) })}/></label><label className="text-xs text-zinc-400">Out · {formatTime(clip.end)}<input className="mt-2 w-full accent-[#1d9bf0]" type="range" min={clip.start + .05} max={project.duration} step="0.05" value={clip.end} onChange={(event) => applyEdit({ version: 1, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, end: Number(event.target.value) } : item) })}/></label></div>}
            <div className="mt-3 flex gap-2"><Button size="sm" variant="destructive" disabled={edl.clips.length === 1} onClick={() => { applyEdit({ version: 1, clips: edl.clips.filter((_, index) => index !== selectedClip) }); setSelectedClip(0); }}><Trash2 className="mr-2 h-4 w-4"/>Delete clip</Button><Button size="sm" variant="outline" onClick={() => seek(clip?.start ?? 0)}><Play className="mr-2 h-4 w-4"/>Preview</Button></div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-center justify-between"><div><h2 className="font-bold">Text-based edit</h2><p className="text-xs text-zinc-500">Click a word to cut or restore it.</p></div><Button size="sm" onClick={() => void transcribe()} disabled={busy === "transcribe" || transcriptJob?.state === "queued" || transcriptJob?.state === "running"}>{busy === "transcribe" || transcriptJob?.state === "queued" || transcriptJob?.state === "running" ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Captions className="mr-2 h-4 w-4"/>}{project.transcript ? "Re-transcribe" : "Transcribe"}</Button></div>
            {transcriptJob && <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-xs ${transcriptJob.state === "error" ? "bg-red-950 text-red-300" : "bg-zinc-900 text-zinc-400"}`}>{transcriptJob.detail}</p>}
            <div className="mt-4 max-h-64 overflow-y-auto leading-8">{words.length ? words.map((word, index) => { const retained = edl.clips.some((item) => word.start >= item.start && word.end <= item.end); return <button key={`${word.start}-${index}`} className={`mr-1 rounded px-1 text-sm ${retained ? "hover:bg-zinc-800" : "text-zinc-600 line-through"}`} onClick={() => applyEdit(retained ? removeCutRange(edl, Math.max(0, word.start - .03), Math.min(project.duration, word.end + .03), project.duration) : restoreCutRange(edl, word.start, word.end, project.duration))}>{word.word}</button>; }) : <p className="py-8 text-center text-sm text-zinc-500">Create a transcript to edit by text, detect filler words, and generate captions.</p>}</div>
          </div>
        </section>
        <aside className="space-y-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><h2 className="flex items-center gap-2 font-bold"><WandSparkles className="h-4 w-4 text-[#1d9bf0]"/>AI edit assistant</h2><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-3 min-h-24 w-full resize-none rounded-xl border border-zinc-700 bg-black p-3 text-sm outline-none focus:border-[#1d9bf0]" placeholder="Remove the first 3 seconds, cut 14 to 18 seconds, or remove filler words…"/><Button className="mt-2 w-full" disabled={!prompt.trim()} onClick={async () => { setBusy("ai"); setProposal(null); try { setProposal(await (await apiRequest("POST", `/api/cut/projects/${project.id}/ai-edit`, { prompt })).json()); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not propose that edit"); } finally { setBusy(""); } }}>{busy === "ai" ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Sparkles className="mr-2 h-4 w-4"/>}Propose edit</Button>{proposal && <div className="mt-3 rounded-xl border border-[#1d9bf0]/40 bg-[#1d9bf0]/10 p-3"><p className="text-sm font-bold">{proposal.summary}</p><div className="mt-2 flex gap-2"><Button size="sm" onClick={() => { applyEdit(proposal.edl); setProposal(null); }}><Check className="mr-1 h-4 w-4"/>Apply</Button><Button size="sm" variant="ghost" onClick={() => setProposal(null)}><X className="mr-1 h-4 w-4"/>Discard</Button></div></div>}</div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><h2 className="font-bold">Highlights</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Score transcript moments and render platform-ready clips.</p><Button className="mt-3 w-full" variant="outline" disabled={!project.transcript || highlightJob?.state === "queued" || highlightJob?.state === "running"} onClick={() => void requestHighlights()}>{highlightJob?.state === "queued" || highlightJob?.state === "running" ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Sparkles className="mr-2 h-4 w-4"/>}Find highlights</Button>{highlightJob?.state === "error" && <p role="status" className="mt-3 rounded-lg bg-red-950 px-3 py-2 text-xs text-red-300">{highlightJob.detail}</p>}<div className="mt-3 space-y-2">{highlights.map((item) => <div key={item.id} className="rounded-xl bg-zinc-900 p-3"><div className="flex gap-2"><span className="rounded bg-[#1d9bf0] px-1.5 py-0.5 text-xs font-bold text-black">{item.score}</span><p className="line-clamp-2 flex-1 text-xs">{item.title}</p></div><div className="mt-2 flex items-center justify-between text-xs text-zinc-500"><span>{formatTime(item.start)}–{formatTime(item.end)}</span><button className="font-bold text-[#1d9bf0]" onClick={() => void render({ start: item.start, end: item.end })}>Render clip</button></div></div>)}</div></div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><h2 className="font-bold">Render</h2><label className="mt-3 block text-xs font-bold text-zinc-400">Aspect ratio<select value={aspect} onChange={(event) => setAspect(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black p-3 text-sm text-white"><option value="source">Source</option><option value="9:16">Vertical · 9:16</option><option value="1:1">Square · 1:1</option><option value="16:9">Landscape · 16:9</option></select></label><div className="mt-4 flex items-center justify-between text-sm"><span>Burn captions</span><Switch aria-label="Burn captions" checked={captions} onCheckedChange={setCaptions}/></div>{captions && <label className="mt-3 block text-xs text-zinc-400">Caption style<select value={captionStyle} onChange={(event) => setCaptionStyle(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black p-3 text-sm text-white"><option value={1}>Bold white</option><option value={2}>Creator yellow</option><option value={3}>Readable card</option></select></label>}<div className="mt-4 flex items-center justify-between text-sm"><span>Clean audio</span><Switch aria-label="Clean audio" checked={cleanAudio} onCheckedChange={setCleanAudio}/></div><Button className="mt-4 w-full bg-[#1d9bf0] text-black hover:bg-[#1d9bf0]/90" onClick={() => void render()}><Film className="mr-2 h-4 w-4"/>Render full edit</Button></div>
          {renders.length > 0 && <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><h2 className="font-bold">Renders</h2><div className="mt-3 space-y-3">{renders.map((job) => <div key={job.id} className="rounded-xl bg-zinc-900 p-3"><div className="flex items-center justify-between text-sm"><span className="font-bold">{job.output?.filename ?? "CutStudio render"}</span><span className="text-xs text-zinc-500">{Math.round(job.progress * 100)}%</span></div><p className="mt-1 text-xs text-zinc-500">{job.detail}</p>{job.state === "running" || job.state === "queued" ? <div className="mt-2 h-1 overflow-hidden rounded bg-zinc-700"><div className="h-full bg-[#1d9bf0]" style={{ width: `${job.progress * 100}%` }}/></div> : job.state === "done" ? <div className="mt-3 flex flex-wrap gap-2"><a className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-bold" href={`/api/cut/jobs/${job.id}/media`} onClick={async (event) => { event.preventDefault(); const secure = await (await apiRequest("GET", `/api/cut/jobs/${job.id}/media`)).json() as { url: string }; window.open(secure.url, "_blank", "noopener,noreferrer"); }}>Preview</a><Button size="sm" onClick={async () => { await apiRequest("POST", `/api/cut/jobs/${job.id}/distribute`, {}); setMessage("Added to Distribution Studio"); }}>Send to distribution</Button></div> : <p className="mt-2 text-xs text-red-400">{job.detail}</p>}</div>)}</div></div>}
          {message && <p role="status" className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-300">{message}</p>}
        </aside>
      </div>
    </main>
  );
}
