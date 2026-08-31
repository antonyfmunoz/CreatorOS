import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { evaluateCompositionFrame, type CutCompositionManifest } from "@shared/cut-studio-production";
import { sanitizeCutStudioSvg } from "@shared/cut-studio-svg";
import { parseCutThreePrimitiveStyle, renderCutThreePrimitiveSvg } from "@shared/cut-studio-three";
import { validateCutStudioLottie } from "@shared/cut-studio-lottie";
import { validateCutStudioRiveBytes } from "@shared/cut-studio-rive";
import type { AnimationItem } from "lottie-web";
import type { Rive as RiveInstance } from "@rive-app/canvas-lite";

type Layer = CutCompositionManifest["layers"][number];
type FrameState = ReturnType<typeof evaluateCompositionFrame>[number];

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
  const host = useRef<HTMLDivElement | null>(null);
  const animation = useRef<AnimationItem | null>(null);
  const bounds = useRef<{ inPoint: number; outPoint: number } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setError("");
    animation.current?.destroy(); animation.current = null; bounds.current = null;
    if (!layer.assetId || !host.current) return () => controller.abort();
    void (async () => {
      try {
        const response = await fetch(`/api/assets/${encodeURIComponent(layer.assetId!)}/stream`, { credentials: "include", signal: controller.signal });
        if (!response.ok) throw new Error("Private Lottie media is unavailable");
        const validated = validateCutStudioLottie(await response.json() as unknown);
        const lottie = (await import("lottie-web/build/player/lottie_light")).default;
        if (!active || !host.current) return;
        bounds.current = { inPoint: validated.inPoint, outPoint: validated.outPoint };
        const instance = lottie.loadAnimation({ container: host.current, renderer: "svg", loop: false, autoplay: false, animationData: validated.animationData });
        animation.current = instance;
        instance.addEventListener("DOMLoaded", () => {
          const available = Math.max(1, validated.outPoint - validated.inPoint);
          const local = Math.max(0, frame - layer.from + layer.sourceStartFrame) % available;
          instance.goToAndStop(validated.inPoint + local, true);
        });
      } catch (caught) {
        if (active && !(caught instanceof DOMException && caught.name === "AbortError")) setError(caught instanceof Error ? caught.message : "Lottie preview failed");
      }
    })();
    return () => { active = false; controller.abort(); animation.current?.destroy(); animation.current = null; };
  }, [layer.assetId]);
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
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const animation = useRef<RiveInstance | null>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const scrub = (instance: RiveInstance) => {
    const firstAnimation = instance.animationNames[0];
    if (firstAnimation) instance.scrub(firstAnimation, Math.max(0, frame - layer.from + layer.sourceStartFrame) / fps);
    instance.drawFrame();
  };
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setError("");
    setLoaded(false);
    animation.current?.cleanup(); animation.current = null;
    if (!layer.assetId || !canvas.current) return () => controller.abort();
    void (async () => {
      try {
        const response = await fetch(`/api/assets/${encodeURIComponent(layer.assetId!)}/stream`, { credentials: "include", signal: controller.signal });
        if (!response.ok) throw new Error("Private Rive media is unavailable");
        const buffer = await response.arrayBuffer();
        validateCutStudioRiveBytes(buffer);
        const { Rive, RuntimeLoader } = await import("@rive-app/canvas-lite");
        if (!active || !canvas.current) return;
        RuntimeLoader.setWasmUrl("/api/runtime-assets/rive-2.41.0.wasm");
        RuntimeLoader.setWasmFallbackUrl(null);
        let instance: RiveInstance;
        instance = new Rive({
          buffer,
          canvas: canvas.current,
          autoplay: false,
          autoBind: false,
          enableRiveAssetCDN: false,
          shouldDisableRiveListeners: true,
          automaticallyHandleEvents: false,
          onLoad: () => {
            if (!active) return;
            const firstAnimation = instance.animationNames[0];
            if (firstAnimation) instance.play(firstAnimation);
            instance.resizeDrawingSurfaceToCanvas(1);
            requestAnimationFrame(() => {
              if (!active) return;
              if (firstAnimation) instance.pause(firstAnimation);
              scrub(instance);
              requestAnimationFrame(() => { if (active) setLoaded(true); });
            });
          },
          onLoadError: () => { if (active) setError("The Rive animation could not be decoded"); },
        });
        animation.current = instance;
      } catch (caught) {
        if (active && !(caught instanceof DOMException && caught.name === "AbortError")) setError(caught instanceof Error ? caught.message : "Rive preview failed");
      }
    })();
    return () => { active = false; controller.abort(); animation.current?.cleanup(); animation.current = null; };
  }, [layer.assetId]);
  useEffect(() => { if (animation.current) scrub(animation.current); }, [frame, fps, layer.from, layer.sourceStartFrame]);
  if (error) return <div className="grid h-full w-full place-items-center border border-dashed border-rose-800 px-2 text-center text-[8px] text-rose-300">{error}</div>;
  return <canvas ref={canvas} width={640} height={360} data-rive-loaded={loaded ? "true" : "false"} aria-label={`${layer.name} Rive preview`} className="h-full w-full"/>;
}

function PreviewLayer({ layer, state, frame, fps }: { layer: Layer; state: FrameState; frame: number; fps: number }) {
  const visual = effectStyles(state);
  const style: CSSProperties = {
    left: `${state.x * 100}%`, top: `${state.y * 100}%`, width: `${layer.width * 100}%`, height: `${layer.height * 100}%`, opacity: state.opacity,
    transform: `${state.perspective > 0 ? `perspective(${state.perspective}px) ` : ""}translate(${-layer.anchorX * 100}%, ${-layer.anchorY * 100}%) rotateX(${state.rotationX}deg) rotateY(${state.rotationY}deg) rotateZ(${state.rotation}deg) scale(${state.scale})`,
    transformOrigin: `${layer.anchorX * 100}% ${layer.anchorY * 100}%`, transformStyle: "preserve-3d", mixBlendMode: layer.blendMode.replace("_", "-") as CSSProperties["mixBlendMode"], filter: visual.filter, ...revealStyle(state),
  };
  let content = null;
  if (layer.kind === "text" || layer.kind === "caption") content = <div className="h-full w-full overflow-hidden rounded px-2 py-1 font-bold" style={{ color: String(layer.style.color ?? "#ffffff"), background: layer.style.backgroundColor ? colorWithOpacity(layer.style.backgroundColor, layer.style.backgroundOpacity) : "transparent", fontFamily: typeof layer.style.fontFamily === "string" ? `${layer.style.fontFamily}, sans-serif` : undefined, fontSize: `${Math.max(8, Math.min(42, Number(layer.style.fontSize ?? 48) / 3))}px` }}>{layer.text}</div>;
  else if (layer.kind === "shape") content = <div className="h-full w-full" style={{ background: String(layer.style.fill ?? layer.style.backgroundColor ?? "#1d9bf0"), borderRadius: `${Math.max(0, Math.min(100, Number(layer.style.borderRadius ?? 0)))}%` }}/>;
  else if (layer.kind === "image" && layer.assetId) content = <img alt={layer.name} src={`/api/assets/${encodeURIComponent(layer.assetId)}/stream`} className="h-full w-full object-cover"/>;
  else if (layer.kind === "video" && layer.assetId) content = <video aria-label={layer.name} src={`/api/assets/${encodeURIComponent(layer.assetId)}/stream`} muted playsInline preload="metadata" className="h-full w-full object-cover"/>;
  else if (layer.kind === "svg" || layer.kind === "path") content = <VectorLayer layer={layer}/>;
  else if (layer.kind === "three") content = <ThreePrimitiveLayer layer={layer}/>;
  else if (layer.kind === "lottie") content = <LottieLayer layer={layer} frame={frame}/>;
  else if (layer.kind === "data") content = <div className="grid h-full w-full place-items-center rounded border border-[#1d9bf0]/50 bg-[#1d9bf0]/15 px-2 text-center text-[8px] font-bold text-[#1d9bf0]">{layer.text ?? layer.name}</div>;
  else if (layer.kind === "rive") content = <RiveLayer layer={layer} frame={frame} fps={fps}/>;
  if (!content) return null;
  return <div className="absolute" data-layer-kind={layer.kind} data-layer-id={layer.id} style={style}>{content}{visual.overlay && <div className="pointer-events-none absolute inset-0" style={visual.overlay}/>}</div>;
}

export function CutStudioCompositionPreview({ manifest }: { manifest: CutCompositionManifest }) {
  const [frame, setFrame] = useState(Math.min(manifest.durationInFrames - 1, Math.max(0, manifest.layers.find((layer) => layer.kind === "text")?.from ?? 0) + 6));
  const evaluated = useMemo(() => evaluateCompositionFrame(manifest, frame), [manifest, frame]);
  return <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-2" aria-label="Deterministic composition preview">
    <div className="relative aspect-video overflow-hidden rounded-md" style={{ background: manifest.background }}>{evaluated.map((state) => <PreviewLayer key={state.id} state={state} frame={frame} fps={manifest.fps} layer={manifest.layers.find((layer) => layer.id === state.id)!}/>)}</div>
    <label className="mt-2 block text-[10px] text-zinc-500">Frame {frame + 1} / {manifest.durationInFrames}<input aria-label="Preview frame" className="mt-1 w-full accent-[#1d9bf0]" type="range" min={0} max={manifest.durationInFrames - 1} value={frame} onChange={(event) => setFrame(Number(event.target.value))}/></label>
  </div>;
}
