import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Camera,
  CircleStop,
  Copy,
  Eye,
  EyeOff,
  Image,
  Layers3,
  Lock,
  Mic,
  MonitorUp,
  Palette,
  Pause,
  Play,
  Plus,
  Radio,
  Save,
  Settings2,
  Square,
  Trash2,
  Type,
  Unlock,
  Video,
  Volume2,
  VolumeX,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import type {
  BroadcastScene,
  BroadcastSceneTemplate,
  BroadcastSource,
  BroadcastStudioConfig,
} from "@shared/broadcast-studio";
import {
  applyBroadcastBrandKit,
  applyBroadcastScenePreset,
  applyBroadcastSourcePreset,
  createBroadcastSceneFromTemplate,
  duplicateBroadcastScene,
  removeBroadcastSourcePreset,
  removeBroadcastScenePreset,
  saveBroadcastScenePreset,
  saveBroadcastSourcePreset,
  transitionBroadcastScene,
  validateBroadcastStudioConfig,
} from "@shared/broadcast-studio";

type Studio = {
  id: string;
  businessId: string;
  name: string;
  config: BroadcastStudioConfig;
  revision: number;
  updatedAt: string;
  access?: { role: "owner" | "editor" | "viewer"; canEdit: boolean; canOperate: boolean };
  participants?: Array<{ id: number; username: string; displayName: string; profileImageUrl: string | null; role: "owner" | "editor" | "viewer" }>;
  sessions?: Session[];
};
type Destination = {
  id: string;
  name: string;
  protocol: "rtmp" | "rtmps" | "srt";
  ingestUrl: string;
  hasStreamKey: boolean;
  status: string;
};
type Session = {
  id: string;
  outputMode: "stream" | "recording";
  sourceMode: string;
  state: string;
  health: Record<string, unknown>;
  recordingAssetId: string | null;
  errorMessage: string | null;
  createdAt: string;
  markers?: Array<{ id: string; kind: string; label: string; positionMs: number }>;
  tracks?: Array<{
    id: string;
    sourceId: string;
    sourceName: string;
    sourceType: "camera" | "screen" | "microphone";
    mimeType: string;
    durationMs: number;
    sizeBytes: number;
    quality: Record<string, unknown>;
  }>;
  destinationReceipts?: Array<{ id: string; destinationName: string; state: string; detail: string }>;
};
type Asset = {
  id: string;
  businessId?: string | null;
  kind: string;
  mimeType: string | null;
  originalFilename: string | null;
  visibility: string;
  status: string;
  sizeBytes?: number | null;
  library?: boolean;
  access?: { canRemove: boolean };
};
type BrandLibraryKit = {
  id: string;
  name: string;
  primaryColor: string;
  surfaceColor: string;
  textColor: string;
  logoAssetId: string | null;
  updatedAt: string;
};
type AudienceMessage = { id: string; kind: "comment" | "cta"; authorName: string; body: string; actionUrl: string | null; status: "visible" | "hidden"; featured: boolean; createdAt: string };
type AudiencePayload = { access: { productionTeam: boolean; canModerate: boolean }; messages: AudienceMessage[] };
type TeamTemplate = { id: string; kind: "scene" | "source"; name: string; payload: BroadcastScene | BroadcastSource; access: { canDelete: boolean }; updatedAt: string };
type RuntimeCapture = {
  recorder: MediaRecorder;
  sessionId: string;
  queue: Promise<void>;
  stream: MediaStream;
  audioContext: AudioContext | null;
  sourceGains: Map<string, GainNode>;
  sourceAudioNodes: Map<string, {
    highPass: BiquadFilterNode;
    lowPass: BiquadFilterNode;
    compressor: DynamicsCompressorNode;
    delay: DelayNode;
    panner: StereoPannerNode;
    programSend: GainNode;
    monitorGain: GainNode;
  }>;
  masterGain: GainNode | null;
};
type ReplayCapture = {
  recorder: MediaRecorder;
  stream: MediaStream;
  audioContext: AudioContext | null;
};
type IsolatedTrackCapture = {
  recorder: MediaRecorder;
  sourceId: string;
  sourceName: string;
  sourceType: "camera" | "screen" | "microphone";
  mimeType: "video/webm" | "video/webm;codecs=vp8,opus" | "audio/webm" | "audio/webm;codecs=opus";
  chunks: Blob[];
  startedAt: number;
  quality: Record<string, number>;
};
type ActiveTransition = {
  from: BroadcastScene;
  to: BroadcastScene;
  startedAt: number;
  durationMs: number;
};

const sourceDefaults = {
  assetId: null,
  text: null,
  color: null,
  zOrder: 0,
  visible: true,
  locked: false,
  muted: false,
  volume: 1,
  audioProcessing: { highPassHz: 20, lowPassHz: 20_000, compressor: false, monitor: false, routeToProgram: true, bus: "dialogue" as const, syncOffsetMs: 0, stereoBalance: 0, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  blendMode: "source-over" as const,
  filters: { brightness: 1, contrast: 1, saturation: 1, blurPx: 0 },
  chromaKey: { enabled: false, color: "#00ff00", similarity: 0.35, smoothness: 0.1 },
  presentation: { style: "plain" as const, secondaryText: null, backgroundColor: null, fontScale: 1, align: "center" as const, scrollSpeed: 90, countdownEndsAt: null, animation: "none" as const, animationSpeed: 1 },
  transform: {
    x: 0.1,
    y: 0.1,
    width: 0.8,
    height: 0.8,
    rotation: 0,
    opacity: 1,
    cropTop: 0,
    cropRight: 0,
    cropBottom: 0,
    cropLeft: 0,
  },
};
function safeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
}
function formatUptime(seconds: unknown) {
  const value = Number(seconds) || 0;
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}
function formatBytes(bytes: unknown) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
function exactConfig(
  left: BroadcastStudioConfig,
  right: BroadcastStudioConfig,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export default function BroadcastStudioPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [studio, setStudio] = useState<Studio | null>(null);
  const [config, setConfig] = useState<BroadcastStudioConfig | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [destinationIds, setDestinationIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [destinationForm, setDestinationForm] = useState({
    name: "",
    protocol: "rtmps",
    ingestUrl: "",
    streamKey: "",
  });
  const [destinationOpen, setDestinationOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState("");
  const [replayActive, setReplayActive] = useState(false);
  const [captureAcknowledged, setCaptureAcknowledged] = useState(false);
  const [capturePaused, setCapturePaused] = useState(false);
  const [isolatedTracksEnabled, setIsolatedTracksEnabled] = useState(false);
  const [sceneTemplate, setSceneTemplate] = useState<BroadcastSceneTemplate>("solo");
  const [sourcePresetName, setSourcePresetName] = useState("");
  const [scenePresetName, setScenePresetName] = useState("");
  const [teamTemplateName, setTeamTemplateName] = useState("");
  const [brandKitName, setBrandKitName] = useState("");
  const [studioNameDraft, setStudioNameDraft] = useState("");
  const [newStudioName, setNewStudioName] = useState("");
  const [deleteStudioArmed, setDeleteStudioArmed] = useState(false);
  const [collaboratorUsername, setCollaboratorUsername] = useState("");
  const [collaboratorRole, setCollaboratorRole] = useState<"viewer" | "editor">("editor");
  const [audienceCtaLabel, setAudienceCtaLabel] = useState("");
  const [audienceCtaUrl, setAudienceCtaUrl] = useState("");
  const [audioLevels, setAudioLevels] = useState<Record<string, number>>({});
  const previewCanvas = useRef<HTMLCanvasElement>(null);
  const programCanvas = useRef<HTMLCanvasElement>(null);
  const liveStreams = useRef(new Map<string, MediaStream>());
  const mediaElements = useRef(
    new Map<string, HTMLVideoElement | HTMLImageElement>(),
  );
  const loadingAssetSources = useRef(new Set<string>());
  const runtimeCapture = useRef<RuntimeCapture | null>(null);
  const replayCapture = useRef<ReplayCapture | null>(null);
  const isolatedTrackCaptures = useRef<IsolatedTrackCapture[]>([]);
  const replayChunks = useRef<Array<{ blob: Blob; at: number }>>([]);
  const drag = useRef<{
    sourceId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const meterContexts = useRef(new Map<string, AudioContext>());
  const studioRef = useRef<Studio | null>(null);
  const latestRequestedConfig = useRef<BroadcastStudioConfig | null>(null);
  const persistQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingSaves = useRef(0);
  const transitionFrame = useRef<ActiveTransition | null>(null);
  const sourceAnimationState = useRef(new Map<string, { visible: boolean; startedAt: number }>());
  const transitionCanvases = useRef<{
    from: HTMLCanvasElement;
    to: HTMLCanvasElement;
  } | null>(null);
  const chromaCanvases = useRef(new Map<string, HTMLCanvasElement>());

  const studiosQuery = useQuery<Studio[]>({
    queryKey: ["/api/broadcast/studios"],
  });
  const destinationsQuery = useQuery<Destination[]>({
    queryKey: ["/api/broadcast/destinations"],
  });
  const assetsQuery = useQuery<Asset[]>({
    queryKey: ["/api/assets", "broadcast-library"],
    queryFn: async () => (await apiRequest("GET", "/api/assets")).json(),
  });
  const brandKitsQuery = useQuery<BrandLibraryKit[]>({
    queryKey: ["/api/broadcast/brand-kits"],
  });
  const teamTemplatesQuery = useQuery<TeamTemplate[]>({
    queryKey: ["/api/broadcast/templates", studio?.businessId],
    queryFn: async () => (await apiRequest("GET", `/api/broadcast/templates?businessId=${studio!.businessId}`)).json(),
    enabled: Boolean(studio?.businessId),
  });
  const businessMediaQuery = useQuery<Asset[]>({
    queryKey: ["/api/broadcast/media", studio?.businessId],
    queryFn: async () => (await apiRequest("GET", `/api/broadcast/media?businessId=${studio!.businessId}`)).json(),
    enabled: Boolean(studio?.businessId),
  });
  const audienceQuery = useQuery<AudiencePayload>({
    queryKey: ["/api/broadcast/sessions", session?.id, "audience"],
    queryFn: async () => (await apiRequest("GET", `/api/broadcast/sessions/${session!.id}/audience`)).json(),
    enabled: Boolean(session?.id),
    refetchInterval: session?.state === "live" ? 2_000 : false,
  });
  const destinations = destinationsQuery.data ?? [];
  const businessMedia = businessMediaQuery.data ?? [];
  const assets = Array.from(new Map([...(assetsQuery.data ?? []), ...businessMedia].map((asset) => [asset.id, asset])).values()).filter(
    (asset) => asset.status === "ready" && (asset.mimeType?.startsWith("video/") || asset.mimeType?.startsWith("image/")),
  );
  const brandKits = brandKitsQuery.data ?? [];
  const teamTemplates = teamTemplatesQuery.data ?? [];

  const saveBrandKit = useCallback(async () => {
    if (!config || !brandKitName.trim()) return;
    setBusy("brand-kit-save");
    try {
      await apiRequest("POST", "/api/broadcast/brand-kits", {
        name: brandKitName.trim(),
        ...config.brandKit,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/broadcast/brand-kits"] });
      setMessage(`${brandKitName.trim()} is saved to your brand library.`);
      setBrandKitName("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Brand kit could not be saved");
    } finally {
      setBusy("");
    }
  }, [brandKitName, config, queryClient]);

  const deleteLibraryBrandKit = useCallback(async (kit: BrandLibraryKit) => {
    setBusy(`brand-kit-delete:${kit.id}`);
    try {
      await apiRequest("DELETE", `/api/broadcast/brand-kits/${kit.id}`);
      await queryClient.invalidateQueries({ queryKey: ["/api/broadcast/brand-kits"] });
      setMessage(`${kit.name} was removed from your brand library.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Brand kit could not be removed");
    } finally {
      setBusy("");
    }
  }, [queryClient]);
  const moderateAudienceMessage = useCallback(async (messageId: string, action: "feature" | "hide" | "show") => {
    if (!session) return;
    setBusy(`audience:${messageId}:${action}`);
    try {
      await apiRequest("POST", `/api/broadcast/sessions/${session.id}/audience/messages/${messageId}/moderate`, { action });
      await audienceQuery.refetch();
      setMessage(action === "feature" ? "Audience message is live on the program canvas." : `Audience message ${action === "hide" ? "hidden" : "restored"}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Audience control failed"); }
    finally { setBusy(""); }
  }, [audienceQuery, session]);
  const publishAudienceCta = useCallback(async () => {
    if (!session || !audienceCtaLabel.trim() || !audienceCtaUrl.trim()) return;
    setBusy("audience:cta");
    try {
      await apiRequest("POST", `/api/broadcast/sessions/${session.id}/audience/cta`, { label: audienceCtaLabel.trim(), actionUrl: audienceCtaUrl.trim() });
      await audienceQuery.refetch();
      setAudienceCtaLabel(""); setAudienceCtaUrl(""); setMessage("Call to action is live on the program canvas.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Call to action could not be published"); }
    finally { setBusy(""); }
  }, [audienceCtaLabel, audienceCtaUrl, audienceQuery, session]);
  const previewScene =
    config?.scenes.find((scene) => scene.id === config.previewSceneId) ?? null;
  const programScene =
    config?.scenes.find((scene) => scene.id === config.programSceneId) ?? null;
  const selectedSource =
    previewScene?.sources.find((source) => source.id === selectedSourceId) ??
    null;

  const openStudio = useCallback(async (id: string) => {
    const value = (await (
      await apiRequest("GET", `/api/broadcast/studios/${id}`)
    ).json()) as Studio;
    setStudio(value);
    studioRef.current = value;
    setStudioNameDraft(value.name);
    setDeleteStudioArmed(false);
    setConfig(value.config);
    latestRequestedConfig.current = value.config;
    setSelectedSourceId(
      value.config.scenes.find(
        (scene) => scene.id === value.config.previewSceneId,
      )?.sources[0]?.id ?? null,
    );
    const active =
      value.sessions?.find((item) =>
        ["starting", "live", "stopping"].includes(item.state),
      ) ?? null;
    setSession(active);
  }, []);
  useEffect(() => {
    if (!studio && studiosQuery.data?.length)
      void openStudio(studiosQuery.data[0].id);
  }, [studio, studiosQuery.data, openStudio]);

  const persist = useCallback(
    async (next: BroadcastStudioConfig, nextName = studio?.name) => {
      const current = studioRef.current;
      if (current?.access?.canEdit === false) {
        setMessage("This shared studio is view only.");
        return;
      }
      setConfig(next);
      latestRequestedConfig.current = next;
      const resolvedName = nextName?.trim() || current?.name;
      if (!current || (exactConfig(next, current.config) && resolvedName === current.name)) return;
      pendingSaves.current += 1;
      setSaving(true);
      const save = async () => {
        let base = studioRef.current;
        if (!base || (exactConfig(next, base.config) && resolvedName === base.name)) return;
        try {
          let response: Response;
          try {
            response = await apiRequest(
              "PUT",
              `/api/broadcast/studios/${base.id}`,
              { config: next, name: resolvedName },
              { "If-Match": String(base.revision) },
            );
          } catch {
            base = (await (await apiRequest("GET", `/api/broadcast/studios/${base.id}`)).json()) as Studio;
            studioRef.current = base;
            response = await apiRequest(
              "PUT",
              `/api/broadcast/studios/${base.id}`,
              { config: next, name: resolvedName },
              { "If-Match": String(base.revision) },
            );
          }
          const updated = (await response.json()) as Studio;
          studioRef.current = updated;
          setStudio(updated);
          if (latestRequestedConfig.current && exactConfig(latestRequestedConfig.current, next)) setConfig(updated.config);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Studio could not be saved");
          const failedStudioId = studioRef.current?.id;
          if (failedStudioId) await openStudio(failedStudioId);
        }
      };
      persistQueue.current = persistQueue.current.catch(() => undefined).then(save).finally(() => {
        pendingSaves.current -= 1;
        if (pendingSaves.current === 0) setSaving(false);
      });
      await persistQueue.current;
    },
    [studio, openStudio],
  );

  const switchStudio = useCallback(async (studioId: string) => {
    if (!studioId || studioId === studioRef.current?.id) return;
    await persistQueue.current.catch(() => undefined);
    await openStudio(studioId);
  }, [openStudio]);

  const createStudio = useCallback(async () => {
    const name = newStudioName.trim();
    if (!name) return;
    setBusy("studio-create");
    try {
      await persistQueue.current.catch(() => undefined);
      const created = (await (await apiRequest("POST", "/api/broadcast/studios", { name })).json()) as Studio;
      await queryClient.invalidateQueries({ queryKey: ["/api/broadcast/studios"] });
      setNewStudioName("");
      await openStudio(created.id);
      setMessage(`${created.name} is ready.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Studio could not be created");
    } finally {
      setBusy("");
    }
  }, [newStudioName, openStudio, queryClient]);

  const deleteCurrentStudio = useCallback(async () => {
    const current = studioRef.current;
    if (!current || (studiosQuery.data?.length ?? 0) <= 1) return;
    setBusy("studio-delete");
    try {
      await persistQueue.current.catch(() => undefined);
      await apiRequest("DELETE", `/api/broadcast/studios/${current.id}`);
      const remaining = (await (await apiRequest("GET", "/api/broadcast/studios")).json()) as Studio[];
      queryClient.setQueryData(["/api/broadcast/studios"], remaining);
      setDeleteStudioArmed(false);
      await openStudio(remaining[0].id);
      setMessage(`${current.name} was deleted.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Studio could not be deleted");
    } finally {
      setBusy("");
    }
  }, [openStudio, queryClient, studiosQuery.data?.length]);

  const addStudioCollaborator = useCallback(async () => {
    if (!studio || !collaboratorUsername.trim()) return;
    setBusy("studio-collaborator");
    try {
      await apiRequest("POST", `/api/broadcast/studios/${studio.id}/collaborators`, { username: collaboratorUsername.trim(), role: collaboratorRole });
      setCollaboratorUsername("");
      await openStudio(studio.id);
      await queryClient.invalidateQueries({ queryKey: ["/api/broadcast/studios"] });
      setMessage("Broadcast collaborator access updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Collaborator could not be added");
    } finally {
      setBusy("");
    }
  }, [collaboratorRole, collaboratorUsername, openStudio, queryClient, studio]);

  const removeStudioCollaborator = useCallback(async (userId: number) => {
    if (!studio) return;
    setBusy(`studio-collaborator-${userId}`);
    try {
      await apiRequest("DELETE", `/api/broadcast/studios/${studio.id}/collaborators/${userId}`);
      await openStudio(studio.id);
      await queryClient.invalidateQueries({ queryKey: ["/api/broadcast/studios"] });
      setMessage("Broadcast collaborator removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Collaborator could not be removed");
    } finally {
      setBusy("");
    }
  }, [openStudio, queryClient, studio]);

  const applyLibraryBrandKit = useCallback(async (kit: BrandLibraryKit) => {
    if (!config) return;
    const branded = applyBroadcastBrandKit(validateBroadcastStudioConfig({
      ...config,
      brandKit: {
        primaryColor: kit.primaryColor,
        surfaceColor: kit.surfaceColor,
        textColor: kit.textColor,
        logoAssetId: kit.logoAssetId,
      },
    }));
    await persist(branded);
    setMessage(`${kit.name} is active in this studio.`);
  }, [config, persist]);
  const saveTeamTemplate = useCallback(async (kind: "scene" | "source") => {
    const name = teamTemplateName.trim();
    const payload = kind === "scene" ? previewScene : selectedSource;
    if (!studio || !payload || !name) return;
    setBusy(`team-template-save:${kind}`);
    try {
      await apiRequest("POST", "/api/broadcast/templates", { businessId: studio.businessId, kind, name, payload });
      await teamTemplatesQuery.refetch();
      setTeamTemplateName("");
      setMessage(`${name} is available across this business's studios.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Team template could not be saved"); }
    finally { setBusy(""); }
  }, [previewScene, selectedSource, studio, teamTemplateName, teamTemplatesQuery]);
  const applyTeamTemplate = useCallback(async (template: TeamTemplate) => {
    if (!config || !previewScene) return;
    if (template.kind === "scene") {
      const source = template.payload as BroadcastScene;
      const sceneId = safeId("scene");
      const scene = { ...source, id: sceneId, name: template.name, sources: source.sources.map((item) => ({ ...item, id: safeId("source"), assetId: null })) };
      await persist(validateBroadcastStudioConfig({ ...config, scenes: [...config.scenes, scene], previewSceneId: sceneId }));
    } else {
      const source = { ...(template.payload as BroadcastSource), id: safeId("source"), assetId: null };
      await persist(validateBroadcastStudioConfig({ ...config, scenes: config.scenes.map((scene) => scene.id === previewScene.id ? { ...scene, sources: [...scene.sources, source] } : scene) }));
      setSelectedSourceId(source.id);
    }
    setMessage(`${template.name} was added from the business library.`);
  }, [config, persist, previewScene]);
  const deleteTeamTemplate = useCallback(async (template: TeamTemplate) => {
    setBusy(`team-template-delete:${template.id}`);
    try { await apiRequest("DELETE", `/api/broadcast/templates/${template.id}`); await teamTemplatesQuery.refetch(); setMessage(`${template.name} was removed from the business library.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Team template could not be removed"); }
    finally { setBusy(""); }
  }, [teamTemplatesQuery]);
  const uploadBusinessMedia = useCallback(async (file: File) => {
    if (!studio || (!file.type.startsWith("image/") && !file.type.startsWith("video/"))) return setMessage("Choose an image or video production asset.");
    setBusy("business-media-upload");
    let assetId: string | null = null;
    try {
      const kind = file.type.startsWith("image/") ? "photo" : "video";
      try {
        const intent = (await (await apiRequest("POST", "/api/assets/upload-intents", { kind, filename: file.name, mimeType: file.type, sizeBytes: file.size, visibility: "private" })).json()) as { asset: { id: string }; upload: { uploadUrl: string } };
        assetId = intent.asset.id;
        const uploaded = await fetch(intent.upload.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        if (!uploaded.ok) throw new Error("Direct upload failed");
        await apiRequest("POST", `/api/assets/${assetId}/complete`, {});
      } catch (directError) {
        if (assetId) await apiRequest("DELETE", `/api/assets/${assetId}`, {}).catch(() => undefined);
        const form = new FormData();
        form.append("kind", kind); form.append("visibility", "private"); form.append(kind, file);
        const uploaded = await fetch("/api/assets/upload-proxy", { method: "POST", credentials: "include", body: form });
        if (!uploaded.ok) {
          const body = await uploaded.json().catch(() => ({})) as { message?: string };
          throw new Error(body.message ?? (directError instanceof Error ? directError.message : "Media upload failed"));
        }
        assetId = ((await uploaded.json()) as { asset: { id: string } }).asset.id;
      }
      await apiRequest("POST", "/api/broadcast/media", { businessId: studio.businessId, assetId, name: file.name });
      await Promise.all([businessMediaQuery.refetch(), assetsQuery.refetch()]);
      setMessage(`${file.name} is available across this business's Broadcast studios.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Business media could not be uploaded"); }
    finally { setBusy(""); }
  }, [assetsQuery, businessMediaQuery, studio]);
  const removeBusinessMedia = useCallback(async (asset: Asset) => {
    setBusy(`business-media-delete:${asset.id}`);
    try { await apiRequest("DELETE", `/api/broadcast/media/${asset.id}`); await businessMediaQuery.refetch(); setMessage(`${asset.originalFilename ?? "Media"} was removed from the business library. Existing studio scenes keep their private asset reference.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Business media could not be removed"); }
    finally { setBusy(""); }
  }, [businessMediaQuery]);
  const addBusinessMediaToScene = useCallback(async (asset: Asset) => {
    if (!config || !previewScene) return;
    const id = safeId("source");
    const source: BroadcastSource = {
      ...sourceDefaults,
      id,
      name: asset.originalFilename ?? (asset.mimeType?.startsWith("image/") ? "Shared image" : "Shared video"),
      type: asset.mimeType?.startsWith("image/") ? "image" : "media",
      assetId: asset.id,
      zOrder: previewScene.sources.length,
      muted: asset.mimeType?.startsWith("image/") ?? false,
    };
    await persist(validateBroadcastStudioConfig({ ...config, scenes: config.scenes.map((scene) => scene.id === previewScene.id ? { ...scene, sources: [...scene.sources, source] } : scene) }));
    setSelectedSourceId(id);
    setMessage(`${source.name} was added from the business media library.`);
  }, [config, persist, previewScene]);

  const updatePreviewScene = useCallback(
    (change: (scene: BroadcastScene) => BroadcastScene, save = true) => {
      if (!config || !previewScene || studioRef.current?.access?.canEdit === false) return;
      const next = validateBroadcastStudioConfig({
        ...config,
        scenes: config.scenes.map((scene) =>
          scene.id === previewScene.id ? change(scene) : scene,
        ),
      });
      if (save) void persist(next);
      else setConfig(next);
    },
    [config, previewScene, persist],
  );
  const updateSource = useCallback(
    (sourceId: string, patch: Partial<BroadcastSource>, save = true) =>
      updatePreviewScene(
        (scene) => ({
          ...scene,
          sources: scene.sources.map((source) =>
            source.id === sourceId ? { ...source, ...patch } : source,
          ),
        }),
        save,
      ),
    [updatePreviewScene],
  );
  const updateProgramSource = useCallback(
    (sourceId: string, patch: Partial<BroadcastSource>, save = true) => {
      if (!config || !programScene || studioRef.current?.access?.canEdit === false) return;
      const next = validateBroadcastStudioConfig({
        ...config,
        scenes: config.scenes.map((scene) =>
          scene.id === programScene.id
            ? {
                ...scene,
                sources: scene.sources.map((source) =>
                  source.id === sourceId ? { ...source, ...patch } : source,
                ),
              }
            : scene,
        ),
      });
      if (save) void persist(next);
      else setConfig(next);
    },
    [config, programScene, persist],
  );
  const moveSourceLayer = useCallback(
    (sourceId: string, direction: -1 | 1) =>
      updatePreviewScene((scene) => {
        const ordered = [...scene.sources].sort(
          (left, right) => left.zOrder - right.zOrder,
        );
        const index = ordered.findIndex((source) => source.id === sourceId);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= ordered.length) return scene;
        [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
        return {
          ...scene,
          sources: ordered.map((source, zOrder) => ({ ...source, zOrder })),
        };
      }),
    [updatePreviewScene],
  );

  useEffect(() => {
    if (!config) return;
    let animation = 0;
    const drawScene = (
      canvas: HTMLCanvasElement | null,
      scene: BroadcastScene | null,
      showSelection = false,
    ) => {
      if (!canvas || !scene) return;
      canvas.width = config.canvas.width;
      canvas.height = config.canvas.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = scene.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const source of [...scene.sources].sort(
        (a, b) => a.zOrder - b.zOrder,
      )) {
        const animationKey = `${scene.id}:${source.id}`;
        const priorAnimation = sourceAnimationState.current.get(animationKey);
        if (!source.visible) {
          sourceAnimationState.current.set(animationKey, { visible: false, startedAt: priorAnimation?.startedAt ?? performance.now() });
          continue;
        }
        if (!priorAnimation?.visible) sourceAnimationState.current.set(animationKey, { visible: true, startedAt: performance.now() });
        if (source.type === "microphone") continue;
        const t = source.transform;
        const x = t.x * canvas.width;
        const y = t.y * canvas.height;
        const w = t.width * canvas.width;
        const h = t.height * canvas.height;
        ctx.save();
        ctx.globalAlpha = t.opacity;
        ctx.globalCompositeOperation = source.blendMode;
        ctx.filter = `brightness(${source.filters.brightness}) contrast(${source.filters.contrast}) saturate(${source.filters.saturation}) blur(${source.filters.blurPx}px)`;
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate((t.rotation * Math.PI) / 180);
        ctx.translate(-w / 2, -h / 2);
        if (source.type === "text") {
          const presentation = source.presentation ?? sourceDefaults.presentation;
          const animationStartedAt = sourceAnimationState.current.get(animationKey)?.startedAt ?? performance.now();
          const animationProgress = Math.min(1, Math.max(0, ((performance.now() - animationStartedAt) / 450) * presentation.animationSpeed));
          const easedEntrance = 1 - Math.pow(1 - animationProgress, 3);
          if (presentation.animation === "fade") ctx.globalAlpha *= easedEntrance;
          else if (presentation.animation === "slide") ctx.translate(-(1 - easedEntrance) * w, 0);
          else if (presentation.animation === "rise") ctx.translate(0, (1 - easedEntrance) * h);
          else if (presentation.animation === "wipe") {
            ctx.beginPath(); ctx.rect(0, 0, Math.max(1, w * easedEntrance), h); ctx.clip();
          } else if (presentation.animation === "pop") {
            const overshoot = animationProgress < .75 ? .82 + (animationProgress / .75) * .24 : 1.06 - ((animationProgress - .75) / .25) * .06;
            ctx.translate(w / 2, h / 2); ctx.scale(overshoot, overshoot); ctx.translate(-w / 2, -h / 2);
          }
          const animationPhase = (performance.now() / 1000 * presentation.animationSpeed) % 1;
          if (presentation.animation === "pulse") {
            const scale = 1 + Math.sin(animationPhase * Math.PI * 2) * 0.025;
            ctx.translate(w / 2, h / 2);
            ctx.scale(scale, scale);
            ctx.translate(-w / 2, -h / 2);
          }
          const style = presentation.style;
          const align = presentation.align;
          const padding = Math.max(12, h * 0.12);
          if (style !== "plain") {
            ctx.fillStyle = presentation.backgroundColor ?? "#101014";
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = "#1d9bf0";
            ctx.fillRect(0, 0, Math.max(7, w * 0.012), h);
          }
          ctx.fillStyle = source.color ?? "#ffffff";
          ctx.textBaseline = "middle";
          ctx.textAlign = align;
          const textX = align === "left" ? padding : align === "right" ? w - padding : w / 2;
          if (style === "ticker") {
            const label = source.text ?? source.name;
            ctx.font = `700 ${Math.max(18, h * 0.42 * presentation.fontScale)}px Inter, sans-serif`;
            const textWidth = ctx.measureText(label).width;
            const movingX = w - ((performance.now() / 1000 * presentation.scrollSpeed) % (w + textWidth));
            ctx.textAlign = "left";
            ctx.fillText(label, movingX, h / 2);
          } else if (style === "countdown") {
            const remaining = Math.max(0, Math.ceil(((presentation.countdownEndsAt ?? Date.now()) - Date.now()) / 1000));
            const countdown = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
            ctx.font = `800 ${Math.max(22, h * 0.52 * presentation.fontScale)}px ui-monospace, monospace`;
            ctx.fillText(countdown, textX, h / 2);
          } else {
            ctx.font = `700 ${Math.max(18, h * (style === "lower_third" ? 0.32 : 0.45) * presentation.fontScale)}px Inter, sans-serif`;
            ctx.fillText(source.text ?? source.name, textX, style === "lower_third" && presentation.secondaryText ? h * 0.38 : h / 2, w - padding * 2);
            if (style === "lower_third" && presentation.secondaryText) {
              ctx.globalAlpha *= 0.75;
              ctx.font = `500 ${Math.max(13, h * 0.2 * presentation.fontScale)}px Inter, sans-serif`;
              ctx.fillText(presentation.secondaryText, textX, h * 0.7, w - padding * 2);
            }
          }
        } else if (source.type === "color" || source.type === "test_pattern") {
          const gradient = ctx.createLinearGradient(0, 0, w, h);
          gradient.addColorStop(0, source.color ?? "#1d9bf0");
          gradient.addColorStop(1, "#09090b");
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, w, h);
          if (source.type === "test_pattern") {
            ctx.fillStyle = "#fff";
            ctx.font = `700 ${Math.max(16, h * 0.08)}px monospace`;
            ctx.fillText("CREATIVESOS TEST", w / 2, h / 2);
          }
        } else {
          const media = mediaElements.current.get(source.id);
          if (
            media &&
            ((media instanceof HTMLVideoElement && media.readyState >= 2) ||
              (media instanceof HTMLImageElement && media.complete))
          ) {
            const sw =
              media instanceof HTMLVideoElement
                ? media.videoWidth
                : media.naturalWidth;
            const sh =
              media instanceof HTMLVideoElement
                ? media.videoHeight
                : media.naturalHeight;
            const sx = sw * t.cropLeft;
            const sy = sh * t.cropTop;
            const sourceW = sw * (1 - t.cropLeft - t.cropRight);
            const sourceH = sh * (1 - t.cropTop - t.cropBottom);
            if (source.chromaKey.enabled) {
              const scratch = chromaCanvases.current.get(source.id) ?? document.createElement("canvas");
              chromaCanvases.current.set(source.id, scratch);
              const scale = Math.min(1, 640 / Math.max(1, w), 360 / Math.max(1, h));
              scratch.width = Math.max(1, Math.round(w * scale));
              scratch.height = Math.max(1, Math.round(h * scale));
              const scratchContext = scratch.getContext("2d", { willReadFrequently: true });
              if (scratchContext) {
                scratchContext.clearRect(0, 0, scratch.width, scratch.height);
                scratchContext.drawImage(media, sx, sy, sourceW, sourceH, 0, 0, scratch.width, scratch.height);
                try {
                  const pixels = scratchContext.getImageData(0, 0, scratch.width, scratch.height);
                  const key = source.chromaKey.color;
                  const keyRed = Number.parseInt(key.slice(1, 3), 16);
                  const keyGreen = Number.parseInt(key.slice(3, 5), 16);
                  const keyBlue = Number.parseInt(key.slice(5, 7), 16);
                  const featherEnd = source.chromaKey.similarity + source.chromaKey.smoothness;
                  for (let index = 0; index < pixels.data.length; index += 4) {
                    const distance = Math.hypot(pixels.data[index] - keyRed, pixels.data[index + 1] - keyGreen, pixels.data[index + 2] - keyBlue) / 441.673;
                    const alpha = distance <= source.chromaKey.similarity ? 0 : distance >= featherEnd ? 1 : (distance - source.chromaKey.similarity) / source.chromaKey.smoothness;
                    pixels.data[index + 3] = Math.round(pixels.data[index + 3] * alpha);
                  }
                  scratchContext.putImageData(pixels, 0, 0);
                  ctx.drawImage(scratch, 0, 0, w, h);
                } catch {
                  ctx.drawImage(media, sx, sy, sourceW, sourceH, 0, 0, w, h);
                }
              }
            } else ctx.drawImage(media, sx, sy, sourceW, sourceH, 0, 0, w, h);
          } else {
            ctx.fillStyle = "#18181b";
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = "#71717a";
            ctx.font = "600 22px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(`${source.name} · connect source`, w / 2, h / 2);
          }
        }
        if (showSelection && source.id === selectedSourceId) {
          ctx.filter = "none";
          ctx.globalAlpha = 1;
          ctx.strokeStyle = "#1d9bf0";
          ctx.lineWidth = 5;
          ctx.strokeRect(2, 2, w - 4, h - 4);
        }
        ctx.restore();
      }
    };
    const drawAudienceOverlay = (canvas: HTMLCanvasElement | null) => {
      const featured = audienceQuery.data?.messages.find((item) => item.featured && item.status === "visible");
      if (!canvas || !featured) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const width = canvas.width;
      const height = canvas.height;
      const panelHeight = Math.max(90, height * 0.14);
      const margin = Math.max(24, width * 0.04);
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,.86)";
      ctx.fillRect(margin, height - panelHeight - margin, width - margin * 2, panelHeight);
      ctx.fillStyle = "#1d9bf0";
      ctx.fillRect(margin, height - panelHeight - margin, Math.max(8, width * .006), panelHeight);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${Math.max(18, height * .032)}px Inter, sans-serif`;
      ctx.fillText(featured.kind === "cta" ? featured.body : featured.authorName, margin * 1.45, height - panelHeight * .72 - margin, width - margin * 3);
      ctx.fillStyle = featured.kind === "cta" ? "#1d9bf0" : "#d4d4d8";
      ctx.font = `500 ${Math.max(15, height * .026)}px Inter, sans-serif`;
      ctx.fillText(featured.kind === "cta" ? "Visit the audience room to open the link" : featured.body, margin * 1.45, height - panelHeight * .32 - margin, width - margin * 3);
      ctx.restore();
    };
    const loop = () => {
      drawScene(previewCanvas.current, previewScene, true);
      const active = transitionFrame.current;
      if (active && programCanvas.current) {
        transitionCanvases.current ??= {
          from: document.createElement("canvas"),
          to: document.createElement("canvas"),
        };
        drawScene(transitionCanvases.current.from, active.from);
        drawScene(transitionCanvases.current.to, active.to);
        const target = programCanvas.current;
        target.width = config.canvas.width;
        target.height = config.canvas.height;
        const ctx = target.getContext("2d");
        if (ctx) {
          const progress = Math.min(
            1,
            (performance.now() - active.startedAt) /
              Math.max(1, active.durationMs),
          );
          ctx.globalAlpha = 1;
          ctx.drawImage(transitionCanvases.current.from, 0, 0);
          ctx.globalAlpha = progress;
          ctx.drawImage(transitionCanvases.current.to, 0, 0);
          ctx.globalAlpha = 1;
          if (progress >= 1) transitionFrame.current = null;
        }
      } else drawScene(programCanvas.current, programScene);
      drawAudienceOverlay(programCanvas.current);
      animation = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(animation);
  }, [audienceQuery.data, config, previewScene, programScene, selectedSourceId]);

  useEffect(
    () => () => {
      liveStreams.current.forEach((stream) =>
        stream.getTracks().forEach((track) => track.stop()),
      );
      meterContexts.current.forEach((context) => void context.close());
      runtimeCapture.current?.recorder.stop();
      isolatedTrackCaptures.current.forEach((capture) => {
        if (capture.recorder.state !== "inactive") capture.recorder.stop();
      });
      replayCapture.current?.recorder.stop();
      replayCapture.current?.stream
        .getTracks()
        .forEach((track) => track.stop());
      void replayCapture.current?.audioContext?.close();
    },
    [],
  );
  useEffect(() => {
    if (!session || !["starting", "live", "stopping"].includes(session.state))
      return;
    const timer = setInterval(async () => {
      try {
        const current = (await (
          await apiRequest("GET", `/api/broadcast/sessions/${session.id}`)
        ).json()) as Session;
        setSession(current);
        if (!["starting", "live", "stopping"].includes(current.state)) {
          clearInterval(timer);
          setMessage(
            current.state === "complete"
              ? "Broadcast output completed"
              : (current.errorMessage ?? "Broadcast stopped"),
          );
          if (studio) void openStudio(studio.id);
        }
      } catch {}
    }, 1500);
    return () => clearInterval(timer);
  }, [session?.id, session?.state, studio?.id, openStudio]);
  const performTransition = useCallback(() => {
    if (
      !config ||
      !previewScene ||
      !programScene ||
      previewScene.id === programScene.id
    )
      return;
    if (config.transition.type === "fade")
      transitionFrame.current = {
        from: programScene,
        to: previewScene,
        startedAt: performance.now(),
        durationMs: config.transition.durationMs,
      };
    void persist(transitionBroadcastScene(config));
  }, [config, previewScene, programScene, persist]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        !config ||
        !(event.altKey || event.metaKey) ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          (event.target as HTMLElement)?.tagName,
        )
      )
        return;
      if (/^[1-9]$/.test(event.key)) {
        const scene = config.scenes[Number(event.key) - 1];
        if (scene) {
          event.preventDefault();
          setConfig({ ...config, previewSceneId: scene.id });
        }
      } else if (event.key === "Enter") {
        event.preventDefault();
        performTransition();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [config, performTransition]);

  const applyDeviceAudioProcessing = async (source: BroadcastSource, stream = liveStreams.current.get(source.id)) => {
    if (!stream?.getAudioTracks().length) return 0;
    const supported = navigator.mediaDevices.getSupportedConstraints?.() ?? {};
    const constraints: MediaTrackConstraints = {};
    if (supported.echoCancellation) constraints.echoCancellation = source.audioProcessing.echoCancellation;
    if (supported.noiseSuppression) constraints.noiseSuppression = source.audioProcessing.noiseSuppression;
    if (supported.autoGainControl) constraints.autoGainControl = source.audioProcessing.autoGainControl;
    await Promise.all(stream.getAudioTracks().map((track) => track.applyConstraints(constraints)));
    return Object.keys(constraints).length;
  };
  const updateDeviceAudioProcessing = async (
    source: BroadcastSource,
    patch: Partial<Pick<BroadcastSource["audioProcessing"], "echoCancellation" | "noiseSuppression" | "autoGainControl">>,
  ) => {
    const updated = { ...source, audioProcessing: { ...source.audioProcessing, ...patch } };
    updateProgramSource(source.id, { audioProcessing: updated.audioProcessing });
    try {
      const applied = await applyDeviceAudioProcessing(updated);
      setMessage(applied ? `${source.name} capture cleanup updated` : `${source.name} device does not expose browser cleanup controls`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${source.name} capture cleanup could not be applied`);
    }
  };
  const attachMedia = async (source: BroadcastSource) => {
    try {
      let stream: MediaStream;
      if (source.type === "screen")
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
      else
        stream = await navigator.mediaDevices.getUserMedia({
          video: source.type === "camera",
          audio: source.type === "camera" || source.type === "microphone" ? {
            echoCancellation: source.audioProcessing.echoCancellation,
            noiseSuppression: source.audioProcessing.noiseSuppression,
            autoGainControl: source.audioProcessing.autoGainControl,
          } : false,
        });
      liveStreams.current
        .get(source.id)
        ?.getTracks()
        .forEach((track) => track.stop());
      liveStreams.current.set(source.id, stream);
      await applyDeviceAudioProcessing(source, stream);
      await meterContexts.current.get(source.id)?.close();
      meterContexts.current.delete(source.id);
      if (stream.getAudioTracks().length) {
        const context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        context.createMediaStreamSource(stream).connect(analyser);
        meterContexts.current.set(source.id, context);
        const samples = new Uint8Array(analyser.frequencyBinCount);
        const meter = () => {
          if (meterContexts.current.get(source.id) !== context) return;
          analyser.getByteTimeDomainData(samples);
          const rms = Math.sqrt(
            samples.reduce(
              (total, sample) => total + ((sample - 128) / 128) ** 2,
              0,
            ) / samples.length,
          );
          setAudioLevels((current) => ({
            ...current,
            [source.id]: Math.min(1, rms * 4),
          }));
          requestAnimationFrame(meter);
        };
        meter();
      }
      if (source.type !== "microphone") {
        const video = document.createElement("video");
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play();
        mediaElements.current.set(source.id, video);
      }
      stream.getTracks().forEach((track) =>
        track.addEventListener("ended", () => {
          liveStreams.current.delete(source.id);
          mediaElements.current.delete(source.id);
          void meterContexts.current.get(source.id)?.close();
          meterContexts.current.delete(source.id);
          setAudioLevels((current) => ({ ...current, [source.id]: 0 }));
        }),
      );
      setMessage(`${source.name} connected`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Device access was not granted",
      );
    }
  };
  const attachAsset = async (sourceId: string, assetId: string) => {
    const asset = assets.find((item) => item.id === assetId);
    if (!asset) return;
    const access = (await (
      await apiRequest("GET", asset.library ? `/api/broadcast/media/${assetId}/access` : `/api/assets/${assetId}/access`)
    ).json()) as { url: string };
    if (asset.mimeType?.startsWith("image/")) {
      const image = new window.Image();
      image.crossOrigin = "anonymous";
      image.src = access.url;
      await image.decode();
      mediaElements.current.set(sourceId, image);
    } else {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.src = access.url;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      mediaElements.current.set(sourceId, video);
    }
    updateSource(sourceId, {
      assetId,
      type: asset.mimeType?.startsWith("image/") ? "image" : "media",
    });
  };
  useEffect(() => {
    for (const source of previewScene?.sources ?? []) {
      if (!source.assetId || mediaElements.current.has(source.id) || loadingAssetSources.current.has(source.id)) continue;
      const asset = assets.find((item) => item.id === source.assetId);
      if (!asset) continue;
      loadingAssetSources.current.add(source.id);
      void (async () => {
        try {
          const access = (await (await apiRequest("GET", asset.library ? `/api/broadcast/media/${asset.id}/access` : `/api/assets/${asset.id}/access`)).json()) as { url: string };
          if (asset.mimeType?.startsWith("image/")) {
            const image = new window.Image();
            image.crossOrigin = "anonymous";
            image.src = access.url;
            await image.decode();
            mediaElements.current.set(source.id, image);
          } else {
            const video = document.createElement("video");
            video.crossOrigin = "anonymous";
            video.src = access.url;
            video.loop = true;
            video.muted = true;
            video.playsInline = true;
            await video.play();
            mediaElements.current.set(source.id, video);
          }
        } catch { setMessage(`${source.name} could not be loaded`); }
        finally { loadingAssetSources.current.delete(source.id); }
      })();
    }
  }, [assets, previewScene?.sources]);
  const addSource = (type: BroadcastSource["type"], graphicStyle: "plain" | "lower_third" | "ticker" | "countdown" = "plain") => {
    if (!previewScene) return;
    const id = safeId("source");
    const source: BroadcastSource = {
      ...sourceDefaults,
      id,
      name: type === "text" ? graphicStyle === "lower_third" ? "Lower third" : graphicStyle === "ticker" ? "Ticker" : graphicStyle === "countdown" ? "Countdown" : "Text" : type.replace("_", " "),
      type,
      text: type === "text" ? graphicStyle === "ticker" ? "Your live announcement scrolls here" : graphicStyle === "countdown" ? "Countdown" : "Your headline" : null,
      color: type === "color" ? "#1d9bf0" : type === "text" ? "#ffffff" : null,
      presentation: type === "text" ? { ...sourceDefaults.presentation, style: graphicStyle, align: graphicStyle === "plain" ? "center" : "left", backgroundColor: graphicStyle === "plain" ? null : "#101014", secondaryText: graphicStyle === "lower_third" ? "Role or call to action" : null, countdownEndsAt: graphicStyle === "countdown" ? Date.now() + 300_000 : null } : sourceDefaults.presentation,
      zOrder: previewScene.sources.length,
      muted:
        type === "text" ||
        type === "image" ||
        type === "color" ||
        type === "test_pattern",
    };
    updatePreviewScene((scene) => ({
      ...scene,
      sources: [...scene.sources, source],
    }));
    setSelectedSourceId(id);
    if (["camera", "screen", "microphone"].includes(type))
      void attachMedia(source);
  };

  const compositeStream = () => {
    if (!programCanvas.current || !config)
      throw new Error("Program canvas is not ready");
    const stream = programCanvas.current.captureStream(config.canvas.fps);
    let audioContext: AudioContext | null = null;
    const sourceGains = new Map<string, GainNode>();
    const sourceAudioNodes = new Map<string, {
      highPass: BiquadFilterNode;
      lowPass: BiquadFilterNode;
      compressor: DynamicsCompressorNode;
      delay: DelayNode;
      panner: StereoPannerNode;
      programSend: GainNode;
      monitorGain: GainNode;
    }>();
    let masterGain: GainNode | null = null;
    const audioInputs: Array<{ sourceId: string; stream: MediaStream }> =
      Array.from(liveStreams.current.entries()).map(
        ([sourceId, sourceStream]) => ({ sourceId, stream: sourceStream }),
      );
    for (const source of programScene?.sources ?? []) {
      const element = mediaElements.current.get(source.id) as
        (HTMLVideoElement & { captureStream?: () => MediaStream }) | undefined;
      if (element instanceof HTMLVideoElement && element.captureStream)
        audioInputs.push({
          sourceId: source.id,
          stream: element.captureStream(),
        });
    }
    if (audioInputs.some((input) => input.stream.getAudioTracks().length)) {
      audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      masterGain = audioContext.createGain();
      masterGain.gain.value = config.masterMuted ? 0 : config.masterVolume;
      masterGain.connect(destination);
      for (const input of audioInputs) {
        if (!input.stream.getAudioTracks().length) continue;
        const sourceConfig = programScene?.sources.find(
          (source) => source.id === input.sourceId,
        );
        const node = audioContext.createMediaStreamSource(input.stream);
        const highPass = audioContext.createBiquadFilter();
        highPass.type = "highpass";
        highPass.frequency.value = sourceConfig?.audioProcessing.highPassHz ?? 20;
        const lowPass = audioContext.createBiquadFilter();
        lowPass.type = "lowpass";
        lowPass.frequency.value = sourceConfig?.audioProcessing.lowPassHz ?? 20_000;
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = sourceConfig?.audioProcessing.compressor ? -18 : 0;
        compressor.knee.value = sourceConfig?.audioProcessing.compressor ? 12 : 0;
        compressor.ratio.value = sourceConfig?.audioProcessing.compressor ? 4 : 1;
        const delay = audioContext.createDelay(2);
        delay.delayTime.value = (sourceConfig?.audioProcessing.syncOffsetMs ?? 0) / 1_000;
        const panner = audioContext.createStereoPanner();
        panner.pan.value = sourceConfig?.audioProcessing.stereoBalance ?? 0;
        const gain = audioContext.createGain();
        gain.gain.value = sourceConfig?.muted ? 0 : (sourceConfig?.volume ?? 1);
        const programSend = audioContext.createGain();
        const bus = config.audioBuses.find((item) => item.id === (sourceConfig?.audioProcessing.bus ?? "dialogue"));
        programSend.gain.value = sourceConfig?.audioProcessing.routeToProgram === false || bus?.muted ? 0 : (bus?.gain ?? 1);
        const monitorGain = audioContext.createGain();
        monitorGain.gain.value = sourceConfig?.audioProcessing.monitor ? 1 : 0;
        sourceGains.set(input.sourceId, gain);
        sourceAudioNodes.set(input.sourceId, { highPass, lowPass, compressor, delay, panner, programSend, monitorGain });
        node.connect(highPass).connect(lowPass).connect(compressor).connect(delay).connect(panner).connect(gain);
        gain.connect(programSend).connect(masterGain);
        gain.connect(monitorGain).connect(audioContext.destination);
      }
      destination.stream
        .getAudioTracks()
        .forEach((track) => stream.addTrack(track));
    }
    return { stream, audioContext, sourceGains, sourceAudioNodes, masterGain };
  };
  useEffect(() => {
    const capture = runtimeCapture.current;
    if (!capture || !config) return;
    capture.masterGain?.gain.setTargetAtTime(
      config.masterMuted ? 0 : config.masterVolume,
      capture.audioContext?.currentTime ?? 0,
      0.015,
    );
    capture.sourceGains.forEach((gain, sourceId) => {
      const source = programScene?.sources.find((item) => item.id === sourceId);
      gain.gain.setTargetAtTime(
        source?.muted ? 0 : (source?.volume ?? 1),
        capture.audioContext?.currentTime ?? 0,
        0.015,
      );
      const audioNodes = capture.sourceAudioNodes.get(sourceId);
      if (source && audioNodes && capture.audioContext) {
        const now = capture.audioContext.currentTime;
        audioNodes.highPass.frequency.setTargetAtTime(source.audioProcessing.highPassHz, now, 0.015);
        audioNodes.lowPass.frequency.setTargetAtTime(source.audioProcessing.lowPassHz, now, 0.015);
        audioNodes.compressor.threshold.setTargetAtTime(source.audioProcessing.compressor ? -18 : 0, now, 0.015);
        audioNodes.compressor.knee.setTargetAtTime(source.audioProcessing.compressor ? 12 : 0, now, 0.015);
        audioNodes.compressor.ratio.setTargetAtTime(source.audioProcessing.compressor ? 4 : 1, now, 0.015);
        audioNodes.delay.delayTime.setTargetAtTime(source.audioProcessing.syncOffsetMs / 1_000, now, 0.015);
        audioNodes.panner.pan.setTargetAtTime(source.audioProcessing.stereoBalance, now, 0.015);
        const bus = config.audioBuses.find((item) => item.id === source.audioProcessing.bus);
        audioNodes.programSend.gain.setTargetAtTime(source.audioProcessing.routeToProgram && !bus?.muted ? (bus?.gain ?? 1) : 0, now, 0.015);
        audioNodes.monitorGain.gain.setTargetAtTime(source.audioProcessing.monitor ? 1 : 0, now, 0.015);
      }
    });
  }, [config?.masterMuted, config?.masterVolume, config?.audioBuses, programScene]);
  const startIsolatedTrackCaptures = () => {
    if (!isolatedTracksEnabled || !config) return;
    const sources = new Map(
      config.scenes.flatMap((scene) => scene.sources).map((source) => [source.id, source]),
    );
    const captures: IsolatedTrackCapture[] = [];
    for (const [sourceId, stream] of Array.from(liveStreams.current.entries())) {
      const source = sources.get(sourceId);
      if (!source || !["camera", "screen", "microphone"].includes(source.type)) continue;
      const sourceType = source.type as IsolatedTrackCapture["sourceType"];
      const hasVideo = stream.getVideoTracks().length > 0;
      const preferred = hasVideo ? "video/webm;codecs=vp8,opus" : "audio/webm;codecs=opus";
      const fallback = hasVideo ? "video/webm" : "audio/webm";
      const recorderMimeType = MediaRecorder.isTypeSupported(preferred) ? preferred : fallback;
      if (!MediaRecorder.isTypeSupported(recorderMimeType)) continue;
      const mimeType = (hasVideo ? "video/webm" : "audio/webm") as IsolatedTrackCapture["mimeType"];
      const videoSettings = stream.getVideoTracks()[0]?.getSettings();
      const audioSettings = stream.getAudioTracks()[0]?.getSettings();
      const recorder = new MediaRecorder(stream, {
        mimeType: recorderMimeType,
        ...(hasVideo ? { videoBitsPerSecond: 8_000_000 } : {}),
        ...(stream.getAudioTracks().length ? { audioBitsPerSecond: 192_000 } : {}),
      });
      const capture: IsolatedTrackCapture = {
        recorder,
        sourceId,
        sourceName: source.name,
        sourceType,
        mimeType,
        chunks: [],
        startedAt: Date.now(),
        quality: {
          ...(videoSettings?.width ? { width: videoSettings.width } : {}),
          ...(videoSettings?.height ? { height: videoSettings.height } : {}),
          ...(videoSettings?.frameRate ? { fps: videoSettings.frameRate } : {}),
          ...(audioSettings?.channelCount ? { audioChannels: audioSettings.channelCount } : {}),
          ...(audioSettings?.sampleRate ? { sampleRate: audioSettings.sampleRate } : {}),
          ...(hasVideo ? { videoBitsPerSecond: recorder.videoBitsPerSecond } : {}),
          ...(stream.getAudioTracks().length ? { audioBitsPerSecond: recorder.audioBitsPerSecond } : {}),
        },
      };
      recorder.ondataavailable = (event) => {
        if (event.data.size) capture.chunks.push(event.data);
      };
      recorder.start(5_000);
      captures.push(capture);
    }
    isolatedTrackCaptures.current = captures;
  };
  const finishIsolatedTrackCaptures = async () => {
    const captures = isolatedTrackCaptures.current;
    isolatedTrackCaptures.current = [];
    await Promise.all(captures.map((capture) => new Promise<void>((resolve) => {
      if (capture.recorder.state === "inactive") return resolve();
      capture.recorder.addEventListener("stop", () => resolve(), { once: true });
      capture.recorder.requestData();
      capture.recorder.stop();
    })));
    return captures;
  };
  const uploadIsolatedTrackCaptures = async (sessionId: string, captures: IsolatedTrackCapture[]) => {
    const results = await Promise.allSettled(captures.map(async (capture) => {
      const blob = new Blob(capture.chunks, { type: capture.mimeType });
      if (!blob.size) throw new Error(`${capture.sourceName} did not produce a source recording`);
      const safeName = capture.sourceName.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || capture.sourceType;
      const kind = capture.sourceType === "microphone" ? "audio" : "video";
      const filename = `broadcast-${safeName}-${Date.now()}.webm`;
      let pendingAssetId: string | null = null;
      let assetId: string;
      try {
        const intent = (await (await apiRequest("POST", "/api/assets/upload-intents", {
          kind,
          filename,
          mimeType: capture.mimeType,
          sizeBytes: blob.size,
          visibility: "private",
        })).json()) as { asset: { id: string }; upload: { uploadUrl: string } };
        pendingAssetId = intent.asset.id;
        const uploaded = await fetch(intent.upload.uploadUrl, { method: "PUT", headers: { "Content-Type": capture.mimeType }, body: blob });
        if (!uploaded.ok) throw new Error(`${capture.sourceName} direct source recording upload failed`);
        await apiRequest("POST", `/api/assets/${intent.asset.id}/complete`, {});
        assetId = intent.asset.id;
      } catch (directError) {
        if (pendingAssetId) await apiRequest("DELETE", `/api/assets/${pendingAssetId}`, {}).catch(() => undefined);
        const form = new FormData();
        form.append("kind", kind);
        form.append("visibility", "private");
        form.append(kind, new File([blob], filename, { type: capture.mimeType }));
        const uploaded = await fetch("/api/assets/upload-proxy", { method: "POST", credentials: "include", body: form });
        if (!uploaded.ok) {
          const body = await uploaded.json().catch(() => ({})) as { message?: string };
          throw new Error(body.message ?? (directError instanceof Error ? directError.message : `${capture.sourceName} source recording upload failed`));
        }
        assetId = ((await uploaded.json()) as { asset: { id: string } }).asset.id;
      }
      await apiRequest("POST", `/api/broadcast/sessions/${sessionId}/tracks`, {
        assetId,
        sourceId: capture.sourceId,
        sourceName: capture.sourceName,
        sourceType: capture.sourceType,
        mimeType: capture.mimeType,
        durationMs: Math.max(1, Date.now() - capture.startedAt),
        quality: capture.quality,
      });
    }));
    return {
      saved: results.filter((result) => result.status === "fulfilled").length,
      failed: results.filter((result) => result.status === "rejected").length,
    };
  };
  const beginOutput = async (outputMode: "stream" | "recording") => {
    if (!studio || !config || runtimeCapture.current) return;
    if (!captureAcknowledged)
      return setMessage(
        "Confirm that you have permission to capture guests and media first",
      );
    if (outputMode === "stream" && !destinationIds.length)
      return setMessage("Choose at least one destination before going live");
    if (!MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus"))
      return setMessage(
        "This browser cannot produce the required live WebM feed",
      );
    setBusy(outputMode);
    try {
      const created = (await (
        await apiRequest(
          "POST",
          `/api/broadcast/studios/${studio.id}/sessions`,
          {
            destinationId: outputMode === "stream" ? destinationIds[0] ?? null : null,
            destinationIds: outputMode === "stream" ? destinationIds : [],
            outputMode,
            sourceMode: "browser",
            videoBitrateKbps: config.output.videoBitrateKbps,
            audioBitrateKbps: config.output.audioBitrateKbps,
          },
        )
      ).json()) as Session;
      const mixed = compositeStream();
      const recorder = new MediaRecorder(mixed.stream, {
        mimeType: "video/webm;codecs=vp8,opus",
        videoBitsPerSecond: 4_500_000,
        audioBitsPerSecond: 128_000,
      });
      const capture: RuntimeCapture = {
        recorder,
        sessionId: created.id,
        queue: Promise.resolve(),
        stream: mixed.stream,
        audioContext: mixed.audioContext,
        sourceGains: mixed.sourceGains,
        sourceAudioNodes: mixed.sourceAudioNodes,
        masterGain: mixed.masterGain,
      };
      runtimeCapture.current = capture;
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        capture.queue = capture.queue
          .then(async () => {
            const response = await fetch(
              `/api/broadcast/sessions/${created.id}/chunks`,
              {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "video/webm" },
                body: event.data,
              },
            );
            if (!response.ok)
              throw new Error(
                (await response.json()).message ?? "Broadcast ingest failed",
              );
          })
          .catch((error) =>
            setMessage(
              error instanceof Error
                ? error.message
                : "Broadcast ingest failed",
            ),
          );
      };
      recorder.start(1000);
      startIsolatedTrackCaptures();
      setCapturePaused(false);
      setSession({ ...created, state: "live" });
      setMessage(
        outputMode === "stream" ? "You are live" : "Recording program output",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Broadcast could not start",
      );
    } finally {
      setBusy("");
    }
  };
  const stopOutput = async () => {
    const capture = runtimeCapture.current;
    if (!session) return;
    setBusy("stop");
    try {
      const isolated = await finishIsolatedTrackCaptures();
      if (capture) {
        capture.recorder.requestData();
        await new Promise<void>((resolve) => {
          capture.recorder.addEventListener("stop", () => resolve(), { once: true });
          capture.recorder.stop();
        });
        await capture.queue;
        capture.stream.getTracks().forEach((track) => track.stop());
        await capture.audioContext?.close();
        runtimeCapture.current = null;
        setCapturePaused(false);
      }
      await apiRequest("POST", `/api/broadcast/sessions/${session.id}/stop`, {});
      setSession({ ...session, state: "stopping" });
      if (isolated.length) {
        setMessage(`Program output stopped. Saving ${isolated.length} isolated source ${isolated.length === 1 ? "track" : "tracks"} privately…`);
        const result = await uploadIsolatedTrackCaptures(session.id, isolated);
        if (studio) await openStudio(studio.id);
        setMessage(result.failed ? `${result.saved} isolated source tracks saved; ${result.failed} need another recording.` : `${result.saved} isolated source ${result.saved === 1 ? "track" : "tracks"} saved with the program recording.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Broadcast could not be stopped cleanly");
    } finally {
      setBusy("");
    }
  };
  const toggleRecordingPause = () => {
    const capture = runtimeCapture.current;
    if (!capture || session?.outputMode !== "recording") return;
    if (capture.recorder.state === "recording") {
      capture.recorder.pause();
      isolatedTrackCaptures.current.forEach((track) => {
        if (track.recorder.state === "recording") track.recorder.pause();
      });
      setCapturePaused(true);
      setMessage("Recording paused. Program preview remains active.");
    } else if (capture.recorder.state === "paused") {
      capture.recorder.resume();
      isolatedTrackCaptures.current.forEach((track) => {
        if (track.recorder.state === "paused") track.recorder.resume();
      });
      setCapturePaused(false);
      setMessage("Recording resumed");
    }
  };
  const addProductionMarker = async (kind: "highlight" | "issue" | "note" = "highlight") => {
    if (!session) return;
    try {
      const marker = await (await apiRequest("POST", `/api/broadcast/sessions/${session.id}/markers`, {
        kind,
        label: kind === "highlight" ? "Highlight" : kind === "issue" ? "Review issue" : "Operator note",
      })).json() as NonNullable<Session["markers"]>[number];
      setSession({ ...session, markers: [...(session.markers ?? []), marker] });
      setMessage(`${marker.label} marked at ${formatUptime(marker.positionMs / 1000)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Marker could not be saved");
    }
  };
  const startEncoderTest = async () => {
    if (!studio || activeSession) return;
    setBusy("test");
    try {
      const created = (await (
        await apiRequest(
          "POST",
          `/api/broadcast/studios/${studio.id}/sessions`,
          {
            destinationId: null,
            outputMode: "recording",
            sourceMode: "test_pattern",
            videoBitrateKbps: 2500,
            audioBitrateKbps: 96,
          },
        )
      ).json()) as Session;
      setSession({ ...created, state: "live" });
      setMessage(
        "Encoder test is recording a synthetic signal. Stop it when you have enough evidence.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Encoder test failed",
      );
    } finally {
      setBusy("");
    }
  };
  const startReplay = () => {
    if (!config || replayCapture.current) return;
    const mixed = compositeStream();
    const recorder = new MediaRecorder(mixed.stream, {
      mimeType: "video/webm;codecs=vp8,opus",
      videoBitsPerSecond: 2_500_000,
    });
    replayCapture.current = {
      recorder,
      stream: mixed.stream,
      audioContext: mixed.audioContext,
    };
    replayChunks.current = [];
    recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      const now = Date.now();
      replayChunks.current.push({ blob: event.data, at: now });
      replayChunks.current = replayChunks.current.filter(
        (chunk) => now - chunk.at <= (config.replayBufferSeconds + 3) * 1000,
      );
    };
    recorder.start(1000);
    setReplayActive(true);
    setMessage(
      `Replay buffer is holding the last ${config.replayBufferSeconds} seconds locally`,
    );
  };
  const stopReplay = () => {
    const capture = replayCapture.current;
    if (!capture) return;
    capture.recorder.stop();
    capture.stream.getTracks().forEach((track) => track.stop());
    void capture.audioContext?.close();
    replayCapture.current = null;
    replayChunks.current = [];
    setReplayActive(false);
    setMessage("Replay buffer stopped and cleared");
  };
  const saveReplay = async () => {
    if (!studio || !replayChunks.current.length) return;
    setBusy("replay");
    try {
      const blob = new Blob(
        replayChunks.current.map((chunk) => chunk.blob),
        { type: "video/webm" },
      );
      const filename = `broadcast-replay-${Date.now()}.webm`;
      const intent = (await (
        await apiRequest("POST", "/api/assets/upload-intents", {
          kind: "video",
          filename,
          mimeType: blob.type,
          sizeBytes: blob.size,
          visibility: "private",
        })
      ).json()) as { asset: { id: string }; upload: { uploadUrl: string } };
      const uploaded = await fetch(intent.upload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": blob.type },
        body: blob,
      });
      if (!uploaded.ok) throw new Error("Replay upload failed");
      await apiRequest("POST", `/api/assets/${intent.asset.id}/complete`, {});
      await apiRequest(
        "POST",
        `/api/broadcast/studios/${studio.id}/recordings`,
        {
          assetId: intent.asset.id,
          durationMs:
            Math.min(
              config?.replayBufferSeconds ?? 30,
              replayChunks.current.length,
            ) * 1000,
        },
      );
      setMessage("Replay saved privately");
      await openStudio(studio.id);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Replay could not be saved",
      );
    } finally {
      setBusy("");
    }
  };

  const onCanvasDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!previewScene || !config) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const hit = [...previewScene.sources]
      .reverse()
      .find(
        (source) =>
          source.visible &&
          !source.locked &&
          x >= source.transform.x &&
          x <= source.transform.x + source.transform.width &&
          y >= source.transform.y &&
          y <= source.transform.y + source.transform.height,
      );
    if (hit) {
      setSelectedSourceId(hit.id);
      drag.current = {
        sourceId: hit.id,
        offsetX: x - hit.transform.x,
        offsetY: y - hit.transform.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };
  const onCanvasMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const active = drag.current;
    const source = previewScene?.sources.find(
      (item) => item.id === active?.sourceId,
    );
    if (!active || !source) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(
        1 - source.transform.width,
        (event.clientX - rect.left) / rect.width - active.offsetX,
      ),
    );
    const y = Math.max(
      0,
      Math.min(
        1 - source.transform.height,
        (event.clientY - rect.top) / rect.height - active.offsetY,
      ),
    );
    updateSource(
      source.id,
      { transform: { ...source.transform, x, y } },
      false,
    );
  };
  const onCanvasUp = () => {
    if (drag.current && config) void persist(config);
    drag.current = null;
  };

  if (!studio)
    return (
      <main className="min-h-screen bg-black p-5 text-white">
        <header className="flex items-center gap-3">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setLocation("/create")}
            aria-label="Back"
          >
            <ArrowLeft />
          </Button>
          <div>
            <h1 className="text-xl font-black">Broadcast Studio</h1>
            <p className="text-sm text-zinc-500">
              Build a production desk, then stream or record.
            </p>
          </div>
        </header>
        <section className="mx-auto mt-20 max-w-lg rounded-3xl border border-zinc-800 bg-zinc-950 p-8 text-center">
          <Radio className="mx-auto h-10 w-10 text-[#1d9bf0]" />
          <h2 className="mt-4 text-xl font-black">Create your first studio</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            Scenes, sources, audio, transitions, recording, replay, and live
            outputs stay together.
          </p>
          <Button
            className="mt-6 bg-[#1d9bf0] text-black"
            onClick={async () => {
              const created = (await (
                await apiRequest("POST", "/api/broadcast/studios", {
                  name: "My broadcast studio",
                })
              ).json()) as Studio;
              queryClient.invalidateQueries({
                queryKey: ["/api/broadcast/studios"],
              });
              await openStudio(created.id);
            }}
          >
            Create studio
          </Button>
        </section>
      </main>
    );
  if (!config || !previewScene || !programScene) return null;
  const activeSession =
    session && ["starting", "live", "stopping"].includes(session.state);
  const studioRole = studio.access?.role ?? "owner";
  const canEditStudio = studio.access?.canEdit ?? true;
  const canOperateStudio = studio.access?.canOperate ?? true;

  return (
    <main className="min-h-screen bg-black pb-24 text-white">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-zinc-800 bg-black/95 px-3 backdrop-blur">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setLocation("/create")}
          aria-label="Back to create"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Radio className="h-5 w-5 text-[#1d9bf0]" />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-black">{studio.name}</h1>
          <div className="flex items-center gap-2">
            <p className="shrink-0 text-[10px] uppercase tracking-widest text-zinc-500">Broadcast Studio · {saving ? "saving" : activeSession ? session?.state : "ready"}</p>
            {studioRole !== "owner" && <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-bold uppercase text-zinc-300">{studioRole}</span>}
            {(studiosQuery.data?.length ?? 0) > 1 && <select aria-label="Broadcast studio" className="h-5 max-w-28 truncate rounded border border-zinc-800 bg-black px-1 text-[10px] text-zinc-400 sm:max-w-44" value={studio.id} disabled={Boolean(activeSession) || saving} onChange={(event) => void switchStudio(event.target.value)}>{studiosQuery.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${activeSession ? "animate-pulse bg-red-500" : "bg-emerald-500"}`}
          />
          {activeSession ? (
            <>
              {session?.outputMode === "recording" && runtimeCapture.current && canOperateStudio && (
                <Button size="sm" variant="outline" onClick={toggleRecordingPause} aria-label={capturePaused ? "Resume recording" : "Pause recording"}>
                  {capturePaused ? <Play className="mr-1.5 h-4 w-4" /> : <Pause className="mr-1.5 h-4 w-4" />}
                  {capturePaused ? "Resume" : "Pause"}
                </Button>
              )}
              <Button
                size="sm"
                variant="destructive"
                disabled={busy === "stop" || !canOperateStudio}
                onClick={() => void stopOutput()}
              >
                <CircleStop className="mr-1.5 h-4 w-4" />
                Stop
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={Boolean(busy) || !captureAcknowledged || !canOperateStudio}
                onClick={() => void beginOutput("recording")}
              >
                <Square className="mr-1.5 h-3.5 w-3.5" />
                Record
              </Button>
              <Button
                size="sm"
                className="bg-red-600 text-white hover:bg-red-500"
                disabled={
                  Boolean(busy) || !destinationIds.length || !captureAcknowledged || !canOperateStudio
                }
                onClick={() => void beginOutput("stream")}
              >
                <Radio className="mr-1.5 h-3.5 w-3.5" />
                Go live
              </Button>
            </>
          )}
        </div>
      </header>
      {!canEditStudio && <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200">You have view-only access. The owner controls changes and live output.</div>}
      <div className="grid gap-3 p-3 xl:grid-cols-[240px_minmax(0,1fr)_300px]">
        <aside className="space-y-3">
          <Panel title="Scenes" icon={Layers3}>
            <div className="space-y-1">
              {config.scenes.map((scene, index) => (
                <button
                  key={scene.id}
                  onClick={() =>
                    setConfig({ ...config, previewSceneId: scene.id })
                  }
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs ${scene.id === config.previewSceneId ? "bg-[#1d9bf0] font-bold text-black" : "bg-zinc-900 text-zinc-300"}`}
                >
                  <span>{index + 1}</span>
                  <span className="truncate">{scene.name}</span>
                  {scene.id === config.programSceneId && (
                    <span className="ml-auto rounded bg-red-600 px-1.5 py-.5 text-[9px] text-white">
                      PGM
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-[1fr_42px] gap-2">
              <Input
                aria-label="Preview scene name"
                className="h-9 border-zinc-800 bg-black text-xs"
                value={previewScene.name}
                onChange={(event) =>
                  updatePreviewScene(
                    (scene) => ({ ...scene, name: event.target.value }),
                    false,
                  )
                }
                onBlur={() => config && void persist(config)}
              />
              <Input
                aria-label="Preview scene background"
                type="color"
                className="h-9 border-zinc-800 bg-black p-1"
                value={previewScene.background}
                onChange={(event) =>
                  updatePreviewScene((scene) => ({
                    ...scene,
                    background: event.target.value,
                  }))
                }
              />
            </div>
            <div className="mt-2 flex gap-1">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  const id = safeId("scene");
                  void persist({
                    ...config,
                    scenes: [
                      ...config.scenes,
                      {
                        id,
                        name: `Scene ${config.scenes.length + 1}`,
                        background: "#09090b",
                        sources: [],
                      },
                    ],
                    previewSceneId: id,
                  });
                }}
              >
                <Plus className="mr-1 h-3 w-3" />
                Scene
              </Button>
              <Button
                size="icon"
                variant="outline"
                aria-label="Duplicate scene"
                onClick={() =>
                  void persist(
                    duplicateBroadcastScene(
                      config,
                      previewScene.id,
                      safeId("scene"),
                    ),
                  )
                }
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                aria-label="Delete scene"
                disabled={config.scenes.length === 1}
                onClick={() => {
                  const scenes = config.scenes.filter(
                    (s) => s.id !== previewScene.id,
                  );
                  void persist({
                    ...config,
                    scenes,
                    previewSceneId: scenes[0].id,
                    programSceneId:
                      config.programSceneId === previewScene.id
                        ? scenes[0].id
                        : config.programSceneId,
                  });
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-1">
              <select aria-label="Scene template" value={sceneTemplate} onChange={(event) => setSceneTemplate(event.target.value as BroadcastSceneTemplate)} className="h-9 min-w-0 rounded-lg border border-zinc-800 bg-black px-2 text-[11px] text-white">
                <option value="solo">Solo creator</option>
                <option value="interview">Two-person interview</option>
                <option value="presentation">Screen presentation</option>
                <option value="countdown">Countdown opener</option>
              </select>
              <Button size="sm" variant="outline" disabled={config.scenes.length >= 20} onClick={() => void persist(createBroadcastSceneFromTemplate(config, sceneTemplate, safeId("scene")))}><Wand2 className="mr-1 h-3.5 w-3.5"/>Add template</Button>
            </div>
            <div className="mt-3 border-t border-zinc-800 pt-3">
              <div className="flex gap-1">
                <Input aria-label="Scene preset name" className="h-9 min-w-0 border-zinc-800 bg-black text-xs" value={scenePresetName} onChange={(event) => setScenePresetName(event.target.value)} placeholder="Reusable scene name"/>
                <Button aria-label="Save scene preset" size="icon" variant="outline" disabled={!scenePresetName.trim() || config.scenePresets.length >= 30} onClick={() => { void persist(saveBroadcastScenePreset(config, previewScene.id, safeId("scene_preset"), scenePresetName.trim())); setScenePresetName(""); }}><Save className="h-3.5 w-3.5"/></Button>
              </div>
              <div className="mt-2 space-y-1">{config.scenePresets.map((preset) => <div key={preset.id} className="flex items-center gap-1 rounded-lg bg-black p-1.5"><span className="min-w-0 flex-1 truncate text-[11px] font-bold">{preset.name}</span><Button aria-label={`Apply ${preset.name} scene preset`} size="sm" variant="outline" disabled={config.scenes.length >= 20} onClick={() => void persist(applyBroadcastScenePreset(config, preset.id, safeId("scene")))}>Add</Button><button aria-label={`Delete ${preset.name} scene preset`} onClick={() => void persist(removeBroadcastScenePreset(config, preset.id))}><Trash2 className="h-3.5 w-3.5 text-zinc-600"/></button></div>)}</div>
            </div>
          </Panel>
          <Panel title="Sources" icon={Video}>
            <div className="space-y-1">
              {[...previewScene.sources]
                .sort((a, b) => b.zOrder - a.zOrder)
                .map((source) => (
                  <div
                    key={source.id}
                    className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 ${source.id === selectedSourceId ? "border-[#1d9bf0] bg-[#1d9bf0]/10" : "border-zinc-800 bg-zinc-900"}`}
                  >
                    <button
                      className="min-w-0 flex-1 truncate text-left text-xs"
                      onClick={() => setSelectedSourceId(source.id)}
                    >
                      {source.name}
                    </button>
                    <button
                      aria-label={`${source.visible ? "Hide" : "Show"} ${source.name}`}
                      onClick={() =>
                        updateSource(source.id, { visible: !source.visible })
                      }
                    >
                      {source.visible ? (
                        <Eye className="h-3.5 w-3.5" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5 text-zinc-600" />
                      )}
                    </button>
                    <button
                      aria-label={`${source.locked ? "Unlock" : "Lock"} ${source.name}`}
                      onClick={() =>
                        updateSource(source.id, { locked: !source.locked })
                      }
                    >
                      {source.locked ? (
                        <Lock className="h-3.5 w-3.5 text-amber-400" />
                      ) : (
                        <Unlock className="h-3.5 w-3.5 text-zinc-600" />
                      )}
                    </button>
                    <button
                      aria-label={`${source.muted ? "Unmute" : "Mute"} ${source.name}`}
                      onClick={() =>
                        updateSource(source.id, { muted: !source.muted })
                      }
                    >
                      {source.muted ? (
                        <VolumeX className="h-3.5 w-3.5 text-zinc-600" />
                      ) : (
                        <Volume2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                ))}
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1">
              {[
                [Camera, "camera"],
                [MonitorUp, "screen"],
                [Mic, "microphone"],
                [Type, "text"],
                [Image, "media"],
                [Wand2, "test_pattern"],
              ].map(([Icon, type]) => (
                <Button
                  key={String(type)}
                  size="icon"
                  variant="outline"
                  title={`Add ${type}`}
                  aria-label={`Add ${type}`}
                  onClick={() => addSource(type as BroadcastSource["type"])}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1">
              <Button size="sm" variant="outline" className="text-[10px]" onClick={() => addSource("text", "lower_third")}>Lower third</Button>
              <Button size="sm" variant="outline" className="text-[10px]" onClick={() => addSource("text", "ticker")}>Ticker</Button>
              <Button size="sm" variant="outline" className="text-[10px]" onClick={() => addSource("text", "countdown")}>Countdown</Button>
            </div>
            {selectedSource && (
              <Button
                className="mt-2 w-full"
                size="sm"
                variant="ghost"
                onClick={() => {
                  liveStreams.current
                    .get(selectedSource.id)
                    ?.getTracks()
                    .forEach((t) => t.stop());
                  mediaElements.current.delete(selectedSource.id);
                  updatePreviewScene((scene) => ({
                    ...scene,
                    sources: scene.sources.filter(
                      (source) => source.id !== selectedSource.id,
                    ),
                  }));
                  setSelectedSourceId(null);
                }}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Remove source
              </Button>
            )}
          </Panel>
          <Panel title="Source presets" icon={Save}>
            <p className="text-[11px] leading-5 text-zinc-500">Save a complete source setup—layout, crop, filters, audio, graphics and attached asset—then reuse it in any scene.</p>
            <div className="mt-3 flex gap-2">
              <Input aria-label="Source preset name" className="h-9 min-w-0 border-zinc-800 bg-black text-xs" value={sourcePresetName} onChange={(event) => setSourcePresetName(event.target.value)} placeholder={selectedSource?.name ?? "Select a source"}/>
              <Button aria-label="Save source preset" size="sm" variant="outline" disabled={!selectedSource || !sourcePresetName.trim() || config.sourcePresets.length >= 50} onClick={() => { if (!selectedSource) return; void persist(saveBroadcastSourcePreset(config, selectedSource.id, safeId("preset"), sourcePresetName.trim())); setSourcePresetName(""); }}><Save className="h-3.5 w-3.5"/></Button>
            </div>
            <div className="mt-3 space-y-2">{config.sourcePresets.length ? config.sourcePresets.map((preset) => <div key={preset.id} className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-black p-2"><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{preset.name}</span><span className="text-[10px] text-zinc-600">{preset.source.type.replace("_", " ")}</span></span><Button size="sm" variant="outline" aria-label={`Apply ${preset.name} source preset`} onClick={() => { const sourceId = safeId("source"); void persist(applyBroadcastSourcePreset(config, previewScene.id, preset.id, sourceId)); setSelectedSourceId(sourceId); }}>Add</Button><button aria-label={`Delete ${preset.name} source preset`} onClick={() => void persist(removeBroadcastSourcePreset(config, preset.id))}><Trash2 className="h-3.5 w-3.5 text-zinc-600"/></button></div>) : <p className="py-3 text-center text-xs text-zinc-600">No source presets yet.</p>}</div>
          </Panel>
          <Panel title="Business template library" icon={Layers3}>
            <p className="text-[11px] leading-5 text-zinc-500">Promote a complete scene or selected source for reuse in every studio in this business. Private media attachments are intentionally left behind.</p>
            <Input aria-label="Business template name" className="mt-3 h-9 border-zinc-800 bg-black text-xs" value={teamTemplateName} onChange={(event) => setTeamTemplateName(event.target.value)} placeholder="Weekly show layout" maxLength={80}/>
            <div className="mt-2 grid grid-cols-2 gap-2"><Button size="sm" variant="outline" aria-label="Save scene to business library" disabled={!teamTemplateName.trim() || config.scenes.length >= 20} onClick={() => void saveTeamTemplate("scene")}><Save className="mr-1 h-3.5 w-3.5"/>Scene</Button><Button size="sm" variant="outline" aria-label="Save source to business library" disabled={!teamTemplateName.trim() || !selectedSource} onClick={() => void saveTeamTemplate("source")}><Save className="mr-1 h-3.5 w-3.5"/>Source</Button></div>
            <div className="mt-3 space-y-2">{teamTemplates.length ? teamTemplates.map((template) => <div key={template.id} className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-black p-2"><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{template.name}</span><span className="text-[10px] uppercase text-zinc-600">{template.kind}</span></span><Button size="sm" variant="outline" aria-label={`Apply ${template.name} business template`} disabled={template.kind === "scene" ? config.scenes.length >= 20 : previewScene.sources.length >= 32} onClick={() => void applyTeamTemplate(template)}>Add</Button>{template.access.canDelete && <button aria-label={`Delete ${template.name} business template`} disabled={busy === `team-template-delete:${template.id}`} onClick={() => void deleteTeamTemplate(template)}><Trash2 className="h-3.5 w-3.5 text-zinc-600"/></button>}</div>) : <p className="py-3 text-center text-xs text-zinc-600">No business templates yet.</p>}</div>
          </Panel>
          <Panel title="Business media library" icon={Image}>
            <p className="text-[11px] leading-5 text-zinc-500">Upload approved private graphics and video once, then reuse them across every Broadcast studio in this business. Team access follows business roles.</p>
            <label className="mt-3 flex h-9 cursor-pointer items-center justify-center rounded-lg border border-zinc-700 text-xs font-bold hover:bg-zinc-900">
              <input className="sr-only" type="file" accept="image/*,video/*" disabled={busy === "business-media-upload"} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadBusinessMedia(file); event.currentTarget.value = ""; }}/>
              <Plus className="mr-1.5 h-3.5 w-3.5"/>{busy === "business-media-upload" ? "Uploading…" : "Add shared media"}
            </label>
            <div className="mt-3 space-y-2">{businessMedia.length ? businessMedia.map((asset) => <div key={asset.id} className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-black p-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-900 text-[9px] font-bold text-zinc-500">{asset.mimeType?.startsWith("image/") ? "IMG" : "VID"}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{asset.originalFilename ?? "Production media"}</span><span className="text-[10px] text-zinc-600">{formatBytes(asset.sizeBytes)} · private</span></span><Button size="sm" variant="outline" aria-label={`Add ${asset.originalFilename ?? "media"} from business library`} disabled={previewScene.sources.length >= 32} onClick={() => void addBusinessMediaToScene(asset)}>Add</Button>{asset.access?.canRemove && <button aria-label={`Remove ${asset.originalFilename ?? "media"} from business library`} disabled={busy === `business-media-delete:${asset.id}`} onClick={() => void removeBusinessMedia(asset)}><Trash2 className="h-3.5 w-3.5 text-zinc-600"/></button>}</div>) : <p className="py-3 text-center text-xs text-zinc-600">No shared production media yet.</p>}</div>
          </Panel>
          <Panel title="Brand kit" icon={Palette}>
            <p className="mb-3 text-[11px] leading-5 text-zinc-500">Set this studio's identity or save it once for reuse across every broadcast studio in your account.</p>
            <div className="grid grid-cols-3 gap-2">
              {([['Primary', 'primaryColor'], ['Surface', 'surfaceColor'], ['Text', 'textColor']] as const).map(([label, key]) => <label key={key} className="text-[10px] text-zinc-500">{label}<Input aria-label={`${label} brand color`} type="color" className="mt-1 h-9 border-zinc-800 bg-black p-1" value={config.brandKit[key]} onChange={(event) => void persist({ ...config, brandKit: { ...config.brandKit, [key]: event.target.value } })}/></label>)}
            </div>
            <label className="mt-3 block text-[10px] text-zinc-500">Logo asset<select aria-label="Brand logo asset" className="mt-1 h-9 w-full rounded-lg border border-zinc-800 bg-black px-2 text-[11px] text-white" value={config.brandKit.logoAssetId ?? ""} onChange={(event) => void persist({ ...config, brandKit: { ...config.brandKit, logoAssetId: event.target.value || null } })}><option value="">No logo</option>{assets.filter((asset) => asset.mimeType?.startsWith("image/")).map((asset) => <option key={asset.id} value={asset.id}>{asset.originalFilename ?? "Image asset"}</option>)}</select></label>
            <Button className="mt-3 w-full" size="sm" variant="outline" onClick={() => void persist(applyBroadcastBrandKit(config))}>Apply to branded graphics</Button>
            <div className="mt-3 flex gap-2 border-t border-zinc-800 pt-3">
              <Input aria-label="Brand kit name" className="h-9 min-w-0 border-zinc-800 bg-black text-xs" value={brandKitName} onChange={(event) => setBrandKitName(event.target.value)} placeholder="Brand library name" maxLength={80}/>
              <Button aria-label="Save brand kit" size="icon" variant="outline" disabled={!brandKitName.trim() || busy === "brand-kit-save"} onClick={() => void saveBrandKit()}><Save className="h-3.5 w-3.5"/></Button>
            </div>
            <div className="mt-3 space-y-2">
              {brandKits.length ? brandKits.map((kit) => <div key={kit.id} className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-black p-2">
                <span className="flex" aria-hidden="true"><i className="h-5 w-3 rounded-l" style={{ backgroundColor: kit.primaryColor }}/><i className="h-5 w-3" style={{ backgroundColor: kit.surfaceColor }}/><i className="h-5 w-3 rounded-r border border-zinc-700" style={{ backgroundColor: kit.textColor }}/></span>
                <span className="min-w-0 flex-1 truncate text-xs font-bold">{kit.name}</span>
                <Button size="sm" variant="outline" aria-label={`Apply ${kit.name} brand kit`} onClick={() => void applyLibraryBrandKit(kit)}>Apply</Button>
                <button aria-label={`Delete ${kit.name} brand kit`} disabled={busy === `brand-kit-delete:${kit.id}`} onClick={() => void deleteLibraryBrandKit(kit)}><Trash2 className="h-3.5 w-3.5 text-zinc-600"/></button>
              </div>) : <p className="py-3 text-center text-xs text-zinc-600">No saved brand kits yet.</p>}
            </div>
          </Panel>
        </aside>
        <section className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-2">
            <CanvasPanel label="PREVIEW">
              <canvas
                ref={previewCanvas}
                className="max-h-[56vh] w-full bg-black object-contain"
                style={{ aspectRatio: `${config.canvas.width}/${config.canvas.height}` }}
                onPointerDown={onCanvasDown}
                onPointerMove={onCanvasMove}
                onPointerUp={onCanvasUp}
                onPointerCancel={onCanvasUp}
              />
            </CanvasPanel>
            <CanvasPanel label="PROGRAM" live={Boolean(activeSession)}>
              <canvas
                ref={programCanvas}
                className="max-h-[56vh] w-full bg-black object-contain"
                style={{ aspectRatio: `${config.canvas.width}/${config.canvas.height}` }}
              />
            </CanvasPanel>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
            <select
              aria-label="Transition type"
              value={config.transition.type}
              onChange={(e) =>
                void persist({
                  ...config,
                  transition: {
                    ...config.transition,
                    type: e.target.value as "cut" | "fade",
                  },
                })
              }
              className="h-9 rounded-lg border border-zinc-700 bg-black px-3 text-xs"
            >
              <option value="cut">Cut</option>
              <option value="fade">Fade</option>
            </select>
            {config.transition.type === "fade" && (
              <label className="flex items-center gap-2 text-xs text-zinc-500">
                <span>Duration</span>
                <Input
                  aria-label="Fade duration milliseconds"
                  className="h-9 w-24 border-zinc-700 bg-black"
                  type="number"
                  min={100}
                  max={3000}
                  step={100}
                  value={config.transition.durationMs}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      transition: {
                        ...config.transition,
                        durationMs: Number(e.target.value),
                      },
                    })
                  }
                  onBlur={() => config && void persist(config)}
                />
                <span>ms</span>
              </label>
            )}
            <Button
              className="min-w-44 bg-[#1d9bf0] text-black"
              disabled={config.previewSceneId === config.programSceneId}
              onClick={performTransition}
            >
              <Play className="mr-2 h-4 w-4" />
              Transition to program
            </Button>
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              Studio mode
              <Switch
                aria-label="Studio mode"
                checked={config.studioMode}
                onCheckedChange={(checked) =>
                  void persist({ ...config, studioMode: checked })
                }
              />
            </label>
            <span className="w-full text-center text-[10px] text-zinc-600">Operator keys: Alt/Option + 1–9 selects preview · Alt/Option + Enter takes it live</span>
          </div>
          <Panel title="Audio mixer" icon={Volume2}>
            <div className="grid gap-2 md:grid-cols-2">
              {programScene.sources
                .filter((source) =>
                  ["camera", "screen", "microphone", "media"].includes(
                    source.type,
                  ),
                )
                .map((source) => (
                  <div key={source.id} className="rounded-xl bg-black p-3">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="truncate font-bold">{source.name}</span>
                      <span className="ml-auto h-2 w-16 overflow-hidden rounded bg-zinc-800">
                        <span
                          className="block h-full bg-gradient-to-r from-emerald-500 via-yellow-400 to-red-500 transition-[width]"
                          style={{
                            width: `${Math.round((audioLevels[source.id] ?? 0) * 100)}%`,
                          }}
                        />
                      </span>
                      <span className="w-8 text-right text-[9px] text-zinc-600">
                        {Math.round((audioLevels[source.id] ?? 0) * 100)}
                      </span>
                      <button
                        aria-label={`${source.muted ? "Unmute" : "Mute"} ${source.name}`}
                        onClick={() =>
                          updateProgramSource(source.id, {
                            muted: !source.muted,
                          })
                        }
                      >
                        {source.muted ? (
                          <VolumeX className="h-4 w-4" />
                        ) : (
                          <Volume2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <Slider
                      aria-label={`${source.name} volume`}
                      className="mt-3"
                      min={0}
                      max={200}
                      step={1}
                      value={[source.volume * 100]}
                      onValueChange={(value) =>
                        updateProgramSource(
                          source.id,
                          { volume: value[0] / 100 },
                          false,
                        )
                      }
                      onValueCommit={(value) =>
                        updateProgramSource(source.id, {
                          volume: value[0] / 100,
                        })
                      }
                    />
                    <label className="mt-3 block text-[10px] text-zinc-500">
                      Live submix
                      <select
                        aria-label={`${source.name} mix bus`}
                        className="mt-1 w-full rounded-lg border border-zinc-800 bg-black px-2 py-2 text-xs text-zinc-200"
                        value={source.audioProcessing.bus}
                        onChange={(event) => updateProgramSource(source.id, { audioProcessing: { ...source.audioProcessing, bus: event.target.value as BroadcastSource["audioProcessing"]["bus"] } })}
                      >
                        {config.audioBuses.map((bus) => <option key={bus.id} value={bus.id}>{bus.name}</option>)}
                      </select>
                    </label>
                    <div className="mt-3 grid grid-cols-2 gap-3 border-t border-zinc-900 pt-3">
                      <label className="text-[10px] text-zinc-500">
                        High-pass · {source.audioProcessing.highPassHz} Hz
                        <Slider
                          aria-label={`${source.name} high-pass filter`}
                          className="mt-2"
                          min={20}
                          max={1000}
                          step={10}
                          value={[source.audioProcessing.highPassHz]}
                          onValueChange={(value) => updateProgramSource(source.id, { audioProcessing: { ...source.audioProcessing, highPassHz: value[0] } }, false)}
                          onValueCommit={(value) => updateProgramSource(source.id, { audioProcessing: { ...source.audioProcessing, highPassHz: value[0] } })}
                        />
                      </label>
                      <label className="text-[10px] text-zinc-500">
                        Low-pass · {source.audioProcessing.lowPassHz} Hz
                        <Slider
                          aria-label={`${source.name} low-pass filter`}
                          className="mt-2"
                          min={1000}
                          max={20000}
                          step={100}
                          value={[source.audioProcessing.lowPassHz]}
                          onValueChange={(value) => updateProgramSource(source.id, { audioProcessing: { ...source.audioProcessing, lowPassHz: value[0] } }, false)}
                          onValueCommit={(value) => updateProgramSource(source.id, { audioProcessing: { ...source.audioProcessing, lowPassHz: value[0] } })}
                        />
                      </label>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-4 text-[10px] text-zinc-400">
                      <label className="flex items-center gap-2">Compressor<Switch aria-label={`${source.name} compressor`} checked={source.audioProcessing.compressor} onCheckedChange={(checked) => updateProgramSource(source.id, { audioProcessing: { ...source.audioProcessing, compressor: checked } })}/></label>
                      <label className="flex items-center gap-2" title="Send this source to the recorded and streamed program mix">Program<Switch aria-label={`${source.name} program audio bus`} checked={source.audioProcessing.routeToProgram} onCheckedChange={(checked) => updateProgramSource(source.id, { audioProcessing: { ...source.audioProcessing, routeToProgram: checked } })}/></label>
                      <label className="flex items-center gap-2" title="Monitor this source through your local output; headphones recommended">Monitor<Switch aria-label={`${source.name} audio monitoring`} checked={source.audioProcessing.monitor} onCheckedChange={(checked) => updateProgramSource(source.id, { audioProcessing: { ...source.audioProcessing, monitor: checked } })}/></label>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="text-[10px] text-zinc-500">
                        Sync delay · {source.audioProcessing.syncOffsetMs} ms
                        <Slider aria-label={`${source.name} audio sync delay`} className="mt-2" min={0} max={2000} step={10} value={[source.audioProcessing.syncOffsetMs]} onValueChange={(value) => updateProgramSource(source.id, { audioProcessing: { ...source.audioProcessing, syncOffsetMs: value[0] } }, false)} onValueCommit={(value) => updateProgramSource(source.id, { audioProcessing: { ...source.audioProcessing, syncOffsetMs: value[0] } })}/>
                      </label>
                      <label className="text-[10px] text-zinc-500">
                        Stereo balance · {source.audioProcessing.stereoBalance < 0 ? `${Math.round(Math.abs(source.audioProcessing.stereoBalance) * 100)}% L` : source.audioProcessing.stereoBalance > 0 ? `${Math.round(source.audioProcessing.stereoBalance * 100)}% R` : "center"}
                        <Slider aria-label={`${source.name} stereo balance`} className="mt-2" min={-1} max={1} step={0.05} value={[source.audioProcessing.stereoBalance]} onValueChange={(value) => updateProgramSource(source.id, { audioProcessing: { ...source.audioProcessing, stereoBalance: value[0] } }, false)} onValueCommit={(value) => updateProgramSource(source.id, { audioProcessing: { ...source.audioProcessing, stereoBalance: value[0] } })}/>
                      </label>
                    </div>
                    {["camera", "screen", "microphone"].includes(source.type) && <div className="mt-3 grid gap-2 border-t border-zinc-900 pt-3 text-[10px] text-zinc-400 sm:grid-cols-3">
                      <label className="flex items-center justify-between gap-2">Echo cancellation<Switch aria-label={`${source.name} echo cancellation`} checked={source.audioProcessing.echoCancellation} onCheckedChange={(checked) => void updateDeviceAudioProcessing(source, { echoCancellation: checked })}/></label>
                      <label className="flex items-center justify-between gap-2">Noise suppression<Switch aria-label={`${source.name} noise suppression`} checked={source.audioProcessing.noiseSuppression} onCheckedChange={(checked) => void updateDeviceAudioProcessing(source, { noiseSuppression: checked })}/></label>
                      <label className="flex items-center justify-between gap-2">Auto gain<Switch aria-label={`${source.name} automatic gain control`} checked={source.audioProcessing.autoGainControl} onCheckedChange={(checked) => void updateDeviceAudioProcessing(source, { autoGainControl: checked })}/></label>
                    </div>}
                  </div>
                ))}
            </div>
            <div aria-label="Live audio buses" className="mt-3 grid gap-3 rounded-xl border border-zinc-900 bg-black/50 p-3 sm:grid-cols-3">
              {config.audioBuses.map((bus) => (
                <div key={bus.id} className="rounded-lg border border-zinc-900 bg-black p-3">
                  <div className="flex items-center gap-2">
                    <input
                      aria-label={`${bus.id} bus name`}
                      className="min-w-0 flex-1 bg-transparent text-xs font-bold text-zinc-200 outline-none"
                      value={bus.name}
                      maxLength={40}
                      onChange={(event) => setConfig({ ...config, audioBuses: config.audioBuses.map((item) => item.id === bus.id ? { ...item, name: event.target.value } : item) })}
                      onBlur={(event) => {
                        const name = event.currentTarget.value.trim();
                        void persist({ ...config, audioBuses: config.audioBuses.map((item) => item.id === bus.id ? { ...item, name: name || item.name } : item) });
                      }}
                    />
                    <button
                      aria-label={`${bus.muted ? "Unmute" : "Mute"} ${bus.name} bus`}
                      className={bus.muted ? "text-red-400" : "text-zinc-400"}
                      onClick={() => void persist({ ...config, audioBuses: config.audioBuses.map((item) => item.id === bus.id ? { ...item, muted: !item.muted } : item) })}
                    >
                      {bus.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Slider
                      aria-label={`${bus.name} bus gain`}
                      className="flex-1"
                      min={0}
                      max={200}
                      step={1}
                      value={[bus.gain * 100]}
                      onValueChange={(value) => setConfig({ ...config, audioBuses: config.audioBuses.map((item) => item.id === bus.id ? { ...item, gain: value[0] / 100 } : item) })}
                      onValueCommit={(value) => void persist({ ...config, audioBuses: config.audioBuses.map((item) => item.id === bus.id ? { ...item, gain: value[0] / 100 } : item) })}
                    />
                    <span className="w-9 text-right text-[9px] text-zinc-600">{Math.round(bus.gain * 100)}%</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3 rounded-xl bg-black p-3">
              <span className="text-xs font-bold">Master</span>
              <Slider
                aria-label="Master volume"
                className="flex-1"
                min={0}
                max={200}
                value={[config.masterVolume * 100]}
                onValueChange={(value) =>
                  setConfig({ ...config, masterVolume: value[0] / 100 })
                }
                onValueCommit={(value) =>
                  void persist({ ...config, masterVolume: value[0] / 100 })
                }
              />
              <button
                aria-label={
                  config.masterMuted ? "Unmute master" : "Mute master"
                }
                onClick={() =>
                  void persist({ ...config, masterMuted: !config.masterMuted })
                }
              >
                {config.masterMuted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>
            </div>
          </Panel>
          <Panel title="Output health" icon={Radio}>
            {activeSession ? (
              <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 xl:grid-cols-9">
                {[
                  ["State", session?.state],
                  ["FPS", session?.health?.fps ?? 0],
                  [
                    "Bitrate",
                    `${Number(session?.health?.bitrateKbps ?? 0).toFixed(0)} kbps`,
                  ],
                  ["Frames", session?.health?.frame ?? 0],
                  ["Dropped", session?.health?.droppedFrames ?? 0],
                  ["Uptime", formatUptime(session?.health?.uptimeSeconds)],
                  ["Speed", session?.health?.speed ?? "—"],
                  ["Encoded", formatBytes(session?.health?.totalSizeBytes)],
                  ["Ingested", formatBytes(session?.health?.ingestBytes)],
                ].map(([label, value]) => (
                  <Metric
                    key={String(label)}
                    label={String(label)}
                    value={String(value)}
                  />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-3">
                <Button size="sm" variant="outline" onClick={() => void addProductionMarker("highlight")}>Mark highlight</Button>
                <Button size="sm" variant="outline" onClick={() => void addProductionMarker("issue")}>Mark issue</Button>
                <span className="text-[10px] text-zinc-500">{session?.markers?.length ?? 0} production markers</span>
                {isolatedTrackCaptures.current.length > 0 && <span className="rounded-full bg-[#1d9bf0]/10 px-2 py-1 text-[10px] font-bold text-[#1d9bf0]">{isolatedTrackCaptures.current.length} isolated source {isolatedTrackCaptures.current.length === 1 ? "track" : "tracks"} capturing locally</span>}
              </div>
              {(session?.destinationReceipts?.length ?? 0) > 0 && <div className="grid gap-2 sm:grid-cols-2">{session!.destinationReceipts!.map((receipt) => <div key={receipt.id} className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-black px-3 py-2 text-xs"><span className={`h-2 w-2 rounded-full ${receipt.state === "live" ? "animate-pulse bg-emerald-400" : receipt.state === "error" || receipt.state === "interrupted" ? "bg-red-500" : "bg-zinc-500"}`}/><span className="truncate font-bold">{receipt.destinationName}</span><span className="ml-auto text-[10px] uppercase text-zinc-500">{receipt.state}</span></div>)}</div>}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-zinc-500">
                    No active output. Preview remains local until you explicitly
                    record or go live.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={Boolean(busy)}
                    onClick={() => void startEncoderTest()}
                  >
                    <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                    Run encoder test
                  </Button>
                </div>
                <label className="flex items-start gap-2 rounded-xl border border-zinc-800 bg-black p-3 text-xs leading-5 text-zinc-400">
                  <input
                    className="mt-1 accent-[#1d9bf0]"
                    type="checkbox"
                    checked={captureAcknowledged}
                    onChange={(e) => setCaptureAcknowledged(e.target.checked)}
                  />
                  <span>
                    I have permission to capture and distribute the guests,
                    voices, music, and media used in this production.
                    CreativesOS will not start recording or streaming until this
                    is confirmed.
                  </span>
                </label>
                <label className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-black p-3 text-xs leading-5 text-zinc-400">
                  <Switch
                    aria-label="Record isolated source tracks"
                    className="mt-0.5"
                    checked={isolatedTracksEnabled}
                    onCheckedChange={setIsolatedTracksEnabled}
                  />
                  <span>
                    <strong className="block text-zinc-200">Record isolated source tracks</strong>
                    Keep each connected camera, screen, and microphone at its direct source quality for later editing. Tracks upload privately when output stops; keep this tab open until saving finishes.
                  </span>
                </label>
              </div>
            )}
          </Panel>
        </section>
        <aside className="space-y-3">
          <Panel title="Inspector" icon={Settings2}>
            {selectedSource ? (
              <div className="space-y-3">
                <label className="block text-xs text-zinc-500">
                  Name
                  <Input
                    className="mt-1 border-zinc-800 bg-black"
                    value={selectedSource.name}
                    onChange={(e) =>
                      updateSource(
                        selectedSource.id,
                        { name: e.target.value },
                        false,
                      )
                    }
                    onBlur={() => config && void persist(config)}
                  />
                </label>
                {["camera", "screen", "microphone"].includes(
                  selectedSource.type,
                ) && (
                  <Button
                    size="sm"
                    className="w-full"
                    variant="outline"
                    onClick={() => void attachMedia(selectedSource)}
                  >
                    Connect {selectedSource.type}
                  </Button>
                )}
                {(selectedSource.type === "media" || selectedSource.type === "image") && (
                  <select
                    aria-label="Media asset"
                    className="h-10 w-full rounded-lg border border-zinc-800 bg-black px-3 text-xs"
                    value={selectedSource.assetId ?? ""}
                    onChange={(e) =>
                      void attachAsset(selectedSource.id, e.target.value)
                    }
                  >
                    <option value="">Choose media asset</option>
                    {assets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.originalFilename ?? asset.kind}
                      </option>
                    ))}
                  </select>
                )}
                {selectedSource.type === "text" && (
                  <>
                    <label className="block text-xs text-zinc-500">
                      Text
                      <Input
                        className="mt-1 border-zinc-800 bg-black"
                        value={selectedSource.text ?? ""}
                        onChange={(e) =>
                          updateSource(
                            selectedSource.id,
                            { text: e.target.value },
                            false,
                          )
                        }
                        onBlur={() => config && void persist(config)}
                      />
                    </label>
                    <label className="block text-xs text-zinc-500">
                      Color
                      <Input
                        aria-label="Text color"
                        type="color"
                        className="mt-1 h-10 border-zinc-800 bg-black"
                        value={selectedSource.color ?? "#ffffff"}
                        onChange={(e) =>
                          updateSource(selectedSource.id, {
                            color: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="block text-xs text-zinc-500">Graphic style<select aria-label="Text graphic style" className="mt-1 h-9 w-full rounded-lg border border-zinc-800 bg-black px-3" value={(selectedSource.presentation ?? sourceDefaults.presentation).style} onChange={(event) => updateSource(selectedSource.id, { presentation: { ...(selectedSource.presentation ?? sourceDefaults.presentation), style: event.target.value as "plain" | "lower_third" | "ticker" | "countdown" } })}><option value="plain">Plain text</option><option value="lower_third">Lower third</option><option value="ticker">Scrolling ticker</option><option value="countdown">Countdown</option></select></label>
                    <label className="block text-xs text-zinc-500">Overlay motion<select aria-label="Overlay motion" className="mt-1 h-9 w-full rounded-lg border border-zinc-800 bg-black px-3" value={(selectedSource.presentation ?? sourceDefaults.presentation).animation} onChange={(event) => updateSource(selectedSource.id, { presentation: { ...(selectedSource.presentation ?? sourceDefaults.presentation), animation: event.target.value as "none" | "fade" | "slide" | "rise" | "wipe" | "pop" | "pulse" } })}><option value="none">Static</option><option value="fade">Fade in</option><option value="slide">Slide in</option><option value="rise">Rise in</option><option value="wipe">Wipe on</option><option value="pop">Pop on</option><option value="pulse">Pulse</option></select></label>
                    {(selectedSource.presentation ?? sourceDefaults.presentation).animation !== "none" && <Control label="Motion speed" value={(selectedSource.presentation ?? sourceDefaults.presentation).animationSpeed} min={0.25} max={3} onChange={(value) => updateSource(selectedSource.id, { presentation: { ...(selectedSource.presentation ?? sourceDefaults.presentation), animationSpeed: value } }, false)} onCommit={() => config && void persist(config)}/>}
                    {(selectedSource.presentation ?? sourceDefaults.presentation).style === "lower_third" && <label className="block text-xs text-zinc-500">Secondary text<Input className="mt-1 border-zinc-800 bg-black" value={(selectedSource.presentation ?? sourceDefaults.presentation).secondaryText ?? ""} onChange={(event) => updateSource(selectedSource.id, { presentation: { ...(selectedSource.presentation ?? sourceDefaults.presentation), secondaryText: event.target.value } }, false)} onBlur={() => config && void persist(config)}/></label>}
                    {(selectedSource.presentation ?? sourceDefaults.presentation).style !== "plain" && <label className="block text-xs text-zinc-500">Graphic background<Input aria-label="Graphic background" type="color" className="mt-1 h-10 border-zinc-800 bg-black" value={(selectedSource.presentation ?? sourceDefaults.presentation).backgroundColor ?? "#101014"} onChange={(event) => updateSource(selectedSource.id, { presentation: { ...(selectedSource.presentation ?? sourceDefaults.presentation), backgroundColor: event.target.value } })}/></label>}
                    {(selectedSource.presentation ?? sourceDefaults.presentation).style === "countdown" && <Button size="sm" variant="outline" className="w-full" onClick={() => updateSource(selectedSource.id, { presentation: { ...(selectedSource.presentation ?? sourceDefaults.presentation), countdownEndsAt: Date.now() + 300_000 } })}>Reset to 5:00</Button>}
                    <Control label="Text scale" value={(selectedSource.presentation ?? sourceDefaults.presentation).fontScale} min={0.25} max={2} onChange={(value) => updateSource(selectedSource.id, { presentation: { ...(selectedSource.presentation ?? sourceDefaults.presentation), fontScale: value } }, false)} onCommit={() => config && void persist(config)}/>
                  </>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      selectedSource.zOrder >= previewScene.sources.length - 1
                    }
                    onClick={() => moveSourceLayer(selectedSource.id, 1)}
                  >
                    <ArrowUp className="mr-1 h-3.5 w-3.5" />
                    Layer up
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={selectedSource.zOrder <= 0}
                    onClick={() => moveSourceLayer(selectedSource.id, -1)}
                  >
                    <ArrowDown className="mr-1 h-3.5 w-3.5" />
                    Layer down
                  </Button>
                </div>
                <label className="block text-xs text-zinc-500">
                  Blend
                  <select
                    aria-label="Blend mode"
                    className="mt-1 h-9 w-full rounded-lg border border-zinc-800 bg-black px-3"
                    value={selectedSource.blendMode}
                    onChange={(e) =>
                      updateSource(selectedSource.id, {
                        blendMode: e.target
                          .value as BroadcastSource["blendMode"],
                      })
                    }
                  >
                    <option value="source-over">Normal</option>
                    <option value="screen">Screen</option>
                    <option value="multiply">Multiply</option>
                    <option value="overlay">Overlay</option>
                  </select>
                </label>
                <Control
                  label="X"
                  value={selectedSource.transform.x}
                  max={1 - selectedSource.transform.width}
                  onChange={(value) =>
                    updateSource(
                      selectedSource.id,
                      { transform: { ...selectedSource.transform, x: value } },
                      false,
                    )
                  }
                  onCommit={() => config && void persist(config)}
                />
                <Control
                  label="Y"
                  value={selectedSource.transform.y}
                  max={1 - selectedSource.transform.height}
                  onChange={(value) =>
                    updateSource(
                      selectedSource.id,
                      { transform: { ...selectedSource.transform, y: value } },
                      false,
                    )
                  }
                  onCommit={() => config && void persist(config)}
                />
                <Control
                  label="Width"
                  value={selectedSource.transform.width}
                  min={0.05}
                  max={1 - selectedSource.transform.x}
                  onChange={(value) =>
                    updateSource(
                      selectedSource.id,
                      {
                        transform: {
                          ...selectedSource.transform,
                          width: value,
                        },
                      },
                      false,
                    )
                  }
                  onCommit={() => config && void persist(config)}
                />
                <Control
                  label="Height"
                  value={selectedSource.transform.height}
                  min={0.05}
                  max={1 - selectedSource.transform.y}
                  onChange={(value) =>
                    updateSource(
                      selectedSource.id,
                      {
                        transform: {
                          ...selectedSource.transform,
                          height: value,
                        },
                      },
                      false,
                    )
                  }
                  onCommit={() => config && void persist(config)}
                />
                <Control
                  label="Rotation"
                  value={selectedSource.transform.rotation}
                  min={-180}
                  max={180}
                  onChange={(value) =>
                    updateSource(
                      selectedSource.id,
                      {
                        transform: {
                          ...selectedSource.transform,
                          rotation: value,
                        },
                      },
                      false,
                    )
                  }
                  onCommit={() => config && void persist(config)}
                />
                <Control
                  label="Opacity"
                  value={selectedSource.transform.opacity}
                  onChange={(value) =>
                    updateSource(
                      selectedSource.id,
                      {
                        transform: {
                          ...selectedSource.transform,
                          opacity: value,
                        },
                      },
                      false,
                    )
                  }
                  onCommit={() => config && void persist(config)}
                />
                <Control
                  label="Crop top"
                  value={selectedSource.transform.cropTop}
                  max={0.45}
                  onChange={(value) =>
                    updateSource(
                      selectedSource.id,
                      {
                        transform: {
                          ...selectedSource.transform,
                          cropTop: value,
                        },
                      },
                      false,
                    )
                  }
                  onCommit={() => config && void persist(config)}
                />
                <Control
                  label="Crop right"
                  value={selectedSource.transform.cropRight}
                  max={0.45}
                  onChange={(value) =>
                    updateSource(
                      selectedSource.id,
                      {
                        transform: {
                          ...selectedSource.transform,
                          cropRight: value,
                        },
                      },
                      false,
                    )
                  }
                  onCommit={() => config && void persist(config)}
                />
                <Control
                  label="Crop bottom"
                  value={selectedSource.transform.cropBottom}
                  max={0.45}
                  onChange={(value) =>
                    updateSource(
                      selectedSource.id,
                      {
                        transform: {
                          ...selectedSource.transform,
                          cropBottom: value,
                        },
                      },
                      false,
                    )
                  }
                  onCommit={() => config && void persist(config)}
                />
                <Control
                  label="Crop left"
                  value={selectedSource.transform.cropLeft}
                  max={0.45}
                  onChange={(value) =>
                    updateSource(
                      selectedSource.id,
                      {
                        transform: {
                          ...selectedSource.transform,
                          cropLeft: value,
                        },
                      },
                      false,
                    )
                  }
                  onCommit={() => config && void persist(config)}
                />
                <Control
                  label="Brightness"
                  value={selectedSource.filters.brightness}
                  max={2}
                  onChange={(value) =>
                    updateSource(
                      selectedSource.id,
                      {
                        filters: {
                          ...selectedSource.filters,
                          brightness: value,
                        },
                      },
                      false,
                    )
                  }
                  onCommit={() => config && void persist(config)}
                />
                <Control
                  label="Contrast"
                  value={selectedSource.filters.contrast}
                  max={2}
                  onChange={(value) =>
                    updateSource(
                      selectedSource.id,
                      {
                        filters: { ...selectedSource.filters, contrast: value },
                      },
                      false,
                    )
                  }
                  onCommit={() => config && void persist(config)}
                />
                <Control
                  label="Saturation"
                  value={selectedSource.filters.saturation}
                  max={2}
                  onChange={(value) =>
                    updateSource(
                      selectedSource.id,
                      {
                        filters: {
                          ...selectedSource.filters,
                          saturation: value,
                        },
                      },
                      false,
                    )
                  }
                  onCommit={() => config && void persist(config)}
                />
                <Control
                  label="Blur"
                  value={selectedSource.filters.blurPx}
                  max={20}
                  onChange={(value) =>
                    updateSource(
                      selectedSource.id,
                      { filters: { ...selectedSource.filters, blurPx: value } },
                      false,
                    )
                  }
                  onCommit={() => config && void persist(config)}
                />
                {["camera", "screen", "media", "image"].includes(selectedSource.type) && (
                  <div className="col-span-full rounded-xl border border-zinc-800 bg-black p-3">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span>Chroma key</span>
                      <Switch aria-label="Enable chroma key" checked={selectedSource.chromaKey.enabled} onCheckedChange={(checked) => updateSource(selectedSource.id, { chromaKey: { ...selectedSource.chromaKey, enabled: checked } })}/>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      <label className="text-[10px] text-zinc-500">Key color<Input aria-label="Chroma key color" type="color" className="mt-1 h-9 border-zinc-800 bg-zinc-950 p-1" value={selectedSource.chromaKey.color} onChange={(event) => updateSource(selectedSource.id, { chromaKey: { ...selectedSource.chromaKey, color: event.target.value } })}/></label>
                      <Control label="Similarity" value={selectedSource.chromaKey.similarity} min={0.01} max={1} onChange={(value) => updateSource(selectedSource.id, { chromaKey: { ...selectedSource.chromaKey, similarity: value } }, false)} onCommit={() => config && void persist(config)}/>
                      <Control label="Edge softness" value={selectedSource.chromaKey.smoothness} min={0.01} max={0.5} onChange={(value) => updateSource(selectedSource.id, { chromaKey: { ...selectedSource.chromaKey, smoothness: value } }, false)} onCommit={() => config && void persist(config)}/>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">
                Select a source to edit its transform, appearance, and audio.
              </p>
            )}
          </Panel>
          <Panel title="Audience control" icon={Radio}>
            {!session ? <p className="text-sm text-zinc-500">Start a recording or broadcast to open its native audience room.</p> : <div className="space-y-3">
              <div className="flex gap-2"><Input aria-label="Audience room link" readOnly className="h-9 min-w-0 border-zinc-800 bg-black text-xs" value={`${window.location.origin}/broadcast/audience/${session.id}`}/><Button size="sm" variant="outline" aria-label="Copy audience room link" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/broadcast/audience/${session.id}`)}><Copy className="h-3.5 w-3.5"/></Button></div>
              {canOperateStudio && <div className="grid gap-2 rounded-xl border border-zinc-800 bg-black p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">On-screen call to action</p><Input aria-label="Audience CTA label" className="h-9 border-zinc-800 bg-zinc-950 text-xs" maxLength={120} value={audienceCtaLabel} placeholder="Get the launch guide" onChange={(event) => setAudienceCtaLabel(event.target.value)}/><Input aria-label="Audience CTA URL" className="h-9 border-zinc-800 bg-zinc-950 text-xs" type="url" value={audienceCtaUrl} placeholder="https://…" onChange={(event) => setAudienceCtaUrl(event.target.value)}/><Button size="sm" variant="outline" disabled={busy === "audience:cta" || !audienceCtaLabel.trim() || !audienceCtaUrl.trim()} onClick={() => void publishAudienceCta()}>Put CTA on screen</Button></div>}
              <div className="space-y-2" aria-label="Audience moderation queue">{(audienceQuery.data?.messages ?? []).filter((item) => item.kind === "comment").slice(0, 20).map((item) => <article key={item.id} className={`rounded-xl border p-3 ${item.status === "hidden" ? "border-red-950 opacity-60" : item.featured ? "border-[#1d9bf0] bg-[#1d9bf0]/10" : "border-zinc-800 bg-black"}`}><div className="flex items-center justify-between gap-2"><strong className="truncate text-xs">{item.authorName}</strong><span className="text-[9px] font-bold uppercase text-zinc-600">{item.status}</span></div><p className="mt-1 text-xs leading-5 text-zinc-300">{item.body}</p>{canOperateStudio && <div className="mt-2 flex gap-2">{item.status === "visible" ? <><Button size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => void moderateAudienceMessage(item.id, "feature")}>{item.featured ? "On screen" : "Feature"}</Button><Button size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => void moderateAudienceMessage(item.id, "hide")}>Hide</Button></> : <Button size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => void moderateAudienceMessage(item.id, "show")}>Restore</Button>}</div>}</article>)}{audienceQuery.data?.messages.filter((item) => item.kind === "comment").length === 0 && <p className="py-4 text-center text-xs text-zinc-600">Audience messages will appear here live.</p>}</div>
            </div>}
          </Panel>
          <Panel title="Production settings" icon={Settings2}>
            <div className="mb-4 space-y-2 border-b border-zinc-800 pb-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Studio library</p>
              <div className="flex gap-2">
                <Input aria-label="Studio name" className="h-9 min-w-0 border-zinc-800 bg-black text-xs" value={studioNameDraft} maxLength={120} onChange={(event) => setStudioNameDraft(event.target.value)}/>
                <Button aria-label="Save studio name" size="sm" variant="outline" disabled={!canEditStudio || !studioNameDraft.trim() || studioNameDraft.trim() === studio.name || saving || Boolean(activeSession)} onClick={() => void persist(config, studioNameDraft)}>Save</Button>
              </div>
              <div className="flex gap-2">
                <Input aria-label="New studio name" className="h-9 min-w-0 border-zinc-800 bg-black text-xs" value={newStudioName} maxLength={120} placeholder="New studio name" onChange={(event) => setNewStudioName(event.target.value)}/>
                <Button aria-label="Create broadcast studio" size="sm" variant="outline" disabled={!newStudioName.trim() || busy === "studio-create" || Boolean(activeSession)} onClick={() => void createStudio()}><Plus className="mr-1 h-3.5 w-3.5"/>Create</Button>
              </div>
              {studioRole === "owner" && (studiosQuery.data?.length ?? 0) > 1 && <Button className="w-full" size="sm" variant={deleteStudioArmed ? "destructive" : "ghost"} disabled={Boolean(activeSession) || busy === "studio-delete"} onClick={() => deleteStudioArmed ? void deleteCurrentStudio() : setDeleteStudioArmed(true)}>{deleteStudioArmed ? `Delete ${studio.name}` : "Prepare studio deletion"}</Button>}
              {deleteStudioArmed && <button className="w-full text-[10px] text-zinc-500" onClick={() => setDeleteStudioArmed(false)}>Cancel deletion</button>}
              {(studio.participants?.length ?? 0) > 0 && <div className="space-y-1 pt-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Production team</p>
                {studio.participants!.map((participant) => <div key={participant.id} className="flex items-center gap-2 rounded-lg bg-black px-2 py-1.5 text-xs"><span className="min-w-0 flex-1 truncate">{participant.displayName} <span className="text-zinc-600">@{participant.username}</span></span><span className="text-[9px] font-bold uppercase text-zinc-500">{participant.role}</span>{studioRole === "owner" && participant.role !== "owner" && <button aria-label={`Remove ${participant.username} from broadcast studio`} className="text-[10px] font-bold text-red-400" disabled={busy === `studio-collaborator-${participant.id}`} onClick={() => void removeStudioCollaborator(participant.id)}>Remove</button>}</div>)}
              </div>}
              {studioRole === "owner" && <div className="grid grid-cols-[minmax(0,1fr)_86px] gap-2 pt-2">
                <Input aria-label="Broadcast collaborator username" className="h-9 border-zinc-800 bg-black text-xs" value={collaboratorUsername} placeholder="@username" onChange={(event) => setCollaboratorUsername(event.target.value.replace(/^@/, ""))}/>
                <select aria-label="Broadcast collaborator role" className="h-9 rounded-md border border-zinc-800 bg-black px-2 text-xs" value={collaboratorRole} onChange={(event) => setCollaboratorRole(event.target.value as "viewer" | "editor")}><option value="editor">Editor</option><option value="viewer">Viewer</option></select>
                <Button className="col-span-full" size="sm" variant="outline" disabled={!collaboratorUsername.trim() || busy === "studio-collaborator"} onClick={() => void addStudioCollaborator()}>Share studio</Button>
              </div>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Resolution
                <select
                  aria-label="Broadcast resolution"
                  className="mt-1 h-9 w-full rounded-lg border border-zinc-800 bg-black px-2 text-xs text-white"
                  value={`${config.canvas.width}x${config.canvas.height}`}
                  onChange={(event) => {
                    const [width, height] = event.target.value.split("x").map(Number) as [720 | 1080 | 1280 | 1920, 720 | 1080 | 1280 | 1920];
                    void persist({
                      ...config,
                      canvas: {
                        ...config.canvas,
                        width,
                        height,
                      },
                    });
                  }}
                >
                  <option value="1280x720">Landscape · 720p</option>
                  <option value="1920x1080">Landscape · 1080p</option>
                  <option value="720x1280">Portrait · 720p</option>
                  <option value="1080x1920">Portrait · 1080p</option>
                  <option value="1080x1080">Square · 1080p</option>
                </select>
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Frame rate
                <select
                  aria-label="Broadcast frame rate"
                  className="mt-1 h-9 w-full rounded-lg border border-zinc-800 bg-black px-2 text-xs text-white"
                  value={config.canvas.fps}
                  onChange={(event) =>
                    void persist({
                      ...config,
                      canvas: {
                        ...config.canvas,
                        fps: Number(event.target.value) as 24 | 30 | 60,
                      },
                    })
                  }
                >
                  <option value={24}>24 fps</option>
                  <option value={30}>30 fps</option>
                  <option value={60}>60 fps</option>
                </select>
              </label>
            </div>
            <div className="mt-3 space-y-3">
              <Control
                label="Video bitrate (kbps)"
                value={config.output.videoBitrateKbps}
                min={500}
                max={12000}
                onChange={(value) =>
                  setConfig({
                    ...config,
                    output: {
                      ...config.output,
                      videoBitrateKbps: Math.round(value),
                    },
                  })
                }
                onCommit={() => config && void persist(config)}
              />
              <Control
                label="Audio bitrate (kbps)"
                value={config.output.audioBitrateKbps}
                min={64}
                max={320}
                onChange={(value) =>
                  setConfig({
                    ...config,
                    output: {
                      ...config.output,
                      audioBitrateKbps: Math.round(value),
                    },
                  })
                }
                onCommit={() => config && void persist(config)}
              />
              <Control
                label="Replay buffer (seconds)"
                value={config.replayBufferSeconds}
                min={0}
                max={120}
                onChange={(value) =>
                  setConfig({
                    ...config,
                    replayBufferSeconds: Math.round(value),
                  })
                }
                onCommit={() => config && void persist(config)}
              />
            </div>
            <p className="mt-3 text-[10px] leading-4 text-zinc-600">
              Changes apply to the next output. Active output health remains
              visible above.
            </p>
          </Panel>
          <Panel title="Destinations" icon={Radio}>
            <p className="mb-2 text-[10px] leading-4 text-zinc-500">Select up to eight outputs. One encoded program is fanned out securely to every selected destination.</p>
            <div className="max-h-44 space-y-1 overflow-y-auto">
              {destinations.length ? destinations.map((destination) => {
                const selected = destinationIds.includes(destination.id);
                return <div key={destination.id} className={`flex items-center gap-2 rounded-lg border px-2 py-2 ${selected ? "border-[#1d9bf0] bg-[#1d9bf0]/10" : "border-zinc-800 bg-black"}`}><label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-xs"><input type="checkbox" aria-label={`Stream to ${destination.name}`} checked={selected} disabled={!selected && destinationIds.length >= 8} onChange={() => setDestinationIds((items) => selected ? items.filter((id) => id !== destination.id) : [...items, destination.id])}/><span className="truncate">{destination.name}</span><span className="ml-auto text-[9px] text-zinc-600">{destination.protocol.toUpperCase()}</span></label><button type="button" className="text-[10px] font-bold text-[#1d9bf0]" onClick={async () => { try { const result = await (await apiRequest("POST", `/api/broadcast/destinations/${destination.id}/test`, {})).json() as { detail: string }; setMessage(result.detail); } catch (error) { setMessage(error instanceof Error ? error.message : "Test failed"); } }}>Test</button></div>;
              }) : <p className="rounded-lg bg-black p-3 text-xs text-zinc-600">Add a destination to enable live output.</p>}
            </div>
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => setDestinationOpen(!destinationOpen)}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Destination
              </Button>
              {destinationIds.length > 0 && <span className="self-center text-[10px] font-bold text-emerald-400">{destinationIds.length} selected</span>}
            </div>
            {destinationOpen && (
              <form
                className="mt-3 space-y-2 rounded-xl bg-black p-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await apiRequest(
                      "POST",
                      "/api/broadcast/destinations",
                      destinationForm,
                    );
                    setDestinationForm({
                      name: "",
                      protocol: "rtmps",
                      ingestUrl: "",
                      streamKey: "",
                    });
                    setDestinationOpen(false);
                    destinationsQuery.refetch();
                    setMessage("Destination stored securely");
                  } catch (error) {
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : "Destination failed",
                    );
                  }
                }}
              >
                <Input
                  required
                  placeholder="Destination name"
                  value={destinationForm.name}
                  onChange={(e) =>
                    setDestinationForm({
                      ...destinationForm,
                      name: e.target.value,
                    })
                  }
                />
                <select
                  aria-label="Destination protocol"
                  className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-xs"
                  value={destinationForm.protocol}
                  onChange={(e) =>
                    setDestinationForm({
                      ...destinationForm,
                      protocol: e.target.value,
                    })
                  }
                >
                  <option value="rtmps">RTMPS</option>
                  <option value="rtmp">RTMP</option>
                  <option value="srt">SRT</option>
                </select>
                <Input
                  required
                  type="url"
                  placeholder="rtmps://ingest.example/live"
                  value={destinationForm.ingestUrl}
                  onChange={(e) =>
                    setDestinationForm({
                      ...destinationForm,
                      ingestUrl: e.target.value,
                    })
                  }
                />
                <Input
                  required
                  type="password"
                  autoComplete="new-password"
                  placeholder="Stream key"
                  value={destinationForm.streamKey}
                  onChange={(e) =>
                    setDestinationForm({
                      ...destinationForm,
                      streamKey: e.target.value,
                    })
                  }
                />
                <Button size="sm" className="w-full" type="submit">
                  Save securely
                </Button>
                <p className="text-[10px] leading-4 text-zinc-600">
                  Keys are encrypted, never returned to this browser, and
                  excluded from logs.
                </p>
              </form>
            )}
          </Panel>
          <Panel title="Replay & recordings" icon={Save}>
            <div className="flex gap-2">
              {!replayActive ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={startReplay}
                >
                  Start replay buffer
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={busy === "replay"}
                    onClick={() => void saveReplay()}
                  >
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                    Save last {config.replayBufferSeconds}s
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label="Stop and clear replay buffer"
                    onClick={stopReplay}
                  >
                    <CircleStop className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
            <div className="mt-3 space-y-2">
              {studio.sessions
                ?.filter((item) => item.recordingAssetId)
                .slice(0, 5)
                .map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg bg-black p-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span>{new Date(item.createdAt).toLocaleString()}</span>
                      <span className="text-emerald-400">ready</span>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const access = (await (
                            await apiRequest(
                              "GET",
                              `/api/broadcast/sessions/${item.id}/media`,
                            )
                          ).json()) as { url: string };
                          window.open(
                            access.url,
                            "_blank",
                            "noopener,noreferrer",
                          );
                        }}
                      >
                        Preview
                      </Button>
                      <Button
                        size="sm"
                        onClick={async () => {
                          await apiRequest(
                            "POST",
                            `/api/broadcast/sessions/${item.id}/distribute`,
                            {},
                          );
                          setMessage("Recording added to Distribution Studio");
                        }}
                      >
                        Distribute
                      </Button>
                      {canOperateStudio && <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const result = (await (await apiRequest("POST", `/api/broadcast/sessions/${item.id}/cut-studio`, {})).json()) as { project: { id: string } };
                          window.location.href = `/cut-studio?project=${encodeURIComponent(result.project.id)}`;
                        }}
                      >
                        Edit in CutStudio
                      </Button>}
                    </div>
                    {(item.tracks?.length ?? 0) > 0 && <div className="mt-2 space-y-1 border-t border-zinc-900 pt-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Isolated source recordings</p>
                      {item.tracks!.map((track) => <div key={track.id} className="flex items-center gap-2 rounded-md bg-zinc-950 px-2 py-1.5">
                        <span className="min-w-0 flex-1"><span className="block truncate font-bold">{track.sourceName}</span><span className="text-[10px] text-zinc-600">{track.sourceType} · {formatUptime(track.durationMs / 1000)} · {formatBytes(track.sizeBytes)}</span></span>
                        <Button size="sm" variant="outline" aria-label={`Preview ${track.sourceName} isolated recording`} onClick={async () => {
                          const access = (await (await apiRequest("GET", `/api/broadcast/sessions/${item.id}/tracks/${track.id}/media`)).json()) as { url: string };
                          window.open(access.url, "_blank", "noopener,noreferrer");
                        }}>Preview</Button>
                      </div>)}
                    </div>}
                  </div>
                ))}
            </div>
          </Panel>
          {message && (
            <p
              role="status"
              className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs leading-5 text-zinc-300"
            >
              {message}
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Radio;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-zinc-400">
        <Icon className="h-3.5 w-3.5 text-[#1d9bf0]" />
        {title}
      </h2>
      {children}
    </section>
  );
}
function CanvasPanel({
  label,
  live,
  children,
}: {
  label: string;
  live?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border ${live ? "border-red-600" : "border-zinc-800"} bg-zinc-950`}
    >
      <div className="flex h-8 items-center gap-2 px-3 text-[10px] font-black tracking-widest text-zinc-500">
        {live && (
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
        )}
        {label}
      </div>
      {children}
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black p-3">
      <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-black">{value}</p>
    </div>
  );
}
function Control({
  label,
  value,
  min = 0,
  max = 1,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  onCommit: () => void;
}) {
  return (
    <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500">
      <span className="flex justify-between">
        <span>{label}</span>
        <span>{value.toFixed(2)}</span>
      </span>
      <Slider
        className="mt-2"
        min={min * 100}
        max={Math.max(min, max) * 100}
        step={1}
        value={[value * 100]}
        onValueChange={(values) => onChange(values[0] / 100)}
        onValueCommit={onCommit}
      />
    </label>
  );
}
