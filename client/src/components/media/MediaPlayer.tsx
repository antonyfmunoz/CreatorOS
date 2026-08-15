import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

type PlaybackKind = "play" | "pause" | "seek" | "progress" | "quality_change" | "rebuffer_start" | "rebuffer_end" | "ended" | "error";
type Access = { url: string; expiresAt: string | null };
type Rendition = { id: string; role: string; mimeType: string; bitrateKbps: number | null; manifestType: string | null };
type Track = { id: string; kind: "captions" | "subtitles" | "chapters" | "transcript"; language: string; label: string; isDefault: boolean; access: Access };
type SessionResponse = {
  session: { id: string };
  rendition: Rendition | null;
  access: Access;
  renditionAccess: Array<{ rendition: Rendition; access: Access }>;
  textTracks: Track[];
};

export type MediaPlayerProps = Omit<React.VideoHTMLAttributes<HTMLVideoElement>, "src"> & {
  assetId?: string | null;
  fallbackSrc: string;
  telemetryContext?: Record<string, unknown>;
};

function bufferedPosition(video: HTMLVideoElement) {
  if (!video.buffered.length) return Math.round(video.currentTime * 1_000);
  return Math.round(video.buffered.end(video.buffered.length - 1) * 1_000);
}

export const MediaPlayer = forwardRef<HTMLVideoElement, MediaPlayerProps>(function MediaPlayer(
  { assetId, fallbackSrc, telemetryContext = {}, onPlay, onPause, onEnded, onError, onSeeking, onWaiting, onPlaying, onTimeUpdate, ...props },
  forwardedRef,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sequence = useRef(0);
  const sessionId = useRef<string | null>(null);
  const lastProgressAt = useRef(0);
  const rebuffering = useRef(false);
  const [source, setSource] = useState(fallbackSrc);
  const [tracks, setTracks] = useState<Track[]>([]);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  useImperativeHandle(forwardedRef, () => videoRef.current as HTMLVideoElement, []);

  const send = (kind: PlaybackKind, metadata: Record<string, unknown> = {}) => {
    const video = videoRef.current;
    const activeSession = sessionId.current;
    if (!video || !activeSession) return;
    sequence.current += 1;
    void fetch(`/api/media/playback/sessions/${activeSession}/events`, {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sequence: sequence.current,
        kind,
        occurredAt: new Date().toISOString(),
        positionMs: Math.max(0, Math.round(video.currentTime * 1_000)),
        bufferedMs: Math.max(0, bufferedPosition(video)),
        bitrateKbps: null,
        metadata,
      }),
    }).catch(() => undefined);
  };

  useEffect(() => {
    let cancelled = false;
    hlsRef.current?.destroy();
    hlsRef.current = null;
    sessionId.current = null;
    sequence.current = 0;
    setTracks([]);
    setSource(fallbackSrc);
    if (!assetId) return;

    const connect = async () => {
      const response = await fetch("/api/media/playback/sessions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, clientSessionId: `web-${crypto.randomUUID()}`, playerVersion: "creativesos-web-v1", metadata: telemetryContext }),
      });
      if (!response.ok) throw new Error("Playback session could not be opened");
      const descriptor = await response.json() as SessionResponse;
      if (cancelled || !videoRef.current) return;
      sessionId.current = descriptor.session.id;
      setTracks(descriptor.textTracks);
      const selected = descriptor.rendition;
      const manifest = selected?.manifestType === "hls" || selected?.mimeType.includes("mpegurl");
      if (!manifest || videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
        setSource(descriptor.access.url);
        return;
      }

      // The light build keeps adaptive playback below the deferred-route budget
      // while retaining the core HLS, worker, quality-switch and error APIs used
      // by this player. Subtitle parsing is supplied by native text tracks.
      const { default: Hls } = await import("hls.js/dist/hls.light.min.mjs");
      if (cancelled || !videoRef.current) return;
      if (!Hls.isSupported()) {
        const progressive = descriptor.renditionAccess.find(({ rendition }) => rendition.role === "video" || rendition.role === "audio");
        setSource(progressive?.access.url ?? fallbackSrc);
        return;
      }
      setSource("");
      const hls = new Hls({ enableWorker: true, backBufferLength: 30, maxBufferLength: 30 });
      hlsRef.current = hls;
      hls.loadSource(descriptor.access.url);
      hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => send("quality_change", { level: data.level }));
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        send("error", { source: "hls", category: data.type, detail: data.details });
        hls.destroy();
        hlsRef.current = null;
        const progressive = descriptor.renditionAccess.find(({ rendition }) => rendition.role === "video" || rendition.role === "audio");
        setSource(progressive?.access.url ?? fallbackSrc);
      });
    };
    void connect().catch(() => { if (!cancelled) setSource(fallbackSrc); });
    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [assetId, fallbackSrc]);

  return (
    <video
      {...props}
      ref={videoRef}
      src={source || undefined}
      onPlay={(event) => { send("play"); onPlay?.(event); }}
      onPause={(event) => { if (!event.currentTarget.ended) send("pause"); onPause?.(event); }}
      onSeeking={(event) => { send("seek"); onSeeking?.(event); }}
      onTimeUpdate={(event) => { const now = Date.now(); if (now - lastProgressAt.current >= 10_000) { lastProgressAt.current = now; send("progress"); } onTimeUpdate?.(event); }}
      onWaiting={(event) => { if (!rebuffering.current) { rebuffering.current = true; send("rebuffer_start"); } onWaiting?.(event); }}
      onPlaying={(event) => { if (rebuffering.current) { rebuffering.current = false; send("rebuffer_end"); } onPlaying?.(event); }}
      onEnded={(event) => { send("ended"); onEnded?.(event); }}
      onError={(event) => { send("error", { source: "element", mediaErrorCode: event.currentTarget.error?.code ?? null }); onError?.(event); }}
    >
      {tracks.filter((track) => track.kind === "captions" || track.kind === "subtitles").map((track) => (
        <track key={track.id} kind={track.kind} src={track.access.url} srcLang={track.language} label={track.label} default={track.isDefault} />
      ))}
    </video>
  );
});
