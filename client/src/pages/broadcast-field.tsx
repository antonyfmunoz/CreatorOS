import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CircleDot, Download, Loader2, Radio, RefreshCw, ShieldCheck, Trash2, Video, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Room, RoomEvent } from "livekit-client";
import type { CaptureEncodingDirective, CaptureNodeConfiguration } from "@shared/broadcast-field";
import {
  browserCaptureCapabilities,
  buildCaptureTelemetry,
  captureNodeKind,
  clearFieldSession,
  deleteRecoverySegment,
  listRecoverySegments,
  loadFieldSession,
  measureFieldSenderTransport,
  saveFieldSession,
  storeRecoverySegment,
  type FieldSenderSnapshot,
  type FieldCaptureSession,
  type RecoverySegment,
  type FieldTransportMeasurement,
} from "@/lib/field-capture";

const defaultConfiguration: CaptureNodeConfiguration = {
  profile: { transport: "webrtc", codec: "vp8", width: 1920, height: 1080, fps: 30, minVideoBitrateKbps: 800, targetVideoBitrateKbps: 4500, maxVideoBitrateKbps: 8000, audioBitrateKbps: 128, keyframeIntervalSeconds: 2, adaptiveBitrate: true, localRecording: true, disconnectSlate: true, preferredOrientation: "auto" },
  requestedState: "ready", captureMode: "camera", cameraFacing: "rear", cameraLens: "auto", zoom: 1, exposureCompensation: 0,
  stabilizationEnabled: true, torchEnabled: false, microphoneMuted: false, localRecordingEnabled: true, recordingSegmentSeconds: 300,
  locationSharing: "off", burnInTimestamp: false, talkbackEnabled: false, tallyEnabled: true, remoteControlEnabled: true, telemetryIntervalSeconds: 5,
};

type ConfigurationResponse = { nodeId: string; status: string; configuration: CaptureNodeConfiguration; lastAcceptedSequence: number; directive: CaptureEncodingDirective | null };
type ClaimResponse = { node: { id: string; name: string }; telemetryUrl: string };

function recordingMimeType(stream: MediaStream) {
  const candidates = stream.getVideoTracks().length
    ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
    : ["audio/webm;codecs=opus", "audio/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? candidates[candidates.length - 1];
}

export default function BroadcastFieldPage() {
  const queryToken = useMemo(() => new URLSearchParams(window.location.search).get("token") ?? "", []);
  const [token, setToken] = useState(queryToken);
  const [name, setName] = useState(() => `${captureNodeKind(navigator.userAgent) === "desktop" ? "Browser" : "Phone"} camera`);
  const [session, setSession] = useState<FieldCaptureSession | null>(() => loadFieldSession());
  const [configuration, setConfiguration] = useState<CaptureNodeConfiguration>(defaultConfiguration);
  const [directive, setDirective] = useState<CaptureEncodingDirective | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [segments, setSegments] = useState<RecoverySegment[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("Pair this device, then grant camera and microphone access when you are ready.");
  const [heartbeat, setHeartbeat] = useState<"idle" | "healthy" | "error">("idle");
  const [transport, setTransport] = useState<"idle" | "connecting" | "live" | "unavailable" | "error">("idle");
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingSegmentStartedAt = useRef(0);
  const sequenceRef = useRef(session?.sequence ?? 0);
  const configurationRef = useRef(configuration);
  const streamRef = useRef(stream);
  const segmentCountRef = useRef(segments.length);
  const recordingStartedAtRef = useRef(recordingStartedAt);
  const transportMeasurementRef = useRef<FieldTransportMeasurement | null>(null);

  useEffect(() => { configurationRef.current = configuration; }, [configuration]);
  useEffect(() => { streamRef.current = stream; }, [stream]);
  useEffect(() => { segmentCountRef.current = segments.length; }, [segments.length]);
  useEffect(() => { recordingStartedAtRef.current = recordingStartedAt; }, [recordingStartedAt]);

  const refreshSegments = useCallback(async (nodeId = session?.nodeId) => {
    if (!nodeId || typeof indexedDB === "undefined") return;
    setSegments(await listRecoverySegments(nodeId));
  }, [session?.nodeId]);

  useEffect(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, [stream]);
  useEffect(() => { void refreshSegments(); }, [refreshSegments]);
  useEffect(() => () => stream?.getTracks().forEach((track) => track.stop()), [stream]);

  const disconnect = useCallback((reason = "This device was disconnected. The one-time code cannot be reused.") => {
    recorderRef.current?.stop();
    stream?.getTracks().forEach((track) => track.stop());
    clearFieldSession();
    setSession(null);
    setToken("");
    setStream(null);
    setHeartbeat("idle");
    setMessage(reason);
  }, [stream]);

  const pair = async () => {
    if (!token.trim() || !name.trim()) return;
    setBusy("pair");
    try {
      const response = await fetch("/api/broadcast/capture/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token.trim(), name: name.trim(), kind: captureNodeKind(navigator.userAgent), capabilities: browserCaptureCapabilities() }) });
      const data = await response.json() as ClaimResponse & { message?: string };
      if (!response.ok) throw new Error(data.message || "Pairing failed");
      const next = { nodeId: data.node.id, telemetryUrl: data.telemetryUrl, sequence: 0 };
      sequenceRef.current = 0;
      saveFieldSession(next);
      setToken("");
      setSession(next);
      window.history.replaceState({}, "", "/broadcast/field");
      setMessage(`${data.node.name} is securely paired. Start the preview to arm this camera.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pairing failed");
    } finally { setBusy(null); }
  };

  const startPreview = useCallback(async () => {
    setBusy("media");
    try {
      stream?.getTracks().forEach((track) => track.stop());
      let next: MediaStream;
      if (configuration.captureMode === "screen") {
        next = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      } else {
        next = await navigator.mediaDevices.getUserMedia({
          video: configuration.captureMode === "audio_only" ? false : { facingMode: { ideal: configuration.cameraFacing === "rear" ? "environment" : "user" }, width: { ideal: configuration.profile.width }, height: { ideal: configuration.profile.height }, frameRate: { ideal: configuration.profile.fps } },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      }
      setStream(next);
      setMessage("Preview is armed. The director can now control state, camera, microphone, and recovery recording.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Camera or microphone access was not granted");
    } finally { setBusy(null); }
  }, [configuration.cameraFacing, configuration.captureMode, configuration.profile.fps, configuration.profile.height, configuration.profile.width, stream]);

  useEffect(() => {
    const video = stream?.getVideoTracks()[0];
    const audio = stream?.getAudioTracks()[0];
    if (audio) audio.enabled = !configuration.microphoneMuted && configuration.requestedState !== "paused" && configuration.requestedState !== "stopped";
    if (video) video.enabled = configuration.requestedState !== "paused" && configuration.requestedState !== "stopped";
    if (!video || !configuration.remoteControlEnabled) return;
    const capabilities = video.getCapabilities() as MediaTrackCapabilities & { torch?: boolean; zoom?: { min: number; max: number }; exposureCompensation?: { min: number; max: number } };
    const advanced: Record<string, boolean | number>[] = [];
    if (capabilities.torch) advanced.push({ torch: configuration.torchEnabled });
    if (capabilities.zoom) advanced.push({ zoom: Math.min(capabilities.zoom.max, Math.max(capabilities.zoom.min, configuration.zoom)) });
    if (capabilities.exposureCompensation) advanced.push({ exposureCompensation: Math.min(capabilities.exposureCompensation.max, Math.max(capabilities.exposureCompensation.min, configuration.exposureCompensation)) });
    if (advanced.length) void video.applyConstraints({ advanced } as MediaTrackConstraints).catch(() => undefined);
  }, [configuration.exposureCompensation, configuration.microphoneMuted, configuration.remoteControlEnabled, configuration.requestedState, configuration.torchEnabled, configuration.zoom, stream]);

  const transportEnabled = configuration.requestedState !== "stopped";

  useEffect(() => {
    if (!session || !stream || !transportEnabled) { setTransport("idle"); return; }
    const room = new Room({ adaptiveStream: true, dynacast: true });
    let cancelled = false;
    let statsInterval: number | null = null;
    let previousStats: FieldSenderSnapshot | null = null;
    room.on(RoomEvent.Disconnected, () => { if (!cancelled) setTransport("error"); });
    void (async () => {
      try {
        setTransport("connecting");
        const response = await fetch(`/api/broadcast/capture/nodes/${session.nodeId}/media-token`);
        if (response.status === 503) { setTransport("unavailable"); return; }
        if (response.status === 401) { disconnect("The director revoked this device. Pair it again to reconnect."); return; }
        const data = await response.json() as { token?: string; serverUrl?: string; message?: string };
        if (!response.ok || !data.token || !data.serverUrl) throw new Error(data.message || "Real-time transport could not start");
        await room.connect(data.serverUrl, data.token);
        if (cancelled) return;
        for (const track of stream.getTracks()) await room.localParticipant.publishTrack(track, { name: track.kind === "video" ? "field-camera" : "field-microphone" });
        setTransport("live");
        const sampleSenderStats = async () => {
          const stats: FieldSenderSnapshot["stats"] = [];
          for (const publication of Array.from(room.localParticipant.trackPublications.values())) {
            const track = publication.track as unknown as { kind?: string; getSenderStats?: () => Promise<unknown> } | undefined;
            if (!track?.getSenderStats) continue;
            let raw: unknown;
            try {
              raw = await track.getSenderStats();
            } catch {
              continue;
            }
            const senderStats = Array.isArray(raw) ? raw : raw ? [raw] : [];
            for (const item of senderStats as Array<Record<string, unknown>>) {
              const kind = item.type === "audio" ? "audio" : item.type === "video" ? "video" : null;
              if (!kind) continue;
              stats.push({
                id: String(item.streamId ?? item.rid ?? publication.trackSid),
                kind,
                timestamp: Number(item.timestamp) || Date.now(),
                bytesSent: Number(item.bytesSent) || 0,
                packetsSent: Number(item.packetsSent) || 0,
                packetsLost: Number(item.packetsLost) || 0,
                roundTripTime: Number(item.roundTripTime) || 0,
                jitter: Number(item.jitter) || 0,
                framesPerSecond: Number(item.framesPerSecond) || 0,
                framesSent: Number(item.framesSent) || 0,
              });
            }
          }
          if (cancelled) return;
          const currentStats = { sampledAtMs: Date.now(), stats };
          transportMeasurementRef.current = measureFieldSenderTransport(currentStats, previousStats);
          previousStats = currentStats;
        };
        await sampleSenderStats();
        statsInterval = window.setInterval(() => void sampleSenderStats(), 2_000);
      } catch { if (!cancelled) setTransport("error"); }
    })();
    return () => {
      cancelled = true;
      if (statsInterval !== null) window.clearInterval(statsInterval);
      transportMeasurementRef.current = null;
      void room.disconnect();
    };
  }, [disconnect, session, stream, transportEnabled]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const synchronize = async () => {
      try {
        const response = await fetch(`/api/broadcast/capture/nodes/${session.nodeId}/configuration`);
        if (response.status === 401) return disconnect("The director revoked this device. Pair it again to reconnect.");
        if (!response.ok) throw new Error("Director sync failed");
        const data = await response.json() as ConfigurationResponse;
        if (!cancelled) { setConfiguration(data.configuration); setDirective(data.directive); setHeartbeat("healthy"); }
      } catch { if (!cancelled) setHeartbeat("error"); }
    };
    void synchronize();
    const interval = window.setInterval(() => void synchronize(), Math.max(2, configuration.telemetryIntervalSeconds) * 1_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [configuration.telemetryIntervalSeconds, disconnect, session]);

  useEffect(() => {
    if (!session) return;
    const send = async () => {
      const nextSequence = sequenceRef.current + 1;
      try {
        const currentConfiguration = configurationRef.current;
        const currentStream = streamRef.current;
        const startedAt = recordingStartedAtRef.current;
        const sample = await buildCaptureTelemetry({ sequence: nextSequence, configuration: currentConfiguration, stream: currentStream, recording: { active: recorderRef.current?.state === "recording", pendingSegments: segmentCountRef.current, durationMs: startedAt ? Date.now() - startedAt : 0 }, transport: transportMeasurementRef.current });
        const response = await fetch(session.telemetryUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sample) });
        if (response.status === 401) return disconnect("The director revoked this device. Pair it again to reconnect.");
        const data = await response.json() as ConfigurationResponse & { message?: string };
        if (!response.ok) throw new Error(data.message || "Heartbeat failed");
        const next = { ...session, sequence: nextSequence };
        sequenceRef.current = nextSequence;
        saveFieldSession(next);
        setConfiguration(data.configuration);
        setDirective(data.directive);
        setHeartbeat("healthy");
      } catch { setHeartbeat("error"); }
    };
    void send();
    const interval = window.setInterval(() => void send(), Math.max(2, configuration.telemetryIntervalSeconds) * 1_000);
    return () => window.clearInterval(interval);
  }, [configuration.telemetryIntervalSeconds, disconnect, session]);

  useEffect(() => {
    const shouldRecord = Boolean(session && stream && configuration.localRecordingEnabled && configuration.requestedState === "live" && typeof MediaRecorder !== "undefined");
    if (!shouldRecord) {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      return;
    }
    if (recorderRef.current?.state === "recording") return;
    const recorder = new MediaRecorder(stream!, { mimeType: recordingMimeType(stream!), videoBitsPerSecond: Math.min(configuration.profile.targetVideoBitrateKbps * 1_000, 8_000_000), audioBitsPerSecond: configuration.profile.audioBitrateKbps * 1_000 });
    recorderRef.current = recorder;
    recordingSegmentStartedAt.current = Date.now();
    setRecordingStartedAt(Date.now());
    recorder.ondataavailable = async (event) => {
      if (!event.data.size || !session) return;
      const now = Date.now();
      await storeRecoverySegment({ id: crypto.randomUUID(), nodeId: session.nodeId, createdAt: new Date(now).toISOString(), mimeType: event.data.type || recorder.mimeType, durationMs: now - recordingSegmentStartedAt.current, bytes: event.data.size, blob: event.data });
      recordingSegmentStartedAt.current = now;
      await refreshSegments(session.nodeId);
    };
    recorder.onerror = () => setMessage("Local recovery recording stopped unexpectedly.");
    recorder.start(configuration.recordingSegmentSeconds * 1_000);
    return () => { if (recorder.state === "recording") recorder.stop(); recorderRef.current = null; };
  }, [configuration.localRecordingEnabled, configuration.profile.audioBitrateKbps, configuration.profile.targetVideoBitrateKbps, configuration.recordingSegmentSeconds, configuration.requestedState, refreshSegments, session, stream]);

  const totalRecoveryBytes = segments.reduce((sum, segment) => sum + segment.bytes, 0);
  const status = configuration.requestedState;
  return <main className="min-h-dvh bg-black px-4 py-5 text-white sm:px-6">
    <div className="mx-auto max-w-xl space-y-4">
      <header className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-lg font-black"><Radio className="h-5 w-5 text-[#1d9bf0]"/>CreativesOS Field</div><p className="mt-1 text-xs text-zinc-500">Private remote camera and recovery recorder</p></div>{session && <div className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${heartbeat === "healthy" ? "bg-emerald-500/15 text-emerald-300" : heartbeat === "error" ? "bg-red-500/15 text-red-300" : "bg-zinc-800 text-zinc-400"}`}>{heartbeat === "healthy" ? "Director linked" : heartbeat === "error" ? "Reconnecting" : "Connecting"}</div>}</header>
      {!session ? <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5"><ShieldCheck className="h-8 w-8 text-[#1d9bf0]"/><h1 className="mt-4 text-xl font-black">Pair this field camera</h1><p className="mt-2 text-sm leading-6 text-zinc-400">The one-time code grants control to one Broadcast studio. Your account password and stream destinations never reach this device.</p><label className="mt-5 block text-xs font-bold text-zinc-400">Device name<input aria-label="Device name" value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-3 py-3 text-sm text-white"/></label><label className="mt-4 block text-xs font-bold text-zinc-400">Pairing code<input aria-label="Pairing code" value={token} onChange={(event) => setToken(event.target.value)} autoCapitalize="none" autoCorrect="off" className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-3 py-3 font-mono text-xs text-white"/></label><Button className="mt-5 w-full bg-[#1d9bf0] font-bold text-black hover:bg-[#1d9bf0]/90" disabled={busy === "pair" || token.trim().length < 32 || !name.trim()} onClick={() => void pair()}>{busy === "pair" ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ShieldCheck className="mr-2 h-4 w-4"/>}Pair securely</Button></section> : <>
        <section className={`relative overflow-hidden rounded-3xl border ${status === "live" ? "border-red-500/70" : "border-zinc-800"} bg-zinc-950`}>
          <div className="aspect-video bg-black">{stream ? <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover"/> : <div className="flex h-full flex-col items-center justify-center text-zinc-600"><Camera className="h-10 w-10"/><span className="mt-2 text-xs">Preview is off</span></div>}</div>
          <div className="absolute left-3 top-3 flex gap-2">{status === "live" && <span className="flex items-center gap-1 rounded-full bg-red-600 px-2 py-1 text-[10px] font-black uppercase"><CircleDot className="h-3 w-3"/>Live</span>}{configuration.tallyEnabled && <span className="rounded-full bg-black/80 px-2 py-1 text-[10px] font-bold uppercase text-zinc-200">{status}</span>}</div>
        </section>
        <section className="grid grid-cols-2 gap-2"><Button onClick={() => void startPreview()} disabled={busy === "media"} className="bg-white text-black hover:bg-zinc-200">{busy === "media" ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Video className="mr-2 h-4 w-4"/>}{stream ? "Restart preview" : "Start preview"}</Button><Button variant="outline" onClick={() => disconnect()}>Disconnect</Button></section>
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-black">Director controls</h2>{heartbeat === "healthy" ? <Wifi className="h-4 w-4 text-emerald-400"/> : <WifiOff className="h-4 w-4 text-red-400"/>}</div><div className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><span className="text-zinc-500">State</span><strong className="block capitalize">{configuration.requestedState}</strong></div><div><span className="text-zinc-500">Capture</span><strong className="block capitalize">{configuration.captureMode.replace("_", " ")}</strong></div><div><span className="text-zinc-500">Camera</span><strong className="block capitalize">{configuration.cameraFacing} · {configuration.cameraLens}</strong></div><div><span className="text-zinc-500">Microphone</span><strong className={`block ${configuration.microphoneMuted ? "text-red-300" : "text-emerald-300"}`}>{configuration.microphoneMuted ? "Muted" : "Live"}</strong></div><div className="col-span-2"><span className="text-zinc-500">Program transport</span><strong className={`block capitalize ${transport === "live" ? "text-emerald-300" : transport === "error" ? "text-red-300" : "text-zinc-300"}`}>{transport === "live" ? "Live to Broadcast" : transport === "unavailable" ? "Provider not configured" : transport}</strong></div></div>{directive && <p className="mt-3 border-t border-zinc-800 pt-3 text-[11px] leading-5 text-zinc-400">Adaptive target: {directive.width}×{directive.height} · {directive.fps} fps · {directive.videoBitrateKbps} kbps · {directive.reason}</p>}{configuration.captureMode === "screen" && !stream && <p className="mt-3 rounded-lg bg-amber-500/10 p-2 text-[11px] text-amber-200">Screen capture requires a local tap on Start preview for privacy.</p>}</section>
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-black">Local recovery</h2><p className="mt-1 text-[11px] text-zinc-500">{segments.length} segment{segments.length === 1 ? "" : "s"} · {(totalRecoveryBytes / 1_048_576).toFixed(1)} MB stored on this device</p></div><Button size="sm" variant="ghost" aria-label="Refresh recovery segments" onClick={() => void refreshSegments()}><RefreshCw className="h-4 w-4"/></Button></div><div className="mt-3 space-y-2">{segments.slice(0, 8).map((segment) => <div key={segment.id} className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-black p-2.5"><div className="min-w-0 flex-1"><div className="truncate text-xs font-bold">{new Date(segment.createdAt).toLocaleString()}</div><div className="text-[10px] text-zinc-500">{Math.round(segment.durationMs / 1000)} sec · {(segment.bytes / 1_048_576).toFixed(1)} MB</div></div><button aria-label="Download recovery segment" onClick={() => { const url = URL.createObjectURL(segment.blob); const link = document.createElement("a"); link.href = url; link.download = `creativesos-recovery-${segment.createdAt.replace(/[:.]/g, "-")}.webm`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1_000); }} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-900 hover:text-white"><Download className="h-4 w-4"/></button><button aria-label="Delete recovery segment" onClick={async () => { await deleteRecoverySegment(segment.id); await refreshSegments(); }} className="rounded-lg p-2 text-zinc-400 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="h-4 w-4"/></button></div>)}{!segments.length && <p className="rounded-xl border border-dashed border-zinc-800 p-4 text-center text-xs text-zinc-600">Recovery segments appear while the director sets this camera live.</p>}</div></section>
      </>}
      <p role="status" className="px-2 text-center text-xs leading-5 text-zinc-500">{message}</p>
      <p className="px-2 pb-4 text-center text-[10px] leading-4 text-zinc-700">Field media is room-scoped and encrypted in transit. The device can publish but cannot watch the studio or other cameras.</p>
    </div>
  </main>;
}
