import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, Copy, KeyRound, Link2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CutCompositionManifest, CutGenerativeWorkflow } from "@shared/cut-studio-production";

type CompositionLayer = CutCompositionManifest["layers"][number];
type WorkflowNode = CutGenerativeWorkflow["nodes"][number];
type WorkflowInput = WorkflowNode["inputs"][number];
type ParameterValue = string | number | boolean | null;
type CompositionAsset = { id: string; assetId: string; name: string; duration: number; mediaKind: "video" | "audio" | "image" };

const field = "mt-1 w-full rounded-lg border border-zinc-700 bg-black px-2.5 py-2 text-xs text-white outline-none focus:border-[#1d9bf0]";
const compactField = "w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[10px] text-zinc-200 outline-none focus:border-[#1d9bf0]";
const layerKinds = ["video", "audio", "image", "text", "shape", "svg", "path", "rive", "three", "data"] as const;
const blendModes: CompositionLayer["blendMode"][] = ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color_dodge", "color_burn", "difference", "exclusion"];
const transitionKinds = ["none", "fade", "slide", "wipe", "zoom", "flip", "clock_wipe", "iris", "custom_mask"] as const;
const effectKinds = ["blur", "drop_shadow", "glow", "grain", "noise", "vignette", "color_matrix", "chroma_key", "mask", "displacement", "motion_blur", "light_leak"] as const;
const animationProperties = ["x", "y", "scale", "rotation", "rotationX", "rotationY", "perspective", "opacity", "volume", "blur", "brightness", "saturation"] as const;
const workflowOperations = [
  "text_to_image", "image_to_image", "inpaint_image", "outpaint_image", "remove_background", "relight_image", "upscale_image", "product_placement",
  "text_to_video", "image_to_video", "first_last_frame", "video_to_video", "extend_video", "motion_transfer", "lip_sync", "talking_avatar", "inpaint_video", "relight_video", "upscale_video",
  "text_to_speech", "voice_clone", "music_generation", "sound_effect_generation", "audio_cleanup", "audio_separation",
] as const;
const inputSlots = ["start_frame", "end_frame", "reference_image", "reference_video", "motion_video", "source_video", "source_audio", "mask", "character", "product", "style"] as const;

function effectParameters(kind: typeof effectKinds[number]): Record<string, string | number | boolean | null> {
  if (kind === "blur") return { radius: 6 };
  if (kind === "motion_blur") return { radius: 2 };
  if (kind === "drop_shadow") return { x: 4, y: 6, blur: 10, color: "#000000" };
  if (kind === "glow") return { radius: 16, color: "#1d9bf0" };
  if (kind === "color_matrix") return { brightness: 1, contrast: 1, saturation: 1 };
  return { amount: .5 };
}

function replaceAt<T>(items: T[], index: number, value: T) {
  return items.map((item, itemIndex) => itemIndex === index ? value : item);
}

function defaultLayer(kind: typeof layerKinds[number], manifest: CutCompositionManifest, assets: CompositionAsset[]): CompositionLayer {
  const id = `${kind}_${crypto.randomUUID().slice(0, 8)}`;
  const style: CompositionLayer["style"] = kind === "shape" ? { fill: "#1d9bf0", borderRadius: 12 } : kind === "text" ? { color: "#ffffff", fontSize: 64, backgroundColor: "#000000", backgroundOpacity: .5 } : {};
  const media = assets.find((asset) => asset.mediaKind === kind);
  const sourceAssetId = media?.assetId ?? manifest.layers.find((layer) => layer.kind === kind && layer.assetId)?.assetId;
  const base: CompositionLayer = {
    id, kind, name: `${kind[0].toUpperCase()}${kind.slice(1)} layer`, from: 0, durationInFrames: Math.min(manifest.durationInFrames, manifest.fps * 5), sourceStartFrame: 0,
    x: kind === "video" ? 0 : .5, y: kind === "video" ? 0 : .5, width: kind === "video" ? 1 : kind === "text" ? .7 : .35, height: kind === "video" ? 1 : kind === "text" ? .2 : .35, opacity: 1, rotation: 0, volume: 1,
    anchorX: .5, anchorY: .5, rotationX: 0, rotationY: 0, perspective: 0, blendMode: "normal" as const,
    style,
    dataBindings: {}, effects: [], animations: [],
  };
  if (["text", "svg", "path"].includes(kind)) return { ...base, text: kind === "text" ? "New title" : kind === "svg" ? "<svg viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"50\" r=\"40\"/></svg>" : "M 0 50 L 100 50" };
  if (sourceAssetId) return { ...base, assetId: sourceAssetId };
  return base;
}

function numberValue(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function CompositionAuthoringControls({ composition, assets, busy, onChange, onSave }: {
  composition: { id: string; manifest: CutCompositionManifest };
  assets: CompositionAsset[];
  busy: boolean;
  onChange: (manifest: CutCompositionManifest) => void;
  onSave: () => void;
}) {
  const manifest = composition.manifest;
  const [selectedId, setSelectedId] = useState(manifest.layers.find((layer) => layer.kind === "text")?.id ?? manifest.layers[0]?.id ?? "");
  const [newKind, setNewKind] = useState<typeof layerKinds[number]>("text");
  const [keyframeProperty, setKeyframeProperty] = useState<typeof animationProperties[number]>("opacity");
  const [keyframeFrame, setKeyframeFrame] = useState(0);
  const [keyframeValue, setKeyframeValue] = useState(1);
  const selectedIndex = Math.max(0, manifest.layers.findIndex((layer) => layer.id === selectedId));
  const selected = manifest.layers[selectedIndex];
  const addableKinds = layerKinds.filter((kind) => !["video", "audio"].includes(kind) || assets.some((asset) => asset.mediaKind === kind));

  const updateLayer = (update: (layer: CompositionLayer) => CompositionLayer) => {
    if (!selected) return;
    const nextLayer = update(selected);
    const boundTextParameter = nextLayer.dataBindings.text;
    const parameters = boundTextParameter && nextLayer.text !== selected.text
      ? manifest.parameters.map((parameter) => parameter.key === boundTextParameter ? { ...parameter, defaultValue: nextLayer.text ?? "" } : parameter)
      : manifest.parameters;
    onChange({ ...manifest, parameters, layers: replaceAt(manifest.layers, selectedIndex, nextLayer) });
  };
  const addLayer = () => {
    const layer = defaultLayer(newKind, manifest, assets);
    onChange({ ...manifest, layers: [...manifest.layers, layer] });
    setSelectedId(layer.id);
  };
  const duplicateLayer = () => {
    if (!selected) return;
    const copy = { ...structuredClone(selected), id: `${selected.kind}_${crypto.randomUUID().slice(0, 8)}`, name: `${selected.name} copy` };
    onChange({ ...manifest, layers: [...manifest.layers.slice(0, selectedIndex + 1), copy, ...manifest.layers.slice(selectedIndex + 1)] });
    setSelectedId(copy.id);
  };
  const deleteLayer = () => {
    if (!selected || manifest.layers.length === 1) return;
    const next = manifest.layers.filter((layer) => layer.id !== selected.id);
    onChange({ ...manifest, layers: next });
    setSelectedId(next[Math.min(selectedIndex, next.length - 1)]?.id ?? "");
  };
  const moveLayer = (direction: -1 | 1) => {
    if (!selected) return;
    const target = selectedIndex + direction;
    if (target < 0 || target >= manifest.layers.length) return;
    const next = [...manifest.layers];
    [next[selectedIndex], next[target]] = [next[target], next[selectedIndex]];
    onChange({ ...manifest, layers: next });
  };
  const addKeyframe = () => updateLayer((layer) => {
    const boundedFrame = Math.max(0, Math.min(layer.durationInFrames - 1, Math.round(keyframeFrame)));
    const existing = layer.animations.find((animation) => animation.property === keyframeProperty);
    const keyframes = [...(existing?.keyframes ?? []).filter((item) => item.frame !== boundedFrame), { frame: boundedFrame, value: keyframeValue, easing: "ease_in_out" as const }].sort((left, right) => left.frame - right.frame);
    return { ...layer, animations: existing ? layer.animations.map((animation) => animation.property === keyframeProperty ? { ...animation, keyframes } : animation) : [...layer.animations, { property: keyframeProperty, keyframes }] };
  });
  const toggleEffect = (effectId: string) => updateLayer((layer) => ({ ...layer, effects: layer.effects.map((item) => item.id === effectId ? { ...item, enabled: !item.enabled } : item) }));
  const removeEffect = (effectId: string) => updateLayer((layer) => ({ ...layer, effects: layer.effects.filter((item) => item.id !== effectId) }));

  return <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3" aria-label="Composition authoring controls">
    <div className="flex items-end gap-2"><label className="min-w-0 flex-1 text-[10px] text-zinc-500">Add layer<select aria-label="New layer kind" className={field} value={newKind} onChange={(event) => setNewKind(event.target.value as typeof newKind)}>{addableKinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></label><Button size="sm" variant="outline" onClick={addLayer} disabled={busy || manifest.layers.length >= 500}><Plus className="h-3.5 w-3.5"/><span className="sr-only">Add layer</span></Button></div>
    <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2"><select aria-label="Selected layer" className={compactField} value={selected?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)}>{manifest.layers.map((layer, index) => <option key={layer.id} value={layer.id}>{index + 1}. {layer.name} · {layer.kind}</option>)}</select><div className="flex gap-1"><button aria-label="Move layer up" className="rounded border border-zinc-800 p-1.5 text-zinc-400 disabled:opacity-30" disabled={selectedIndex === 0} onClick={() => moveLayer(-1)}><ArrowUp className="h-3.5 w-3.5"/></button><button aria-label="Move layer down" className="rounded border border-zinc-800 p-1.5 text-zinc-400 disabled:opacity-30" disabled={selectedIndex >= manifest.layers.length - 1} onClick={() => moveLayer(1)}><ArrowDown className="h-3.5 w-3.5"/></button><button aria-label="Duplicate layer" className="rounded border border-zinc-800 p-1.5 text-zinc-400" onClick={duplicateLayer}><Copy className="h-3.5 w-3.5"/></button><button aria-label="Delete layer" className="rounded border border-zinc-800 p-1.5 text-rose-400 disabled:opacity-30" disabled={manifest.layers.length === 1} onClick={deleteLayer}><Trash2 className="h-3.5 w-3.5"/></button></div></div>
    {selected && <div className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-2"><label className="text-[10px] text-zinc-500">Layer name<input aria-label="Layer name" className={field} value={selected.name} onChange={(event) => updateLayer((layer) => ({ ...layer, name: event.target.value }))}/></label>{["text", "caption", "svg", "path"].includes(selected.kind) ? <label className="text-[10px] text-zinc-500">Content<input aria-label="Layer content" className={field} value={selected.text ?? ""} onChange={(event) => updateLayer((layer) => ({ ...layer, text: event.target.value }))}/></label> : <label className="text-[10px] text-zinc-500">Blend<select aria-label="Layer blend mode" className={field} value={selected.blendMode} onChange={(event) => updateLayer((layer) => ({ ...layer, blendMode: event.target.value as CompositionLayer["blendMode"] }))}>{blendModes.map((mode) => <option key={mode}>{mode}</option>)}</select></label>}</div>
      {["video", "audio", "image"].includes(selected.kind) && <label className="block text-[10px] text-zinc-500">Project media<select aria-label="Layer media asset" className={field} value={selected.assetId ?? ""} onChange={(event) => updateLayer((layer) => ({ ...layer, assetId: event.target.value }))}>{assets.filter((asset) => asset.mediaKind === selected.kind).map((asset) => <option key={asset.id} value={asset.assetId}>{asset.name} · {asset.duration.toFixed(1)}s</option>)}</select></label>}
      <div className="grid grid-cols-4 gap-2">{([['Start','from',0,manifest.durationInFrames - 1,1],['Frames','durationInFrames',1,manifest.durationInFrames - selected.from,1],['X','x',-4,4,.01],['Y','y',-4,4,.01],['Width','width',.01,8,.01],['Height','height',.01,8,.01],['Opacity','opacity',0,1,.01],['Rotation','rotation',-3600,3600,1],['Rotate X','rotationX',-3600,3600,1],['Rotate Y','rotationY',-3600,3600,1],['Perspective','perspective',0,10000,10]] as const).map(([label,key,min,max,step]) => <label key={key} className="text-[9px] text-zinc-600">{label}<input aria-label={`Layer ${label.toLowerCase()}`} className={compactField} type="number" min={min} max={max} step={step} value={selected[key]} onChange={(event) => updateLayer((layer) => ({ ...layer, [key]: Math.max(min, Math.min(max, numberValue(event.target.value, layer[key]))) }))}/></label>)}</div>
      {(selected.kind === "text" || selected.kind === "caption") && <div className="grid grid-cols-2 gap-2"><label className="text-[10px] text-zinc-500">Text color<input aria-label="Layer text color" type="color" className={`${field} h-9 p-1`} value={String(selected.style.color ?? "#ffffff")} onChange={(event) => updateLayer((layer) => ({ ...layer, style: { ...layer.style, color: event.target.value } }))}/></label><label className="text-[10px] text-zinc-500">Font size<input aria-label="Layer font size" className={field} type="number" min={8} max={400} value={Number(selected.style.fontSize ?? 48)} onChange={(event) => updateLayer((layer) => ({ ...layer, style: { ...layer.style, fontSize: numberValue(event.target.value, 48) } }))}/></label></div>}
      {selected.kind === "shape" && <label className="block text-[10px] text-zinc-500">Fill color<input aria-label="Layer fill color" type="color" className={`${field} h-9 p-1`} value={String(selected.style.fill ?? "#1d9bf0")} onChange={(event) => updateLayer((layer) => ({ ...layer, style: { ...layer.style, fill: event.target.value } }))}/></label>}
      <div className="grid grid-cols-2 gap-2">{(["enter", "exit"] as const).map((edge) => <div key={edge} className="rounded-lg border border-zinc-800 p-2"><p className="text-[9px] font-bold uppercase text-zinc-500">{edge}</p><div className="mt-1 grid grid-cols-2 gap-1"><select aria-label={`${edge} transition`} className={compactField} value={selected[edge]?.kind ?? "none"} onChange={(event) => updateLayer((layer) => ({ ...layer, [edge]: event.target.value === "none" ? undefined : { kind: event.target.value as Exclude<typeof transitionKinds[number], "none">, durationInFrames: Math.min(12, layer.durationInFrames), easing: "ease_in_out", direction: "right", ...(event.target.value === "custom_mask" && assets.some((asset) => asset.mediaKind === "image") ? { maskAssetId: assets.find((asset) => asset.mediaKind === "image")!.assetId } : {}) } }))}>{transitionKinds.map((kind) => <option key={kind} disabled={kind === "custom_mask" && !assets.some((asset) => asset.mediaKind === "image")}>{kind}</option>)}</select><input aria-label={`${edge} transition frames`} className={compactField} type="number" min={0} max={selected.durationInFrames} value={selected[edge]?.durationInFrames ?? 0} disabled={!selected[edge]} onChange={(event) => updateLayer((layer) => layer[edge] ? { ...layer, [edge]: { ...layer[edge]!, durationInFrames: Math.max(0, Math.min(layer.durationInFrames, numberValue(event.target.value, 0))) } } : layer)}/><select aria-label={`${edge} transition direction`} className={`${compactField} col-span-2`} disabled={!selected[edge]} value={selected[edge]?.direction ?? "right"} onChange={(event) => updateLayer((layer) => layer[edge] ? { ...layer, [edge]: { ...layer[edge]!, direction: event.target.value as NonNullable<CompositionLayer[typeof edge]>["direction"] } } : layer)}>{["left", "right", "up", "down", "clockwise", "counterclockwise"].map((direction) => <option key={direction}>{direction}</option>)}</select>{selected[edge]?.kind === "custom_mask" && <select aria-label={`${edge} transition mask`} className={`${compactField} col-span-2`} value={selected[edge]?.maskAssetId ?? ""} onChange={(event) => updateLayer((layer) => layer[edge] ? { ...layer, [edge]: { ...layer[edge]!, maskAssetId: event.target.value } } : layer)}>{assets.filter((asset) => asset.mediaKind === "image").map((asset) => <option key={asset.id} value={asset.assetId}>{asset.name}</option>)}</select>}</div></div>)}</div>
      <div className="rounded-lg border border-zinc-800 p-2"><div className="flex items-center gap-2"><KeyRound className="h-3.5 w-3.5 text-[#1d9bf0]"/><p className="text-[10px] font-bold">Keyframes</p></div><div className="mt-2 grid grid-cols-3 gap-1"><select aria-label="Keyframe property" className={compactField} value={keyframeProperty} onChange={(event) => setKeyframeProperty(event.target.value as typeof keyframeProperty)}>{animationProperties.map((property) => <option key={property}>{property}</option>)}</select><input aria-label="Keyframe frame" className={compactField} type="number" min={0} max={selected.durationInFrames - 1} value={keyframeFrame} onChange={(event) => setKeyframeFrame(numberValue(event.target.value, 0))}/><input aria-label="Keyframe value" className={compactField} type="number" step="0.01" value={keyframeValue} onChange={(event) => setKeyframeValue(numberValue(event.target.value, 0))}/></div><Button className="mt-2 w-full" size="sm" variant="ghost" onClick={addKeyframe}><Plus className="mr-1 h-3.5 w-3.5"/>Add or replace keyframe</Button><div className="mt-1 flex flex-wrap gap-1">{selected.animations.flatMap((animation) => animation.keyframes.map((keyframe) => <button key={`${animation.property}:${keyframe.frame}`} className="rounded bg-zinc-900 px-1.5 py-1 text-[8px] text-zinc-400" title="Remove keyframe" onClick={() => updateLayer((layer) => ({ ...layer, animations: layer.animations.map((item) => item.property === animation.property ? { ...item, keyframes: item.keyframes.filter((candidate) => candidate.frame !== keyframe.frame) } : item).filter((item) => item.keyframes.length) }))}>{animation.property}@{keyframe.frame}: {String(keyframe.value)} <X className="inline h-2.5 w-2.5"/></button>))}</div></div>
      <div className="rounded-lg border border-zinc-800 p-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold">Effects</p>
          <select aria-label="Add layer effect" className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-[9px] text-zinc-300" defaultValue="" onChange={(event) => {
            const kind = event.target.value as typeof effectKinds[number];
            if (kind) updateLayer((layer) => {
              const mask = kind === "mask" ? assets.find((asset) => asset.mediaKind === "image") : undefined;
              const nextEffect = { id: `${kind}_${crypto.randomUUID().slice(0, 8)}`, kind, enabled: true, parameters: { ...effectParameters(kind), ...(mask ? { maskAssetId: mask.assetId } : {}) } };
              return { ...layer, effects: [...layer.effects, nextEffect] };
            });
            event.currentTarget.value = "";
          }}><option value="">Add effect…</option>{effectKinds.map((kind) => <option key={kind} value={kind} disabled={kind === "mask" && !assets.some((asset) => asset.mediaKind === "image")}>{kind}</option>)}</select>
        </div>
        <div className="mt-2 space-y-1">{selected.effects.map((effect) => <div key={effect.id} className="grid grid-cols-[minmax(0,1fr)_5rem_auto] items-center gap-1 rounded bg-zinc-900 p-1"><button className={effect.enabled ? "truncate text-left text-[9px] text-[#1d9bf0]" : "truncate text-left text-[9px] text-zinc-600"} onClick={() => toggleEffect(effect.id)}>{effect.kind.replaceAll("_", " ")}</button>{effect.kind === "mask" ? <select aria-label="mask effect asset" className={compactField} value={String(effect.parameters.maskAssetId ?? "")} onChange={(event) => updateLayer((layer) => ({ ...layer, effects: layer.effects.map((candidate) => candidate.id === effect.id ? { ...candidate, parameters: { ...candidate.parameters, maskAssetId: event.target.value } } : candidate) }))}>{assets.filter((asset) => asset.mediaKind === "image").map((asset) => <option key={asset.id} value={asset.assetId}>{asset.name}</option>)}</select> : <input aria-label={`${effect.kind} amount`} className={compactField} type="number" min={0} max={80} step={.05} value={Number(effect.parameters.amount ?? effect.parameters.radius ?? effect.parameters.blur ?? effect.parameters.intensity ?? .5)} onChange={(event) => updateLayer((layer) => ({ ...layer, effects: layer.effects.map((candidate) => candidate.id === effect.id ? { ...candidate, parameters: { ...candidate.parameters, ["radius" in candidate.parameters ? "radius" : "blur" in candidate.parameters ? "blur" : "intensity" in candidate.parameters ? "intensity" : "amount"]: Math.max(0, Math.min(80, numberValue(event.target.value, .5))) } } : candidate) }))}/>}<button aria-label={`Remove ${effect.kind}`} className="p-1 text-rose-400" onClick={() => removeEffect(effect.id)}><Trash2 className="h-3 w-3"/></button></div>)}</div>
        {selected.effects.length > 0 && <p className="mt-1 text-[8px] text-zinc-700">Click the effect name to enable or disable it.</p>}
      </div>
    </div>}
    <Button className="mt-3 w-full" size="sm" variant="outline" disabled={busy} onClick={onSave}><Check className="mr-1 h-3.5 w-3.5"/>Save composition</Button>
  </div>;
}

export function CompositionVariantBatchControls({ composition, busy, onCreate }: {
  composition: { id: string; name: string; manifest: CutCompositionManifest };
  busy: boolean;
  onCreate: (variants: Array<{ name: string; parameterValues: Record<string, ParameterValue> }>) => void;
}) {
  const defaults = () => Object.fromEntries(composition.manifest.parameters.map((parameter) => [parameter.key, parameter.defaultValue])) as Record<string, ParameterValue>;
  const [variants, setVariants] = useState(() => [1, 2, 3].map((number) => ({ name: `${composition.name} · Variant ${number}`, parameterValues: defaults() })));
  const updateValue = (rowIndex: number, key: string, value: ParameterValue) => setVariants((current) => current.map((row, index) => index === rowIndex ? { ...row, parameterValues: { ...row.parameterValues, [key]: value } } : row));
  if (!composition.manifest.parameters.length) return <p className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-[9px] text-zinc-600">Add a typed composition parameter before creating batch variants.</p>;
  return <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3" aria-label="Composition variant batch">
    <div><p className="text-[10px] font-bold">Parameterized batch</p><p className="mt-1 text-[9px] text-zinc-600">Create reproducible composition variants without hand-editing each timeline.</p></div>
    <div className="mt-2 space-y-2">{variants.map((variant, rowIndex) => <div key={rowIndex} className="rounded-lg border border-zinc-800 p-2"><input aria-label={`Variant ${rowIndex + 1} name`} className={compactField} value={variant.name} onChange={(event) => setVariants((current) => current.map((row, index) => index === rowIndex ? { ...row, name: event.target.value } : row))}/><div className="mt-1 grid grid-cols-2 gap-1">{composition.manifest.parameters.map((parameter) => <label key={parameter.key} className="text-[9px] text-zinc-600">{parameter.label}{parameter.type === "boolean" ? <select aria-label={`Variant ${rowIndex + 1} ${parameter.label}`} className={compactField} value={String(variant.parameterValues[parameter.key])} onChange={(event) => updateValue(rowIndex, parameter.key, event.target.value === "true")}><option value="true">True</option><option value="false">False</option></select> : parameter.type === "select" ? <select aria-label={`Variant ${rowIndex + 1} ${parameter.label}`} className={compactField} value={String(variant.parameterValues[parameter.key] ?? "")} onChange={(event) => updateValue(rowIndex, parameter.key, event.target.value)}>{parameter.options?.map((option) => <option key={option}>{option}</option>)}</select> : <input aria-label={`Variant ${rowIndex + 1} ${parameter.label}`} className={compactField} type={parameter.type === "number" ? "number" : parameter.type === "color" ? "color" : "text"} min={parameter.minimum} max={parameter.maximum} value={parameter.type === "number" ? Number(variant.parameterValues[parameter.key] ?? 0) : String(variant.parameterValues[parameter.key] ?? "")} onChange={(event) => updateValue(rowIndex, parameter.key, parameter.type === "number" ? numberValue(event.target.value, 0) : event.target.value)}/>}</label>)}</div></div>)}</div>
    <div className="mt-2 grid grid-cols-2 gap-2"><Button size="sm" variant="ghost" disabled={variants.length >= 20} onClick={() => setVariants((current) => [...current, { name: `${composition.name} · Variant ${current.length + 1}`, parameterValues: defaults() }])}><Plus className="mr-1 h-3.5 w-3.5"/>Variant</Button><Button size="sm" variant="outline" disabled={busy || variants.some((variant) => !variant.name.trim())} onClick={() => onCreate(variants)}><Copy className="mr-1 h-3.5 w-3.5"/>Create {variants.length}</Button></div>
  </div>;
}

function defaultOutput(operation: WorkflowNode["operation"]) {
  if (["text_to_speech", "voice_clone", "music_generation", "sound_effect_generation", "audio_cleanup", "audio_separation"].includes(operation)) return "audio";
  if (["text_to_image", "image_to_image", "inpaint_image", "outpaint_image", "remove_background", "relight_image", "upscale_image", "product_placement"].includes(operation)) return "image";
  return "video";
}

function wouldCreateCycle(workflow: CutGenerativeWorkflow, sourceId: string, targetId: string) {
  const dependencies = new Map(workflow.nodes.map((node) => [node.id, node.inputs.flatMap((input) => input.sourceNodeId ? [input.sourceNodeId] : [])]));
  const seen = new Set<string>();
  const dependsOnTarget = (nodeId: string): boolean => nodeId === targetId || (!seen.has(nodeId) && (seen.add(nodeId), (dependencies.get(nodeId) ?? []).some(dependsOnTarget)));
  return dependsOnTarget(sourceId);
}

export function WorkflowAuthoringEditor({ workflow, revision, busy, onChange, onSave }: {
  workflow: CutGenerativeWorkflow;
  revision: number;
  busy: boolean;
  onChange: (workflow: CutGenerativeWorkflow) => void;
  onSave: () => void;
}) {
  const [newOperation, setNewOperation] = useState<WorkflowNode["operation"]>("text_to_image");
  const [sourceId, setSourceId] = useState(workflow.nodes[0]?.id ?? "");
  const [targetId, setTargetId] = useState(workflow.nodes[1]?.id ?? workflow.nodes[0]?.id ?? "");
  const [slot, setSlot] = useState<WorkflowInput["slot"]>("reference_image");
  const nodes = useMemo(() => new Map(workflow.nodes.map((node) => [node.id, node])), [workflow.nodes]);
  const width = Math.max(700, ...workflow.nodes.map((node) => node.position.x + 230));
  const height = Math.max(180, ...workflow.nodes.map((node) => node.position.y + 210));
  const updateNode = (nodeId: string, update: (node: WorkflowNode) => WorkflowNode) => onChange({ ...workflow, nodes: workflow.nodes.map((node) => node.id === nodeId ? update(node) : node) });
  const addNode = () => {
    const id = `${newOperation}_${crypto.randomUUID().slice(0, 8)}`;
    const x = Math.max(0, ...workflow.nodes.map((node) => node.position.x + 260));
    const node: WorkflowNode = { id, operation: newOperation, provider: "auto", model: "auto", prompt: "", parameters: {}, inputs: [], position: { x, y: 0 } };
    onChange({ ...workflow, nodes: [...workflow.nodes, node] });
    setTargetId(id);
  };
  const removeNode = (nodeId: string) => {
    if (workflow.nodes.length === 1) return;
    const nextNodes = workflow.nodes.filter((node) => node.id !== nodeId).map((node) => ({ ...node, inputs: node.inputs.filter((input) => input.sourceNodeId !== nodeId) }));
    const retainedOutputs = workflow.outputs.filter((output) => output.nodeId !== nodeId);
    const nextOutputs = retainedOutputs.length ? retainedOutputs : [{ nodeId: nextNodes.at(-1)!.id, output: defaultOutput(nextNodes.at(-1)!.operation), label: "Primary output" }];
    onChange({ ...workflow, nodes: nextNodes, outputs: nextOutputs });
    setSourceId(nextNodes[0].id); setTargetId(nextNodes.at(-1)!.id);
  };
  const connect = () => {
    if (!sourceId || !targetId || sourceId === targetId || wouldCreateCycle(workflow, sourceId, targetId)) return;
    updateNode(targetId, (node) => ({ ...node, inputs: [...node.inputs.filter((input) => input.slot !== slot), { slot, sourceNodeId: sourceId, sourceOutput: defaultOutput(nodes.get(sourceId)!.operation), assetIds: [] }] }));
  };

  return <div className="rounded-xl border border-zinc-800 bg-black p-3" aria-label={`Workflow ${workflow.name}`}>
    <div className="grid grid-cols-2 gap-2"><label className="text-[10px] text-zinc-500">Workflow name<input aria-label="Workflow name" className={field} value={workflow.name} onChange={(event) => onChange({ ...workflow, name: event.target.value })}/></label><label className="text-[10px] text-zinc-500">Description<input aria-label="Workflow description" className={field} value={workflow.description} onChange={(event) => onChange({ ...workflow, description: event.target.value })}/></label></div>
    <p className="mt-2 text-[9px] text-zinc-600">{workflow.nodes.length} nodes · {workflow.outputs.length} outputs · revision {revision}</p>
    <div className="mt-3 rounded-lg border border-zinc-800 p-2"><div className="flex items-center gap-2"><Link2 className="h-3.5 w-3.5 text-[#1d9bf0]"/><p className="text-[10px] font-bold">Typed connection</p></div><div className="mt-2 grid grid-cols-3 gap-1"><select aria-label="Connection source" className={compactField} value={sourceId} onChange={(event) => setSourceId(event.target.value)}>{workflow.nodes.map((node) => <option key={node.id} value={node.id}>{node.id}</option>)}</select><select aria-label="Connection target" className={compactField} value={targetId} onChange={(event) => setTargetId(event.target.value)}>{workflow.nodes.map((node) => <option key={node.id} value={node.id}>{node.id}</option>)}</select><select aria-label="Connection slot" className={compactField} value={slot} onChange={(event) => setSlot(event.target.value as WorkflowInput["slot"])}>{inputSlots.map((item) => <option key={item}>{item}</option>)}</select></div><Button className="mt-2 w-full" size="sm" variant="ghost" disabled={workflow.nodes.length < 2 || sourceId === targetId || wouldCreateCycle(workflow, sourceId, targetId)} onClick={connect}><Link2 className="mr-1 h-3.5 w-3.5"/>Connect nodes</Button></div>
    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><label className="min-w-0 text-[10px] text-zinc-500">New capability<select aria-label="New workflow operation" className={field} value={newOperation} onChange={(event) => setNewOperation(event.target.value as WorkflowNode["operation"])}>{workflowOperations.map((operation) => <option key={operation} value={operation}>{operation.replaceAll("_", " ")}</option>)}</select></label><Button className="w-full scroll-mt-20 sm:w-auto" size="sm" variant="outline" disabled={workflow.nodes.length >= 200} onClick={addNode}><Plus className="mr-1 h-3.5 w-3.5"/>Node</Button></div>
    <div className="mt-2 rounded-lg border border-zinc-800 p-2"><p className="text-[10px] font-bold">Published outputs</p>{workflow.outputs.map((output, index) => <div key={`${output.nodeId}:${index}`} className="mt-1 grid grid-cols-[1fr_1fr_1fr_auto] gap-1"><select aria-label={`Output ${index + 1} node`} className={compactField} value={output.nodeId} onChange={(event) => onChange({ ...workflow, outputs: replaceAt(workflow.outputs, index, { ...output, nodeId: event.target.value }) })}>{workflow.nodes.map((node) => <option key={node.id}>{node.id}</option>)}</select><input aria-label={`Output ${index + 1} type`} className={compactField} value={output.output} onChange={(event) => onChange({ ...workflow, outputs: replaceAt(workflow.outputs, index, { ...output, output: event.target.value }) })}/><input aria-label={`Output ${index + 1} label`} className={compactField} value={output.label} onChange={(event) => onChange({ ...workflow, outputs: replaceAt(workflow.outputs, index, { ...output, label: event.target.value }) })}/><button aria-label={`Delete output ${index + 1}`} className="rounded border border-zinc-800 p-1 text-rose-400 disabled:opacity-30" disabled={workflow.outputs.length === 1} onClick={() => onChange({ ...workflow, outputs: workflow.outputs.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 className="h-3 w-3"/></button></div>)}<Button className="mt-2 w-full" size="sm" variant="ghost" disabled={workflow.outputs.length >= 50} onClick={() => { const node = workflow.nodes.at(-1)!; onChange({ ...workflow, outputs: [...workflow.outputs, { nodeId: node.id, output: defaultOutput(node.operation), label: `Output ${workflow.outputs.length + 1}` }] }); }}><Plus className="mr-1 h-3.5 w-3.5"/>Output</Button></div>
    <Button className="mt-3 w-full scroll-mt-20" size="sm" variant="outline" disabled={busy} onClick={onSave}><Check className="mr-1 h-3.5 w-3.5"/>Save graph</Button>
    <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950"><div className="relative" style={{ width, height }}>
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">{workflow.nodes.flatMap((node) => node.inputs.flatMap((input, inputIndex) => { const source = input.sourceNodeId ? nodes.get(input.sourceNodeId) : null; return source ? [<path key={`${node.id}:${inputIndex}`} d={`M ${source.position.x + 210} ${source.position.y + 72} C ${source.position.x + 245} ${source.position.y + 72}, ${node.position.x - 35} ${node.position.y + 72}, ${node.position.x} ${node.position.y + 72}`} fill="none" stroke="#1d9bf0" strokeOpacity=".65" strokeWidth="2"/>] : []; }))}</svg>
      {workflow.nodes.map((node) => <div key={node.id} className="absolute w-[210px] rounded-lg border border-[#1d9bf0]/45 bg-black p-2 shadow-lg" style={{ left: node.position.x, top: node.position.y }}><div className="flex items-center justify-between gap-1"><select aria-label={`${node.id} operation`} className="min-w-0 flex-1 bg-transparent text-[9px] font-black uppercase text-[#1d9bf0] outline-none" value={node.operation} onChange={(event) => updateNode(node.id, (value) => ({ ...value, operation: event.target.value as WorkflowNode["operation"] }))}>{workflowOperations.map((operation) => <option key={operation} value={operation}>{operation.replaceAll("_", " ")}</option>)}</select><button aria-label={`Delete ${node.id}`} className="text-zinc-600 hover:text-rose-400 disabled:opacity-30" disabled={workflow.nodes.length === 1} onClick={() => removeNode(node.id)}><Trash2 className="h-3 w-3"/></button></div><textarea aria-label={`${node.id} prompt`} className="mt-1 h-12 w-full resize-none rounded border border-zinc-800 bg-zinc-950 p-1.5 text-[9px] leading-3 text-zinc-300 outline-none focus:border-[#1d9bf0]" value={node.prompt} onChange={(event) => updateNode(node.id, (value) => ({ ...value, prompt: event.target.value }))}/><div className="mt-1 grid grid-cols-2 gap-1"><input aria-label={`${node.id} provider`} className={compactField} value={node.provider} onChange={(event) => updateNode(node.id, (value) => ({ ...value, provider: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") }))}/><input aria-label={`${node.id} model`} className={compactField} value={node.model} onChange={(event) => updateNode(node.id, (value) => ({ ...value, model: event.target.value.toLowerCase().replace(/[^a-z0-9._/:-]/g, "") }))}/></div><div className="mt-1 grid grid-cols-2 gap-1"><input aria-label={`${node.id} x position`} className={compactField} type="number" value={node.position.x} onChange={(event) => updateNode(node.id, (value) => ({ ...value, position: { ...value.position, x: numberValue(event.target.value, value.position.x) } }))}/><input aria-label={`${node.id} y position`} className={compactField} type="number" value={node.position.y} onChange={(event) => updateNode(node.id, (value) => ({ ...value, position: { ...value.position, y: numberValue(event.target.value, value.position.y) } }))}/></div><div className="mt-1 flex flex-wrap gap-1">{node.inputs.filter((input) => input.sourceNodeId).map((input, index) => <button key={`${input.slot}:${index}`} title="Remove connection" className="rounded bg-[#1d9bf0]/10 px-1 py-0.5 text-[8px] text-[#1d9bf0]" onClick={() => updateNode(node.id, (value) => ({ ...value, inputs: value.inputs.filter((candidate) => candidate !== input) }))}>{input.slot} ← {input.sourceNodeId} <X className="inline h-2 w-2"/></button>)}</div></div>)}
    </div></div>
  </div>;
}
