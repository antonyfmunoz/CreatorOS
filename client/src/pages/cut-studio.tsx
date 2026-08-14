import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Captions, Check, CheckCircle2, ChevronRight, Copy, Download, Eye, EyeOff, Film, FileText, Flag, Link2, Loader2, Lock, Magnet, MessageSquare, Play, Plus, Redo2, RefreshCw, Save, Scissors, Search, Send, Share2, Sparkles, Square, Trash2, Undo2, Unlink2, Unlock, Upload, Volume2, VolumeX, WandSparkles, X } from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { audioRmsDb, breakApartCutCompound, createCutCompound, cutDuration, estimateCutRenderSeconds, groupCutClips, moveCutClipGroup, removeCutRange, restoreCutRange, rollCutEdit, shortTermLufs, slipCutClip, snapCutTime, splitCutAt, trimCutClip, ungroupCutClips, validateCutEdl, type CutAudioRoutingTemplatePayload, type CutEdl, type CutRenderRequest, type CutRippleMode, type CutTranscript } from "@shared/cut-studio";

type ProjectMedia = { id: string; assetId: string; name: string; duration: number; mediaKind: "video" | "audio"; createdAt: string };
type ProjectLut = { id: string; name: string; sizeBytes: number; metadata?: { cubeLut?: { title?: string | null; size?: number } } };
type Project = { id: string; businessId: string; sourceAssetId: string; name: string; duration: number; mediaKind: "video" | "audio"; edl: CutEdl; transcript: CutTranscript | null; revision: number; updatedAt: string; jobs?: Job[]; media?: ProjectMedia[]; luts?: ProjectLut[] };
type Job = { id: string; kind: "transcribe" | "highlights" | "render"; state: "queued" | "running" | "done" | "error" | "cancelled"; detail: string; progress: number; artifactAssetId?: string | null; output?: { candidates?: Highlight[]; filename?: string } };
type Highlight = { id: string; start: number; end: number; title: string; score: number };
type CutCandidates = { fillerWords: Array<{ word: string; start: number; end: number }>; silenceGaps: Array<{ start: number; end: number }> };
type ReviewComment = { id: string; authorName: string; body: string; positionMs: number; status: "open" | "resolved"; createdAt: string };
type ReviewLink = { id: string; label: string; status: "active" | "revoked"; expiresAt: string };
type ReviewVersion = { id: string; label: string; revision: number; artifactAssetId?: string | null; reviewStatus: "pending" | "approved" | "changes_requested"; createdAt: string; links: ReviewLink[]; comments: ReviewComment[]; decisions: Array<{ id: string; reviewerName: string; decision: string; note?: string | null; createdAt: string }> };
type WorkspaceParticipant = { id: number; username: string; displayName: string; profileImageUrl?: string | null; role: "owner" | "editor" | "reviewer" };
type WorkspaceNote = { id: string; body: string; positionMs: number; status: "open" | "resolved"; author: { id: number; username: string; displayName: string } | null };
type WorkspacePayload = { participants: WorkspaceParticipant[]; notes: WorkspaceNote[] };
type LoudnessMeasurement = { integratedLufs: number; loudnessRangeLu: number; truePeakDbfs: number; analyzedSeconds: number; standard: string; measuredAt: string };
type AudioRoutingTemplate = { id: string; name: string; payload: CutAudioRoutingTemplatePayload; access: { canDelete: boolean } };

function formatTime(value: number) {
  const seconds = Math.max(0, value || 0);
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function previewColorFilter(clip: CutEdl["clips"][number] | undefined) {
  const filters: string[] = [];
  if (clip?.colorPreset === "cinematic") filters.push("contrast(1.08)", "saturate(.9)", "brightness(.98)", "sepia(.08)");
  else if (clip?.colorPreset === "vivid") filters.push("contrast(1.08)", "saturate(1.25)");
  else if (clip?.colorPreset === "monochrome") filters.push("grayscale(1)");
  if (clip?.colorAdjust) filters.push(`brightness(${1 + clip.colorAdjust.brightness})`, `contrast(${clip.colorAdjust.contrast})`, `saturate(${clip.colorAdjust.saturation})`, `sepia(${Math.abs(clip.colorAdjust.temperature) * .12})`);
  return filters.join(" ") || "none";
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
  const sourceMediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioSourceElementRef = useRef<HTMLMediaElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterFilterRefs = useRef<{ highPass: BiquadFilterNode; shelf: BiquadFilterNode; sink: GainNode } | null>(null);
  const loudnessEnergyRef = useRef<Array<{ at: number; energy: number }>>([]);
  const meterFrameRef = useRef<number>();
  const comparisonVideoRefs = useRef<Array<HTMLVideoElement | null>>([]);
  const dragRef = useRef<{ clipId: string; startX: number; trackWidth: number; origin: CutEdl; moved: boolean } | null>(null);
  const trimRef = useRef<{ clipId: string; edge: "start" | "end"; startX: number; trackWidth: number; sourceDuration: number; origin: CutEdl; moved: boolean; rolling: boolean } | null>(null);
  const suppressClipClickRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const initialProjectOpened = useRef(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [edl, setEdl] = useState<CutEdl | null>(null);
  const edlRef = useRef<CutEdl | null>(null);
  const [history, setHistory] = useState<CutEdl[]>([]);
  const [future, setFuture] = useState<CutEdl[]>([]);
  const [revision, setRevision] = useState(0);
  const [mediaUrl, setMediaUrl] = useState("");
  const [sourceMedia, setSourceMedia] = useState<ProjectMedia | null>(null);
  const [sourceMediaUrl, setSourceMediaUrl] = useState("");
  const [sourceIn, setSourceIn] = useState(0);
  const [sourceOut, setSourceOut] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [motionScale, setMotionScale] = useState(1);
  const [selectedClip, setSelectedClip] = useState(0);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [rippleMode, setRippleMode] = useState<CutRippleMode>("off");
  const [rollingEnabled, setRollingEnabled] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [prompt, setPrompt] = useState("");
  const [proposal, setProposal] = useState<{ edl: CutEdl; summary: string } | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [aspect, setAspect] = useState("9:16");
  const [captions, setCaptions] = useState(true);
  const [captionStyle, setCaptionStyle] = useState<1 | 2 | 3 | 4>(1);
  const [cleanAudio, setCleanAudio] = useState(false);
  const [audioPreset, setAudioPreset] = useState<"original" | "voice" | "broadcast" | "music">("original");
  const [masterGainDb, setMasterGainDb] = useState(0);
  const [quality, setQuality] = useState<"draft" | "social" | "master">("social");
  const [resolution, setResolution] = useState<"720p" | "1080p" | "2160p">("1080p");
  const [fps, setFps] = useState<24 | 30 | 60>(30);
  const [candidates, setCandidates] = useState<CutCandidates | null>(null);
  const [mediaLibrary, setMediaLibrary] = useState<ProjectMedia[]>([]);
  const [lutLibrary, setLutLibrary] = useState<ProjectLut[]>([]);
  const [transcriptDraft, setTranscriptDraft] = useState<CutTranscript | null>(null);
  const [transcriptSearch, setTranscriptSearch] = useState("");
  const [savingTranscript, setSavingTranscript] = useState(false);
  const [reviews, setReviews] = useState<ReviewVersion[]>([]);
  const [reviewUrl, setReviewUrl] = useState("");
  const [comparisonVersionIds, setComparisonVersionIds] = useState<string[]>([]);
  const [comparisonMedia, setComparisonMedia] = useState<Record<string, string>>({});
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [collaboratorUsername, setCollaboratorUsername] = useState("");
  const [workspaceNote, setWorkspaceNote] = useState("");
  const [audioLevelDb, setAudioLevelDb] = useState(-60);
  const [liveLufs, setLiveLufs] = useState(-70);
  const [loudnessMeasurement, setLoudnessMeasurement] = useState<LoudnessMeasurement | null>(null);
  const [audioTemplates, setAudioTemplates] = useState<AudioRoutingTemplate[]>([]);
  const [audioTemplateName, setAudioTemplateName] = useState("");

  const refreshProjects = useCallback(async () => {
    const response = await apiRequest("GET", "/api/cut/projects");
    setProjects(await response.json());
  }, []);

  useEffect(() => { void refreshProjects().catch((error) => setMessage(error.message)); }, [refreshProjects]);

  const openProject = useCallback(async (id: string) => {
    setBusy("open"); setMessage("");
    try {
      const [projectResponse, mediaResponse, reviewResponse, workspaceResponse] = await Promise.all([apiRequest("GET", `/api/cut/projects/${id}`), apiRequest("GET", `/api/cut/projects/${id}/media`), apiRequest("GET", `/api/cut/projects/${id}/reviews`), apiRequest("GET", `/api/cut/workspace/projects/${id}`)]);
      const next = await projectResponse.json() as Project;
      const secure = await mediaResponse.json() as { url: string };
      const projectJobs = next.jobs ?? [];
      const projectMedia = next.media ?? [];
      const primaryMedia = projectMedia.find((item) => item.assetId === next.sourceAssetId) ?? projectMedia[0] ?? null;
      const templateResponse = await apiRequest("GET", `/api/cut/audio-routing-templates?businessId=${encodeURIComponent(next.businessId)}`);
      edlRef.current = next.edl;
      setProject(next); setEdl(next.edl); setRevision(next.revision); setJobs(projectJobs); setMediaLibrary(projectMedia); setLutLibrary(next.luts ?? []); setLoudnessMeasurement(null); setMediaUrl(secure.url); setSourceMedia(primaryMedia); setSourceMediaUrl(secure.url); setSourceIn(0); setSourceOut(primaryMedia?.duration ?? next.duration); setHistory([]); setFuture([]); setPlayhead(0); setSelectedClip(0); setSelectedClipIds(next.edl.clips[0]?.id ? [next.edl.clips[0].id] : []); setTranscriptDraft(next.transcript); setTranscriptSearch(""); setHighlights(projectJobs.find((job) => job.kind === "highlights" && job.state === "done")?.output?.candidates ?? []); setReviews(await reviewResponse.json() as ReviewVersion[]); setWorkspace(await workspaceResponse.json() as WorkspacePayload); setAudioTemplates(await templateResponse.json() as AudioRoutingTemplate[]); setAudioTemplateName(""); setReviewUrl(""); setComparisonVersionIds([]); setComparisonMedia({}); setCollaboratorUsername(""); setWorkspaceNote(""); setSaveStatus("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not open the project"); }
    finally { setBusy(""); }
  }, []);

  useEffect(() => {
    if (initialProjectOpened.current) return;
    const requestedProject = new URLSearchParams(window.location.search).get("project");
    if (!requestedProject || !/^[0-9a-f-]{36}$/i.test(requestedProject)) return;
    initialProjectOpened.current = true;
    void openProject(requestedProject);
  }, [openProject]);

  const applyEdit = useCallback((next: CutEdl) => {
    const current = edlRef.current;
    if (!current) return;
    const validClipIds = new Set(next.clips.flatMap((item) => item.id ? [item.id] : []));
    const compounds = (next.compounds ?? current.compounds ?? []).flatMap((compound) => {
      const clipIds = compound.clipIds.filter((id) => validClipIds.has(id));
      return clipIds.length >= 2 ? [{ ...compound, clipIds }] : [];
    });
    const complete = { ...next, graphics: next.graphics ?? current.graphics, markers: next.markers ?? current.markers, compounds, tracks: next.tracks ?? current.tracks, audioBuses: next.audioBuses ?? current.audioBuses };
    edlRef.current = complete;
    setHistory((items) => [...items.slice(-49), current]); setFuture([]); setEdl(complete);
  }, []);

  useEffect(() => { edlRef.current = edl; }, [edl]);

  useEffect(() => {
    if (!edl) return;
    const validIds = new Set(edl.clips.flatMap((item) => item.id ? [item.id] : []));
    setSelectedClipIds((ids) => {
      const retained = ids.filter((id) => validIds.has(id));
      if (retained.length) return retained;
      const fallback = edl.clips[Math.min(selectedClip, edl.clips.length - 1)]?.id;
      return fallback ? [fallback] : [];
    });
  }, [edl, selectedClip]);

  useEffect(() => {
    if (!project || !edl || JSON.stringify(edl) === JSON.stringify(project.edl)) return;
    clearTimeout(saveTimer.current);
    setSaveStatus("Saving…");
    saveTimer.current = setTimeout(async () => {
      try {
        const response = await apiRequest("PUT", `/api/cut/projects/${project.id}/edl`, edl, { "If-Match": String(revision) });
        const saved = await response.json() as CutEdl;
        const nextRevision = Number(response.headers.get("X-EDL-Rev"));
        edlRef.current = saved;
        setRevision(nextRevision); setEdl(saved); setProject((value) => value ? { ...value, edl: saved, revision: nextRevision } : value); setSaveStatus("Saved");
      } catch (error) { setSaveStatus("Save failed"); setMessage(error instanceof Error ? error.message : "Could not save the edit"); }
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

  const uploadProjectLut = async (file: File) => {
    if (!project || !edl) return;
    if (!/\.cube$/i.test(file.name) || file.size <= 0 || file.size > 8 * 1024 * 1024) return setMessage("Choose a .cube 3D LUT up to 8 MB");
    setBusy("lut"); setMessage("Validating private LUT…");
    let pendingAssetId: string | null = null;
    try {
      let asset: { id: string };
      try {
        const intent = await (await apiRequest("POST", "/api/assets/upload-intents", { kind: "cut-lut", filename: file.name, mimeType: "text/plain", sizeBytes: file.size, visibility: "private" })).json() as { asset: { id: string }; upload: { uploadUrl: string } };
        pendingAssetId = intent.asset.id;
        const stored = await fetch(intent.upload.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": "text/plain" } });
        if (!stored.ok) throw new Error("Direct storage upload was unavailable");
        await apiRequest("POST", `/api/assets/${intent.asset.id}/complete`, {});
        asset = intent.asset;
      } catch (directError) {
        if (pendingAssetId) await apiRequest("DELETE", `/api/assets/${pendingAssetId}`, {}).catch(() => undefined);
        const body = new FormData(); body.append("kind", "cut-lut"); body.append("visibility", "private"); body.append("cut-lut", file, file.name);
        const response = await fetch("/api/assets/upload-proxy", { method: "POST", credentials: "include", body });
        if (!response.ok) { const result = await response.json().catch(() => ({})) as { message?: string }; throw new Error(result.message ?? (directError instanceof Error ? directError.message : "The private LUT upload failed")); }
        asset = ((await response.json()) as { asset: { id: string } }).asset;
      }
      const registered = await (await apiRequest("POST", `/api/cut/projects/${project.id}/luts`, { assetId: asset.id, name: file.name })).json() as ProjectLut;
      setLutLibrary((items) => [registered, ...items.filter((item) => item.id !== registered.id)]);
      applyEdit({ ...edl, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, lutAssetId: registered.id } : item) });
      setMessage(`${registered.name} applied to the selected clip`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not import the LUT"); }
    finally { setBusy(""); }
  };

  const openSourceMedia = async (media: ProjectMedia) => {
    if (!project) return;
    setBusy("source-media");
    try {
      const descriptor = await (await apiRequest("GET", `/api/cut/projects/${project.id}/media-library/${media.id}/media`)).json() as { url: string };
      setSourceMedia(media); setSourceMediaUrl(descriptor.url); setSourceIn(0); setSourceOut(media.duration);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not open source media"); }
    finally { setBusy(""); }
  };

  const addMediaClip = (media: ProjectMedia, range: { start: number; end: number } = { start: 0, end: media.duration }) => {
    if (!project || !edl) return;
    if (project.mediaKind !== "video") return setMessage("Start with a video project before adding multitrack layers");
    if (range.end - range.start < .05 || range.start < 0 || range.end > media.duration + .01) return setMessage("Choose a valid source range before inserting it");
    const timelineDuration = Math.max(project.duration, ...mediaLibrary.map((item) => item.duration));
    const track = media.mediaKind === "audio" ? "a1" : "v2";
    const next = validateCutEdl({ version: 3, clips: [
      ...edl.clips,
      { id: `clip_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`, assetId: media.assetId, label: media.name.slice(0, 80), start: range.start, end: range.end, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, track, timelineStart: Math.min(playhead, cutDuration(edl)), transform: { x: 0, y: 0, width: 1, height: 1, opacity: 1 } },
    ], graphics: edl.graphics, markers: edl.markers, compounds: edl.compounds }, timelineDuration);
    applyEdit(next);
    setSelectedClip(next.clips.length - 1);
    setSelectedClipIds(next.clips.at(-1)?.id ? [next.clips.at(-1)!.id!] : []);
    setMessage(`${media.name} ${formatTime(range.start)}–${formatTime(range.end)} added to ${track.toUpperCase()} at the playhead`);
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
  const render = async (clip?: { start: number; end: number }) => { await startJob("render", { aspect, captions, captionStyle, cleanAudio, audioPreset, masterGainDb, quality, resolution, fps, clip }); };
  const sendRenderToDistribution = async (job: Job) => {
    if (!project) return;
    setBusy(`distribution:${job.id}`);
    setMessage("");
    try {
      const asset = await (await apiRequest("POST", `/api/cut/jobs/${job.id}/distribute`, {})).json() as { id: string };
      const suggestedContent = (highlights[0]?.title || transcriptDraft?.segments.find((segment) => segment.text.trim())?.text || project.name).trim().slice(0, 2_200);
      const params = new URLSearchParams({
        asset: asset.id,
        format: "Video",
        source: "cutstudio",
        project: project.id,
        render: job.id,
        content: suggestedContent,
      });
      setLocation(`/distribution?${params.toString()}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send this render to Distribution Studio");
    } finally {
      setBusy("");
    }
  };
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

  const moveTranscriptSegment = (segmentId: string, direction: -1 | 1) => setTranscriptDraft((current) => {
    if (!current) return current;
    const index = current.segments.findIndex((segment) => segment.id === segmentId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.segments.length) return current;
    const segments = [...current.segments];
    [segments[index], segments[target]] = [segments[target], segments[index]];
    return { ...current, segments };
  });

  const applyStoryOrder = async () => {
    if (!project || !edl || !transcriptDraft) return;
    setBusy("story");
    try {
      const response = await apiRequest("PUT", `/api/cut/projects/${project.id}/story-order`, { transcript: transcriptDraft }, { "If-Match": String(revision) });
      const saved = await response.json() as { edl: CutEdl; transcript: CutTranscript; revision: number };
      setHistory((items) => [...items.slice(-49), edl]);
      setFuture([]);
      setEdl(saved.edl);
      setTranscriptDraft(saved.transcript);
      setRevision(saved.revision);
      setProject((value) => value ? { ...value, edl: saved.edl, transcript: saved.transcript, revision: saved.revision } : value);
      setMessage("Transcript order and speaker labels applied to the timeline");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not apply story order"); }
    finally { setBusy(""); }
  };

  const retryJob = async (job: Job) => {
    try {
      const retry = await (await apiRequest("POST", `/api/cut/jobs/${job.id}/retry`, {})).json() as Job;
      setJobs((items) => [retry, ...items]);
      setMessage("Retry queued");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not retry the job"); }
  };

  const cancelRender = async (job: Job) => {
    setBusy(`cancel:${job.id}`);
    try {
      const cancelled = await (await apiRequest("POST", `/api/cut/jobs/${job.id}/cancel`, {})).json() as Job;
      setJobs((items) => items.map((item) => item.id === cancelled.id ? cancelled : item));
      setMessage("Render cancelled");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not cancel the render"); }
    finally { setBusy(""); }
  };

  const refreshReviews = async () => {
    if (!project) return;
    setReviews(await (await apiRequest("GET", `/api/cut/projects/${project.id}/reviews`)).json() as ReviewVersion[]);
  };

  const refreshWorkspace = async () => {
    if (!project) return;
    setWorkspace(await (await apiRequest("GET", `/api/cut/workspace/projects/${project.id}`)).json() as WorkspacePayload);
  };

  const addCollaborator = async () => {
    if (!project || !collaboratorUsername.trim()) return;
    setBusy("collaborator"); setMessage("");
    try {
      await apiRequest("POST", `/api/cut/projects/${project.id}/collaborators`, { username: collaboratorUsername, role: "reviewer" });
      setCollaboratorUsername(""); await refreshWorkspace(); setMessage("Workspace collaborator added and notified");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not add that collaborator"); }
    finally { setBusy(""); }
  };

  const addWorkspaceNote = async () => {
    if (!project || !workspaceNote.trim()) return;
    setBusy("workspace-note"); setMessage("");
    try {
      await apiRequest("POST", `/api/cut/workspace/projects/${project.id}/notes`, { body: workspaceNote, positionMs: Math.round(playhead * 1_000) });
      setWorkspaceNote(""); await refreshWorkspace(); setMessage("Workspace note added");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not add the workspace note"); }
    finally { setBusy(""); }
  };

  const createReview = async (job: Job) => {
    if (!project) return;
    setBusy(`review:${job.id}`); setMessage("");
    try {
      const result = await (await apiRequest("POST", `/api/cut/projects/${project.id}/reviews`, { jobId: job.id, label: "Creative review", expiresDays: 14 })).json() as { reviewUrl: string };
      setReviewUrl(result.reviewUrl);
      await navigator.clipboard.writeText(result.reviewUrl).catch(() => undefined);
      await refreshReviews();
      setMessage("Secure review link created and copied. The token is shown once, so copy it now if your browser blocked the clipboard.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create the review link"); }
    finally { setBusy(""); }
  };

  const toggleComparisonVersion = async (version: ReviewVersion) => {
    if (!project || !version.artifactAssetId) return;
    if (comparisonVersionIds.includes(version.id)) {
      setComparisonVersionIds((ids) => ids.filter((id) => id !== version.id));
      return;
    }
    try {
      if (!comparisonMedia[version.id]) {
        const response = await apiRequest("GET", `/api/cut/projects/${project.id}/versions/${version.id}/media`);
        const descriptor = await response.json() as { url: string };
        setComparisonMedia((media) => ({ ...media, [version.id]: descriptor.url }));
      }
      setComparisonVersionIds((ids) => [...ids.slice(-1), version.id]);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load that review version"); }
  };

  const toggleComparisonPlayback = async () => {
    const videos = comparisonVideoRefs.current.filter((video): video is HTMLVideoElement => Boolean(video));
    if (videos.length !== 2) return;
    if (videos.some((video) => video.paused)) await Promise.all(videos.map((video) => video.play()));
    else videos.forEach((video) => video.pause());
  };

  const synchronizeComparison = (leader: HTMLVideoElement) => {
    const follower = comparisonVideoRefs.current.find((video) => video && video !== leader);
    if (follower && Math.abs(follower.currentTime - leader.currentTime) > .12) follower.currentTime = leader.currentTime;
  };

  const seek = (time: number) => { setPlayhead(time); if (mediaRef.current) mediaRef.current.currentTime = time; };
  const stopAudioMeter = () => {
    if (meterFrameRef.current) cancelAnimationFrame(meterFrameRef.current);
    meterFrameRef.current = undefined;
    setAudioLevelDb(-60);
    setLiveLufs(-70);
    loudnessEnergyRef.current = [];
  };
  const startAudioMeter = async () => {
    const media = mediaRef.current;
    if (!media) return;
    try {
      const AudioContextClass = window.AudioContext;
      if (audioSourceElementRef.current && audioSourceElementRef.current !== media) {
        audioSourceRef.current?.disconnect();
        analyserRef.current?.disconnect();
        meterFilterRefs.current?.highPass.disconnect();
        meterFilterRefs.current?.shelf.disconnect();
        meterFilterRefs.current?.sink.disconnect();
        await audioContextRef.current?.close();
        audioContextRef.current = null;
        audioSourceRef.current = null;
        analyserRef.current = null;
        meterFilterRefs.current = null;
      }
      if (!audioContextRef.current || audioContextRef.current.state === "closed") audioContextRef.current = new AudioContextClass();
      if (!audioSourceRef.current) {
        audioSourceRef.current = audioContextRef.current.createMediaElementSource(media);
        audioSourceElementRef.current = media;
        const highPass = audioContextRef.current.createBiquadFilter();
        highPass.type = "highpass"; highPass.frequency.value = 38; highPass.Q.value = .5;
        const shelf = audioContextRef.current.createBiquadFilter();
        shelf.type = "highshelf"; shelf.frequency.value = 1_500; shelf.gain.value = 4;
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 1024;
        const sink = audioContextRef.current.createGain(); sink.gain.value = 0;
        audioSourceRef.current.connect(audioContextRef.current.destination);
        audioSourceRef.current.connect(highPass).connect(shelf).connect(analyserRef.current).connect(sink).connect(audioContextRef.current.destination);
        meterFilterRefs.current = { highPass, shelf, sink };
      }
      await audioContextRef.current.resume();
      const samples = new Uint8Array(analyserRef.current!.fftSize);
      const weightedSamples = new Float32Array(analyserRef.current!.fftSize);
      const measure = () => {
        analyserRef.current!.getByteTimeDomainData(samples);
        analyserRef.current!.getFloatTimeDomainData(weightedSamples);
        setAudioLevelDb(audioRmsDb(samples));
        const energy = weightedSamples.reduce((sum, sample) => sum + sample * sample, 0) / weightedSamples.length;
        const now = performance.now();
        loudnessEnergyRef.current.push({ at: now, energy });
        loudnessEnergyRef.current = loudnessEnergyRef.current.filter((item) => now - item.at <= 3_000);
        setLiveLufs(shortTermLufs(loudnessEnergyRef.current.map((item) => item.energy)));
        meterFrameRef.current = requestAnimationFrame(measure);
      };
      stopAudioMeter();
      measure();
    } catch {
      stopAudioMeter();
    }
  };
  const analyzeLoudness = async () => {
    if (!project) return;
    setBusy("loudness"); setMessage("Measuring private source loudness…");
    try {
      const measurement = await (await apiRequest("POST", `/api/cut/projects/${project.id}/audio-analysis`, {})).json() as LoudnessMeasurement;
      setLoudnessMeasurement(measurement);
      setMessage(`Measured ${measurement.integratedLufs.toFixed(1)} LUFS · ${measurement.truePeakDbfs.toFixed(1)} dBTP`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not analyze project loudness"); }
    finally { setBusy(""); }
  };
  const onTime = () => {
    const media = mediaRef.current; if (!media || !edl) return;
    const current = media.currentTime; const clip = edl.clips.find((item) => current >= item.start && current < item.end);
    if (!clip) { const next = edl.clips.find((item) => item.start > current); if (next) media.currentTime = next.start; else media.pause(); }
    setPlayhead(media.currentTime);
  };

  useEffect(() => () => {
    if (meterFrameRef.current) cancelAnimationFrame(meterFrameRef.current);
    void audioContextRef.current?.close();
  }, []);

  const undo = () => { const prior = history.at(-1); if (!prior || !edl) return; setFuture((items) => [edl, ...items].slice(0, 50)); setHistory((items) => items.slice(0, -1)); setEdl(prior); };
  const redo = () => { const next = future[0]; if (!next || !edl) return; setHistory((items) => [...items, edl].slice(-50)); setFuture((items) => items.slice(1)); setEdl(next); };

  const addGraphic = () => {
    if (!edl) return;
    if (project?.mediaKind !== "video") return setMessage("Titles require a video project");
    const next = validateCutEdl({ version: 3, clips: edl.clips, graphics: [...(edl.graphics ?? []), { id: `graphic_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`, kind: "lower_third", text: "Your title", timelineStart: Math.min(playhead, cutDuration(edl)), duration: 4, x: .08, y: .78, fontSize: 48, textColor: "#ffffff", backgroundColor: "#000000", backgroundOpacity: .72 }], markers: edl.markers, compounds: edl.compounds }, Math.max(project?.duration ?? 0, cutDuration(edl)));
    applyEdit(next);
    setMessage("Title added at the playhead");
  };

  const addTimelineMarker = () => {
    if (!edl) return;
    const marker = { id: `marker_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`, label: `Marker ${(edl.markers?.length ?? 0) + 1}`, position: Math.min(playhead, cutDuration(edl)), kind: "note" as const, color: "#f43f5e" };
    applyEdit({ ...edl, markers: [...(edl.markers ?? []), marker].sort((left, right) => left.position - right.position) });
    setMessage(`Marker added at ${formatTime(marker.position)}`);
  };

  const setSelectedClipTransform = (property: "x" | "y" | "width" | "height" | "opacity", value: number) => {
    if (!edl) return;
    applyEdit({ ...edl, clips: edl.clips.map((item, index) => {
      if (index !== selectedClip) return item;
      const transform = item.transform ?? { x: 0, y: 0, width: 1, height: 1, opacity: 1 };
      const next = { ...transform, [property]: value };
      if (property === "width") next.x = Math.min(next.x, 1 - value);
      if (property === "height") next.y = Math.min(next.y, 1 - value);
      return { ...item, transform: next };
    }) });
  };

  const addMotionKeyframe = () => {
    if (!edl) return;
    const selected = edl.clips[selectedClip];
    if (!selected || edl.version !== 3 || !(selected.track ?? "v1").startsWith("v") || selected.track === "v1") return;
    const transform = selected.transform ?? { x: 0, y: 0, width: 1, height: 1, opacity: 1 };
    const clipDuration = (selected.end - selected.start) / (selected.speed ?? 1);
    const at = Number(Math.max(0, Math.min(clipDuration, playhead - (selected.timelineStart ?? 0))).toFixed(3));
    const next = [...(selected.motionKeyframes ?? []).filter((item) => Math.abs(item.at - at) > .0005), { at, x: transform.x, y: transform.y, scale: motionScale, opacity: transform.opacity, easing: "ease_in_out" as const }].sort((left, right) => left.at - right.at);
    applyEdit({ ...edl, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, motionKeyframes: next } : item) });
    setMessage(`Motion keyframe added at ${formatTime(at)} inside the clip`);
  };

  const addVolumeKeyframe = () => {
    if (!edl || edl.version !== 3) return;
    const selected = edl.clips[selectedClip];
    if (!selected || !((selected.track ?? "v1") === "v1" || (selected.track ?? "").startsWith("a"))) return;
    const clipDuration = (selected.end - selected.start) / (selected.speed ?? 1);
    const at = Number(Math.max(0, Math.min(clipDuration, playhead - (selected.timelineStart ?? 0))).toFixed(3));
    const next = [...(selected.volumeKeyframes ?? []).filter((item) => Math.abs(item.at - at) > .0005), { at, volume: selected.volume ?? 1, easing: "ease_in_out" as const }].sort((left, right) => left.at - right.at);
    applyEdit({ ...edl, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, volumeKeyframes: next } : item) });
    setMessage(`Volume keyframe added at ${formatTime(at)} inside the clip`);
  };

  const applyVolumeAutomationPreset = (preset: "fade_up" | "fade_down" | "duck_middle") => {
    if (!edl || edl.version !== 3) return;
    const selected = edl.clips[selectedClip];
    if (!selected) return;
    const duration = Number(((selected.end - selected.start) / (selected.speed ?? 1)).toFixed(3));
    const full = selected.volume ?? 1;
    const volume = preset === "fade_up" ? 0 : full;
    const volumeKeyframes = preset === "fade_up" ? [{ at: duration, volume: full, easing: "ease_in_out" as const }]
      : preset === "fade_down" ? [{ at: duration, volume: 0, easing: "ease_in_out" as const }]
      : [{ at: Number((duration * .25).toFixed(3)), volume: full }, { at: Number((duration * .35).toFixed(3)), volume: Number((full * .2).toFixed(3)), easing: "ease_in_out" as const }, { at: Number((duration * .65).toFixed(3)), volume: Number((full * .2).toFixed(3)) }, { at: Number((duration * .75).toFixed(3)), volume: full, easing: "ease_in_out" as const }];
    applyEdit({ ...edl, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, volume, volumeKeyframes } : item) });
    setMessage(`${preset === "fade_up" ? "Fade up" : preset === "fade_down" ? "Fade down" : "Conversation dip"} volume automation applied`);
  };

  const applyMotionPreset = (preset: "slide_right" | "slide_left" | "rise" | "zoom_in" | "zoom_out" | "fade_in" | "fade_out") => {
    if (!edl) return;
    const selected = edl.clips[selectedClip];
    if (!selected) return;
    const transform = selected.transform ?? { x: 0, y: 0, width: 1, height: 1, opacity: 1 };
    const duration = Number(((selected.end - selected.start) / (selected.speed ?? 1)).toFixed(3));
    const maximumX = Math.max(0, 1 - transform.width);
    const maximumY = Math.max(0, 1 - transform.height);
    const start = preset === "slide_right" ? { x: 0, y: transform.y } : preset === "slide_left" ? { x: maximumX, y: transform.y } : preset === "rise" ? { x: transform.x, y: maximumY } : preset === "fade_in" ? { ...transform, opacity: 0 } : transform;
    const finish = preset === "slide_right" ? { x: maximumX, y: transform.y } : preset === "slide_left" ? { x: 0, y: transform.y } : preset === "rise" ? { x: transform.x, y: 0 } : preset === "fade_out" ? { ...transform, opacity: 0 } : transform;
    const motionKeyframes = preset === "zoom_in" ? [{ at: 0, x: transform.x, y: transform.y, scale: .35, opacity: transform.opacity, easing: "ease_in_out" as const }, { at: duration, x: transform.x, y: transform.y, scale: 1, opacity: transform.opacity, easing: "ease_in_out" as const }]
      : preset === "zoom_out" ? [{ at: duration, x: transform.x, y: transform.y, scale: .35, opacity: transform.opacity, easing: "ease_in_out" as const }]
      : [{ at: duration, ...finish, easing: "ease_in_out" as const }];
    applyEdit({ ...edl, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, transform: { ...transform, ...start }, motionKeyframes } : item) });
    const labels = { slide_right: "Slide right", slide_left: "Slide left", rise: "Rise", zoom_in: "Zoom in", zoom_out: "Zoom out", fade_in: "Fade in", fade_out: "Fade out" };
    setMessage(`${labels[preset]} motion preset applied`);
  };

  const groupSelectedClips = () => {
    if (!edl || selectedClipIds.length < 2) return;
    applyEdit(groupCutClips(edl, selectedClipIds, `group_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`));
    setMessage(`${selectedClipIds.length} clips grouped`);
  };

  const ungroupSelectedClips = () => {
    if (!edl || !selectedClipIds.length) return;
    applyEdit(ungroupCutClips(edl, selectedClipIds));
    setMessage("Clip group released");
  };

  const compoundSelectedClips = () => {
    if (!edl || selectedClipIds.length < 2) return;
    const count = (edl.compounds?.length ?? 0) + 1;
    applyEdit(createCutCompound(edl, selectedClipIds, `Compound ${count}`, `compound_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`));
    setMessage(`${selectedClipIds.length} clips combined into a durable compound`);
  };

  const breakApartSelectedCompound = () => {
    if (!edl || !selectedClipIds.length) return;
    applyEdit(breakApartCutCompound(edl, selectedClipIds));
    setMessage("Compound broken apart into its original clips");
  };

  const moveSelectionToPlayhead = () => {
    if (!edl || edl.version !== 3) return;
    const anchorId = edl.clips[selectedClip]?.id ?? selectedClipIds[0];
    if (!anchorId) return;
    const anchor = edl.clips.find((item) => item.id === anchorId);
    if (edl.tracks?.find((track) => track.track === (anchor?.track ?? "v1"))?.locked) return setMessage("Unlock this track before moving its clips");
    applyEdit(moveCutClipGroup(edl, anchorId, playhead, snapEnabled));
    setMessage(`Selection moved to ${formatTime(playhead)}${snapEnabled ? " with snapping" : ""}`);
  };

  const startClipDrag = (event: ReactPointerEvent<HTMLButtonElement>, item: CutEdl["clips"][number]) => {
    if (!edl || edl.version !== 3 || !item.id || event.button !== 0 || edl.tracks?.find((track) => track.track === (item.track ?? "v1"))?.locked) return;
    const trackWidth = event.currentTarget.parentElement?.getBoundingClientRect().width ?? 1;
    dragRef.current = { clipId: item.id, startX: event.clientX, trackWidth, origin: edl, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveClipDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const deltaPixels = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(deltaPixels) < 3) return;
    if (!drag.moved) {
      drag.moved = true;
      const clipIndex = drag.origin.clips.findIndex((item) => item.id === drag.clipId);
      if (clipIndex >= 0) setSelectedClip(clipIndex);
      if (!selectedClipIds.includes(drag.clipId)) setSelectedClipIds([drag.clipId]);
    }
    const anchor = drag.origin.clips.find((item) => item.id === drag.clipId);
    if (!anchor) return;
    const requested = (anchor.timelineStart ?? 0) + (deltaPixels / drag.trackWidth) * timelineDuration;
    setEdl(moveCutClipGroup(drag.origin, drag.clipId, requested, snapEnabled));
  };

  const finishClipDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!drag?.moved) return;
    suppressClipClickRef.current = true;
    setHistory((items) => [...items.slice(-49), drag.origin]);
    setFuture([]);
    setMessage(`Clip moved${snapEnabled ? " with snapping" : ""}`);
  };

  const selectTimelineClip = (event: ReactMouseEvent<HTMLButtonElement>, item: CutEdl["clips"][number], index: number) => {
    event.stopPropagation();
    if (suppressClipClickRef.current) {
      suppressClipClickRef.current = false;
      return;
    }
    setSelectedClip(index);
    if (item.id) setSelectedClipIds((ids) => event.shiftKey || event.metaKey || event.ctrlKey ? ids.includes(item.id!) ? ids.filter((id) => id !== item.id) : [...ids, item.id!] : [item.id!]);
    seek(edl?.version === 3 ? (item.timelineStart ?? 0) : item.start);
  };

  const startClipTrim = (event: ReactPointerEvent<HTMLSpanElement>, item: CutEdl["clips"][number], edge: "start" | "end") => {
    event.stopPropagation();
    if (!edl || edl.version !== 3 || !item.id || event.button !== 0 || edl.tracks?.find((track) => track.track === (item.track ?? "v1"))?.locked) return;
    const media = mediaLibrary.find((entry) => entry.assetId === (item.assetId ?? project?.sourceAssetId));
    trimRef.current = { clipId: item.id, edge, startX: event.clientX, trackWidth: event.currentTarget.parentElement?.parentElement?.getBoundingClientRect().width ?? 1, sourceDuration: media?.duration ?? project?.duration ?? item.end, origin: edl, moved: false, rolling: rollingEnabled && edge === "end" };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveClipTrim = (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.stopPropagation();
    const trim = trimRef.current;
    if (!trim) return;
    const deltaPixels = event.clientX - trim.startX;
    if (!trim.moved && Math.abs(deltaPixels) < 3) return;
    trim.moved = true;
    const clip = trim.origin.clips.find((item) => item.id === trim.clipId);
    if (!clip) return;
    const start = clip.timelineStart ?? 0;
    const originalEdge = trim.edge === "start" ? start : start + (clip.end - clip.start) / (clip.speed ?? 1);
    const requested = originalEdge + (deltaPixels / trim.trackWidth) * timelineDuration;
    const snapped = snapEnabled ? snapCutTime(trim.origin, requested, .15, [trim.clipId]) : Math.max(0, requested);
    setEdl(trim.rolling
      ? rollCutEdit(trim.origin, trim.clipId, snapped, { leftSourceDuration: trim.sourceDuration })
      : trimCutClip(trim.origin, trim.clipId, trim.edge, snapped, { rippleMode: trim.edge === "end" ? rippleMode : "off", sourceDuration: trim.sourceDuration }));
  };

  const finishClipTrim = (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.stopPropagation();
    const trim = trimRef.current;
    trimRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!trim?.moved) return;
    setHistory((items) => [...items.slice(-49), trim.origin]);
    setFuture([]);
    const modes = [trim.rolling ? "rolling edit" : trim.edge === "end" && rippleMode !== "off" ? `${rippleMode} ripple` : "", snapEnabled ? "snapping" : ""].filter(Boolean);
    setMessage(`Clip trimmed${modes.length ? ` with ${modes.join(" and ")}` : ""}`);
  };

  const keyboardClipTrim = (event: ReactKeyboardEvent<HTMLSpanElement>, item: CutEdl["clips"][number], edge: "start" | "end") => {
    if (!edl || edl.version !== 3 || !item.id || edl.tracks?.find((track) => track.track === (item.track ?? "v1"))?.locked || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    event.stopPropagation();
    const timelineStart = item.timelineStart ?? 0;
    const currentEdge = edge === "start" ? timelineStart : timelineStart + (item.end - item.start) / (item.speed ?? 1);
    const requested = Math.max(0, currentEdge + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 1 : .1));
    const media = mediaLibrary.find((entry) => entry.assetId === (item.assetId ?? project?.sourceAssetId));
    const sourceDuration = media?.duration ?? project?.duration ?? item.end;
    applyEdit(rollingEnabled && edge === "end"
      ? rollCutEdit(edl, item.id, requested, { leftSourceDuration: sourceDuration })
      : trimCutClip(edl, item.id, edge, requested, { rippleMode: edge === "end" ? rippleMode : "off", sourceDuration }));
    setMessage(`Clip ${edge === "start" ? "in" : "out"} point adjusted${rollingEnabled && edge === "end" ? " with rolling edit" : rippleMode !== "off" && edge === "end" ? ` with ${rippleMode} ripple` : ""}`);
  };

  const keyboardClipMove = (event: ReactKeyboardEvent<HTMLButtonElement>, item: CutEdl["clips"][number]) => {
    if (!edl || edl.version !== 3 || !item.id || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    if (edl.tracks?.find((track) => track.track === (item.track ?? "v1"))?.locked) return setMessage("Unlock this track before moving its clips");
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const requested = Math.max(0, (item.timelineStart ?? 0) + direction * (event.shiftKey ? 1 : .1));
    applyEdit(moveCutClipGroup(edl, item.id, requested, snapEnabled));
    setMessage(`Clip moved${snapEnabled ? " with snapping" : ""}`);
  };

  const cycleRippleMode = () => setRippleMode((mode) => mode === "off" ? "track" : mode === "track" ? "linked" : "off");

  const slipSelectedClip = (delta: number) => {
    if (!edl || edl.version !== 3) return;
    const item = edl.clips[selectedClip];
    if (!item?.id) return;
    if (edl.tracks?.find((track) => track.track === (item.track ?? "v1"))?.locked) return setMessage("Unlock this track before slipping its clips");
    const media = mediaLibrary.find((entry) => entry.assetId === (item.assetId ?? project?.sourceAssetId));
    applyEdit(slipCutClip(edl, item.id, delta, media?.duration ?? project?.duration ?? item.end));
    setMessage(`Source slipped ${delta > 0 ? "forward" : "back"} ${Math.abs(delta).toFixed(1)} seconds without moving the clip`);
  };

  const updateTrackSettings = (track: string, patch: Partial<NonNullable<CutEdl["tracks"]>[number]>) => {
    if (!edl || edl.version !== 3) return;
    const current = edl.tracks?.find((item) => item.track === track) ?? { track, locked: false, hidden: false, muted: false, solo: false, gain: 1 };
    applyEdit({ ...edl, tracks: [...(edl.tracks ?? []).filter((item) => item.track !== track), { ...current, ...patch }] });
  };

  const updateAudioBus = (id: "dialogue" | "music" | "effects", patch: Partial<NonNullable<CutEdl["audioBuses"]>[number]>) => {
    if (!edl || edl.version !== 3) return;
    const defaults = { dialogue: "Dialogue", music: "Music", effects: "Effects" };
    const current = edl.audioBuses?.find((item) => item.id === id) ?? { id, name: defaults[id], gain: 1, muted: false };
    applyEdit({ ...edl, audioBuses: [...(edl.audioBuses ?? []).filter((item) => item.id !== id), { ...current, ...patch }] });
  };

  const applyAudioRoutingPreset = () => {
    if (!edl || edl.version !== 3) return;
    const audioTracks = timelineTracks.filter((track) => track.startsWith("a"));
    applyEdit({ ...edl, tracks: [
      ...(edl.tracks ?? []).filter((item) => !audioTracks.includes(item.track)),
      ...audioTracks.map((track, index) => ({ ...(edl.tracks?.find((item) => item.track === track) ?? { track, locked: false, hidden: false, muted: false, solo: false, gain: 1 }), bus: index === 0 ? "dialogue" as const : index === 1 ? "music" as const : "effects" as const })),
    ], audioBuses: [{ id: "dialogue", name: "Dialogue", gain: 1, muted: false }, { id: "music", name: "Music", gain: .65, muted: false }, { id: "effects", name: "Effects", gain: .8, muted: false }] });
    setMessage("Creator mix preset routed audio tracks to dialogue, music, and effects buses");
  };

  const saveAudioRoutingTemplate = async () => {
    const currentEdl = edlRef.current;
    if (!project || !currentEdl || currentEdl.version !== 3 || !audioTemplateName.trim()) return;
    const defaults = { dialogue: "Dialogue", music: "Music", effects: "Effects" };
    const audioTracks = timelineTracks.filter((track) => track.startsWith("a"));
    const payload: CutAudioRoutingTemplatePayload = {
      audioBuses: (["dialogue", "music", "effects"] as const).map((id) => currentEdl.audioBuses?.find((item) => item.id === id) ?? { id, name: defaults[id], gain: 1, muted: false }),
      trackRouting: audioTracks.map((track, index) => {
        const settings = currentEdl.tracks?.find((item) => item.track === track);
        return { track, bus: settings?.bus ?? (index === 0 ? "dialogue" : index === 1 ? "music" : "effects"), gain: settings?.gain ?? 1, muted: settings?.muted ?? false };
      }),
      duckingTracks: Array.from(new Set(currentEdl.clips.filter((item) => (item.track ?? "").startsWith("a") && item.duckUnderVoice).map((item) => item.track!))),
      finishing: { cleanAudio, audioPreset, masterGainDb },
    };
    setBusy("audio-template"); setMessage("");
    try {
      const response = await apiRequest("POST", "/api/cut/audio-routing-templates", { businessId: project.businessId, name: audioTemplateName.trim(), payload });
      const template = await response.json() as AudioRoutingTemplate;
      setAudioTemplates((current) => [template, ...current.filter((item) => item.id !== template.id && item.name !== template.name)]);
      setAudioTemplateName("");
      setMessage(`Saved ${template.name} for every editor in this business`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save the audio template"); }
    finally { setBusy(""); }
  };

  const applyAudioRoutingTemplate = (template: AudioRoutingTemplate) => {
    if (!edl || edl.version !== 3) return;
    const routing = new Map(template.payload.trackRouting.map((item) => [item.track, item]));
    const duckingTracks = new Set(template.payload.duckingTracks);
    const currentAudioTracks = timelineTracks.filter((track) => track.startsWith("a"));
    applyEdit({
      ...edl,
      tracks: [
        ...(edl.tracks ?? []).filter((item) => !currentAudioTracks.includes(item.track)),
        ...currentAudioTracks.map((track) => {
          const current = edl.tracks?.find((item) => item.track === track) ?? { track, locked: false, hidden: false, muted: false, solo: false, gain: 1 };
          const saved = routing.get(track);
          return saved ? { ...current, bus: saved.bus, gain: saved.gain, muted: saved.muted } : current;
        }),
      ],
      audioBuses: template.payload.audioBuses,
      clips: edl.clips.map((item) => (item.track ?? "").startsWith("a") ? { ...item, duckUnderVoice: duckingTracks.has(item.track!) } : item),
    });
    setCleanAudio(template.payload.finishing.cleanAudio);
    setAudioPreset(template.payload.finishing.audioPreset);
    setMasterGainDb(template.payload.finishing.masterGainDb);
    setMessage(`Applied ${template.name} routing, ducking, and finishing defaults`);
  };

  const deleteAudioRoutingTemplate = async (template: AudioRoutingTemplate) => {
    if (!window.confirm(`Remove ${template.name} from this business? Existing project mixes will not change.`)) return;
    await apiRequest("DELETE", `/api/cut/audio-routing-templates/${template.id}`);
    setAudioTemplates((current) => current.filter((item) => item.id !== template.id));
    setMessage(`Removed ${template.name} from the shared library`);
  };

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
  const clipWaveformUrl = (item: CutEdl["clips"][number]) => {
    if (!(item.track ?? "v1").startsWith("a")) return "";
    const media = mediaLibrary.find((entry) => entry.assetId === (item.assetId ?? project.sourceAssetId));
    return media ? `/api/cut/projects/${encodeURIComponent(project.id)}/media-library/${encodeURIComponent(media.id)}/waveform` : "";
  };
  const words = project.transcript?.segments.flatMap((segment) => segment.words) ?? [];
  const renders = jobs.filter((job) => job.kind === "render");
  const transcriptJob = jobs.find((job) => job.kind === "transcribe");
  const highlightJob = jobs.find((job) => job.kind === "highlights");
  const transcriptMatches = (transcriptDraft?.segments ?? []).filter((segment) => !transcriptSearch.trim() || segment.text.toLowerCase().includes(transcriptSearch.trim().toLowerCase()));
  const renderEstimate = estimateCutRenderSeconds(cutDuration(edl), { aspect, captions, captionStyle, cleanAudio, audioPreset, masterGainDb, quality, resolution, fps } as CutRenderRequest);
  return (
    <main className="min-h-screen bg-black pb-24 text-white">
      <header className="sticky top-0 z-30 flex h-14 items-center border-b border-zinc-800 bg-black px-3"><Button variant="ghost" size="icon" onClick={() => { setProject(null); setEdl(null); }} aria-label="Projects"><ArrowLeft/></Button><Scissors className="ml-1 h-5 w-5 text-[#1d9bf0]"/><h1 className="ml-2 min-w-0 flex-1 truncate font-bold">{project.name}</h1><Button variant="ghost" size="icon" disabled={!history.length} onClick={undo} aria-label="Undo"><Undo2/></Button><Button variant="ghost" size="icon" disabled={!future.length} onClick={redo} aria-label="Redo"><Redo2/></Button><a className="ml-1 rounded-lg border border-zinc-700 p-2" href={`/api/cut/projects/${project.id}/export.edl`} aria-label="Export EDL"><Download className="h-4 w-4"/></a></header>
      <div className="mx-auto grid max-w-[1500px] gap-4 p-3 lg:grid-cols-[1fr_360px]">
        <section className="min-w-0 space-y-4">
          <div className="grid gap-3 xl:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950" aria-label="Source monitor">
            <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2"><div><p className="text-[10px] font-bold uppercase tracking-wider text-[#1d9bf0]">Source monitor</p><p className="max-w-56 truncate text-xs text-zinc-400">{sourceMedia?.name ?? "Choose project media"}</p></div><span className="text-[10px] text-zinc-600">{formatTime(sourceIn)}–{formatTime(sourceOut)}</span></div>
            <div className="flex min-h-[220px] items-center justify-center bg-black">
              {sourceMedia && sourceMediaUrl ? sourceMedia.mediaKind === "video" ? <video ref={(node) => { sourceMediaRef.current = node; }} className="max-h-[44vh] w-full object-contain" src={sourceMediaUrl} controls/> : <audio ref={(node) => { sourceMediaRef.current = node; }} className="w-[90%]" src={sourceMediaUrl} controls/> : <p className="text-xs text-zinc-600">Open an asset from Project media</p>}
            </div>
            <div className="grid grid-cols-3 gap-2 p-3">
              <Button size="sm" variant="outline" disabled={!sourceMedia} onClick={() => { const current = Math.min(sourceOut - .05, Math.max(0, sourceMediaRef.current?.currentTime ?? 0)); setSourceIn(current); setMessage(`Source in marked at ${formatTime(current)}`); }}>Mark in</Button>
              <Button size="sm" variant="outline" disabled={!sourceMedia} onClick={() => { const current = Math.max(sourceIn + .05, Math.min(sourceMedia?.duration ?? 0, sourceMediaRef.current?.currentTime ?? sourceMedia?.duration ?? 0)); setSourceOut(current); setMessage(`Source out marked at ${formatTime(current)}`); }}>Mark out</Button>
              <Button size="sm" disabled={!sourceMedia || sourceOut - sourceIn < .05} onClick={() => sourceMedia && addMediaClip(sourceMedia, { start: sourceIn, end: sourceOut })}>Insert range</Button>
            </div>
          </div>
          <div className="relative flex min-h-[280px] items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950" aria-label="Timeline monitor">
            <span className="absolute left-3 top-2 z-10 rounded bg-black/75 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#1d9bf0]">Timeline monitor</span>
            {project.mediaKind === "video" ? <video crossOrigin="anonymous" ref={(node) => { mediaRef.current = node; }} className="max-h-[58vh] w-full bg-black object-contain" style={{ filter: previewColorFilter(clip) }} src={mediaUrl} controls onPlay={() => void startAudioMeter()} onPause={stopAudioMeter} onEnded={stopAudioMeter} onTimeUpdate={onTime}/> : <audio crossOrigin="anonymous" ref={(node) => { mediaRef.current = node; }} className="w-[90%]" src={mediaUrl} controls onPlay={() => void startAudioMeter()} onPause={stopAudioMeter} onEnded={stopAudioMeter} onTimeUpdate={onTime}/>}
            {(edl.graphics ?? []).filter((graphic) => playhead >= graphic.timelineStart && playhead <= graphic.timelineStart + graphic.duration).map((graphic) => <div key={graphic.id} className="pointer-events-none absolute max-w-[80%] rounded px-3 py-2 font-bold" style={{ left: `${graphic.x * 100}%`, top: `${graphic.y * 100}%`, color: graphic.textColor, backgroundColor: `${graphic.backgroundColor}${Math.round(graphic.backgroundOpacity * 255).toString(16).padStart(2, "0")}`, fontSize: `${Math.max(12, Math.min(48, graphic.fontSize / 2))}px` }}>{graphic.text}</div>)}
          </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2" aria-label="Realtime audio RMS meter"><span className="w-24 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Live loudness</span><div className="h-2 min-w-32 flex-1 overflow-hidden rounded-full bg-zinc-900"><div className={`h-full transition-[width] duration-75 ${audioLevelDb > -6 ? "bg-red-500" : audioLevelDb > -18 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${Math.max(0, Math.min(100, ((audioLevelDb + 60) / 60) * 100))}%` }}/></div><output aria-label="Live RMS level" className="w-20 text-right font-mono text-xs text-zinc-300">{audioLevelDb.toFixed(1)} dBFS</output><output aria-label="Live short-term loudness" className="w-24 text-right font-mono text-xs font-bold text-[#1d9bf0]">{liveLufs.toFixed(1)} LUFS-S</output></div><div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2" aria-label="Calibrated loudness analysis"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">EBU R128 loudness</p><p className="mt-1 text-[10px] text-zinc-600">Live LUFS-S uses a rolling three-second K-weighted estimate. Analyze provides calibrated integrated evidence for the private source.</p></div><Button size="sm" variant="outline" disabled={busy === "loudness"} onClick={() => void analyzeLoudness()}>{busy === "loudness" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"/> : <Volume2 className="mr-1.5 h-3.5 w-3.5"/>}Analyze</Button></div>{loudnessMeasurement && <div className="mt-2 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-black p-2"><output className="block font-mono text-sm font-bold text-white">{loudnessMeasurement.integratedLufs.toFixed(1)}</output><span className="text-[9px] text-zinc-500">LUFS-I</span></div><div className="rounded-lg bg-black p-2"><output className="block font-mono text-sm font-bold text-white">{loudnessMeasurement.truePeakDbfs.toFixed(1)}</output><span className="text-[9px] text-zinc-500">dBTP</span></div><div className="rounded-lg bg-black p-2"><output className="block font-mono text-sm font-bold text-white">{loudnessMeasurement.loudnessRangeLu.toFixed(1)}</output><span className="text-[9px] text-zinc-500">LRA · LU</span></div></div>}</div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold">Timeline</h2><p className="text-xs text-zinc-500">{formatTime(playhead)} / {formatTime(timelineDuration)} · {edl.clips.length} clips · {edl.markers?.length ?? 0} markers · {edl.compounds?.length ?? 0} compounds</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant={snapEnabled ? "default" : "outline"} onClick={() => setSnapEnabled((value) => !value)} aria-pressed={snapEnabled}><Magnet className="mr-1.5 h-4 w-4"/>Snap</Button><Button size="sm" variant={rippleMode !== "off" ? "default" : "outline"} onClick={cycleRippleMode} aria-label={`Ripple ${rippleMode}`} aria-pressed={rippleMode !== "off"}>Ripple {rippleMode}</Button><Button size="sm" variant={rollingEnabled ? "default" : "outline"} onClick={() => setRollingEnabled((value) => !value)} aria-pressed={rollingEnabled}>Roll edit</Button><Button size="sm" variant="outline" onClick={addTimelineMarker}><Flag className="mr-1.5 h-4 w-4"/>Marker</Button><Button size="sm" variant="outline" disabled={selectedClipIds.length < 2} onClick={groupSelectedClips}><Link2 className="mr-1.5 h-4 w-4"/>Group</Button><Button size="sm" variant="outline" disabled={!selectedClipIds.some((id) => edl.clips.find((item) => item.id === id)?.groupId)} onClick={ungroupSelectedClips}><Unlink2 className="mr-1.5 h-4 w-4"/>Ungroup</Button><Button size="sm" variant="outline" disabled={selectedClipIds.length < 2} onClick={compoundSelectedClips}>Make compound</Button><Button size="sm" variant="outline" disabled={!selectedClipIds.some((id) => edl.compounds?.some((compound) => compound.clipIds.includes(id)))} onClick={breakApartSelectedCompound}>Break apart</Button><Button size="sm" variant="outline" disabled={edl.version !== 3 || !edl.clips[selectedClip]?.id} onClick={moveSelectionToPlayhead}>Move to playhead</Button><Button size="sm" variant="outline" onClick={() => applyEdit(splitCutAt(edl, playhead))}><Scissors className="mr-2 h-4 w-4"/>Split</Button></div></div>
             {edl.version === 3 && timelineTracks.some((track) => track.startsWith("a")) && <div className="mb-3 rounded-xl border border-zinc-800 bg-black p-3" aria-label="Audio mix buses">
               <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold">Audio buses</p><p className="mt-1 text-[10px] text-zinc-500">Route tracks once, then balance dialogue, music, and effects as reusable groups.</p></div><Button size="sm" variant="outline" onClick={applyAudioRoutingPreset}>Creator mix preset</Button></div>
               <div className="mt-3 grid gap-2 sm:grid-cols-3">{(["dialogue", "music", "effects"] as const).map((id) => { const fallback = id[0].toUpperCase() + id.slice(1); const bus = edl.audioBuses?.find((item) => item.id === id) ?? { id, name: fallback, gain: 1, muted: false }; return <div key={id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-2"><div className="flex items-center gap-2"><input aria-label={`${fallback} bus name`} maxLength={40} value={bus.name} className="min-w-0 flex-1 bg-transparent text-xs font-bold outline-none" onChange={(event) => updateAudioBus(id, { name: event.target.value || fallback })}/><button aria-label={`${bus.muted ? "Unmute" : "Mute"} ${fallback} bus`} onClick={() => updateAudioBus(id, { muted: !bus.muted })}>{bus.muted ? <VolumeX className="h-3.5 w-3.5 text-red-400"/> : <Volume2 className="h-3.5 w-3.5 text-zinc-400"/>}</button></div><label className="mt-2 flex items-center gap-2 text-[9px] text-zinc-500">Gain<input aria-label={`${fallback} bus gain`} type="range" min={0} max={2} step={.05} value={bus.gain} className="min-w-0 flex-1 accent-[#1d9bf0]" onChange={(event) => updateAudioBus(id, { gain: Number(event.target.value) })}/><span>{bus.gain.toFixed(2)}</span></label></div>; })}</div>
               <div className="mt-3 border-t border-zinc-800 pt-3" aria-label="Shared audio routing templates">
                 <div className="flex flex-wrap gap-2"><input aria-label="Audio template name" value={audioTemplateName} maxLength={80} placeholder="Team mix name" className="min-w-44 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-[#1d9bf0]" onChange={(event) => setAudioTemplateName(event.target.value)}/><Button size="sm" variant="outline" disabled={!audioTemplateName.trim() || busy === "audio-template"} onClick={() => void saveAudioRoutingTemplate()}>{busy === "audio-template" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"/> : <Save className="mr-1.5 h-3.5 w-3.5"/>}Save team mix</Button></div>
                 <div className="mt-2 flex flex-wrap gap-2">{audioTemplates.length ? audioTemplates.map((template) => <div key={template.id} className="flex items-center rounded-lg border border-zinc-800 bg-zinc-950"><button className="px-3 py-2 text-left text-[10px] font-bold hover:text-[#1d9bf0]" onClick={() => applyAudioRoutingTemplate(template)}>{template.name}</button>{template.access.canDelete && <button aria-label={`Delete ${template.name} audio template`} className="border-l border-zinc-800 p-2 text-zinc-500 hover:text-red-400" onClick={() => void deleteAudioRoutingTemplate(template)}><Trash2 className="h-3 w-3"/></button>}</div>) : <p className="text-[10px] text-zinc-600">Save this routing, ducking, cleanup, and mastering setup once, then reuse it across projects.</p>}</div>
               </div>
             </div>}
             <div className="space-y-1 rounded-xl bg-zinc-900 p-2" onClick={(event) => { const box = event.currentTarget.getBoundingClientRect(); seek(((event.clientX - box.left) / box.width) * timelineDuration); }}>
               {timelineTracks.map((track) => { const settings = edl.tracks?.find((item) => item.track === track) ?? { track, locked: false, hidden: false, muted: false, solo: false, gain: 1 }; return <div key={track} className={`relative h-14 overflow-hidden rounded-lg bg-black ${settings.locked ? "ring-1 ring-amber-700" : ""}`}>
                 <div className="absolute left-1 top-1 z-10 flex items-center gap-0.5 rounded bg-zinc-900/95 px-1 py-0.5" onClick={(event) => event.stopPropagation()}><span className="mr-1 text-[9px] font-bold text-zinc-400">{track.toUpperCase()}</span><button aria-label={`${settings.locked ? "Unlock" : "Lock"} ${track.toUpperCase()} track`} onClick={() => updateTrackSettings(track, { locked: !settings.locked })}>{settings.locked ? <Lock className="h-3 w-3 text-amber-400"/> : <Unlock className="h-3 w-3 text-zinc-500"/>}</button>{track.startsWith("v") && track !== "v1" && <button aria-label={`${settings.hidden ? "Show" : "Hide"} ${track.toUpperCase()} track`} onClick={() => updateTrackSettings(track, { hidden: !settings.hidden })}>{settings.hidden ? <EyeOff className="h-3 w-3 text-zinc-500"/> : <Eye className="h-3 w-3 text-zinc-300"/>}</button>}{(track === "v1" || track.startsWith("a")) && <button aria-label={`${settings.muted ? "Unmute" : "Mute"} ${track.toUpperCase()} track`} onClick={() => updateTrackSettings(track, { muted: !settings.muted })}>{settings.muted ? <VolumeX className="h-3 w-3 text-red-400"/> : <Volume2 className="h-3 w-3 text-zinc-300"/>}</button>}{track.startsWith("a") && <button className={`h-4 min-w-4 rounded px-0.5 text-[8px] font-black ${settings.solo ? "bg-amber-400 text-black" : "text-zinc-500"}`} aria-label={`${settings.solo ? "Unsolo" : "Solo"} ${track.toUpperCase()} track`} onClick={() => updateTrackSettings(track, { solo: !settings.solo })}>S</button>}{track.startsWith("a") && <select aria-label={`${track.toUpperCase()} audio bus`} value={settings.bus ?? ""} className="h-4 max-w-16 rounded bg-black px-0.5 text-[8px] text-zinc-400" onChange={(event) => updateTrackSettings(track, { bus: (event.target.value || undefined) as "dialogue" | "music" | "effects" | undefined })}><option value="">No bus</option><option value="dialogue">Dialogue</option><option value="music">Music</option><option value="effects">Effects</option></select>}{(track === "v1" || track.startsWith("a")) && <label className="ml-1 flex items-center gap-1 text-[8px] text-zinc-500">Gain<input aria-label={`${track.toUpperCase()} track gain`} className="h-1 w-12 accent-[#1d9bf0]" type="range" min={0} max={2} step={.05} value={settings.gain} onChange={(event) => updateTrackSettings(track, { gain: Number(event.target.value) })}/></label>}</div>
                 {(edl.markers ?? []).map((marker) => <span key={`${track}-${marker.id}`} className="pointer-events-none absolute inset-y-0 z-10 w-px opacity-80" style={{ left: `${(marker.position / timelineDuration) * 100}%`, backgroundColor: marker.color }} title={marker.label}/>)}
                 {edl.clips.map((item, index) => (item.track ?? "v1") === track ? <button
                   key={item.id ?? `${item.start}-${item.end}`}
                   className={`absolute bottom-1 top-1 overflow-hidden rounded-md border px-2 text-xs font-bold ${edl.version === 3 && !settings.locked ? "touch-none select-none cursor-grab active:cursor-grabbing" : "cursor-default"} ${settings.hidden ? "opacity-25" : ""} ${item.id && selectedClipIds.includes(item.id) ? "border-white bg-[#1d9bf0] text-black" : track.startsWith("a") ? "border-emerald-700 bg-emerald-950 text-emerald-300" : "border-zinc-600 bg-zinc-700"} ${item.id && edl.compounds?.some((compound) => compound.clipIds.includes(item.id!)) ? "ring-1 ring-fuchsia-400" : ""}`}
                   style={{ left: `${(((edl.version === 3 ? item.timelineStart : item.start) ?? 0) / timelineDuration) * 100}%`, width: `${Math.max(0.7, (((item.end - item.start) / (item.speed ?? 1)) / timelineDuration) * 100)}%` }}
                   onPointerDown={(event) => startClipDrag(event, item)}
                   onPointerMove={moveClipDrag}
                   onPointerUp={finishClipDrag}
                   onPointerCancel={finishClipDrag}
                   onKeyDown={(event) => keyboardClipMove(event, item)}
                   onClick={(event) => selectTimelineClip(event, item, index)}
                   aria-label={`${track.toUpperCase()} clip ${index + 1}`}
                 >
                   {edl.version === 3 && item.id && <>
                     <span role="slider" tabIndex={0} aria-label={`Trim start ${track.toUpperCase()} clip ${index + 1}`} aria-valuemin={0} aria-valuemax={timelineDuration} aria-valuenow={item.timelineStart ?? 0} className="absolute inset-y-0 left-0 z-[3] w-2 cursor-ew-resize touch-none bg-white/40 opacity-60 hover:opacity-100 focus:opacity-100" onPointerDown={(event) => startClipTrim(event, item, "start")} onPointerMove={moveClipTrim} onPointerUp={finishClipTrim} onPointerCancel={finishClipTrim} onKeyDown={(event) => keyboardClipTrim(event, item, "start")} onClick={(event) => event.stopPropagation()}/>
                     <span role="slider" tabIndex={0} aria-label={`Trim end ${track.toUpperCase()} clip ${index + 1}`} aria-valuemin={0} aria-valuemax={timelineDuration} aria-valuenow={(item.timelineStart ?? 0) + (item.end - item.start) / (item.speed ?? 1)} className="absolute inset-y-0 right-0 z-[3] w-2 cursor-ew-resize touch-none bg-white/40 opacity-60 hover:opacity-100 focus:opacity-100" onPointerDown={(event) => startClipTrim(event, item, "end")} onPointerMove={moveClipTrim} onPointerUp={finishClipTrim} onPointerCancel={finishClipTrim} onKeyDown={(event) => keyboardClipTrim(event, item, "end")} onClick={(event) => event.stopPropagation()}/>
                   </>}
                   {clipWaveformUrl(item) && <img data-testid={`waveform-${item.id ?? index}`} src={clipWaveformUrl(item)} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-fill opacity-45"/>}
                   <span className="pointer-events-none relative z-[1]">{item.groupId && <Link2 className="mr-1 inline h-3 w-3"/>}{item.id && edl.compounds?.find((compound) => compound.clipIds.includes(item.id!))?.label && <span className="mr-1 rounded bg-fuchsia-950/80 px-1 text-[9px] text-fuchsia-200">{edl.compounds.find((compound) => compound.clipIds.includes(item.id!))!.label}</span>}{item.label ?? index + 1}{(item.speed ?? 1) !== 1 ? ` · ${item.speed}x` : ""}</span>
                 </button> : null)}
                 <span className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-red-500" style={{ left: `${(playhead / timelineDuration) * 100}%` }}/>
               </div>; })}
             </div>
             {(edl.markers?.length ?? 0) > 0 && <div className="mt-2 flex flex-wrap gap-2">{edl.markers!.map((marker) => <div key={marker.id} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-black px-2 py-1 text-[10px] text-zinc-300"><button aria-label={`Seek to ${marker.label}`} onClick={() => seek(marker.position)}><span className="block h-2 w-2 rounded-full" style={{ backgroundColor: marker.color }}/></button><input aria-label={`Rename marker at ${formatTime(marker.position)}`} value={marker.label} maxLength={80} className="w-24 bg-transparent outline-none focus:text-white" onChange={(event) => applyEdit({ ...edl, markers: edl.markers?.map((item) => item.id === marker.id ? { ...item, label: event.target.value || "Marker" } : item) })}/><button className="text-zinc-500 hover:text-white" onClick={() => seek(marker.position)}>{formatTime(marker.position)}</button><button aria-label={`Delete ${marker.label}`} onClick={() => applyEdit({ ...edl, markers: edl.markers?.filter((item) => item.id !== marker.id) })}><X className="h-3 w-3 text-zinc-600"/></button></div>)}</div>}
             {(edl.compounds?.length ?? 0) > 0 && <div className="mt-2 flex flex-wrap gap-2" aria-label="Compound clips">{edl.compounds!.map((compound) => <div key={compound.id} className="inline-flex items-center gap-2 rounded-full border border-fuchsia-900 bg-fuchsia-950/30 px-2 py-1 text-[10px] text-fuchsia-200"><span>{compound.clipIds.length} clips</span><input aria-label={`Rename ${compound.label}`} value={compound.label} maxLength={80} className="w-28 bg-transparent font-bold outline-none focus:text-white" onChange={(event) => applyEdit({ ...edl, compounds: edl.compounds?.map((item) => item.id === compound.id ? { ...item, label: event.target.value || "Compound clip" } : item) })}/><button aria-label={`Select ${compound.label}`} onClick={() => setSelectedClipIds(compound.clipIds)}>Select</button><button aria-label={`Break apart ${compound.label}`} onClick={() => applyEdit(breakApartCutCompound(edl, compound.clipIds))}><X className="h-3 w-3"/></button></div>)}</div>}
            {clip && <><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs text-zinc-400">In · {formatTime(clip.start)}<input className="mt-2 w-full accent-[#1d9bf0]" type="range" min={0} max={clip.end - .05} step="0.05" value={clip.start} onChange={(event) => applyEdit({ version: edl.version, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, start: Number(event.target.value) } : item) })}/></label><label className="text-xs text-zinc-400">Out · {formatTime(clip.end)}<input className="mt-2 w-full accent-[#1d9bf0]" type="range" min={clip.start + .05} max={selectedMedia?.duration ?? project.duration} step="0.05" value={clip.end} onChange={(event) => applyEdit({ version: edl.version, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, end: Number(event.target.value) } : item) })}/></label></div><div className="mt-4 grid gap-3 sm:grid-cols-6"><label className="text-xs text-zinc-400">Speed<select aria-label="Clip speed" className="mt-1 w-full rounded-lg border border-zinc-700 bg-black p-2 text-white" value={clip.speed ?? 1} onChange={(event) => applyEdit({ version: edl.version, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, speed: Number(event.target.value) } : item) })}>{[.25,.5,.75,1,1.25,1.5,2,4].map((value) => <option key={value} value={value}>{value}x</option>)}</select></label><label className="text-xs text-zinc-400">Transition<select aria-label="Clip transition" className="mt-1 w-full rounded-lg border border-zinc-700 bg-black p-2 text-white" value={clip.transition ?? "cut"} onChange={(event) => applyEdit({ version: edl.version, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, transition: event.target.value as "cut" | "fade_black" | "cross_dissolve" } : item) })}><option value="cut">Cut</option><option value="cross_dissolve">Cross dissolve</option><option value="fade_black">Fade black</option></select></label><label className="text-xs text-zinc-400">Color<select aria-label="Clip color" className="mt-1 w-full rounded-lg border border-zinc-700 bg-black p-2 text-white" value={clip.colorPreset ?? "original"} onChange={(event) => applyEdit({ version: edl.version, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, colorPreset: event.target.value as "original" | "cinematic" | "vivid" | "monochrome" } : item) })}><option value="original">Original</option><option value="cinematic">Cinematic</option><option value="vivid">Vivid</option><option value="monochrome">Monochrome</option></select></label>{[["Volume", "volume", 0, 2, .05], ["Fade in", "fadeIn", 0, 10, .1], ["Fade out", "fadeOut", 0, 10, .1]].map(([label, key, min, max, step]) => <label key={String(key)} className="text-xs text-zinc-400">{label} · {Number(clip[key as "volume" | "fadeIn" | "fadeOut"] ?? (key === "volume" ? 1 : 0)).toFixed(1)}<input aria-label={String(label)} className="mt-2 w-full accent-[#1d9bf0]" type="range" min={Number(min)} max={Number(max)} step={Number(step)} value={clip[key as "volume" | "fadeIn" | "fadeOut"] ?? (key === "volume" ? 1 : 0)} onChange={(event) => applyEdit({ version: edl.version, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, [String(key)]: Number(event.target.value) } : item) })}/></label>)}</div>{edl.version === 3 && clip.track !== "v1" && <div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-xs text-zinc-400">Timeline start<input aria-label="Clip timeline start" className="mt-1 w-full rounded-lg border border-zinc-700 bg-black p-2" type="number" min={0} max={7200} step="0.1" value={clip.timelineStart ?? 0} onChange={(event) => applyEdit({ version: 3, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, timelineStart: Number(event.target.value) } : item) })}/></label>{clip.track?.startsWith("a") && <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-400">Duck under voice<Switch aria-label="Duck under voice" checked={clip.duckUnderVoice ?? false} onCheckedChange={(checked) => applyEdit({ version: 3, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, duckUnderVoice: checked } : item) })}/></label>}{clip.track?.startsWith("v") && <><label className="text-xs text-zinc-400">Layout<select aria-label="Clip layout" className="mt-1 w-full rounded-lg border border-zinc-700 bg-black p-2" value={(clip.transform?.width ?? 1) < .8 ? "pip" : "full"} onChange={(event) => { const pip = event.target.value === "pip"; applyEdit({ version: 3, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, transform: pip ? { x: .68, y: .62, width: .28, height: .32, opacity: 1 } : { x: 0, y: 0, width: 1, height: 1, opacity: 1 } } : item) }); }}><option value="full">Full frame</option><option value="pip">Picture in picture</option></select></label><label className="text-xs text-zinc-400">Opacity<input aria-label="Clip opacity" className="mt-2 w-full accent-[#1d9bf0]" type="range" min={0} max={1} step={.05} value={clip.transform?.opacity ?? 1} onChange={(event) => applyEdit({ version: 3, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, transform: { ...(item.transform ?? { x: 0, y: 0, width: 1, height: 1, opacity: 1 }), opacity: Number(event.target.value) } } : item) })}/></label></>}</div>}</>}
            {edl.version === 3 && clip && ((clip.track ?? "v1") === "v1" || (clip.track ?? "").startsWith("a")) && <div className="mt-4 rounded-xl border border-zinc-800 bg-black p-3" aria-label="Clip volume automation"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold">Volume automation</p><p className="mt-1 text-[10px] text-zinc-500">Adjust Volume, move the playhead, and capture a render-effective mix keyframe.</p></div><div className="flex gap-2"><select aria-label="Volume automation preset" defaultValue="" className="h-8 rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-[10px] font-bold" onChange={(event) => { if (event.target.value) applyVolumeAutomationPreset(event.target.value as "fade_up" | "fade_down" | "duck_middle"); event.target.value = ""; }}><option value="" disabled>Mix preset</option><option value="fade_up">Fade up</option><option value="fade_down">Fade down</option><option value="duck_middle">Conversation dip</option></select><Button size="sm" variant="outline" disabled={(clip.volumeKeyframes?.length ?? 0) >= 50} onClick={addVolumeKeyframe}><Plus className="mr-1 h-3 w-3"/>Add keyframe</Button></div></div>{(clip.volumeKeyframes?.length ?? 0) > 0 && <div className="mt-3 flex flex-wrap gap-2">{clip.volumeKeyframes!.map((keyframe) => <div key={keyframe.at} className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-2 py-1 text-[10px] text-zinc-300"><button className="font-bold text-[#1d9bf0]" onClick={() => seek((clip.timelineStart ?? 0) + keyframe.at)}>{formatTime(keyframe.at)}</button><label className="flex items-center gap-1">Gain<input aria-label={`Volume at ${formatTime(keyframe.at)}`} type="number" min={0} max={2} step={.05} value={keyframe.volume} className="w-14 rounded bg-black px-1 py-0.5" onChange={(event) => applyEdit({ ...edl, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, volumeKeyframes: item.volumeKeyframes?.map((frame) => frame.at === keyframe.at ? { ...frame, volume: Math.max(0, Math.min(2, Number(event.target.value))) } : frame) } : item) })}/></label><select aria-label={`Volume easing at ${formatTime(keyframe.at)}`} value={keyframe.easing ?? "linear"} className="rounded bg-black px-1 py-0.5" onChange={(event) => applyEdit({ ...edl, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, volumeKeyframes: item.volumeKeyframes?.map((frame) => frame.at === keyframe.at ? { ...frame, easing: event.target.value as "linear" | "ease_in_out" } : frame) } : item) })}><option value="linear">Linear</option><option value="ease_in_out">Ease</option></select><button aria-label={`Delete volume keyframe at ${formatTime(keyframe.at)}`} onClick={() => applyEdit({ ...edl, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, volumeKeyframes: item.volumeKeyframes?.filter((frame) => frame.at !== keyframe.at) } : item) })}><X className="h-3 w-3 text-zinc-600"/></button></div>)}</div>}</div>}
            {edl.version === 3 && clip && clip.track !== "v1" && (clip.track ?? "").startsWith("v") && <div className="mt-4 rounded-xl border border-zinc-800 bg-black p-3" aria-label="Clip motion keyframes">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold">Transform animation</p><p className="mt-1 text-[10px] text-zinc-500">Position, scale, and fade overlays with render-effective keyframes.</p></div><div className="flex gap-2"><select aria-label="Motion preset" defaultValue="" className="h-8 rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-[10px] font-bold" onChange={(event) => { if (event.target.value) applyMotionPreset(event.target.value as "slide_right" | "slide_left" | "rise" | "zoom_in" | "zoom_out" | "fade_in" | "fade_out"); event.target.value = ""; }}><option value="" disabled>Motion preset</option><option value="slide_right">Slide right</option><option value="slide_left">Slide left</option><option value="rise">Rise</option><option value="zoom_in">Zoom in</option><option value="zoom_out">Zoom out</option><option value="fade_in">Fade in</option><option value="fade_out">Fade out</option></select><Button size="sm" variant="outline" disabled={(clip.motionKeyframes?.length ?? 0) >= 50} onClick={addMotionKeyframe}><Plus className="mr-1 h-3 w-3"/>Add keyframe</Button></div></div>
              <div className="mt-3 grid gap-3 sm:grid-cols-4">{(["x", "y", "opacity"] as const).map((property) => { const transform = clip.transform ?? { x: 0, y: 0, width: 1, height: 1, opacity: 1 }; const maximum = property === "x" ? 1 - transform.width * motionScale : property === "y" ? 1 - transform.height * motionScale : 1; const label = property === "x" || property === "y" ? `Position ${property.toUpperCase()}` : "Opacity"; const accessibleLabel = property === "opacity" ? "Clip opacity" : `Clip position ${property.toUpperCase()}`; return <label key={property} className="text-[11px] text-zinc-400">{label} · {Math.round(transform[property] * 100)}%<input aria-label={accessibleLabel} className="mt-2 w-full accent-[#1d9bf0]" type="range" min={0} max={Math.max(0, maximum)} step={.01} value={Math.min(transform[property], Math.max(0, maximum))} onChange={(event) => setSelectedClipTransform(property, Number(event.target.value))}/></label>; })}<label className="text-[11px] text-zinc-400">Scale · {Math.round(motionScale * 100)}%<input aria-label="Clip scale" className="mt-2 w-full accent-[#1d9bf0]" type="range" min={.25} max={Math.min(4, 1 / Math.max(clip.transform?.width ?? 1, clip.transform?.height ?? 1))} step={.025} value={motionScale} onChange={(event) => setMotionScale(Number(event.target.value))}/></label></div>
              {(clip.motionKeyframes?.length ?? 0) > 0 && <div className="mt-3 flex flex-wrap gap-2">{clip.motionKeyframes!.map((keyframe) => <div key={keyframe.at} className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-2 py-1 text-[10px] text-zinc-300"><button className="font-bold text-[#1d9bf0]" onClick={() => { setMotionScale(keyframe.scale ?? 1); seek((clip.timelineStart ?? 0) + keyframe.at); }}>{formatTime(keyframe.at)}</button><span>X {Math.round(keyframe.x * 100)} · Y {Math.round(keyframe.y * 100)} · Scale {Math.round((keyframe.scale ?? 1) * 100)} · O {Math.round((keyframe.opacity ?? clip.transform?.opacity ?? 1) * 100)}</span><select aria-label={`Motion easing at ${formatTime(keyframe.at)}`} value={keyframe.easing ?? "linear"} className="rounded bg-black px-1 py-0.5" onChange={(event) => applyEdit({ ...edl, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, motionKeyframes: item.motionKeyframes?.map((frame) => frame.at === keyframe.at ? { ...frame, easing: event.target.value as "linear" | "ease_in_out" } : frame) } : item) })}><option value="linear">Linear</option><option value="ease_in_out">Ease</option></select><button aria-label={`Delete motion keyframe at ${formatTime(keyframe.at)}`} onClick={() => applyEdit({ ...edl, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, motionKeyframes: item.motionKeyframes?.filter((frame) => frame.at !== keyframe.at) } : item) })}><X className="h-3 w-3 text-zinc-600"/></button></div>)}</div>}
            </div>}
            {clip && (clip.track ?? "v1").startsWith("v") && <div className="mt-4 rounded-xl border border-zinc-800 bg-black p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-bold">Color correction</p><label className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-zinc-700 px-2 text-[10px] font-bold hover:bg-zinc-900"><input aria-label="Import .cube LUT" className="sr-only" type="file" accept=".cube,text/plain" disabled={busy === "lut"} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void uploadProjectLut(file); }}/>{busy === "lut" ? <Loader2 className="mr-1 h-3 w-3 animate-spin"/> : <Upload className="mr-1 h-3 w-3"/>}Import LUT</label></div><label className="mt-3 block text-[10px] text-zinc-500">Creative LUT<select aria-label="Clip LUT" value={clip.lutAssetId ?? ""} onChange={(event) => applyEdit({ ...edl, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, lutAssetId: event.target.value || undefined } : item) })} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-xs text-white"><option value="">None</option>{lutLibrary.map((lut) => <option key={lut.id} value={lut.id}>{lut.name}{lut.metadata?.cubeLut?.size ? ` · ${lut.metadata.cubeLut.size}³` : ""}</option>)}</select></label>{clip.lutAssetId && <p className="mt-2 text-[10px] leading-4 text-emerald-300">Private 3D LUT is applied by the render engine. Render a preview to judge the calibrated result.</p>}<div className="mt-3 grid gap-3 sm:grid-cols-4">{[["Exposure", "brightness", -1, 1, .05], ["Contrast", "contrast", .5, 2, .05], ["Saturation", "saturation", 0, 3, .05], ["Temperature", "temperature", -1, 1, .05]].map(([label, key, min, max, step]) => { const defaults = { brightness: 0, contrast: 1, saturation: 1, temperature: 0 }; const value = clip.colorAdjust?.[key as keyof typeof defaults] ?? defaults[key as keyof typeof defaults]; return <label key={String(key)} className="text-[11px] text-zinc-400">{label} · {value.toFixed(2)}<input aria-label={String(label)} className="mt-2 w-full accent-[#1d9bf0]" type="range" min={Number(min)} max={Number(max)} step={Number(step)} value={value} onChange={(event) => applyEdit({ version: edl.version, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, colorAdjust: { brightness: item.colorAdjust?.brightness ?? 0, contrast: item.colorAdjust?.contrast ?? 1, saturation: item.colorAdjust?.saturation ?? 1, temperature: item.colorAdjust?.temperature ?? 0, [String(key)]: Number(event.target.value) } } : item) })}/></label>; })}</div>{edl.version === 3 && clip.track !== "v1" && <div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-400">Chroma key<Switch aria-label="Chroma key" checked={clip.chromaKey?.enabled ?? false} onCheckedChange={(enabled) => applyEdit({ version: 3, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, chromaKey: { enabled, color: item.chromaKey?.color ?? "#00ff00", similarity: item.chromaKey?.similarity ?? .12, blend: item.chromaKey?.blend ?? .05 } } : item) })}/></label>{clip.chromaKey?.enabled && <><label className="text-[11px] text-zinc-400">Key color<input aria-label="Chroma key color" type="color" className="mt-1 h-9 w-full rounded bg-black" value={clip.chromaKey.color} onChange={(event) => applyEdit({ version: 3, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, chromaKey: { ...item.chromaKey!, color: event.target.value } } : item) })}/></label><label className="text-[11px] text-zinc-400">Tolerance · {clip.chromaKey.similarity.toFixed(2)}<input aria-label="Chroma key tolerance" className="mt-2 w-full accent-[#1d9bf0]" type="range" min={.01} max={1} step={.01} value={clip.chromaKey.similarity} onChange={(event) => applyEdit({ version: 3, clips: edl.clips.map((item, index) => index === selectedClip ? { ...item, chromaKey: { ...item.chromaKey!, similarity: Number(event.target.value) } } : item) })}/></label></>}</div>}</div>}
            {edl.version === 3 && clip && <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-black p-3"><span className="mr-1 text-xs font-bold text-zinc-400">Slip source</span><Button size="sm" variant="outline" onClick={() => slipSelectedClip(-.1)} aria-label="Slip source back 0.1 seconds">−0.1s</Button><Button size="sm" variant="outline" onClick={() => slipSelectedClip(.1)} aria-label="Slip source forward 0.1 seconds">+0.1s</Button><Button size="sm" variant="outline" onClick={() => slipSelectedClip(-1)} aria-label="Slip source back 1 second">−1s</Button><Button size="sm" variant="outline" onClick={() => slipSelectedClip(1)} aria-label="Slip source forward 1 second">+1s</Button><span className="text-[11px] text-zinc-500">Changes the source moment without moving or resizing the clip.</span></div>}
            <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="destructive" disabled={edl.clips.length === 1 || Boolean(edl.tracks?.find((track) => track.track === (clip?.track ?? "v1"))?.locked)} onClick={() => { applyEdit({ version: edl.version, clips: edl.clips.filter((_, index) => index !== selectedClip) }); setSelectedClip(0); }}><Trash2 className="mr-2 h-4 w-4"/>Delete clip</Button><Button size="sm" variant="outline" disabled={edl.version === 3 || selectedClip === 0} onClick={() => { const clips = [...edl.clips]; [clips[selectedClip - 1], clips[selectedClip]] = [clips[selectedClip], clips[selectedClip - 1]]; applyEdit({ version: edl.version, clips }); setSelectedClip(selectedClip - 1); }}>Move earlier</Button><Button size="sm" variant="outline" disabled={edl.version === 3 || selectedClip >= edl.clips.length - 1} onClick={() => { const clips = [...edl.clips]; [clips[selectedClip + 1], clips[selectedClip]] = [clips[selectedClip], clips[selectedClip + 1]]; applyEdit({ version: edl.version, clips }); setSelectedClip(selectedClip + 1); }}>Move later</Button><Button size="sm" variant="outline" onClick={() => seek(edl.version === 3 ? (clip?.timelineStart ?? 0) : (clip?.start ?? 0))}><Play className="mr-2 h-4 w-4"/>Preview</Button></div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold">Text-based edit</h2><p className="text-xs text-zinc-500">Search, correct, cut, restore, and export timed captions.</p></div><div className="flex gap-2">{project.transcript && <a className="inline-flex h-9 items-center rounded-lg border border-zinc-700 px-3 text-xs font-bold" href={`/api/cut/projects/${project.id}/captions.srt`}><FileText className="mr-1.5 h-3.5 w-3.5"/>SRT</a>}<Button size="sm" onClick={() => void transcribe()} disabled={busy === "transcribe" || transcriptJob?.state === "queued" || transcriptJob?.state === "running"}>{busy === "transcribe" || transcriptJob?.state === "queued" || transcriptJob?.state === "running" ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Captions className="mr-2 h-4 w-4"/>}{project.transcript ? "Re-transcribe" : "Transcribe"}</Button></div></div>
             {transcriptJob && <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-xs ${transcriptJob.state === "error" ? "bg-red-950 text-red-300" : "bg-zinc-900 text-zinc-400"}`}>{transcriptJob.detail}</p>}
             {transcriptDraft && <div className="relative mt-4"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-600"/><input aria-label="Search transcript" value={transcriptSearch} onChange={(event) => setTranscriptSearch(event.target.value)} placeholder="Search transcript" className="h-9 w-full rounded-lg border border-zinc-800 bg-black pl-9 pr-3 text-sm outline-none focus:border-[#1d9bf0]"/></div>}
             <div className="mt-4 max-h-64 overflow-y-auto leading-8">{words.length ? words.map((word, index) => { const retained = edl.clips.some((item) => word.start >= item.start && word.end <= item.end); return <button key={`${word.start}-${index}`} className={`mr-1 rounded px-1 text-sm ${retained ? "hover:bg-zinc-800" : "text-zinc-600 line-through"}`} onClick={() => applyEdit(retained ? removeCutRange(edl, Math.max(0, word.start - .03), Math.min(project.duration, word.end + .03), project.duration) : restoreCutRange(edl, word.start, word.end, project.duration))}>{word.word}</button>; }) : <p className="py-8 text-center text-sm text-zinc-500">Create a transcript to edit by text, detect filler words, and generate captions.</p>}</div>
             {transcriptDraft && <div className="mt-4 rounded-xl border border-zinc-800 bg-black p-3">
               <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold">Transcript story order</p><p className="mt-1 text-[11px] text-zinc-600">{transcriptMatches.length} of {transcriptDraft.segments.length} timed segments · label speakers, reorder scenes, then apply the story</p></div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={savingTranscript || JSON.stringify(transcriptDraft) === JSON.stringify(project.transcript)} onClick={() => void saveTranscript()}>{savingTranscript ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"/> : <Save className="mr-1.5 h-3.5 w-3.5"/>}Save transcript</Button><Button size="sm" disabled={busy === "story" || !transcriptDraft.segments.length} onClick={() => void applyStoryOrder()}>{busy === "story" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"/> : <Scissors className="mr-1.5 h-3.5 w-3.5"/>}Apply story order</Button></div></div>
               <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">{transcriptMatches.map((segment) => { const index = transcriptDraft.segments.findIndex((item) => item.id === segment.id); return <div key={segment.id} className="rounded-lg bg-zinc-950 p-2"><div className="flex flex-wrap items-center gap-2"><button type="button" className="text-[10px] font-bold text-[#1d9bf0]" onClick={() => seek(segment.start)}>{formatTime(segment.start)}–{formatTime(segment.end)}</button><input aria-label={`Speaker for segment ${segment.id}`} value={segment.speaker ?? ""} maxLength={80} placeholder="Speaker" className="h-8 min-w-28 flex-1 rounded-md border border-zinc-800 bg-black px-2 text-xs outline-none focus:border-[#1d9bf0]" onChange={(event) => setTranscriptDraft((current) => current ? { ...current, segments: current.segments.map((item) => item.id === segment.id ? { ...item, speaker: event.target.value } : item) } : current)}/><Button size="icon" variant="ghost" className="h-8 w-8" disabled={index <= 0} aria-label={`Move segment ${segment.id} earlier`} onClick={() => moveTranscriptSegment(segment.id, -1)}><ArrowUp className="h-3.5 w-3.5"/></Button><Button size="icon" variant="ghost" className="h-8 w-8" disabled={index >= transcriptDraft.segments.length - 1} aria-label={`Move segment ${segment.id} later`} onClick={() => moveTranscriptSegment(segment.id, 1)}><ArrowDown className="h-3.5 w-3.5"/></Button></div><textarea aria-label={`Transcript segment ${segment.id}`} value={segment.text} onChange={(event) => setTranscriptDraft((current) => current ? { ...current, segments: current.segments.map((item) => item.id === segment.id ? { ...item, text: event.target.value } : item) } : current)} className="mt-2 min-h-16 w-full resize-y rounded-md border border-zinc-800 bg-black p-2 text-sm leading-5 outline-none focus:border-[#1d9bf0]"/></div>; })}</div>
             </div>}
             {project.transcript && <div className="mt-3 rounded-xl bg-zinc-900 p-3"><div className="flex items-center justify-between"><p className="text-xs font-bold">Smart cleanup</p><Button size="sm" variant="outline" disabled={busy === "detect"} onClick={() => void detectCleanup()}>{busy === "detect" ? <Loader2 className="mr-1 h-3 w-3 animate-spin"/> : <WandSparkles className="mr-1 h-3 w-3"/>}Analyze</Button></div>{candidates && <div className="mt-3 grid gap-2 sm:grid-cols-2"><Button size="sm" variant="outline" disabled={!candidates.fillerWords.length} onClick={() => applyCandidates(candidates.fillerWords)}>Remove {candidates.fillerWords.length} filler words</Button><Button size="sm" variant="outline" disabled={!candidates.silenceGaps.length} onClick={() => applyCandidates(candidates.silenceGaps)}>Tighten {candidates.silenceGaps.length} pauses</Button></div>}</div>}
          </div>
        </section>
        <aside className="space-y-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-center justify-between gap-2"><div><h2 className="font-bold">Project media</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Open private media in the source monitor, mark a range, then insert it at the playhead.</p></div><label className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-zinc-700 px-3 text-xs font-bold hover:bg-zinc-900"><input className="sr-only" type="file" accept="video/*,audio/*" disabled={busy === "media"} onChange={(event) => event.target.files?.[0] && void uploadProjectMedia(event.target.files[0])}/>{busy === "media" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"/> : <Plus className="mr-1.5 h-3.5 w-3.5"/>}Media</label></div><div className="mt-3 space-y-2">{mediaLibrary.map((media) => <div key={media.id} className={`flex items-center gap-2 rounded-xl p-2 ${sourceMedia?.id === media.id ? "border border-[#1d9bf0] bg-sky-950/30" : "bg-zinc-900"}`}><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-black text-[10px] font-bold text-zinc-500">{media.mediaKind === "audio" ? "A" : "V"}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{media.name}</span><span className="text-[10px] text-zinc-600">{formatTime(media.duration)} · {media.assetId === project.sourceAssetId ? "primary" : media.mediaKind}</span></span><Button aria-label={`Open ${media.name} in source monitor`} size="sm" variant="outline" disabled={busy === "source-media"} onClick={() => void openSourceMedia(media)}>Open</Button>{media.assetId !== project.sourceAssetId && <Button aria-label={`Add all of ${media.name}`} size="sm" variant="outline" onClick={() => addMediaClip(media)}>Add all</Button>}</div>)}</div>{project.mediaKind !== "video" && <p className="mt-3 rounded-lg bg-amber-950/40 px-3 py-2 text-[11px] leading-5 text-amber-300">Multitrack layers require a video project. Audio-only projects keep the fast single-track workflow.</p>}</div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-center justify-between gap-2"><div><h2 className="font-bold">Titles & graphics</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Native text overlays render into the final video.</p></div><Button size="sm" variant="outline" disabled={project.mediaKind !== "video"} onClick={addGraphic}><Plus className="mr-1.5 h-3.5 w-3.5"/>Title</Button></div><div className="mt-3 space-y-3">{(edl.graphics ?? []).map((graphic) => <div key={graphic.id} className="rounded-xl bg-zinc-900 p-3"><input aria-label="Graphic text" value={graphic.text} onChange={(event) => applyEdit({ ...edl, graphics: (edl.graphics ?? []).map((item) => item.id === graphic.id ? { ...item, text: event.target.value } : item) })} className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm font-bold outline-none focus:border-[#1d9bf0]"/><div className="mt-2 grid grid-cols-2 gap-2"><label className="text-[10px] text-zinc-500">Start<input aria-label="Graphic start" type="number" min={0} step={.1} value={graphic.timelineStart} onChange={(event) => applyEdit({ ...edl, graphics: (edl.graphics ?? []).map((item) => item.id === graphic.id ? { ...item, timelineStart: Number(event.target.value) } : item) })} className="mt-1 w-full rounded border border-zinc-700 bg-black p-2"/></label><label className="text-[10px] text-zinc-500">Duration<input aria-label="Graphic duration" type="number" min={.25} max={3600} step={.25} value={graphic.duration} onChange={(event) => applyEdit({ ...edl, graphics: (edl.graphics ?? []).map((item) => item.id === graphic.id ? { ...item, duration: Number(event.target.value) } : item) })} className="mt-1 w-full rounded border border-zinc-700 bg-black p-2"/></label><label className="text-[10px] text-zinc-500">Text color<input aria-label="Graphic text color" type="color" value={graphic.textColor} onChange={(event) => applyEdit({ ...edl, graphics: (edl.graphics ?? []).map((item) => item.id === graphic.id ? { ...item, textColor: event.target.value } : item) })} className="mt-1 h-9 w-full rounded bg-black"/></label><label className="text-[10px] text-zinc-500">Background<input aria-label="Graphic background color" type="color" value={graphic.backgroundColor} onChange={(event) => applyEdit({ ...edl, graphics: (edl.graphics ?? []).map((item) => item.id === graphic.id ? { ...item, backgroundColor: event.target.value } : item) })} className="mt-1 h-9 w-full rounded bg-black"/></label></div><Button className="mt-2" size="sm" variant="ghost" onClick={() => applyEdit({ ...edl, graphics: (edl.graphics ?? []).filter((item) => item.id !== graphic.id) })}><Trash2 className="mr-1 h-3 w-3"/>Remove</Button></div>)}</div></div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><h2 className="flex items-center gap-2 font-bold"><WandSparkles className="h-4 w-4 text-[#1d9bf0]"/>AI edit assistant</h2><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-3 min-h-24 w-full resize-none rounded-xl border border-zinc-700 bg-black p-3 text-sm outline-none focus:border-[#1d9bf0]" placeholder="Remove the first 3 seconds, cut 14 to 18 seconds, or remove filler words…"/><Button className="mt-2 w-full" disabled={!prompt.trim()} onClick={async () => { setBusy("ai"); setProposal(null); try { setProposal(await (await apiRequest("POST", `/api/cut/projects/${project.id}/ai-edit`, { prompt })).json()); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not propose that edit"); } finally { setBusy(""); } }}>{busy === "ai" ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Sparkles className="mr-2 h-4 w-4"/>}Propose edit</Button>{proposal && <div className="mt-3 rounded-xl border border-[#1d9bf0]/40 bg-[#1d9bf0]/10 p-3"><p className="text-sm font-bold">{proposal.summary}</p><div className="mt-2 flex gap-2"><Button size="sm" onClick={() => { applyEdit(proposal.edl); setProposal(null); }}><Check className="mr-1 h-4 w-4"/>Apply</Button><Button size="sm" variant="ghost" onClick={() => setProposal(null)}><X className="mr-1 h-4 w-4"/>Discard</Button></div></div>}</div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><h2 className="font-bold">Highlights</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Score transcript moments and render platform-ready clips.</p><Button className="mt-3 w-full" variant="outline" disabled={!project.transcript || highlightJob?.state === "queued" || highlightJob?.state === "running"} onClick={() => void requestHighlights()}>{highlightJob?.state === "queued" || highlightJob?.state === "running" ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Sparkles className="mr-2 h-4 w-4"/>}Find highlights</Button>{highlightJob?.state === "error" && <p role="status" className="mt-3 rounded-lg bg-red-950 px-3 py-2 text-xs text-red-300">{highlightJob.detail}</p>}<div className="mt-3 space-y-2">{highlights.map((item) => <div key={item.id} className="rounded-xl bg-zinc-900 p-3"><div className="flex gap-2"><span className="rounded bg-[#1d9bf0] px-1.5 py-0.5 text-xs font-bold text-black">{item.score}</span><p className="line-clamp-2 flex-1 text-xs">{item.title}</p></div><div className="mt-2 flex items-center justify-between text-xs text-zinc-500"><span>{formatTime(item.start)}–{formatTime(item.end)}</span><button className="font-bold text-[#1d9bf0]" onClick={() => void render({ start: item.start, end: item.end })}>Render clip</button></div></div>)}</div></div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><h2 className="font-bold">Render</h2><div className="mt-3 grid grid-cols-2 gap-2"><label className="text-xs font-bold text-zinc-400">Aspect ratio<select value={aspect} onChange={(event) => setAspect(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black p-3 text-sm text-white"><option value="source">Source</option><option value="9:16">Vertical · 9:16</option><option value="1:1">Square · 1:1</option><option value="16:9">Landscape · 16:9</option></select></label><label className="text-xs font-bold text-zinc-400">Resolution<select aria-label="Render resolution" value={resolution} onChange={(event) => setResolution(event.target.value as typeof resolution)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black p-3 text-sm text-white"><option value="720p">720p</option><option value="1080p">1080p</option><option value="2160p">4K</option></select></label><label className="text-xs font-bold text-zinc-400">Quality<select aria-label="Render quality" value={quality} onChange={(event) => setQuality(event.target.value as typeof quality)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black p-3 text-sm text-white"><option value="draft">Draft</option><option value="social">Social</option><option value="master">Master</option></select></label><label className="text-xs font-bold text-zinc-400">Frame rate<select aria-label="Render frame rate" value={fps} onChange={(event) => setFps(Number(event.target.value) as typeof fps)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black p-3 text-sm text-white"><option value={24}>24 fps</option><option value={30}>30 fps</option><option value={60}>60 fps</option></select></label></div><div className="mt-4 flex items-center justify-between text-sm"><span>Burn captions</span><Switch aria-label="Burn captions" checked={captions} onCheckedChange={setCaptions}/></div>{captions && <label className="mt-3 block text-xs text-zinc-400">Caption style<select value={captionStyle} onChange={(event) => setCaptionStyle(Number(event.target.value) as typeof captionStyle)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black p-3 text-sm text-white"><option value={1}>Bold white</option><option value={2}>Creator yellow</option><option value={3}>Readable card</option><option value={4}>Kinetic word pop</option></select></label>}<div className="mt-4 flex items-center justify-between text-sm"><span>Noise cleanup</span><Switch aria-label="Clean audio" checked={cleanAudio} onCheckedChange={setCleanAudio}/></div><div className="mt-3 grid grid-cols-2 gap-2"><label className="text-xs font-bold text-zinc-400">Audio finish<select aria-label="Audio finish" value={audioPreset} onChange={(event) => setAudioPreset(event.target.value as typeof audioPreset)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black p-3 text-sm text-white"><option value="original">Original</option><option value="voice">Voice · -16 LUFS</option><option value="broadcast">Broadcast · -14 LUFS</option><option value="music">Music · -14 LUFS</option></select></label><label className="text-xs font-bold text-zinc-400">Master gain · {masterGainDb > 0 ? "+" : ""}{masterGainDb} dB<input aria-label="Master gain" className="mt-3 w-full accent-[#1d9bf0]" type="range" min={-12} max={12} step={1} value={masterGainDb} onChange={(event) => setMasterGainDb(Number(event.target.value))}/></label></div><p className="mt-2 text-[11px] leading-5 text-zinc-500">Voice and broadcast presets apply EQ, compression, loudness normalization and true-peak limiting.</p><p className="mt-4 rounded-lg bg-black px-3 py-2 text-[11px] leading-5 text-zinc-500">Estimated processing time: about {renderEstimate < 60 ? `${renderEstimate} seconds` : `${Math.ceil(renderEstimate / 60)} minutes`}. Actual time depends on source codecs and worker load.</p><Button className="mt-3 w-full bg-[#1d9bf0] text-black hover:bg-[#1d9bf0]/90" onClick={() => void render()}><Film className="mr-2 h-4 w-4"/>Render full edit</Button></div>
          {renders.length > 0 && <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><h2 className="font-bold">Renders</h2><div className="mt-3 space-y-3">{renders.map((job) => <div key={job.id} className="rounded-xl bg-zinc-900 p-3"><div className="flex items-center justify-between text-sm"><span className="font-bold">{job.output?.filename ?? "CutStudio render"}</span><span className="text-xs text-zinc-500">{Math.round(job.progress * 100)}%</span></div><p className="mt-1 text-xs text-zinc-500">{job.detail}</p>{job.state === "running" || job.state === "queued" ? <div className="mt-2"><div className="h-1 overflow-hidden rounded bg-zinc-700"><div className="h-full bg-[#1d9bf0]" style={{ width: `${job.progress * 100}%` }}/></div><Button className="mt-3" size="sm" variant="outline" disabled={busy === `cancel:${job.id}`} onClick={() => void cancelRender(job)}>{busy === `cancel:${job.id}` ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"/> : <Square className="mr-1.5 h-3.5 w-3.5"/>}Cancel render</Button></div> : job.state === "done" ? <div className="mt-3 flex flex-wrap gap-2"><a className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-bold" href={`/api/cut/jobs/${job.id}/media`} onClick={async (event) => { event.preventDefault(); const secure = await (await apiRequest("GET", `/api/cut/jobs/${job.id}/media`)).json() as { url: string }; window.open(secure.url, "_blank", "noopener,noreferrer"); }}>Preview</a><Button size="sm" variant="outline" disabled={busy === `review:${job.id}`} onClick={() => void createReview(job)}>{busy === `review:${job.id}` ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"/> : <Share2 className="mr-1.5 h-3.5 w-3.5"/>}Review</Button><Button size="sm" disabled={busy === `distribution:${job.id}`} onClick={() => void sendRenderToDistribution(job)}>{busy === `distribution:${job.id}` ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"/> : <Send className="mr-1.5 h-3.5 w-3.5"/>}Continue in Distribution</Button></div> : job.state === "cancelled" ? <p className="mt-2 text-xs text-zinc-500">This render stopped before delivery and can be started again from the Render panel.</p> : <div className="mt-2 flex items-center justify-between gap-2"><p className="text-xs text-red-400">{job.detail}</p><Button size="sm" variant="outline" onClick={() => void retryJob(job)}><RefreshCw className="mr-1.5 h-3.5 w-3.5"/>Retry</Button></div>}</div>)}</div></div>}
          {workspace && <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4" aria-label="CutStudio workspace collaboration"><div className="flex items-center justify-between gap-2"><div><h2 className="font-bold">Workspace collaboration</h2><p className="mt-1 text-xs text-zinc-500">Invite signed-in teammates and use @username to notify them in private time-coded notes.</p></div><Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/cut-studio/workspace/${project.id}`)}><Copy className="mr-1.5 h-3.5 w-3.5"/>Workspace link</Button></div><div className="mt-3 flex gap-2"><input aria-label="Collaborator username" value={collaboratorUsername} onChange={(event) => setCollaboratorUsername(event.target.value.replace(/^@/, ""))} placeholder="username" className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-black px-3 py-2 text-xs outline-none focus:border-[#1d9bf0]"/><Button size="sm" disabled={!collaboratorUsername.trim() || busy === "collaborator"} onClick={() => void addCollaborator()}>{busy === "collaborator" ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Plus className="h-3.5 w-3.5"/>}</Button></div><div className="mt-3 flex flex-wrap gap-2">{workspace.participants.map((participant) => <span key={participant.id} className="inline-flex items-center gap-1 rounded-full bg-black px-2 py-1 text-[10px] text-zinc-400"><span className="font-bold text-zinc-200">@{participant.username}</span> · {participant.role}{participant.role !== "owner" && <button aria-label={`Remove ${participant.username} collaborator`} onClick={async () => { await apiRequest("DELETE", `/api/cut/projects/${project.id}/collaborators/${participant.id}`); await refreshWorkspace(); }}><X className="h-3 w-3 text-zinc-600"/></button>}</span>)}</div><textarea aria-label="Owner workspace note" value={workspaceNote} onChange={(event) => setWorkspaceNote(event.target.value)} placeholder={`Note at ${formatTime(playhead)} · mention @username`} className="mt-3 min-h-20 w-full rounded-xl border border-zinc-700 bg-black p-3 text-xs outline-none focus:border-[#1d9bf0]"/><Button className="mt-2" size="sm" variant="outline" disabled={!workspaceNote.trim() || busy === "workspace-note"} onClick={() => void addWorkspaceNote()}>{busy === "workspace-note" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"/> : <MessageSquare className="mr-1.5 h-3.5 w-3.5"/>}Add note</Button>{workspace.notes.length > 0 && <div className="mt-3 space-y-2">{workspace.notes.slice(-5).map((note) => <button key={note.id} className="w-full rounded-lg border border-zinc-800 bg-black p-2 text-left" onClick={() => seek(note.positionMs / 1_000)}><span className="text-[10px] font-bold text-[#1d9bf0]">{formatTime(note.positionMs / 1_000)}</span><p className="mt-1 text-xs">{note.body}</p><p className="mt-1 text-[10px] text-zinc-600">{note.author?.displayName ?? "Workspace member"}</p></button>)}</div>}</div>}
          {comparisonVersionIds.length === 2 && <div className="rounded-2xl border border-[#1d9bf0]/40 bg-zinc-950 p-4" aria-label="Review version comparison"><div className="flex items-center justify-between gap-3"><div><h2 className="font-bold">Version comparison</h2><p className="mt-1 text-xs text-zinc-500">Play two private review renders in sync and inspect the revision side by side.</p></div><Button size="sm" variant="outline" onClick={() => void toggleComparisonPlayback()}><Play className="mr-1.5 h-3.5 w-3.5"/>Play / pause both</Button></div><div className="mt-3 grid gap-3 sm:grid-cols-2">{comparisonVersionIds.map((versionId, index) => { const version = reviews.find((item) => item.id === versionId); return <div key={versionId} className="overflow-hidden rounded-xl border border-zinc-800 bg-black"><div className="flex items-center justify-between px-3 py-2 text-xs"><span className="font-bold">{version?.label}</span><span className="text-zinc-500">Revision {version?.revision}</span></div><video ref={(node) => { comparisonVideoRefs.current[index] = node; }} aria-label={`${version?.label ?? "Review version"} comparison video`} className="aspect-video w-full bg-black object-contain" src={comparisonMedia[versionId]} controls={false} muted={index === 0} onPlay={() => comparisonVideoRefs.current.forEach((video) => { if (video && video.paused) void video.play(); })} onPause={() => comparisonVideoRefs.current.forEach((video) => { if (video && !video.paused) video.pause(); })} onTimeUpdate={(event) => synchronizeComparison(event.currentTarget)}/></div>; })}</div></div>}
          {(reviews.length > 0 || reviewUrl) && <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-[#1d9bf0]"/><h2 className="font-bold">Review & approval</h2></div>{reviewUrl && <div className="mt-3 rounded-xl border border-[#1d9bf0]/40 bg-[#1d9bf0]/10 p-3"><p className="text-xs font-bold text-[#1d9bf0]">New link · shown once</p><p className="mt-1 break-all text-[11px] text-zinc-300">{reviewUrl}</p><Button className="mt-2" size="sm" onClick={() => void navigator.clipboard.writeText(reviewUrl)}><Copy className="mr-1.5 h-3.5 w-3.5"/>Copy</Button></div>}<div className="mt-3 space-y-3">{reviews.map((version) => <div key={version.id} className="rounded-xl bg-zinc-900 p-3"><div className="flex items-center justify-between gap-2"><div><p className="text-sm font-bold">{version.label}</p><p className="text-[11px] text-zinc-600">Edit revision {version.revision}</p></div><div className="flex items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${version.reviewStatus === "approved" ? "bg-emerald-950 text-emerald-300" : version.reviewStatus === "changes_requested" ? "bg-amber-950 text-amber-300" : "bg-black text-zinc-400"}`}>{version.reviewStatus.replace("_", " ")}</span>{version.artifactAssetId && <Button size="sm" variant={comparisonVersionIds.includes(version.id) ? "default" : "outline"} aria-label={`Select ${version.label} for comparison`} aria-pressed={comparisonVersionIds.includes(version.id)} onClick={() => void toggleComparisonVersion(version)}>{comparisonVersionIds.includes(version.id) ? "Selected" : "Compare"}</Button>}</div></div><div className="mt-3 space-y-2">{version.comments.map((comment) => <div key={comment.id} className={`rounded-lg border p-2 ${comment.status === "resolved" ? "border-zinc-800 opacity-50" : "border-zinc-700 bg-black"}`}><div className="flex items-start gap-2"><button className="text-[10px] font-bold text-[#1d9bf0]" onClick={() => seek(comment.positionMs / 1_000)}>{formatTime(comment.positionMs / 1_000)}</button><p className="min-w-0 flex-1 text-xs">{comment.body}<span className="mt-1 block text-[10px] text-zinc-600">{comment.authorName}</span></p>{comment.status === "open" && <button aria-label="Resolve review note" onClick={async () => { await apiRequest("POST", `/api/cut/projects/${project.id}/review-comments/${comment.id}/resolve`, {}); await refreshReviews(); }}><CheckCircle2 className="h-4 w-4 text-emerald-400"/></button>}</div></div>)}</div><div className="mt-3 flex flex-wrap gap-2">{version.links.filter((link) => link.status === "active").map((link) => <Button key={link.id} size="sm" variant="ghost" onClick={async () => { await apiRequest("POST", `/api/cut/projects/${project.id}/reviews/${link.id}/revoke`, {}); await refreshReviews(); }}><X className="mr-1 h-3 w-3"/>Revoke {link.label}</Button>)}</div></div>)}</div></div>}
          {saveStatus && <p role="status" className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-300">{saveStatus}</p>}
          {message && <p role="status" className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-300">{message}</p>}
        </aside>
      </div>
    </main>
  );
}
