import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Captions, Check, ChevronRight, Download, Film, FileText, Loader2, Play, Plus, Redo2, RefreshCw, Save, Scissors, Search, Sparkles, Trash2, Undo2, Upload, WandSparkles, X } from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cutDuration, estimateCutRenderSeconds, removeCutRange, restoreCutRange, splitCutAt, validateCutEdl, type CutEdl, type CutRenderRequest, type CutTranscript } from "@shared/cut-studio";

type ProjectMedia = { id: string; assetId: string; name: string; duration: number; mediaKind: "video" | "audio"; createdAt: string };
type Project = { id: string; sourceAssetId: string; name: string; duration: number; mediaKind: "video" | "audio"; edl: CutEdl; transcript: CutTranscript | null; revision: number; updatedAt: string; jobs?: Job[]; media?: ProjectMedia[] };
type Job = { id: string; kind: "transcribe" | "highlights" | "render"; state: "queued" | "running" | "done" | "error"; detail: string; progress: number; artifactAssetId?: string | null; output?: { candidates?: Highlight[]; filename?: string } };
type Highlight = { id: string; start: number; end: number; title: string; score: number };
type CutCandidates = { fillerWords: Array<{ word: string; start: number; end: number }>; silenceGaps: Array<{ start: number; end: number }> };

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
  const [quality, setQuality] = useState<"draft" | "social" | "master">("social");
  const [resolution, setResolution] = useState<"720p" | "1080p" | "2160p">("1080p");
  const [fps, setFps] = useState<24 | 30 | 60>(30);
  const [candidates, setCandidates] = useState<CutCandidates | null>(null);
  const [mediaLibrary, setMediaLibrary] = useState<ProjectMedia[]>([]);
  const [transcriptDraft, setTranscriptDraft] = useState<CutTranscript | null>(null);
  const [transcriptSearch, setTranscriptSearch] = useState("");
  const [savingTranscript, setSavingTranscript] = useState(false);

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
      setProject(next); setEdl(next.edl); setRevision(next.revision); setJobs(projectJobs); setMediaLibrary(next.media ?? []); setMediaUrl(secure.url); setHistory([]); setFuture([]); setPlayhead(0); setSelectedClip(0); setTranscriptDraft(next.transcript); setTranscriptSearch(""); setHighlights(projectJobs.find((job) => job.kind === "highlights" && job.state === "done")?.output?.candidates ?? []);
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

  const uploadPrivateMedia = async (file: File, mediaKind: "video" | "audio") => {
    let pendingAssetId: string | null = null;
    try {
      const intent = await (await apiRequest("POST", "/api/assets/upload-intents", { kind: mediaKind, filename: file.name, mimeType: file.type, sizeBytes: file.size, visibility: "private" })).json() as { asset: { id: string }; upload: { uploadUrl: string } };
      pendingAssetId = intent.asset.id;
      const stored = await fetch(intent.upload.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!stored.ok) throw new Error("Direct storage upload was unavailable");
      await apiRequest("POST", `/api/assets/${intent.asset.id}/complete`, {});
      return intent.asset;
    } catch (directError) {
      if (pendingAssetId) await apiRequest("DELETE", `/api/assets/${pendingAssetId}`, {}).catch(() => undefined);
      const body = new FormData();
      body.append("kind", mediaKind);
      body.append("visibility", "private");
      body.append(mediaKind, file);
      const response = await fetch("/api/assets/upload-proxy", { method: "POST", credentials: "include", body });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(result.message ?? (directError instanceof Error ? directError.message : "The private media upload failed"));
      }
      return ((await response.json()) as { asset: { id: string } }).asset;
    }
  };

  const uploadProject = async (file: File) => {
    const mediaKind = file.type.startsWith("audio/") ? "audio" : file.type.startsWith("video/") ? "video" : null;
    if (!mediaKind) return setMessage("Choose a video or audio file");
    setBusy("upload"); setMessage("Reading media…");
    try {
      const duration = await mediaDuration(file);
      const asset = await uploadPrivateMedia(file, mediaKind);
      setMessage("Uploading source media…");
      const name = file.name.replace(/\.[^.]+$/, "");
      const created = await (await apiRequest("POST", "/api/cut/projects", { sourceAssetId: asset.id, name, duration, mediaKind })).json() as Project;
      await refreshProjects(); await openProject(created.id);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create the project"); }
    finally { setBusy(""); }
  };

  const uploadProjectMedia = async (file: File) => {
    if (!project) return;
    const mediaKind = file.type.startsWith("audio/") ? "audio" : file.type.startsWith("video/") ? "video" : null;
    if (!mediaKind) return setMessage("Choose a video or audio file");
    setBusy("media");
    try {
      const duration = await mediaDuration(file);
      const asset = await uploadPrivateMedia(file, mediaKind);
      const row = await (await apiRequest("POST", `/api/cut/projects/${project.id}/media-library`, { assetId: asset.id, name: file.name, duration, mediaKind })).json() as ProjectMedia;
      setMediaLibrary((items) => [...items.filter((item) => item.assetId !== row.assetId), row]);
      setMessage("Media added to this project");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not add project media"); }
    finally { setBusy(""); }
  };

  const addMediaClip = (media: ProjectMedia) => {
    if (!project || !edl) return;
    if (project.mediaKind !== "video") return setMessage("Start with a video project before adding multitrack layers");
    const timelineDuration = Math.max(project.duration, ...mediaLibrary.map((item) => item.duration));
    const track = media.mediaKind === "audio" ? "a1" : "v2";
    const next = validateCutEdl({ version: 3, clips: [
      ...edl.clips,
      { id: `clip_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`, assetId: media.assetId, label: media.name.slice(0, 80), start: 0, end: media.duration, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, track, timelineStart: Math.min(playhead, cutDuration(edl)), transform: { x: 0, y: 0, width: 1, height: 1, opacity: 1 } },
    ] }, timelineDuration);
    applyEdit(next);
    setSelectedClip(next.clips.length - 1);
    setMessage(`${media.name} added to ${track.toUpperCase()}`);
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
  const render = async (clip?: { start: number; end: number }) => { await startJob("render", { aspect, captions, captionStyle, cleanAudio, quality, resolution, fps, clip }); };
  const detectCleanup = async () => {
    if (!project) return;
    setBusy("detect");
    try { setCandidates(await (await apiRequest("POST", `/api/cut/projects/${project.id}/detect`, {})).json() as CutCandidates); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not analyze the transcript"); }
    finally { setBusy(""); }
  };
  const applyCandidates = (items: Array<{ start: number; end: number }>) => {
    if (!project || !edl) return;
    applyEdit(items.reduce((value, item) => removeCutRange(value, Math.max(0, item.start - 0.03), Math.min(project.duration, item.end + 0.03), project.duration), edl));
  };

  const saveTranscript = async () => {
    if (!project || !transcriptDraft) return;
    setSavingTranscript(true);
    try {
      const response = await apiRequest("PUT", `/api/cut/projects/${project.id}/transcript`, transcriptDraft, { "If-Match": String(revision) });
      const saved = await response.json() as CutTranscript;
      const nextRevision = Number(response.headers.get("X-Cut-Rev"));
      setRevision(nextRevision);
      setTranscriptDraft(saved);
      setProject((value) => value ? { ...value, transcript: saved, revision: nextRevision } : value);
      setMessage("Transcript corrections saved");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save transcript corrections"); }
    finally { setSavingTranscript(false); }
  };

  const retryJob = async (job: Job) => {
    try {
      const retry = await (await apiRequest("POST", `/api/cut/jobs/${job.id}/retry`, {})).json() as Job;
      setJobs((items) => [retry, ...items]);
      setMessage("Retry queued");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not retry the job"); }
  };

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
  const selectedMedia = clip?.assetId ? mediaLibrary.find((item) => item.assetId === clip.assetId) : mediaLibrary.find((item) => item.assetId === project.sourceAssetId);
  const timelineDuration = Math.max(project.duration, cutDuration(edl));
  const timelineTracks = edl.version === 3 ? Array.from(new Set(edl.clips.map((item) => item.track ?? "v1"))).sort() : ["v1"];
  const words = project.transcript?.segments.flatMap((segment) => segment.words) ?? [];
  const renders = jobs.filter((job) => job.kind === "render");
  const transcriptJob = jobs.find((job) => job.kind === "transcribe");
  const highlightJob = jobs.find((job) => job.kind === "highlights");
  const transcriptMatches = (transcriptDraft?.segments ?? []).filter((segment) => !transcriptSearch.trim() || segment.text.toLowerCase().includes(transcriptSearch.trim().toLowerCase()));
  const renderEstimate = estimateCutRenderSeconds(cutDuration(edl), { aspect, captions, captionStyle, cleanAudio, quality, resolution, fps } as CutRenderRequest);
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
             <div className="space-y-1 rounded-xl bg-zinc-900 p-2" onClick={(event) => { const box = event.currentTarget.getBoundingClientRect(); seek(((event.clientX - box.left) / box.width) * timelineDuration); }}>
               {timelineTracks.map((track) => <div key={track} className="relative h-14 overflow-hidden rounded-lg bg-black"><span className="pointer-events-none absolute left-1 top-1 z-10 rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-bold text-zinc-400">{track.toUpperCase()}</span>{edl.clips.map((item, index) => (item.track ?? "v1") === track ? <button key={item.id ?? `${item.start}-${item.end}`} className={`absolute bottom-1 top-1 rounded-md border px-2 text-xs font-bold ${selectedClip === index ? "border-white bg-[#1d9bf0] text-black" : track.startsWith("a") ? "border-emerald-700 bg-emerald-950 text-emerald-300" : "border-zinc-600 bg-zinc-700"}`} style={{ left: `${(((edl.version === 3 ? item.timelineStart : item.start) ?? 0) / timelineDuration) * 100}%`, width: `${Math.max(0.7, (((item.end - item.start) / (item.speed ?? 1)) / timelineDuration) * 100)}%` }} onClick={(event) => { event.stopPropagation(); setSelectedClip(index); seek(edl.version === 3 ? (item.timelineStart ?? 0) : item.start); }} aria-label={`${track.toUpperCase()} clip ${index + 1}`}>{item.label ?? index + 1}{(item.speed ?? 1) !== 1 ? ` · ${item.speed}x` : ""}</button> : null)}<span className="pointer-events-none absolute inset-y-0 w-0.5 bg-red-500" style={{ left: `${(playhead / timelineDuration) * 100}%` }}/></div>)}
             </div>
            {clip && <><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs text-zinc-400">In · {formatTime(clip.start)}<input className="mt-2 w-full accent-[#1d9bf0]" type="range" min={0} max={clip.end - .05} step="0.05" value={clip.start} onChange={(event) => applyEdit({ version: edl.version, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, start: Number(event.target.value) } : item) })}/></label><label className="text-xs text-zinc-400">Out · {formatTime(clip.end)}<input className="mt-2 w-full accent-[#1d9bf0]" type="range" min={clip.start + .05} max={selectedMedia?.duration ?? project.duration} step="0.05" value={clip.end} onChange={(event) => applyEdit({ version: edl.version, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, end: Number(event.target.value) } : item) })}/></label></div><div className="mt-4 grid gap-3 sm:grid-cols-4"><label className="text-xs text-zinc-400">Speed<select aria-label="Clip speed" className="mt-1 w-full rounded-lg border border-zinc-700 bg-black p-2 text-white" value={clip.speed ?? 1} onChange={(event) => applyEdit({ version: edl.version, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, speed: Number(event.target.value) } : item) })}>{[.25,.5,.75,1,1.25,1.5,2,4].map((value) => <option key={value} value={value}>{value}x</option>)}</select></label>{[["Volume", "volume", 0, 2, .05], ["Fade in", "fadeIn", 0, 10, .1], ["Fade out", "fadeOut", 0, 10, .1]].map(([label, key, min, max, step]) => <label key={String(key)} className="text-xs text-zinc-400">{label} · {Number(clip[key as "volume" | "fadeIn" | "fadeOut"] ?? (key === "volume" ? 1 : 0)).toFixed(1)}<input aria-label={String(label)} className="mt-2 w-full accent-[#1d9bf0]" type="range" min={Number(min)} max={Number(max)} step={Number(step)} value={clip[key as "volume" | "fadeIn" | "fadeOut"] ?? (key === "volume" ? 1 : 0)} onChange={(event) => applyEdit({ version: edl.version, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, [String(key)]: Number(event.target.value) } : item) })}/></label>)}</div>{edl.version === 3 && clip.track !== "v1" && <div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-xs text-zinc-400">Timeline start<input aria-label="Clip timeline start" className="mt-1 w-full rounded-lg border border-zinc-700 bg-black p-2" type="number" min={0} max={7200} step="0.1" value={clip.timelineStart ?? 0} onChange={(event) => applyEdit({ version: 3, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, timelineStart: Number(event.target.value) } : item) })}/></label>{clip.track?.startsWith("v") && <><label className="text-xs text-zinc-400">Layout<select aria-label="Clip layout" className="mt-1 w-full rounded-lg border border-zinc-700 bg-black p-2" value={(clip.transform?.width ?? 1) < .8 ? "pip" : "full"} onChange={(event) => { const pip = event.target.value === "pip"; applyEdit({ version: 3, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, transform: pip ? { x: .68, y: .62, width: .28, height: .32, opacity: 1 } : { x: 0, y: 0, width: 1, height: 1, opacity: 1 } } : item) }); }}><option value="full">Full frame</option><option value="pip">Picture in picture</option></select></label><label className="text-xs text-zinc-400">Opacity<input aria-label="Clip opacity" className="mt-2 w-full accent-[#1d9bf0]" type="range" min={0} max={1} step={.05} value={clip.transform?.opacity ?? 1} onChange={(event) => applyEdit({ version: 3, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, transform: { ...(item.transform ?? { x: 0, y: 0, width: 1, height: 1, opacity: 1 }), opacity: Number(event.target.value) } } : item) })}/></label></>}</div>}</>}
            <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="destructive" disabled={edl.clips.length === 1} onClick={() => { applyEdit({ version: edl.version, clips: edl.clips.filter((_, index) => index !== selectedClip) }); setSelectedClip(0); }}><Trash2 className="mr-2 h-4 w-4"/>Delete clip</Button><Button size="sm" variant="outline" disabled={edl.version === 3 || selectedClip === 0} onClick={() => { const clips = [...edl.clips]; [clips[selectedClip - 1], clips[selectedClip]] = [clips[selectedClip], clips[selectedClip - 1]]; applyEdit({ version: edl.version, clips }); setSelectedClip(selectedClip - 1); }}>Move earlier</Button><Button size="sm" variant="outline" disabled={edl.version === 3 || selectedClip >= edl.clips.length - 1} onClick={() => { const clips = [...edl.clips]; [clips[selectedClip + 1], clips[selectedClip]] = [clips[selectedClip], clips[selectedClip + 1]]; applyEdit({ version: edl.version, clips }); setSelectedClip(selectedClip + 1); }}>Move later</Button><Button size="sm" variant="outline" onClick={() => seek(edl.version === 3 ? (clip?.timelineStart ?? 0) : (clip?.start ?? 0))}><Play className="mr-2 h-4 w-4"/>Preview</Button></div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold">Text-based edit</h2><p className="text-xs text-zinc-500">Search, correct, cut, restore, and export timed captions.</p></div><div className="flex gap-2">{project.transcript && <a className="inline-flex h-9 items-center rounded-lg border border-zinc-700 px-3 text-xs font-bold" href={`/api/cut/projects/${project.id}/captions.srt`}><FileText className="mr-1.5 h-3.5 w-3.5"/>SRT</a>}<Button size="sm" onClick={() => void transcribe()} disabled={busy === "transcribe" || transcriptJob?.state === "queued" || transcriptJob?.state === "running"}>{busy === "transcribe" || transcriptJob?.state === "queued" || transcriptJob?.state === "running" ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Captions className="mr-2 h-4 w-4"/>}{project.transcript ? "Re-transcribe" : "Transcribe"}</Button></div></div>
             {transcriptJob && <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-xs ${transcriptJob.state === "error" ? "bg-red-950 text-red-300" : "bg-zinc-900 text-zinc-400"}`}>{transcriptJob.detail}</p>}
             {transcriptDraft && <div className="relative mt-4"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-600"/><input aria-label="Search transcript" value={transcriptSearch} onChange={(event) => setTranscriptSearch(event.target.value)} placeholder="Search transcript" className="h-9 w-full rounded-lg border border-zinc-800 bg-black pl-9 pr-3 text-sm outline-none focus:border-[#1d9bf0]"/></div>}
             <div className="mt-4 max-h-64 overflow-y-auto leading-8">{words.length ? words.map((word, index) => { const retained = edl.clips.some((item) => word.start >= item.start && word.end <= item.end); return <button key={`${word.start}-${index}`} className={`mr-1 rounded px-1 text-sm ${retained ? "hover:bg-zinc-800" : "text-zinc-600 line-through"}`} onClick={() => applyEdit(retained ? removeCutRange(edl, Math.max(0, word.start - .03), Math.min(project.duration, word.end + .03), project.duration) : restoreCutRange(edl, word.start, word.end, project.duration))}>{word.word}</button>; }) : <p className="py-8 text-center text-sm text-zinc-500">Create a transcript to edit by text, detect filler words, and generate captions.</p>}</div>
             {transcriptDraft && <div className="mt-4 rounded-xl border border-zinc-800 bg-black p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold">Transcript corrections</p><p className="mt-1 text-[11px] text-zinc-600">{transcriptMatches.length} of {transcriptDraft.segments.length} timed segments</p></div><Button size="sm" disabled={savingTranscript || JSON.stringify(transcriptDraft) === JSON.stringify(project.transcript)} onClick={() => void saveTranscript()}>{savingTranscript ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"/> : <Save className="mr-1.5 h-3.5 w-3.5"/>}Save corrections</Button></div><div className="mt-3 max-h-72 space-y-2 overflow-y-auto">{transcriptMatches.map((segment) => <div key={segment.id} className="rounded-lg bg-zinc-950 p-2"><button type="button" className="text-[10px] font-bold text-[#1d9bf0]" onClick={() => seek(segment.start)}>{formatTime(segment.start)}–{formatTime(segment.end)}</button><textarea aria-label={`Transcript segment ${segment.id}`} value={segment.text} onChange={(event) => setTranscriptDraft((current) => current ? { ...current, segments: current.segments.map((item) => item.id === segment.id ? { ...item, text: event.target.value } : item) } : current)} className="mt-1 min-h-16 w-full resize-y rounded-md border border-zinc-800 bg-black p-2 text-sm leading-5 outline-none focus:border-[#1d9bf0]"/></div>)}</div></div>}
             {project.transcript && <div className="mt-3 rounded-xl bg-zinc-900 p-3"><div className="flex items-center justify-between"><p className="text-xs font-bold">Smart cleanup</p><Button size="sm" variant="outline" disabled={busy === "detect"} onClick={() => void detectCleanup()}>{busy === "detect" ? <Loader2 className="mr-1 h-3 w-3 animate-spin"/> : <WandSparkles className="mr-1 h-3 w-3"/>}Analyze</Button></div>{candidates && <div className="mt-3 grid gap-2 sm:grid-cols-2"><Button size="sm" variant="outline" disabled={!candidates.fillerWords.length} onClick={() => applyCandidates(candidates.fillerWords)}>Remove {candidates.fillerWords.length} filler words</Button><Button size="sm" variant="outline" disabled={!candidates.silenceGaps.length} onClick={() => applyCandidates(candidates.silenceGaps)}>Tighten {candidates.silenceGaps.length} pauses</Button></div>}</div>}
          </div>
        </section>
        <aside className="space-y-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-center justify-between gap-2"><div><h2 className="font-bold">Project media</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Add private B-roll and audio layers at the playhead.</p></div><label className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-zinc-700 px-3 text-xs font-bold hover:bg-zinc-900"><input className="sr-only" type="file" accept="video/*,audio/*" disabled={busy === "media"} onChange={(event) => event.target.files?.[0] && void uploadProjectMedia(event.target.files[0])}/>{busy === "media" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"/> : <Plus className="mr-1.5 h-3.5 w-3.5"/>}Media</label></div><div className="mt-3 space-y-2">{mediaLibrary.map((media) => <div key={media.id} className="flex items-center gap-2 rounded-xl bg-zinc-900 p-2"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-black text-[10px] font-bold text-zinc-500">{media.mediaKind === "audio" ? "A" : "V"}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{media.name}</span><span className="text-[10px] text-zinc-600">{formatTime(media.duration)} · {media.assetId === project.sourceAssetId ? "primary" : media.mediaKind}</span></span>{media.assetId !== project.sourceAssetId && <Button size="sm" variant="outline" onClick={() => addMediaClip(media)}>Add</Button>}</div>)}</div>{project.mediaKind !== "video" && <p className="mt-3 rounded-lg bg-amber-950/40 px-3 py-2 text-[11px] leading-5 text-amber-300">Multitrack layers require a video project. Audio-only projects keep the fast single-track workflow.</p>}</div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><h2 className="flex items-center gap-2 font-bold"><WandSparkles className="h-4 w-4 text-[#1d9bf0]"/>AI edit assistant</h2><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-3 min-h-24 w-full resize-none rounded-xl border border-zinc-700 bg-black p-3 text-sm outline-none focus:border-[#1d9bf0]" placeholder="Remove the first 3 seconds, cut 14 to 18 seconds, or remove filler words…"/><Button className="mt-2 w-full" disabled={!prompt.trim()} onClick={async () => { setBusy("ai"); setProposal(null); try { setProposal(await (await apiRequest("POST", `/api/cut/projects/${project.id}/ai-edit`, { prompt })).json()); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not propose that edit"); } finally { setBusy(""); } }}>{busy === "ai" ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Sparkles className="mr-2 h-4 w-4"/>}Propose edit</Button>{proposal && <div className="mt-3 rounded-xl border border-[#1d9bf0]/40 bg-[#1d9bf0]/10 p-3"><p className="text-sm font-bold">{proposal.summary}</p><div className="mt-2 flex gap-2"><Button size="sm" onClick={() => { applyEdit(proposal.edl); setProposal(null); }}><Check className="mr-1 h-4 w-4"/>Apply</Button><Button size="sm" variant="ghost" onClick={() => setProposal(null)}><X className="mr-1 h-4 w-4"/>Discard</Button></div></div>}</div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><h2 className="font-bold">Highlights</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Score transcript moments and render platform-ready clips.</p><Button className="mt-3 w-full" variant="outline" disabled={!project.transcript || highlightJob?.state === "queued" || highlightJob?.state === "running"} onClick={() => void requestHighlights()}>{highlightJob?.state === "queued" || highlightJob?.state === "running" ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Sparkles className="mr-2 h-4 w-4"/>}Find highlights</Button>{highlightJob?.state === "error" && <p role="status" className="mt-3 rounded-lg bg-red-950 px-3 py-2 text-xs text-red-300">{highlightJob.detail}</p>}<div className="mt-3 space-y-2">{highlights.map((item) => <div key={item.id} className="rounded-xl bg-zinc-900 p-3"><div className="flex gap-2"><span className="rounded bg-[#1d9bf0] px-1.5 py-0.5 text-xs font-bold text-black">{item.score}</span><p className="line-clamp-2 flex-1 text-xs">{item.title}</p></div><div className="mt-2 flex items-center justify-between text-xs text-zinc-500"><span>{formatTime(item.start)}–{formatTime(item.end)}</span><button className="font-bold text-[#1d9bf0]" onClick={() => void render({ start: item.start, end: item.end })}>Render clip</button></div></div>)}</div></div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><h2 className="font-bold">Render</h2><div className="mt-3 grid grid-cols-2 gap-2"><label className="text-xs font-bold text-zinc-400">Aspect ratio<select value={aspect} onChange={(event) => setAspect(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black p-3 text-sm text-white"><option value="source">Source</option><option value="9:16">Vertical · 9:16</option><option value="1:1">Square · 1:1</option><option value="16:9">Landscape · 16:9</option></select></label><label className="text-xs font-bold text-zinc-400">Resolution<select aria-label="Render resolution" value={resolution} onChange={(event) => setResolution(event.target.value as typeof resolution)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black p-3 text-sm text-white"><option value="720p">720p</option><option value="1080p">1080p</option><option value="2160p">4K</option></select></label><label className="text-xs font-bold text-zinc-400">Quality<select aria-label="Render quality" value={quality} onChange={(event) => setQuality(event.target.value as typeof quality)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black p-3 text-sm text-white"><option value="draft">Draft</option><option value="social">Social</option><option value="master">Master</option></select></label><label className="text-xs font-bold text-zinc-400">Frame rate<select aria-label="Render frame rate" value={fps} onChange={(event) => setFps(Number(event.target.value) as typeof fps)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black p-3 text-sm text-white"><option value={24}>24 fps</option><option value={30}>30 fps</option><option value={60}>60 fps</option></select></label></div><div className="mt-4 flex items-center justify-between text-sm"><span>Burn captions</span><Switch aria-label="Burn captions" checked={captions} onCheckedChange={setCaptions}/></div>{captions && <label className="mt-3 block text-xs text-zinc-400">Caption style<select value={captionStyle} onChange={(event) => setCaptionStyle(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black p-3 text-sm text-white"><option value={1}>Bold white</option><option value={2}>Creator yellow</option><option value={3}>Readable card</option></select></label>}<div className="mt-4 flex items-center justify-between text-sm"><span>Clean audio</span><Switch aria-label="Clean audio" checked={cleanAudio} onCheckedChange={setCleanAudio}/></div><p className="mt-4 rounded-lg bg-black px-3 py-2 text-[11px] leading-5 text-zinc-500">Estimated processing time: about {renderEstimate < 60 ? `${renderEstimate} seconds` : `${Math.ceil(renderEstimate / 60)} minutes`}. Actual time depends on source codecs and worker load.</p><Button className="mt-3 w-full bg-[#1d9bf0] text-black hover:bg-[#1d9bf0]/90" onClick={() => void render()}><Film className="mr-2 h-4 w-4"/>Render full edit</Button></div>
          {renders.length > 0 && <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><h2 className="font-bold">Renders</h2><div className="mt-3 space-y-3">{renders.map((job) => <div key={job.id} className="rounded-xl bg-zinc-900 p-3"><div className="flex items-center justify-between text-sm"><span className="font-bold">{job.output?.filename ?? "CutStudio render"}</span><span className="text-xs text-zinc-500">{Math.round(job.progress * 100)}%</span></div><p className="mt-1 text-xs text-zinc-500">{job.detail}</p>{job.state === "running" || job.state === "queued" ? <div className="mt-2 h-1 overflow-hidden rounded bg-zinc-700"><div className="h-full bg-[#1d9bf0]" style={{ width: `${job.progress * 100}%` }}/></div> : job.state === "done" ? <div className="mt-3 flex flex-wrap gap-2"><a className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-bold" href={`/api/cut/jobs/${job.id}/media`} onClick={async (event) => { event.preventDefault(); const secure = await (await apiRequest("GET", `/api/cut/jobs/${job.id}/media`)).json() as { url: string }; window.open(secure.url, "_blank", "noopener,noreferrer"); }}>Preview</a><Button size="sm" onClick={async () => { await apiRequest("POST", `/api/cut/jobs/${job.id}/distribute`, {}); setMessage("Added to Distribution Studio"); }}>Send to distribution</Button></div> : <div className="mt-2 flex items-center justify-between gap-2"><p className="text-xs text-red-400">{job.detail}</p><Button size="sm" variant="outline" onClick={() => void retryJob(job)}><RefreshCw className="mr-1.5 h-3.5 w-3.5"/>Retry</Button></div>}</div>)}</div></div>}
          {message && <p role="status" className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-300">{message}</p>}
        </aside>
      </div>
    </main>
  );
}
