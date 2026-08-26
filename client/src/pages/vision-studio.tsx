import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, CircleStop, Eye, EyeOff, Focus, Grid3X3, Image as ImageIcon, Loader2, MonitorUp, Plus, Radio, Save, ShieldCheck, Sparkles, Tag, Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { sendOrQueueMediaUpload } from "@/lib/offline-queue";
import { useAuth } from "@/hooks/use-auth";
import { frameActivityScore, visionPrivacyRules, visionQualityProfiles, type VisionQuality, type VisionSource } from "@shared/vision";

type VisionPreset = {
  id: string;
  label: string;
  description: string;
  source: VisionSource;
  quality: VisionQuality;
  settings: { facingMode?: "user" | "environment"; mirrorPreview?: boolean; compositionGrid?: "none" | "thirds" | "center" | "safe_area" };
  version: number;
};
type VisionSession = {
  id: string;
  title: string;
  source: VisionSource;
  quality: VisionQuality;
  status: "ready" | "live" | "stopped" | "archived";
  activePresetId: string | null;
  followTarget: string | null;
  lastFrameAt: string | null;
  version: number;
  updatedAt: string;
};
type VisionObservation = {
  id: string;
  frameId: string;
  kind: string;
  label: string | null;
  summary: string;
  confidence: number;
  width: number;
  height: number;
  metrics: { brightness?: number | null; contrast?: number | null; compositionScore?: number | null };
  capturedAt: string;
  expiresAt: string;
  expired: boolean;
};
type VisionWatch = { id: string; target: string; condition: string; status: string; expiresAt: string };
type VisionEvent = { id: string; eventType: string; payload: Record<string, unknown>; createdAt: string };
type VisionIndex = { sessions: VisionSession[]; presets: VisionPreset[]; policy: Record<string, unknown> };
type VisionDetail = { session: VisionSession; observations: VisionObservation[]; currentScene: VisionObservation | null; watches: VisionWatch[]; events: VisionEvent[] };

function captureConstraints(source: VisionSource, quality: VisionQuality, facingMode: "user" | "environment") {
  const profile = visionQualityProfiles[quality];
  if (source === "screen") return { audio: false, video: { width: { ideal: profile.width }, height: { ideal: profile.height }, frameRate: { ideal: profile.fps } } } as DisplayMediaStreamOptions;
  return { audio: false, video: { width: { ideal: profile.width }, height: { ideal: profile.height }, frameRate: { ideal: profile.fps }, facingMode: { ideal: facingMode } } } as MediaStreamConstraints;
}

function measureFrame(context: CanvasRenderingContext2D, width: number, height: number) {
  const sampleWidth = Math.min(160, width);
  const sampleHeight = Math.max(1, Math.round(sampleWidth * height / width));
  const sample = document.createElement("canvas");
  sample.width = sampleWidth; sample.height = sampleHeight;
  const sampleContext = sample.getContext("2d", { willReadFrequently: true });
  if (!sampleContext) return { brightness: null, contrast: null, compositionScore: null };
  sampleContext.drawImage(context.canvas, 0, 0, sampleWidth, sampleHeight);
  const pixels = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight).data;
  let sum = 0; let squareSum = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = (0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]) / 255;
    sum += luminance; squareSum += luminance * luminance;
  }
  const count = pixels.length / 4;
  const brightness = sum / count;
  const contrast = Math.min(1, Math.sqrt(Math.max(0, squareSum / count - brightness * brightness)) * 2.5);
  const exposureScore = Math.max(0, 1 - Math.abs(brightness - 0.52) * 2);
  return { brightness, contrast, compositionScore: Math.max(0, Math.min(1, exposureScore * 0.65 + contrast * 0.35)) };
}

function metricLabel(value: number | null | undefined) {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

export default function VisionStudioPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const snapshotUrlRef = useRef<string | null>(null);
  const activityCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previousActivityFrameRef = useRef<Uint8ClampedArray | null>(null);
  const activityCooldownRef = useRef(0);
  const activityCheckRunningRef = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("Creator capture");
  const [source, setSource] = useState<VisionSource>("camera");
  const [quality, setQuality] = useState<VisionQuality>("balanced");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [grid, setGrid] = useState<"none" | "thirds" | "center" | "safe_area">("thirds");
  const [mirror, setMirror] = useState(true);
  const [localLive, setLocalLive] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [snapshotBlob, setSnapshotBlob] = useState<Blob | null>(null);
  const [snapshotFrameId, setSnapshotFrameId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [lastActivity, setLastActivity] = useState<{ score: number; at: number } | null>(null);
  const [presetLabel, setPresetLabel] = useState("");

  const index = useQuery<VisionIndex>({ queryKey: ["/api/vision"], queryFn: async () => (await apiRequest("GET", "/api/vision")).json() });
  const detail = useQuery<VisionDetail>({ queryKey: ["/api/vision/sessions", selectedId], enabled: Boolean(selectedId), queryFn: async () => (await apiRequest("GET", `/api/vision/sessions/${selectedId}`)).json(), refetchInterval: localLive ? 5_000 : false });
  const session = detail.data?.session ?? index.data?.sessions.find((candidate) => candidate.id === selectedId) ?? null;
  const activeWatches = detail.data?.watches.filter((watch) => watch.status === "active" && new Date(watch.expiresAt).getTime() > Date.now()) ?? [];
  const activityWatch = activeWatches.find((watch) => watch.target === "scene" && watch.condition === "activity_changed") ?? null;

  useEffect(() => {
    if (!selectedId && index.data?.sessions[0]) setSelectedId(index.data.sessions[0].id);
  }, [index.data, selectedId]);
  useEffect(() => {
    if (!session || localLive) return;
    setSource(session.source); setQuality(session.quality);
  }, [localLive, session]);
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (snapshotUrlRef.current) URL.revokeObjectURL(snapshotUrlRef.current);
  }, []);
  useEffect(() => {
    previousActivityFrameRef.current = null;
    if (!localLive || !selectedId || !activityWatch) return;
    const interval = window.setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || activityCheckRunningRef.current) return;
      const canvas = activityCanvasRef.current ?? document.createElement("canvas");
      activityCanvasRef.current = canvas;
      canvas.width = 64; canvas.height = 36;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const current = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const previous = previousActivityFrameRef.current;
      previousActivityFrameRef.current = new Uint8ClampedArray(current);
      if (!previous) return;
      const score = frameActivityScore(previous, current);
      const now = Date.now();
      if (score < 0.08 || now - activityCooldownRef.current < 10_000) return;
      activityCheckRunningRef.current = true;
      activityCooldownRef.current = now;
      const frameId = `activity_${crypto.randomUUID()}`;
      try {
        await apiRequest("POST", `/api/vision/sessions/${selectedId}/commands`, { command: "watch_trigger", watchId: activityWatch.id, frameId, motionScore: score, source: "browser_measurement" });
        setLastActivity({ score, at: now });
        await queryClient.invalidateQueries({ queryKey: ["/api/vision/sessions", selectedId] });
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Scene activity could not be recorded");
      } finally {
        activityCheckRunningRef.current = false;
      }
    }, 1_500);
    return () => window.clearInterval(interval);
  }, [activityWatch?.id, localLive, queryClient, selectedId]);

  async function refresh(nextId = selectedId) {
    await queryClient.invalidateQueries({ queryKey: ["/api/vision"] });
    if (nextId) await queryClient.invalidateQueries({ queryKey: ["/api/vision/sessions", nextId] });
  }

  async function command(id: string, body: Record<string, unknown>) {
    const response = await apiRequest("POST", `/api/vision/sessions/${id}/commands`, body);
    await refresh(id);
    return response.json();
  }

  async function createSession() {
    const response = await apiRequest("POST", "/api/vision/sessions", { title, source, quality, captureNoticeAcknowledged: true });
    const created = await response.json() as VisionSession;
    setSelectedId(created.id);
    await refresh(created.id);
    return created;
  }

  async function startPreview() {
    setBusy("start"); setMessage("");
    let target = session;
    try {
      if (!target || target.status === "archived" || target.source !== source || target.quality !== quality) target = await createSession();
      const constraints = captureConstraints(source, quality, facingMode);
      const stream = source === "screen"
        ? await navigator.mediaDevices.getDisplayMedia(constraints as DisplayMediaStreamOptions)
        : await navigator.mediaDevices.getUserMedia(constraints as MediaStreamConstraints);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      stream.getVideoTracks()[0]?.addEventListener("ended", () => void stopPreview("source_ended"), { once: true });
      await command(target.id, { command: "start", captureNoticeAcknowledged: true });
      setLocalLive(true);
      setMessage("Preview is live. Audio is not captured and raw frames remain on this device.");
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
      setLocalLive(false);
      setMessage(error instanceof Error ? error.message : "The capture source could not be opened.");
    } finally { setBusy(null); }
  }

  async function stopPreview(reason = "operator_stop") {
    if (busy === "stop") return;
    setBusy("stop");
    streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setLocalLive(false);
    try { if (selectedId) await command(selectedId, { command: "stop", reason }); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The durable session could not be stopped."); }
    finally { setBusy(null); }
  }

  async function captureSnapshot() {
    const video = videoRef.current; const canvas = canvasRef.current;
    if (!video || !canvas || !selectedId || !localLive || !video.videoWidth) return;
    setBusy("snapshot"); setMessage("");
    try {
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Snapshot canvas is unavailable");
      context.resetTransform();
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (mirror && source === "camera") { context.translate(canvas.width, 0); context.scale(-1, 1); }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const metrics = measureFrame(context, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("Snapshot encoding failed");
      const frameId = `frame_${crypto.randomUUID()}`;
      await command(selectedId, { command: "observe", observation: { frameId, kind: "scene_snapshot", summary: "Operator captured a grounded scene snapshot.", confidence: 1, source: "browser_measurement", operatorConfirmed: true, width: canvas.width, height: canvas.height, metrics } });
      if (snapshotUrlRef.current) URL.revokeObjectURL(snapshotUrlRef.current);
      const url = URL.createObjectURL(blob); snapshotUrlRef.current = url;
      setSnapshotUrl(url); setSnapshotBlob(blob); setSnapshotFrameId(frameId);
      setMessage("Grounded frame metadata recorded. The image itself is still local until you explicitly save it.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Snapshot failed"); }
    finally { setBusy(null); }
  }

  async function saveSnapshot() {
    if (!snapshotBlob || !snapshotFrameId || !user) return;
    setBusy("save");
    try {
      const file = new File([snapshotBlob], `vision-${snapshotFrameId}.jpg`, { type: "image/jpeg" });
      const result = await sendOrQueueMediaUpload({ ownerUserId: user.id, file, kind: "photo", visibility: "private" });
      setMessage(result.state === "queued" ? "The private snapshot is protected on this device and will upload when connectivity returns." : "Snapshot saved privately to Media Cloud.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Snapshot could not be saved"); }
    finally { setBusy(null); }
  }

  async function confirmLabel() {
    if (!selectedId || !snapshotFrameId || !label.trim() || !session) return;
    setBusy("label");
    try {
      const observation = detail.data?.observations.find((candidate) => candidate.frameId === snapshotFrameId);
      await command(selectedId, { command: "observe", observation: { frameId: snapshotFrameId, kind: "operator_label", label: label.trim(), summary: `Operator confirmed the visible item as ${label.trim()}.`, confidence: 1, source: "operator", operatorConfirmed: true, width: observation?.width ?? videoRef.current?.videoWidth ?? 1, height: observation?.height ?? videoRef.current?.videoHeight ?? 1, metrics: observation?.metrics ?? {} } });
      setLabel(""); setMessage("Operator-confirmed label attached to the grounded frame.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Label could not be saved"); }
    finally { setBusy(null); }
  }

  async function createPreset() {
    if (!presetLabel.trim()) return;
    setBusy("preset");
    try {
      await apiRequest("POST", "/api/vision/presets", { label: presetLabel.trim(), description: "Creator capture preset", source, quality, settings: { facingMode, mirrorPreview: mirror, compositionGrid: grid } });
      setPresetLabel(""); await refresh(); setMessage("Capture preset saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Preset could not be saved"); }
    finally { setBusy(null); }
  }

  const latest = detail.data?.currentScene;
  const sessionReadiness = localLive ? "LIVE" : session?.status === "live" ? "REMOTE LIVE / LOCAL STOPPED" : session?.status?.toUpperCase() ?? "READY";
  const gridLines = useMemo(() => grid === "thirds" ? ["left-1/3 border-l", "left-2/3 border-l", "top-1/3 border-t", "top-2/3 border-t"] : [], [grid]);

  return <main className="min-h-screen bg-black pb-24 text-white">
    <header className="sticky top-0 z-40 border-b border-zinc-800 bg-black/95 backdrop-blur"><div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4"><Button variant="ghost" size="icon" className="-ml-2 rounded-full" onClick={() => setLocation("/create")} aria-label="Back to Create"><ArrowLeft className="h-5 w-5"/></Button><div className="min-w-0 flex-1"><h1 className="text-lg font-black">Vision Studio</h1><p className="text-[10px] text-zinc-500">Grounded perception and explicit capture</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${localLive ? "bg-red-600 text-white" : "bg-zinc-900 text-zinc-400"}`}>{localLive ? `● ${source === "screen" ? "SCREEN" : "CAMERA"} LIVE` : sessionReadiness}</span><Button size="sm" variant="destructive" disabled={!localLive && session?.status !== "live"} onClick={() => void stopPreview("emergency_stop")}><CircleStop className="mr-1.5 h-4 w-4"/>Stop all</Button></div></header>
    <div className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[240px_minmax(0,1fr)_310px]">
      <aside className="space-y-4"><section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3"><div className="flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Capture sessions</p><button onClick={() => { setSelectedId(null); setTitle("Creator capture"); }} aria-label="New capture"><Plus className="h-4 w-4"/></button></div><div className="mt-2 space-y-1">{index.isLoading && <Loader2 className="m-4 h-4 w-4 animate-spin"/>}{index.data?.sessions.filter((item) => item.status !== "archived").map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className={`w-full rounded-xl p-3 text-left ${selectedId === item.id ? "bg-white text-black" : "bg-black text-zinc-300 hover:bg-zinc-900"}`}><span className="block truncate text-xs font-bold">{item.title}</span><span className={`mt-1 block text-[9px] uppercase ${selectedId === item.id ? "text-black/50" : item.status === "live" ? "text-red-400" : "text-zinc-600"}`}>{item.status} · {item.source} · {item.quality}</span></button>)}</div></section>
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Capture setup</p><label className="mt-3 block text-[10px] text-zinc-500">Session title<Input value={title} onChange={(event) => setTitle(event.target.value)} disabled={localLive} className="mt-1 h-9 border-zinc-800 bg-black text-xs"/></label><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => setSource("camera")} disabled={localLive} className={`rounded-xl border p-3 text-xs font-bold ${source === "camera" ? "border-[#1d9bf0] bg-[#1d9bf0]/10 text-[#1d9bf0]" : "border-zinc-800"}`}><Camera className="mx-auto mb-1 h-4 w-4"/>Camera</button><button onClick={() => setSource("screen")} disabled={localLive} className={`rounded-xl border p-3 text-xs font-bold ${source === "screen" ? "border-[#1d9bf0] bg-[#1d9bf0]/10 text-[#1d9bf0]" : "border-zinc-800"}`}><MonitorUp className="mx-auto mb-1 h-4 w-4"/>Screen</button></div><label className="mt-3 block text-[10px] text-zinc-500">Quality<select value={quality} disabled={localLive} onChange={(event) => setQuality(event.target.value as VisionQuality)} className="mt-1 h-9 w-full rounded-md border border-zinc-800 bg-black px-2 text-xs text-white">{Object.keys(visionQualityProfiles).map((value) => <option key={value}>{value}</option>)}</select></label>{source === "camera" && <label className="mt-3 block text-[10px] text-zinc-500">Facing<select value={facingMode} disabled={localLive} onChange={(event) => setFacingMode(event.target.value as typeof facingMode)} className="mt-1 h-9 w-full rounded-md border border-zinc-800 bg-black px-2 text-xs text-white"><option value="user">Front / operator</option><option value="environment">Rear / scene</option></select></label>}<Button className="mt-3 w-full bg-[#1d9bf0] font-bold text-black" disabled={localLive || busy === "start" || !title.trim()} onClick={() => void startPreview()}>{busy === "start" ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Radio className="mr-2 h-4 w-4"/>}Start visible preview</Button></section>
      </aside>
      <section className="min-w-0 space-y-4"><div className="relative aspect-video overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950"><video ref={videoRef} muted playsInline className={`h-full w-full object-contain ${mirror && source === "camera" ? "-scale-x-100" : ""}`}/>{!localLive && <div className="absolute inset-0 flex flex-col items-center justify-center text-center"><EyeOff className="h-10 w-10 text-zinc-700"/><h2 className="mt-3 text-sm font-bold">Capture is off</h2><p className="mt-1 max-w-xs text-xs leading-5 text-zinc-600">Choose camera or screen, then explicitly start the visible preview. Vision never activates silently.</p></div>}{localLive && <><span className="absolute left-3 top-3 rounded-full bg-red-600 px-2.5 py-1 text-[10px] font-black">● LIVE · NO AUDIO</span>{gridLines.map((className) => <span key={className} className={`pointer-events-none absolute border-white/25 ${className} ${className.startsWith("left") ? "top-0 h-full" : "left-0 w-full"}`}/>)}{grid === "center" && <span className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40"/>}{grid === "safe_area" && <span className="pointer-events-none absolute inset-[8%] rounded-xl border border-white/30"/>}</>}</div><canvas ref={canvasRef} className="hidden"/>
        <div className="flex flex-wrap gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-3"><Button size="sm" onClick={() => void captureSnapshot()} disabled={!localLive || busy === "snapshot"}><ImageIcon className="mr-1.5 h-4 w-4"/>Capture grounded frame</Button><select aria-label="Composition grid" value={grid} onChange={(event) => setGrid(event.target.value as typeof grid)} className="h-9 rounded-md border border-zinc-800 bg-black px-2 text-xs"><option value="thirds">Rule of thirds</option><option value="center">Center target</option><option value="safe_area">Safe area</option><option value="none">No guide</option></select><button className={`rounded-md border border-zinc-800 px-3 text-xs ${mirror ? "bg-white text-black" : "bg-black"}`} onClick={() => setMirror((value) => !value)} disabled={source !== "camera"}>Mirror</button><Button size="sm" variant="outline" className="ml-auto border-zinc-700" disabled={!localLive} onClick={() => void stopPreview()}><CircleStop className="mr-1.5 h-4 w-4"/>Stop preview</Button></div>
        {message && <div role="status" className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">{message}</div>}
        {snapshotUrl && <section className="grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 md:grid-cols-[220px_1fr]"><img src={snapshotUrl} alt="Latest grounded capture" className="aspect-video w-full rounded-xl bg-black object-contain"/><div><div className="flex items-center gap-2"><Focus className="h-4 w-4 text-[#1d9bf0]"/><h2 className="text-sm font-black">Latest grounded frame</h2></div><p className="mt-1 text-[10px] text-zinc-500">Metadata expires after five minutes. Raw pixels are local until you save them.</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" disabled={busy === "save"} onClick={() => void saveSnapshot()}><Save className="mr-1.5 h-4 w-4"/>Save private snapshot</Button><Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Confirm visible item label" className="h-9 min-w-44 flex-1 border-zinc-800 bg-black text-xs"/><Button size="sm" variant="outline" disabled={!label.trim() || busy === "label"} onClick={() => void confirmLabel()}><Tag className="mr-1.5 h-4 w-4"/>Confirm label</Button></div></div></section>}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#1d9bf0]"/><h2 className="text-sm font-black">Grounded scene</h2><span className={`ml-auto rounded-full px-2 py-1 text-[9px] font-black uppercase ${latest && !latest.expired ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-900 text-zinc-500"}`}>{latest && !latest.expired ? "fresh" : "no fresh claim"}</span></div>{latest ? <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px]"><div className="rounded-xl bg-black p-3"><span className="text-zinc-600">Brightness</span><strong className="mt-1 block text-sm">{metricLabel(latest.metrics.brightness)}</strong></div><div className="rounded-xl bg-black p-3"><span className="text-zinc-600">Contrast</span><strong className="mt-1 block text-sm">{metricLabel(latest.metrics.contrast)}</strong></div><div className="rounded-xl bg-black p-3"><span className="text-zinc-600">Capture score</span><strong className="mt-1 block text-sm">{metricLabel(latest.metrics.compositionScore)}</strong></div><p className="col-span-3 text-left text-[10px] leading-5 text-zinc-500">Frame {latest.frameId} · {new Date(latest.capturedAt).toLocaleTimeString()} · {latest.summary}</p></div> : <p className="mt-3 text-xs leading-5 text-zinc-600">Capture a frame to create a time-bound, source-linked observation. Vision will not guess when no fresh frame exists.</p>}</section>
      </section>
      <aside className="space-y-4"><section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400"/><h2 className="text-xs font-black">Privacy governance</h2></div><ul className="mt-3 space-y-2 text-[10px] leading-4 text-zinc-500">{visionPrivacyRules.map((rule) => <li key={rule} className="flex gap-2"><span className="text-emerald-400">✓</span><span>{rule}</span></li>)}</ul></section>
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-center gap-2"><Eye className="h-4 w-4 text-[#1d9bf0]"/><h2 className="text-xs font-black">Native scene watch</h2></div><p className="mt-2 text-[10px] leading-4 text-zinc-500">Detects meaningful frame activity locally. Only a score, frame reference, and timestamp leave this browser; sampled pixels are never uploaded.</p><Button size="sm" className="mt-3 w-full" disabled={!selectedId || !localLive || Boolean(activityWatch) || busy === "watch"} onClick={async () => { if (!selectedId) return; setBusy("watch"); try { await command(selectedId, { command: "watch_start", target: "scene", condition: "activity_changed", durationMinutes: 60 }); setMessage("Scene activity watch is active for up to sixty minutes."); } catch (error) { setMessage(error instanceof Error ? error.message : "Watch could not start"); } finally { setBusy(null); } }}>Start activity watch</Button>{lastActivity && <p className="mt-2 rounded-xl bg-emerald-500/10 p-2 text-[10px] text-emerald-300">Last activity {Math.round(lastActivity.score * 100)}% · {new Date(lastActivity.at).toLocaleTimeString()}</p>}<div className="mt-3 space-y-2">{activeWatches.map((watch) => <div key={watch.id} className="flex items-center gap-2 rounded-xl bg-black p-2 text-[10px]"><span className="min-w-0 flex-1 truncate"><strong>{watch.target}</strong><span className="ml-1 text-zinc-600">· {watch.condition}</span></span><button onClick={() => selectedId && void command(selectedId, { command: "watch_stop", watchId: watch.id })} aria-label={`Stop watching ${watch.target}`}><Trash2 className="h-3.5 w-3.5 text-zinc-500"/></button></div>)}</div><div className="mt-3 rounded-xl border border-zinc-800 p-3 text-[10px] leading-4 text-zinc-500"><strong className="block text-zinc-300">Subject tracking</strong>Automatic object tracking and motorized follow remain unavailable until a compatible local capture node is connected. Vision does not pretend a follow request moved hardware.</div></section>
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-center gap-2"><Grid3X3 className="h-4 w-4 text-[#1d9bf0]"/><h2 className="text-xs font-black">Capture presets</h2></div><div className="mt-3 space-y-2">{index.data?.presets.map((preset) => <button key={preset.id} disabled={!session || localLive} onClick={async () => { if (!session) return; setBusy("activate"); try { await command(session.id, { command: "activate_preset", presetId: preset.id, version: session.version }); setSource(preset.source); setQuality(preset.quality); setFacingMode(preset.settings.facingMode ?? "user"); setMirror(preset.settings.mirrorPreview ?? true); setGrid(preset.settings.compositionGrid ?? "thirds"); } catch (error) { setMessage(error instanceof Error ? error.message : "Preset could not be activated"); } finally { setBusy(null); } }} className={`w-full rounded-xl border p-3 text-left text-xs ${session?.activePresetId === preset.id ? "border-[#1d9bf0] bg-[#1d9bf0]/10" : "border-zinc-800 bg-black"}`}><span className="font-bold">{preset.label}</span><span className="mt-1 block text-[9px] text-zinc-600">{preset.source} · {preset.quality} · r{preset.version}</span></button>)}</div><div className="mt-3 flex gap-2"><Input value={presetLabel} onChange={(event) => setPresetLabel(event.target.value)} placeholder="Preset name" className="h-9 border-zinc-800 bg-black text-xs"/><Button size="sm" disabled={!presetLabel.trim() || busy === "preset"} onClick={() => void createPreset()}><Plus className="h-4 w-4"/></Button></div></section>
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Control ledger</p><div className="mt-3 max-h-56 space-y-2 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{detail.data?.events.slice(0, 20).map((event) => <div key={event.id} className="border-l border-zinc-700 pl-3 text-[10px]"><strong>{event.eventType.replaceAll(".", " ")}</strong><span className="mt-1 block text-zinc-600">{new Date(event.createdAt).toLocaleString()}</span></div>)}</div></section>
      </aside>
    </div>
  </main>;
}
