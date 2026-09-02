import { createContext, forwardRef, useContext, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { evaluateCompositionFrame, type CutCompositionManifest } from "@shared/cut-studio-production";
import { sanitizeCutStudioSvg } from "@shared/cut-studio-svg";
import { parseCutThreePrimitiveStyle, renderCutThreePrimitiveSvg } from "@shared/cut-studio-three";
import { validateCutStudioLottie } from "@shared/cut-studio-lottie";
import { validateCutStudioRiveBytes } from "@shared/cut-studio-rive";
import { cutPlayerFrame, cutPlayerGain, cutPlayerRate } from "@shared/cut-studio-player";
import type { AnimationItem } from "lottie-web";
import type { Rive as RiveInstance } from "@rive-app/canvas-lite";
import { cutTextStyles, resolveCutTextLayout } from "@shared/cut-text-layout";
import defaultCutFontUrl from "@shared/assets/cut-fonts/NotoSans-Variable.ttf?url";
import { createCutRivePreviewController } from "@/lib/cut-rive-preview";
import { CutStudioTextPreview } from "./CutStudioTextPreview";
import { createCutPreviewReadiness } from "@/lib/cut-preview-readiness";
import { CutPreviewReadinessContext, useCutPreviewResource } from "./CutStudioPreviewReadiness";

type Layer = CutCompositionManifest["layers"][number];
type FrameState = ReturnType<typeof evaluateCompositionFrame>[number];
const AssetUrlContext = createContext((assetId: string) => `/api/assets/${encodeURIComponent(assetId)}/stream`);
const FontsReadyContext = createContext(false);

function CompositionFonts({ manifest, children }: { manifest: CutCompositionManifest; children: ReactNode }) {
  const assetUrl = useContext(AssetUrlContext);
  const identity = JSON.stringify(manifest.fonts.map((font) => [font.family, font.weight, font.style, font.assetId ? assetUrl(font.assetId) : ""]));
  const readiness = useCutPreviewResource("Composition fonts", identity);
  const [fontError, setFontError] = useState("");
  const [fontReady, setFontReady] = useState(false);
  useEffect(() => {
    let active = true;
    setFontError("");
    setFontReady(false);
    readiness("pending");
    const faces: FontFace[] = [new FontFace("CutStudio Noto Sans", `url("${defaultCutFontUrl}")`, { weight: "100 900" })];
    for (const font of manifest.fonts) {
      if (!font.assetId) continue;
      const face = new FontFace(JSON.stringify(font.family), `url("${assetUrl(font.assetId)}")`, { weight: String(font.weight), style: font.style });
      faces.push(face);
    }
    void Promise.all(faces.map(async (face) => { const loaded = await face.load(); if (active) document.fonts.add(loaded); })).then(() => { if (active) { setFontReady(true); readiness("ready"); } }).catch(() => { if (active) { const message = "A composition font is unavailable; preview font fidelity is not ready."; setFontError(message); readiness("error", message); } });
    return () => { active = false; for (const face of faces) document.fonts.delete(face); };
  }, [assetUrl, identity, readiness]);
  return <FontsReadyContext.Provider value={fontReady && !fontError}><p role="status" data-composition-fonts={fontError ? "error" : fontReady ? "ready" : "loading"} className={fontError ? "mb-2 text-[10px] text-amber-300" : "sr-only"}>{fontError || (fontReady ? "Composition fonts ready" : "Loading composition fonts")}</p>{children}</FontsReadyContext.Provider>;
}

function safeSvg(source: string) {
  try { return sanitizeCutStudioSvg(source); } catch { return null; }
}

function amount(effect: FrameState["effects"][number], key: string, fallback: number) {
  const value = effect.parameters[key] ?? effect.parameters.amount ?? effect.parameters.intensity;
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function effectStyles(state: FrameState) {
  const filters = [`blur(${Math.min(80, state.blur)}px)`, `brightness(${Math.min(8, state.brightness)})`, `saturate(${Math.min(8, state.saturation)})`];
  let overlay: CSSProperties | null = null;
  for (const effect of state.effects) {
    if (effect.kind === "blur" || effect.kind === "motion_blur") filters.push(`blur(${Math.max(0, Math.min(80, amount(effect, "radius", effect.kind === "motion_blur" ? 2 : 6)))}px)`);
    if (effect.kind === "glow") filters.push(`drop-shadow(0 0 ${Math.max(0, Math.min(80, amount(effect, "radius", 16)))}px ${String(effect.parameters.color ?? "#1d9bf0")})`);
    if (effect.kind === "drop_shadow") filters.push(`drop-shadow(${amount(effect, "x", 4)}px ${amount(effect, "y", 6)}px ${Math.max(0, amount(effect, "blur", 10))}px ${String(effect.parameters.color ?? "#000000")})`);
    if (effect.kind === "color_matrix") filters.push(`contrast(${Math.max(0, amount(effect, "contrast", 1))}) brightness(${Math.max(0, amount(effect, "brightness", 1))}) saturate(${Math.max(0, amount(effect, "saturation", 1))})`);
    if (effect.kind === "vignette") overlay = { background: `radial-gradient(circle, transparent ${Math.max(10, 70 - amount(effect, "amount", .5) * 45)}%, rgba(0,0,0,${Math.max(0, Math.min(1, amount(effect, "amount", .5)))}) 100%)` };
    if (effect.kind === "grain" || effect.kind === "noise") overlay = { backgroundImage: "repeating-radial-gradient(circle at 17% 31%, rgba(255,255,255,.13) 0 1px, rgba(0,0,0,.12) 1px 2px, transparent 2px 4px)", opacity: Math.max(0, Math.min(.55, amount(effect, "amount", .18))), mixBlendMode: "overlay" };
    if (effect.kind === "light_leak") overlay = { background: `radial-gradient(circle at 8% 12%, rgba(255,110,45,${Math.max(0, Math.min(.9, amount(effect, "amount", .35)))}), transparent 55%)`, mixBlendMode: "screen" };
  }
  return { filter: filters.join(" "), overlay };
}

function revealStyle(state: FrameState): CSSProperties {
  const reveal = state.reveal;
  if (!reveal) return {};
  const hidden = Math.max(0, Math.min(100, (1 - reveal.progress) * 100));
  if (reveal.kind === "iris") return { clipPath: `circle(${Math.max(0, reveal.progress) * 72}% at 50% 50%)` };
  if (reveal.kind === "clock_wipe") return { WebkitMaskImage: `conic-gradient(#000 ${Math.max(0, reveal.progress) * 360}deg, transparent 0deg)`, maskImage: `conic-gradient(#000 ${Math.max(0, reveal.progress) * 360}deg, transparent 0deg)` };
  if (reveal.kind === "wipe") {
    if (reveal.direction === "right") return { clipPath: `inset(0 0 0 ${hidden}%)` };
    if (reveal.direction === "up") return { clipPath: `inset(${hidden}% 0 0 0)` };
    if (reveal.direction === "down") return { clipPath: `inset(0 0 ${hidden}% 0)` };
    return { clipPath: `inset(0 ${hidden}% 0 0)` };
  }
  return {};
}

function colorWithOpacity(value: unknown, opacity: unknown) {
  const color = typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
  const alpha = typeof opacity === "number" && Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1;
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function VectorLayer({ layer }: { layer: Layer }) {
  if (layer.kind === "path") return <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d={layer.text} fill={String(layer.style.fill ?? "none")} stroke={String(layer.style.stroke ?? layer.style.color ?? "#ffffff")} strokeWidth={Number(layer.style.strokeWidth ?? 2)}/></svg>;
  const sanitized = useMemo(() => safeSvg(layer.text ?? ""), [layer.text]);
  if (!sanitized) return <div className="grid h-full w-full place-items-center border border-dashed border-zinc-500 text-[8px] text-zinc-400">Invalid or unsupported SVG</div>;
  return <img alt="" className="h-full w-full object-contain" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(sanitized)}`}/>;
}

function ThreePrimitiveLayer({ layer }: { layer: Layer }) {
  const svg = useMemo(() => {
    try { return renderCutThreePrimitiveSvg(parseCutThreePrimitiveStyle(layer.style)); } catch { return null; }
  }, [layer.style]);
  if (!svg) return <div className="grid h-full w-full place-items-center border border-dashed border-zinc-500 text-[8px] text-zinc-400">Invalid 3D primitive</div>;
  return <img alt={`${String(layer.style.primitive ?? "cube")} primitive`} className="h-full w-full object-contain" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}/>;
}

function LottieLayer({ layer, frame }: { layer: Layer; frame: number }) {
  const assetUrl = useContext(AssetUrlContext);
  const readiness = useCutPreviewResource(`${layer.name} animation`, layer.assetId ? assetUrl(layer.assetId) : "missing");
  const host = useRef<HTMLDivElement | null>(null);
  const animation = useRef<AnimationItem | null>(null);
  const bounds = useRef<{ inPoint: number; outPoint: number } | null>(null);
  const latestFrame = useRef(0);
  latestFrame.current = Math.max(0, frame - layer.from + layer.sourceStartFrame);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setError("");
    animation.current?.destroy(); animation.current = null; bounds.current = null;
    if (!layer.assetId || !host.current) { readiness("error", "The Lottie preview has no private source."); return () => controller.abort(); }
    void (async () => {
      try {
        const response = await fetch(assetUrl(layer.assetId!), { credentials: "include", signal: controller.signal });
        if (!response.ok) throw new Error("Private Lottie media is unavailable");
        const validated = validateCutStudioLottie(await response.json() as unknown);
        const lottie = (await import("lottie-web/build/player/lottie_light")).default;
        if (!active || !host.current) return;
        bounds.current = { inPoint: validated.inPoint, outPoint: validated.outPoint };
        const instance = lottie.loadAnimation({ container: host.current, renderer: "svg", loop: false, autoplay: false, animationData: validated.animationData });
        animation.current = instance;
        instance.addEventListener("DOMLoaded", () => {
          if (!active) return;
          const available = Math.max(1, validated.outPoint - validated.inPoint);
          const local = latestFrame.current % available;
          instance.goToAndStop(validated.inPoint + local, true);
          readiness("ready");
        });
        instance.addEventListener("data_failed", () => { if (active) { setError("Lottie preview failed"); readiness("error", "Lottie preview failed"); } });
      } catch (caught) {
        if (active && !(caught instanceof DOMException && caught.name === "AbortError")) { const message = caught instanceof Error ? caught.message : "Lottie preview failed"; setError(message); readiness("error", message); }
      }
    })();
    return () => { active = false; controller.abort(); animation.current?.destroy(); animation.current = null; };
  }, [assetUrl, layer.assetId, readiness]);
  useEffect(() => {
    if (!animation.current || !bounds.current) return;
    const available = Math.max(1, bounds.current.outPoint - bounds.current.inPoint);
    const local = Math.max(0, frame - layer.from + layer.sourceStartFrame) % available;
    animation.current.goToAndStop(bounds.current.inPoint + local, true);
  }, [frame, layer.from, layer.sourceStartFrame]);
  if (error) return <div className="grid h-full w-full place-items-center border border-dashed border-rose-800 px-2 text-center text-[8px] text-rose-300">{error}</div>;
  return <div ref={host} aria-label={`${layer.name} Lottie preview`} className="h-full w-full overflow-hidden"/>;
}

function RiveLayer({ layer, frame, fps }: { layer: Layer; frame: number; fps: number }) {
  const assetUrl = useContext(AssetUrlContext);
  const readiness = useCutPreviewResource(`${layer.name} animation`, layer.assetId ? assetUrl(layer.assetId) : "missing");
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const animation = useRef<RiveInstance | null>(null);
  const preview = useRef<ReturnType<typeof createCutRivePreviewController> | null>(null);
  const latestSeconds = useRef(0);
  latestSeconds.current = Math.max(0, frame - layer.from + layer.sourceStartFrame) / fps;
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setError("");
    setLoaded(false);
    animation.current?.cleanup(); animation.current = null;
    if (!layer.assetId || !canvas.current) { readiness("error", "The Rive preview has no private source."); return () => controller.abort(); }
    const playback = createCutRivePreviewController({
      instance: () => animation.current,
      seconds: () => latestSeconds.current,
      loaded: () => { setLoaded(true); readiness("ready"); },
      failed: () => { const message = "The Rive animation could not be prepared for preview"; setError(message); readiness("error", message); },
      schedule: (callback) => requestAnimationFrame(callback),
      cancel: (id) => cancelAnimationFrame(id),
      defer: (callback) => queueMicrotask(callback),
    });
    preview.current = playback;
    void (async () => {
      try {
        const response = await fetch(assetUrl(layer.assetId!), { credentials: "include", signal: controller.signal });
        if (!response.ok) throw new Error("Private Rive media is unavailable");
        const buffer = await response.arrayBuffer();
        validateCutStudioRiveBytes(buffer);
        const { Rive, RuntimeLoader } = await import("@rive-app/canvas-lite");
        if (!active || !canvas.current) return;
        RuntimeLoader.setWasmUrl("/api/runtime-assets/rive-2.41.0.wasm");
        RuntimeLoader.setWasmFallbackUrl(null);
        const instance = new Rive({
          buffer,
          canvas: canvas.current,
          autoplay: false,
          autoBind: false,
          enableRiveAssetCDN: false,
          shouldDisableRiveListeners: true,
          automaticallyHandleEvents: false,
          onLoad: playback.load,
          onLoadError: playback.fail,
        });
        animation.current = instance;
      } catch (caught) {
        if (active && !(caught instanceof DOMException && caught.name === "AbortError")) { const message = caught instanceof Error ? caught.message : "Rive preview failed"; setError(message); readiness("error", message); }
      }
    })();
    return () => { active = false; playback.dispose(); preview.current = null; controller.abort(); animation.current?.cleanup(); animation.current = null; };
  }, [assetUrl, layer.assetId, readiness]);
  useEffect(() => { preview.current?.seek(); }, [frame, fps, layer.from, layer.sourceStartFrame]);
  if (error) return <div className="grid h-full w-full place-items-center border border-dashed border-rose-800 px-2 text-center text-[8px] text-rose-300">{error}</div>;
  return <canvas ref={canvas} width={640} height={360} data-rive-loaded={loaded ? "true" : "false"} aria-label={`${layer.name} Rive preview`} className="h-full w-full"/>;
}

type MediaPlayback = { playing: boolean; playbackRate: number; muted: boolean; masterVolume: number; audioContext: AudioContext | null };

function ImageLayer({ layer }: { layer: Layer }) {
  const assetUrl = useContext(AssetUrlContext);
  const readiness = useCutPreviewResource(`${layer.name} image`, assetUrl(layer.assetId!));
  const [failed, setFailed] = useState(false);
  return <><img alt={layer.name} src={assetUrl(layer.assetId!)} className="h-full w-full object-cover" onLoad={() => { setFailed(false); readiness("ready"); }} onError={() => { setFailed(true); readiness("error", "This private image could not be displayed."); }}/>{failed && <span role="status" className="absolute inset-0 grid place-items-center bg-zinc-950/90 p-2 text-center text-xs text-amber-300">This private image could not be displayed.</span>}</>;
}

function MediaLayer({ layer, frame, fps, playing, playbackRate, muted, masterVolume, audioContext, volume }: MediaPlayback & { layer: Layer; frame: number; fps: number; volume: number }) {
  const assetUrl = useContext(AssetUrlContext);
  const readiness = useCutPreviewResource(`${layer.name} media`, assetUrl(layer.assetId!));
  const media = useRef<HTMLMediaElement | null>(null);
  const graph = useRef<{ context: AudioContext; source: MediaElementAudioSourceNode; gain: GainNode } | null>(null);
  const [error, setError] = useState("");
  const targetTime = Math.max(0, frame - layer.from + layer.sourceStartFrame) / fps;
  const gain = cutPlayerGain(volume, masterVolume);
  useEffect(() => { const element = media.current; return () => element?.pause(); }, []);
  useEffect(() => {
    const element = media.current;
    if (!element || !audioContext || audioContext.state === "closed") return;
    if (!graph.current) graph.current = { context: audioContext, source: audioContext.createMediaElementSource(element), gain: audioContext.createGain() };
    const nodes = graph.current;
    nodes.source.connect(nodes.gain);
    nodes.gain.connect(audioContext.destination);
    return () => { nodes.source.disconnect(); nodes.gain.disconnect(); };
  }, [audioContext]);
  useEffect(() => {
    if (graph.current) graph.current.gain.gain.value = gain;
    if (media.current) media.current.volume = graph.current ? 1 : Math.min(1, gain);
  }, [audioContext, gain]);
  useEffect(() => {
    const element = media.current;
    if (!element) return;
    element.playbackRate = playbackRate;
    const sync = () => {
      const seekTolerance = playing ? Math.max(.08, 2 / fps) : 1 / (fps * 4);
      // Hold at the last available source sample when a layer outlasts its
      // asset. Seeking past duration otherwise leaves an endless buffer hold.
      const boundedTime = Number.isFinite(element.duration) ? Math.min(targetTime, Math.max(0, element.duration - .001)) : targetTime;
      if (Math.abs(element.currentTime - boundedTime) > seekTolerance) { readiness("pending"); element.currentTime = boundedTime; }
      const atSourceEnd = Number.isFinite(element.duration) && targetTime >= element.duration - .001;
      if (atSourceEnd) element.pause();
      else if (playing && element.paused) void element.play().then(() => setError("")).catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "NotAllowedError") { const message = "Use Retry preview to allow media playback in this browser."; setError(message); readiness("error", message); }
      });
      else if (!playing) element.pause();
    };
    sync();
    element.addEventListener("loadedmetadata", sync);
    return () => element.removeEventListener("loadedmetadata", sync);
  }, [fps, playbackRate, playing, targetTime, readiness]);
  const inspect = () => {
    const element = media.current;
    if (element && !element.error && !element.seeking && (element.readyState >= 3 || (element.ended && element.readyState >= 2))) { setError(""); readiness("ready"); }
  };
  const props = { ref: (element: HTMLMediaElement | null) => { media.current = element; }, "aria-label": layer.name, "data-composition-media": layer.kind, src: assetUrl(layer.assetId!), muted, preload: "auto", onLoadedData: inspect, onCanPlay: inspect, onSeeked: inspect, onEnded: inspect, onSeeking: () => readiness("pending"), onWaiting: () => readiness("pending"), onError: () => { setError("This private media could not be played."); readiness("error", "This private media could not be played."); } };
  return <>{layer.kind === "audio" ? <audio {...props}/> : <video {...props} playsInline className="h-full w-full object-cover"/>}{error && <span role="status" className="absolute inset-0 grid place-items-center bg-zinc-950/90 p-2 text-center text-xs text-amber-300">{error}</span>}</>;
}

function PreviewLayer({ layer, state, frame, fps, canvasWidth, fonts, ...playback }: MediaPlayback & { layer: Layer; state: FrameState; frame: number; fps: number; canvasWidth: number; fonts: CutCompositionManifest["fonts"] }) {
  const assetUrl = useContext(AssetUrlContext);
  const fontsReady = useContext(FontsReadyContext);
  const visual = effectStyles(state);
  const style: CSSProperties = {
    left: `${state.x * 100}%`, top: `${state.y * 100}%`, width: `${layer.width * 100}%`, height: `${layer.height * 100}%`, opacity: state.opacity,
    transform: `${state.perspective > 0 ? `perspective(${state.perspective}px) ` : ""}translate(${-layer.anchorX * 100}%, ${-layer.anchorY * 100}%) rotateX(${state.rotationX}deg) rotateY(${state.rotationY}deg) rotateZ(${state.rotation}deg) scale(${state.scale})`,
    transformOrigin: `${layer.anchorX * 100}% ${layer.anchorY * 100}%`, transformStyle: "preserve-3d", mixBlendMode: layer.blendMode.replace("_", "-") as CSSProperties["mixBlendMode"], filter: visual.filter, ...revealStyle(state),
  };
  let content = null;
  if (layer.kind === "text" || layer.kind === "caption") {
    const font = fonts.find((candidate) => candidate.assetId && candidate.family === layer.style.fontFamily);
    const textStyles = cutTextStyles(resolveCutTextLayout(layer.style, font), canvasWidth, "container", font ? `${JSON.stringify(font.family)}, "CutStudio Noto Sans", sans-serif` : '"CutStudio Noto Sans", sans-serif', String(layer.style.color ?? "#ffffff"), layer.style.backgroundColor ? colorWithOpacity(layer.style.backgroundColor, layer.style.backgroundOpacity) : "transparent");
    content = <CutStudioTextPreview text={layer.text} layout={resolveCutTextLayout(layer.style, font)} styles={{ box: textStyles.box as CSSProperties, content: textStyles.content as CSSProperties }} canvasWidth={canvasWidth} fontsReady={fontsReady}/>;
  }
  else if (layer.kind === "shape") content = <div className="h-full w-full" style={{ background: String(layer.style.fill ?? layer.style.backgroundColor ?? "#1d9bf0"), borderRadius: `${Math.max(0, Math.min(100, Number(layer.style.borderRadius ?? 0)))}%` }}/>;
  else if (layer.kind === "image" && layer.assetId) content = <ImageLayer key={assetUrl(layer.assetId)} layer={layer}/>;
  // Replacing an asset needs a fresh media element/error state and audio graph;
  // reconnecting a graph from the previous source can leave a repaired layer
  // silent or display the old failure after the new private media has loaded.
  else if ((layer.kind === "video" || layer.kind === "audio") && layer.assetId) content = <MediaLayer key={`${layer.kind}:${assetUrl(layer.assetId)}`} layer={layer} frame={frame} fps={fps} volume={state.volume} {...playback}/>;
  else if (layer.kind === "svg" || layer.kind === "path") content = <VectorLayer layer={layer}/>;
  else if (layer.kind === "three") content = <ThreePrimitiveLayer layer={layer}/>;
  else if (layer.kind === "lottie") content = <LottieLayer key={layer.assetId} layer={layer} frame={frame}/>;
  else if (layer.kind === "data") content = <div className="grid h-full w-full place-items-center rounded border border-[#1d9bf0]/50 bg-[#1d9bf0]/15 px-2 text-center text-[8px] font-bold text-[#1d9bf0]">{layer.text ?? layer.name}</div>;
  else if (layer.kind === "rive") content = <RiveLayer key={layer.assetId} layer={layer} frame={frame} fps={fps}/>;
  if (!content) return null;
  return <div className="absolute" data-layer-kind={layer.kind} data-layer-id={layer.id} style={style}>{content}{visual.overlay && <div className="pointer-events-none absolute inset-0" style={visual.overlay}/>}</div>;
}

export type CutStudioCompositionPlayerProps = {
  manifest: CutCompositionManifest;
  autoPlay?: boolean;
  controls?: boolean;
  initialFrame?: number;
  loop?: boolean;
  playbackRate?: number;
  muted?: boolean;
  assetUrlTemplate?: string;
  onFrameChange?: (frame: number) => void;
};

export type CutStudioCompositionPlayerHandle = {
  play(): void;
  pause(): void;
  seekTo(frame: number): void;
  getCurrentFrame(): number;
  isPlaying(): boolean;
  setMuted(muted: boolean): void;
  setPlaybackRate(rate: number): void;
};

export const CutStudioCompositionPlayer = forwardRef<CutStudioCompositionPlayerHandle, CutStudioCompositionPlayerProps>(function CutStudioCompositionPlayer({ manifest, autoPlay = false, controls = true, initialFrame = 0, loop = true, playbackRate = 1, muted: initialMuted = true, assetUrlTemplate = "/api/assets/{assetId}/stream", onFrameChange }, ref) {
  const assetUrl = useMemo(() => {
    const template = /^\/api\/[A-Za-z0-9/{}_-]+$/.test(assetUrlTemplate) && assetUrlTemplate.includes("{assetId}") ? assetUrlTemplate : "/api/assets/{assetId}/stream";
    return (assetId: string) => template.replace("{assetId}", encodeURIComponent(assetId));
  }, [assetUrlTemplate]);
  const boundedInitialFrame = cutPlayerFrame(initialFrame, manifest.durationInFrames);
  const [frame, setFrame] = useState(boundedInitialFrame);
  const [playing, setPlaying] = useState(autoPlay);
  const [readiness] = useState(() => createCutPreviewReadiness());
  const readinessState = useSyncExternalStore(readiness.subscribe, readiness.getSnapshot, readiness.getSnapshot);
  const [retry, setRetry] = useState(0);
  const advancing = playing && readinessState.ready;
  const stateRef = useRef({ frame, playing });
  stateRef.current = { frame, playing };
  const keyboardHelpId = useId();
  const [muted, setMuted] = useState(initialMuted);
  const [masterVolume, setMasterVolume] = useState(1);
  const [speed, setSpeed] = useState(cutPlayerRate(playbackRate));
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const enableAudio = () => {
    if (!audioContextRef.current && typeof AudioContext !== "undefined") {
      audioContextRef.current = new AudioContext();
      setAudioContext(audioContextRef.current);
    }
    if (audioContextRef.current?.state === "suspended") void audioContextRef.current.resume().catch(() => undefined);
  };
  const seekTo = (next: number) => {
    const bounded = cutPlayerFrame(next, manifest.durationInFrames);
    stateRef.current = { frame: bounded, playing: false };
    setPlaying(false); setFrame(bounded);
  };
  const play = () => {
    if (!muted) enableAudio();
    if (stateRef.current.frame === manifest.durationInFrames - 1) { stateRef.current.frame = 0; setFrame(0); }
    stateRef.current.playing = true; setPlaying(true);
  };
  const pause = () => { stateRef.current.playing = false; setPlaying(false); };
  useImperativeHandle(ref, () => ({
    play, pause, seekTo,
    getCurrentFrame: () => stateRef.current.frame,
    isPlaying: () => stateRef.current.playing && readiness.getSnapshot().ready,
    setMuted: (value) => { if (!value) enableAudio(); setMuted(Boolean(value)); },
    setPlaybackRate: (rate) => setSpeed(cutPlayerRate(rate)),
  }));
  useEffect(() => { setSpeed(cutPlayerRate(playbackRate)); }, [playbackRate]);
  useEffect(() => { setMuted(initialMuted); }, [initialMuted]);
  useEffect(() => () => { void audioContextRef.current?.close().catch(() => undefined); audioContextRef.current = null; }, []);
  useEffect(() => {
    setFrame((current) => Math.min(manifest.durationInFrames - 1, Math.max(0, current)));
  }, [manifest.durationInFrames]);
  useEffect(() => {
    if (!advancing) return;
    let requestId = 0;
    let previous = performance.now();
    let remainder = 0;
    const tick = (now: number) => {
      remainder += ((now - previous) * manifest.fps * speed) / 1_000;
      previous = now;
      const advance = Math.floor(remainder);
      if (advance > 0) {
        remainder -= advance;
        setFrame((current) => {
          const next = current + advance;
          if (next < manifest.durationInFrames) return next;
          if (loop) return next % manifest.durationInFrames;
          setPlaying(false);
          return manifest.durationInFrames - 1;
        });
      }
      requestId = requestAnimationFrame(tick);
    };
    requestId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(requestId);
  }, [loop, manifest.durationInFrames, manifest.fps, speed, advancing]);
  useEffect(() => { onFrameChange?.(frame); }, [frame, onFrameChange]);
  const evaluated = useMemo(() => evaluateCompositionFrame(manifest, frame), [manifest, frame]);
  return <AssetUrlContext.Provider value={assetUrl}><CutPreviewReadinessContext.Provider value={readiness}><div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1d9bf0]" role="region" tabIndex={controls ? 0 : undefined} aria-label="CutStudio composition player" aria-describedby={keyboardHelpId} data-player-state={readinessState.errors.length ? "error" : readinessState.pending ? "buffering" : advancing ? "playing" : "paused"} data-play-requested={playing} data-current-frame={frame} onKeyDown={(event) => {
    if (!controls || event.altKey || event.ctrlKey || event.metaKey || (event.target instanceof Element && event.target.closest('input,select,textarea,button,a,[contenteditable="true"]'))) return;
    if (event.key === " ") { event.preventDefault(); if (event.repeat) return; if (stateRef.current.playing) pause(); else play(); }
    else if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); seekTo(stateRef.current.frame + (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 10 : 1)); }
    else if (event.key === "Home" || event.key === "End") { event.preventDefault(); seekTo(event.key === "Home" ? 0 : manifest.durationInFrames - 1); }
  }}>
    <p id={keyboardHelpId} className="sr-only">Focus the player: Space plays or pauses. Left and right step one frame; Shift steps ten. Home and End jump to the first and last frame. Stepping pauses playback.</p>
    <CompositionFonts key={retry} manifest={manifest}><div aria-label="Composition canvas" className="relative overflow-hidden rounded-md" style={{ aspectRatio: `${manifest.width} / ${manifest.height}`, containerType: "inline-size", background: manifest.background }}>{evaluated.map((state) => <PreviewLayer key={state.id} state={state} frame={frame} fps={manifest.fps} canvasWidth={manifest.width} fonts={manifest.fonts} playing={advancing} playbackRate={speed} muted={muted} masterVolume={masterVolume} audioContext={audioContext} layer={manifest.layers.find((layer) => layer.id === state.id)!}/>)}</div></CompositionFonts>
    {!readinessState.ready && <div className="mt-2 flex items-center gap-2 text-[10px] text-amber-200"><p role="status" aria-label="Composition readiness">{readinessState.errors.length ? "Preview paused because an asset could not be prepared." : `Preparing ${readinessState.pending} preview resource${readinessState.pending === 1 ? "" : "s"}; the clock is held.`}</p><button type="button" className="shrink-0 rounded border border-amber-500/40 px-2 py-1" onClick={() => { if (!muted) enableAudio(); setRetry((value) => value + 1); }}>Retry preview</button></div>}
    {controls && <div className="mt-2 flex items-center gap-2">
      <button type="button" aria-label={playing ? "Pause composition" : "Play composition"} className="h-7 rounded border border-zinc-700 px-2 text-[10px] font-bold hover:bg-zinc-900" onClick={() => { if (playing) pause(); else play(); }}>{playing ? "Pause" : "Play"}</button>
      <button type="button" aria-label="Previous composition frame" className="h-7 rounded border border-zinc-700 px-2 text-[10px] hover:bg-zinc-900" onClick={() => seekTo(frame - 1)}>←</button>
      <label className="min-w-0 flex-1 text-[10px] text-zinc-500">Frame {frame + 1} / {manifest.durationInFrames}<input aria-label="Preview frame" className="mt-1 w-full accent-[#1d9bf0]" type="range" min={0} max={manifest.durationInFrames - 1} value={frame} onChange={(event) => seekTo(Number(event.target.value))}/></label>
      <button type="button" aria-label="Next composition frame" className="h-7 rounded border border-zinc-700 px-2 text-[10px] hover:bg-zinc-900" onClick={() => seekTo(frame + 1)}>→</button>
      <button type="button" aria-label="Restart composition" className="h-7 rounded border border-zinc-700 px-2 text-[10px] font-bold hover:bg-zinc-900" onClick={() => { stateRef.current.frame = 0; setFrame(0); }}>Restart</button>
    </div>}
    {controls && <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-zinc-400">
      <button type="button" aria-label={muted ? "Unmute composition" : "Mute composition"} aria-pressed={!muted} className="rounded border border-zinc-700 px-2 py-1" onClick={() => { if (muted) enableAudio(); setMuted((current) => !current); }}>{muted ? "Unmute" : "Mute"}</button>
      <label>Volume <input aria-label="Composition volume" type="range" min="0" max="1" step="0.05" value={masterVolume} onChange={(event) => setMasterVolume(Number(event.target.value))} className="w-20 align-middle accent-[#1d9bf0]"/></label>
      <label>Speed <select aria-label="Composition playback speed" value={speed} onChange={(event) => setSpeed(cutPlayerRate(Number(event.target.value)))} className="rounded border border-zinc-700 bg-zinc-950 px-1 py-1">{[.25, .5, .75, 1, 1.25, 1.5, 2, 4].map((rate) => <option key={rate} value={rate}>{rate}x</option>)}</select></label>
    </div>}
  </div></CutPreviewReadinessContext.Provider></AssetUrlContext.Provider>;
});

export function CutStudioCompositionPreview({ manifest }: { manifest: CutCompositionManifest }) {
  const initialFrame = Math.min(manifest.durationInFrames - 1, Math.max(0, manifest.layers.find((layer) => layer.kind === "text")?.from ?? 0) + 6);
  return <div className="mt-3" aria-label="Deterministic composition preview"><CutStudioCompositionPlayer manifest={manifest} initialFrame={initialFrame}/></div>;
}
