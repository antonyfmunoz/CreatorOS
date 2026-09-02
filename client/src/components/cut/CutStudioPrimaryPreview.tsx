import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cutPrimaryPreviewAt } from "@shared/cut-primary-preview";
import { cutPrimaryTimeline } from "@shared/cut-primary-timeline";
import type { CutEdl } from "@shared/cut-studio";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type Media = { id: string; assetId: string; name: string };
type Props = { projectId: string; sourceAssetId: string; edl: CutEdl; media: Media[]; onOpen?: () => void };

function PrimaryMedia({ url, time, speed, gain, opacity, playing, audio, onReady, onError }: {
  url: string; time: number; speed: number; gain: number; opacity: number; playing: boolean; audio: AudioContext | null;
  onReady: (ready: boolean) => void; onError: (message: string) => void;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const graph = useRef<{ source: MediaElementAudioSourceNode; gain: GainNode } | null>(null);
  useEffect(() => {
    if (!audio || !ref.current) return;
    if (!graph.current) graph.current = { source: audio.createMediaElementSource(ref.current), gain: audio.createGain() };
    graph.current.source.connect(graph.current.gain); graph.current.gain.connect(audio.destination);
    return () => { graph.current?.source.disconnect(); graph.current?.gain.disconnect(); };
  }, [audio]);
  useEffect(() => { if (graph.current) graph.current.gain.gain.value = gain; }, [audio, gain]);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const sync = () => {
      if (!Number.isFinite(element.duration)) return;
      element.playbackRate = speed;
      if (Math.abs(element.currentTime - time) > (playing ? .12 : .008)) element.currentTime = time;
      if (playing && element.paused) void element.play().catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        onError("Playback could not start. Pause, then play again to grant browser playback permission.");
      });
      else if (!playing) element.pause();
    };
    sync(); element.addEventListener("loadedmetadata", sync);
    return () => element.removeEventListener("loadedmetadata", sync);
  }, [playing, speed, time, onError]);
  return <video ref={ref} aria-label="Primary sequence video" crossOrigin="anonymous" playsInline preload="auto" muted={!audio} src={url}
    className="h-full w-full object-contain" style={{ opacity }} onCanPlay={() => onReady(true)} onWaiting={() => onReady(false)}
    onError={() => onError("This private source is unavailable. Check your project access or media format.")}/>;
}

function PrimaryPlayer({ projectId, sourceAssetId, edl, media }: Props) {
  const plan = useMemo(() => {
    try { return { ...cutPrimaryTimeline(edl), error: "" }; }
    catch (error) { return { duration: 0, segments: [], error: error instanceof Error ? error.message : "Timeline is unavailable" }; }
  }, [edl]);
  const [frame, setFrame] = useState(0), [playing, setPlaying] = useState(false), [ready, setReady] = useState(false);
  const [error, setError] = useState(""), [muted, setMuted] = useState(false);
  const [audio, setAudio] = useState<AudioContext | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const fps = 30, frames = Math.max(1, Math.ceil(plan.duration * fps));
  const state = plan.error ? null : cutPrimaryPreviewAt(edl, frame / fps);
  const active = state?.clip ? media.find((item) => item.assetId === (state.clip!.assetId ?? sourceAssetId)) : undefined;
  const clipKey = state?.clip ? `${state.clip.id ?? "clip"}:${active?.id}:${state.clip.timelineStart}:${state.clip.start}` : "gap";
  const reportError = useCallback((message: string) => { setError(message); setPlaying(false); }, []);
  useEffect(() => { setReady(false); setError(""); }, [clipKey]);
  useEffect(() => { setFrame((value) => Math.min(value, frames - 1)); }, [frames]);
  useEffect(() => () => { void audioRef.current?.close().catch(() => undefined); }, []);
  useEffect(() => {
    if (!playing || plan.error || error || (state?.clip && (!active || !ready))) return;
    let handle = 0, previous = performance.now(), remainder = 0;
    const tick = (now: number) => {
      remainder += (now - previous) * fps / 1000; previous = now;
      const advance = Math.floor(remainder); remainder -= advance;
      if (advance) setFrame((current) => {
        const next = current + advance;
        if (next >= frames) { setPlaying(false); return frames - 1; }
        return next;
      });
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing, plan.error, error, clipKey, Boolean(active), ready, frames]);
  const seek = (next: number) => { setPlaying(false); setFrame(Math.max(0, Math.min(frames - 1, next))); };
  const play = async () => {
    if (playing) return setPlaying(false);
    try {
      if (!audioRef.current) { audioRef.current = new AudioContext(); setAudio(audioRef.current); }
      await audioRef.current.resume();
      setError(""); if (frame >= frames - 1) setFrame(0); setPlaying(true);
    } catch { reportError("Audio playback is unavailable in this browser."); }
  };
  if (plan.error) return <p role="alert">{plan.error}</p>;
  if (edl.clips.some((clip) => (clip.track ?? "v1") === "v1" && clip.transition && clip.transition !== "cut")) return <p role="status">Render a preview for this sequence's transitions. Live primary preview currently supports hard cuts.</p>;
  return <div role="region" aria-label="Primary sequence player" data-preview-frame={frame} data-preview-state={playing ? "playing" : "paused"}>
    <div className="aspect-video overflow-hidden rounded-xl bg-black" aria-label="Primary sequence canvas">
      {state?.clip && active ? <PrimaryMedia key={clipKey} url={`/api/cut/projects/${encodeURIComponent(projectId)}/media-library/${encodeURIComponent(active.id)}/media-file`} time={state.sourceTime} speed={state.speed} gain={muted ? 0 : state.gain} opacity={state.opacity} playing={playing} audio={audio} onReady={setReady} onError={reportError}/> : <span className="sr-only">{state?.clip ? "Source unavailable" : "Black gap"}</span>}
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={() => void play()}>{playing ? "Pause sequence" : "Play sequence"}</Button>
      <Button size="sm" variant="outline" aria-label="Previous sequence frame" onClick={() => seek(frame - 1)}>←</Button>
      <label className="min-w-24 flex-1 text-xs text-zinc-400">{(frame / fps).toFixed(2)} / {plan.duration.toFixed(2)} s
        <input aria-label="Sequence frame" className="w-full accent-[#1d9bf0]" type="range" min={0} max={frames - 1} value={frame} onChange={(event) => seek(Number(event.target.value))}/>
      </label>
      <Button size="sm" variant="outline" aria-label="Next sequence frame" onClick={() => seek(frame + 1)}>→</Button>
      <Button size="sm" variant="outline" onClick={() => setMuted((value) => !value)}>{muted ? "Unmute sequence" : "Mute sequence"}</Button>
    </div>
    <p role="status" className="mt-2 text-xs text-zinc-400">{error || (state?.clip && !active ? "Source unavailable in this project's private library." : playing && state?.clip && !ready ? "Buffering private source…" : "Primary cuts, gaps, speed and source audio. Titles, layered tracks, color/effects and other audio tracks require a rendered preview.")}</p>
  </div>;
}

export function CutStudioPrimaryPreview(props: Props) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={(value) => { if (value) props.onOpen?.(); setOpen(value); }}>
    <DialogTrigger asChild><Button size="sm" variant="outline">Preview primary sequence</Button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] max-w-4xl overflow-y-auto border-zinc-800 bg-zinc-950 text-white">
      <DialogHeader><DialogTitle>Primary sequence preview</DialogTitle><DialogDescription>Review the current draft's primary edit timing using private project media. This is not the final composited output.</DialogDescription></DialogHeader>
      <DialogClose asChild><Button size="sm" variant="outline" className="justify-self-end">Close sequence</Button></DialogClose>
      {open && <PrimaryPlayer {...props}/>}
    </DialogContent>
  </Dialog>;
}
