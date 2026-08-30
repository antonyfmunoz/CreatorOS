import { useEffect, useMemo, useState } from "react";
import { Boxes, Camera, Check, ChevronDown, ChevronUp, Clapperboard, Loader2, Play, Plus, Sparkles, Workflow } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { CompositionAuthoringControls, CompositionVariantBatchControls, WorkflowAuthoringEditor } from "@/components/cut/CutStudioAuthoringEditors";
import { CutStudioCompositionPreview } from "@/components/cut/CutStudioCompositionPreview";
import type { CutEdl } from "@shared/cut-studio";
import { type CutCompositionManifest, type CutGenerativeWorkflow, type CutProductionBrief, type CutShotSpec } from "@shared/cut-studio-production";

type ProjectInput = { id: string; sourceAssetId: string; name: string; duration: number; mediaKind: "video" | "audio"; revision: number };
type ProjectMediaInput = { id: string; assetId: string; name: string; duration: number; mediaKind: "video" | "audio" | "image" };
type CompositionRow = { id: string; name: string; mode: string; manifest: CutCompositionManifest; revision: number };
type PlanRow = { id: string; brief: CutProductionBrief; revision: number };
type ShotRow = { id: string; sequence: number; spec: CutShotSpec; revision: number; status: string; selectedVariantId?: string | null };
type JobRow = { id: string; shotId: string; provider: string; model: string; state: string; detail: string; createdAt: string };
type WorkflowRow = { id: string; workflow: CutGenerativeWorkflow; revision: number };
type ProviderRow = { id: string; label: string; configured: boolean; capabilities: readonly string[] };
type RuntimePayload = {
  compositionRuntime: { declarative: string; isolatedCode: string; networkPolicy: string };
  generationRuntime: { dispatchEnabled: boolean; providers: ProviderRow[] };
  compositions: CompositionRow[];
  plan: PlanRow | null;
  elements: Array<{ id: string; spec: { kind: string; name: string } }>;
  shots: ShotRow[];
  jobs: JobRow[];
  workflows: WorkflowRow[];
  variants: Array<{ id: string; shotId: string; assetId?: string | null; label: string; status: string }>;
};

const field = "mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-xs text-white outline-none focus:border-[#1d9bf0]";

function motionTemplate(project: ProjectInput, template: "kinetic" | "lower_third" | "product"): CutCompositionManifest {
  const fps = 30 as const;
  const durationInFrames = Math.max(30, Math.round(project.duration * fps));
  const titleText = template === "lower_third" ? "Name · Role" : template === "product" ? "Make the outcome unmistakable" : "Turn attention into momentum";
  const shared = { version: 1 as const, name: `${project.name} · ${template.replace("_", " ")}`, width: 1920, height: 1080, fps, durationInFrames, background: "#000000", parameters: [{ key: "headline", label: "Headline", type: "text" as const, defaultValue: titleText, required: true }], fonts: [], audioReactiveSignals: [], metadata: { template } };
  const source = { id: "source", kind: project.mediaKind, name: "Source", from: 0, durationInFrames, assetId: project.sourceAssetId, sourceStartFrame: 0, x: 0, y: 0, width: 1, height: 1, opacity: 1, rotation: 0, volume: 1, anchorX: .5, anchorY: .5, rotationX: 0, rotationY: 0, perspective: 0, blendMode: "normal" as const, style: {}, dataBindings: {}, effects: [], animations: [] };
  const graphicDuration = Math.min(durationInFrames, template === "lower_third" ? 150 : 240);
  const graphic = {
    id: "hero_title", kind: "text" as const, name: template === "product" ? "Product promise" : "Hero title", from: Math.min(15, durationInFrames - 1), durationInFrames: Math.max(1, Math.min(graphicDuration, durationInFrames - Math.min(15, durationInFrames - 1))), sourceStartFrame: 0,
    text: titleText, x: template === "lower_third" ? .08 : .15, y: template === "lower_third" ? .72 : .42, width: .72, height: .2, opacity: 1, rotation: 0, volume: 1, anchorX: .5, anchorY: .5, rotationX: 0, rotationY: 0, perspective: 0, blendMode: "normal" as const,
    style: { fontSize: template === "lower_third" ? 44 : 72, color: "#ffffff", backgroundColor: template === "kinetic" ? "#1d9bf0" : "#000000", backgroundOpacity: template === "kinetic" ? .88 : .72 }, dataBindings: { text: "headline" }, effects: template === "product" ? [{ id: "title_glow", kind: "glow" as const, enabled: true, parameters: { intensity: .4 } }] : [],
    enter: { kind: template === "kinetic" ? "zoom" as const : "slide" as const, durationInFrames: 15, easing: "spring" as const, direction: template === "kinetic" ? "in" as const : "right" as const }, exit: { kind: "fade" as const, durationInFrames: 12, easing: "ease_out" as const },
    animations: [{ property: "opacity" as const, keyframes: [{ frame: 0, value: 0, easing: "ease_out" as const }, { frame: Math.min(12, graphicDuration - 1), value: 1, easing: "ease_out" as const }] }, ...(template === "kinetic" ? [{ property: "scale" as const, keyframes: [{ frame: 0, value: .72, easing: "spring" as const }, { frame: Math.min(18, graphicDuration - 1), value: 1, easing: "spring" as const }] }] : [])],
  };
  return { ...shared, layers: [source, graphic] };
}

function starterBrief(project: ProjectInput): CutProductionBrief {
  return { version: 1, title: project.name, objective: "", audience: "", genre: "general", era: "contemporary", tone: [], required: [], forbidden: [], referenceAssetIds: [], defaultAspect: "16:9", defaultResolution: "1080p", defaultFps: 24, pacing: "custom" };
}

function starterShot(name: string, prompt: string): CutShotSpec {
  return { version: 1, name, prompt, negativePrompt: "text artifacts, unstable identity, unwanted logos", durationSeconds: 5, aspect: "16:9", resolution: "1080p", fps: 24, operation: "text_to_video", model: "auto", seed: null, elementIds: [], firstFrameAssetId: null, lastFrameAssetId: null, visualReferenceAssetIds: [], motionReferenceAssetId: null, audioReferenceAssetId: null, camera: { cameraBody: "virtual cinema camera", lens: "spherical prime", focalLengthMm: 35, aperture: 2.8, shutterAngle: 180, iso: 800, filmStock: "digital neutral", movements: [{ kind: "dolly", direction: "in", intensity: .35, start: 0, end: 1 }] }, lighting: "soft motivated key with natural contrast", emotion: "confident", colorGrade: { preset: "cinematic neutral", temperature: 0, contrast: 1, saturation: 1 }, audioMode: "native", safety: { rightsConfirmed: false, likenessConsentConfirmed: false, syntheticMediaDisclosure: true } };
}

export function CutStudioCreativeRuntime({ project, media, onTimelineApplied }: { project: ProjectInput; media: ProjectMediaInput[]; onTimelineApplied: (result: { edl: CutEdl; duration: number; revision: number }) => void }) {
  const [runtime, setRuntime] = useState<RuntimePayload | null>(null);
  const [section, setSection] = useState<"motion" | "cinema" | "workflows">("motion");
  const [expanded, setExpanded] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [brief, setBrief] = useState<CutProductionBrief>(starterBrief(project));
  const [shotName, setShotName] = useState("Opening shot");
  const [shotPrompt, setShotPrompt] = useState("A cinematic opening that establishes the subject, environment, and creative promise");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);

  const refresh = async () => {
    const next = await (await apiRequest("GET", `/api/cut/projects/${project.id}/creative-runtime`)).json() as RuntimePayload;
    setRuntime(next);
    setBrief(next.plan?.brief ?? starterBrief(project));
  };

  useEffect(() => { setRuntime(null); setMessage(""); void refresh().catch((error) => setMessage(error instanceof Error ? error.message : "Creative runtime could not load")); }, [project.id]);
  const waitingJobs = useMemo(() => runtime?.jobs.filter((job) => job.state === "provider_pending").length ?? 0, [runtime]);

  const act = async (key: string, action: () => Promise<void>) => {
    setBusy(key); setMessage("");
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : "That action could not be completed"); }
    finally { setBusy(""); }
  };

  const createComposition = (template: "kinetic" | "lower_third" | "product") => act(`composition:${template}`, async () => {
    const manifest = motionTemplate(project, template);
    await apiRequest("POST", `/api/cut/projects/${project.id}/compositions`, { name: manifest.name, mode: "declarative", manifest, codeCapsule: null });
    await refresh(); setMessage("Motion composition saved. Review it, then apply it to the timeline.");
  });

  const applyComposition = (composition: CompositionRow) => act(`apply:${composition.id}`, async () => {
    const result = await (await apiRequest("POST", `/api/cut/projects/${project.id}/compositions/${composition.id}/apply`, {}, { "If-Match": String(project.revision) })).json() as { edl: CutEdl; duration: number; revision: number };
    onTimelineApplied(result); setMessage("The motion composition is now on the editable timeline.");
  });

  const updateCompositionDraft = (compositionId: string, update: (manifest: CutCompositionManifest) => CutCompositionManifest) => setRuntime((current) => current ? { ...current, compositions: current.compositions.map((row) => row.id === compositionId ? { ...row, manifest: update(row.manifest) } : row) } : current);

  const saveComposition = (composition: CompositionRow) => act(`save:${composition.id}`, async () => {
    await apiRequest("PUT", `/api/cut/projects/${project.id}/compositions/${composition.id}`, { name: composition.name, mode: "declarative", manifest: composition.manifest, codeCapsule: null }, { "If-Match": String(composition.revision) });
    await refresh(); setMessage("Composition controls saved.");
  });

  const createCompositionVariants = (composition: CompositionRow, variants: Array<{ name: string; parameterValues: Record<string, string | number | boolean | null> }>) => act(`variants:${composition.id}`, async () => {
    const response = await apiRequest("POST", `/api/cut/projects/${project.id}/compositions/${composition.id}/variants`, { idempotencyKey: `variants.${composition.id}.${crypto.randomUUID()}`, variants });
    const result = await response.json() as { count: number };
    await refresh(); setMessage(`${result.count} parameterized composition variants created.`);
  });

  const saveBrief = () => act("brief", async () => {
    const headers = runtime?.plan ? { "If-Match": String(runtime.plan.revision) } : undefined;
    await apiRequest("PUT", `/api/cut/projects/${project.id}/production-brief`, brief, headers);
    await refresh(); setMessage("Production brief saved.");
  });

  const createShot = () => act("shot", async () => {
    const spec = starterShot(shotName.trim(), shotPrompt.trim());
    spec.safety.rightsConfirmed = rightsConfirmed;
    await apiRequest("POST", `/api/cut/projects/${project.id}/shots`, spec);
    await refresh(); setMessage("Shot added to the production plan.");
  });

  const queueGeneration = (shot: ShotRow) => act(`generate:${shot.id}`, async () => {
    const provider = runtime?.generationRuntime.providers.find((item) => item.configured)?.id ?? "self_hosted";
    await apiRequest("POST", `/api/cut/projects/${project.id}/shots/${shot.id}/generations`, { operation: shot.spec.operation, provider, model: shot.spec.model, prompt: shot.spec.prompt, negativePrompt: shot.spec.negativePrompt, inputs: [], parameters: { aspect: shot.spec.aspect, durationSeconds: shot.spec.durationSeconds, resolution: shot.spec.resolution, fps: shot.spec.fps, seed: shot.spec.seed }, variants: 1, idempotencyKey: `shot.${shot.id}.${crypto.randomUUID()}` });
    await refresh(); setMessage(runtime?.generationRuntime.providers.some((item) => item.configured) ? "Generation submitted." : "The job is safely staged; connect an approved model runtime to execute it.");
  });

  const createWorkflow = () => act("workflow", async () => {
    const workflow: CutGenerativeWorkflow = { version: 1, name: "Cinematic campaign pipeline", description: "Create the hero frame, animate it, then finish the audio layer.", nodes: [{ id: "hero_image", operation: "text_to_image", provider: "auto", model: "auto", prompt: brief.objective || "Create the campaign hero image", parameters: {}, inputs: [], position: { x: 0, y: 0 } }, { id: "hero_video", operation: "image_to_video", provider: "auto", model: "auto", prompt: "Add deliberate cinematic camera movement", parameters: {}, inputs: [{ slot: "start_frame", sourceNodeId: "hero_image", sourceOutput: "image", assetIds: [] }], position: { x: 280, y: 0 } }, { id: "sound", operation: "sound_effect_generation", provider: "auto", model: "auto", prompt: "Create a cohesive sound bed", parameters: {}, inputs: [{ slot: "source_video", sourceNodeId: "hero_video", sourceOutput: "video", assetIds: [] }], position: { x: 560, y: 0 } }], outputs: [{ nodeId: "hero_video", output: "video", label: "Hero video" }, { nodeId: "sound", output: "audio", label: "Sound bed" }] };
    await apiRequest("POST", `/api/cut/projects/${project.id}/generative-workflows`, { workflow });
    await refresh(); setMessage("Reusable generation workflow saved.");
  });

  const updateWorkflowDraft = (workflowId: string, workflow: CutGenerativeWorkflow) => setRuntime((current) => current ? { ...current, workflows: current.workflows.map((row) => row.id === workflowId ? { ...row, workflow } : row) } : current);

  const saveWorkflow = (row: WorkflowRow) => act(`workflow:${row.id}`, async () => {
    await apiRequest("PUT", `/api/cut/projects/${project.id}/generative-workflows/${row.id}`, { workflow: row.workflow }, { "If-Match": String(row.revision) });
    await refresh(); setMessage("Workflow graph saved.");
  });

  return <div className="rounded-2xl border border-[#1d9bf0]/35 bg-zinc-950 p-4" aria-label="CutStudio creative runtime">
    <button className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
      <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#1d9bf0]">Creative runtime</p><h2 className="mt-1 font-bold">Motion graphics + cinema studio</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Parameterized compositions, shot continuity, camera direction, variants, and reusable model workflows.</p></div>{expanded ? <ChevronUp className="mt-1 h-4 w-4 text-zinc-500"/> : <ChevronDown className="mt-1 h-4 w-4 text-zinc-500"/>}
    </button>
    {expanded && <>
      <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-black p-1">{([['motion','Motion',Boxes],['cinema','Cinema',Clapperboard],['workflows','Flows',Workflow]] as const).map(([id,label,Icon]) => <button key={id} className={`flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-[10px] font-bold ${section === id ? "bg-[#1d9bf0] text-black" : "text-zinc-500"}`} onClick={() => setSection(id)}><Icon className="h-3.5 w-3.5"/>{label}</button>)}</div>
      {!runtime ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#1d9bf0]"/></div> : section === "motion" ? <div className="mt-4 space-y-3">
        <p className="text-xs leading-5 text-zinc-400">Start from an editable composition. Layers, keyframes, transitions, blend modes, effects, data bindings, 3D/Lottie/Rive descriptors, fonts, and audio-reactive signals remain first-class project data.</p>
        <div className="grid grid-cols-3 gap-2">{([['kinetic','Kinetic'],['lower_third','Lower third'],['product','Product']] as const).map(([id,label]) => <Button key={id} size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void createComposition(id)}>{busy === `composition:${id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : label}</Button>)}</div>
        {runtime.compositions.map((composition) => <div key={composition.id} className="rounded-xl border border-zinc-800 bg-black p-3"><div className="flex items-center justify-between gap-2"><div><p className="text-xs font-bold">{composition.name}</p><p className="mt-1 text-[10px] text-zinc-600">{composition.manifest.layers.length} layers · {composition.manifest.fps} fps · revision {composition.revision}</p></div><Button size="sm" disabled={Boolean(busy)} onClick={() => void applyComposition(composition)}>{busy === `apply:${composition.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <><Play className="mr-1 h-3.5 w-3.5"/>Apply</>}</Button></div><CutStudioCompositionPreview manifest={composition.manifest}/><CompositionAuthoringControls composition={composition} assets={media} busy={Boolean(busy)} onChange={(manifest) => updateCompositionDraft(composition.id, () => manifest)} onSave={() => void saveComposition(composition)}/><CompositionVariantBatchControls composition={composition} busy={Boolean(busy)} onCreate={(variants) => void createCompositionVariants(composition, variants)}/></div>)}
        <div className="rounded-lg bg-black px-3 py-2 text-[10px] text-zinc-500">Declarative runtime: {runtime.compositionRuntime.declarative} · executable code: {runtime.compositionRuntime.isolatedCode} · network: {runtime.compositionRuntime.networkPolicy}</div>
      </div> : section === "cinema" ? <div className="mt-4 space-y-3">
        <label className="block text-[10px] font-bold text-zinc-500">Production title<input className={field} value={brief.title} onChange={(event) => setBrief({ ...brief, title: event.target.value })}/></label>
        <label className="block text-[10px] font-bold text-zinc-500">Objective<textarea className={`${field} min-h-20 resize-none`} value={brief.objective} onChange={(event) => setBrief({ ...brief, objective: event.target.value })} placeholder="What should this production accomplish?"/></label>
        <label className="block text-[10px] font-bold text-zinc-500">Audience<input className={field} value={brief.audience} onChange={(event) => setBrief({ ...brief, audience: event.target.value })}/></label>
        <Button size="sm" variant="outline" className="w-full" disabled={Boolean(busy)} onClick={() => void saveBrief()}>{busy === "brief" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/> : <Check className="mr-1 h-3.5 w-3.5"/>}Save brief</Button>
        <div className="border-t border-zinc-800 pt-3"><div className="flex items-center gap-2"><Camera className="h-4 w-4 text-[#1d9bf0]"/><p className="text-xs font-bold">Shot builder</p></div><input aria-label="Shot name" className={field} value={shotName} onChange={(event) => setShotName(event.target.value)}/><textarea aria-label="Shot prompt" className={`${field} min-h-20 resize-none`} value={shotPrompt} onChange={(event) => setShotPrompt(event.target.value)}/><label className="mt-2 flex items-start gap-2 text-[10px] leading-4 text-zinc-400"><input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} className="mt-0.5 accent-[#1d9bf0]"/>I control the media/model rights for this shot. Likeness consent is separately enforced when cast elements are used.</label><Button className="mt-3 w-full" size="sm" disabled={!shotName.trim() || !shotPrompt.trim() || Boolean(busy)} onClick={() => void createShot()}>{busy === "shot" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/> : <Plus className="mr-1 h-3.5 w-3.5"/>}Add shot</Button></div>
        {runtime.shots.map((shot) => <div key={shot.id} className="rounded-xl border border-zinc-800 bg-black p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-bold">{shot.sequence}. {shot.spec.name}</p><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-zinc-500">{shot.spec.prompt}</p><p className="mt-1 text-[10px] text-zinc-600">{shot.spec.camera.focalLengthMm}mm · {shot.spec.camera.movements.map((item) => item.kind).join(" + ") || "static"} · {shot.spec.durationSeconds}s</p></div><Button size="sm" variant="outline" aria-label={`Generate ${shot.spec.name}`} disabled={!shot.spec.safety.rightsConfirmed || Boolean(busy)} onClick={() => void queueGeneration(shot)}>{busy === `generate:${shot.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Sparkles className="h-3.5 w-3.5"/>}</Button></div>{runtime.jobs.filter((job) => job.shotId === shot.id).slice(0,1).map((job) => <p key={job.id} className={`mt-2 rounded px-2 py-1 text-[10px] ${job.state === "provider_pending" ? "bg-amber-950 text-amber-300" : "bg-zinc-900 text-zinc-400"}`}>{job.state.replace("_", " ")} · {job.detail}</p>)}</div>)}
        {waitingJobs > 0 && <p className="rounded-lg bg-amber-950/60 p-2 text-[10px] leading-4 text-amber-300">{waitingJobs} generation job{waitingJobs === 1 ? " is" : "s are"} staged without pretending an external model executed.</p>}
      </div> : <div className="mt-4 space-y-3"><p className="text-xs leading-5 text-zinc-400">Build reusable capability-driven graphs instead of hard-coding one vendor. Inputs, outputs, model choice, prompts, and lineage remain portable.</p><Button className="w-full" size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void createWorkflow()}>{busy === "workflow" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/> : <Plus className="mr-1 h-3.5 w-3.5"/>}Starter campaign flow</Button>{runtime.workflows.map((row) => <WorkflowAuthoringEditor key={row.id} workflow={row.workflow} revision={row.revision} busy={Boolean(busy)} onChange={(workflow) => updateWorkflowDraft(row.id, workflow)} onSave={() => void saveWorkflow(row)}/>)}</div>}
      {message && <p role="status" className="mt-3 rounded-lg border border-zinc-800 bg-black px-3 py-2 text-[10px] leading-4 text-zinc-300">{message}</p>}
    </>}
  </div>;
}
